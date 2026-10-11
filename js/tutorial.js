"use strict";
/* First-run tutorial: six steps that teach through play, plus the scripted
   opponent that backs them. Only runs when G.tut is set (kind === "tutorial"). */

const tutEl=el("tut");
let tutLast="";

function tutSay(html,sub){
  const s=html?html+(sub?"<small>"+sub+"</small>":""):"";
  if(s===tutLast)return; tutLast=s;
  tutEl.innerHTML=s; tutEl.classList.toggle("on",!!html);
}
function tutHi(id){                                     // spotlight one touch button
  ["bAtk","bDash","bGrd"].forEach(b=>{
    const btn=el(b);
    btn.classList.toggle("glow",b===id);
    btn.classList.toggle("dim",!!id&&b!==id);
  });
}
const K=s=>"<span class='tk'>"+s+"</span>";
function tutNext(){G.tut.step++;G.tut.t=0;G.tut.pushT=0;jbase.classList.remove("pulse");
  tone(760,.18,"triangle",.16,1140);tone(1140,.22,"sine",.1);}

function tutStep(dt){
  const T=G.tut,p=G.p,b=G.b;
  T.t+=dt;
  if(T.step<5){                                          // nobody dies while learning
    if(p.dead&&p.fall>.9)respawn(p,0,0);
    if(b.dead&&b.fall>.9)respawn(b,1,0);
  }else if(T.step===5&&p.dead&&p.fall>1.0){              // practice round: you get infinite tries
    respawn(p,0,0); tutLast=""; setCenter("");
  }
  switch(T.step){
   case 0:{                                              // MOVEMENT
     const h=fHex(p),k=key(h.q,h.r);
     if(k!==T.last){T.last=k;T.n++;}
     tutSay(TOUCH?"Drag the joystick to move.":
       "Move with "+K("W")+K("A")+K("S")+K("D")+" or the arrow keys.",
       "Tiles crossed "+Math.min(T.n-1,4)+" / 4");
     tutHi(null); jbase.classList.toggle("pulse",TOUCH);
     if(T.n>=5)tutNext();
     break;}
   case 1:{                                              // PUSH
     tutHi("bAtk");
     tutSay("<b>Attack</b> to push enemies. Get close and swing."+
       (TOUCH?" Tap <b>PUSH</b>.":" Press "+K("Left Click")+"."),
       T.misses?"Get closer — you have to be one tile away":"Land 1 hit");
     if(T.hits>=1){G.flash=.35;burst(b.x,b.y,26,"#ffffff",280,.5,3.2);tutNext();}
     break;}
   case 2:{                                              // THE GOAL
     tutSay("Every hit pushes the enemy <b>exactly one hex</b>.<br>Push your opponent <b>off the arena</b> to win.",
       "Watch");
     tutHi(null);
     T.pushT-=dt;
     if(T.pushT<=0&&T.t<3.4&&!b.dead&&b.kb<=0){
       T.pushT=.85;
       const c=arenaCenter();
       pushBack(b,Math.atan2(b.y-c.y,b.x-c.x)||0,null);   // shove the dummy toward the rim
     }
     if(T.t>4.6)tutNext();
     break;}
   case 3:{                                              // DASH
     tutHi("bDash");
     tutSay("<b>Dash</b> to escape pressure or close the gap fast."+
       (TOUCH?" Tap <b>DASH</b>.":" Press "+K("Space")+"."),"Dash once");
     if(p.dash>0)T.dashed=true;
     if(T.dashed&&p.dash<=0)tutNext();
     break;}
   case 4:{                                              // GUARD
     tutHi("bGrd");
     b.slowAtk=true;
     tutSay("<b>Guard</b> blocks incoming pushes and staggers the attacker."+
       (TOUCH?" Hold <b>GUARD</b>.":" Hold "+K("Right Click")+"."),"Block 1 attack");
     if(T.blocked){G.flash=.3;tutNext();}
     break;}
   case 5:{                                              // PRACTICE ROUND
     b.slowAtk=true;
     tutSay("Last thing: <b>win a round</b>. Push the trainer off the edge.",
       "Practice match");
     tutHi(null);
     if(b.dead&&b.fall>1.0){
       tutSay("");tutHi(null);
       setCenter("YOU'RE READY!","Good luck out there");
       SFX.win();
       T.step=6;T.t=0;
     }
     break;}
   case 6:
     if(T.t>2.1){setCenter("");flag("seen",1);G.tut=null;goHome();}
     break;
  }
}

// scripted opponent for the tutorial: a dummy, then a very forgiving sparring bot
function tutBot(dt){
  const T=G.tut,b=G.b,p=G.p,A=b.ai;
  A.mx=A.my=0; A.wantAtk=false; A.wantGuard=0; A.wantDash=false;
  const dx=p.x-b.x,dy=p.y-b.y,dist=Math.hypot(dx,dy)||1;
  if(b.kb<=0&&b.stagger<=0)b.face+=angDiff(Math.atan2(dy,dx),b.face)*smooth(6,dt);
  if(b.dead)return;
  if(T.step===1||T.step===2){                            // stand-still dummy, drifts back if you run off
    if(dist>150){A.mx=dx/dist*.45;A.my=dy/dist*.45;}
    return;
  }
  if(T.step===4){                                        // slow, telegraphed attacker
    if(dist>58){A.mx=dx/dist*.5;A.my=dy/dist*.5;}
    else if(b.atkCd<=0)A.wantAtk=true;
    return;
  }
  if(T.step===5){                                        // never guards, slow swings, sloppy footwork
    A.t-=dt; if(A.t>0)return; A.t=.45;
    if(dist<100){
      const w=Math.sin(G.time*.9)*.7;                     // drifts instead of committing
      A.mx=dx/dist*.7+Math.cos(w);A.my=dy/dist*.7+Math.sin(w);normA(A);
      if(b.atkCd<=0&&dist<52&&Math.random()<.45)A.wantAtk=true;
    }else{
      const c=arenaCenter();                              // hangs back, wanders near the middle
      A.mx=(c.x-b.x)+(Math.random()-.5)*260;A.my=(c.y-b.y)+(Math.random()-.5)*260;normA(A);
    }
  }
}
