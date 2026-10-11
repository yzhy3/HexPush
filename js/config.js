"use strict";
/* Tunables, palettes and persisted preferences. No behaviour lives here. */

const THEMES={
 "Neon Grid":   {bg:["#080b1c","#03040c"],top:"#1a2450",side:"#0a0f2a",edge:"#2de2e6",glow:"#4a7cff",acc:"#ff2fb9"},
 "Crystal Cavern":{bg:["#07131c","#02070d"],top:"#123049",side:"#08131f",edge:"#7fe9ff",glow:"#5fb7ff",acc:"#b98cff"},
 "Lava Core":   {bg:["#180604","#080202"],top:"#33130a",side:"#170806",edge:"#ff6a1f",glow:"#ff8b3d",acc:"#ffd166"},
 "Sky Temple":  {bg:["#0d1428","#050810"],top:"#222d52","side":"#111730",edge:"#ffe6a8",glow:"#8fd3ff",acc:"#ffd9f0"},
 "Cyber Arena": {bg:["#0d0518","#040209"],top:"#251140",side:"#120722",edge:"#b14cff",glow:"#8a3cff",acc:"#21f3a3"}
};
const COLORS={Blue:"#3ba9ff",Red:"#ff4d5a",Purple:"#b06bff",Green:"#35e08a",Orange:"#ff9b3d",White:"#eef3ff"};
const SIZES={Tiny:2,Small:3,Medium:4};
const SPEEDS={Normal:1,Fast:1.22,Turbo:1.5};

// Bot skill knobs. react = decision delay (s), miss = mistake rate, edge = edge awareness.
const DIFF={
 Easy:  {react:.40,aggro:.32,guard:.10,dash:.15,miss:.38,edge:.30,combo:.05},
 Normal:{react:.22,aggro:.55,guard:.30,dash:.40,miss:.16,edge:.70,combo:.30},
 Hard:  {react:.11,aggro:.75,guard:.55,dash:.65,miss:.06,edge:.94,combo:.65},
 Insane:{react:.05,aggro:.92,guard:.72,dash:.85,miss:.015,edge:1.0,combo:.9}
};
// Rolled fresh every match; offsets are added on top of the difficulty knobs.
const PERSONAS={
 Aggressive:{aggro:.25,guard:-.15,dash:.15,dist:-8,name:"Ravager"},
 Defensive: {aggro:-.18,guard:.25,dash:0,  dist:14, name:"Bulwark"},
 Patient:   {aggro:-.08,guard:.12,dash:-.1,dist:8,  name:"Sentinel"},
 Trickster: {aggro:.05,guard:.05,dash:.3, dist:4,  name:"Jester"}
};
const LOSE_MSG=["So close...","One more push.","Try again.","You had them.","The edge is patient.","Read the swing next time."];

const HS=46;                    // hex radius (px, flat-top)
const SQ3=Math.sqrt(3);
const HEXD=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const SPD=205, DASHSPD=690;     // fighter walk / dash speed (px/s)

//------------------------------------------------------------ persistence
const CFG=Object.assign({diff:"Normal",size:"Small",theme:"Neon Grid",speed:"Normal",color:"Blue",joy:"On"},
  JSON.parse(localStorage.getItem("hexpush")||"{}"));
const saveCfg=()=>localStorage.setItem("hexpush",JSON.stringify(CFG));
// flag("seen") reads, flag("seen",1) writes. Used for the one-time welcome + rookie match.
const flag=(k,v)=>v===undefined?localStorage.getItem("hexpush_"+k)==="1":localStorage.setItem("hexpush_"+k,"1");

//------------------------------------------------------------ palette helpers
function hueOf(h){
  const r=parseInt(h.substr(1,2),16)/255,g=parseInt(h.substr(3,2),16)/255,b=parseInt(h.substr(5,2),16)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn; if(!d)return 0;
  let x = mx===r?((g-b)/d+6)%6 : mx===g?(b-r)/d+2 : (r-g)/d+4; return x*60;
}
// the bot always takes the most hue-distant colour from the player's pick
function pickContrast(hex){
  const arr=Object.values(COLORS), h0=hueOf(hex); let best=arr[0],bd=-1;
  for(const c of arr){let d=Math.abs(((hueOf(c)-h0+540)%360)-180);
    if(c==="#eef3ff"&&hex==="#eef3ff")d=-1;
    if(d>bd){bd=d;best=c;}}
  return best;
}
