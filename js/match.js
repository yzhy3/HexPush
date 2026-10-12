"use strict";
/* Match lifecycle: setup, the per-frame update, the camera, and the result screen.
   kind is "match" (real duel), "tutorial", "practice" or "online". */

function startMatch(kind){
  if(typeof killKeyboard==="function")killKeyboard();
  G.kind=kind||"match";
  const teach=G.kind!=="match"&&G.kind!=="online";
  G.theme=THEMES[CFG.theme]; G.radius=teach?3:SIZES[CFG.size]; G.sp=teach?1:SPEEDS[CFG.speed];
  G.diffP=DIFF[CFG.diff];
  G.rookie=false;
  // first real match ever: quietly soften the AI so nobody bounces off the game
  if(G.kind==="match"&&!flag("played")){
    const d=G.diffP;
    G.diffP={react:Math.max(.34,d.react*2.4),aggro:d.aggro*.55,guard:d.guard*.2,
             dash:d.dash*.5,miss:Math.max(.32,d.miss*2.5),edge:d.edge*.55,combo:d.combo*.15};
    G.rookie=true;
  }
  G.persona=Object.keys(PERSONAS)[Math.random()*4|0];
  resetInput();                                    // never inherit held keys from the last match
  buildArena();
  // randomized opening positions: opposite-ish edges
  const R=G.radius, a=Math.random()*6.28;
  const spawn=ang=>{
    const d=(R-0.35)*HS*1.5, hx=pixHex(Math.cos(ang)*d,Math.sin(ang)*d*.95);
    return alive(hx.q,hx.r)?hx:{q:0,r:0};
  };
  const s1=spawn(a), s2=spawn(a+Math.PI+(Math.random()-.5)*.7);
  const pc=COLORS[CFG.color];
  const botCol=pickContrast(pc);
  G.p=mkFighter(s1.q,s1.r,pc,false);
  G.b=mkFighter(s2.q,s2.r,botCol,true);
  G.p.face=Math.atan2(G.b.y-G.p.y,G.b.x-G.p.x); G.b.face=G.p.face+Math.PI;
  G.parts.length=0; G.conf.length=0;
  G.time=0; G.introT=0; G.endT=0; G.shake=0; G.flash=0;
  G.hitstop=0; G.slow=1; G.focus=null;
  G.nextCrumble=teach?1e9:4.5/G.sp; G.tick=0;      // no arena collapse while teaching
  G.cam.x=0;G.cam.y=0;G.cam.z=1.75;G.cam.tz=1;
  el("dotP").style.color=pc;
  el("dotB").style.color=botCol;
  el("botName").textContent=
    G.kind==="practice"?"Dummy":G.kind==="tutorial"?"Trainer":(PERSONAS[G.persona]?PERSONAS[G.persona].name:"Bot");
  const tp=el("tagP");
  if(tp) tp.innerHTML='<span class="dot" id="dotP" style="color:'+pc+'"></span>'+(RANK.name||(typeof t==="function"?t("you"):"You"));
  show(); show("hud",true); lastCenter="";
  if(teach)flag("seen",1);                          // welcome modal is a one-time thing
  G.tut = G.kind==="tutorial" ? {step:0,t:0,n:0,last:"",hits:0,blocked:false,dashed:false,pushT:0} : null;
  tutSay("");
  if(teach){
    mode="play";
    G.cam.z=1.35;
    if(G.kind==="practice")tutSay("<b>Practice</b> — hit the dummy, learn your spacing. Nobody wins here.",
      "Pause ❚❚ to leave");
  }else mode="intro";
  padVisible(TOUCH);
}

