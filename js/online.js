"use strict";
/* PeerJS P2P online matches. Host is authoritative: runs the full simulation
   and streams compact state. Client sends inputs only.

   Protocol messages (JSON):
   hello   {t:"hello", name, elo, color, size, theme, speed, seed}
   ready   {t:"ready"}
   input   {t:"input", mx, my, atk, dash, guard, seq}
   state   {t:"state", ...snapshot}
   end     {t:"end", winHost}   // winHost = host player won
   ping    {t:"ping", n}
   pong    {t:"pong", n}
   leave   {t:"leave"}
*/

const ONLINE={
  peer:null, conn:null, isHost:false, room:"",
  remoteName:"Opponent", remoteElo:1000, remoteColor:null,
  status:"idle", // idle | waiting | connecting | ready | playing | error
  lastError:"",
  remoteInput:{mx:0,my:0,atk:false,dash:false,guard:0,seq:0},
  seq:0,
  seed:0,
  // client-side interpolation buffer
  snap:null, snapT:0,
  rtt:0, lastPing:0
};

function onlineReset(){
  try{if(ONLINE.conn)ONLINE.conn.close();}catch(e){}
  try{if(ONLINE.peer)ONLINE.peer.destroy();}catch(e){}
  ONLINE.peer=null; ONLINE.conn=null; ONLINE.isHost=false; ONLINE.room="";
  ONLINE.status="idle"; ONLINE.lastError="";
  ONLINE.remoteInput={mx:0,my:0,atk:false,dash:false,guard:0,seq:0};
  ONLINE.snap=null; ONLINE.seq=0;
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

function onOnlineMsg(raw){
  let m; try{m=typeof raw==="string"?JSON.parse(raw):raw;}catch(e){return;}
  if(!m||!m.t)return;

  if(m.t==="hello"){
    ONLINE.remoteName=m.name||"Opponent";
    ONLINE.remoteElo=m.elo|0||1000;
    ONLINE.remoteColor=m.color||null;
    if(ONLINE.isHost){
      // host already has match settings; confirm seed + settings to guest
      onlineSend({
        t:"hello",
        name:RANK.name, elo:RANK.elo, color:CFG.color,
        size:CFG.size, theme:CFG.theme, speed:CFG.speed,
        seed:ONLINE.seed
      });
      ONLINE.status="ready";
      onlineUIRefresh();
    }else{
      // guest adopts host settings
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
  }
  else if(m.t==="input"&&ONLINE.isHost){
    ONLINE.remoteInput.mx=+m.mx||0;
    ONLINE.remoteInput.my=+m.my||0;
    if(m.atk)ONLINE.remoteInput.atk=true;
    if(m.dash)ONLINE.remoteInput.dash=true;
    ONLINE.remoteInput.guard=m.guard?1:0;
    ONLINE.remoteInput.seq=m.seq|0;
  }
  else if(m.t==="state"&&!ONLINE.isHost){
    ONLINE.snap=m;
    ONLINE.snapT=performance.now();
    applyOnlineSnap(m);
  }
  else if(m.t==="end"){
    // host already called endMatch; client receives result
    if(!ONLINE.isHost){
      const iWon=!m.winHost; // host win means guest lost
      endMatchOnline(iWon, true);
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
    // host tells guest to begin
    if(!ONLINE.isHost)startOnlineMatch(false);
  }
}

function wireConn(conn){
  ONLINE.conn=conn;
  conn.on("data",onOnlineMsg);
  conn.on("close",()=>{
    if(ONLINE.status==="playing"||ONLINE.status==="ready"||ONLINE.status==="waiting"){
      ONLINE.lastError="Connection closed";
      ONLINE.status="error";
      onlineUIRefresh();
      if(mode==="play"||mode==="intro"||mode==="paused"){goHome(); onlineToast("Opponent disconnected");}
    }
  });
  conn.on("open",()=>{
    // host waits for guest hello; guest sends hello immediately
    if(!ONLINE.isHost){
      onlineSend({
        t:"hello",
        name:RANK.name, elo:RANK.elo, color:CFG.color
      });
    }
  });
}

function onlineCreate(){
  onlineReset();
  ONLINE.isHost=true;
  ONLINE.room=roomCode();
  ONLINE.seed=(Math.random()*1e9)|0;
  ONLINE.status="waiting";
  onlineUIRefresh();

  const peer=new Peer(ONLINE.room,{
    debug:1,
    config:{iceServers:[
      {urls:"stun:stun.l.google.com:19302"},
      {urls:"stun:global.stun.twilio.com:3478"}
    ]}
  });
  ONLINE.peer=peer;
  peer.on("open",id=>{
    ONLINE.room=id;
    onlineUIRefresh();
  });
  peer.on("connection",conn=>{
    if(ONLINE.conn){try{conn.close();}catch(e){}return;} // one opponent
    wireConn(conn);
    ONLINE.status="connecting";
    onlineUIRefresh();
    // when data channel opens, host sends hello with settings
    conn.on("open",()=>{
      onlineSend({
        t:"hello",
        name:RANK.name, elo:RANK.elo, color:CFG.color,
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
  if(code.length<4){ONLINE.lastError="Invalid room code"; ONLINE.status="error"; onlineUIRefresh(); return;}
  onlineReset();
  ONLINE.isHost=false;
  ONLINE.room=code;
  ONLINE.status="connecting";
  onlineUIRefresh();

  const peer=new Peer({
    debug:1,
    config:{iceServers:[
      {urls:"stun:stun.l.google.com:19302"},
      {urls:"stun:global.stun.twilio.com:3478"}
    ]}
  });
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
  // shared match setup; both sides call this
  G.kind="online";
  G.theme=THEMES[CFG.theme];
  G.radius=SIZES[CFG.size];
  G.sp=SPEEDS[CFG.speed];
  G.diffP=DIFF.Normal;
  G.rookie=false;
  G.persona="Online";
  resetInput();
  // deterministic arena from seed
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
    ? COLORS[ONLINE.remoteColor]
    : pickContrast(myCol);

  // Host: G.p = host, G.b = guest
  // Client: G.p = guest (me), G.b = host — but host simulates with host as p.
  // Client receives state and remaps.
  if(asHost||ONLINE.isHost){
    G.p=mkFighter(s1.q,s1.r,myCol,false);
    G.b=mkFighter(s2.q,s2.r,theirCol,false); // no AI — driven by remote input
  }else{
    // client local visual: me at s2, host at s1 (will be overwritten by snaps)
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
  el("botName").textContent=ONLINE.remoteName;
  el("tagP").innerHTML='<span class="dot" id="dotP" style="color:'+G.p.color+'"></span>You';
  show(); show("hud",true); lastCenter="";
  mode="intro";
  ONLINE.status="playing";
  padVisible(TOUCH);
  onlineUIRefresh();
}

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function onlineSendInput(){
  if(ONLINE.isHost||!ONLINE.conn||ONLINE.status!=="playing")return;
  // sample current player intent without consuming edge permanently for local
  // (playerInput already consumes; we mirror what was applied)
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
    x:f.x,y:f.y,vx:f.vx,vy:f.vy,ix:f.ix,iy:f.iy,
    face:f.face,color:f.color,
    atk:f.atk,atkPh:f.atkPh,atkCd:f.atkCd,hitDone:f.hitDone,
    dash:f.dash,dashCd:f.dashCd,dashDX:f.dashDX,dashDY:f.dashDY,
    guard:f.guard,gm:f.gm,stagger:f.stagger,
    kb:f.kb,kbX:f.kbX,kbY:f.kbY,kbFX:f.kbFX,kbFY:f.kbFY,
    fall:f.fall,dead:f.dead,squash:f.squash
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

function onlineBroadcastState(){
  if(!ONLINE.isHost||ONLINE.status!=="playing")return;
  // tiles: only send which are dead (alive list is compact)
  const dead=[];
  G.tiles.forEach((t,k)=>{if(!t.alive)dead.push(k);});
  onlineSend({
    t:"state",
    time:G.time, introT:G.introT, mode:mode,
    // host p = host fighter, host b = guest fighter
    // guest sees: me = host.b, them = host.p
    host:packFighter(G.p),
    guest:packFighter(G.b),
    dead, nextCrumble:G.nextCrumble,
    shake:G.shake, flash:G.flash, hitstop:G.hitstop, slow:G.slow
  });
}

function applyOnlineSnap(m){
  // remap: local G.p = guest snapshot, G.b = host snapshot
  unpackFighter(G.p, m.guest);
  unpackFighter(G.b, m.host);
  if(m.dead){
    G.tiles.forEach((t,k)=>{
      const shouldLive=!m.dead.includes(k);
      if(t.alive!==shouldLive){
        t.alive=shouldLive;
        if(!shouldLive)t.crumble=1;
      }
    });
  }
  G.time=m.time; G.introT=m.introT;
  G.nextCrumble=m.nextCrumble;
  G.shake=m.shake; G.flash=m.flash; G.hitstop=m.hitstop; G.slow=m.slow;
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
  title.textContent=win?"YOU WIN":"YOU LOST";
  title.className="big "+(win?"win":"lose");
  const sign=result.delta>=0?"+":"";
  el("endMsg").textContent=(win?"Victory! ":"Defeat. ")+sign+result.delta+" ELO → "+result.elo+" ("+result.tier.name+")";
  el("sTime").textContent=G.time.toFixed(1)+"s";
  el("sDiff").textContent="Online";
  el("sTheme").textContent=CFG.theme;

  // inject rank change into stats if elements exist
  const stats=document.querySelector("#scrEnd .stats");
  if(stats&&!el("sRank")){
    const d=document.createElement("div");
    d.className="st"; d.id="sRankWrap";
    d.innerHTML="<b>Rank</b><i id=\"sRank\"></i>";
    stats.appendChild(d);
  }
  if(el("sRank"))el("sRank").textContent=result.tier.name+" "+result.elo;

  if(win)SFX.win(); else SFX.lose();
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
  t._tm=setTimeout(()=>t.classList.remove("show"),2800);
}

function onlineUIRefresh(){
  const st=el("onlineStatus");
  const code=el("onlineCode");
  const opp=el("onlineOpp");
  const startBtn=el("btnOnlineStart");
  if(!st)return;
  const map={
    idle:"Ready",
    waiting:"Waiting for opponent…",
    connecting:"Connecting…",
    ready:"Opponent connected!",
    playing:"In match",
    error:"Error: "+(ONLINE.lastError||"unknown")
  };
  st.textContent=map[ONLINE.status]||ONLINE.status;
  st.className="online-status "+ONLINE.status;
  if(code)code.textContent=ONLINE.room||"—";
  if(opp){
    if(ONLINE.status==="ready"||ONLINE.status==="playing")
      opp.innerHTML=ONLINE.remoteName+" "+rankBadgeHTML({elo:ONLINE.remoteElo,name:ONLINE.remoteName});
    else opp.textContent="—";
  }
  if(startBtn){
    startBtn.disabled=!(ONLINE.isHost&&ONLINE.status==="ready");
    startBtn.style.opacity=startBtn.disabled?.45:1;
  }
}

// host starts when both ready
function onlineHostStart(){
  if(!ONLINE.isHost||ONLINE.status!=="ready")return;
  onlineSend({t:"start"});
  startOnlineMatch(true);
}
