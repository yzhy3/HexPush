"use strict";
/* The match bot. Re-decides only every `react` seconds so it never feels like
   it is reading inputs — difficulty and personality are just knob offsets. */

function botThink(f,o,dt){
  const D=G.diffP,P=PERSONAS[G.persona],A=f.ai;
  A.t-=dt;
  if(A.t>0)return;
  A.t=D.react*(.7+Math.random()*.6);

  const aggro=Math.min(.98,D.aggro+P.aggro), gch=Math.max(0,D.guard+P.guard);
  const dch=Math.max(0,D.dash+P.dash), ideal=52+P.dist;
  const dx=o.x-f.x,dy=o.y-f.y,dist=Math.hypot(dx,dy)||1;
  const cen=arenaCenter();

  // 1. self-preservation: on/near a doomed or edge tile -> retreat inward
  const mh=fHex(f), mt=G.tiles.get(key(mh.q,mh.r));
  const danger=!mt||!mt.alive||mt.warn>0||nbAlive(mt||{q:0,r:0})<=3;
  if(danger&&Math.random()<D.edge){
    let tx=cen.x,ty=cen.y;
    A.mx=(tx-f.x);A.my=(ty-f.y);normA(A);
    A.wantDash=Math.random()<dch*.8&&Math.hypot(tx-f.x,ty-f.y)>70;
    A.wantGuard=0;
    if(dist<58&&f.atkCd<=0&&Math.random()<aggro)A.wantAtk=true;
    return;
  }

  // 2. edge control: stand on the side of the enemy opposite their nearest edge
  const push=edgeDir(o);                       // unit vector: enemy -> nearest fall
  let tx=o.x-push.x*ideal, ty=o.y-push.y*ideal;
  if(G.persona==="Trickster"&&Math.random()<.3){const a=Math.random()*6.28;tx=o.x+Math.cos(a)*ideal;ty=o.y+Math.sin(a)*ideal;}
  if(Math.random()<D.miss){tx+=(Math.random()-.5)*220;ty+=(Math.random()-.5)*220;}   // mistakes
  A.mx=tx-f.x;A.my=ty-f.y;normA(A);

  // 3. guard when the enemy is winding up close
  A.wantGuard=0;
  if(dist<74&&o.atkPh==="wind"&&Math.random()<gch)A.wantGuard=1;
  else if(G.persona==="Defensive"&&dist<60&&Math.random()<gch*.4)A.wantGuard=1;

  // 4. attack
  A.wantAtk=false;
  const facing=Math.abs(angDiff(Math.atan2(dy,dx),f.face))<1.0;
  const inRange=dist<44+ideal*.18;
  if(f.atkCd<=0&&inRange&&facing&&!A.wantGuard){
    if(o.stagger>0&&Math.random()<D.combo+.3)A.wantAtk=true;              // punish
    else if(o.guard&&Math.random()>D.combo)A.wantAtk=false;               // don't feed guard
    else if(Math.random()<aggro)A.wantAtk=true;
  }
  if(Math.random()<D.miss*.4&&f.atkCd<=0&&dist<150)A.wantAtk=true;        // whiff

  // 5. dash to close / reposition
  A.wantDash=false;
  if(f.dashCd<=0){
    if(dist>150&&Math.random()<dch)A.wantDash=true;
    else if(G.persona==="Trickster"&&Math.random()<dch*.35)A.wantDash=true;
    else if(o.stagger>0&&dist>70&&Math.random()<dch+.2)A.wantDash=true;   // combo closer
  }
}
