"use strict";
/* Regression tests for the intermittent movement bugs.
   Run: node test/input.test.js      (no framework, no deps)

   Loads the real game scripts in the real order into a stubbed DOM, then drives
   the simulation directly. These lock in the invariants the intermittent bugs
   violated: input is never inherited, never latched, never outlives its key. */

const fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.join(__dirname,"..");

//------------------------------------------------------------ minimal DOM stub
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const order=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]);
const ids=[...html.matchAll(/\bid="([\w-]+)"/g)].map(m=>m[1]);

const mkCls=()=>{const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),
  toggle:(x,v)=>{v===undefined?(s.has(x)?s.delete(x):s.add(x)):(v?s.add(x):s.delete(x))},contains:x=>s.has(x)}};
const c2d=new Proxy({},{get:(t,k)=>(k==="createLinearGradient"||k==="createRadialGradient")
  ?()=>({addColorStop(){}}):()=>{},set:()=>true});
const mkEl=id=>({id,style:{},dataset:{},classList:mkCls(),innerHTML:"",textContent:"",title:"",
  appendChild(){},addEventListener(){},blur(){},getContext:()=>c2d,querySelectorAll:()=>[],
  getBoundingClientRect:()=>({left:0,top:0,width:400,height:400}),width:0,height:0});
const els={}; ids.forEach(i=>els[i]=mkEl(i));
const store={};
const sandbox={console,Math,JSON,Object,Array,Map,Set,Date,String,Number,Boolean,parseInt,parseFloat,isNaN,
  document:{getElementById:i=>els[i]||mkEl(i),createElement:()=>mkEl("new"),addEventListener(){},hidden:false,
    querySelectorAll:sel=>sel==="[data-k]"
      ?["diff","size","theme","speed","color","joy"].map(k=>{const e=mkEl("box");e.dataset.k=k;return e;}):[]},
  localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>store[k]=String(v)},
  matchMedia:()=>({matches:false}),addEventListener(){},setTimeout:()=>{},
  devicePixelRatio:1,innerWidth:1280,innerHeight:720,requestAnimationFrame:()=>1};
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox);
for(const f of order)vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),sandbox,{filename:f});

// top-level let/const live in the context's lexical scope, reachable only from
// another script in the same context — so poke the game through eval, not props
const run=code=>vm.runInContext(code,sandbox);

//------------------------------------------------------------ tiny test rig
let failed=0;
function test(name,fn){
  try{fn();console.log("  ok   "+name);}
  catch(e){failed++;console.log("  FAIL "+name+"\n       "+e.message);}
}
function assert(cond,msg){if(!cond)throw new Error(msg);}
const near=(a,b,eps,msg)=>assert(Math.abs(a-b)<=eps,msg+" (got "+a.toFixed(3)+", want ~"+b.toFixed(3)+")");

// practice mode: no bot AI, no crumbling, no win condition — a clean rig
function fresh(){
  run("startMatch('practice')");
  run("G.p.x=0;G.p.y=0;G.p.vx=G.p.vy=0;G.p.ix=G.p.iy=0;G.b.x=9999;G.b.y=9999;");
}
const step=(n,dt=1/60)=>run("for(let i=0;i<"+n+";i++)update("+dt+")");
const px=()=>run("G.p.x"), py=()=>run("G.p.y");

console.log("\nHex Push — input/movement regression");

//------------------------------------------------------------ tests
test("held key moves, release stops within one impulse decay",()=>{
  fresh();
  run("keys.KeyW=true"); step(30);
  assert(py()<-20,"holding W should move up, y="+py());
  run("delete keys.KeyW"); step(20);            // let residual bleed off
  const y=py(); step(60);
  near(py(),y,1.5,"released key must not keep moving the player");
});

