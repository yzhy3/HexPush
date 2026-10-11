"use strict";
/* Local ELO + rank tiers. Persisted in localStorage. Used for offline display
   and as the rank exchanged when connecting online. */

const RANK_TIERS=[
  {name:"Iron",        min:0,    color:"#8a9099", icon:"⚔"},
  {name:"Bronze",      min:800,  color:"#cd7f32", icon:"🛡"},
  {name:"Silver",      min:1000, color:"#c0c0c0", icon:"✦"},
  {name:"Gold",        min:1200, color:"#ffd700", icon:"★"},
  {name:"Platinum",    min:1400, color:"#7fffd4", icon:"◈"},
  {name:"Diamond",     min:1600, color:"#b9f2ff", icon:"◆"},
  {name:"Master",      min:1800, color:"#ff6bcb", icon:"♛"},
  {name:"Grandmaster", min:2000, color:"#ff3b3b", icon:"👑"}
];

const RANK_DEFAULT={name:"Challenger",elo:1000,wins:0,losses:0,streak:0,bestElo:1000};

function loadRank(){
  try{
    const r=JSON.parse(localStorage.getItem("hexpush_rank")||"null");
    if(r&&typeof r.elo==="number")return Object.assign({},RANK_DEFAULT,r);
  }catch(e){}
  return Object.assign({},RANK_DEFAULT);
}
function saveRank(r){localStorage.setItem("hexpush_rank",JSON.stringify(r));}

let RANK=loadRank();

function rankOf(elo){
  let t=RANK_TIERS[0];
  for(const x of RANK_TIERS)if(elo>=x.min)t=x;
  return t;
}

function rankProgress(elo){
  const t=rankOf(elo);
  const idx=RANK_TIERS.indexOf(t);
  const next=RANK_TIERS[idx+1];
  if(!next)return{pct:1,cur:elo,next:null,tier:t};
  const span=next.min-t.min;
  return{pct:Math.min(1,(elo-t.min)/span),cur:elo,next:next.min,tier:t,nextTier:next};
}

// Standard ELO expected score and update. K=32 for active ranks, lower near top.
function eloExpected(a,b){return 1/(1+Math.pow(10,(b-a)/400));}
function eloK(elo){return elo>=1800?16:elo>=1400?24:32;}

function applyMatchResult(win,opponentElo){
  const opp=typeof opponentElo==="number"?opponentElo:1000;
  const exp=eloExpected(RANK.elo,opp);
  const score=win?1:0;
  const k=eloK(RANK.elo);
  const delta=Math.round(k*(score-exp));
  RANK.elo=Math.max(0,RANK.elo+delta);
  if(win){RANK.wins++;RANK.streak=Math.max(0,RANK.streak)+1;}
  else{RANK.losses++;RANK.streak=Math.min(0,RANK.streak)-1;}
  if(RANK.elo>RANK.bestElo)RANK.bestElo=RANK.elo;
  saveRank(RANK);
  return{delta,elo:RANK.elo,tier:rankOf(RANK.elo)};
}

function setPlayerName(n){
  n=(n||"").trim().slice(0,16)||"Challenger";
  RANK.name=n;
  saveRank(RANK);
  return n;
}

function rankBadgeHTML(r){
  r=r||RANK;
  const t=rankOf(r.elo);
  return '<span class="rank-badge" style="--rc:'+t.color+'">'+
    '<span class="rank-ico">'+t.icon+'</span> '+t.name+
    ' <span class="rank-elo">'+r.elo+'</span></span>';
}
