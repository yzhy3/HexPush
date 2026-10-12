"use strict";
/* Screens, HUD, the settings panel and all button routing. */

const SCR={
  home:"scrHome",settings:"scrSet",how:"scrHow",pause:"scrPause",end:"scrEnd",
  welcome:"scrWelcome",online:"scrOnline",rank:"scrRank"
};
const hudEl=el("hud"), centerEl=el("center");
const cdDash=el("cdDash"), cdGrd=el("cdGrd"), bDashEl=el("bDash");

// show()            -> hide everything
// show("name",bool) -> toggle one screen ("hud" is a valid name)
function show(name,on){
  if(on===undefined){for(const k in SCR)el(SCR[k]).classList.remove("on");
    hudEl.classList.remove("on");return;}
  if(name==="hud"){hudEl.classList.toggle("on",on);return;}
  el(SCR[name]).classList.toggle("on",on);
}
function goHome(){
  if(ONLINE&&ONLINE.status!=="idle")onlineLeave();
  FX_NET=false;
  mode="menu"; show(); show("home",true); padVisible(false); setCenter(""); resetInput();
  G.conf.length=0; G.tut=null; G.slow=1; G.hitstop=0; G.focus=null;
  tutSay(""); tutHi(null); jbase.classList.remove("pulse");
  refreshHomeRank();
}
function togglePause(){
  if(G.kind==="online")return; // no pause in online (desync risk)
  if(mode==="play"){mode="paused";show("pause",true);padVisible(false);tutEl.classList.remove("on");}
  else if(mode==="paused"){mode="play";show("pause",false);padVisible(TOUCH);
    tutEl.classList.toggle("on",!!tutEl.innerHTML);}
  dropPendingInput();
}
el("pause").onclick=()=>{SFX.click();togglePause();};

//------------------------------------------------------------ hud + center text
function hudUpdate(){
  const rdy=G.p.dashCd<=0;
  cdDash.style.transform="scaleX("+Math.min(1,1-G.p.dashCd/1.35)+")";
  cdDash.style.background=rdy?"linear-gradient(90deg,#4aa8ff,#8ee6ff)":"#3f5680";
  cdDash.style.boxShadow=rdy?"0 0 10px #8ee6ff":"none";
  bDashEl.classList.toggle("rdy",rdy);
  cdGrd.style.transform="scaleX("+G.p.gm+")";
  cdGrd.style.background=G.p.gm<.2?"#8a3a4a":"linear-gradient(90deg,#7de0a8,#d8ffb0)";
}
let lastCenter="";
function setCenter(t,sub){
  lastCenter=t;
  centerEl.innerHTML=t?'<div style="color:'+(t==="PUSH!"?"#ffe27a":"#eaf4ff")+'">'+t+
    (sub?"<small>"+sub+"</small>":"")+"</div>":"";
}

//------------------------------------------------------------ settings panel
function buildOpts(){
  const defs={diff:Object.keys(DIFF),size:Object.keys(SIZES),theme:Object.keys(THEMES),
              speed:Object.keys(SPEEDS),color:Object.keys(COLORS),joy:["On","Off"]};
  el("grpJoy").style.display=TOUCH?"":"none";   // joystick toggle is touch-only
  document.querySelectorAll("[data-k]").forEach(box=>{
    const k=box.dataset.k;
    box.innerHTML="";
    defs[k].forEach(v=>{
      const opt=document.createElement("div");
      if(k==="color"){opt.className="sw";opt.style.background=COLORS[v];opt.style.color=COLORS[v];opt.title=v;}
      else{opt.className="opt";opt.textContent=v;}
      opt.dataset.v=v;
      if(CFG[k]===v)opt.classList.add("sel");
      opt.onclick=()=>{CFG[k]=v;saveCfg();
        box.querySelectorAll("[data-v]").forEach(o=>o.classList.toggle("sel",o.dataset.v===v));
        if(k==="joy")padVisible(TOUCH);
        SFX.click();};
      opt.onmouseenter=SFX.hover;
      box.appendChild(opt);
    });
  });
}
buildOpts();

//------------------------------------------------------------ rank / home UI
function refreshHomeRank(){
  const box=el("homeRank");
  if(!box)return;
  const t=rankOf(RANK.elo);
  const prog=rankProgress(RANK.elo);
  box.innerHTML=rankBadgeHTML(RANK)+
    '<div class="rank-mini">'+RANK.wins+"W · "+RANK.losses+"L"+
    (prog.next?" · "+(prog.next-RANK.elo)+" to "+prog.nextTier.name:"")+"</div>";
}

