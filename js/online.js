"use strict";
/* PeerJS P2P online matches.
   - Quick Match: automatic 1v1 matchmaking via time-bucket host slots
   - Private rooms: optional code join
   - Host is authoritative for combat/tiles
   - Client predicts local movement and soft-reconciles with host state
*/

const ICE={iceServers:[
  {urls:"stun:stun.l.google.com:19302"},
  {urls:"stun:stun1.l.google.com:19302"},
  {urls:"stun:global.stun.twilio.com:3478"}
]};

const ONLINE={
  peer:null, conn:null, isHost:false, room:"",
  remoteName:"Opponent", remoteElo:1000, remoteColor:null,
  status:"idle", // idle | searching | connecting | ready | playing | error
  lastError:"",
  remoteInput:{mx:0,my:0,atk:false,dash:false,guard:0,seq:0},
  seq:0, seed:0,
  snap:null, snapT:0, rtt:0,
  myId:"", mmAbort:false, mmTimer:null, autoStartTimer:null,
  // prediction
  predErr:0,
  stateEvery:0 // host frame counter for optional throttle
};

function onlineReset(){
  FX_NET=false; fxReset();
  ONLINE.mmAbort=true;
  if(ONLINE.mmTimer){clearTimeout(ONLINE.mmTimer);ONLINE.mmTimer=null;}
  if(ONLINE.autoStartTimer){clearTimeout(ONLINE.autoStartTimer);ONLINE.autoStartTimer=null;}
  if(ONLINE.mmUnsub){try{ONLINE.mmUnsub();}catch(e){} ONLINE.mmUnsub=null;}
  if(ONLINE.mmPoll){clearInterval(ONLINE.mmPoll);ONLINE.mmPoll=null;}
  if(ONLINE.mmUid){ mmCleanupDoc(ONLINE.mmUid); ONLINE.mmUid=null; }
  try{if(ONLINE.conn)ONLINE.conn.close();}catch(e){}
  try{if(ONLINE.peer)ONLINE.peer.destroy();}catch(e){}
  ONLINE.peer=null; ONLINE.conn=null; ONLINE.isHost=false; ONLINE.room="";
  ONLINE.status="idle"; ONLINE.lastError=""; ONLINE.myId="";
  ONLINE.remoteInput={mx:0,my:0,atk:false,dash:false,guard:0,seq:0};
  ONLINE.snap=null; ONLINE.seq=0; ONLINE.predErr=0; ONLINE.stateEvery=0;
  ONLINE.mmAbort=false;
}

function roomCode(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for(let i=0;i<6;i++)s+=chars[Math.random()*chars.length|0];
  return s;
}

function onlineSend(obj){
  if(ONLINE.conn&&ONLINE.conn.open){
    try{ONLINE.conn.send(JSON.stringify(obj));}catch(e){}
  }
}

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

