"use strict";
/* Fighter creation, per-frame simulation and all combat resolution.
   Both the player and the bot are the same struct; only `ai` is filled differently. */

// Velocity lives in two separate channels and they must never be mixed:
//   vx/vy  CONTROL — driven by input/AI, always bounded by the walk or dash target
//   ix/iy  IMPULSE — knockback recoil and dash residue, decays on its own
// Sharing one channel is what let a guard recoil overpower WASD (you pressed
// forward and moved backward) and let a finished dash glide you off the edge.
// e-folds/sec. Tuned so a dash still covers ~162px end to end, matching the reach it
// had when the residue lived in the control channel — the tail is now steerable, not longer.
const IMPULSE_DAMP=11;

function mkFighter(q,r,color,isBot){
  const c=hexC(q,r);
  return {x:c.x,y:c.y,vx:0,vy:0,ix:0,iy:0,face:isBot?Math.PI:0,color,isBot,
    atk:0,atkPh:"",atkCd:0,hitDone:false, dash:0,dashCd:0,dashDX:0,dashDY:0,
    guard:false,gm:1,stagger:0, kb:0,kbX:0,kbY:0,kbFX:0,kbFY:0,
    fall:0,dead:false, trail:[],breath:Math.random()*6.28,squash:0,
    ai:{t:0,mx:0,my:0,wantAtk:false,wantGuard:0,wantDash:false}};
}
const fHex=f=>pixHex(f.x,f.y);

function respawn(f,q,r){
  const c=hexC(q,r);
  f.dead=false;f.fall=0;f.x=c.x;f.y=c.y;f.vx=f.vy=0;f.ix=f.iy=0;
  f.kb=0;f.stagger=0;f.atkPh="";f.dash=0;f.guard=false;f.trail.length=0;
  f.ai.mx=f.ai.my=0;f.ai.wantAtk=false;f.ai.wantDash=false;f.ai.wantGuard=0;
  burst(c.x,c.y,14,f.color,120,.4,3);
}

//------------------------------------------------------------ per-frame step
function stepFighter(f,o,dt){
  const sp=G.sp;
  if(f.dead){f.fall+=dt;return;}
  f.breath+=dt*2.4; f.squash=Math.max(0,f.squash-dt*4);
  f.atkCd=Math.max(0,f.atkCd-dt*sp);
  f.dashCd=Math.max(0,f.dashCd-dt*sp);
  f.stagger=Math.max(0,f.stagger-dt);

  // knockback tween wins over everything
  if(f.kb>0){
    f.kb-=dt*sp*6.2;
    const t=1-Math.max(0,f.kb), e=1-Math.pow(1-t,3);
    f.x=f.kbFX+(f.kbX-f.kbFX)*e; f.y=f.kbFY+(f.kbY-f.kbFY)*e;
    f.trail.push({x:f.x,y:f.y,l:.38});           // fat knockback smear — the slide must read
    if(f.kb<=0)f.kb=0;
    checkFall(f); return;
  }
  const busy=f.stagger>0;

  // guard
  const wantG=f.ai.wantGuard&&!busy&&f.atkPh===""&&f.gm>.12;
  f.guard=!!wantG;
  f.gm=Math.max(0,Math.min(1,f.gm+(f.guard?-dt*.52:dt*.42)));

  // dash
  if(f.ai.wantDash&&f.dashCd<=0&&!busy&&f.atkPh===""){
    const m=Math.hypot(f.ai.mx,f.ai.my);
    const dx=m>.1?f.ai.mx/m:Math.cos(f.face), dy=m>.1?f.ai.my/m:Math.sin(f.face);
    f.dash=.19; f.dashDX=dx; f.dashDY=dy; f.dashCd=1.35; f.face=Math.atan2(dy,dx);
    SFX.dash(); burst(f.x,f.y,10,f.color,90,.3,3);
  }
  f.ai.wantDash=false;

  // attack state machine: wind -> hit -> rec
  if(f.ai.wantAtk&&f.atkCd<=0&&!busy&&f.atkPh===""&&f.dash<=0){
    f.atkPh="wind"; f.atk=(f.slowAtk?.45:.085)/sp; f.hitDone=false; f.whiff=0; f.atkCd=(f.slowAtk?1.5:.52)/sp;
  }
  f.ai.wantAtk=false;
  if(f.atkPh){
    f.atk-=dt;
    if(f.atk<=0){
      if(f.atkPh==="wind"){f.atkPh="hit";f.atk=.075/sp;tryHit(f,o);}
      else if(f.atkPh==="hit"){f.atkPh="rec";f.atk=.19/sp;}
      else f.atkPh="";
    }
  }

  // movement — ax/ay is the CONTROL target this frame, derived only from current input
  let ax=0,ay=0;
  const dashing=f.dash>0;
  if(dashing){
    f.dash-=dt*sp;
    ax=f.dashDX*DASHSPD; ay=f.dashDY*DASHSPD;
    f.trail.push({x:f.x,y:f.y,l:.26});
  }else{
    let mul=1;
    if(f.guard)mul=.42; if(f.atkPh==="wind")mul=.4; if(f.atkPh==="hit")mul=.9; if(f.atkPh==="rec")mul=.35;
    if(busy)mul=.12;
    const m=Math.hypot(f.ai.mx,f.ai.my);
    if(m>.05){ax=f.ai.mx*SPD*sp*mul;ay=f.ai.my*SPD*sp*mul;
      if(!busy&&f.atkPh===""){const ta=Math.atan2(f.ai.my,f.ai.mx);f.face+=angDiff(ta,f.face)*smooth(14,dt);}}
  }
  // face the enemy while attacking/guarding
  if(f.atkPh||f.guard){const ta=Math.atan2(o.y-f.y,o.x-f.x);f.face+=angDiff(ta,f.face)*smooth(f.atkPh==="wind"?18:7,dt);}

  const s=smooth(dashing?26:13,dt);
  f.vx+=(ax-f.vx)*s; f.vy+=(ay-f.vy)*s;
  // the frame a dash ends, hand its leftover speed to the impulse channel: the slide
  // still reads, but the control channel answers input again on the very next frame
  if(dashing&&f.dash<=0){f.dash=0;f.ix+=f.vx;f.iy+=f.vy;f.vx=0;f.vy=0;}
  const damp=Math.exp(-IMPULSE_DAMP*dt);
  f.ix*=damp; f.iy*=damp;
  f.x+=(f.vx+f.ix)*dt; f.y+=(f.vy+f.iy)*dt;

  // body collision
  const dx=o.x-f.x,dy=o.y-f.y,d=Math.hypot(dx,dy);
  if(d<32&&d>0.01&&!o.dead){const push=(32-d)/2;f.x-=dx/d*push;f.y-=dy/d*push;}

  for(let i=f.trail.length-1;i>=0;i--){f.trail[i].l-=dt*2.6;if(f.trail[i].l<=0)f.trail.splice(i,1);}
  checkFall(f);
}

