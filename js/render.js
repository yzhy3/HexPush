"use strict";
/* All canvas drawing. Reads state, never mutates it. */

//------------------------------------------------------------ colour utils
function shade(hex,amt){
  const n=parseInt(hex.slice(1),16);
  let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const f=x=>Math.max(0,Math.min(255,Math.round(amt<0?x*(1+amt):x+(255-x)*amt)));
  return "rgb("+f(r)+","+f(g)+","+f(b)+")";
}
function mix(a,b,t){
  const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16);
  const r=Math.round(((A>>16)&255)*(1-t)+((B>>16)&255)*t);
  const g=Math.round(((A>>8)&255)*(1-t)+((B>>8)&255)*t);
  const c=Math.round((A&255)*(1-t)+(B&255)*t);
  return "rgb("+r+","+g+","+c+")";
}
function hexPath(cx,cy,s){
  ctx.beginPath();
  for(let i=0;i<6;i++){const a=i*Math.PI/3, x=cx+Math.cos(a)*s, y=cy+Math.sin(a)*s;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.closePath();
}

//------------------------------------------------------------ frame
function render(){
  const T=G.theme;
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,T.bg[0]);g.addColorStop(1,T.bg[1]);
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

  if(mode==="menu"){renderMenuBG();renderVig();return;}

  ctx.save();
  const sh=G.shake;
  ctx.translate(W/2+(Math.random()-.5)*sh,H/2+(Math.random()-.5)*sh);
  ctx.scale(G.cam.z,G.cam.z);
  ctx.translate(-G.cam.x,-G.cam.y);

  // ---- attack range preview: the hexes a wind-up will reach
  const prev=new Map();
  for(const f of [G.p,G.b]){
    if(f.dead||(f.atkPh!=="wind"&&f.atkPh!=="hit"))continue;
    const h=fHex(f), d=dirFromAngle(f.face);
    for(const [o,a] of [[0,.5],[1,.18],[5,.18]]){
      const i=(d+o)%6, k=key(h.q+HEXD[i][0],h.r+HEXD[i][1]);
      if(!prev.has(k))prev.set(k,{c:f.color,a:a*(f.atkPh==="hit"?.6:1)});
    }
  }
  // ---- tiles
  const tl=[...G.tiles.values()].sort((a,b)=>a.y-b.y);
  for(const t of tl){
    if(!t.alive&&t.col>2.2)continue;
    let ox=0,oy=0,al=1,rot=0,sc=1;
    if(!t.alive){const c=t.col;oy=c*c*420;al=Math.max(0,1-c/1.6);rot=c*.8*(t.sd>3?1:-1);sc=Math.max(.3,1-c*.25);}
    else if(t.warn>0){const s=(1-t.warn)*14;ox=(Math.random()-.5)*s;oy=(Math.random()-.5)*s;}
    oy+=Math.sin(t.bob*.9+t.sd)*2.2;
    ctx.save(); ctx.globalAlpha=al; ctx.translate(t.x+ox,t.y+oy);
    if(rot){ctx.rotate(rot);ctx.scale(sc,sc);}
    // extruded side
    hexPath(0,15,HS-2.5); ctx.fillStyle=T.side; ctx.fill();
    // top
    hexPath(0,0,HS-2.5);
    const warn=t.warn>0?1-t.warn:0;
    if(warn>0){
      const pulse=.35+.65*Math.abs(Math.sin(G.time*13+t.sd));
      ctx.fillStyle=mix(T.top,T.acc,.25+.5*warn*pulse);
    } else ctx.fillStyle=T.top;
    ctx.fill();
    const pv=t.alive&&prev.get(key(t.q,t.r));
    if(pv){ctx.globalAlpha=al*pv.a;ctx.fillStyle=pv.c;ctx.fill();ctx.globalAlpha=al;}
    ctx.lineWidth=2; ctx.strokeStyle=warn>0?T.acc:T.edge;
    ctx.globalAlpha=al*(warn>0?.55+.45*Math.abs(Math.sin(G.time*13+t.sd)):.34);
    ctx.shadowColor=warn>0?T.acc:T.glow; ctx.shadowBlur=warn>0?24:12; ctx.stroke();
    ctx.shadowBlur=0; ctx.globalAlpha=al;
    // cracks during warning
    if(warn>.35){
      ctx.strokeStyle="rgba(0,0,0,.55)";ctx.lineWidth=1.6;ctx.beginPath();
      for(let i=0;i<3;i++){const a=t.sd+i*2.1;
        ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*HS*.75,Math.sin(a)*HS*.75);}
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- fighters (back to front)
  const fs=[G.p,G.b].sort((a,b)=>a.y-b.y);
  for(const f of fs)drawFighter(f,T);

  // ---- particles
  for(const p of G.parts){
    const a=Math.max(0,p.l/p.m);
    if(p.ring){ctx.globalAlpha=a*.8;ctx.strokeStyle=p.c;ctx.lineWidth=3.5*a+1;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.29);ctx.stroke();}
    else{ctx.globalAlpha=a;ctx.fillStyle=p.c;ctx.shadowColor=p.c;ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(p.x,p.y,p.s*a+.6,0,6.29);ctx.fill();ctx.shadowBlur=0;}
  }
  ctx.globalAlpha=1;
  ctx.restore();

  if(G.flash>0){ctx.fillStyle="rgba(255,255,255,"+(G.flash*.5)+")";ctx.fillRect(0,0,W,H);}
  // confetti (screen space)
  for(const c of G.conf){
    ctx.save();ctx.globalAlpha=Math.min(1,c.l);ctx.translate(c.x,c.y);ctx.rotate(c.r);
    ctx.fillStyle=c.c;ctx.fillRect(-c.w/2,-c.h/2,c.w,c.h*Math.abs(Math.cos(c.r)));ctx.restore();
  }
  ctx.globalAlpha=1;
  renderVig();
}