//------------------------------------------------------------ messaging
function onOnlineMsg(raw){
  let m; try{m=typeof raw==="string"?JSON.parse(raw):raw;}catch(e){return;}
  if(!m||!m.t)return;

  if(m.t==="hello"){
    let rn=(m.name||"").trim();
    if(!rn||rn==="Challenger"||rn==="Player"||rn==="Opponent") rn="Opponent";
    ONLINE.remoteName=rn.slice(0,16);
    ONLINE.remoteElo=m.elo|0||1000;
    ONLINE.remoteColor=m.color||null;
    if(ONLINE.isHost){
      if(m.size){/* guest may not send settings */}
      onlineSend({
        t:"hello",
        name:(RANK.name&&RANK.name!=="Challenger"?RANK.name:"Player"), elo:RANK.elo, color:CFG.color,
        size:CFG.size, theme:CFG.theme, speed:CFG.speed,
        seed:ONLINE.seed
      });
      ONLINE.status="ready";
      onlineUIRefresh();
      scheduleAutoStart();
    }else{
      if(m.size)CFG.size=m.size;
      if(m.theme)CFG.theme=m.theme;
      if(m.speed)CFG.speed=m.speed;
      ONLINE.seed=m.seed||0;
      ONLINE.status="ready";
      onlineSend({t:"ready"});
      onlineUIRefresh();
    }
  }
  else if(m.t==="ready"){
    ONLINE.status="ready";
    onlineUIRefresh();
    if(ONLINE.isHost)scheduleAutoStart();
  }
  else if(m.t==="input"&&ONLINE.isHost){
    const ri=ONLINE.remoteInput;
    ri.mx=+m.mx||0; ri.my=+m.my||0;
    if(m.atk)ri.atk=true;
    if(m.dash)ri.dash=true;
    ri.guard=m.guard?1:0;
    ri.seq=m.seq|0;
  }
  else if(m.t==="state"&&!ONLINE.isHost){
    ONLINE.snap=m;
    ONLINE.snapT=performance.now();
    applyOnlineSnap(m);
  }
  else if(m.t==="end"){
    if(!ONLINE.isHost){
      const iWon=!m.winHost;
      endMatchOnline(iWon,true);
    }
  }
  else if(m.t==="ping"){onlineSend({t:"pong",n:m.n});}
  else if(m.t==="pong"){ONLINE.rtt=performance.now()-m.n;}
  else if(m.t==="leave"){
    ONLINE.lastError="Opponent left";
    ONLINE.status="error";
    onlineUIRefresh();
    if(mode==="play"||mode==="intro"){goHome(); onlineToast("Opponent disconnected");}
  }
  else if(m.t==="start"){
    if(!ONLINE.isHost)startOnlineMatch(false);
  }
}

function scheduleAutoStart(){
  if(!ONLINE.isHost||ONLINE.status!=="ready")return;
  if(ONLINE.autoStartTimer)return;
  onlineToast("Match found! Starting…");
  ONLINE.autoStartTimer=setTimeout(()=>{
    ONLINE.autoStartTimer=null;
    if(ONLINE.isHost&&ONLINE.status==="ready")onlineHostStart();
  },900);
}

function wireConn(conn){
  ONLINE.conn=conn;
  conn.on("data",onOnlineMsg);
  conn.on("close",()=>{
    if(ONLINE.status==="playing"||ONLINE.status==="ready"||ONLINE.status==="connecting"||ONLINE.status==="searching"){
      ONLINE.lastError="Connection closed";
      ONLINE.status="error";
      onlineUIRefresh();
      if(mode==="play"||mode==="intro"||mode==="paused"){goHome(); onlineToast("Opponent disconnected");}
    }
  });
  conn.on("open",()=>{
    if(!ONLINE.isHost){
      onlineSend({t:"hello", name:(RANK.name&&RANK.name!=="Challenger"?RANK.name:"Player"), elo:RANK.elo, color:CFG.color});
    }
  });
}

//------------------------------------------------------------ Quick Match (Firebase queue + PeerJS P2P)
/* Flow:
   1. Open a PeerJS peer (random id)
   2. Write ourselves into Firestore matchmaking queue
   3. Look for another "waiting" player
   4. Pair via transaction: one becomes host, other guest
   5. Guest connects to host peerId over PeerJS
*/

function mmMyUid(){
  return (FB.user && FB.user.uid) || ("local_"+((RANK.name||"p").replace(/\W/g,"_"))+"_"+Math.random().toString(36).slice(2,8));
}

async function mmCleanupDoc(uid){
  if(!FB.ready||!FB.db||!uid)return;
  try{ await FB.db.collection("matchmaking").doc(uid).delete(); }catch(e){}
}

