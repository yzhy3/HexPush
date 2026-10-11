"use strict";
/* Spawning and stepping of everything purely cosmetic: impact particles,
   expanding rings, victory confetti, screen shake and impact flash. */

function burst(x,y,n,col,spd,life,size){
  for(let i=0;i<n;i++){const a=Math.random()*6.28,s=spd*(.3+Math.random());
    G.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:life*(.6+Math.random()*.7),m:life,c:col,s:size*(.5+Math.random()),g:0});}
}
function ring(x,y,col){G.parts.push({ring:1,x,y,r:6,l:.42,m:.42,c:col});}

function confettiBurst(n){
  for(let i=0;i<n;i++)G.conf.push({x:Math.random()*W,y:-20-Math.random()*H*.5,
    vx:(Math.random()-.5)*180,vy:120+Math.random()*320,r:Math.random()*6.28,vr:(Math.random()-.5)*9,
    w:5+Math.random()*8,h:8+Math.random()*12,l:2.6+Math.random()*1.8,
    c:["#ffd86b","#ff7bd5","#6fe3ff","#8dff9c","#fff"][Math.random()*5|0]});
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
