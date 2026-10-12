"use strict";
/* Firebase auth + Firestore user profiles, usernames and leaderboard.
   Gracefully no-ops when FIREBASE_CONFIG is empty (localStorage only). */

let FB = { app:null, auth:null, db:null, user:null, ready:false, error:"" };

async function fbInit(){
  if(!FB_ENABLED){ FB.ready=false; return false; }
  if(typeof firebase==="undefined"){
    FB.error="Firebase SDK not loaded";
    return false;
  }
  try{
    FB.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
    FB.auth = firebase.auth();
    FB.db = firebase.firestore();
    // anonymous sign-in (persistent per browser)
    if(!FB.auth.currentUser){
      const cred = await FB.auth.signInAnonymously();
      FB.user = cred.user;
    }else{
      FB.user = FB.auth.currentUser;
    }
    FB.ready = true;
    await fbLoadProfile();
    return true;
  }catch(e){
    FB.error = String(e.message||e);
    FB.ready = false;
    console.warn("[HexPush] Firebase init failed:", e);
    return false;
  }
}

async function fbLoadProfile(){
  if(!FB.ready||!FB.user)return null;
  try{
    const ref = FB.db.collection("users").doc(FB.user.uid);
    const snap = await ref.get();
    if(snap.exists){
      const d = snap.data();
      if(d.username) RANK.name = d.username;
      if(typeof d.elo==="number") RANK.elo = d.elo;
      if(typeof d.wins==="number") RANK.wins = d.wins;
      if(typeof d.losses==="number") RANK.losses = d.losses;
      if(typeof d.streak==="number") RANK.streak = d.streak;
      if(typeof d.bestElo==="number") RANK.bestElo = d.bestElo;
      if(typeof d.brWins==="number") RANK.brWins = d.brWins||0;
      saveRank(RANK);
      return d;
    }else{
      // create skeleton profile
      await ref.set({
        username: RANK.name||"Challenger",
        elo: RANK.elo, wins: RANK.wins, losses: RANK.losses,
        streak: RANK.streak, bestElo: RANK.bestElo,
        brWins: RANK.brWins||0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, {merge:true});
      return null;
    }
  }catch(e){ console.warn("[HexPush] load profile:", e); return null; }
}

async function fbSaveProfile(){
  saveRank(RANK);
  if(!FB.ready||!FB.user)return;
  try{
    await FB.db.collection("users").doc(FB.user.uid).set({
      username: RANK.name,
      elo: RANK.elo, wins: RANK.wins, losses: RANK.losses,
      streak: RANK.streak, bestElo: RANK.bestElo,
      brWins: RANK.brWins||0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    // mirror for leaderboard queries
    await FB.db.collection("leaderboard").doc(FB.user.uid).set({
      username: RANK.name,
      elo: RANK.elo, wins: RANK.wins, losses: RANK.losses,
      brWins: RANK.brWins||0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
  }catch(e){ console.warn("[HexPush] save profile:", e); }
}

/** Claim a unique username. Returns {ok, error}. */
async function fbClaimUsername(raw){
  const name = (raw||"").trim().replace(/\s+/g," ").slice(0,16);
  if(name.length<3) return {ok:false, error:"Min 3 characters"};
  if(!/^[a-zA-Z0-9_ ]+$/.test(name)) return {ok:false, error:"Letters, numbers, _ only"};
  const key = name.toLowerCase().replace(/ /g,"_");

  // always set locally
  RANK.name = name;
  saveRank(RANK);

  if(!FB.ready||!FB.user){
    return {ok:true, error:"", local:true};
  }

  try{
    const unameRef = FB.db.collection("usernames").doc(key);
    const existing = await unameRef.get();
    if(existing.exists && existing.data().uid !== FB.user.uid){
      return {ok:false, error:"Username taken"};
    }
    // release old username doc if we had one
    const prev = await FB.db.collection("users").doc(FB.user.uid).get();
    if(prev.exists && prev.data().usernameKey && prev.data().usernameKey !== key){
      try{ await FB.db.collection("usernames").doc(prev.data().usernameKey).delete(); }catch(e){}
    }
    await unameRef.set({ uid: FB.user.uid, name, at: firebase.firestore.FieldValue.serverTimestamp() });
    await FB.db.collection("users").doc(FB.user.uid).set({
      username: name, usernameKey: key,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    await fbSaveProfile();
    return {ok:true, error:""};
  }catch(e){
    return {ok:false, error:String(e.message||e)};
  }
}

async function fbLeaderboard(limit){
  limit = limit||20;
  if(!FB.ready){
    // local-only: just you
    return [{username:RANK.name, elo:RANK.elo, wins:RANK.wins, losses:RANK.losses, brWins:RANK.brWins||0, me:true}];
  }
  try{
    const q = await FB.db.collection("leaderboard").orderBy("elo","desc").limit(limit).get();
    const rows = [];
    q.forEach(doc=>{
      const d = doc.data();
      rows.push({
        username: d.username||"?",
        elo: d.elo|0, wins: d.wins|0, losses: d.losses|0, brWins: d.brWins|0,
        me: doc.id === (FB.user&&FB.user.uid)
      });
    });
    return rows;
  }catch(e){
    console.warn("[HexPush] leaderboard:", e);
    return [{username:RANK.name, elo:RANK.elo, wins:RANK.wins, losses:RANK.losses, me:true}];
  }
}