async function onlineFindMatch(){
  onlineReset();
  ONLINE.status="searching";
  ONLINE.seed=(Math.random()*1e9)|0;
  ONLINE.mmAbort=false;
  onlineUIRefresh();
  onlineToast(typeof t==="function"?t("searchingOpp"):"Searching for opponent…");

  // Need Firebase for reliable queue
  if(!FB.ready){
    // try init once more
    if(typeof fbInit==="function"){
      await fbInit();
    }
  }
  if(!FB.ready){
    ONLINE.lastError = FB.error || "Firebase offline — enable Anonymous Auth + Firestore";
    ONLINE.status="error";
    onlineUIRefresh();
    onlineToast(ONLINE.lastError);
    return;
  }

  // 1) PeerJS peer with random id
  const peer = new Peer({debug:1, config:ICE});
  ONLINE.peer = peer;

  peer.on("error", err=>{
    const msg = String(err.type||err.message||err);
    console.warn("[HexPush] Peer error", msg);
    if(ONLINE.status==="searching"||ONLINE.status==="connecting"){
      if(/network|server-error|socket/i.test(msg)){
        ONLINE.lastError = "PeerJS network error";
        ONLINE.status="error";
        onlineUIRefresh();
      }
    }
  });

  peer.on("open", async (id)=>{
    if(ONLINE.mmAbort)return;
    ONLINE.myId = id;
    ONLINE.room = id;
    console.log("[HexPush] Peer open", id);
    try{
      await mmEnterQueue(id);
    }catch(e){
      console.warn(e);
      ONLINE.lastError = String(e.message||e);
      ONLINE.status="error";
      onlineUIRefresh();
    }
  });

  // Host path: someone will connect to us
  peer.on("connection", conn=>{
    if(ONLINE.conn){ try{conn.close();}catch(e){} return; }
    if(!ONLINE.isHost && ONLINE.status!=="searching" && ONLINE.status!=="connecting"){
      // might still be deciding roles
    }
    ONLINE.isHost = true;
    wireConn(conn);
    ONLINE.status="connecting";
    onlineUIRefresh();
    onlineToast(typeof t==="function"?t("matchFound"):"Match found!");
    conn.on("open", ()=>{
      onlineSend({
        t:"hello",
        name:(RANK.name&&RANK.name!=="Challenger"?RANK.name:"Player"),
        elo:RANK.elo, color:CFG.color,
        size:CFG.size, theme:CFG.theme, speed:CFG.speed,
        seed:ONLINE.seed
      });
      mmCleanupDoc(ONLINE.mmUid);
    });
  });
}

async function mmEnterQueue(peerId){
  const uid = mmMyUid();
  ONLINE.mmUid = uid;
  const ref = FB.db.collection("matchmaking").doc(uid);

  await ref.set({
    uid,
    peerId,
    name: (RANK.name&&RANK.name!=="Challenger"?RANK.name:"Player"),
    elo: RANK.elo|0,
    color: CFG.color,
    status: "waiting",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    ts: Date.now()
  });

  // Poll / listen for a partner
  ONLINE.mmUnsub = FB.db.collection("matchmaking")
    .where("status","==","waiting")
    .orderBy("ts","asc")
    .limit(10)
    .onSnapshot(async snap=>{
      if(ONLINE.mmAbort||ONLINE.status!=="searching")return;
      await mmTryPair(snap);
    }, err=>{
      console.warn("[HexPush] queue listen", err);
      // Fallback: poll without composite index
      mmPollFallback();
    });

  // Also try immediately once
  try{
    const q = await FB.db.collection("matchmaking")
      .where("status","==","waiting")
      .limit(10)
      .get();
    await mmTryPair(q);
  }catch(e){
    console.warn("[HexPush] queue query", e);
    mmPollFallback();
  }

  // Timeout after 60s
  ONLINE.mmTimer = setTimeout(()=>{
    if(ONLINE.status==="searching"){
      ONLINE.lastError="No opponent found — try again";
      ONLINE.status="error";
      mmCleanupDoc(ONLINE.mmUid);
      onlineUIRefresh();
      onlineToast(ONLINE.lastError);
    }
  }, 60000);
}

function mmPollFallback(){
  if(ONLINE.mmPoll) return;
  ONLINE.mmPoll = setInterval(async ()=>{
    if(ONLINE.mmAbort||ONLINE.status!=="searching"){
      clearInterval(ONLINE.mmPoll); ONLINE.mmPoll=null; return;
    }
    try{
      const q = await FB.db.collection("matchmaking").where("status","==","waiting").limit(15).get();
      await mmTryPair(q);
    }catch(e){ console.warn(e); }
  }, 1500);
}