//------------------------------------------------------------ per-frame
function update(dt){
  stepEffects(dt);

  if(mode==="intro"){
    // host (or offline) advances the clock; online client follows host snapshots
    if(!(G.kind==="online"&&!ONLINE.isHost)) G.introT+=dt;
    const myName=(typeof displayName==="function"?displayName(RANK.name, typeof t==="function"?t("you"):"You"):(RANK.name||"You")).toUpperCase();
    let vsName;
    if(G.kind==="online"){
      vsName=(typeof displayName==="function"?displayName(ONLINE.remoteName,"Opponent"):(ONLINE.remoteName||"Opponent")).toUpperCase();
    }else{
      vsName=(PERSONAS[G.persona]?PERSONAS[G.persona].name:"BOT").toUpperCase();
    }
    const st=[[0, myName+" VS "+vsName],[1.1,"3"],[1.8,"2"],[2.5,"1"],[3.2,"PUSH!"]];
    let cur=""; for(const s of st)if(G.introT>=s[0])cur=s[1];
    if(cur!==lastCenter){
      const tip=G.kind==="online"?(typeof t==="function"?t("pushThem"):"Push them off the arena"):(typeof t==="function"?t("pushBot"):"Push the bot off the arena");
      setCenter(cur, tip);
      if(cur==="PUSH!"){SFX.go();
        setTimeout(()=>{if(lastCenter==="PUSH!")setCenter("")},1000);
      }else if(G.introT>1)SFX.count();
    }
    camUpdate(dt,4.2);
    if(G.kind==="online"&&ONLINE.isHost)onlineBroadcastState();
    if(G.introT>3.35)mode="play";
    return;
  }
  if(mode!=="play")   {if(mode==="over"){G.endT+=dt;camUpdate(dt,2.2);tilesUpdate(dt);}return;}

  G.time+=dt;

  playerInput(G.p);

  if(G.kind==="online"){
    if(ONLINE.isHost){
      applyRemoteInputToBot();
      stepFighter(G.p,G.b,dt);
      stepFighter(G.b,G.p,dt);
      tilesUpdate(dt);
      G.nextCrumble-=dt;
      if(G.nextCrumble<=0){crumbleStep();G.nextCrumble=Math.max(1.5,3.6-G.time*.055)/G.sp;}
      onlineBroadcastState();
      if((G.p.dead&&G.p.fall>1.15)||(G.b.dead&&G.b.fall>1.15))endMatchOnline(!G.p.dead,false);
    }else{
      // Client: instant local sim + send inputs; remote opponent interpolated
      onlineSendInput();
      predictLocalPlayer(dt);
      if(typeof interpOpponent==="function") interpOpponent(dt);
      // Animate purple warn locally; only host can kill tiles (via snapshot)
      G.tiles.forEach(tile=>{
        tile.bob+=dt;
        if(tile.alive&&tile.warn>0){
          tile.warn-=dt/(tile.warnMax||1.7);
          if(tile.warn<0.02) tile.warn=0.02; // keep visible until host marks dead
        }
        if(!tile.alive&&tile.col<3)tile.col+=dt;
      });
    }
  }else{
    if(G.tut)tutBot(dt);
    else if(G.kind==="practice"){G.b.ai.mx=G.b.ai.my=0;G.b.ai.wantAtk=false;G.b.ai.wantGuard=0;}
    else botThink(G.b,G.p,dt);
    stepFighter(G.p,G.b,dt);
    stepFighter(G.b,G.p,dt);
    tilesUpdate(dt);
    if(G.tut)tutStep(dt);
    if(G.kind==="practice"){
      if(G.p.dead&&G.p.fall>.9)respawn(G.p,0,0);
      if(G.b.dead&&G.b.fall>.9)respawn(G.b,1,0);
    }
    G.nextCrumble-=dt;
    if(G.nextCrumble<=0){crumbleStep();G.nextCrumble=Math.max(1.5,3.6-G.time*.055)/G.sp;}
    if(G.kind==="match"&&((G.p.dead&&G.p.fall>1.15)||(G.b.dead&&G.b.fall>1.15)))endMatch(!G.p.dead);
  }

  camUpdate(dt,2.6);
  hudUpdate();
}

function camUpdate(dt,k){
  const a=G.p,b=G.b;
  let tx=(a.x+b.x)/2, ty=(a.y+b.y)/2;
  const cen=arenaCenter(); tx=tx*.55+cen.x*.45; ty=ty*.55+cen.y*.45;
  let n=0;G.tiles.forEach(t=>{if(t.alive)n++;});
  const span=Math.max(220,Math.hypot(a.x-b.x,a.y-b.y)*1.5+300);
  let z=Math.min(W,H*1.15)/span;
  z=Math.max(.62,Math.min(n<=7?2.15:n<=14?1.7:1.42,z));
  if(mode==="intro")z*= .75+ .25*Math.min(1,G.introT/2);
  if(G.focus&&G.focus.dead){                   // follow whoever is falling
    const f=G.focus, fade=Math.min(1,f.fall*1.6);
    tx=tx*(1-fade)+f.x*fade; ty=ty*(1-fade)+(f.y+f.fall*f.fall*820)*fade;
    z*=1+.22*fade; k=Math.max(k,4);
  }
  G.cam.tz=z;
  const s=smooth(k,dt);
  G.cam.x+=(tx-G.cam.x)*s;
  G.cam.y+=(ty-G.cam.y)*s;
  G.cam.z+=(G.cam.tz-G.cam.z)*smooth(2.2,dt);
}

function endMatch(win){
  mode="over"; G.endT=0; G.win=win; G.slow=1; G.focus=null;
  resetInput();                                    // whatever was held as you fell, let it go
  flag("played",1); flag("seen",1);
  show("end",true); show("hud",false); padVisible(false); tutSay(""); tutHi(null);
  const title=el("endTitle");
  title.textContent=win?(typeof t==="function"?t("youWin"):"YOU WIN"):(typeof t==="function"?t("youLost"):"YOU LOST");
  title.className="big "+(win?"win":"lose");
  const close=G.time<26||aliveTiles().length<=6;
  el("endMsg").textContent=win
    ? (close?"Clutch. That was close.":"Clean push. Again?")
    : LOSE_MSG[Math.random()*LOSE_MSG.length|0];
  el("sTime").textContent=G.time.toFixed(1)+"s";
  el("sDiff").textContent=CFG.diff;
  el("sTheme").textContent=CFG.theme;
  if(win){
    SFX.win(); if(close)SFX.cheer();
    confettiBurst(170);
  } else SFX.lose();
}
