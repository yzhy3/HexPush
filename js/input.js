"use strict";
/* Keyboard, mouse and touch. Everything funnels into fighter.ai so the player
   and the bot drive the simulation through exactly the same fields.

   Two rules keep this deterministic:
   1. `keys` holds PHYSICAL held state only — nothing but a keyup, or resetInput(),
      may clear it. Edge-triggered actions live in `edge` and are consumed once.
   2. Any time we cannot trust the held state any more (focus loss, tab hidden,
      match start, leaving to the menu) we call resetInput() and start clean. */

const keys={};                                 // code -> held right now
const edge={atk:false,dash:false};             // one-shot intents, consumed by playerInput
const TOUCH=matchMedia("(pointer:coarse)").matches||"ontouchstart" in window;
let mouseGuard=false,tGuard=false;
let joy={id:null,ox:0,oy:0,dx:0,dy:0};

// The single authoritative "forget everything" — the fix for stuck keys, stuck
// guards and stranded joystick drags. Cheap, so call it liberally.
function resetInput(){
  for(const k in keys)delete keys[k];
  edge.atk=edge.dash=false;
  mouseGuard=tGuard=false;
  joyRelease();
  ["bAtk","bDash","bGrd"].forEach(id=>el(id).classList.remove("hold"));
}
// Drop queued one-shots without touching held state — used when play is suspended,
// so a dash pressed on the way into the pause menu does not fire on resume.
function dropPendingInput(){edge.atk=edge.dash=false;}

// A keyup can never arrive while we are not focused, so assume nothing is held.
addEventListener("blur",resetInput);
addEventListener("pagehide",resetInput);
document.addEventListener("visibilitychange",()=>{if(document.hidden)resetInput();});

//------------------------------------------------------------ keyboard + mouse
addEventListener("keydown",e=>{
  if(e.code==="Space")e.preventDefault();      // stop the page scrolling
  if(e.repeat)return;                          // auto-repeat is not a new press
  keys[e.code]=true;
  if(e.code==="Escape"&&(mode==="play"||mode==="paused")){togglePause();return;}
  if(mode==="play"&&e.code==="Space")edge.dash=true;   // only sample intent while live
});
addEventListener("keyup",e=>{delete keys[e.code];});

// right-click is guard, so no context menu anywhere — if one opens over the HUD
// it swallows the mouseup and the guard latches on forever
document.addEventListener("contextmenu",e=>e.preventDefault());
CV.addEventListener("mousedown",e=>{audioInit();if(mode!=="play")return;
  if(e.button===0)edge.atk=true; if(e.button===2)mouseGuard=true;});
// window-level release, and a catch-all in case the button comes up off-screen
addEventListener("mouseup",e=>{if(e.button===2)mouseGuard=false;});
addEventListener("pointerup",e=>{if(e.pointerType==="mouse"&&e.button===2)mouseGuard=false;});
addEventListener("pointercancel",()=>{mouseGuard=false;});

//------------------------------------------------------------ touch pad
const padEl=el("pad"),stickEl=el("stick");
const jbase=el("jbase"),jknob=el("jknob");
const JR=52;                                   // knob travel radius (matches input clamp)

// purely cosmetic: the stick still originates wherever the thumb lands
function joyDraw(){
  const r=stickEl.getBoundingClientRect();
  const bx=joy.id!==null?joy.ox-r.left:110, by=joy.id!==null?joy.oy-r.top:r.height-124;
  jbase.style.left=bx+"px"; jbase.style.top=by+"px";
  jknob.style.left=(bx+joy.dx*JR)+"px"; jknob.style.top=(by+joy.dy*JR)+"px";
}
function joyRelease(){
  joy.id=null;joy.dx=0;joy.dy=0;
  stickEl.classList.remove("act");
  joyDraw();
}
function padVisible(v){
  const on=!!v&&mode!=="menu";
  // hiding the pad kills any in-flight drag, so drop it rather than leave it stuck
  if(!on)joyRelease();
  padEl.classList.toggle("on",on);
  stickEl.classList.toggle("show",on&&TOUCH&&CFG.joy==="On");
  joyDraw();
}
addEventListener("resize",joyDraw);

function bindHold(id,down,up){
  const btn=el(id);
  btn.addEventListener("touchstart",e=>{e.preventDefault();audioInit();btn.classList.add("hold");down();},{passive:false});
  btn.addEventListener("touchend",e=>{e.preventDefault();btn.classList.remove("hold");up&&up();},{passive:false});
  btn.addEventListener("touchcancel",()=>{btn.classList.remove("hold");up&&up();});
}
bindHold("bAtk",()=>{if(mode==="play")edge.atk=true;});
bindHold("bDash",()=>{if(mode==="play")edge.dash=true;});
bindHold("bGrd",()=>tGuard=true,()=>tGuard=false);

stickEl.addEventListener("touchstart",e=>{e.preventDefault();audioInit();
  const t=e.changedTouches[0];joy.id=t.identifier;joy.ox=t.clientX;joy.oy=t.clientY;joy.dx=0;joy.dy=0;
  stickEl.classList.add("act");joyDraw();},{passive:false});
stickEl.addEventListener("touchmove",e=>{e.preventDefault();
  for(const t of e.changedTouches)if(t.identifier===joy.id){
    let dx=t.clientX-joy.ox,dy=t.clientY-joy.oy,d=Math.hypot(dx,dy)||1,m=Math.min(d,JR)/JR;
    joy.dx=dx/d*m;joy.dy=dy/d*m;joyDraw();}},{passive:false});
const jEnd=e=>{for(const t of e.changedTouches)if(t.identifier===joy.id)joyRelease();};
stickEl.addEventListener("touchend",jEnd);stickEl.addEventListener("touchcancel",jEnd);

//------------------------------------------------------------ merged into the fighter
// Pure sample of the CURRENT input state — no history, no accumulation. Called
// once per simulation step, immediately before the fighter is stepped.
function playerInput(f){
  let mx=0,my=0;
  if(keys.KeyW||keys.ArrowUp)my--; if(keys.KeyS||keys.ArrowDown)my++;
  if(keys.KeyA||keys.ArrowLeft)mx--; if(keys.KeyD||keys.ArrowRight)mx++;
  mx+=joy.dx; my+=joy.dy;
  const m=Math.hypot(mx,my); if(m>1){mx/=m;my/=m;}
  f.ai.mx=mx;f.ai.my=my;
  f.ai.wantAtk=edge.atk;  edge.atk=false;      // consume-once, so a press is never
  f.ai.wantDash=edge.dash;edge.dash=false;     // replayed on a later frame
  f.ai.wantGuard=(mouseGuard||tGuard||keys.ShiftLeft||keys.KeyK)?1:0;
}