function refreshRankScreen(){
  const hero=el("rankHero"), bars=el("rankBars"), tiers=el("rankTiers");
  if(!hero)return;
  refreshLeaderboard();
  const t=rankOf(RANK.elo);
  const prog=rankProgress(RANK.elo);
  hero.innerHTML=
    '<div class="rank-hero-ico" style="color:'+t.color+'">'+t.icon+'</div>'+
    '<div class="rank-hero-name" style="color:'+t.color+'">'+t.name+'</div>'+
    '<div class="rank-hero-elo">'+RANK.elo+' ELO</div>'+
    '<div class="rank-hero-player">'+RANK.name+'</div>';
  bars.innerHTML=
    '<div class="rank-bar-wrap"><div class="rank-bar" style="width:'+(prog.pct*100)+'%;background:'+t.color+'"></div></div>'+
    '<div class="rank-bar-labels"><span>'+t.name+'</span><span>'+(prog.next?prog.nextTier.name+" "+prog.next:"MAX")+'</span></div>'+
    '<div class="rank-stats">'+
      '<div><b>'+RANK.wins+'</b><span>Wins</span></div>'+
      '<div><b>'+RANK.losses+'</b><span>Losses</span></div>'+
      '<div><b>'+RANK.bestElo+'</b><span>Peak</span></div>'+
      '<div><b>'+(RANK.streak>0?"+"+RANK.streak:RANK.streak)+'</b><span>Streak</span></div>'+
    '</div>';
  tiers.innerHTML=RANK_TIERS.map(x=>{
    const on=RANK.elo>=x.min;
    return '<div class="rank-tier'+(on?" on":"")+'" style="--rc:'+x.color+'">'+
      '<span class="rank-ico">'+x.icon+'</span> '+x.name+
      '<span class="rank-tier-min">'+x.min+'+</span></div>';
  }).join("");
}

//------------------------------------------------------------ button routing
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-go]"); if(!b)return;
  audioInit(); SFX.click();
  b.blur();
  const g=b.dataset.go;
  if(g==="play"||g==="start"){show();startMatch("match");}
  else if(g==="replay"){
    if(G.kind==="online"){show();show("online",true);onlineUIRefresh();return;}
    show();startMatch("match");
  }
  else if(g==="tutorial"){show();startMatch("tutorial");}
  else if(g==="practice"){show();startMatch("practice");}
  else if(g==="skiptut"){flag("seen",1);goHome();}
  else if(g==="settings"){mode="menu";show();show("settings",true);}
  else if(g==="how"){mode="menu";show();show("how",true);}
  else if(g==="home"){goHome();}
  else if(g==="resume"){togglePause();}
  else if(g==="restart"){
    if(G.kind==="online")return;
    show();startMatch(G.kind==="online"?"match":G.kind);
  }
  else if(g==="online"){
    mode="menu";show();show("online",true);
    const ni=el("onlineName"); if(ni)ni.value=RANK.name;
    onlineUIRefresh();
  }
  else if(g==="rank"){mode="menu";show();show("rank",true);refreshRankScreen();}
  else if(g==="claimName"){
    const ni=el("onlineName"); const st=el("nameStatus");
    (async()=>{
      const res = typeof fbClaimUsername==="function"
        ? await fbClaimUsername(ni.value)
        : {ok:true, local:true};
      if(res.ok){
        setPlayerName(ni.value);
        if(st) st.textContent = res.local ? t("nameLocal") : t("nameSaved");
        refreshHomeRank();
      }else if(st) st.textContent = res.error||"Error";
    })();
  }
  else if(g==="br"){mode="menu";show();show("br",true);}
  else if(g==="brStart"){
    const sel=document.querySelector("#brCountOpts .opt.sel");
    const n=sel?+sel.dataset.brc:4;
    show(); brStartLocal(n);
  }
  else if(g==="onlineFind"){
    const ni=el("onlineName"); if(ni)setPlayerName(ni.value);
    Promise.resolve(onlineFindMatch()).catch(e=>{
      console.warn(e);
      ONLINE.lastError=String(e.message||e);
      ONLINE.status="error";
      onlineUIRefresh();
    });
  }
  else if(g==="onlineLeave"){onlineLeave(); onlineUIRefresh();}
});
document.addEventListener("mouseenter",e=>{
  if(e.target.classList&&e.target.classList.contains("btn"))SFX.hover();
},true);

// name field live-save
const nameInp=el("onlineName");
if(nameInp){
  nameInp.value=RANK.name;
  nameInp.addEventListener("change",()=>setPlayerName(nameInp.value));
}

// animated title letters
el("ttl").innerHTML=[..."HEX PUSH"].map((c,i)=>
  '<span style="animation-delay:'+(i*.07)+'s">'+(c===" "?"&nbsp;":c)+"</span>").join("");

refreshHomeRank();

// first launch ever -> offer the tutorial once (Skip is remembered forever)
if(!flag("seen")){show();show("welcome",true);}


async function refreshLeaderboard(){
  const box=el("leaderboard"); if(!box)return;
  box.innerHTML="Loading…";
  const rows = typeof fbLeaderboard==="function" ? await fbLeaderboard(15) : [];
  if(!rows.length){
    box.innerHTML='<div class="lb-row me"><span>#1</span><span>'+RANK.name+'</span><span>'+RANK.elo+'</span></div>';
    return;
  }
  box.innerHTML=rows.map((r,i)=>
    '<div class="lb-row'+(r.me?" me":"")+'"><span>#'+(i+1)+'</span><span>'+
    (r.username||"?")+'</span><span>'+r.elo+'</span></div>'
  ).join("");
}


// Boot Firebase
(async function(){
  if(typeof fbInit==="function"){
    const ok=await fbInit();
    refreshHomeRank();
    const st=el("nameStatus");
    if(st&&FB_ENABLED) st.textContent = ok ? t("cloudOn") : ("Firebase: "+(FB.error||"offline"));
  }
})();


// Language toggle
document.querySelectorAll("[data-lang]").forEach(b=>{
  b.addEventListener("click",()=>{
    audioInit(); SFX.click();
    setLang(b.dataset.lang);
  });
});

// Apply translations once DOM + modules ready
if(typeof applyI18n==="function") applyI18n();
