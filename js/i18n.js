"use strict";
/* English / Spanish UI strings. */

const I18N = {
  en: {
    hook: "One Arena. One Opponent. One Wrong Move.",
    online: "Online 1v1",
    playAi: "Play vs AI",
    ranks: "Ranks / Leaderboard",
    settings: "Settings",
    how: "How To Play",
    tutorial: "Tutorial",
    practice: "Practice",
    welcomeTitle: "Welcome to Hex Push!",
    welcomeSub: "Learn the basics in under 30 seconds.",
    startTut: "Start Tutorial",
    skip: "Skip",
    onlineTitle: "Online 1v1",
    onlineSub: "Ranked matchmaking. Find an opponent and duel.",
    username: "Username",
    save: "Save",
    status: "Status",
    room: "Room",
    opponent: "Opponent",
    findMatch: "Find Match",
    searching: "Searching…",
    orPrivate: "or private room",
    createRoom: "Create Room",
    joinRoom: "Join Room",
    joinCode: "Join code",
    start: "Start",
    cancel: "Cancel",
    home: "Home",
    onlineHint: "Match starts automatically when both players connect. ELO updates after the duel.",
    rankTitle: "Ranks",
    rankSub: "Climb the ladder in online matches. AI games don't affect rank.",
    leaderboard: "Global Leaderboard",
    playOnline: "Play Online",
    matchSetup: "Match Setup",
    matchSetupSub: "Every match is a fresh duel. Tune it how you like.",
    difficulty: "Difficulty",
    arenaSize: "Arena Size",
    arenaTheme: "Arena Theme",
    matchSpeed: "Match Speed",
    playerColor: "Player Color",
    joystick: "Show Movement Joystick",
    startMatch: "Start Match",
    howTitle: "How To Play",
    howSub: "Push them off. Don't get pushed off. That's it.",
    back: "Back",
    paused: "Paused",
    pausedSub: "Take a breath.",
    resume: "Resume",
    restart: "Restart",
    youWin: "YOU WIN",
    youLost: "YOU LOST",
    replay: "Replay",
    changeSettings: "Change Settings",
    you: "You",
    pushThem: "Push them off the arena",
    pushBot: "Push the bot off the arena",
    vs: "VS",
    nameSaved: "Username saved ✓",
    nameLocal: "Saved locally",
    nameTaken: "Username taken",
    nameMin: "Min 3 characters",
    cloudOn: "Cloud sync on",
    ready: "Ready",
    searchingOpp: "Searching for opponent…",
    connecting: "Connecting…",
    matchFound: "Match found!",
    inMatch: "In match",
    lang: "Language",
    dash: "Dash",
    guard: "Guard",
    time: "Time",
    arena: "Arena",
    wins: "Wins",
    losses: "Losses",
    peak: "Peak",
    streak: "Streak",
    loading: "Loading…",
  },
  es: {
    hook: "Una arena. Un rival. Un mal movimiento.",
    online: "Online 1v1",
    playAi: "Jugar vs IA",
    ranks: "Rangos / Clasificación",
    settings: "Ajustes",
    how: "Cómo jugar",
    tutorial: "Tutorial",
    practice: "Práctica",
    welcomeTitle: "¡Bienvenido a Hex Push!",
    welcomeSub: "Aprende lo básico en menos de 30 segundos.",
    startTut: "Empezar tutorial",
    skip: "Saltar",
    onlineTitle: "Online 1v1",
    onlineSub: "Emparejamiento ranked. Busca un rival y duela.",
    username: "Nombre de usuario",
    save: "Guardar",
    status: "Estado",
    room: "Sala",
    opponent: "Rival",
    findMatch: "Buscar partida",
    searching: "Buscando…",
    orPrivate: "o sala privada",
    createRoom: "Crear sala",
    joinRoom: "Unirse",
    joinCode: "Código",
    start: "Empezar",
    cancel: "Cancelar",
    home: "Inicio",
    onlineHint: "La partida empieza sola al conectar ambos jugadores. El ELO se actualiza al final.",
    rankTitle: "Rangos",
    rankSub: "Sube en partidas online. Las partidas vs IA no afectan el rango.",
    leaderboard: "Clasificación global",
    playOnline: "Jugar online",
    matchSetup: "Configurar partida",
    matchSetupSub: "Cada duelo es nuevo. Ajústalo a tu gusto.",
    difficulty: "Dificultad",
    arenaSize: "Tamaño de arena",
    arenaTheme: "Tema de arena",
    matchSpeed: "Velocidad",
    playerColor: "Color del jugador",
    joystick: "Mostrar joystick",
    startMatch: "Empezar partida",
    howTitle: "Cómo jugar",
    howSub: "Empújalo fuera. No dejes que te empujen. Así de simple.",
    back: "Volver",
    paused: "Pausa",
    pausedSub: "Respira un momento.",
    resume: "Continuar",
    restart: "Reiniciar",
    youWin: "GANASTE",
    youLost: "PERDISTE",
    replay: "Otra vez",
    changeSettings: "Cambiar ajustes",
    you: "Tú",
    pushThem: "Empújalo fuera de la arena",
    pushBot: "Empuja al bot fuera de la arena",
    vs: "VS",
    nameSaved: "Usuario guardado ✓",
    nameLocal: "Guardado en este dispositivo",
    nameTaken: "Nombre ocupado",
    nameMin: "Mínimo 3 caracteres",
    cloudOn: "Sincronización en la nube",
    ready: "Listo",
    searchingOpp: "Buscando rival…",
    connecting: "Conectando…",
    matchFound: "¡Partida encontrada!",
    inMatch: "En partida",
    lang: "Idioma",
    dash: "Dash",
    guard: "Guardia",
    time: "Tiempo",
    arena: "Arena",
    wins: "Victorias",
    losses: "Derrotas",
    peak: "Máximo",
    streak: "Racha",
    loading: "Cargando…",
  }
};

