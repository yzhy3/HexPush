"use strict";
/* The platform: building it, querying it, and shrinking it over time. */

const alive=(q,r)=>{const t=G.tiles.get(key(q,r));return t&&t.alive;};

function buildArena(){
  G.tiles.clear();
  const R=G.radius;
  for(let q=-R;q<=R;q++)for(let r=Math.max(-R,-q-R);r<=Math.min(R,-q+R);r++){
    const c=hexC(q,r);
    G.tiles.set(key(q,r),{q,r,x:c.x,y:c.y,alive:true,warn:0,warnMax:0,col:0,sd:Math.random()*6.28,bob:Math.random()*6.28});
  }
}
function aliveTiles(){const a=[];G.tiles.forEach(t=>{if(t.alive&&!t.warn)a.push(t)});return a;}
function nbAlive(t){let n=0;for(const[dq,dr]of HEXD)if(alive(t.q+dq,t.r+dr))n++;return n;}

function arenaCenter(){let x=0,y=0,n=0;G.tiles.forEach(t=>{if(t.alive){x+=t.x;y+=t.y;n++}});return n?{x:x/n,y:y/n}:{x:0,y:0};}

// unit vector from f toward the closest hole/outside — the AI's edge sense
function edgeDir(f){
  const h=fHex(f); let bx=0,by=0,bd=1e9;
  for(let i=0;i<6;i++){
    let q=h.q,r=h.r,steps=0;
    while(steps<8&&alive(q,r)){q+=HEXD[i][0];r+=HEXD[i][1];steps++;}
    if(steps<bd){bd=steps;const c=hexC(HEXD[i][0],HEXD[i][1]);const m=Math.hypot(c.x,c.y);bx=c.x/m;by=c.y/m;}
  }
  if(bd>=8){const c=arenaCenter();const dx=f.x-c.x,dy=f.y-c.y,m=Math.hypot(dx,dy)||1;return{x:dx/m,y:dy/m};}
  return {x:bx,y:by};
}

// flag 1-2 tiles as about to fall
function crumbleStep(){
  const list=aliveTiles();
  if(list.length<=4)return;
  // prefer outer tiles (fewest alive neighbours), with randomness so no two matches repeat
  list.forEach(t=>t._s=nbAlive(t)+Math.random()*2.2);
  list.sort((a,b)=>a._s-b._s);
  const n=list.length>22?2:1;
  for(let i=0;i<n&&i<list.length;i++){
    const t=list[i]; t.warn=1; t.warnMax=1.7/G.sp;
  }
  SFX.crack();
}
// countdown of warned tiles, then collapse + fall-away animation
function tilesUpdate(dt){
  G.tiles.forEach(t=>{
    t.bob+=dt;
    if(t.warn>0&&t.alive){
      t.warn-=dt/t.warnMax*1;
      if(t.warn<=0){t.alive=false;t.col=.001;SFX.crack();burst(t.x,t.y,8,G.theme.edge,80,.5,2.4);}
    }
    if(!t.alive&&t.col<3)t.col+=dt;
  });
}
