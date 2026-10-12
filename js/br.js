"use strict";
/* Battle Royale: 4–6 fighters, last one standing.
   - Local: you + AI bots
   - Online: host simulates all humans (and fills empty slots with bots)
*/

const BR={
  active:false,
  maxPlayers:4,
  fighters:[],      // all fighters
  me:0,             // local index
  names:[],
  alive:0,
  onlineSlots:[]    // host: {conn, input, name, elo, color, fIndex}[]
};

function brReset(){
  BR.active=false;
  BR.fighters=[];
  BR.me=0;
  BR.names=[];
  BR.alive=0;
  BR.onlineSlots=[];
}

function brBotName(i){
  const pool=["Ravager","Bulwark","Sentinel","Jester","Wraith","Nomad","Viper","Forge"];
  return pool[i%pool.length];
}

function brStartLocal(count){
  count=Math.max(3,Math.min(6,count||4));
  G.kind="br";
  BR.active=true;
  BR.maxPlayers=count;
  G.theme=THEMES[CFG.theme];
  G.radius=Math.max(4, SIZES[CFG.size]|0)+1; // bigger arena
  G.sp=SPEEDS[CFG.speed];
  G.diffP=DIFF[CFG.diff]||DIFF.Normal;
  G.rookie=false;
  G.persona="BR";
  resetInput();
  buildArena();
  fxReset(); FX_NET=false;

  const colors=Object.values(COLORS);
  const myCol=COLORS[CFG.color];
  BR.fighters=[];
  BR.names=[];
  const R=G.radius;
  for(let i=0;i<count;i++){
    const ang=(i/count)*Math.PI*2 + Math.random()*.3;
    const d=(R-0.4)*HS*1.5;
    const hx=pixHex(Math.cos(ang)*d, Math.sin(ang)*d*.95);
    const q=alive(hx.q,hx.r)?hx.q:0, r=alive(hx.q,hx.r)?hx.r:0;
    const col=i===0?myCol:colors[(i+2)%colors.length];
    const f=mkFighter(q,r,col,i!==0);
    BR.fighters.push(f);
    BR.names.push(i===0?RANK.name:brBotName(i));
  }
  BR.me=0;
  BR.alive=count;
  G.p=BR.fighters[0];
  G.b=BR.fighters[1]; // for camera fallback
  G.parts.length=0; G.conf.length=0;
  G.time=0; G.introT=0; G.endT=0; G.shake=0; G.flash=0;
  G.hitstop=0; G.slow=1; G.focus=null;
  G.nextCrumble=5.5/G.sp; G.tick=0;
  G.cam.x=0;G.cam.y=0;G.cam.z=1.5;G.cam.tz=1;
  G.tut=null;
  el("dotP").style.color=G.p.color;
  el("dotB").style.color="#888";
  el("botName").textContent="BR "+count;
  show(); show("hud",true); lastCenter="";
  mode="intro";
  padVisible(TOUCH);
}

function brUpdate(dt){
  if(!BR.active)return;
  // local player input
  playerInput(BR.fighters[BR.me]);

  // bots
  for(let i=0;i<BR.fighters.length;i++){
    if(i===BR.me)continue;
    const f=BR.fighters[i];
    if(f.dead)continue;
    // target nearest living other
    let best=null,bd=1e9;
    for(let j=0;j<BR.fighters.length;j++){
      if(j===i||BR.fighters[j].dead)continue;
      const d=Math.hypot(BR.fighters[j].x-f.x,BR.fighters[j].y-f.y);
      if(d<bd){bd=d;best=BR.fighters[j];}
    }
    if(best) botThink(f,best,dt);
    else{f.ai.mx=f.ai.my=0;}
  }

  // step each vs nearest opponent for combat
  for(let i=0;i<BR.fighters.length;i++){
    const f=BR.fighters[i];
    if(f.dead){f.fall+=dt;continue;}
    let opp=null,bd=1e9;
    for(let j=0;j<BR.fighters.length;j++){
      if(j===i||BR.fighters[j].dead)continue;
      const d=Math.hypot(BR.fighters[j].x-f.x,BR.fighters[j].y-f.y);
      if(d<bd){bd=d;opp=BR.fighters[j];}
    }
    if(opp) stepFighter(f,opp,dt);
    else stepFighter(f,f,dt);
  }

  tilesUpdate(dt);
  G.nextCrumble-=dt;
  if(G.nextCrumble<=0){crumbleStep();G.nextCrumble=Math.max(1.2,3.2-G.time*.06)/G.sp;}

  // count alive
  let aliveN=0, lastAlive=-1;
  for(let i=0;i<BR.fighters.length;i++){
    if(!BR.fighters[i].dead){aliveN++; lastAlive=i;}
    else if(BR.fighters[i].fall>1.15 && BR.fighters[i]._counted!==1){
      BR.fighters[i]._counted=1;
      // elimination splash already via fall SFX
    }
  }
  BR.alive=aliveN;
  el("botName").textContent="Alive "+aliveN+"/"+BR.fighters.length;

  // camera follows local player + cluster
  G.p=BR.fighters[BR.me];
  if(lastAlive>=0) G.b=BR.fighters[lastAlive===BR.me?(lastAlive+1)%BR.fighters.length:lastAlive];

  if(aliveN<=1 && G.time>3){
    const win = lastAlive===BR.me && !BR.fighters[BR.me].dead;
    brEnd(win);
  }
}

function brEnd(win){
  if(mode==="over")return;
  mode="over"; G.endT=0; G.win=win; G.slow=1; G.focus=null;
  resetInput(); FX_NET=false;
  flag("played",1); flag("seen",1);
  show("end",true); show("hud",false); padVisible(false); tutSay(""); tutHi(null);
  const result=applyBrResult(win);
  const title=el("endTitle");
  title.textContent=win?"VICTORY ROYALE":"ELIMINATED";
  title.className="big "+(win?"win":"lose");
  el("endMsg").textContent=win
    ?("Last one standing! BR wins: "+result.brWins+" · ELO "+result.elo)
    :("Better luck next drop. ELO "+result.elo);
  el("sTime").textContent=G.time.toFixed(1)+"s";
  el("sDiff").textContent="Battle Royale";
  el("sTheme").textContent=CFG.theme;
  if(win){SFX.win(); confettiBurst(200);} else SFX.lose();
  BR.active=false;
}

function brDrawExtras(ctx){
  // name tags above fighters — called from render if needed
}