let LANG = localStorage.getItem("hexpush_lang") || (navigator.language||"en").toLowerCase().startsWith("es") ? "es" : "en";
if(LANG!=="es"&&LANG!=="en") LANG="en";

function t(key){
  return (I18N[LANG]&&I18N[LANG][key]) || (I18N.en[key]) || key;
}

function setLang(code){
  LANG = code==="es" ? "es" : "en";
  localStorage.setItem("hexpush_lang", LANG);
  applyI18n();
}

function applyI18n(){
  document.documentElement.lang = LANG;
  const set = (sel, key, prop) => {
    const n = document.querySelector(sel);
    if(!n) return;
    if(prop==="html") n.innerHTML = t(key);
    else n.textContent = t(key);
  };
  set(".hook", "hook");
  // home buttons by data-go
  document.querySelectorAll("[data-go]").forEach(b=>{
    const g=b.dataset.go;
    const map={online:"online",play:"playAi",rank:"ranks",settings:"settings",how:"how",
      tutorial:"tutorial",practice:"practice",skiptut:"skip",home:"home",
      resume:"resume",restart:"restart",replay:"replay",start:"startMatch",
      onlineFind:"findMatch",onlineLeave:"cancel",claimName:"save",
      startTut:"startTut"};
    // welcome buttons
    if(g==="tutorial"&&b.closest("#scrWelcome")) b.textContent=t("startTut");
    else if(g==="skiptut") b.textContent=t("skip");
    else if(map[g]&&b.classList.contains("btn")||b.classList.contains("link")||b.classList.contains("pri")){
      if(["online","play","rank","settings","how","tutorial","practice","home","resume","restart","replay","start",
          "onlineFind","onlineLeave","claimName"].includes(g)){
        if(!(g==="tutorial"&&b.closest("#scrWelcome"))) b.textContent=t(map[g]);
      }
    }
  });
  // panels
  const h2 = (scr, key)=>{ const n=document.querySelector("#"+scr+" h2"); if(n)n.textContent=t(key); };
  const sub = (scr, key)=>{ const n=document.querySelector("#"+scr+" p.sub"); if(n&&!n.id) n.textContent=t(key); };
  h2("scrWelcome","welcomeTitle"); sub("scrWelcome","welcomeSub");
  h2("scrOnline","onlineTitle");
  const onlineSubs=document.querySelectorAll("#scrOnline p.sub");
  if(onlineSubs[0]) onlineSubs[0].textContent=t("onlineSub");
  if(onlineSubs[1]) onlineSubs[1].textContent=t("onlineHint");
  h2("scrRank","rankTitle");
  const rankSub=document.querySelector("#scrRank > .panel > p.sub");
  if(rankSub) rankSub.textContent=t("rankSub");
  h2("scrSet","matchSetup"); sub("scrSet","matchSetupSub");
  h2("scrHow","howTitle"); sub("scrHow","howSub");
  h2("scrPause","paused"); sub("scrPause","pausedSub");
  // labels
  const lu=document.getElementById("labUsername"); if(lu) lu.textContent=t("username");
  // online box labels
  document.querySelectorAll("#scrOnline .online-label").forEach((lab,i)=>{
    lab.textContent=[t("status"),t("opponent")][i]||lab.textContent;
  });
  const lbLab=document.querySelector("#scrRank .grp label");
  if(lbLab) lbLab.textContent=t("leaderboard");
  // settings labels
  document.querySelectorAll("#scrSet .grp > label").forEach((lab,i)=>{
    const keys=["difficulty","arenaSize","arenaTheme","matchSpeed","playerColor","joystick"];
    if(keys[i]) lab.textContent=t(keys[i]);
  });
  // HUD
  const tagP=el("tagP");
  if(tagP&&mode==="menu"){
    // leave mid-match tags alone if possible
  }
  const cds=document.querySelectorAll("#cds .cd b");
  if(cds[0]) cds[0].textContent=t("dash");
  if(cds[1]) cds[1].textContent=t("guard");
  // lang toggle active state
  document.querySelectorAll("[data-lang]").forEach(b=>{
    b.classList.toggle("sel", b.dataset.lang===LANG);
  });
  if(typeof onlineUIRefresh==="function") onlineUIRefresh();
  if(typeof refreshHomeRank==="function") refreshHomeRank();
}

function displayName(n, fallback){
  n=(n||"").trim();
  // Treat placeholders as empty so HUD never shows generic "Player vs Opponent" by accident
  if(!n || /^challenger$/i.test(n) || /^opponent$/i.test(n) || /^player$/i.test(n)) return fallback||t("you");
  return n.slice(0,16);
}