function drawFighter(f,T){
  const R=15;
  if(f.dead&&f.fall>.9)return;
  ctx.save();
  let fy=0,fs=1,fa=1;
  if(f.dead){const t=f.fall;fy=t*t*900;fs=Math.max(0,1-t*.9);fa=Math.max(0,1-t*1.1);}
  ctx.globalAlpha=fa;
  // dash trail
  for(const t of f.trail){ctx.globalAlpha=fa*t.l*1.6;ctx.fillStyle=f.color;
    ctx.beginPath();ctx.arc(t.x,t.y+fy,R*t.l*3.2,0,6.29);ctx.fill();}
  ctx.globalAlpha=fa;
  // shadow
  if(!f.dead){ctx.fillStyle="rgba(0,0,0,.4)";ctx.beginPath();
    ctx.ellipse(f.x,f.y+16,R*.95,R*.4,0,0,6.29);ctx.fill();}

  ctx.translate(f.x,f.y+fy);
  ctx.scale(fs,fs);
  if(f.dead)ctx.rotate(f.fall*3.4);
  const br=1+Math.sin(f.breath)*.035;
  let sx=br,sy=br;
  if(f.squash>0){sx=1+f.squash*.35;sy=1-f.squash*.25;}
  if(f.atkPh==="wind"){sx=.86;sy=1.12;}
  if(f.atkPh==="hit"){sx=1.22;sy=.88;}
  if(f.stagger>0){ctx.rotate(Math.sin(f.stagger*40)*.16);}

  // guard bubble
  if(f.guard){
    ctx.strokeStyle="#dff2ff";ctx.lineWidth=3;ctx.globalAlpha=fa*(.5+.35*Math.sin(G.time*18));
    ctx.shadowColor="#9fd8ff";ctx.shadowBlur=20;
    ctx.beginPath();ctx.arc(0,0,R+11,0,6.29);ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=fa;
    ctx.fillStyle="rgba(150,215,255,.13)";ctx.beginPath();ctx.arc(0,0,R+11,0,6.29);ctx.fill();
  }
  // attack arc
  if(f.atkPh==="hit"){
    ctx.save();ctx.rotate(f.face);
    const w=f.whiff, gg=ctx.createLinearGradient(0,0,64,0);   // whiff = thin, pale swish
    gg.addColorStop(0,w?"rgba(200,225,255,.3)":"rgba(255,255,255,.9)");
    gg.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=gg;ctx.beginPath();ctx.moveTo(0,0);
    ctx.arc(0,0,w?58:66,w?-.42:-.9,w?.42:.9);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  // dash charge ring — player only, glows when ready
  if(!f.isBot&&!f.dead){
    const k=Math.min(1,1-f.dashCd/1.35), rdy=k>=1;
    ctx.save();
    ctx.lineWidth=3.2;ctx.lineCap="round";
    ctx.strokeStyle="rgba(120,160,220,.22)";
    ctx.beginPath();ctx.arc(0,0,R+12,0,6.283);ctx.stroke();
    ctx.strokeStyle=rdy?"#8ee6ff":"#5f86c8";
    ctx.globalAlpha=rdy?.6+.3*Math.sin(G.time*7):.9;
    if(rdy){ctx.shadowColor="#8ee6ff";ctx.shadowBlur=14;}
    ctx.beginPath();ctx.arc(0,0,R+12,-Math.PI/2,-Math.PI/2+6.283*k);ctx.stroke();
    ctx.restore();
  }
  ctx.save();ctx.rotate(f.face);ctx.scale(sx,sy);ctx.rotate(-f.face);
  // body
  ctx.shadowColor=f.color;ctx.shadowBlur=26;
  hexPath(0,0,R);
  const bg=ctx.createRadialGradient(-4,-6,2,0,0,R*1.2);
  bg.addColorStop(0,"#ffffff");bg.addColorStop(.45,f.color);bg.addColorStop(1,shade(f.color,-.45));
  ctx.fillStyle=bg;ctx.fill();
  ctx.shadowBlur=0;ctx.lineWidth=2.2;ctx.strokeStyle="rgba(255,255,255,.75)";ctx.stroke();
  ctx.restore();
  // facing nub
  ctx.rotate(f.face);
  ctx.fillStyle="#fff";ctx.globalAlpha=fa*.95;
  ctx.beginPath();ctx.moveTo(R+2,0);ctx.lineTo(R-4,-5);ctx.lineTo(R-4,5);ctx.fill();
  ctx.restore();
  ctx.globalAlpha=1;

  // stagger stars
  if(f.stagger>.05&&!f.dead){
    ctx.globalAlpha=Math.min(1,f.stagger*2.5);ctx.fillStyle="#ffe27a";
    for(let i=0;i<3;i++){const a=G.time*9+i*2.1;
      ctx.beginPath();ctx.arc(f.x+Math.cos(a)*15,f.y-26+Math.sin(a)*5,2.6,0,6.29);ctx.fill();}
    ctx.globalAlpha=1;
  }
  // "you" marker
  if(!f.isBot&&!f.dead){
    ctx.globalAlpha=.75;ctx.fillStyle=f.color;
    const b=Math.sin(G.time*4)*2.5;
    ctx.beginPath();ctx.moveTo(f.x,f.y-30+b);ctx.lineTo(f.x-6,f.y-39+b);ctx.lineTo(f.x+6,f.y-39+b);ctx.fill();
    ctx.globalAlpha=1;
  }
}

function renderMenuBG(){
  const T=THEMES[CFG.theme]||THEMES["Neon Grid"];
  for(const m of MENU){
    ctx.save();ctx.translate(m.x*W,m.y*H);ctx.rotate(m.rot);
    ctx.globalAlpha=m.a;ctx.strokeStyle=T.edge;ctx.lineWidth=2;
    ctx.shadowColor=T.glow;ctx.shadowBlur=22;
    hexPath(0,0,m.s);ctx.stroke();
    ctx.globalAlpha=m.a*.28;ctx.fillStyle=T.glow;ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
function renderVig(){
  const v=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.78);
  v.addColorStop(0,"rgba(0,0,0,0)");v.addColorStop(1,"rgba(0,0,0,.62)");
  ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
}