async function mmTryPair(snap){
  if(ONLINE.mmAbort||ONLINE.status!=="searching")return;
  const me = ONLINE.mmUid;
  let partner = null;
  snap.forEach(doc=>{
    if(partner) return;
    const d = doc.data();
    if(d.uid===me) return;
    if(d.status!=="waiting") return;
    // ignore stale > 90s
    if(d.ts && Date.now()-d.ts > 90000) return;
    partner = { id: doc.id, ...d };
  });
  if(!partner) return;

  // Deterministic role: lower uid is host
  const iAmHost = me < partner.uid;

  // Claim both docs in a transaction so only one pair wins
  try{
    await FB.db.runTransaction(async tx=>{
      const myRef = FB.db.collection("matchmaking").doc(me);
      const theirRef = FB.db.collection("matchmaking").doc(partner.id);
      const myDoc = await tx.get(myRef);
      const theirDoc = await tx.get(theirRef);
      if(!myDoc.exists || !theirDoc.exists) throw new Error("gone");
      if(myDoc.data().status!=="waiting" || theirDoc.data().status!=="waiting") throw new Error("taken");
      tx.update(myRef, {
        status: "matched",
        role: iAmHost ? "host" : "guest",
        partnerUid: partner.uid,
        partnerPeerId: partner.peerId,
        partnerName: partner.name,
        partnerElo: partner.elo,
        partnerColor: partner.color
      });
      tx.update(theirRef, {
        status: "matched",
        role: iAmHost ? "guest" : "host",
        partnerUid: me,
        partnerPeerId: ONLINE.myId,
        partnerName: (RANK.name&&RANK.name!=="Challenger"?RANK.name:"Player"),
        partnerElo: RANK.elo|0,
        partnerColor: CFG.color
      });
    });
  }catch(e){
    // lost the race — keep waiting
    return;
  }

  // Stop listening
  if(ONLINE.mmUnsub){ try{ONLINE.mmUnsub();}catch(e){} ONLINE.mmUnsub=null; }
  if(ONLINE.mmPoll){ clearInterval(ONLINE.mmPoll); ONLINE.mmPoll=null; }
  if(ONLINE.mmTimer){ clearTimeout(ONLINE.mmTimer); ONLINE.mmTimer=null; }

  ONLINE.remoteName = partner.name || "Opponent";
  ONLINE.remoteElo = partner.elo|0 || 1000;
  ONLINE.remoteColor = partner.color || null;
  ONLINE.status = "connecting";
  onlineUIRefresh();
  onlineToast(typeof t==="function"?t("matchFound"):"Match found!");

  if(iAmHost){
    ONLINE.isHost = true;
    ONLINE.seed = (Math.random()*1e9)|0;
    // Wait for guest to connect via peer.on("connection")
    // Safety: if no one connects in 15s, error
    ONLINE.mmTimer = setTimeout(()=>{
      if(ONLINE.status==="connecting" && !ONLINE.conn){
        ONLINE.lastError="Opponent failed to connect";
        ONLINE.status="error";
        mmCleanupDoc(ONLINE.mmUid);
        onlineUIRefresh();
      }
    }, 15000);
  }else{
    ONLINE.isHost = false;
    // Connect to host peer
    mmConnectToHost(partner.peerId);
  }
}

function mmConnectToHost(hostPeerId){
  if(!ONLINE.peer || !hostPeerId){
    ONLINE.lastError="Missing host peer id";
    ONLINE.status="error";
    onlineUIRefresh();
    return;
  }
  const conn = ONLINE.peer.connect(hostPeerId, {reliable:true});
  wireConn(conn);
  conn.on("open", ()=>{
    mmCleanupDoc(ONLINE.mmUid);
    // hello sent by wireConn open handler for guest
  });
  conn.on("error", err=>{
    console.warn("[HexPush] connect host failed", err);
    ONLINE.lastError="Could not reach opponent";
    ONLINE.status="error";
    onlineUIRefresh();
  });
}