test("focus loss clears held keys (alt-tab stuck-key bug)",()=>{
  fresh();
  run("keys.KeyD=true"); step(20);
  assert(px()>10,"holding D should move right");
  const atBlur=px();
  run("resetInput()");                          // what blur/visibilitychange fire
  step(20);                                     // deceleration ramp is allowed...
  const x=px();
  assert(x-atBlur<20,"post-blur slide should be a short stop, not "+(x-atBlur).toFixed(1)+"px");
  step(120);                                    // ...but after that, dead stop forever
  near(px(),x,0.5,"input must be released when the window loses focus");
});

test("no input produces zero drift",()=>{
  fresh();
  const x=px(),y=py(); step(180);
  near(px(),x,0.001,"idle drift in x"); near(py(),y,0.001,"idle drift in y");
});

test("a new match never inherits held keys",()=>{
  fresh();
  run("keys.KeyD=true;keys.Space=true");
  run("startMatch('practice')");
  assert(run("Object.keys(keys).length")===0,"keys survived the match restart");
  assert(run("edge.atk===false&&edge.dash===false"),"queued intents survived the restart");
});

test("dash is edge-triggered, not re-fired by key auto-repeat",()=>{
  fresh();
  run("edge.dash=true"); step(1);
  assert(run("G.p.dash>0||G.p.dashCd>0"),"dash should have started");
  assert(run("edge.dash===false"),"intent must be consumed exactly once");
  const cd=run("G.p.dashCd"); step(3);
  assert(run("G.p.dashCd")<cd,"a consumed intent must not keep re-arming the dash");
});

test("dash travel is bounded and fully stops",()=>{
  fresh();
  run("edge.dash=true;keys.KeyD=true"); step(1);
  run("delete keys.KeyD");
  step(60);                                     // 1s: dash plus its tail
  const x=px();
  assert(x<200,"a dash must not carry the player more than ~3 tiles, got "+x.toFixed(1)+"px");
  step(120);
  near(px(),x,0.5,"the player must come to a complete stop after a dash");
});

test("input steers through the dash tail (no lockout)",()=>{
  fresh();
  run("edge.dash=true;keys.KeyD=true"); step(1);   // dash right
  while(run("G.p.dash")>0)step(1);                 // the burst itself is a committed move
  run("delete keys.KeyD;keys.KeyA=true");          // the moment it ends, ask to go left
  step(6);
  assert(run("G.p.vx")<0,"control velocity must obey input while the tail decays");
  const x=px(); step(90);
  assert(px()<x,"holding left must actually pull the player back, "+x.toFixed(1)+" -> "+px().toFixed(1));
});

test("knockback recoil cannot invert the player's own input",()=>{
  fresh();
  run("G.p.ix=-400");                           // guard recoil, pointing -x
  run("keys.KeyD=true"); step(6);               // player asks to go +x
  assert(run("G.p.vx")>0,"control velocity must follow input, not the impulse");
  step(30);
  assert(px()>0,"player should end up moving the way they pressed, x="+px());
});

test("movement is frame-rate independent",()=>{
  fresh(); run("keys.KeyW=true"); step(60,1/60); const at60=py();
  fresh(); run("keys.KeyW=true"); step(144,1/144); const at144=py();
  fresh(); run("keys.KeyW=true"); step(30,1/30);  const at30=py();
  near(at144,at60,Math.abs(at60)*0.02,"144Hz travel differs from 60Hz");
  near(at30, at60,Math.abs(at60)*0.02,"30Hz travel differs from 60Hz");
});

test("guard/attack intents never latch on",()=>{
  fresh();
  run("mouseGuard=true"); step(2);
  assert(run("G.p.ai.wantGuard")===1,"guard should be held");
  run("resetInput()"); step(2);
  assert(run("G.p.ai.wantGuard")===0,"guard must release on reset");
  assert(run("G.p.guard")===false,"guard state must clear");
});

console.log(failed?"\n"+failed+" FAILED\n":"\nall passed\n");
process.exit(failed?1:0);
