"use strict";
/* Boot: the render loop plus a hex-math self-check that logs to the console. */

let last=0;
function frame(t){
  const rdt=Math.min(.05,last?(t-last)/1000:.016); last=t;
  requestAnimationFrame(frame);
  if(G.hitstop>0){G.hitstop-=rdt;render();return;}       // freeze frame on impact
  G.slow+=(1-G.slow)*Math.min(1,rdt*1.5);                // slow-mo eases back to normal
  update(rdt*G.slow); render();
}
requestAnimationFrame(frame);

// hex maths is the only logic subtle enough to break silently — check it on load
(function selfTest(){
  const bad=[];
  for(let q=-4;q<=4;q++)for(let r=-4;r<=4;r++){
    const c=hexC(q,r), h=pixHex(c.x,c.y);
    if(h.q!==q||h.r!==r)bad.push([q,r,h.q,h.r]);
  }
  // every neighbour direction must round-trip to its own index
  for(let i=0;i<6;i++)if(dirFromAngle(DIRA[i])!==i)bad.push(["dir",i]);
  // a point nudged toward a neighbour must land on that neighbour
  for(let i=0;i<6;i++){
    const c=hexC(HEXD[i][0],HEXD[i][1]), h=pixHex(c.x*.9,c.y*.9);
    if(h.q!==HEXD[i][0]||h.r!==HEXD[i][1])bad.push(["nudge",i,h.q,h.r]);
  }
  console[bad.length?"error":"log"]("HexPush hex-math self-check:",bad.length?bad:"OK");
})();