//------------------------------------------------------------ Private room
function onlineCreate(){
  onlineReset();
  ONLINE.isHost=true;
  ONLINE.room=roomCode();
  ONLINE.seed=(Math.random()*1e9)|0;
  ONLINE.status="searching";
  onlineUIRefresh();

  const peer=new Peer(ONLINE.room,{debug:0,config:ICE});
  ONLINE.peer=peer;
  peer.on("open",id=>{
    ONLINE.room=id;
    ONLINE.status="searching";
    onlineUIRefresh();
  });
  peer.on("connection",conn=>{
    if(ONLINE.conn){try{conn.close();}catch(e){}return;}
    wireConn(conn);
    ONLINE.status="connecting";
    onlineUIRefresh();
    conn.on("open",()=>{
      onlineSend({
        t:"hello",
        name:(RANK.name&&RANK.name!=="Challenger"?RANK.name:"Player"), elo:RANK.elo, color:CFG.color,
        size:CFG.size, theme:CFG.theme, speed:CFG.speed,
        seed:ONLINE.seed
      });
    });
  });
  peer.on("error",err=>{
    ONLINE.lastError=String(err.type||err.message||err);
    ONLINE.status="error";
    onlineUIRefresh();
  });
}

function onlineJoin(code){
  code=(code||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
  if(code.length<4){
    ONLINE.lastError="Invalid room code";
    ONLINE.status="error";
    onlineUIRefresh();
    return;
  }
  onlineReset();
  ONLINE.isHost=false;
  ONLINE.room=code;
  ONLINE.status="connecting";
  onlineUIRefresh();

  const peer=new Peer({debug:0,config:ICE});
  ONLINE.peer=peer;
  peer.on("open",()=>{
    const conn=peer.connect(code,{reliable:true});
    wireConn(conn);
  });
  peer.on("error",err=>{
    ONLINE.lastError=String(err.type||err.message||err);
    if(ONLINE.lastError==="peer-unavailable")ONLINE.lastError="Room not found";
    ONLINE.status="error";
    onlineUIRefresh();
  });
}

function onlineLeave(){
  onlineSend({t:"leave"});
  onlineReset();
  onlineUIRefresh();
}

//------------------------------------------------------------ match start / input / state
function startOnlineMatch(asHost){
  G.kind="online";
  G.theme=THEMES[CFG.theme];
  G.radius=SIZES[CFG.size];
  G.sp=SPEEDS[CFG.speed];
  G.diffP=DIFF.Normal;
  G.rookie=false;
  G.persona="Online";
  resetInput();

  const rng=mulberry32(ONLINE.seed||1);
  buildArena();
  const R=G.radius, a=rng()*6.28;
  const spawn=ang=>{
    const d=(R-0.35)*HS*1.5, hx=pixHex(Math.cos(ang)*d,Math.sin(ang)*d*.95);
    return alive(hx.q,hx.r)?hx:{q:0,r:0};
  };
  const s1=spawn(a), s2=spawn(a+Math.PI+(rng()-.5)*.7);
  const myCol=COLORS[CFG.color];
  const theirCol=ONLINE.remoteColor&&COLORS[ONLINE.remoteColor]
    ?COLORS[ONLINE.remoteColor]
    :pickContrast(myCol);

  // Host simulates host=G.p, guest=G.b
  // Client predicts self as G.p (guest body), opponent G.b (host body)
  if(ONLINE.isHost){
    G.p=mkFighter(s1.q,s1.r,myCol,false);
    G.b=mkFighter(s2.q,s2.r,theirCol,false);
  }else{
    G.p=mkFighter(s2.q,s2.r,myCol,false);
    G.b=mkFighter(s1.q,s1.r,theirCol,false);
  }
  G.p.face=Math.atan2(G.b.y-G.p.y,G.b.x-G.p.x); G.b.face=G.p.face+Math.PI;
  G.parts.length=0; G.conf.length=0;
  G.time=0; G.introT=0; G.endT=0; G.shake=0; G.flash=0;
  G.hitstop=0; G.slow=1; G.focus=null;
  G.nextCrumble=4.5/G.sp; G.tick=0;
  G.cam.x=0;G.cam.y=0;G.cam.z=1.75;G.cam.tz=1;
  G.tut=null;
  el("dotP").style.color=G.p.color;
  el("dotB").style.color=G.b.color;
  const myLabel = (typeof displayName==="function"?displayName(RANK.name, typeof t==="function"?t("you"):"You"):(RANK.name||"You"));
  const oppLabel = (typeof displayName==="function"?displayName(ONLINE.remoteName,"Opponent"):(ONLINE.remoteName||"Opponent"));
  el("botName").textContent=oppLabel;
  el("tagP").innerHTML='<span class="dot" id="dotP" style="color:'+G.p.color+'"></span>'+myLabel;
  show(); show("hud",true); lastCenter="";
  mode="intro";
  ONLINE.status="playing";
  ONLINE.predErr=0;
  FX_NET=ONLINE.isHost; fxReset();
  padVisible(TOUCH);
  onlineUIRefresh();
}

function onlineSendInput(){
  if(ONLINE.isHost||!ONLINE.conn||ONLINE.status!=="playing")return;
  if(mode!=="play"&&mode!=="intro")return;
  const f=G.p;
  onlineSend({
    t:"input",
    mx:f.ai.mx, my:f.ai.my,
    atk:!!f.ai.wantAtk, dash:!!f.ai.wantDash,
    guard:f.ai.wantGuard?1:0,
    seq:++ONLINE.seq
  });
}

function applyRemoteInputToBot(){
  if(!ONLINE.isHost)return;
  const ri=ONLINE.remoteInput;
  const b=G.b;
  b.ai.mx=ri.mx; b.ai.my=ri.my;
  b.ai.wantAtk=ri.atk; ri.atk=false;
  b.ai.wantDash=ri.dash; ri.dash=false;
  b.ai.wantGuard=ri.guard;
}

function packFighter(f){
  return {
    x:+f.x.toFixed(1), y:+f.y.toFixed(1),
    vx:+f.vx.toFixed(1), vy:+f.vy.toFixed(1),
    ix:+f.ix.toFixed(1), iy:+f.iy.toFixed(1),
    face:+f.face.toFixed(3),
    atk:f.atk, atkPh:f.atkPh, atkCd:+f.atkCd.toFixed(2), hitDone:f.hitDone,
    dash:f.dash, dashCd:+f.dashCd.toFixed(2),
    dashDX:f.dashDX, dashDY:f.dashDY,
    guard:f.guard, gm:+f.gm.toFixed(3), stagger:+f.stagger.toFixed(2),
    kb:+f.kb.toFixed(2), kbX:f.kbX, kbY:f.kbY, kbFX:f.kbFX, kbFY:f.kbFY,
    fall:+f.fall.toFixed(2), dead:f.dead, squash:+f.squash.toFixed(2)
  };
}
function unpackFighter(f,s){
  if(!s)return;
  f.x=s.x;f.y=s.y;f.vx=s.vx;f.vy=s.vy;f.ix=s.ix;f.iy=s.iy;
  f.face=s.face;
  f.atk=s.atk;f.atkPh=s.atkPh;f.atkCd=s.atkCd;f.hitDone=s.hitDone;
  f.dash=s.dash;f.dashCd=s.dashCd;f.dashDX=s.dashDX;f.dashDY=s.dashDY;
  f.guard=s.guard;f.gm=s.gm;f.stagger=s.stagger;
  f.kb=s.kb;f.kbX=s.kbX;f.kbY=s.kbY;f.kbFX=s.kbFX;f.kbFY=s.kbFY;
  f.fall=s.fall;f.dead=s.dead;f.squash=s.squash;
}

// Soft reconcile: keep local prediction when close, snap when far
function reconcileFighter(f,s){
  if(!s)return;
  const dx=s.x-f.x, dy=s.y-f.y;
  const dist=Math.hypot(dx,dy);
  ONLINE.predErr=dist;
  // combat state always from server
  f.atk=s.atk;f.atkPh=s.atkPh;f.atkCd=s.atkCd;f.hitDone=s.hitDone;
  f.dash=s.dash;f.dashCd=s.dashCd;f.dashDX=s.dashDX;f.dashDY=s.dashDY;
  f.guard=s.guard;f.gm=s.gm;f.stagger=s.stagger;
  f.kb=s.kb;f.kbX=s.kbX;f.kbY=s.kbY;f.kbFX=s.kbFX;f.kbFY=s.kbFY;
  f.fall=s.fall;f.dead=s.dead;f.squash=s.squash;
  f.vx=s.vx;f.vy=s.vy;f.ix=s.ix;f.iy=s.iy;
  if(s.dead||s.kb>0||dist>48){
    // hard correct on knockback / death / large error
    f.x=s.x;f.y=s.y;f.face=s.face;
  }else if(dist>6){
    // blend toward server
    f.x+=dx*0.35; f.y+=dy*0.35;
    f.face=s.face;
  }
  // else trust prediction
}

function onlineBroadcastState(){
  if(!ONLINE.isHost||ONLINE.status!=="playing")return;
  // every frame — small payload, P2P can handle it
  const dead=[];
  G.tiles.forEach((t,k)=>{if(!t.alive)dead.push(k);});
  const fx=FX_QUEUE.splice(0,FX_QUEUE.length);
  onlineSend({
    t:"state",
    time:+G.time.toFixed(3), introT:+G.introT.toFixed(3), mode:mode,
    host:packFighter(G.p),
    guest:packFighter(G.b),
    dead, nextCrumble:+G.nextCrumble.toFixed(2),
    shake:G.shake, flash:G.flash, hitstop:G.hitstop, slow:G.slow,
    fx
  });
}

function applyOnlineSnap(m){
  // Opponent (host body) — full authority
  unpackFighter(G.b, m.host);
  // Self (guest body) — soft reconcile so movement feels instant
  reconcileFighter(G.p, m.guest);

  if(m.dead){
    G.tiles.forEach((t,k)=>{
      const shouldLive=!m.dead.includes(k);
      if(t.alive&&!shouldLive){t.alive=false;t.col=.001;}
      else if(!t.alive&&shouldLive){t.alive=true;t.col=0;t.warn=0;}
    });
  }
  G.time=m.time; G.introT=m.introT;
  G.nextCrumble=m.nextCrumble;
  // shake/flash from host (authoritative impact feel)
  if(typeof m.shake==="number") G.shake=Math.max(G.shake||0, m.shake);
  if(typeof m.flash==="number") G.flash=Math.max(G.flash||0, m.flash);
  G.hitstop=m.hitstop; G.slow=m.slow;
  if(m.fx&&m.fx.length) fxPlayMany(m.fx);
  if(m.mode&&m.mode!==mode&&(m.mode==="play"||m.mode==="intro"))mode=m.mode;
}

function endMatchOnline(win, fromRemote){
  if(mode==="over")return;
  mode="over"; G.endT=0; G.win=win; G.slow=1; G.focus=null;
  resetInput();
  flag("played",1); flag("seen",1);
  show("end",true); show("hud",false); padVisible(false); tutSay(""); tutHi(null);

  const result=applyMatchResult(win, ONLINE.remoteElo);
  const title=el("endTitle");
  title.textContent=win?(typeof t==="function"?t("youWin"):"YOU WIN"):(typeof t==="function"?t("youLost"):"YOU LOST");
  title.className="big "+(win?"win":"lose");
  const sign=result.delta>=0?"+":"";
  el("endMsg").textContent=(win?"Victory! ":"Defeat. ")+sign+result.delta+" ELO → "+result.elo+" ("+result.tier.name+")";
  el("sTime").textContent=G.time.toFixed(1)+"s";
  el("sDiff").textContent="Online";
  el("sTheme").textContent=CFG.theme;

  const stats=document.querySelector("#scrEnd .stats");
  if(stats&&!el("sRank")){
    const d=document.createElement("div");
    d.className="st"; d.id="sRankWrap";
    d.innerHTML="<b>Rank</b><i id=\"sRank\"></i>";
    stats.appendChild(d);
  }
  if(el("sRank"))el("sRank").textContent=result.tier.name+" "+result.elo;

  if(win){SFX.win(); confettiBurst(140);} else SFX.lose();
  if(ONLINE.isHost&&!fromRemote)onlineSend({t:"end", winHost:win});
  ONLINE.status="ready";
}

function onlineToast(msg){
  let t=el("onlineToast");
  if(!t){
    t=document.createElement("div");
    t.id="onlineToast";
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.classList.add("show");
  clearTimeout(t._tm);
  t._tm=setTimeout(()=>t.classList.remove("show"),2600);
}

function onlineUIRefresh(){
  const st=el("onlineStatus");
  const opp=el("onlineOpp");
  const findBtn=el("btnFindMatch");
  if(!st)return;
  const map={
    idle: typeof t==="function"?t("ready"):"Ready",
    searching: typeof t==="function"?t("searchingOpp"):"Searching…",
    connecting: typeof t==="function"?t("connecting"):"Connecting…",
    ready: typeof t==="function"?t("matchFound"):"Match found!",
    playing: typeof t==="function"?t("inMatch"):"In match",
    error:"Error: "+(ONLINE.lastError||"unknown")
  };
  st.textContent=map[ONLINE.status]||ONLINE.status;
  st.className="online-status "+ONLINE.status;
  if(opp){
    if(ONLINE.status==="ready"||ONLINE.status==="playing"||ONLINE.status==="connecting")
      opp.innerHTML=ONLINE.remoteName+" "+rankBadgeHTML({elo:ONLINE.remoteElo,name:ONLINE.remoteName});
    else opp.textContent="—";
  }
  if(findBtn){
    const busy=ONLINE.status==="searching"||ONLINE.status==="connecting"||ONLINE.status==="playing"||ONLINE.status==="ready";
    findBtn.disabled=busy;
    findBtn.style.opacity=busy?.5:1;
    findBtn.textContent=ONLINE.status==="searching"
      ?(typeof t==="function"?t("searching"):"Searching…")
      :(typeof t==="function"?t("findMatch"):"Find Match");
  }
}

function onlineHostStart(){
  if(!ONLINE.isHost||(ONLINE.status!=="ready"&&ONLINE.status!=="connecting"))return;
  if(ONLINE.autoStartTimer){clearTimeout(ONLINE.autoStartTimer);ONLINE.autoStartTimer=null;}
  onlineSend({t:"start"});
  startOnlineMatch(true);
}

// Client-side local prediction step (movement + dash only; combat from host)
function predictLocalPlayer(dt){
  const f=G.p;
  if(f.dead){f.fall+=dt;return;}
  // If host has us in knockback/stagger, prediction already reconciled those fields
  if(f.kb>0||f.stagger>0)return;

  const sp=G.sp;
  f.breath+=dt*2.4;
  f.squash=Math.max(0,f.squash-dt*4);
  f.atkCd=Math.max(0,f.atkCd-dt*sp);
  f.dashCd=Math.max(0,f.dashCd-dt*sp);

  // guard meter local feedback
  const wantG=f.ai.wantGuard&&f.atkPh===""&&f.gm>.12;
  f.guard=!!wantG;
  f.gm=Math.max(0,Math.min(1,f.gm+(f.guard?-dt*.52:dt*.42)));

  // dash start (visual)
  if(f.ai.wantDash&&f.dashCd<=0&&f.atkPh===""){
    const m=Math.hypot(f.ai.mx,f.ai.my);
    const dx=m>.1?f.ai.mx/m:Math.cos(f.face), dy=m>.1?f.ai.my/m:Math.sin(f.face);
    f.dash=.16; f.dashCd=1.35; f.dashDX=dx; f.dashDY=dy;
    f.ix+=dx*DASHSPD*.55; f.iy+=dy*DASHSPD*.55;
  }

  // walk
  let tx=0,ty=0;
  if(f.dash>0){
    f.dash-=dt; tx=f.dashDX*DASHSPD; ty=f.dashDY*DASHSPD;
  }else if(f.atkPh===""){
    tx=f.ai.mx*SPD; ty=f.ai.my*SPD;
    if(f.ai.mx||f.ai.my)f.face=Math.atan2(f.ai.my,f.ai.mx);
  }
  f.vx+=(tx-f.vx)*Math.min(1,dt*14);
  f.vy+=(ty-f.vy)*Math.min(1,dt*14);
  f.ix*=Math.exp(-IMPULSE_DAMP*dt);
  f.iy*=Math.exp(-IMPULSE_DAMP*dt);
  f.x+=(f.vx+f.ix)*dt*sp;
  f.y+=(f.vy+f.iy)*dt*sp;
}
