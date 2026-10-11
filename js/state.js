"use strict";
/* Shared runtime state: the DOM shortcut, the canvas, the screen mode and the
   single mutable game object `G` that every other module reads and writes. */

const el=id=>document.getElementById(id);

//------------------------------------------------------------ canvas
const CV=el("cv"),ctx=CV.getContext("2d");
let W=0,H=0,DPR=1;
function resize(){
  DPR=Math.min(devicePixelRatio||1,2); W=innerWidth; H=innerHeight;
  CV.width=W*DPR|0; CV.height=H*DPR|0; ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener("resize",resize); resize();

//------------------------------------------------------------ game state
let mode="menu";                // menu | intro | play | paused | over

const G={
  tiles:new Map(),theme:THEMES["Neon Grid"],sp:1,radius:3,
  p:null,b:null,parts:[],conf:[],time:0,introT:0,endT:0,win:false,
  cam:{x:0,y:0,z:1,tz:1},shake:0,nextCrumble:0,tick:0,persona:"Aggressive",diffP:DIFF.Normal,flash:0,
  kind:"match",tut:null,hitstop:0,slow:1,focus:null,rookie:false
};

// drifting hexes behind the menus
const MENU=[];
for(let i=0;i<26;i++)MENU.push({x:Math.random(),y:Math.random(),s:18+Math.random()*46,
  vy:.006+Math.random()*.018,rot:Math.random()*6.28,vr:(Math.random()-.5)*.4,a:.05+Math.random()*.12});
