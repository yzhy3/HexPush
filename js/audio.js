"use strict";
/* Every sound is synthesised with the WebAudio API — the game ships no audio files.
   audioInit() must run inside a user gesture (browsers block autoplay). */

let AC=null,MASTER=null,NOISE=null;

function audioInit(){
  if(AC)return; try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
  MASTER=AC.createGain(); MASTER.gain.value=.5; MASTER.connect(AC.destination);
  const n=AC.sampleRate*1, b=AC.createBuffer(1,n,AC.sampleRate), d=b.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
  NOISE=b;
}
// one oscillator blip, optionally pitch-sweeping to f2
function tone(f,dur,type="sine",vol=.25,f2=null,delay=0){
  if(!AC)return; const t=AC.currentTime+delay;
  const o=AC.createOscillator(),g=AC.createGain();
  o.type=type;o.frequency.setValueAtTime(f,t);
  if(f2)o.frequency.exponentialRampToValueAtTime(Math.max(1,f2),t+dur);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.008);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);g.connect(MASTER);o.start(t);o.stop(t+dur+.02);
}
// band-passed white noise — impacts, sparks, crowd
function noise(dur,freq,vol=.3,delay=0,q=1){
  if(!AC)return; const t=AC.currentTime+delay;
  const s=AC.createBufferSource();s.buffer=NOISE;
  const f=AC.createBiquadFilter();f.type="bandpass";f.frequency.value=freq;f.Q.value=q;
  const g=AC.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  s.connect(f);f.connect(g);g.connect(MASTER);s.start(t);s.stop(t+dur);
}

const SFX={
 hover:()=>tone(880,.06,"sine",.05),
 click:()=>{tone(520,.07,"triangle",.16);tone(1040,.09,"sine",.08,1400)},
 count:()=>{tone(440,.16,"square",.12);tone(880,.2,"sine",.1)},
 go:   ()=>{tone(180,.5,"sawtooth",.18,900);noise(.35,1800,.2);tone(660,.4,"triangle",.14,1320)},
 dash: ()=>{noise(.22,900,.22,0,.8);tone(320,.18,"sawtooth",.1,900)},
 swing:()=>{noise(.13,1500,.11,0,1.4);tone(520,.09,"sine",.05,240)},
 hit:  ()=>{tone(90,.34,"sine",.5,34);noise(.18,420,.4,0,.6);tone(240,.12,"square",.2,70);
            tone(1400,.07,"square",.1,600)},
 block:()=>{tone(1800,.16,"square",.2,2800);noise(.14,3400,.28,0,4);tone(760,.24,"triangle",.13);
            tone(2600,.09,"sine",.1,1200,.03)},
 crack:()=>{noise(.1,2400,.12,0,4);tone(1200,.07,"square",.05)},
 fall: ()=>{tone(400,.9,"sine",.2,40);noise(.7,300,.14)},
 win:  ()=>{[523,659,784,1047].forEach((f,i)=>tone(f,.42,"triangle",.2,null,i*.1));noise(.5,1200,.1,.05)},
 lose: ()=>{[392,330,262,196].forEach((f,i)=>tone(f,.45,"sine",.2,null,i*.13))},
 cheer:()=>{for(let i=0;i<9;i++)noise(.5+Math.random()*.4,700+Math.random()*1600,.05,Math.random()*.5,.6)}
};

// When online host runs combat, mirror important SFX to clients via FX_QUEUE.
(function wrapSfxForNet(){
  const keys=["dash","swing","hit","block","crack","fall","win","lose","cheer","go","count"];
  keys.forEach(k=>{
    if(typeof SFX[k]!=="function")return;
    const orig=SFX[k];
    SFX[k]=function(){
      orig.apply(this,arguments);
      if(typeof fxPush==="function"&&FX_NET)fxPush({t:"sfx",name:k});
    };
  });
})();
