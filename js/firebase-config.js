"use strict";
/* ─────────────────────────────────────────────────────────────
   FIREBASE — project online-9b339
   Auth: enable Anonymous in Firebase Console
   Firestore: create database + rules (see README)
   ───────────────────────────────────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCRuE3CAxAU--E-EZeWTDEWO6-4_rCF6Z0",
  authDomain: "online-9b339.firebaseapp.com",
  projectId: "online-9b339",
  storageBucket: "online-9b339.firebasestorage.app",
  messagingSenderId: "47771567732",
  appId: "1:47771567732:web:cfdd189a2ab56878487321",
  measurementId: "G-9H8TMX1BG7"
};

const FB_ENABLED = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