//------------------------------------------------------------ combat resolution
function tryHit(f,o){
  if(o.dead||f.hitDone)return; f.hitDone=true;
  // Online guest: predict swing only — host owns hit/block/knockback
  if(G.kind==="online"&&typeof ONLINE!=="undefined"&&!ONLINE.isHost){
    burst(f.x+Math.cos(f.face)*26,f.y+Math.sin(f.face)*26,5,f.color,110,.22,2.5);
    SFX.swing();
    return;
  }
  const dx=o.x-f.x,dy=o.y-f.y,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
  burst(f.x+Math.cos(f.face)*26,f.y+Math.sin(f.face)*26,5,f.color,110,.22,2.5);
  if(d>64||Math.abs(angDiff(a,f.face))>1.0){                       // WHIFF — light, obviously "no contact"
    f.whiff=1; SFX.swing();
    if(G.tut&&f===G.p)G.tut.misses=(G.tut.misses||0)+1;
    return;
  }
  if(o.guard&&o.gm>0){                                             // GUARDED
    o.gm=Math.max(0,o.gm-.34);
    f.stagger=.55; f.atkPh=""; f.atk=0;
    const mx=(f.x+o.x)/2,my=(f.y+o.y)/2;
    burst(mx,my,26,"#ffffff",260,.38,2.8); burst(mx,my,14,"#ffe9a8",180,.5,2.2);
    ring(mx,my,"#bfe9ff"); ring(o.x,o.y,"#ffffff");
    G.shake=Math.min(11,G.shake+7); G.flash=.1; G.hitstop=.06; SFX.block();
    if(typeof fxPush==="function"&&FX_NET){fxPush({t:"shake",v:7});fxPush({t:"flash",v:.1});}
    // recoil goes to the impulse channel — it must never fight the attacker's own input
    f.ix-=Math.cos(f.face)*280; f.iy-=Math.sin(f.face)*280;
    if(G.tut&&o===G.p)G.tut.blocked=true;
    return;
  }
  pushBack(o,a,f);
  if(G.tut&&f===G.p)G.tut.hits++;
}

// knock a fighter back exactly one hex tile along angle `a` (f may be null: scripted push)
function pushBack(o,a,f){
  const di=dirFromAngle(a), h=fHex(o);
  const nq=h.q+HEXD[di][0], nr=h.r+HEXD[di][1], c=hexC(nq,nr);
  o.kb=1; o.kbFX=o.x; o.kbFY=o.y; o.kbX=c.x; o.kbY=c.y;
  o.stagger=o.atkPh?.62:.24;                                       // hit mid-swing = big stagger
  o.atkPh=""; o.dash=0; o.guard=false; o.vx=o.vy=0; o.ix=o.iy=0; o.squash=1;
  if(f)f.squash=.7;
  const mx=f?(f.x+o.x)/2:o.x, my=f?(f.y+o.y)/2:o.y;
  burst(mx,my,34,o.color,360,.5,3.8); burst(mx,my,16,"#ffffff",220,.3,2.6);
  ring(mx,my,o.color); ring(mx,my,"#ffffff");
  G.shake=Math.min(20,G.shake+12); G.flash=.3; G.hitstop=.1; SFX.hit();
  if(typeof fxPush==="function"&&FX_NET){fxPush({t:"shake",v:12});fxPush({t:"flash",v:.3});}
}

function checkFall(f){
  if(f.dead||f.kb>0)return;
  const h=fHex(f);
  if(!alive(h.q,h.r)){
    f.dead=true; f.fall=0; SFX.fall(); G.shake=Math.min(12,G.shake+5);
    if(typeof fxPush==="function"&&FX_NET)fxPush({t:"shake",v:5});
    burst(f.x,f.y,20,f.color,150,.6,3);
    // the money shot: slow time, zoom, ride the fall down
    if(G.kind==="match"){G.hitstop=.09; G.slow=.26; G.focus=f;}
  }
}
