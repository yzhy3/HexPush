"use strict";
/* Flat-top hex grid maths (axial q,r) plus two angle helpers. Pure functions. */

const key=(q,r)=>q+","+r;
const hexC=(q,r)=>({x:HS*1.5*q, y:HS*SQ3*(r+q/2)});

// world pixel -> nearest hex, via cube rounding
function pixHex(x,y){
  const q=(2/3*x)/HS, r=(-x/3+SQ3/3*y)/HS;
  let X=q,Z=r,Y=-X-Z, rx=Math.round(X),ry=Math.round(Y),rz=Math.round(Z);
  const dx=Math.abs(rx-X),dy=Math.abs(ry-Y),dz=Math.abs(rz-Z);
  if(dx>dy&&dx>dz)rx=-ry-rz; else if(dy>dz)ry=-rx-rz; else rz=-rx-ry;
  return {q:rx,r:rz};
}
// angle of each of the 6 neighbour directions
const DIRA=HEXD.map(([dq,dr])=>{const c=hexC(dq,dr);return Math.atan2(c.y,c.x);});
function dirFromAngle(a){
  let best=0,bd=9;
  for(let i=0;i<6;i++){let d=Math.abs(((a-DIRA[i]+Math.PI*3)%(Math.PI*2))-Math.PI);if(d<bd){bd=d;best=i;}}
  return best;
}
// shortest signed angle a-b, and in-place normalise of an ai move vector
const angDiff=(a,b)=>((a-b+Math.PI*3)%(Math.PI*2))-Math.PI;
const normA=A=>{const m=Math.hypot(A.mx,A.my)||1;A.mx/=m;A.my/=m;};

// Exponential smoothing factor for `v += (target-v)*smooth(k,dt)`.
// Frame-rate independent: `dt*k` is only correct at one refresh rate and can
// overshoot on a hitch, this converges identically at 30, 60 or 144 Hz.
const smooth=(k,dt)=>1-Math.exp(-k*dt);
