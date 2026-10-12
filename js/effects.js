"use strict";
/* Spawning and stepping of everything purely cosmetic: impact particles,
   expanding rings, victory confetti, screen shake and impact flash.

   When FX_NET is true (online host), every visual/SFX event is also queued so
   clients can replay the exact same effects in sync. */

let FX_NET=false;          // host sets true during online matches
let FX_QUEUE=[];           // pending events to broadcast
let FX_SEQ=0;
let FX_SEEN=new Set();     // client: already played event ids

function fxReset(){ FX_QUEUE.length=0; FX_SEQ=0; FX_SEEN.clear(); }

function fxPush(ev){
  if(!FX_NET)return;
  ev.id=++FX_SEQ;
  FX_QUEUE.push(ev);
  // keep queue bounded
  if(FX_QUEUE.length>40)FX_QUEUE.splice(0,FX_QUEUE.length-40);
}

function burst(x,y,n,col,spd,life,size){
  for(let i=0;i<n;i++){const a=Math.random()*6.28,s=spd*(.3+Math.random());
    G.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:life*(.6+Math.random()*.7),m:life,c:col,s:size*(.5+Math.random()),g:0});}
  fxPush({t:"burst",x,y,n,col,spd,life,size});
}
function ring(x,y,col){
  G.parts.push({ring:1,x,y,r:6,l:.42,m:.42,c:col});
  fxPush({t:"ring",x,y,col});
}

function confettiBurst(n){
  for(let i=0;i<n;i++)G.conf.push({x:Math.random()*W,y:-20-Math.random()*H*.5,
    vx:(Math.random()-.5)*180,vy:120+Math.random()*320,r:Math.random()*6.28,vr:(Math.random()-.5)*9,
    w:5+Math.random()*8,h:8+Math.random()*12,l:2.6+Math.random()*1.8,
    c:["#ffd86b","#ff7bd5","#6fe3ff","#8dff9c","#fff"][Math.random()*5|0]});
  fxPush({t:"confetti",n});
}

/** Play a networked FX event on a client without re-queueing. */
function fxPlay(ev){
  if(!ev||ev.id==null)return;
  if(FX_SEEN.has(ev.id))return;
  FX_SEEN.add(ev.id);
  // prune seen set
  if(FX_SEEN.size>200){
    const arr=[...FX_SEEN].slice(-80);
    FX_SEEN.clear();
    arr.forEach(id=>FX_SEEN.add(id));
  }
  const was=FX_NET; FX_NET=false; // prevent re-queue
  try{
    if(ev.t==="burst"){
      for(let i=0;i<(ev.n||10);i++){
        const a=Math.random()*6.28,s=(ev.spd||100)*(.3+Math.random());
        G.parts.push({x:ev.x,y:ev.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
          l:(ev.life||.4)*(.6+Math.random()*.7),m:ev.life||.4,c:ev.col||"#fff",
          s:(ev.size||3)*(.5+Math.random()),g:0});
      }
    }else if(ev.t==="ring"){
      G.parts.push({ring:1,x:ev.x,y:ev.y,r:6,l:.42,m:.42,c:ev.col||"#fff"});
    }else if(ev.t==="confetti"){
      confettiBurst(ev.n||80);
    }else if(ev.t==="sfx"&&ev.name&&SFX[ev.name]){
      SFX[ev.name]();
    }else if(ev.t==="shake"){
      G.shake=Math.min(20,(G.shake||0)+(ev.v||8));
    }else if(ev.t==="flash"){
      G.flash=Math.max(G.flash||0, ev.v||.25);
    }
  }finally{ FX_NET=was; }
}

function fxPlayMany(list){
  if(!list||!list.length)return;
  for(const ev of list)fxPlay(ev);
}

// runs every frame in every mode, so the menu keeps breathing too
function stepEffects(dt){
  MENU.forEach(m=>{m.y-=m.vy*dt*10;if(m.y<-.15){m.y=1.15;m.x=Math.random();}m.rot+=m.vr*dt;});
  for(let i=G.parts.length-1;i>=0;i--){const p=G.parts[i];p.l-=dt;
    if(p.ring)p.r+=dt*260; else{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.92;p.vy*=.92;}
    if(p.l<=0)G.parts.splice(i,1);}
  for(let i=G.conf.length-1;i>=0;i--){const c=G.conf[i];c.x+=c.vx*dt;c.y+=c.vy*dt;c.vy+=620*dt;c.r+=c.vr*dt;c.l-=dt;
    if(c.l<=0)G.conf.splice(i,1);}
  G.shake*=Math.pow(.0016,dt); G.flash=Math.max(0,G.flash-dt*5);
}
