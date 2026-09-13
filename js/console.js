
/* =====================================================================
   ARCSYSTEMS XP — APPLICATION SCRIPT MANIFEST (ver README.md para el mapa)
   ===================================================================== */

/* ============ UTILIDADES GLOBALES ============ */
/** Escapa HTML para inyectar texto de usuario de forma segura en innerHTML. */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
/** JSON.parse tolerante a corrupción: devuelve fallback si falla. */
function safeParse(raw, fallback){ try{ const v = JSON.parse(raw); return v === null ? fallback : v; } catch(e){ return fallback; } }

/* ============ OPTIMIZACIÓN MÓVIL: BIOS ============
   El POST del boot reescribe el innerHTML completo de #bios en cada paso del
   contador de memoria (~75 escrituras HTML completas). En un celular, con los
   assets pesados cargando en paralelo, eso se nota. Se intercepta UNA sola vez
   la propiedad innerHTML para: (1) saltar las escrituras cuando el boot ya
   terminó y (2) escribir en un buffer y volcar al DOM una vez por frame. */
(function patchBiosInnerHTML(){
  const bios = document.getElementById('bios');
  if(!bios) return;
  const proto = Object.getPrototypeOf(bios);
  const desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
  if(!desc || !desc.set) return;
  let pending = null, raf = 0;
  Object.defineProperty(bios, 'innerHTML', {
    configurable: true,
    get: function(){ return desc.get.call(this); },
    set: function(v){
      const boot = document.getElementById('boot');
      if(boot && boot.style.display === 'none') return;   // el boot ya terminó: escritura inútil
      pending = v;
      if(raf) return;                                     // ya hay un volcado programado
      raf = requestAnimationFrame(function(){
        raf = 0;
        const val = pending; pending = null;
        if(val !== null) desc.set.call(bios, val);
      });
    }
  });
})();

/* ============ AUDIO ============ */
let soundOn=true, AC=null, masterComp=null;
function ac(){
  if(!AC){
    try{
      AC=new (window.AudioContext||window.webkitAudioContext)();
      masterComp=AC.createDynamicsCompressor();
      masterComp.threshold.setValueAtTime(-18, AC.currentTime);
      masterComp.knee.setValueAtTime(12, AC.currentTime);
      masterComp.ratio.setValueAtTime(8, AC.currentTime);
      masterComp.attack.setValueAtTime(0.003, AC.currentTime);
      masterComp.release.setValueAtTime(0.2, AC.currentTime);
      masterComp.connect(AC.destination);
    }catch(e){}
  }
  return AC;
}
function masterNode(a){ return masterComp || a.destination; }
function noiseBuf(){ const a=ac(); if(!a)return null; if(a._nb)return a._nb;
  const b=a.createBuffer(1,a.sampleRate,a.sampleRate); const d=b.getChannelData(0);
  for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; a._nb=b; return b; }
function toggleSound(){ soundOn=!soundOn; document.getElementById('sndBtn').textContent=soundOn?'🔊 Sound: ON':' Sound: OFF'; }
function sfx(f,d,type,v){ if(!soundOn)return; const a=ac(); if(!a)return;
  const o=a.createOscillator(),g=a.createGain(); o.type=type||'square'; o.frequency.value=f; g.gain.value=v||.1;
  o.connect(g); g.connect(masterNode(a)); o.start(); g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+d); o.stop(a.currentTime+d); }

const flutePitches=[880, 987.77, 1174.66, 1318.51, 1567.98]; // A5, B5, D6, E6, G6
let flutePitchIdx=0;
function laserSfx(){
  if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  const freq=flutePitches[(flutePitchIdx++)%flutePitches.length];
  // Pure melodic flute sine whistle
  const fo=a.createOscillator(), fg=a.createGain();
  fo.type='sine';
  fo.frequency.setValueAtTime(freq, t);
  fo.frequency.exponentialRampToValueAtTime(freq*1.06, t+0.035);
  fo.frequency.exponentialRampToValueAtTime(freq, t+0.1);
  fg.gain.setValueAtTime(0.0001, t);
  fg.gain.linearRampToValueAtTime(0.14, t+0.015);
  fg.gain.exponentialRampToValueAtTime(0.0001, t+0.11);
  fo.connect(fg); fg.connect(masterNode(a));
  fo.start(t); fo.stop(t+0.12);

  // Air breath / flute attack transient
  const bo=a.createOscillator(), bg=a.createGain();
  bo.type='triangle';
  bo.frequency.setValueAtTime(freq*2.2, t);
  bo.frequency.exponentialRampToValueAtTime(freq*0.6, t+0.06);
  bg.gain.setValueAtTime(0.05, t);
  bg.gain.exponentialRampToValueAtTime(0.0001, t+0.07);
  bo.connect(bg); bg.connect(masterNode(a));
  bo.start(t); bo.stop(t+0.08);
}
function explosionSfx(p){ if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime; p=p||1;
  const src=a.createBufferSource(); src.buffer=noiseBuf();
  const f=a.createBiquadFilter(); f.type='lowpass';
  f.frequency.setValueAtTime(1300*Math.min(p,1.6),t); f.frequency.exponentialRampToValueAtTime(48,t+.55);
  const g=a.createGain(); g.gain.setValueAtTime(.5*Math.min(p,1.7),t); g.gain.exponentialRampToValueAtTime(.0001,t+.65);
  src.connect(f); f.connect(masterNode(a)); src.start(t); src.stop(t+.7); }
function powerSfx(){ if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  [523,659,784,1046,1318].forEach(function(f,i){ const o=a.createOscillator(),g=a.createGain(); o.type='square'; o.frequency.value=f;
    g.gain.setValueAtTime(.0001,t+i*.045); g.gain.linearRampToValueAtTime(.11,t+i*.045+.012); g.gain.exponentialRampToValueAtTime(.0001,t+i*.045+.09);
    o.connect(g); g.connect(masterNode(a)); o.start(t+i*.045); o.stop(t+i*.045+.1); }); }
function hitSfx(){ if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  const src=a.createBufferSource(); src.buffer=noiseBuf();
  const f=a.createBiquadFilter(); f.type='bandpass'; f.frequency.value=420;
  const g=a.createGain(); g.gain.setValueAtTime(.28,t); g.gain.exponentialRampToValueAtTime(.0001,t+.14);
  src.connect(f); f.connect(masterNode(a)); src.start(t); src.stop(t+.15); }
function chargeSfx(){ sfx(1400,.5,'sine',.08); sfx(1800,.5,'sine',.05); }
function bossSfx(){ sfx(70,.9,'sawtooth',.22); sfx(95,.9,'sawtooth',.16); sfx(50,1.2,'sine',.2); }
function dashSfx(){ if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  const src=a.createBufferSource(); src.buffer=noiseBuf();
  const f=a.createBiquadFilter(); f.type='highpass'; f.frequency.setValueAtTime(3000,t); f.frequency.exponentialRampToValueAtTime(300,t+.25);
  const g=a.createGain(); g.gain.setValueAtTime(.2,t); g.gain.exponentialRampToValueAtTime(.0001,t+.25);
  src.connect(f); f.connect(masterNode(a)); src.start(t); src.stop(t+.26); }
function bombSfx(){ if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  const o=a.createOscillator(),g=a.createGain(); o.type='sine';
  o.frequency.setValueAtTime(60,t); o.frequency.exponentialRampToValueAtTime(900,t+.5);
  g.gain.setValueAtTime(.3,t); g.gain.exponentialRampToValueAtTime(.0001,t+.7);
  o.connect(g); g.connect(masterNode(a)); o.start(t); o.stop(t+.7);
  explosionSfx(1.6); }
function modReadySfx(){ if(!soundOn)return; sfx(1200,.08,'sine',.08); setTimeout(()=>sfx(1600,.08,'sine',.06),60); }
function accessSfx(){ if(!soundOn)return; sfx(800,.1,'square',.08); setTimeout(()=>sfx(1200,.1,'square',.08),80); }
function fanfareSfx(){
  if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  const notes=[523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
  notes.forEach(function(f,i){
    const o=a.createOscillator(), g=a.createGain();
    o.type='triangle'; o.frequency.setValueAtTime(f, t+i*0.09);
    g.gain.setValueAtTime(0.0001, t+i*0.09);
    g.gain.linearRampToValueAtTime(0.2, t+i*0.09+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t+i*0.09+0.35);
    o.connect(g); g.connect(masterNode(a));
    o.start(t+i*0.09); o.stop(t+i*0.09+0.38);
    const o2=a.createOscillator(), g2=a.createGain();
    o2.type='sine'; o2.frequency.setValueAtTime(f*2, t+i*0.09);
    g2.gain.setValueAtTime(0.0001, t+i*0.09);
    g2.gain.linearRampToValueAtTime(0.08, t+i*0.09+0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, t+i*0.09+0.25);
    o2.connect(g2); g2.connect(masterNode(a));
    o2.start(t+i*0.09); o2.stop(t+i*0.09+0.28);
  });
}
function warpSplitSfx(){
  if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  sfx(720, .18, 'sine', .14);
  setTimeout(()=>sfx(1080, .22, 'sine', .12), 40);
  setTimeout(()=>sfx(1440, .25, 'sine', .1), 80);
}
function resonatorSfx(){
  if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  [440, 554.37, 659.25, 880].forEach((f, i) => {
    const o=a.createOscillator(), g=a.createGain();
    o.type='sine'; o.frequency.value=f;
    g.gain.setValueAtTime(0.0001, t+i*0.04);
    g.gain.linearRampToValueAtTime(0.12, t+i*0.04+0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t+i*0.04+0.28);
    o.connect(g); g.connect(masterNode(a));
    o.start(t+i*0.04); o.stop(t+i*0.04+0.3);
  });
}
function chronoPeekSfx(){
  if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  const o=a.createOscillator(), g=a.createGain();
  o.type='sawtooth';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(140, t+0.35);
  g.gain.setValueAtTime(0.16, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.38);
  o.connect(g); g.connect(masterNode(a));
  o.start(t); o.stop(t+0.4);
}
function quorumSfx(){
  if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  const o1=a.createOscillator(), g1=a.createGain();
  o1.type='sawtooth';
  o1.frequency.setValueAtTime(120, t);
  o1.frequency.exponentialRampToValueAtTime(1200, t+0.6);
  g1.gain.setValueAtTime(0.25, t);
  g1.gain.exponentialRampToValueAtTime(0.0001, t+0.75);
  o1.connect(g1); g1.connect(masterNode(a));
  o1.start(t); o1.stop(t+0.8);
  explosionSfx(1.8);
}
const PENTATONIC_SCALE = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51];
function pentatonicNoteSfx(idx){
  if(!soundOn)return; const a=ac(); if(!a)return; const t=a.currentTime;
  const f = PENTATONIC_SCALE[idx % PENTATONIC_SCALE.length];
  const o=a.createOscillator(), g=a.createGain();
  o.type='sine'; o.frequency.value=f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.12, t+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.12);
  o.connect(g); g.connect(masterNode(a));
  o.start(t); o.stop(t+0.13);
}

/* ============ BOOT XP ============ */
(function(){
  const spinHTML=Array.from({length:8},function(_,i){const a=i*Math.PI/4,x=50+38*Math.cos(a),y=50+38*Math.sin(a);
    return '<i style="left:'+x+'%; top:'+y+'%; opacity:'+((i+1)/8)+'"></i>';}).join('');
  document.getElementById('spin1').innerHTML=spinHTML; document.getElementById('spin2').innerHTML=spinHTML;
  const biosLines=['ARCSYSTEMS BIOS v6.6.6 (C) 2094 Federal ARC Network','CPU : MEME-PROC 666 MHz',
    'Detecting drives... C:\\ ARC   D:\\ MEMES   E:\\ SHIPS   F:\\ BROWSER','Warning: toxic memes detected in sector 7G',
    'Starting ARC SYSTEM Professional...',''];
  const biosEl=document.getElementById('bios'), boot=document.getElementById('boot');
  let bi=0,done=false,timers=[];
  function later(fn,ms){ timers.push(setTimeout(fn,ms)); }
  function typeBios(){
    if(done)return;
    if(bi<biosLines.length){
      biosEl.textContent+=biosLines[bi++]+'\n';
      // Poster-style POST memory counter for realism (counts up to 500M)
      if(bi===1){
        let mem=0;
        const memLine='Memory Test: ';
        later(function tickMem(){
          if(done)return;
          mem=Math.min(mem+Math.floor(18000000+Math.random()*22000000), 524288000);
          const cur=biosEl.textContent.split('\n')[0] + '\n';
          biosEl.textContent=cur + memLine + String(mem).replace(/\B(?=(\d{3})+(?!\d))/g,',') + '   ' + (mem>=524288000?'OK':'');
          if(mem<524288000) later(tickMem, 90);
          else { biosEl.textContent+='\n\n'; typeBios(); }
        }, 120);
        return; // bi==1 line already printed above
      }
      later(typeBios,240);
    } else later(showLoad,500);
  }
  function showLoad(){ if(done)return; biosEl.style.display='none'; document.getElementById('xpload').classList.add('show'); later(showWelcome,2600); }
  function showWelcome(){ if(done)return; document.getElementById('xpload').classList.remove('show'); document.getElementById('xpwelcome').classList.add('show'); later(finishBoot,1900); }
  function finishBoot(){ if(done)return; done=true; timers.forEach(clearTimeout);
    boot.classList.add('fade'); setTimeout(function(){ boot.style.display='none'; },650);
    loginJingle();
    setTimeout(function(){ spawnToast('✅ ARCSYSTEMS XP started. Welcome, infected node 😎'); },900); }
  function loginJingle(){
    if(!soundOn) return; const a=ac(); if(!a)return;
    const notes=[659.25, 880.00, 1108.73]; // E5, A5, C#6
    notes.forEach(function(f,i){
      const t=a.currentTime + i*0.16;
      const o=a.createOscillator(), g=a.createGain();
      o.type='triangle'; o.frequency.setValueAtTime(f,t);
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(0.14,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t+0.5);
      o.connect(g); g.connect(masterNode(a)); o.start(t); o.stop(t+0.55);
    });
    const t=a.currentTime+0.5;
    const o2=a.createOscillator(), g2=a.createGain();
    o2.type='sine'; o2.frequency.setValueAtTime(1760,t);
    g2.gain.setValueAtTime(0.0001,t);
    g2.gain.exponentialRampToValueAtTime(0.08,t+0.05);
    g2.gain.exponentialRampToValueAtTime(0.0001,t+0.9);
    o2.connect(g2); g2.connect(masterNode(a)); o2.start(t); o2.stop(t+1);
  }
  addEventListener('keydown',finishBoot); addEventListener('mousedown',finishBoot);
  typeBios(); try{ sfx(1200,.06,'square',.06); }catch(e){} // BIOS POST beep
})();

/* ============ CONFIG ============ */
const BLISS="url('https://image.qwenlm.ai/public_source/3d979a43-82ee-4343-8b69-e361d504124c/1a2ff0b7b-b28f-4d4d-9986-4323eaa63215.png') center/cover no-repeat";
const WPS=[
 {id:'bliss',name:'XP Bliss',css:BLISS,prev:BLISS},
 {id:'azul',name:'Blue Moon',css:'linear-gradient(180deg,#3a8ae8 0%,#245edb 40%,#003399 100%)',prev:'linear-gradient(180deg,#3a8ae8,#003399)'},
 {id:'noche',name:'ARC Night',css:'radial-gradient(ellipse at 50% 30%, #10203a 0%, #01020a 70%)',prev:'radial-gradient(ellipse at 50% 30%, #10203a, #01020a)'},
 {id:'matrix',name:'Matrix',css:'repeating-linear-gradient(0deg, rgba(0,255,65,.14) 0 2px, transparent 2px 7px), linear-gradient(180deg,#001a00,#000)',prev:'repeating-linear-gradient(0deg, rgba(0,255,65,.3) 0 2px, #000 2px 7px)'},
 {id:'rosa',name:'Pink Meme',css:'linear-gradient(135deg,#ff9a9e 0%,#fad0c4 30%,#a18cd1 70%,#fbc2eb 100%)',prev:'linear-gradient(135deg,#ff9a9e,#a18cd1)'}];
const THS=[{id:'',name:'Blue Moon',prev:'linear-gradient(180deg,#3f8cf3,#1941a5)'},
 {id:'green',name:'Olive Green',prev:'linear-gradient(180deg,#7ec96f,#2f6b28)'},
 {id:'silver',name:'Silver',prev:'linear-gradient(180deg,#f4f4f4,#8a8a8a)'},
 {id:'arc',name:'ARC Night',prev:'linear-gradient(180deg,#12203a,#00d4ff)'}];
let curWP='bliss',curTH='';
function buildConfig(){
  const wg=document.getElementById('wpGrid'); wg.innerHTML='';
  WPS.forEach(function(w){ const d=document.createElement('div'); d.className='cfg-opt'+(curWP===w.id?' sel':'');
    d.innerHTML='<div class="cfg-prev" style="background:'+w.prev+'"></div><div class="cfg-name">'+w.name+'</div><div class="tick">'+(curWP===w.id?'✓':'')+'</div>';
    d.onclick=function(){ curWP=w.id; document.getElementById('wallpaper').style.background=w.css; buildConfig(); spawnToast('🖼️ Wallpaper: "'+w.name+'"'); };
    wg.appendChild(d); });
  const tg=document.getElementById('thGrid'); tg.innerHTML='';
  THS.forEach(function(t){ const d=document.createElement('div'); d.className='cfg-opt'+(curTH===t.id?' sel':'');
    d.innerHTML='<div class="cfg-prev" style="background:'+t.prev+'"></div><div class="cfg-name">'+t.name+'</div><div class="tick">'+(curTH===t.id?'✓':'')+'</div>';
    d.onclick=function(){ curTH=t.id; document.body.className=t.id?'theme-'+t.id:''; buildConfig(); spawnToast(' Theme: '+t.name); };
    tg.appendChild(d); });
}
buildConfig();

/* ============ CONTEXT MENU ============ */
const ctxMenu=document.getElementById('ctxMenu');
document.addEventListener('contextmenu',function(e){
  if(e.target.closest('#msGrid')||e.target.closest('#navesGame')||e.target.closest('input,textarea'))return;
  e.preventDefault(); ctxMenu.classList.add('show');
  ctxMenu.style.left=Math.min(e.clientX,innerWidth-240)+'px'; ctxMenu.style.top=Math.min(e.clientY,innerHeight-280)+'px'; });
document.addEventListener('mousedown',function(e){ if(!e.target.closest('#ctxMenu'))ctxMenu.classList.remove('show'); });
ctxMenu.addEventListener('click',function(e){
  const it=e.target.closest('.ctx-item'); if(!it)return; ctxMenu.classList.remove('show');
  const a=it.dataset.a;
  if(a==='refresh')spawnToast('🔄 Desktop refreshed.');
  if(a==='copy')spawnToast('📋 Copied: 1 meme to clipboard.');
  if(a==='paste')spawnToast('📥 Pasted: a cute virus joined.');
  if(a==='cut')spawnToast('✂️ Cut: the ARC Network forbids cutting memes.');
  if(a==='new')spawnToast('🆕 New → memes.txt created (lie).');
  if(a==='personalize'||a==='config')openWindow('win-config');
  if(a==='props')openWindow('win-config'); });

/* ============ WINDOWS MANAGEMENT ============ */
let zTop=600;
function focusWin(w){ w.style.zIndex=++zTop; refreshTask(); }
function uiWindowSfx(kind){ try{ if(kind==='open') sfx(700,.07,'triangle',.05); else if(kind==='close') sfx(420,.06,'triangle',.05); else sfx(600,.04,'square',.04); }catch(e){} }
function openWindow(id){ const w=document.getElementById(id); if(!w)return; w.classList.add('open'); w.style.display='flex'; focusWin(w); uiWindowSfx('open');
  if(id==='win-browser'){
    clearAllPopups(); // silence virus popups while browsing
    if(typeof browserTabs !== 'undefined' && browserTabs.length===0){ newTab(); }
  } }
function closeWindow(id){ const w=document.getElementById(id); if(!w)return; w.classList.remove('open'); w.style.display='none'; uiWindowSfx('close'); refreshTask(); }
function minimize(id){ const w=document.getElementById(id); if(!w)return; w.style.display='none'; uiWindowSfx('min'); refreshTask(); }
function maxWin(id){ const w=document.getElementById(id); if(!w)return;
  if(w.dataset.max==='1'){ const p=JSON.parse(w.dataset.prev||'{}');
    w.style.left=p.left||'100px'; w.style.top=p.top||'80px'; w.style.width=p.width||'500px'; w.style.height=p.height||'auto'; w.dataset.max='0'; }
  else { w.dataset.prev=JSON.stringify({left:w.style.left,top:w.style.top,width:w.style.width,height:w.style.height});
    w.style.left='2px'; w.style.top='2px'; w.style.width=(innerWidth-6)+'px'; w.style.height=(innerHeight-42)+'px'; w.dataset.max='1'; }
  focusWin(w); }
function taskClick(id){ const w=document.getElementById(id); if(!w)return;
  if(w.style.display==='none'||!w.classList.contains('open'))openWindow(id);
  else if(parseInt(w.style.zIndex)===zTop)minimize(id); else focusWin(w); }
function refreshTask(){
  ['win-main','win-browser','win-memes','win-note','win-games','win-mines','win-spider','win-pinball','win-config'].forEach(function(id){
    const w=document.getElementById(id), b=document.getElementById('tb-'+id);
    if(!b || !w) return;
    // Taskbar shows ONLY currently-open apps; minimized ones stay but dimmed
    const open = w.classList.contains('open');
    const visible = open && w.style.display !== 'none';
    b.style.display = open ? 'flex' : 'none';
    b.style.opacity = visible ? 1 : 0.55;
    b.classList.toggle('active', visible && parseInt(w.style.zIndex) === zTop);
  });
}
document.querySelectorAll('.window').forEach(function(w){
  const g=document.createElement('div'); g.className='grip';
  g.addEventListener('mousedown',function(e){ e.preventDefault(); e.stopPropagation();
    const r=w.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,sw=r.width,sh=r.height;
    function mv(ev){ w.style.width=Math.max(280,sw+ev.clientX-sx)+'px'; w.style.height=Math.max(180,sh+ev.clientY-sy)+'px'; w.dataset.max='0'; }
    function up(){ removeEventListener('mousemove',mv); removeEventListener('mouseup',up); }
    addEventListener('mousemove',mv); addEventListener('mouseup',up); });
  w.appendChild(g); });
document.addEventListener('mousedown',function(e){
  const tb=e.target.closest('.title-bar');
  if(tb&&!e.target.closest('button')){
    const w=tb.parentElement; focusWin(w);
    if(w.dataset.max==='1')return;
    const r=w.getBoundingClientRect(),ox=e.clientX-r.left,oy=e.clientY-r.top;
    function mv(ev){ w.style.left=Math.min(Math.max(ev.clientX-ox,-40),innerWidth-80)+'px'; w.style.top=Math.min(Math.max(ev.clientY-oy,0),innerHeight-60)+'px'; }
    function up(){ removeEventListener('mousemove',mv); removeEventListener('mouseup',up); }
    addEventListener('mousemove',mv); addEventListener('mouseup',up);
  }
  else if(!e.target.closest('.start-menu')&&!e.target.closest('#startBtn')){ document.getElementById('startMenu').classList.remove('open'); document.getElementById('startBtn').classList.remove('on'); }
  const w=e.target.closest('.window'); if(w)focusWin(w); });
function toggleStart(ev){ if(ev)ev.stopPropagation(); const m=document.getElementById('startMenu'); m.classList.toggle('open');
  document.getElementById('startBtn').classList.toggle('on',m.classList.contains('open')); }
setInterval(function(){
  const now=new Date();
  const el=document.getElementById('clock');
  if(el){ el.textContent=now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    el.title=now.toLocaleDateString('en-US',{weekday:'long', year:'numeric', month:'long', day:'numeric'}); }
},1000);

/* ============ MOVABLE DESKTOP ICONS ============ */
function initDesktopIcons(){
  const icons = document.querySelectorAll('.dicon');
  if(!icons.length) return;

  // Initialize icon positions in grid layout on desktop
  const isDesktop = window.innerWidth > 768;
  const startX = 14;
  const startY = 14;
  const itemH = 78;
  const itemW = 90;
  const maxRowsPerCol = Math.max(3, Math.floor((window.innerHeight - 80) / itemH));

  icons.forEach(function(icon, idx){
    if(isDesktop){
      const col = Math.floor(idx / maxRowsPerCol);
      const row = idx % maxRowsPerCol;
      const initX = startX + col * itemW;
      const initY = startY + row * itemH;
      icon.style.left = initX + 'px';
      icon.style.top = initY + 'px';
    }

    // Drag-and-drop handler for desktop icons
    icon.addEventListener('mousedown', function(e){
      if(e.button !== 0) return; // only left click drags
      if(window.innerWidth <= 768) return; // responsive mobile keeps sheet/grid
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const rect = icon.getBoundingClientRect();
      const offsetX = startClientX - rect.left;
      const offsetY = startClientY - rect.top;
      let isDragging = false;

      function onMouseMove(ev){
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        if(!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)){
          isDragging = true;
          icon.classList.add('dragging');
        }
        if(isDragging){
          const newLeft = Math.min(Math.max(ev.clientX - offsetX, 0), window.innerWidth - 86);
          const newTop = Math.min(Math.max(ev.clientY - offsetY, 0), window.innerHeight - 80);
          icon.style.left = newLeft + 'px';
          icon.style.top = newTop + 'px';
        }
      }

      function onMouseUp(ev){
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        if(isDragging){
          // Marca para que el manejador táctil no interprete el final del
          // arrastre como un tap de apertura.
          icon.dataset.dragged = '1';
          setTimeout(function(){ icon.classList.remove('dragging'); }, 50);
        }
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  });
}
initDesktopIcons();
window.addEventListener('resize', function(){
  if(window.innerWidth > 768){
    // Keep icons within viewport bounds on resize
    document.querySelectorAll('.dicon').forEach(function(icon){
      const curL = parseInt(icon.style.left, 10);
      const curT = parseInt(icon.style.top, 10);
      if(!isNaN(curL) && curL > window.innerWidth - 86){
        icon.style.left = Math.max(10, window.innerWidth - 90) + 'px';
      }
      if(!isNaN(curT) && curT > window.innerHeight - 80){
        icon.style.top = Math.max(10, window.innerHeight - 84) + 'px';
      }
    });
  }
});

/* ============ AD / SCANNER / POPUPS / BSOD ============ */
let adInterval=null,adSecs=15;
function showAd(){ clearAllPopups(); document.getElementById('adOverlay').classList.add('show'); adSecs=15; paintAdTimer(); clearInterval(adInterval);
  adInterval=setInterval(function(){ adSecs--; if(adSecs<=0)adSecs=15; paintAdTimer(); },1000); }
function paintAdTimer(){ document.getElementById('adTimer').textContent='00:'+String(adSecs).padStart(2,'0'); }
function hideAd(v){ clearInterval(adInterval); document.getElementById('adOverlay').classList.remove('show');
  // The antivirus really worked: ALL threats gone and 60s of peace
  clearAllPopups(); popupGraceUntil = Date.now() + 60000;
  spawnToast('🛡️ System clean. 60s of virus-free peace...');
}

let scanning=false;
function clearAllPopups(){ document.querySelectorAll('.popup').forEach(function(p){p.remove();}); }
const logLines=[['C:\\ARC> closing popups... OK',''],['C:\\ARC> analyzing homework.doc ...',''],
 ['   ↳ threat: homework_virus.exe','bad'],['C:\\ARC> scanning RAM...',''],['   ↳ full of cached memes','warn'],
 ['C:\\ARC> detecting rickroll.exe ...',''],['   ↳ never gonna give you up','bad'],['C:\\ARC> querying the ARC Network...',''],
 ['   ↳ "all under control" 😈','warn']];
const threatNames=['rickroll.exe','toxic_meme.dll','groovy_trojan.sys','worm_arc.bat','happy_keylogger.dll','reggaeton_adware.exe'];
function log(m,c){ const el=document.getElementById('scanLog'),d=document.createElement('div'); if(c)d.className=c; d.textContent=m; el.appendChild(d); el.scrollTop=el.scrollHeight; }
function startScan(){ if(scanning)return; scanning=true; clearAllPopups();
  document.getElementById('threatBox').innerHTML=''; document.getElementById('scanLog').innerHTML='';
  document.getElementById('sbState').textContent='Scanning...'; document.getElementById('scanBtn').textContent='⏳ SCANNING...';
  let p=0,li=0,v=0;
  const iv=setInterval(function(){ p+=Math.random()*4+1.5; if(p>=100)p=100;
    document.getElementById('progFill').style.width=p+'%'; document.getElementById('progTxt').textContent='Scanning... '+Math.floor(p)+'%';
    if(li<logLines.length&&Math.random()>.5){ log(logLines[li][0],logLines[li][1]); li++; }
    if(Math.random()>.6&&v<666){ v+=Math.floor(Math.random()*40)+7; document.getElementById('virusCount').textContent=v;
      const tb=document.getElementById('threatBox'),row=document.createElement('div'); row.className='threat-row';
      row.innerHTML='<span>☣️ '+threatNames[Math.floor(Math.random()*threatNames.length)]+'</span><span>detected</span>';
      tb.prepend(row); if(tb.children.length>5)tb.lastChild.remove(); }
    if(p>=100){ clearInterval(iv); document.getElementById('virusCount').textContent=666;
      log('C:\\ARC> 666 threats. Eliminating ALL...','bad'); document.getElementById('sbState').textContent='Cleaning...';
      let k=0; const cl=setInterval(function(){ k++; document.getElementById('virusCount').textContent=Math.max(666-k*90,0);
        if(k>=8){ clearInterval(cl); document.getElementById('virusCount').textContent=0; document.getElementById('threatBox').innerHTML='';
          document.getElementById('progTxt').textContent='✅ PC 100% clean'; document.getElementById('sbState').textContent='Clean ✅';
          document.getElementById('scanBtn').textContent='▶ SCAN AGAIN';
          log('C:\\ARC> threats eliminated ✅',''); log('C:\\ARC> showing 12-month renewal...','warn');
          confettiBurst(innerWidth/2,innerHeight/2); scanning=false; setTimeout(showAd,900); } },120); } },120); }

const popData=[['⚠️ VIRUS DETECTED','rickroll.exe in your heart. Play it?','🎵'],['☣️ CRITICAL THREAT','toxic_meme.dll dancing reggaeton in your RAM.','🕺'],
 ['🚨 FEDERAL ALERT','Your PC was adopted by the ARC Network.','🌐'],['⚠️ SUBSCRIPTION','Your license is crying. Renew on piper.meme ',''],
 ['☣️ ERROR 666','Out of clean memes.','💀']];
let popCount=0;
let popupGraceUntil = 0;      // paz tras el antivirus ("PC limpio")
let popupSnoozeUntil = 0;     // silencio tras cerrar un popup a mano
let nextPopupAt = 0;          // instante del próximo popup permitido

/* ===== MOTOR DE VIRUS — MODO TRANQUILO =====
   Antes: ~70% de probabilidad cada 2.2 s, hasta 5 ventanas a la vez y ráfagas,
   y cada Accept/Ignore/✕ lanzaba OTRO popup inmediatamente encadenándose sin
   fin. Era agotador (y en móvil tapaba el escritorio entero).
   Ahora: uno cada 45-90 s, máximo 2 en pantalla, sin cadenas al cerrar y 90 s
   de silencio cuando el usuario cierra uno. */
const POPUP_MIN_GAP_MS = 45000;   // separación mínima entre ventanas
const POPUP_MAX_GAP_MS = 90000;   // separación máxima
const POPUP_MAX_ON_SCREEN = 2;    // nunca más de 2 a la vez
const POPUP_SNOOZE_MS = 90000;    // silencio después de que el usuario cierre una

function scheduleNextPopup(from){
  nextPopupAt = from + POPUP_MIN_GAP_MS + Math.random() * (POPUP_MAX_GAP_MS - POPUP_MIN_GAP_MS);
  return nextPopupAt;
}
scheduleNextPopup(Date.now());

/** El usuario interactuó con un popup: se calla un rato en vez de encadenar otro. */
function snoozePopups(){
  popupSnoozeUntil = Date.now() + POPUP_SNOOZE_MS;
  scheduleNextPopup(popupSnoozeUntil);
}

function popupsSuppressed(){
  const now = Date.now();
  if(now < popupGraceUntil) return true;   // PC limpio tras el antivirus
  if(now < popupSnoozeUntil) return true;  // el usuario acaba de cerrar uno
  if(now < nextPopupAt) return true;       // todavía no toca
  const b=document.getElementById('win-browser');
  const n=document.getElementById('navesGame');
  const ad=document.getElementById('adOverlay');
  return (b && b.style.display!=='none')
      || (n && n.classList.contains('show'))
      || (ad && ad.classList.contains('show'));
}
function spawnPopup(){ if(scanning)return; if(popupsSuppressed())return;
  if(document.querySelectorAll('.popup').length>=POPUP_MAX_ON_SCREEN)return;
  const d=popData[Math.floor(Math.random()*popData.length)],el=document.createElement('div');
  el.className='popup'; el.style.zIndex=500+(popCount++%40);
  el.style.left=(60+Math.random()*(innerWidth-440))+'px'; el.style.top=(40+Math.random()*(innerHeight-340))+'px';
  el.innerHTML='<div class="title-bar danger"><span>⚠️ VirusARC — Alert</span><div class="tb-btns"><button class="close" onclick="popClose(this)">✕</button></div></div>'+
   '<div class="pbody"><span class="pemoji">'+d[2]+'</span><div><b>'+d[0]+'</b><br>'+d[1]+'</div></div>'+
   '<div class="pbtns"><button class="btn98" onclick="popAccept(this)">Accept</button><button class="btn98" onclick="popIgnore(this)">Ignore</button></div>';
  document.getElementById('popLayer').appendChild(el);
  el.querySelector('.title-bar').addEventListener('mousedown',function(e){ if(e.target.closest('button'))return;
    const r=el.getBoundingClientRect(),ox=e.clientX-r.left,oy=e.clientY-r.top;
    function mv(ev){ el.style.left=(ev.clientX-ox)+'px'; el.style.top=(ev.clientY-oy)+'px'; }
    function up(){ removeEventListener('mousemove',mv); removeEventListener('mouseup',up); }
    addEventListener('mousemove',mv); addEventListener('mouseup',up); }); }
/* Cerrar siempre calla un rato: nunca se encadena una ventana nueva */
function popClose(b){ const p=b.closest('.popup'); if(p) p.remove(); snoozePopups(); }
function popAccept(b){ const p=b.closest('.popup'); if(p) p.remove(); snoozePopups(); spawnToast('🛡️ Has aceptado... el ARC Network te lo agradece 😈'); }
function popIgnore(b){ const p=b.closest('.popup'); if(p) p.remove(); snoozePopups(); }
setInterval(function(){
  if(!popupsSuppressed()) spawnPopup();
}, 5000);
// Ambient simulated network notifications (keeps the OS feeling alive, never spammy)
const AMBIENT_MSGS=['🌐 ARC Network: 1,000,000+ nodes online','📦 New block synced — height #6,660,042','🛰️ Node handshake OK (12ms)',
  '🔒 Encrypted channel to piper.meme renewed','🧠 ARC AI: model refresh complete','💾 Auto-save: meme cache defragmented'];
setInterval(function(){
  const adOn = document.getElementById('adOverlay').classList.contains('show');
  const n = document.getElementById('navesGame');
  if(popupsSuppressed() || adOn) return; // don't compete with browser/game/ad
  if(Math.random()<.5) spawnToast(AMBIENT_MSGS[Math.floor(Math.random()*AMBIENT_MSGS.length)]);
}, 42000);
function openMeme(name, url){ try{ sfx(880,.1,'square',.1); }catch(e){} if(url) window.open(url,'_blank'); }
function soonClick(name){ const t=document.createElement('div'); t.className='popup'; t.style.width='340px'; t.style.zIndex=560;
  t.style.left=(innerWidth/2-170)+'px'; t.style.top=(innerHeight/2-120)+'px';
  t.innerHTML='<div class="title-bar purple"><span>🚧 '+name+'</span><div class="tb-btns"><button class="close" onclick="this.closest(\'.popup\').remove()">✕</button></div></div>'+
   '<div class="pbody" style="flex-direction:column; align-items:center; text-align:center;"><span class="pemoji">🚧</span>'+
   '<div><b>COMING SOON TO PIPER.MEME</b><br>"'+name+'" is in creative quarantine.</div></div>'+
   '<div class="pbtns"><a class="btn98 green" href="https://piper.meme" target="_blank" rel="noopener">GO TO PIPER.MEME</a><button class="btn98" onclick="this.closest(\'.popup\').remove()">Wait</button></div>';
  document.getElementById('popLayer').appendChild(t); }
function spawnToast(msg){ const t=document.createElement('div'); t.className='popup'; t.style.width='320px'; t.style.zIndex=560;
  t.style.left=(innerWidth/2-160)+'px'; t.style.top=(innerHeight/2-80)+'px';
  // Se escapa el mensaje: los toasts son texto plano y algunos llevan input del usuario.
  t.innerHTML='<div class="title-bar green"><span> System</span><div class="tb-btns"><button class="close" onclick="this.closest(\'.popup\').remove()">✕</button></div></div><div class="pbody" style="font-size:12px;">'+esc(msg)+'</div>';
  document.getElementById('popLayer').appendChild(t); setTimeout(function(){t.remove();},4000); }
const showToast = spawnToast;

let bsodTimer;
function showBsod(c){ document.getElementById('bsodCause').textContent=c||'DO_NOT_TOUCH.exe'; document.getElementById('bsod').classList.add('show');
  let p=0; clearInterval(bsodTimer); bsodTimer=setInterval(function(){ p=Math.min(p+Math.random()*9,100); document.getElementById('bsodPct').textContent=Math.floor(p); if(p>=100)clearInterval(bsodTimer); },200);
  setTimeout(hideBsod,6000); }
function hideBsod(){ document.getElementById('bsod').classList.remove('show'); clearInterval(bsodTimer); }
function showShutdown(){ document.getElementById('shutdown').classList.add('show'); setTimeout(function(){ window.location.href='https://antivirusarc.meme'; },2400); }

/* ============ MINESWEEPER ============ */
let msBoard=[],msOpen=0,msFlags=0,msDead=false,msTimer=null,msSec=0,msStarted=false;
function msFace(f){ const el=document.getElementById('msFace'); if(el) el.textContent=f; }
function msNew(){
  clearInterval(msTimer); msTimer=null; msSec=0; msStarted=false;
  document.getElementById('msTime').textContent=0;
  msOpen=0; msFlags=0; msDead=false;
  document.getElementById('msMines').textContent=10;
  msFace('🙂');
  msBoard=Array.from({length:9},function(){return Array.from({length:9},function(){return {m:0,o:0,f:0,n:0};});});
  msRender();
}
function msPlaceMines(firstR, firstC){
  let pl=0;
  while(pl<10){
    const r=Math.floor(Math.random()*9), c=Math.floor(Math.random()*9);
    // Guarantee 3x3 safety zone around the first clicked cell
    if(Math.abs(r-firstR)<=1 && Math.abs(c-firstC)<=1) continue;
    if(!msBoard[r][c].m){ msBoard[r][c].m=1; pl++; }
  }
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){
    let n=0;
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
      const rr=r+dr, cc=c+dc;
      if(rr>=0 && rr<9 && cc>=0 && cc<9 && msBoard[rr][cc].m) n++;
    }
    msBoard[r][c].n=n;
  }
}
function msRender(){
  const g=document.getElementById('msGrid');
  if(!g) return;
  g.innerHTML='';
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){
    const cell=msBoard[r][c], d=document.createElement('div');
    d.className='ms-cell'+(cell.o?' open':'')+(cell.o&&cell.m?' mine':'');
    if(cell.o){
      if(cell.m) d.textContent='💣';
      else if(cell.n) d.innerHTML='<span class="c'+cell.n+'">'+cell.n+'</span>';
    } else if(cell.f){
      d.textContent='🚩';
    }
    d.onclick=function(){ msClick(r,c); };
    d.ondblclick=function(e){ e.preventDefault(); msChord(r,c); };
    d.oncontextmenu=function(e){ e.preventDefault(); msFlag(r,c); };
    d.onmousedown=function(e){ if(!msDead && e.button===0) msFace('😮'); };
    d.onmouseup=function(){ if(!msDead) msFace('🙂'); };
    g.appendChild(d);
  }
}
function msFlag(r,c){
  if(msDead || !msBoard[r] || msBoard[r][c].o) return;
  msBoard[r][c].f = !msBoard[r][c].f;
  msFlags += msBoard[r][c].f ? 1 : -1;
  document.getElementById('msMines').textContent = Math.max(0, 10 - msFlags);
  sfx(540, 0.04, 'sine', 0.1);
  msRender();
}
function msClick(r,c){
  if(msDead || !msBoard[r]) return;
  const cell=msBoard[r][c];
  if(cell.f || cell.o) return;

  if(!msStarted){
    msStarted=true;
    msPlaceMines(r, c);
    msTimer=setInterval(function(){
      if(!msDead){ msSec++; document.getElementById('msTime').textContent=msSec; }
    }, 1000);
  }

  if(cell.m){
    msDead=true;
    clearInterval(msTimer);
    msFace('😵');
    msBoard.forEach(function(row){ row.forEach(function(x){ if(x.m) x.o=1; }); });
    msRender();
    sfx(140, 0.4, 'sawtooth', 0.2);
    spawnToast('💣 BOOM! Stepped on a mine.');
    return;
  }

  const st=[[r,c]];
  while(st.length){
    const cur=st.pop(), rr=cur[0], cc=cur[1];
    const x=msBoard[rr][cc];
    if(x.o || x.f || x.m) continue;
    x.o=1; msOpen++;
    if(x.n===0){
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        const a=rr+dr, b=cc+dc;
        if(a>=0 && a<9 && b>=0 && b<9 && !msBoard[a][b].o) st.push([a,b]);
      }
    }
  }
  sfx(440, 0.05, 'triangle', 0.08);
  msRender();
  if(msOpen===71){
    msDead=true;
    clearInterval(msTimer);
    msFace('😎');
    document.getElementById('msMines').textContent=0;
    confettiBurst(innerWidth/2, innerHeight/2);
    sfx(660, 0.2, 'sine', 0.15); setTimeout(()=>sfx(880, 0.3, 'sine', 0.15), 180);
    spawnToast('🏆 YOU WON Minesweeper in '+msSec+'s!');
  }
}
function msChord(r,c){
  if(msDead || !msBoard[r] || !msBoard[r][c].o || msBoard[r][c].n===0) return;
  const targetN = msBoard[r][c].n;
  let flagCount = 0;
  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
    const a=r+dr, b=c+dc;
    if(a>=0 && a<9 && b>=0 && b<9 && msBoard[a][b].f) flagCount++;
  }
  if(flagCount === targetN){
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++){
      const a=r+dr, b=c+dc;
      if(a>=0 && a<9 && b>=0 && b<9 && !msBoard[a][b].o && !msBoard[a][b].f){
        msClick(a, b);
      }
    }
  }
}
msNew();

/* ============ SPIDER ============ */
let spCols=[],spStock=[],spSel=null,spScore=500,spMoves=0,spDone=0,spHistory=[];
const spNames=['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function spMsg(t){ document.getElementById('spMsg').textContent=t; }
function spSaveState(){
  spHistory.push({
    cols: JSON.parse(JSON.stringify(spCols)),
    stock: JSON.parse(JSON.stringify(spStock)),
    score: spScore,
    moves: spMoves,
    done: spDone
  });
  if(spHistory.length > 25) spHistory.shift();
}
function spUndo(){
  if(!spHistory.length){ spMsg('No moves to undo.'); return; }
  const state = spHistory.pop();
  spCols = state.cols;
  spStock = state.stock;
  spScore = state.score;
  spMoves = state.moves;
  spDone = state.done;
  spSel = null;
  sfx(360, 0.08, 'sine', 0.1);
  spMsg('Move undone.');
  spRender();
}
function spiderNew(){
  const deck=[];
  for(let s=0;s<8;s++) for(let v=1;v<=13;v++) deck.push({v:v,face:false});
  for(let i=deck.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    const tmp=deck[i]; deck[i]=deck[j]; deck[j]=tmp;
  }
  spCols=Array.from({length:10},function(){return [];});
  let k=0;
  for(let c=0;c<10;c++){
    const n=c<4?6:5;
    for(let i=0;i<n;i++) spCols[c].push(deck[k++]);
  }
  spCols.forEach(function(col){ col[col.length-1].face=true; });
  spStock=deck.slice(k);
  spSel=null; spScore=500; spMoves=0; spDone=0; spHistory=[];
  spMsg('Select a face-up card.');
  spRender();
}
function spMovable(ci,idx){
  const col=spCols[ci];
  if(idx<0||idx>=col.length||!col[idx].face) return false;
  for(let i=idx;i<col.length-1;i++){
    if(!col[i].face||!col[i+1].face||col[i].v!==col[i+1].v+1) return false;
  }
  return true;
}
function spValidTarget(ci,hv){
  const d=spCols[ci];
  return d.length===0 || d[d.length-1].v===hv+1;
}
function spClickCard(ci,i){
  const col=spCols[ci];
  if(!col[i].face){ spMsg('Face-down card 🙈'); return; }
  if(spSel&&spSel.ci===ci&&spSel.idx===i){ spSel=null; spRender(); return; }
  if(spSel){
    if(ci===spSel.ci){ spSel=null; spRender(); return; }
    spTryMove(ci);
    return;
  }
  if(spMovable(ci,i)){
    spSel={ci:ci,idx:i};
    sfx(580, 0.05, 'sine', 0.08);
    spMsg('Selected. Valid columns highlighted.');
    spRender();
  } else {
    spMsg('Does not form a descending sequence.');
  }
}
function spTryMove(ci){
  if(!spSel) return;
  const from=spCols[spSel.ci], mv=from.slice(spSel.idx);
  if(spValidTarget(ci,mv[0].v)){
    spSaveState();
    spCols[spSel.ci]=from.slice(0,spSel.idx);
    spCols[ci]=spCols[ci].concat(mv);
    spMoves++;
    spScore=Math.max(spScore-1,0);
    const src=spCols[spSel.ci];
    if(src.length && !src[src.length-1].face) src[src.length-1].face=true;
    spSel=null;
    sfx(480, 0.06, 'triangle', 0.1);
    spCheckSeq(ci);
    spRender();
    if(spDone===8){
      confettiBurst(innerWidth/2,innerHeight/2);
      spawnToast('🏆 YOU WON SPIDER SOLITAIRE!');
      sfx(660, 0.2, 'sine', 0.2); setTimeout(()=>sfx(880, 0.3, 'sine', 0.2), 200);
    }
  } else {
    spMsg('Invalid move.');
    spSel=null;
    spRender();
  }
}
function spCheckSeq(ci){
  const col=spCols[ci];
  if(col.length<13) return;
  const tail=col.slice(-13);
  let ok=true;
  for(let j=0;j<13;j++){
    if(!tail[j].face||tail[j].v!==13-j){ ok=false; break; }
  }
  if(ok){
    spCols[ci]=col.slice(0,-13);
    spDone++;
    spScore+=100;
    const c2=spCols[ci];
    if(c2.length && !c2[c2.length-1].face) c2[c2.length-1].face=true;
    confettiBurst(innerWidth/2,innerHeight/2);
    sfx(880, 0.3, 'square', 0.18);
    spawnToast('✨ K→A sequence complete! +100');
  }
}
function spDeal(){
  if(!spStock.length){ spMsg('Deck is empty.'); return; }
  if(spCols.some(function(c){ return !c.length; })){
    spMsg('Cannot deal with empty columns.');
    sfx(200, 0.1, 'sawtooth', 0.1);
    return;
  }
  spSaveState();
  for(let c=0;c<10 && spStock.length;c++){
    const cd=spStock.pop();
    cd.face=true;
    spCols[c].push(cd);
  }
  spSel=null;
  sfx(520, 0.08, 'sine', 0.12);
  for(let c=0;c<10;c++) spCheckSeq(c);
  spRender();
}
function spHint(){
  for(let ci=0;ci<10;ci++){
    const col=spCols[ci];
    for(let i=col.length-1;i>=0;i--){
      if(!spMovable(ci,i)) continue;
      const hv=col[i].v;
      for(let t=0;t<10;t++){
        if(t!==ci && spValidTarget(t,hv)){
          spSel={ci:ci,idx:i};
          sfx(620, 0.08, 'sine', 0.1);
          spMsg('💡 Move to column '+(t+1));
          spRender();
          return;
        }
      }
    }
  }
  spMsg('No moves available: deal cards from stock.');
}
function spAuto(ci,i){
  if(!spMovable(ci,i)) return;
  const hv=spCols[ci][i].v;
  let tg=-1;
  for(let t=0;t<10;t++){
    if(t!==ci && spCols[t].length && spCols[t][spCols[t].length-1].v===hv+1){ tg=t; break; }
  }
  if(tg<0){
    for(let t=0;t<10;t++){
      if(t!==ci && !spCols[t].length){ tg=t; break; }
    }
  }
  if(tg<0) return;
  spSel={ci:ci,idx:i};
  spTryMove(tg);
}
function spRender(){
  document.getElementById('spScore').textContent=spScore;
  document.getElementById('spMoves').textContent=spMoves;
  document.getElementById('spDoneN').textContent=spDone;
  document.getElementById('spStock').textContent=Math.floor(spStock.length/10);
  const hv=spSel?spCols[spSel.ci][spSel.idx].v:null;
  const b=document.getElementById('spBoard');
  if(!b) return;
  b.innerHTML='';
  spCols.forEach(function(col,ci){
    const cd=document.createElement('div');
    cd.className='sp-col'+(col.length===0?' emptycol':'');
    if(spSel&&ci!==spSel.ci&&hv!==null&&spValidTarget(ci,hv)) cd.classList.add('drop');
    cd.onclick=function(){ if(spSel) spTryMove(ci); };
    let y=0;
    col.forEach(function(card,i){
      const el=document.createElement('div');
      el.className='sp-card '+(card.face?'up':'down')+(spSel&&spSel.ci===ci&&i>=spSel.idx?' sel':'');
      el.style.top=y+'px';
      el.style.zIndex=i+1;
      if(card.face) el.innerHTML=spNames[card.v]+'♠<span class="big">♠</span>';
      el.onclick=function(e){ e.stopPropagation(); spClickCard(ci,i); };
      el.ondblclick=function(e){ e.stopPropagation(); spAuto(ci,i); };
      cd.appendChild(el);
      y += card.face ? 24 : 12;
    });
    b.appendChild(cd);
  });
}
spiderNew();

/* ============ PINBALL ============ */
const pbCv=document.getElementById('pbCanvas'),pbCtx=pbCv.getContext('2d');
const PB={W:340,H:470,ball:{x:323,y:424,vx:0,vy:0,r:8},score:0,lives:3,
 walls:[{ax:4,ay:150,bx:40,by:62},{ax:40,ay:62,bx:120,by:26},{ax:120,ay:26,bx:230,by:26},{ax:230,ay:26,bx:300,by:28},{ax:300,ay:28,bx:320,by:40},{ax:320,ay:40,bx:336,by:74},
  {ax:336,ay:74,bx:336,by:440},{ax:310,ay:96,bx:310,by:440},{ax:310,ay:440,bx:336,by:440},{ax:312,ay:52,bx:336,by:82},{ax:4,ay:150,bx:4,by:300},{ax:4,ay:300,bx:92,by:392},{ax:310,ay:300,bx:248,by:392}],
 bumpers:[{x:110,y:120,r:16,f:0},{x:170,y:92,r:16,f:0},{x:230,y:120,r:16,f:0}],
 posts:[{x:60,y:250,r:6,f:0},{x:270,y:250,r:6,f:0}],
 slings:[{ax:64,ay:322,bx:96,by:356,kx:4.4,ky:-2.4,cd:0,f:0},{ax:276,ay:322,bx:244,by:356,kx:-4.4,ky:-2.4,cd:0,f:0}],
 fl:{a:.45,act:0},tr:Math.PI-.45,actR:0,pivL:{x:92,y:400},pivR:{x:248,y:400},len:62};
function pbAdd(n){ PB.score+=n; document.getElementById('pbScore').textContent=PB.score; }
function pbInLane(){ const b=PB.ball; return b.x>310&&b.y>340; }
function pbLaunch(){ const b=PB.ball; if(pbInLane()&&Math.abs(b.vy)<2.5){ b.vy=-(12+Math.random()*1.5); b.vx=-.4; sfx(500,.15,'square'); } }
function pbKey(s,on){ if(s==='L')PB.fl.act=on; else PB.actR=on; }
function segCollide(px,py,ax,ay,bx,by){ const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy; let t=((px-ax)*dx+(py-ay)*dy)/l2; t=Math.max(0,Math.min(1,t));
  const cx=ax+dx*t,cy=ay+dy*t,ddx=px-cx,ddy=py-cy,d=Math.hypot(ddx,ddy);
  return {d:d,nx:ddx/(d||1),ny:ddy/(d||1),cx:cx,cy:cy}; }
function pbLoop(){ const b=PB.ball;
  const tL=PB.fl.act?-.55:.45; PB.fl.a+=(tL-PB.fl.a)*.35;
  const tR=PB.actR?Math.PI+.55:Math.PI-.45; PB.tr+=(tR-PB.tr)*.35;
  PB.slings.forEach(function(s){if(s.cd>0)s.cd--;});
  if(pbInLane()&&Math.abs(b.vy)<1&&Math.abs(b.vx)<1&&b.y>400){b.vy=0;b.vx=0;b.y=440-b.r-3;} else b.vy+=.14;
  b.x+=b.vx; b.y+=b.vy;
  const spd=Math.hypot(b.vx,b.vy); if(spd>13){b.vx*=13/spd;b.vy*=13/spd;}
  PB.bumpers.forEach(function(bp){ const d=Math.hypot(b.x-bp.x,b.y-bp.y);
    if(d<bp.r+b.r){ const nx=(b.x-bp.x)/(d||1),ny=(b.y-bp.y)/(d||1);
      b.x=bp.x+nx*(bp.r+b.r+1); b.y=bp.y+ny*(bp.r+b.r+1); b.vx=nx*6.8; b.vy=ny*6.8; bp.f=10; pbAdd(100); sfx(700,.08,'square'); } });
  PB.posts.forEach(function(p){ const d=Math.hypot(b.x-p.x,b.y-p.y);
    if(d<p.r+b.r){ const nx=(b.x-p.x)/(d||1),ny=(b.y-p.y)/(d||1); b.x=p.x+nx*(p.r+b.r); b.y=p.y+ny*(p.r+b.r);
      const dot=b.vx*nx+b.vy*ny; b.vx=(b.vx-2*dot*nx)*.95; b.vy=(b.vy-2*dot*ny)*.95; p.f=8; pbAdd(5); } });
  PB.walls.forEach(function(w){ const h=segCollide(b.x,b.y,w.ax,w.ay,w.bx,w.by); const isD=(w.ax===312&&w.ay===52);
    if(h.d<b.r+(isD?4:2)){ b.x=h.cx+h.nx*(b.r+(isD?4:2)); b.y=h.cy+h.ny*(b.r+(isD?4:2));
      const dot=b.vx*h.nx+b.vy*h.ny; b.vx=(b.vx-2*dot*h.nx)*.85; b.vy=(b.vy-2*dot*h.ny)*.85;
      if(isD&&b.vy<0){b.vx-=4.5;b.vy*=.35;pbAdd(10);} } });
  PB.slings.forEach(function(s){ const h=segCollide(b.x,b.y,s.ax,s.ay,s.bx,s.by);
    if(h.d<b.r+5){ b.x=h.cx+h.nx*(b.r+5); b.y=h.cy+h.ny*(b.r+5);
      const dot=b.vx*h.nx+b.vy*h.ny; b.vx=(b.vx-2*dot*h.nx)*.5; b.vy=(b.vy-2*dot*h.ny)*.5;
      if(s.cd<=0){b.vx+=s.kx;b.vy+=s.ky;s.cd=12;s.f=10;pbAdd(25);sfx(300,.1,'sawtooth');} } });
  const fl={ax:PB.pivL.x,ay:PB.pivL.y,ang:PB.fl.a,act:PB.fl.act},fr={ax:PB.pivR.x,ay:PB.pivR.y,ang:PB.tr,act:PB.actR};
  [fl,fr].forEach(function(f){ const bx2=f.ax+Math.cos(f.ang)*PB.len,by2=f.ay+Math.sin(f.ang)*PB.len;
    const h=segCollide(b.x,b.y,f.ax,f.ay,bx2,by2);
    if(h.d<b.r+5){ b.x=h.cx+h.nx*(b.r+5); b.y=h.cy+h.ny*(b.r+5);
      const dot=b.vx*h.nx+b.vy*h.ny; b.vx=(b.vx-2*dot*h.nx)*.7; b.vy=(b.vy-2*dot*h.ny)*.7;
      if(f.act){b.vy-=5.6;b.vx+=(f===fl?2.6:-2.6);pbAdd(5);} } });
  if(b.y>PB.H+20){ if(b.x<310){ PB.lives--; document.getElementById('pbLives').textContent=PB.lives; sfx(120,.4,'sawtooth');
      if(PB.lives<=0){ spawnToast(' GAME OVER Pinball. Score: '+PB.score); PB.score=0; PB.lives=3;
        document.getElementById('pbScore').textContent=0; document.getElementById('pbLives').textContent=3; }
      PB.ball={x:323,y:424,vx:0,vy:0,r:8}; } else { b.y=440-b.r-3; b.vy=0; b.vx=0; } }
  pbCtx.clearRect(0,0,PB.W,PB.H); pbCtx.fillStyle='#05010f'; pbCtx.fillRect(0,0,PB.W,PB.H);
  pbCtx.fillStyle='#fff'; for(let i=0;i<40;i++)pbCtx.fillRect((i*53)%PB.W,(i*97)%PB.H,1,1);
  pbCtx.strokeStyle='#a855f7'; pbCtx.lineWidth=4; pbCtx.lineCap='round'; pbCtx.shadowColor='#a855f7'; pbCtx.shadowBlur=8;
  PB.walls.forEach(function(w){pbCtx.beginPath();pbCtx.moveTo(w.ax,w.ay);pbCtx.lineTo(w.bx,w.by);pbCtx.stroke();}); pbCtx.shadowBlur=0;
  PB.slings.forEach(function(s){ pbCtx.strokeStyle=s.f>0?'#fbbf24':'#f97316'; if(s.f>0)s.f--;
    pbCtx.lineWidth=6; pbCtx.beginPath(); pbCtx.moveTo(s.ax,s.ay); pbCtx.lineTo(s.bx,s.by); pbCtx.stroke(); });
  PB.bumpers.forEach(function(bp){ const hot=bp.f>0; if(bp.f>0)bp.f--;
    pbCtx.beginPath(); pbCtx.arc(bp.x,bp.y,bp.r,0,7); pbCtx.fillStyle=hot?'#ff2d55':'#00d4ff'; pbCtx.fill();
    pbCtx.beginPath(); pbCtx.arc(bp.x,bp.y,bp.r-6,0,7); pbCtx.fillStyle=hot?'#fff':'#0a2a3a'; pbCtx.fill(); });
  PB.posts.forEach(function(p){ pbCtx.beginPath(); pbCtx.arc(p.x,p.y,p.r,0,7); pbCtx.fillStyle='#e2e8f0'; pbCtx.fill(); });
  function drawF(ax,ay,ang){ pbCtx.strokeStyle='#00d4ff'; pbCtx.lineWidth=10; pbCtx.lineCap='round';
    pbCtx.beginPath(); pbCtx.moveTo(ax,ay); pbCtx.lineTo(ax+Math.cos(ang)*PB.len,ay+Math.sin(ang)*PB.len); pbCtx.stroke(); }
  drawF(PB.pivL.x,PB.pivL.y,PB.fl.a); drawF(PB.pivR.x,PB.pivR.y,PB.tr);
  pbCtx.beginPath(); pbCtx.arc(b.x,b.y,b.r,0,7); pbCtx.fillStyle='#fbbf24'; pbCtx.fill();
  if(pbInLane()&&Math.abs(b.vy)<2.5){ pbCtx.fillStyle='#0f0'; pbCtx.font='18px VT323'; pbCtx.textAlign='center';
    pbCtx.fillText('PRESS SPACE',160,230); pbCtx.fillText('OR 🚀 LAUNCH',160,250); }
  requestAnimationFrame(pbLoop); }
function pbReset(){
  PB.score = 0; PB.lives = 3;
  PB.ball = {x:323, y:424, vx:0, vy:0, r:8};
  document.getElementById('pbScore').textContent = '0';
  document.getElementById('pbLives').textContent = '3';
  sfx(440, 0.15, 'sine', 0.15);
  spawnToast('🚀 Pinball restarted!');
}
pbCv.addEventListener('click', function(){ if(pbInLane()) pbLaunch(); });
window.addEventListener('keydown', function(e){
  const w = document.getElementById('win-pinball');
  if(!w || w.style.display === 'none') return;
  if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){ pbKey('L', 1); }
  if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){ pbKey('R', 1); }
  if(e.key === ' ' || e.key === 'Spacebar'){ if(pbInLane()) pbLaunch(); }
});
window.addEventListener('keyup', function(e){
  const w = document.getElementById('win-pinball');
  if(!w || w.style.display === 'none') return;
  if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){ pbKey('L', 0); }
  if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){ pbKey('R', 0); }
});
pbLoop();

/* =====================================================
   SHIPS.EXE v4.2 — OPTIMIZADO + ARC BROWSER
===================================================== */
const nvCv=document.getElementById('nvCanvas'), nvCtx=nvCv.getContext('2d', { alpha: false, desynchronized: true });
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints>0;
const isMobile = isTouch || innerWidth < 768;
// Dynamic-resolution upscale for Canvas 2D. This is the closest practical
// equivalent to FSR 1 for this renderer: gameplay coordinates stay logical
// (CSS pixels), while the expensive scene is rasterized at a lower resolution.
let nvRenderScale = isMobile ? 0.78 : 0.90;
const NV_MIN_SCALE = isMobile ? 0.60 : 0.70;
const NV_MAX_SCALE = 1.0;
function nvApplyRenderScale(scale){
  nvRenderScale = Math.max(NV_MIN_SCALE, Math.min(NV_MAX_SCALE, scale));
  nvCv.width = Math.max(1, Math.floor(innerWidth * nvRenderScale));
  nvCv.height = Math.max(1, Math.floor(innerHeight * nvRenderScale));
  nvCtx.imageSmoothingEnabled = true;
}
// Single Unified Medium-Difficult Calibration (Arcade Challenge)
const DM_BASE = 1.20;
const BM_BASE = 1.15;
const FAN_BASE = 4;
const ASTRATE_BASE = 85;
const VOLP_BASE = 0.35;
const FIRER_BASE = 0.0055;

const AFFIX_POOL = [
  { id:'solar', name:'☀️ SOLAR FLARE', desc:'High radiation • Enemies attack +15% faster' },
  { id:'meteor', name:'☄️ METEOR FIELD', desc:'Dense volatile asteroid belt ahead' },
  { id:'armored', name:'🛡️ ARMORED FLEET', desc:'Vanguard hostiles reinforced with shields' },
  { id:'warp', name:'🌀 WARP ANOMALY', desc:'Quantum distortions & hyper-speed projectiles' }
];

const ROUND_KINDS=['recon','kami','tactic','swarm','convoy','cruiser','quantum','spinner'];
const ROUND_NAMES=['RECON SQUAD','KAMIKAZE STRIKE','TACTICAL AMBUSH','INSECTOID SWARM','HEAVY CONVOY','CRUISER ASSAULT','QUANTUM DISTORTION','DANMAKU SPIRAL'];

// Official Arc Logo ship asset
const arcShipImg = new Image();
arcShipImg.src = 'assets/arc_ship.png';

// Crypto token power-up assets (Circle, Piper, USDC)
const itemCircleImg = new Image(); itemCircleImg.src = 'assets/item_circle.png';
const itemPiperImg  = new Image(); itemPiperImg.src  = 'assets/item_piper.png';
const itemUsdcImg   = new Image(); itemUsdcImg.src   = 'assets/item_usdc.png';
const enemyAssetFiles = { kami:'needle.svg', camo:'wraith.svg', swarm:'splitter.svg', convoy:'bastion.svg', cruiser:'boss.svg', shield:'bastion.svg', spinner:'pulse.svg', quantum:'beacon.svg', hunt:'hunter.svg' };
const enemyAssetImages = {};
Object.keys(enemyAssetFiles).forEach(function(type){
  const img = new Image(); img.decoding = 'async'; img.src = 'assets/enemies/' + enemyAssetFiles[type];
  img.onload = function(){ enemyAssetImages[type] = img; };
});

/* ================= SPATIAL HASH GRID (O(1) COLLISIONS) ================= */
const GRID_CELL_SIZE = 80;
let gridCols = 1, gridRows = 1;
let spatialBuckets = [];
let spatialQueryStamp = 0;

function initSpatialGrid(w, h){
  gridCols = Math.ceil(w / GRID_CELL_SIZE) + 1;
  gridRows = Math.ceil(h / GRID_CELL_SIZE) + 1;
  const total = gridCols * gridRows;
  spatialBuckets = new Array(total);
  for(let i = 0; i < total; i++) spatialBuckets[i] = [];
}

function clearSpatialGrid(){
  for(let i = 0; i < spatialBuckets.length; i++) spatialBuckets[i].length = 0;
}

function insertSpatialGrid(item, x, y, r, type){
  item._spType = type;
  const minX = Math.max(0, Math.floor((x - r) / GRID_CELL_SIZE));
  const maxX = Math.min(gridCols - 1, Math.floor((x + r) / GRID_CELL_SIZE));
  const minY = Math.max(0, Math.floor((y - r) / GRID_CELL_SIZE));
  const maxY = Math.min(gridRows - 1, Math.floor((y + r) / GRID_CELL_SIZE));
  for(let cy = minY; cy <= maxY; cy++){
    const offset = cy * gridCols;
    for(let cx = minX; cx <= maxX; cx++){
      spatialBuckets[offset + cx].push(item);
    }
  }
}

function querySpatialGrid(x, y, r, cb){
  const minX = Math.max(0, Math.floor((x - r) / GRID_CELL_SIZE));
  const maxX = Math.min(gridCols - 1, Math.floor((x + r) / GRID_CELL_SIZE));
  const minY = Math.max(0, Math.floor((y - r) / GRID_CELL_SIZE));
  const maxY = Math.min(gridRows - 1, Math.floor((y + r) / GRID_CELL_SIZE));
  spatialQueryStamp++;
  for(let cy = minY; cy <= maxY; cy++){
    const offset = cy * gridCols;
    for(let cx = minX; cx <= maxX; cx++){
      const b = spatialBuckets[offset + cx];
      for(let i = 0; i < b.length; i++){
        const it = b[i];
        if(it._qStamp !== spatialQueryStamp){
          it._qStamp = spatialQueryStamp;
          if(cb(it, it._spType)) return true;
        }
      }
    }
  }
  return false;
}

/* ================= OBJECT POOLS (ZERO GC ENGINE) ================= */
const MAX_BULLETS = 250;
const bulletPool = Array.from({length: MAX_BULLETS}, function(){
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, green: false, isMaster: false, pierce: 1 };
});
function spawnPlayerBullet(p){
  for(let i = 0; i < MAX_BULLETS; i++){
    const b = bulletPool[i];
    if(!b.active){
      b.active = true;
      b.x = p.x; b.y = p.y; b.vx = p.vx || 0; b.vy = p.vy || 0;
      b.rot = p.rot || 0; b.green = !!p.green; b.isMaster = !!p.isMaster;
      b.pierce = p.pierce || 1;
      NV.bullets.push(b);
      return b;
    }
  }
  return null;
}

const MAX_EBULLETS = 300;
const ebulletPool = Array.from({length: MAX_EBULLETS}, function(){
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, kind: 'normal', rot: 0, spin: 0, t: 0, baseX: 0, amp: 0, trail: [] };
});
function spawnEnemyBullet(p){
  const pomeSlow = (typeof ownedMemes !== 'undefined' && ownedMemes.pome) ? 0.9 : 1;
  for(let i = 0; i < MAX_EBULLETS; i++){
    const b = ebulletPool[i];
    if(!b.active){
      b.active = true;
      if(pomeSlow !== 1){ b.vx = (p.vx||0) * pomeSlow; b.vy = (p.vy||0) * pomeSlow; }
      else { b.vx = p.vx || 0; b.vy = p.vy || 0; }
      b.x = p.x; b.y = p.y;
      b.kind = p.kind || 'normal'; b.rot = p.rot || 0; b.spin = p.spin || 0;
      b.t = p.t || 0; b.baseX = p.baseX || p.x; b.amp = p.amp || 0;
      b.trail.length = 0;
      NV.ebullets.push(b);
      return b;
    }
  }
  return null;
}

const MAX_MISSILES = 40;
const missilePool = Array.from({length: MAX_MISSILES}, function(){
  return { active: false, x: 0, y: 0, vx: 0, vy: 0 };
});
function spawnPlayerMissile(p){
  for(let i = 0; i < MAX_MISSILES; i++){
    const m = missilePool[i];
    if(!m.active){
      m.active = true;
      m.x = p.x; m.y = p.y; m.vx = p.vx || 0; m.vy = p.vy || 0;
      NV.missiles.push(m);
      return m;
    }
  }
  return null;
}

/* ================= OFFSCREEN CANVAS TEXTURE ATLAS ================= */
const atlasTextures = {};
let atlasInitialized = false;

function createOffscreen(w, h){
  if(typeof OffscreenCanvas !== 'undefined'){
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function initTextureAtlas(){
  if(atlasInitialized) return;
  atlasInitialized = true;
  try {
    // 1. Pre-render Flute sprites (std, green, master)
    ['std', 'green', 'master'].forEach(function(type){
      const isMaster = (type === 'master');
      const isGreen = (type === 'green');
      const w = isMaster ? 140 : 80;
      const h = isMaster ? 160 : 90;
      const cv = createOffscreen(w, h);
      const ctx = cv.getContext('2d');
      ctx.translate(w / 2, h / 2);
      drawFluteRaw(ctx, 0, 0, 0, isMaster, isGreen);
      atlasTextures['flute_' + type] = { cv: cv, w: w, h: h };
    });

    // 2. Pre-render Enemy Ship archetypes
    ['kami','camo','swarm','convoy','cruiser','shield','spinner','quantum','hunt'].forEach(function(t){
      const w = 90, h = 90;
      const cv = createOffscreen(w, h);
      const ctx = cv.getContext('2d');
      ctx.translate(w / 2, h / 2);
      drawEnemyBaseSprite(ctx, t);
      atlasTextures['enemy_' + t] = { cv: cv, w: w, h: h };
    });

    // 3. Pre-render Enemy Bullets (blade, dart, normal) for instant O(1) blitting
    (function(){
      // Blade bullet
      const cvBlade = createOffscreen(40, 40);
      const bx = cvBlade.getContext('2d');
      bx.translate(20, 20);
      const bg = bx.createRadialGradient(0,0,0,0,0,18);
      bg.addColorStop(0,'rgba(255,45,149,.7)'); bg.addColorStop(1,'rgba(255,45,149,0)');
      bx.fillStyle = bg; bx.beginPath(); bx.arc(0,0,18,0,7); bx.fill();
      bx.fillStyle = '#ff2d95';
      bx.beginPath();
      for(let k=0;k<4;k++){ const an=k*Math.PI/2;
        bx.moveTo(0,0); bx.lineTo(Math.cos(an-.35)*10,Math.sin(an-.35)*10);
        bx.lineTo(Math.cos(an)*15,Math.sin(an)*15); bx.lineTo(Math.cos(an+.35)*10,Math.sin(an+.35)*10); }
      bx.fill();
      bx.fillStyle = '#fff'; bx.beginPath(); bx.arc(0,0,4,0,7); bx.fill();
      atlasTextures['ebullet_blade'] = { cv: cvBlade, w: 40, h: 40 };

      // Dart bullet
      const cvDart = createOffscreen(32, 32);
      const dx = cvDart.getContext('2d');
      dx.translate(16, 16);
      const dg = dx.createRadialGradient(0,0,0,0,0,14);
      dg.addColorStop(0,'rgba(255,149,0,.7)'); dg.addColorStop(1,'rgba(255,149,0,0)');
      dx.fillStyle = dg; dx.beginPath(); dx.arc(0,0,14,0,7); dx.fill();
      dx.fillStyle = '#ff9500';
      dx.beginPath(); dx.moveTo(0,12); dx.lineTo(3.5,-8); dx.lineTo(0,-4); dx.lineTo(-3.5,-8); dx.closePath(); dx.fill();
      dx.fillStyle = '#fff'; dx.beginPath(); dx.moveTo(0,10); dx.lineTo(1.5,2); dx.lineTo(-1.5,2); dx.closePath(); dx.fill();
      atlasTextures['ebullet_dart'] = { cv: cvDart, w: 32, h: 32 };

      // Normal bullet
      const cvNorm = createOffscreen(32, 32);
      const nx = cvNorm.getContext('2d');
      nx.translate(16, 16);
      const ng = nx.createRadialGradient(0,0,0,0,0,15);
      ng.addColorStop(0,'rgba(255,45,85,.5)'); ng.addColorStop(1,'rgba(0,0,0,0)');
      nx.fillStyle = ng; nx.beginPath(); nx.arc(0,0,15,0,7); nx.fill();
      nx.fillStyle = '#ff2d55'; nx.beginPath(); nx.arc(0,0,4,0,7); nx.fill();
      atlasTextures['ebullet_normal'] = { cv: cvNorm, w: 32, h: 32 };
    })();
  } catch(err) {
    console.warn('Offscreen atlas init fallback:', err);
  }
}

/* === ENEMY SVG SPRITES (assets/enemies) ===
   Maps enemy archetypes to their vector art. SVGs are pre-rendered once into
   the texture atlas so the per-frame cost is a single drawImage blit. */
const ENEMY_SVG_MAP = {
  kami:     'needle.svg',
  camo:     'wraith.svg',
  spinner:  'pulse.svg',
  shield:   'bastion.svg',
  convoy:   'bastion.svg',
  cruiser:  'bastion.svg',
  quantum:  'splitter.svg',
  hunt:     'hunter.svg',
  swarm:    'pulse.svg',
  beacon:   'beacon.svg',
  boss:     'boss.svg'
};
function loadEnemySvgSprites(){
  Object.keys(ENEMY_SVG_MAP).forEach(function(type){
    try {
      const img = new Image();
      img.onload = function(){
        const size = type === 'boss' ? 220 : 90;
        const cv = createOffscreen(size, size);
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, size, size);
        atlasTextures['enemy_' + type] = { cv: cv, w: size, h: size };
      };
      img.src = 'assets/enemies/' + ENEMY_SVG_MAP[type];
    } catch(err) {}
  });
}
loadEnemySvgSprites();

function drawEnemyBaseSprite(ctx, type){
  if(type==='kami'){
    ctx.fillStyle='#1e293b'; ctx.strokeStyle='#ff9500'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(0,22); ctx.lineTo(16,-8); ctx.lineTo(9,-6); ctx.lineTo(0,-2);
    ctx.lineTo(-9,-6); ctx.lineTo(-16,-8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle='#ea580c';
    ctx.beginPath(); ctx.moveTo(0,18); ctx.lineTo(11,-4); ctx.lineTo(0,4); ctx.lineTo(-11,-4); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ef4444'; ctx.shadowColor='#ef4444'; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(0,7,3,0,7); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,7,1.2,0,7); ctx.fill();
  } else if(type==='camo'){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const cg=ctx.createRadialGradient(0,0,0,0,0,24);
    cg.addColorStop(0,'rgba(168,85,247,.6)'); cg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(0,0,24,0,7); ctx.fill(); ctx.restore();
    ctx.fillStyle='#2e1065'; ctx.strokeStyle='#c084fc'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,-18); ctx.lineTo(16,4); ctx.lineTo(0,18); ctx.lineTo(-16,4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='rgba(192,132,252,.7)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(0,-18); ctx.lineTo(0,18);
    ctx.moveTo(-16,4); ctx.lineTo(16,4);
    ctx.moveTo(-8,-7); ctx.lineTo(8,11);
    ctx.moveTo(8,-7); ctx.lineTo(-8,11);
    ctx.stroke();
    ctx.fillStyle='#e879f9'; ctx.shadowColor='#e879f9'; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(0,4,4,0,7); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,4,2,0,7); ctx.fill();
  } else if(type==='swarm'){
    ctx.fillStyle='#064e3b'; ctx.strokeStyle='#10b981'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(0,-14); ctx.lineTo(11,2); ctx.lineTo(6,12); ctx.lineTo(0,8);
    ctx.lineTo(-6,12); ctx.lineTo(-11,2); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle='#34d399'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(-6,10); ctx.lineTo(-9,17);
    ctx.moveTo(6,10); ctx.lineTo(9,17);
    ctx.stroke();
    ctx.fillStyle='#10b981'; ctx.shadowColor='#10b981'; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(0,-2,3.5,0,7); ctx.fill();
    ctx.fillStyle='#ecfdf5'; ctx.beginPath(); ctx.arc(0,-2,1.5,0,7); ctx.fill();
  } else if(type==='convoy'){
    ctx.fillStyle='#1e293b'; ctx.strokeStyle='#fbbf24'; ctx.lineWidth=2;
    ctx.fillRect(-24,-16,48,32); ctx.strokeRect(-24,-16,48,32);
    ctx.fillStyle='#fbbf24';
    for(let s=-20; s<20; s+=10){
      ctx.beginPath(); ctx.moveTo(s,-16); ctx.lineTo(s+6,-16); ctx.lineTo(s-2,-10); ctx.lineTo(s-8,-10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s,10); ctx.lineTo(s+6,10); ctx.lineTo(s-2,16); ctx.lineTo(s-8,16); ctx.closePath(); ctx.fill();
    }
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const cg=ctx.createRadialGradient(0,0,0,0,0,18);
    cg.addColorStop(0,'rgba(251,191,36,.8)'); cg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(0,0,18,0,7); ctx.fill(); ctx.restore();
    ctx.fillStyle='#fef08a'; ctx.font='bold 11px VT323,monospace'; ctx.textAlign='center';
    ctx.fillText('★ VAULT ★',0,4);
  } else if(type==='cruiser'){
    ctx.fillStyle='#0f172a'; ctx.strokeStyle='#ef4444'; ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.moveTo(0,26); ctx.lineTo(28,8); ctx.lineTo(24,-20); ctx.lineTo(8,-14);
    ctx.lineTo(0,-26); ctx.lineTo(-8,-14); ctx.lineTo(-24,-20); ctx.lineTo(-28,8);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#475569';
    ctx.fillRect(-18,10,6,18); ctx.fillRect(12,10,6,18);
    ctx.fillStyle='#ef4444'; ctx.shadowColor='#ef4444'; ctx.shadowBlur=8;
    ctx.fillRect(-17,26,4,4); ctx.fillRect(13,26,4,4);
    ctx.fillStyle='#dc2626'; ctx.shadowColor='#dc2626'; ctx.shadowBlur=14;
    ctx.fillRect(-12,-6,24,5);
    ctx.fillStyle='#fff'; ctx.fillRect(-10,-5,20,2);
  } else if(type==='shield'){
    ctx.fillStyle='#082f49'; ctx.strokeStyle='#0284c7'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(0,18); ctx.lineTo(24,-10); ctx.lineTo(12,-16); ctx.lineTo(0,-8);
    ctx.lineTo(-12,-16); ctx.lineTo(-24,-10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#38bdf8'; ctx.shadowColor='#38bdf8'; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(-20,-8,4,0,7); ctx.arc(20,-8,4,0,7); ctx.fill();
  } else if(type==='spinner'){
    ctx.fillStyle='#10b981'; ctx.beginPath(); ctx.arc(0,0,7,0,7); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,3,0,7); ctx.fill();
  } else if(type==='quantum'){
    ctx.fillStyle='#0369a1'; ctx.strokeStyle='#38bdf8'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.moveTo(-4,16); ctx.lineTo(-18,-8); ctx.lineTo(-8,-14); ctx.lineTo(-2,-2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4,16); ctx.lineTo(18,-8); ctx.lineTo(8,-14); ctx.lineTo(2,-2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const qg=ctx.createRadialGradient(0,2,0,0,2,16);
    qg.addColorStop(0,'rgba(0,212,255,.9)'); qg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=qg; ctx.beginPath(); ctx.arc(0,2,16,0,7); ctx.fill(); ctx.restore();
  } else {
    // Default hunt / interceptor
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const hg=ctx.createRadialGradient(0,0,0,0,0,26);
    hg.addColorStop(0,'rgba(255,45,149,.5)'); hg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(0,0,26,0,7); ctx.fill(); ctx.restore();
    ctx.fillStyle='#1e1b4b'; ctx.strokeStyle='#ff2d95'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(0,18); ctx.lineTo(20,-6); ctx.lineTo(14,-16); ctx.lineTo(0,-10);
    ctx.lineTo(-14,-16); ctx.lineTo(-20,-6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle='#ff2d95'; ctx.fillRect(-22,-3,6,12); ctx.fillRect(16,-3,6,12);
    ctx.fillStyle='#00d4ff'; ctx.shadowColor='#00d4ff'; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.ellipse(0,2,8,4,0,0,7); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,2,2,0,7); ctx.fill();
  }
}

// Fast drawFlute using pre-rendered OffscreenCanvas
function drawFlute(ctx, x, y, rot, isMaster, isGreen){
  const key = isMaster ? 'flute_master' : (isGreen ? 'flute_green' : 'flute_std');
  const tex = atlasTextures[key];
  if(tex){
    ctx.save();
    ctx.translate(x, y);
    if(rot) ctx.rotate(rot);
    ctx.drawImage(tex.cv, -tex.w / 2, -tex.h / 2);
    ctx.restore();
    return;
  }
  drawFluteRaw(ctx, x, y, rot, isMaster, isGreen);
}

// Raw flute drawer used for atlas pre-generation & fallback
function drawFluteRaw(ctx, x, y, rot, isMaster, isGreen){
  ctx.save();
  ctx.translate(x, y);
  if(rot) ctx.rotate(rot);
  if(isMaster) ctx.scale(1.8, 2.3);

  // Soft sonic musical aura
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, isMaster ? 32 : 18);
  if(isMaster){
    g.addColorStop(0, 'rgba(251, 191, 36, 0.85)');
    g.addColorStop(0.5, 'rgba(255, 215, 0, 0.4)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else if(isGreen){
    g.addColorStop(0, 'rgba(34, 197, 94, 0.7)');
    g.addColorStop(0.6, 'rgba(163, 230, 53, 0.3)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    g.addColorStop(0, 'rgba(0, 212, 255, 0.45)');
    g.addColorStop(0.6, 'rgba(251, 191, 36, 0.2)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, isMaster ? 32 : 18, 0, 7);
  ctx.fill();
  ctx.restore();

  // Flute body - slender elegant cylinder
  const grad = ctx.createLinearGradient(-3, 0, 3, 0);
  if(isMaster){
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.3, '#ffffff');
    grad.addColorStop(0.7, '#fef08a');
    grad.addColorStop(1, '#ca8a04');
  } else if(isGreen){
    grad.addColorStop(0, '#bbf7d0');
    grad.addColorStop(0.3, '#ffffff');
    grad.addColorStop(0.7, '#86efac');
    grad.addColorStop(1, '#15803d');
  } else {
    grad.addColorStop(0, '#cbd5e1');
    grad.addColorStop(0.3, '#ffffff');
    grad.addColorStop(0.7, '#f8fafc');
    grad.addColorStop(1, '#94a3b8');
  }
  ctx.fillStyle = grad;
  ctx.shadowColor = isMaster ? '#fbbf24' : (isGreen ? '#22c55e' : '#00d4ff');
  ctx.shadowBlur = isMaster ? 16 : 6;
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(-3, -15, 6, 30, 2);
  else ctx.rect(-3, -15, 6, 30);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Headjoint lip plate & embouchure mouth hole (near top)
  ctx.fillStyle = isMaster ? '#ca8a04' : '#64748b';
  ctx.beginPath();
  ctx.ellipse(0, -9.5, 1.5, 1.1, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(0, -9.5, 1.0, 0.7, 0, 0, 7);
  ctx.fill();

  // Gold tone keys & finger holes along body
  ctx.fillStyle = isMaster ? '#ffffff' : '#fbbf24';
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 0.8;
  for(let i = 0; i < 5; i++){
    const ky = -4 + i * 4.2;
    ctx.beginPath();
    ctx.arc(0, ky, 1.1, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1.1, ky);
    ctx.lineTo(2.8, ky - 0.7);
    ctx.stroke();
  }

  // Golden crown at top and ring at footjoint
  ctx.fillStyle = isMaster ? '#ffffff' : '#fbbf24';
  ctx.fillRect(-3.2, -15.5, 6.4, 2);
  ctx.fillRect(-3, 13, 6, 2);

  ctx.restore();
}

const MAX_PARTS = isMobile ? 80 : 300;
// FPS tracking for adaptive quality
let nvFpsFrames = 0, nvFpsLast = 0, nvFpsAvg = 60, nvLowPerf = false;

const partsPool = [];
for(let i=0;i<MAX_PARTS;i++) partsPool.push({active:false,x:0,y:0,vx:0,vy:0,l:0,maxL:0,r:0,col:'',kind:'',char:''});
function getParticle(){ for(let i=0;i<MAX_PARTS;i++) if(!partsPool[i].active) return partsPool[i]; return null; }

const NV={ on:false, state:'off', diff:'arcade', diffName:'ARCADE CHALLENGE',
  score:0, _score:0, _scoreKey:0x5F37, _scoreShadow:(0^0x5F37)+0x1A4,
  best:0, allTimeBest:0, recordBroken:false, activeTab:'weekly',
  lives:3, round:1, roundKind:'recon', roundAffix:null, budget:0, squadCd:0, t:0,
  freeze:0, glitch:0, shake:0, muzzle:0, crtT:0, hyperT:0, bootLine:0, bootChar:0, transT:0, transTxt:'', hideBgFx:false,
  combo:0, comboT:0, bombs:2, bombMax:3, bombCd:0, dashCd:0, misCd:0, lasCd:0, bombT:0, bombHit:false, laserFlash:0, astCd:60, cdT:0, cdStage:4, railgunT:0, railgunX:0,
  overdriveT:0, dronesT:0, cryoT:0, phaseT:0, magnetT:0,
  usdcActive:0, piperSymphonyT:0, empT:0, chronoT:0, symphonyCount:0,
  decoys:[], sonicRings:[], orbitals:[],
  stars:[], bin:[], neb:null, nebX:0, groups:[],
  player:null, bullets:[], missiles:[], ebullets:[], enemies:[], asteroids:[], scraps:[], pows:[],
  debris:[], rings:[], boss:null, bossIdx:0, keys:{},
  briefingSkip:false, pilotName:'',
  touch:{ active:false, dx:0, dy:0, stickX:80, stickY:80 },
  lastTime:0, frameCount:0 };
const BOOT_LINES=['SYSTEMS ONLINE...','ARC LINK ESTABLISHED','CONTROL TRANSFERRED TO PILOT_'];

function nvShow(id){
  ['nvMenu','nvHelp','nvPause','nvOver','nvBriefing','nvLeaderboard'].forEach(function(x){
    const el = document.getElementById(x);
    if(el) el.classList.remove('show');
  });
  if(id){
    const el = document.getElementById(id);
    if(el) el.classList.add('show');
    // Hide touch controls when any modal / menu is open
    const tj = document.getElementById('touchJoy');
    const tb = document.getElementById('touchBtns');
    if(tj) tj.classList.remove('show');
    if(tb) tb.classList.remove('show');
  } else if(NV.state==='playing' && isTouch){
    const tj = document.getElementById('touchJoy');
    const tb = document.getElementById('touchBtns');
    if(tj) tj.classList.add('show');
    if(tb) tb.classList.add('show');
  }
}
function nvResize(){ nvApplyRenderScale(nvRenderScale); initSpatialGrid(innerWidth, innerHeight); initTextureAtlas(); }
function makeNebula(){
  const c=document.createElement('canvas'); c.width=512; c.height=512;
  const x=c.getContext('2d');
  const cols=['rgba(120,40,200,','rgba(200,40,160,','rgba(0,140,200,','rgba(60,0,120,'];
  for(let i=0;i<10;i++){
    const r=80+Math.random()*140, cx=Math.random()*512, cy=Math.random()*512;
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
    const col=cols[Math.floor(Math.random()*cols.length)];
    g.addColorStop(0,col+(.16+Math.random()*.12)+')'); g.addColorStop(1,col+'0)');
    x.fillStyle=g; x.beginPath(); x.arc(cx,cy,r,0,7); x.fill();
  }
  return c;
}
/* === STARSHIP ARC: VIRUS HUNTERS — cinematic studio intro === */
let nvIntroTimers = [];
function nvIntroTone(f, at, dur, type, vol){
  if(!soundOn) return; const a=ac(); if(!a) return;
  try{
    const t=a.currentTime + at;
    const o=a.createOscillator(), g=a.createGain();
    o.type=type||'square'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol||0.16, t+0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(masterNode(a));
    o.start(t); o.stop(t+dur+0.02);
  }catch(e){}
}
function arcStudiosJingle(){
  // "Coin" jingle — classic console: B5 -> E6 with sparkle tail
  nvIntroTone(987.77, 0.00, .12, 'square', .16);
  nvIntroTone(1318.51, 0.12, .55, 'square', .16);
  nvIntroTone(2637.02, 0.12, .30, 'sine', .06);
  nvIntroTone(1975.53, 0.30, .45, 'triangle', .07);
}
function piperJingle(){
  // 16-bit power chord swell: root + fifth + octave saw stack
  nvIntroTone(220.00, 0.00, .70, 'sawtooth', .10);
  nvIntroTone(329.63, 0.05, .70, 'sawtooth', .08);
  nvIntroTone(440.00, 0.10, .80, 'sawtooth', .09);
  nvIntroTone(880.00, 0.55, .40, 'triangle', .10);
}
function runNvIntro(){
  const intro=document.getElementById('nvIntro');
  const arc=document.getElementById('siArc'), pip=document.getElementById('siPiper');
  if(!intro){ beginNvCrt(); return; }
  NV.state='intro';
  intro.classList.add('show');
  arc.classList.add('show');
  arcStudiosJingle();
  nvIntroTimers.push(setTimeout(function(){
    arc.classList.remove('show'); pip.classList.add('show'); piperJingle();
  }, 2900));
  nvIntroTimers.push(setTimeout(endNvIntro, 5800));
}
function endNvIntro(){
  if(NV.state!=='intro') return;
  nvIntroTimers.forEach(clearTimeout); nvIntroTimers=[];
  const intro=document.getElementById('nvIntro');
  document.getElementById('siArc').classList.remove('show');
  document.getElementById('siPiper').classList.remove('show');
  intro.classList.remove('show');
  beginNvCrt();
}
function beginNvCrt(){
  if(NV.state!=='intro' && NV.state!=='crt') return;
  NV.state='crt'; NV.crtT=0;
  sfx(60,.4,'sine',.2); sfx(120,.5,'sine',.12);
}
function uiTickSfx(){ sfx(1400,.05,'square',.07); }
function uiConfirmSfx(){ sfx(660,.09,'square',.12); setTimeout(function(){sfx(990,.12,'square',.1);},70); }

function openNaves(){
  document.getElementById('navesGame').classList.add('show');
  clearAllPopups(); // silence virus engine while playing
  NV.on=true; NV.state='intro'; NV.crtT=0; nvResize(); nvShow(null);
  NV.score=0; NV.combo=0; NV.round=0;
  document.getElementById('nvScore').textContent='0';
  document.getElementById('nvScore').classList.remove('pulse');
  document.getElementById('nvCombo').textContent='';
  document.getElementById('nvRound').textContent='SECTOR 1';
  document.getElementById('nvBossWrap').classList.remove('show');
  document.getElementById('nvHUD').classList.remove('show');
  document.getElementById('touchJoy').classList.remove('show');
  document.getElementById('touchBtns').classList.remove('show');
  NV.stars=Array.from({length:isMobile?80:120},function(){return {x:Math.random()*innerWidth,y:Math.random()*innerHeight,z:Math.random()*2+.5};});
  NV.bin=Array.from({length:20},function(){return {x:Math.random()*innerWidth,y:Math.random()*innerHeight,s:.4+Math.random()*.8,txt:''};});
  NV.neb=makeNebula();
  syncGetRecords();
  updatePilotPlate();
  runNvIntro();
}
function updatePilotPlate(){
  const el=document.getElementById('nvPilotPlate'); if(!el)return;
  const best=getAbsoluteRecordScore();
  const name=localStorage.getItem('arc_last_pilot')||'ROOKIE';
  el.textContent = best>0 ? ('PILOT '+name+' — RECORD: '+best.toLocaleString()) : 'NEW PILOT — NO FLIGHT RECORD YET';
}
function closeNaves(){ NV.on=false; NV.state='off'; document.getElementById('navesGame').classList.remove('show');
  document.getElementById('touchJoy').classList.remove('show');
  document.getElementById('touchBtns').classList.remove('show'); }
function nvToMenu(){
  NV.state='menu'; nvShow('nvMenu'); updatePilotPlate();
  document.getElementById('touchJoy').classList.remove('show');
  document.getElementById('touchBtns').classList.remove('show');
  NV.score=0; NV.combo=0; NV.round=0;
  document.getElementById('nvScore').textContent='0';
  document.getElementById('nvScore').classList.remove('pulse');
  document.getElementById('nvCombo').textContent='';
  document.getElementById('nvRound').textContent='ROUND 1';
  document.getElementById('nvHUD').classList.remove('show');
}
function nvCycleDiff(){ /* Fixed to Arcade Challenge */ }
function nvResume(){ NV.state='playing'; nvShow(null); }
function nvStart(){
  NV.state='briefing'; nvShow(null); document.getElementById('nvHUD').classList.add('show');
  NV.score=0; NV._score=0; NV._scoreShadow=(0^NV._scoreKey)+0x1A4;
  const bonusLives = (typeof ownedMemes !== 'undefined' && ownedMemes.pug) ? 1 : 0;
  const startShield = (typeof ownedMemes !== 'undefined' && ownedMemes.tick) ? 1 : 0;
  const bonusBombs = (typeof ownedMemes !== 'undefined' && ownedMemes.whatif) ? 1 : 0;
  NV.lives=3 + bonusLives; NV.round=0; NV.budget=999; NV.freeze=0; NV.glitch=0; NV.boss=null; NV.bossIdx=0;
  NV.allTimeBest=getAbsoluteRecordScore(); NV.recordBroken=false; NV.lifeMark=25000;
  NV.combo=0; NV.comboT=0; NV.bombs=2 + bonusBombs; NV.bombCd=0; NV.dashCd=0; NV.misCd=0; NV.lasCd=0;
  NV.bombT=0; NV.laserFlash=0; NV.astCd=40;
  NV.overdriveT=0; NV.dronesT=0; NV.cryoT=0; NV.phaseT=0; NV.magnetT=0;
  NV.bullets=[]; NV.missiles=[]; NV.ebullets=[]; NV.enemies=[]; NV.asteroids=[]; NV.scraps=[]; NV.pows=[];
  NV.orbitals=[]; NV.railgunT=0;
  NV.debris=[]; NV.rings=[]; NV.groups=[];
  for(let i=0;i<MAX_PARTS;i++) partsPool[i].active=false;
  for(let i=0;i<MAX_BULLETS;i++) bulletPool[i].active=false;
  for(let i=0;i<MAX_EBULLETS;i++) ebulletPool[i].active=false;
  for(let i=0;i<MAX_MISSILES;i++) missilePool[i].active=false;
  NV.player={x:innerWidth/2,y:innerHeight-90,cd:0,inv:0,triple:0,shield:startShield,ax:0,face:1,dashT:0,ghosts:[],dead:false};
  // Explicitly reset the counter to zero every time the game starts or restarts
  document.getElementById('nvScore').textContent='0';
  document.getElementById('nvScore').classList.remove('pulse');
  document.getElementById('nvCombo').textContent='';
  document.getElementById('nvRound').textContent='SECTOR 1';
  document.getElementById('nvBossWrap').classList.remove('show');
  document.getElementById('nvStatus').textContent='';
  document.getElementById('nvStatus').classList.remove('show');
  renderHearts(); renderModules(); updateDiffIndicator();
  startBriefing();
}
function updateDiffIndicator(){
  document.getElementById('nvDiffInd').textContent='🔥 ARCADE CHALLENGE';
}
function startBriefing(){
  if(NV.briefingSkip){
    nvShow(null);
    document.getElementById('nvHUD').classList.add('show');
    nextRound();
    sfx(880,.2,'square');
    return;
  }
  nvShow('nvBriefing');
  document.getElementById('briefRound').textContent=NV.round+1;
  const isBossSector = (NV.round+1)%5===0;
  const nextKindIdx = (NV.round)%ROUND_NAMES.length;
  document.getElementById('briefKind').textContent = isBossSector ? 'FLAGSHIP BOSS' : ROUND_NAMES[nextKindIdx];
  document.getElementById('briefDiff').textContent = 'ARCADE CHALLENGE';
  document.getElementById('briefCountdown').innerHTML='';
  document.getElementById('briefSkip').checked=false;
  let cd=3;
  const cdEl=document.getElementById('briefCountdown');
  cdEl.innerHTML='<div class="brief-countdown">'+cd+'</div>';
  const iv=setInterval(function(){ cd--;
    if(cd>0) cdEl.innerHTML='<div class="brief-countdown">'+cd+'</div>';
    else if(cd===0) cdEl.innerHTML='<div class="brief-go">LET\'S GO!</div>';
    else {
      clearInterval(iv);
      NV.briefingSkip=document.getElementById('briefSkip').checked;
      nvShow(null);
      document.getElementById('nvHUD').classList.add('show');
      nextRound();
      sfx(880,.2,'square');
    }
  },1000);
}
/** Limpia TODO el campo de juego (acción + pools) antes de una nueva ronda. */
function clearArena(){
  // Total map wipe: no asteroids, no enemies, no bullets, no debris, no boss
  NV.enemies=[]; NV.asteroids=[]; NV.ebullets=[]; NV.missiles=[];
  NV.pows=[]; NV.scraps=[]; NV.debris=[]; NV.rings=[]; NV.groups=[];
  NV.decoys=[]; NV.sonicRings=[]; NV.orbitals=[]; NV.railgunT=0; NV.boss=null; NV.budget=0;
  NV.bullets=[];
  for(let i=0;i<MAX_PARTS;i++) partsPool[i].active=false;
  for(let i=0;i<MAX_BULLETS;i++) bulletPool[i].active=false;
  for(let i=0;i<MAX_EBULLETS;i++) ebulletPool[i].active=false;
  for(let i=0;i<MAX_MISSILES;i++) missilePool[i].active=false;
  if(NV.player){ NV.player.inv=Math.max(NV.player.inv,90); }
  document.getElementById('nvBossWrap').classList.remove('show');
}
/** Avanza de sector: afijos procedurales, presupuesto de oleada, boss cada 5. */
function nextRound(){
  NV.state='playing';
  NV.round++;
  // Strictly ensure score starts at zero on Sector 1 start
  if(NV.round===1){
    NV.score=0;
    NV.combo=0;
    document.getElementById('nvScore').textContent='0';
    document.getElementById('nvScore').classList.remove('pulse');
    document.getElementById('nvCombo').textContent='';
  }
  const isBoss = (NV.round % 5 === 0);
  const kindIdx = (NV.round - 1) % ROUND_KINDS.length;
  NV.roundKind = isBoss ? 'boss' : ROUND_KINDS[kindIdx];

  // Procedural affixes starting from Sector 3
  NV.roundAffix = (NV.round > 2 && !isBoss && Math.random() < 0.65)
    ? AFFIX_POOL[Math.floor(Math.random() * AFFIX_POOL.length)]
    : null;

  // Infinite procedural scaling budget
  const baseBudget = 18 + NV.round * 4 + Math.floor(NV.round / 5) * 8;
  if(isBoss){
    NV.budget = 8;
    nvSpawnBoss();
  } else {
    NV.budget = baseBudget;
    if(NV.roundAffix && NV.roundAffix.id === 'meteor') NV.astCd = 25;
  }

  const affixTag = NV.roundAffix ? ' • ' + NV.roundAffix.name : '';
  const sectorTitle = isBoss ? ('SECTOR ' + NV.round + ' — ☠ FLAGSHIP BOSS') : ('SECTOR ' + NV.round + ' — ' + ROUND_NAMES[kindIdx] + affixTag);
  document.getElementById('nvRound').textContent = sectorTitle;
  // Affix warning banner so the player reads the rule before dying by it
  if(NV.roundAffix){
    showStatus('⚠️ ' + NV.roundAffix.name + ' — ' + NV.roundAffix.desc);
    sfx(300,.3,'triangle',.12);
  }

  const isMob = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window) || (innerWidth < 768) || (innerHeight > innerWidth);
  NV.squadCd = isMob ? 55 : 80; // breathing room before the next wave arrives
  if(isTouch){
    const tj = document.getElementById('touchJoy');
    const tb = document.getElementById('touchBtns');
    if(tj) tj.classList.add('show');
    if(tb) tb.classList.add('show');
  }
  // Spawn immediate vanguard wave at round start so screen has continuous action right away
  if(!isBoss){
    spawnSquad();
  }
}
/** Genera la oleada según el tipo de sector actual (grace: sin fuego 1.2s). */
function spawnSquad(){
  const maxEnemiesOnScreen = isMobile ? 12 : 20;
  if(NV.enemies.length >= maxEnemiesOnScreen){
    NV.squadCd = 25; // Delay next spawn until player clears the screen
    return;
  }
  const W=innerWidth;
  const H=innerHeight;
  // Smooth pacing: 1.2s fire grace at wave start so the player can read the formation
  NV.empT = Math.max(NV.empT, 70);
  const isMob = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window) || (W < 768) || (H > W);
  const mobSpeedMul = isMob ? 1.65 : 1.0;
  const r = Math.max(1, NV.round || 1);
  const prog = Math.min((r - 1) / 7, 1.5);
  const dm = (0.85 + prog * 0.45) * (NV.roundAffix && NV.roundAffix.id === 'solar' ? 1.15 : 1) * mobSpeedMul;
  const n = NV.round <= 2
    ? 2 + Math.floor(Math.random()*2)  // gentler opening sectors
    : 3 + Math.floor(Math.random()*3) + Math.min(Math.floor(NV.round / 4), 4);
  const topY = isMob ? (-15 - Math.random()*30) : (-90 - Math.random()*60);
  const maxSpread = isMob ? Math.min(32, Math.floor((W - 80) / n)) : 62;

  if(NV.roundKind==='recon'){
    const cx = Math.max(50, Math.min(W - 50, W * 0.25 + Math.random() * W * 0.5));
    const g={y:topY, vy:(.5+Math.random()*.25)*dm, cx:cx, sway:Math.random()*6};
    NV.groups.push(g);
    const shape=Math.random()<.5?'V':'L';
    for(let i=0;i<n;i++){
      const dx= shape==='V'? (i-(n-1)/2)*maxSpread : (i%2? -1:1)*(Math.min(22, maxSpread/2)+Math.floor(i/2)*maxSpread);
      const dy= shape==='V'? Math.abs(i-(n-1)/2)*(isMob?18:30) : Math.floor(i/2)*(isMob?28:46);
      NV.enemies.push({type:'hunt',g:g,dx:dx,dy:dy,x:g.cx+dx,y:g.y+dy,phase:Math.random()*6.28,spd:.012,vy:.3*mobSpeedMul,t:Math.random()*100,flash:0,free:false});
    }
  } else if(NV.roundKind==='kami'){
    for(let i=0;i<n;i++) NV.enemies.push({type:'kami',x:35+Math.random()*(W-70),y:topY - Math.random()*(isMob?60:180),vx:0,vy:2*mobSpeedMul,t:Math.random()*50,flash:0,burst:false});
    if(Math.random()<.5) NV.enemies.push({type:'quantum',x:Math.max(50, Math.min(W-50, W*.3+Math.random()*W*.4)),y:topY-20,vx:0,vy:.8*mobSpeedMul,hp:2,t:0,warpCd:70,flash:0});
  } else if(NV.roundKind==='tactic'){
    for(let i=0;i<Math.max(1,Math.floor(n/3));i++) NV.enemies.push({type:'camo',x:40+Math.random()*(W-80),y:topY - Math.random()*(isMob?50:120),st:0,timer:50+Math.random()*80,t:0,flash:0});
    NV.enemies.push({type:'shield',x:Math.max(55, Math.min(W-55, W*.3+Math.random()*W*.4)),y:topY-20,vx:Math.random()<.5?1:-1,vy:.4*mobSpeedMul,hp:6,maxHp:6,t:0,flash:0,fireCd:60});
    const cx = Math.max(50, Math.min(W-50, W*.25+Math.random()*W*.5));
    const g={y:topY, vy:.45*dm, cx:cx, sway:Math.random()*6};
    NV.groups.push(g);
    for(let i=0;i<Math.max(2,n-2);i++) NV.enemies.push({type:'hunt',g:g,dx:(i-(n-3)/2)*maxSpread,dy:(i%2)*(isMob?22:40),x:g.cx,y:g.y,phase:Math.random()*6.28,spd:.013,vy:.3*mobSpeedMul,t:0,flash:0,free:false});
  } else if(NV.roundKind==='swarm'){
    for(let i=0;i<n*2;i++) NV.enemies.push({type:'swarm',x:20+Math.random()*(W-40),y:topY - Math.random()*(isMob?90:240),vx:(Math.random()-.5)*2,vy:(1+Math.random()*1.5)*mobSpeedMul,t:Math.random()*100,flash:0});
    if(Math.random()<.6) NV.enemies.push({type:'spinner',x:Math.max(50, Math.min(W-50, W*.3+Math.random()*W*.4)),y:topY-15,vx:(Math.random()-.5)*.8,vy:.5*mobSpeedMul,hp:4,t:0,flash:0,spinAng:0});
    if(NV.round>=3 && Math.random()<.7) NV.enemies.push({type:'beacon',x:Math.max(60, Math.min(W-60, W*.3+Math.random()*W*.4)),y:topY-40,vx:0,vy:.35*mobSpeedMul,hp:6,maxHp:6,t:0,flash:0,fireCd:80,ringCd:140});
  } else if(NV.roundKind==='convoy'){
    const cx=Math.max(60, Math.min(W-60, W*.25+Math.random()*W*.5));
    NV.enemies.push({type:'convoy',x:cx,y:topY,vx:0,vy:.5*dm,hp:5,t:0,flash:0});
    NV.enemies.push({type:'cruiser',x:Math.max(45, Math.min(W-45, cx+(Math.random()<.5?-60:60))),y:topY-35,vx:0,vy:.35*dm,hp:10,maxHp:10,t:0,flash:0,pulseCd:130,fireCd:55});
    for(let i=0;i<3;i++) NV.enemies.push({type:'hunt',g:null,dx:0,dy:0,x:Math.max(30,Math.min(W-30,cx+(i<2?-40:40))),y:topY+(i%2)*30,phase:Math.random()*6.28,spd:.014,vy:.35*mobSpeedMul,t:0,flash:0,free:true});
  } else if(NV.roundKind==='cruiser'){
    NV.enemies.push({type:'cruiser',x:W*.5,y:topY-25,vx:1,vy:.35*dm,hp:10,maxHp:10,t:0,flash:0,pulseCd:130,fireCd:45});
    for(let i=0;i<3;i++) NV.enemies.push({type:'hunt',g:null,dx:0,dy:0,x:W*(.25+i*.25),y:topY,phase:Math.random()*6.28,spd:.014,vy:.35*mobSpeedMul,t:0,flash:0,free:true});
  } else if(NV.roundKind==='quantum'){
    for(let i=0;i<3;i++) NV.enemies.push({type:'quantum',x:W*(.25+i*.25),y:topY-i*(isMob?22:40),vx:0,vy:.8*mobSpeedMul,hp:2,t:i*20,warpCd:60+i*20,flash:0});
  } else if(NV.roundKind==='spinner'){
    NV.enemies.push({type:'spinner',x:W*.35,y:topY-15,vx:.5,vy:.4*mobSpeedMul,hp:4,t:0,flash:0,spinAng:0});
    NV.enemies.push({type:'spinner',x:W*.65,y:topY-35,vx:-.5,vy:.4*mobSpeedMul,hp:4,t:30,flash:0,spinAng:Math.PI});
    for(let i=0;i<6;i++) NV.enemies.push({type:'swarm',x:20+Math.random()*(W-40),y:topY-Math.random()*(isMob?80:160),vx:(Math.random()-.5)*2,vy:1.2*mobSpeedMul,t:Math.random()*100,flash:0});
  }
}
function nvSpawnBoss(){
  NV.bossIdx++;
  const type = NV.bossIdx%2===1 ? 'ac' : 'fab';
  const scaling = 1 + (NV.round / 5 - 1) * 0.35;
  const hpMul = 1.15 * scaling;
  if(type==='ac'){
    NV.boss={type:'ac',x:innerWidth/2,y:-180,dir:1,entering:true,phase:1,
      plates:[-96,-32,32,96].map(function(o){const hp=Math.ceil(22*hpMul);return {off:o,hp:hp,max:hp};}),
      core:Math.ceil(85*hpMul), coreMax:Math.ceil(85*hpMul), fireCd:70,spiralCd:200};
    document.getElementById('nvBossName').textContent='☠ THE BATTLESHIP [MK.'+NV.bossIdx+']';
  } else {
    NV.boss={type:'fab',x:innerWidth/2,y:-240,entering:true,phase:1,
      belts:[{off:-120,hp:Math.ceil(30*hpMul),max:Math.ceil(30*hpMul),anim:0},{off:120,hp:Math.ceil(30*hpMul),max:Math.ceil(30*hpMul),anim:0}],
      core:Math.ceil(110*hpMul), coreMax:Math.ceil(110*hpMul), droneCd:100, fireCd:90,spiralCd:180};
    document.getElementById('nvBossName').textContent='☠ THE INDUSTRIAL FACTORY [MK.'+NV.bossIdx+']';
  }
  document.getElementById('nvBossWrap').classList.add('show');
  bossSfx();
}
function scorePulse(){ const el=document.getElementById('nvScore'); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
function addScore(v,high){
  // Check memory integrity against shadow variable and public score
  if(((NV._scoreShadow - 0x1A4) ^ NV._scoreKey) !== NV._score || NV.score !== NV._score){
    console.warn('[VIRUSARC ANTI-CHEAT] Memory integrity discrepancy.');
    showStatus('⚠️ INTEGRITY ERROR');
    NV.score = 0; NV._score = 0;
    NV._scoreShadow = (0 ^ NV._scoreKey) + 0x1A4;
    return;
  }
  NV.combo++; NV.comboT=120;
  NV._score += v + NV.combo*5;
  NV._scoreShadow = (NV._score ^ NV._scoreKey) + 0x1A4;
  NV.score = NV._score;
  document.getElementById('nvScore').textContent=NV.score;
  document.getElementById('nvCombo').textContent = NV.combo>1 ? ('COMBO x'+NV.combo) : '';
  if(high||NV.combo>=3) scorePulse();

  // Extra life every 25,000 points (cap 5 lives)
  if(!NV.lifeMark) NV.lifeMark=25000;
  if(NV.score>=NV.lifeMark){
    NV.lifeMark+=25000;
    if(NV.lives<5){ NV.lives++; renderHearts(); showLifeBonus(); fanfareSfx(); }
  }

  // In-game celebration when breaking absolute server record
  if(!NV.recordBroken && NV.allTimeBest > 0 && NV.score > NV.allTimeBest){
    NV.recordBroken = true;
    showStatus('👑 NEW ALL-TIME RECORD! 👑');
    fanfareSfx();
    if(NV.player){
      for(let k=0; k<24; k++){
        const p=getParticle(); if(!p) break;
        p.active=true; p.kind='spark'; p.x=NV.player.x; p.y=NV.player.y;
        const ang=Math.random()*6.28, spd=3+Math.random()*5;
        p.vx=Math.cos(ang)*spd; p.vy=Math.sin(ang)*spd;
        p.l=30+Math.random()*20; p.maxL=p.l; p.r=3;
        p.col=k%2===0?'#fbbf24':'#00d4ff';
      }
    }
  }
}
function renderHearts(breakIdx){
  const el=document.getElementById('nvLives'); let html='';
  for(let i=0;i<NV.lives;i++) html+='<span>❤</span>';
  if(breakIdx!==undefined) html+='<span class="break">💔</span>';
  el.innerHTML=html;
}
function renderModules(){
  const el=document.getElementById('nvModules');
  el.innerHTML='';
  const mods=[
    {key:'mis',ic:'⚡',cd:NV.misCd,max:240,col:'#00ff41',lbl:'X'},
    {key:'las',ic:'🛰️',cd:NV.lasCd,max:300,col:'#00d4ff',lbl:'C'},
    {key:'dash',ic:'🌀',cd:NV.dashCd,max:60,col:'#a855f7',lbl:'SFT'},
    {key:'bomb',ic:'☣️',cd:NV.bombT,max:85,col:'#ff003c',lbl:'B x'+NV.bombs}
  ];
  mods.forEach(function(m){
    const ready=m.cd<=0;
    const pct=ready?1:1-m.cd/m.max;
    const r=18, circ=2*Math.PI*r;
    const div=document.createElement('div');
    div.className='hud-mod'+(ready?' ready':'');
    div.innerHTML='<svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="'+r+'"/><circle class="fg" cx="22" cy="22" r="'+r+'" stroke="'+m.col+'" stroke-dasharray="'+circ+'" stroke-dashoffset="'+(circ*(1-pct))+'"/></svg><div class="ic">'+m.ic+'</div>'+(m.lbl?'<div class="hud-bomb-count">'+m.lbl+'</div>':'');
    el.appendChild(div);
  });
}
function showStatus(txt){ const st=document.getElementById('nvStatus'); st.textContent=txt; st.classList.add('show');
  setTimeout(function(){st.classList.remove('show');},1500); }
function showLifeBonus(){ const el=document.getElementById('nvLifeBonus'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }

function nvBoom(x,y,scale,type){
  scale=scale||1; type=type||'normal';
  const colors={normal:['#ff6600','#ff3300','#ffcc00'],purple:['#a855f7','#ff00ff','#ffffff'],rock:['#8a867a','#55504a','#3a3530'],volatile:['#ff2d3c','#ff6600','#ffcc00']};
  const col=colors[type]||colors.normal;
  
  const p1=getParticle(); if(p1){ p1.active=true; p1.kind='core'; p1.x=x; p1.y=y; p1.l=6; p1.maxL=6; p1.r=12*scale; p1.col='#ffffff'; }
  
  const fireCount=Math.min(8, Math.floor((nvLowPerf?3:isMobile?4:8)*scale));
  for(let i=0;i<fireCount;i++){ const p=getParticle(); if(!p)break;
    const a=Math.random()*6.28,s=1+Math.random()*3.5*scale;
    p.active=true; p.kind='fire'; p.x=x; p.y=y; p.vx=Math.cos(a)*s; p.vy=Math.sin(a)*s;
    p.l=18+Math.random()*12; p.maxL=p.l; p.r=3+Math.random()*4*scale; p.col=col[i%3]; }
  
  const smokeCount=Math.min(4, Math.floor((nvLowPerf?1:isMobile?2:4)*scale));
  for(let i=0;i<smokeCount;i++){ const p=getParticle(); if(!p)break;
    const a=Math.random()*6.28,s=.4+Math.random()*1.2;
    p.active=true; p.kind='smoke'; p.x=x; p.y=y; p.vx=Math.cos(a)*s; p.vy=Math.sin(a)*s-.4;
    p.l=35+Math.random()*20; p.maxL=p.l; p.r=6+Math.random()*6*scale; p.col='#5a5a5a'; }
  
  const sparkCount=Math.min(5, Math.floor((nvLowPerf?2:isMobile?3:5)*scale));
  for(let i=0;i<sparkCount;i++){ const p=getParticle(); if(!p)break;
    const a=Math.random()*6.28,s=2+Math.random()*3.5;
    p.active=true; p.kind='spark'; p.x=x; p.y=y; p.vx=Math.cos(a)*s; p.vy=Math.sin(a)*s-1;
    p.l=10+Math.random()*6; p.maxL=p.l; p.r=2; p.col='#ffffff'; }
  
  if(type==='volatile'){
    NV.rings.push({x:x,y:y,r:6,max:160});
  } else {
    NV.rings.push({x:x,y:y,r:6,max:50+scale*30});
  }
  
  NV.shake=Math.max(NV.shake,4+scale*3);
  explosionSfx(scale);
}
function sparks(x,y,n,col){
  const count = Math.min(n || 4, nvLowPerf ? 2 : 4);
  for(let i=0;i<count;i++){ const p=getParticle(); if(!p)break;
  const a=Math.random()*6.28,s=2+Math.random()*3.5;
  p.active=true; p.kind='spark'; p.x=x; p.y=y; p.vx=Math.cos(a)*s; p.vy=Math.sin(a)*s-1;
  p.l=10+Math.random()*6; p.maxL=p.l; p.r=2; p.col=col||'#fbbf24'; } }
function nvDebris(x,y,n){ for(let i=0;i<(n||2);i++){ if(NV.debris.length>44)NV.debris.shift();
  NV.debris.push({x:x+(Math.random()-.5)*20,y:y+(Math.random()-.5)*20,vx:(Math.random()-.5)*.6,vy:.25+Math.random()*.5,
    rot:Math.random()*6.28,vr:(Math.random()-.5)*.04,s:6+Math.random()*10,sm:0,seed:Math.floor(Math.random()*3)}); } }

function playerHit(){
  const p=NV.player; if(!p||p.inv>0||p.dead)return;
  if(p.shield>0){ p.shield=0; NV.rings.push({x:p.x,y:p.y,r:10,max:50}); sfx(300,.2,'triangle'); NV.freeze=3; return; }
  const lostIdx=NV.lives-1;
  NV.lives--; renderHearts(lostIdx);
  p.inv=110; NV.glitch=26; NV.freeze=4; NV.shake=16;
  nvBoom(p.x,p.y,1.4,'normal'); hitSfx();
  NV.combo=0; document.getElementById('nvCombo').textContent='';
  
  if(NV.lives<=0){
    p.dead=true;
    NV.shake=20;
    for(let i=0;i<5;i++){ setTimeout(function(){ nvBoom(p.x+(Math.random()-.5)*40,p.y+(Math.random()-.5)*40,1,'normal'); },i*100); }
    setTimeout(function(){
      NV.state='over'; NV.best=Math.max(NV.best,NV.score);
      const topRecord = getAbsoluteRecordScore();
      const isNewAbs = (NV.score >= topRecord && NV.score > 0) || NV.recordBroken;
      const recBanner = document.getElementById('nvNewRecordBanner');
      if(recBanner){
        if(isNewAbs){
          recBanner.style.display = 'block';
          fanfareSfx();
        } else {
          recBanner.style.display = 'none';
        }
      }
      document.getElementById('nvFinalScore').textContent='SCORE: '+NV.score;
      document.getElementById('nvFinalRound').textContent='ROUND: '+NV.round;
      document.getElementById('nvBest').textContent='RECORD: '+Math.max(NV.best, topRecord);
      prefillGameOverForm();
      nvShow('nvOver');
      setTimeout(function(){
        const n=document.getElementById('nvPilotName');
        if(n) n.focus();
      },100);
      explosionSfx(1.6);
    },1500);
  }
}
/* Impactos asteroide↔enemigo: se limita el sonido para no saturar el audio
   cuando varios asteroides chocan a la vez. */
let astHitSfxT = 0;
function astHitFeedback(x, y){
  const now = Date.now();
  if(now - astHitSfxT > 90){ astHitSfxT = now; hitSfx(); }
  NV.shake = Math.max(NV.shake, 5);
  sparks(x, y, 8, '#fbbf24');
  nvBoom(x, y, .8, 'volatile');
}

function killEnemy(e,idx,givePow){
  let boomScale = 1.0, boomType = 'normal', pts = 100, deb = 2;
  if(e.type==='cruiser'){ boomScale=1.8; boomType='volatile'; pts=350; deb=4; }
  else if(e.type==='shield'){ boomScale=1.4; boomType='normal'; pts=250; deb=3; }
  else if(e.type==='beacon'){ boomScale=1.5; boomType='volatile'; pts=300; deb=3; }
  else if(e.type==='spinner'){ boomScale=1.3; boomType='purple'; pts=220; deb=3; }
  else if(e.type==='quantum'){ boomScale=1.2; boomType='purple'; pts=180; deb=2;
    // SPLITTER: divides into 2 swarm drones on death
    for(let s=-1;s<=1;s+=2){
      NV.enemies.push({type:'swarm',x:e.x+s*14,y:e.y,vx:s*1.4,vy:1.4,t:Math.random()*100,flash:0});
    }
  }
  else if(e.type==='camo'){ boomScale=1.2; boomType='purple'; pts=150; deb=2; }
  else if(e.type==='convoy'){ boomScale=1.5; boomType='volatile'; pts=200; deb=3; }
  else if(e.type==='kami'){ boomScale=1.1; boomType='normal'; pts=120; deb=2; }
  else if(e.type==='swarm'){ boomScale=0.8; boomType='normal'; pts=60; deb=1; }

  nvBoom(e.x, e.y, boomScale, boomType);
  nvDebris(e.x, e.y, deb);
  addScore(pts, e.type!=='hunt');
  if(e.type!=='hunt') NV.freeze=Math.max(NV.freeze, 4);
  const dropChance = (typeof ownedMemes !== 'undefined' && ownedMemes.shitcoin) ? 0.32 : 0.16;
  if(givePow!==false && Math.random() < dropChance) NV.pows.push({x:e.x, y:e.y, vy:1.5, type:randomPowerUp()});
  NV.enemies.splice(idx,1);
}
function randomPowerUp(){
  const r=Math.random();
  if(r<.18) return 'piper';
  if(r<.36) return 'circle';
  if(r<.52) return 'usdc';
  if(r<.66) return 'E';
  if(r<.78) return '+';
  if(r<.88) return 'Y';
  if(r<.95) return 'P';
  return 'B';
}
function detonateAsteroid(a,idx){
  nvBoom(a.x,a.y,1.6,'volatile'); NV.rings.push({x:a.x,y:a.y,r:10,max:170});
  NV.freeze=Math.max(NV.freeze,4); addScore(80,true);
  for(let i=NV.enemies.length-1;i>=0;i--){ const e=NV.enemies[i];
    if(Math.hypot(e.x-a.x,e.y-a.y)<170) killEnemy(e,i,false); }
  for(let i=NV.asteroids.length-1;i>=0;i--){ const o=NV.asteroids[i];
    if(o!==a && o.vol && Math.hypot(o.x-a.x,o.y-a.y)<170){ NV.asteroids.splice(i,1); detonateAsteroid(o,i); } }
  const at=NV.asteroids.indexOf(a); if(at>=0) NV.asteroids.splice(at,1);
}
function doDash(){
  // 1. WARP DASH — directional teleport + invulnerable + clears nearby enemy bullets
  const p=NV.player; if(!p||NV.dashCd>0||NV.state!=='playing')return;
  NV.dashCd=60; p.dashT=14; p.inv=Math.max(p.inv,40);
  p.face = p.ax!==0 ? p.ax : p.face;
  warpSplitSfx(); showStatus('🌀 WARP DASH');
  // Directional teleport toward current movement input (default: up)
  const K=NV.keys;
  let dxp=(K['ArrowRight']||K['d']||K['D']?1:0)-(K['ArrowLeft']||K['a']||K['A']?1:0);
  let dyp=(K['ArrowDown']||K['s']||K['S']?1:0)-(K['ArrowUp']||K['w']||K['W']?1:0);
  if(NV.touch && (NV.touch.dx||NV.touch.dy)){ dxp=NV.touch.dx; dyp=NV.touch.dy; }
  if(dxp===0&&dyp===0){ dyp=-1; }
  const m=Math.hypot(dxp,dyp);
  const ox=p.x, oy=p.y;
  p.x=Math.max(26,Math.min(innerWidth-26,p.x+(dxp/m)*120));
  p.y=Math.max(60,Math.min(innerHeight-40,p.y+(dyp/m)*120));
  // Bullet-clearing warp wake between old and new position
  for(let j=NV.ebullets.length-1;j>=0;j--){
    const eb=NV.ebullets[j];
    const d1=Math.hypot(eb.x-ox,eb.y-oy), d2=Math.hypot(eb.x-p.x,eb.y-p.y);
    if(d1<70||d2<90){ NV.ebullets.splice(j,1); sparks(eb.x,eb.y,4,'#a855f7'); addScore(5); }
  }
  // Deploy dual holographic decoy vessels that draw hostile fire
  NV.decoys.push(
    { x: ox - 58, y: oy - 12, l: 150, maxL: 150, face: -1, vx: -1.3, vy: 0 },
    { x: ox + 58, y: oy - 12, l: 150, maxL: 150, face: 1, vx: 1.3, vy: 0 }
  );
  // Warp plasma sparks
  for(let i=0;i<12;i++){
    const p2=getParticle(); if(!p2)break;
    p2.active=true; p2.kind='spark'; p2.x=p.x; p2.y=p.y;
    p2.vx=-p.face*(3+Math.random()*4); p2.vy=(Math.random()-.5)*3;
    p2.l=16; p2.maxL=16; p2.r=3.5; p2.col=i%2===0?'#a855f7':'#00d4ff';
  }
}

function fireMissiles(){
  // X — ARC RAILGUN: full-screen piercing rail beam straight ahead (long range)
  const p=NV.player; if(!p||NV.misCd>0||NV.state!=='playing')return;
  NV.misCd=240; NV.railgunT=22; NV.railgunX=p.x; NV.shake=Math.max(NV.shake,10);
  showStatus('⚡ ARC RAILGUN');
  sfx(1200,.35,'sawtooth',.25); setTimeout(function(){sfx(300,.3,'square',.2);},70);
  // Instant corridor damage along the full vertical path
  for(let i=NV.enemies.length-1;i>=0;i--){
    const e=NV.enemies[i];
    if(e.y < p.y && Math.abs(e.x-p.x)<36){
      if(e.hp && e.hp>8){ e.hp-=8; e.flash=4; nvBoom(e.x,e.y,1,'purple'); sparks(e.x,e.y,6,'#00d4ff'); }
      else killEnemy(e,i);
    }
  }
  for(let i=NV.asteroids.length-1;i>=0;i--){
    const a=NV.asteroids[i];
    if(a.y < p.y && Math.abs(a.x-p.x)<40){
      a.hp-=10;
      if(a.hp<=0){ if(a.vol)detonateAsteroid(a,i); else { nvBoom(a.x,a.y,1,'rock'); NV.asteroids.splice(i,1); addScore(50); } }
    }
  }
  if(NV.boss && Math.abs(NV.boss.x-p.x)<90 && NV.boss.y < p.y){ damageBoss(12,p.x,NV.boss.y); }
}

function firePierce(){
  // C — ORBITAL STRIKE: 6 telegraphed ion beams called down from orbit (long range AoE)
  const p=NV.player; if(!p||NV.lasCd>0||NV.state!=='playing')return;
  NV.lasCd=300; showStatus('🛰️ ORBITAL STRIKE');
  sfx(220,.4,'sine',.2); setTimeout(function(){sfx(880,.25,'sine',.15);},150);
  const targets=[];
  for(let i=0;i<NV.enemies.length && targets.length<6;i++) targets.push({x:NV.enemies[i].x,y:NV.enemies[i].y});
  if(NV.boss) targets.unshift({x:NV.boss.x,y:NV.boss.y});
  while(targets.length<6) targets.push({x:60+Math.random()*(innerWidth-120),y:60+Math.random()*(innerHeight*0.55)});
  for(let i=0;i<6;i++) NV.orbitals.push({x:targets[i].x,y:targets[i].y,t:0,delay:40+i*10});
}

function useBomb(){
  // 4. VIRUSARC QUORUM OVERDRIVE (Screen-clearing omnidirectional sonic flute vortex)
  if(NV.bombs<=0||NV.bombT>0||NV.state!=='playing')return;
  NV.bombs--; NV.bombT=85; NV.bombHit=false; quorumSfx(); NV.shake=16;
  if(NV.player) NV.player.inv=Math.max(NV.player.inv,60);
  showStatus('☣️ QUORUM OVERDRIVE');
  const p=NV.player;
  if(p){
    for(let k=0; k<24; k++){
      const an = k * (Math.PI * 2 / 24);
      spawnPlayerBullet({
        x: p.x, y: p.y,
        vx: Math.cos(an)*11, vy: Math.sin(an)*11,
        rot: an, giant: true, pierce: 4, green: true
      });
    }
  }
}

/* ============ LEADERBOARD & ALL-TIME RECORDS (CRYPTOGRAPHICALLY SIGNED) ============ */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const _SEC_SALT = 'ARC_VIRUS_v5_SALT_9973';

/** Normaliza el nombre EXACTAMENTE igual que el servidor (PHP y Node), porque
 *  el nombre entra en la firma: si el cliente manda minúsculas y el servidor
 *  las pasa a mayúsculas, la firma no coincidiría y el record se rechazaría. */
function cleanPilotName(n){
  const s = String(n == null ? '' : n).toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 10);
  return s || 'PILOT';
}

/** Valida la wallet del piloto: 0x + 40 hex (EVM) o un ENS tipo nombre.eth. */
function cleanWallet(w){
  const s = String(w == null ? '' : w).trim();
  if(/^0x[0-9a-fA-F]{40}$/.test(s)) return s.toLowerCase();
  if(/^[a-z0-9][a-z0-9-]{1,61}\.eth$/i.test(s)) return s.toLowerCase();
  return '';
}
/** Formato corto para tablas: 0x1234…ABCD */
function shortWallet(w){
  const s = cleanWallet(w);
  if(!s) return '—';
  if(s.indexOf('.eth') > 0) return s;
  return s.slice(0,6) + '…' + s.slice(-4);
}

/** Firma FNV v3 del record (name|score|round|date|ts|nonce|wallet|salt).
 *  Barrera anti-tamper; no es criptografía real porque la sal vive en el cliente. */
function computeRecordSig(entry){
  const str = (entry.name||'') + '|' + (entry.score||0) + '|' + (entry.round||0) + '|' + (entry.date||'') +
              '|' + (entry._ts||0) + '|' + (entry._n||'') + '|' + (cleanWallet(entry.wallet)) + '|' + _SEC_SALT;
  return fnv1a(str);
}

function fnv1a(str){
  let h = 0x811c9dc5;
  for(let i=0; i<str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function computeRecordSigV2(entry){
  // Firma v2 (antes de la wallet): solo para verificar records antiguos
  return fnv1a((entry.name||'') + '|' + (entry.score||0) + '|' + (entry.round||0) + '|' + (entry.date||'') +
               '|' + (entry._ts||0) + '|' + (entry._n||'') + '|' + _SEC_SALT);
}

function computeRecordSigV1(entry){
  // Legacy signature (before timestamp+nonce)
  return fnv1a((entry.name||'') + '|' + (entry.score||0) + '|' + (entry.round||0) + '|' + (entry.date||'') + '|' + _SEC_SALT);
}

function verifyRecordIntegrity(entry){
  if(!entry || typeof entry.score !== 'number' || typeof entry.name !== 'string' || !entry._sig) return false;
  // Acepta v3 (actual), v2 y v1 para que los records anteriores sobrevivan
  return entry._sig === computeRecordSig(entry)
      || entry._sig === computeRecordSigV2(entry)
      || entry._sig === computeRecordSigV1(entry);
}

function getWeeklyEpoch(){
  let epoch = parseInt(localStorage.getItem('arc_weekly_epoch'), 10);
  if(!epoch || isNaN(epoch) || (Date.now() - epoch) >= WEEK_MS){
    epoch = Date.now();
    localStorage.setItem('arc_weekly_epoch', epoch);
    localStorage.setItem('arc_weekly_leaderboard', JSON.stringify([]));
  }
  return epoch;
}

// Bulletproof Deduplication: Guarantees strictly ONE record per pilot name, keeping only their highest score
function deduplicateAndRank(list){
  if(!Array.isArray(list)) return [];
  const map = new Map();
  for(let i = 0; i < list.length; i++){
    const entry = list[i];
    if(!entry || typeof entry.score !== 'number') continue;
    const cleanName = (entry.name || 'PILOT').trim().toUpperCase().slice(0, 10) || 'PILOT';
    const wallet = cleanWallet(entry.wallet);
    const norm = {
      name: cleanName,
      score: entry.score,
      round: entry.round || 1,
      date: entry.date || new Date().toLocaleDateString('en-US'),
      wallet: wallet,
      // Se conservan ts/nonce/firma originales: al recalcularlos se invalidaría
      // la firma de los records que llegan del servidor.
      _ts: entry._ts || 0,
      _n: entry._n || '',
      _sig: entry._sig || ''
    };
    if(!map.has(cleanName)){
      map.set(cleanName, norm);
    } else {
      const cur = map.get(cleanName);
      const better = norm.score > cur.score
        || (norm.score === cur.score && norm.round > cur.round)
        || (norm.score === cur.score && norm.round === cur.round && !cur.wallet && norm.wallet);
      if(better) map.set(cleanName, norm);
    }
  }
  const unique = Array.from(map.values());
  unique.sort(function(a, b){
    return b.score - a.score || b.round - a.round;
  });
  return unique.slice(0, 10);
}

function getWeeklyData(){
  getWeeklyEpoch();
  try{
    const d = localStorage.getItem('arc_weekly_leaderboard');
    if(!d) return [];
    const parsed = JSON.parse(d);
    if(!Array.isArray(parsed)) return [];
    const valid = parsed.filter(function(e){ return verifyRecordIntegrity(e); });
    const clean = deduplicateAndRank(valid);
    if(clean.length !== parsed.length){
      saveWeeklyData(clean);
    }
    return clean;
  }catch(e){ return []; }
}

function saveWeeklyData(data){
  const clean = deduplicateAndRank(data);
  localStorage.setItem('arc_weekly_leaderboard', JSON.stringify(clean));
}

function getAllTimeData(){
  try{
    const d = localStorage.getItem('arc_alltime_records');
    if(!d) return [];
    const parsed = JSON.parse(d);
    if(!Array.isArray(parsed)) return [];
    const valid = parsed.filter(function(e){ return verifyRecordIntegrity(e); });
    const clean = deduplicateAndRank(valid);
    if(clean.length !== parsed.length){
      saveAllTimeData(clean);
    }
    return clean;
  }catch(e){ return []; }
}

function saveAllTimeData(data){
  const clean = deduplicateAndRank(data);
  localStorage.setItem('arc_alltime_records', JSON.stringify(clean));
}

function getAbsoluteRecordScore(){
  const all = getAllTimeData();
  return all.length > 0 ? all[0].score : 0;
}

let weeklyTimerInterval = null;
function updateWeeklyCountdown(){
  const epoch = getWeeklyEpoch();
  const remaining = Math.max(0, (epoch + WEEK_MS) - Date.now());
  const days = Math.floor(remaining / (24 * 3600 * 1000));
  const hours = Math.floor((remaining % (24 * 3600 * 1000)) / (3600 * 1000));
  const mins = Math.floor((remaining % (3600 * 1000)) / (60 * 1000));
  const secs = Math.floor((remaining % (60 * 1000)) / 1000);
  const el = document.getElementById('lbWeeklyCountdown');
  if(el) el.textContent = `${days}d ${hours}h ${mins}m ${secs}s`;
}

function switchLbTab(tab){
  NV.activeTab = tab;
  const tabW = document.getElementById('tabWeeklyBtn');
  const tabA = document.getElementById('tabAllTimeBtn');
  const notice = document.getElementById('lbWeeklyNotice');
  if(tab === 'weekly'){
    if(tabW) tabW.classList.add('active');
    if(tabA) tabA.classList.remove('active');
    if(notice) notice.style.display = 'block';
    updateWeeklyCountdown();
    if(!weeklyTimerInterval) weeklyTimerInterval = setInterval(updateWeeklyCountdown, 1000);
  } else {
    if(tabA) tabA.classList.add('active');
    if(tabW) tabW.classList.remove('active');
    if(notice) notice.style.display = 'none';
    if(weeklyTimerInterval){ clearInterval(weeklyTimerInterval); weeklyTimerInterval = null; }
  }
  renderLeaderboard();
}

function updateOrInsertRecord(list, newEntry){
  const cleanList = Array.isArray(list) ? list.slice() : [];
  cleanList.push(newEntry);
  return deduplicateAndRank(cleanList);
}

/* ============ ENDPOINTS DEL LEADERBOARD (multi-host) ============
   El proyecto puede desplegarse en hosts PHP (Hostinger) o Node (Vercel).
   Antes solo se llamaba a api/records.php: en Vercel eso no ejecuta nada, el
   fetch devolvía el código fuente y el catch vacío lo ocultaba, así que los
   records nunca se guardaban. Ahora se prueban los endpoints en orden, se
   recuerda el que funciona y los errores se muestran en pantalla. */
let _recordsEndpoint = null;   // memoizado tras el primer acierto

function recordEndpoints(){
  return ['api/records.js', 'api/records.php']; // Node/serverless primero, PHP después
}

function recordsErrorMsg(res, data){
  if(res.status === 422) return '❌ Wallet obligatoria: introduce una dirección 0x… válida o un nombre .eth.';
  if(res.status === 429) return '⏳ Demasiado rápido: espera unos segundos antes de guardar otro record.';
  if(res.status === 403) return '⛔ El servidor rechazó la firma del record. Recarga la página (Ctrl+F5) e inténtalo de nuevo.';
  if(res.status === 500) return '⚠️ El servidor no pudo escribir el record: ' + ((data && data.storage && data.storage.note) || 'revisa los permisos de escritura de data/.');
  if(res.status === 404) return '⚠️ No hay backend de records en este host (falta api/records.js o api/records.php).';
  return '⚠️ No se pudo guardar el record (' + res.status + '): ' + ((data && data.error) || 'error del servidor') + '.';
}

/** Acepta la respuesta solo si es JSON real (en Vercel, records.php devuelve el
 *  código fuente como texto y res.json() fallaría). */
function recordsJson(res){
  const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  if(ct.indexOf('application/json') < 0) throw new Error('respuesta no-JSON');
  return res.json();
}

async function recordsFetch(path, options){
  const res = await fetch(path, options);
  let data = null;
  try { data = await recordsJson(res); }
  catch(e){
    // No es JSON (p.ej. código PHP en crudo): equivalente a "no hay backend aquí"
    const err = new Error('non-json');
    err.status = res.status;
    err.data = null;
    throw err;
  }
  if(!res.ok){
    const err = new Error((data && data.error) || ('HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function recordsRequest(method, entry){
  const options = method === 'POST'
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry: entry }) }
    : { method: 'GET' };
  const order = _recordsEndpoint
    ? [_recordsEndpoint].concat(recordEndpoints().filter(function(p){ return p !== _recordsEndpoint; }))
    : recordEndpoints();
  let lastErr = null;
  for(let i = 0; i < order.length; i++){
    const path = order[i];
    try {
      const data = await recordsFetch(path, options);
      _recordsEndpoint = path;
      return data;
    } catch(e){
      lastErr = e;
      // 4xx "de negocio" (firma, rate limit, wallet): el endpoint SÍ existe,
      // no tiene sentido probar el siguiente.
      if(e.status && e.status !== 404 && e.status !== 405 && e.status !== 501) throw e;
    }
  }
  const err = lastErr || new Error('sin endpoints');
  if(!err.status) err.status = 404;
  throw err;
}

function syncPostRecord(entry){
  return recordsRequest('POST', entry).then(function(data){
    const all = (data && Array.isArray(data.allTime)) ? data.allTime : null;
    const wk  = (data && Array.isArray(data.weekly)) ? data.weekly : null;
    if(all && all.length) saveAllTimeData(all);
    if(wk && wk.length) saveWeeklyData(wk);
    if(typeof renderLeaderboard === 'function') renderLeaderboard(entry.name);
    return data;
  });
}

function syncGetRecords(){
  return recordsRequest('GET').then(function(data){
    if(data && Array.isArray(data.allTime)){
      let mergedAll = getAllTimeData();
      data.allTime.forEach(function(e){ mergedAll = updateOrInsertRecord(mergedAll, e); });
      saveAllTimeData(mergedAll);
    }
    if(data && Array.isArray(data.weekly)){
      let mergedWk = getWeeklyData();
      data.weekly.forEach(function(e){ mergedWk = updateOrInsertRecord(mergedWk, e); });
      saveWeeklyData(mergedWk);
    }
    renderLeaderboard();
    if(data && data.storage && data.storage.persistent === false){
      console.warn('[ARC] Leaderboard en almacenamiento NO persistente:', data.storage.note);
    }
    return data;
  }).catch(function(){
    // Sin backend accesible: se sigue jugando con el ranking local
    return null;
  });
}

let _savingRecord = false;
/** Rellena el formulario de fin de partida con los últimos datos del piloto. */
function prefillGameOverForm(){
  const nameEl = document.getElementById('nvPilotName');
  const walletEl = document.getElementById('nvPilotWallet');
  const msgEl = document.getElementById('lbSaveMsg');
  if(nameEl) nameEl.value = NV.pilotName || localStorage.getItem('arc_last_pilot') || '';
  if(walletEl){
    walletEl.value = localStorage.getItem('arc_last_wallet') || '';
    walletEl.classList.remove('err');
  }
  if(msgEl) msgEl.textContent = '';
  const hud = document.getElementById('nvHUD');
  if(hud) hud.classList.remove('show');
}

function saveLeaderboard(){
  const nameInput=document.getElementById('nvPilotName');
  const walletInput=document.getElementById('nvPilotWallet');
  const msgEl=document.getElementById('lbSaveMsg');
  const name=cleanPilotName(nameInput.value);

  // --- WALLET OBLIGATORIA: sin dirección válida no se guarda el record ---
  const wallet = cleanWallet(walletInput ? walletInput.value : '');
  if(!wallet){
    if(msgEl) msgEl.textContent = '❌ La wallet es obligatoria: introduce una dirección válida (0x + 40 caracteres) o un nombre .eth.';
    if(walletInput){
      walletInput.classList.add('err');
      try { walletInput.focus(); } catch(e){}
      setTimeout(function(){ walletInput.classList.remove('err'); }, 2200);
    }
    return;
  }
  if(_savingRecord) return;
  _savingRecord = true;

  NV.pilotName=name;
  localStorage.setItem('arc_last_pilot',name);
  localStorage.setItem('arc_last_wallet',wallet);

  const prevTop1 = getAbsoluteRecordScore();
  const legitimateScore = Math.max(0, NV.score);
  const entry={ name:name, score:legitimateScore, round:Math.max(1, NV.round), date:new Date().toLocaleDateString('en-US'), wallet:wallet };
  entry._ts = Date.now();
  entry._n  = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  entry._sig = computeRecordSig(entry);

  // 1. Save to Weekly Leaderboard (strictly 1 record per pilot: overwrites lower, deletes old, preserves best)
  const weekly = updateOrInsertRecord(getWeeklyData(), entry);
  saveWeeklyData(weekly);

  // 2. Save to Permanent All-Time Top 10 Records (strictly 1 record per pilot: overwrites lower, deletes old, preserves best)
  const allTime = updateOrInsertRecord(getAllTimeData(), entry);
  const isNewAbsolute = prevTop1 > 0 ? (legitimateScore > prevTop1) : (legitimateScore > 0);
  saveAllTimeData(allTime);

  // 3. Enviar al backend (serverless Node o PHP): informa de éxito o del error real
  if(msgEl) msgEl.textContent = '⏳ Firmando y enviando al servidor...';
  syncPostRecord(entry).then(function(data){
    _savingRecord = false;
    let txt = '✅ Record firmado y guardado: ' + name;
    if(data && data.storage && data.storage.persistent === false){
      txt += ' ⚠️ (almacenamiento temporal del host: el ranking puede reiniciarse)';
    }
    if(msgEl) msgEl.textContent = txt;
  }).catch(function(err){
    _savingRecord = false;
    const status = err && err.status ? err.status : 0;
    const data = err && err.data ? err.data : null;
    const local = '💾 Guardado en este dispositivo.';
    if(msgEl) msgEl.textContent = recordsErrorMsg({ status: status }, data) + ' ' + local;
  });
  setTimeout(function(){
    switchLbTab(isNewAbsolute ? 'alltime' : (NV.activeTab || 'weekly'));
    renderLeaderboard(name);
    nvShow('nvLeaderboard');
  }, 800);
}

function renderLeaderboard(highlight){
  const isWeekly = (NV.activeTab || 'weekly') === 'weekly';
  const lb = isWeekly ? getWeeklyData() : getAllTimeData();
  const body=document.getElementById('lbBody');
  if(!body) return;
  body.innerHTML='';
  if(lb.length===0){
    const msg = isWeekly
      ? 'No records this week yet. Be the first to set a score!'
      : 'No all-time records yet. Be the first legend in the Hall of Fame!';
    body.innerHTML='<tr><td colspan="6" style="text-align:center; color:#9fd4ff; padding:20px;">'+msg+'</td></tr>';
    return;
  }
  const medals=['🥇','🥈','🥉'];
  lb.forEach(function(e,i){
    const tr=document.createElement('tr');
    if(highlight && e.name===highlight) tr.className='new';
    tr.innerHTML='<td>'+(medals[i]||(i+1))+'</td><td>'+esc(e.name)+'</td><td class="lb-wallet" title="'+esc(e.wallet||'')+'">'+esc(shortWallet(e.wallet))+'</td><td>'+e.score.toLocaleString()+'</td><td>'+e.round+'</td><td>'+esc(e.date)+'</td>';
    body.appendChild(tr);
  });
}

/* ============ ARC BROWSER 3.0 PRO ============ */
let browserTabs = [{id:'tab1',title:'New Tab',url:'arc://newtab',favicon:'🏠',history:['arc://newtab'],historyIdx:0}];
let activeTabId = 'tab1';
let tabCounter = 1;

let userWallet = {
  ARC: 500000000,
  USDC: 1000,
  PIPER: 50000
};

let swapState = {
  from: 'ARC',
  to: 'USDC',
  fromAmt: 50000
};

let ownedMemes = {
  pingu: false,
  pug: false,
  shitcoin: false,
  tick: false
};

const TOKEN_RATES = {
  ARC: 1,
  USDC: 500,
  PIPER: 100
};

function updateGlobalArcDisplays(){
  const s = userWallet.ARC.toLocaleString();
  const el1 = document.getElementById('sidebarArcBal');
  if(el1) el1.textContent = s;
  const el2 = document.getElementById('mainArcBal');
  if(el2) el2.textContent = s;
  const el4 = document.getElementById('shopArcBal');
  if(el4) el4.textContent = s;
}

/* =====================================================
   ARC SYNTH LAB — CYBER CHIPTUNE SYNTHESIZER
   ===================================================== */
let synthOscType = 'sawtooth';
let synthDecay = 0.35;
let synthFilterFreq = 1800;
let synthDistortion = 15;
let synthArpActive = false;
let synthArpTimer = null;
let synthScopeAnim = null;
let synthActiveNotes = {};

const SYNTH_KEYS = [
  { note: 'C4',  freq: 261.63, k: 'A', black: false },
  { note: 'C#4', freq: 277.18, k: 'W', black: true, left: 30 },
  { note: 'D4',  freq: 293.66, k: 'S', black: false },
  { note: 'D#4', freq: 311.13, k: 'E', black: true, left: 74 },
  { note: 'E4',  freq: 329.63, k: 'D', black: false },
  { note: 'F4',  freq: 349.23, k: 'F', black: false },
  { note: 'F#4', freq: 369.99, k: 'T', black: true, left: 160 },
  { note: 'G4',  freq: 392.00, k: 'G', black: false },
  { note: 'G#4', freq: 415.30, k: 'Y', black: true, left: 204 },
  { note: 'A4',  freq: 440.00, k: 'H', black: false },
  { note: 'A#4', freq: 466.16, k: 'U', black: true, left: 248 },
  { note: 'B4',  freq: 493.88, k: 'J', black: false },
  { note: 'C5',  freq: 523.25, k: 'K', black: false },
  { note: 'C#5', freq: 554.37, k: 'O', black: true, left: 334 },
  { note: 'D5',  freq: 587.33, k: 'L', black: false },
  { note: 'D#5', freq: 622.25, k: 'P', black: true, left: 378 },
  { note: 'E5',  freq: 659.25, k: ';', black: false }
];

function playSynthNote(freq, noteName){
  if(!soundOn) toggleSound();
  const a = ac(); if(!a) return;
  const t = a.currentTime;
  
  // Highlight UI key
  const el = document.getElementById('skey-' + (noteName||'').replace('#','s'));
  if(el){
    el.classList.add('active');
    setTimeout(function(){ if(el) el.classList.remove('active'); }, Math.max(120, synthDecay * 600));
  }

  // Audio Graph
  const osc = a.createOscillator();
  const filter = a.createBiquadFilter();
  const gain = a.createGain();

  osc.type = synthOscType;
  osc.frequency.setValueAtTime(freq, t);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(synthFilterFreq, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(100, synthFilterFreq * 0.4), t + synthDecay);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.24, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + synthDecay);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterNode(a));

  osc.start(t);
  osc.stop(t + synthDecay + 0.05);

  synthActiveNotes[freq] = { t: Date.now(), freq: freq };
}

function playSynthDemo(melodyType){
  const tunes = {
    cyber: [
      { f: 440, d: 150 }, { f: 523.25, d: 150 }, { f: 659.25, d: 150 }, { f: 783.99, d: 250 },
      { f: 659.25, d: 150 }, { f: 523.25, d: 150 }, { f: 440, d: 350 }
    ],
    ships: [
      { f: 261.63, d: 120 }, { f: 329.63, d: 120 }, { f: 392, d: 120 }, { f: 523.25, d: 180 },
      { f: 466.16, d: 140 }, { f: 392, d: 140 }, { f: 349.23, d: 140 }, { f: 261.63, d: 300 }
    ],
    gameboy: [
      { f: 329.63, d: 130 }, { f: 493.88, d: 130 }, { f: 523.25, d: 130 }, { f: 587.33, d: 200 },
      { f: 523.25, d: 130 }, { f: 493.88, d: 130 }, { f: 440, d: 300 }
    ]
  };
  const tune = tunes[melodyType] || tunes.cyber;
  let delay = 0;
  tune.forEach(function(step){
    setTimeout(function(){ playSynthNote(step.f); }, delay);
    delay += step.d;
  });
  spawnToast('🎶 Playing ' + melodyType.toUpperCase() + ' demo groove!');
}

function startSynthScope(){
  const cv = document.getElementById('synthScopeCanvas');
  if(!cv) return;
  const ctx = cv.getContext('2d');
  let phase = 0;
  function draw(){
    if(!document.getElementById('synthScopeCanvas')){
      cancelAnimationFrame(synthScopeAnim);
      return;
    }
    ctx.fillStyle = 'rgba(11, 13, 23, 0.25)';
    ctx.fillRect(0, 0, cv.width, cv.height);

    // Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cv.height/2); ctx.lineTo(cv.width, cv.height/2);
    ctx.moveTo(cv.width/2, 0); ctx.lineTo(cv.width/2, cv.height);
    ctx.stroke();

    // Soundwave
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#00d4ff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();

    const now = Date.now();
    let hasLive = false;
    for(const k in synthActiveNotes){
      if(now - synthActiveNotes[k].t < 600){ hasLive = true; }
      else { delete synthActiveNotes[k]; }
    }

    const amp = hasLive ? (cv.height * 0.38) : 4;
    const freqFactor = hasLive ? 0.08 : 0.02;

    for(let x=0; x<cv.width; x++){
      let y = cv.height/2;
      if(synthOscType === 'sine'){
        y += Math.sin(x * freqFactor + phase) * amp;
      } else if(synthOscType === 'square'){
        y += (Math.sin(x * freqFactor + phase) >= 0 ? 1 : -1) * amp * 0.85;
      } else if(synthOscType === 'sawtooth'){
        y += (((x * freqFactor + phase) % Math.PI) / Math.PI - 0.5) * 2 * amp;
      } else if(synthOscType === 'triangle'){
        y += (Math.asin(Math.sin(x * freqFactor + phase)) / (Math.PI / 2)) * amp;
      }
      if(x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    phase += 0.15;
    synthScopeAnim = requestAnimationFrame(draw);
  }
  if(synthScopeAnim) cancelAnimationFrame(synthScopeAnim);
  draw();
}

function renderSwapPage(){
  // White keys & Black keys setup
  let whiteKeysHtml = '';
  let blackKeysHtml = '';
  SYNTH_KEYS.forEach(function(k){
    const id = 'skey-' + k.note.replace('#', 's');
    if(k.black){
      blackKeysHtml += '<div class="synth-key-black" id="'+id+'" style="left:'+k.left+'px;" onmousedown="playSynthNote('+k.freq+',\''+k.note+'\')" ontouchstart="event.preventDefault(); playSynthNote('+k.freq+',\''+k.note+'\')"><span>'+k.k+'</span></div>';
    } else {
      whiteKeysHtml += '<div class="synth-key-white" id="'+id+'" onmousedown="playSynthNote('+k.freq+',\''+k.note+'\')" ontouchstart="event.preventDefault(); playSynthNote('+k.freq+',\''+k.note+'\')"><span>'+k.k+'</span><span style="font-size:9px;color:#94a3b8;font-weight:normal;">'+k.note+'</span></div>';
    }
  });

  setTimeout(startSynthScope, 50);

  return '<div class="synth-wrap">' +
    '<div class="synth-card">' +
      '<div class="synth-header">' +
        '<div style="display:flex; align-items:center; gap:10px;">' +
          '<span style="font-size:26px;">🎹</span>' +
          '<div>' +
            '<div style="font-size:17px; font-weight:800; color:#fff; letter-spacing:.5px;">ARC Synth Lab v2.0</div>' +
            '<div style="font-size:11px; color:#94a3b8;">Real-time WebAudio Chiptune & 8-Bit Synthesizer</div>' +
          '</div>' +
        '</div>' +
        '<div class="swap-wallet" style="color:#00d4ff; background:rgba(0,212,255,0.1); border:1px solid rgba(0,212,255,0.3); font-size:11px; font-weight:700;">LIVE OSCILLOSCOPE</div>' +
      '</div>' +

      '<canvas class="synth-scope" id="synthScopeCanvas" width="620" height="90"></canvas>' +

      '<div class="synth-controls">' +
        '<div class="synth-knob-box">' +
          '<label>Oscillator</label>' +
          '<select onchange="synthOscType=this.value; if(synthActiveNotes) synthActiveNotes[440]={t:Date.now()};">' +
            '<option value="sawtooth"' + (synthOscType==='sawtooth'?' selected':'') + '>⚡ Sawtooth (8-Bit)</option>' +
            '<option value="square"' + (synthOscType==='square'?' selected':'') + '>🕹️ Square (Chiptune)</option>' +
            '<option value="triangle"' + (synthOscType==='triangle'?' selected':'') + '>📐 Triangle (Warm)</option>' +
            '<option value="sine"' + (synthOscType==='sine'?' selected':'') + '>🌊 Sine (Sub-Bass)</option>' +
          '</select>' +
        '</div>' +
        '<div class="synth-knob-box">' +
          '<label>Decay Time: <span id="lblDecay" style="color:#00d4ff;">' + synthDecay + 's</span></label>' +
          '<input type="range" min="0.1" max="1.2" step="0.05" value="' + synthDecay + '" oninput="synthDecay=parseFloat(this.value); document.getElementById(\'lblDecay\').textContent=this.value+\'s\';">' +
        '</div>' +
        '<div class="synth-knob-box">' +
          '<label>Lowpass Filter: <span id="lblFilter" style="color:#00d4ff;">' + synthFilterFreq + 'Hz</span></label>' +
          '<input type="range" min="400" max="4500" step="100" value="' + synthFilterFreq + '" oninput="synthFilterFreq=parseInt(this.value); document.getElementById(\'lblFilter\').textContent=this.value+\'Hz\';">' +
        '</div>' +
      '</div>' +

      '<div class="synth-keys-wrap" style="position:relative; width:440px; margin:0 auto; overflow:visible;">' +
        blackKeysHtml +
        whiteKeysHtml +
      '</div>' +
      '<div style="text-align:center; font-size:11px; color:#64748b; margin-top:6px;">Use keyboard keys <b>[A S D F G H J K L ;]</b> or touch/click keys to play notes</div>' +

      '<div class="synth-presets">' +
        '<span style="font-size:11px; color:#94a3b8; font-weight:700; text-transform:uppercase;">Melody Demos:</span>' +
        '<button class="synth-preset-btn" onclick="playSynthDemo(\'cyber\')">🚀 Cyber Anthem</button>' +
        '<button class="synth-preset-btn" onclick="playSynthDemo(\'ships\')">👾 Ships Theme</button>' +
        '<button class="synth-preset-btn" onclick="playSynthDemo(\'gameboy\')">🎮 GameBoy Nostalgia</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

window.addEventListener('keydown', function(e){
  const win = document.getElementById('win-browser');
  if(!win || win.style.display === 'none') return;
  if(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  const tab = browserTabs.find(function(t){ return t.id === activeTabId; });
  if(!tab || (tab.url !== 'arc://synth' && tab.url !== 'arc://swap')) return;
  const keyUpper = e.key.toUpperCase();
  const match = SYNTH_KEYS.find(function(k){ return k.k === keyUpper; });
  if(match){
    e.preventDefault();
    playSynthNote(match.freq, match.note);
  }
});

// ARC Browser keyboard shortcuts (only while the browser window is visible)
window.addEventListener('keydown', function(e){
  const win = document.getElementById('win-browser');
  if(!win || win.style.display === 'none') return;
  if(typeof NV !== 'undefined' && NV.on) return;
  const urlInput = document.getElementById('browserUrlInput');
  const inField = e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA');
  if((e.ctrlKey && (e.key==='l'||e.key==='L')) || e.key==='F6'){
    e.preventDefault();
    if(urlInput){ urlInput.focus(); urlInput.select(); }
    return;
  }
  if(inField) return;
  if(e.altKey && e.key==='ArrowLeft'){ e.preventDefault(); browserBack(); }
  else if(e.altKey && e.key==='ArrowRight'){ e.preventDefault(); browserForward(); }
});

const memeProducts = [
  { id:'pingu', name:'Pingu', icon:'🐧', x:'https://x.com/PinguMemeX', price:50000000, desc:'The most dangerous penguin on digital ice. Noot noot.', perk:'❄️ Ice Laser in Ships.exe' },
  { id:'pug', name:'Pug Galaxys', icon:'🐶', x:'https://x.com/Puggalaxys1', price:100000000, desc:'A space pug guarding meme galaxies across the metaverse.', perk:'❤️ +1 Extra Life' },
  { id:'shitcoin', name:'Shitcoin Lovers', icon:'💩', x:'https://x.com/ShitCoinsLovers', price:200000000, desc:'True love for worthless coins. Pure diamond hands.', perk:'🪙 2x ARC Drop Rate' },
  { id:'tick', name:'Tick Cult', icon:'✅', img:'assets/TICKCULT.jpg', x:'https://x.com/TICKCULT', price:300000000, desc:'The cult of the tick confirming spiritual infection. Tick tick tick.', perk:'🛡️ Auto-Shield on ship' },
  { id:'whatif', name:'WHATIF', icon:'🤔', x:'https://x.com/WHIFOFFICIAL', price:400000000, desc:'What if your meme defended the whole network? It does now.', perk:'⚡ +1 starting Bomb & 20% faster ability cooldowns' },
  { id:'pome', name:'POME On Arc', icon:'🧾', x:'https://x.com/ProofOfMeme_arc/with_replies', price:500000000, desc:'Proof of Meme: every laugh leaves a verifiable trace on ARC.', perk:'🧠 Enemy bullets 10% slower' }
];

function renderMemeStorePage(){
  let cardsHtml = '';
  memeProducts.forEach(function(m){
    const owned = !!ownedMemes[m.id];
    cardsHtml += '<div class="shop-card">' +
      '<div class="shop-icon">' + (m.img ? '<img src="'+m.img+'" style="width:52px;height:52px;border-radius:50%;object-fit:cover;box-shadow:0 0 14px rgba(0,212,255,.4);">' : m.icon) + '</div>' +
      '<div class="shop-title">' + m.name + ' <a href="'+m.x+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11px;color:#64748b;text-decoration:none;">(𝕏)</a></div>' +
      '<div class="shop-desc">' + m.desc + '</div>' +
      '<div style="font-size:11px; color:#10b981; margin-bottom:8px; font-weight:600;">Perk: ' + m.perk + '</div>' +
      '<div class="shop-price">' + m.price.toLocaleString() + ' ARC</div>' +
      (owned ? '<button class="shop-buy-btn owned">✓ OWNED IN COLLECTION</button>' : '<button class="shop-buy-btn" onclick="buyMeme(\''+m.id+'\')">🛒 COLLECT NOW</button>') +
    '</div>';
  });
  return '<div style="padding:24px 16px; max-width:880px; margin:0 auto; font-family:\'Inter\',sans-serif;">' +
    '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; border-bottom:1px solid #3d3d4d; padding-bottom:12px;">' +
      '<div>' +
        '<h2 style="font-size:22px; font-weight:800; color:#fff; margin-bottom:4px;">🛍️ Piper.meme — Official Store</h2>' +
        '<div style="color:#94a3b8; font-size:12px;">Acquire authentic meme artifacts powered by the ARC Network</div>' +
      '</div>' +
      '<div class="swap-wallet">🪙 Balance: <span id="shopArcBal">' + userWallet.ARC.toLocaleString() + '</span> ARC</div>' +
    '</div>' +
    '<div class="shop-grid">' +
      cardsHtml +
    '</div>' +
  '</div>';
}

function buyMeme(id){
  const item = memeProducts.find(function(m){ return m.id === id; });
  if(!item) return;
  if(ownedMemes[id]){
    spawnToast('✅ You already own ' + item.name + '!');
    return;
  }
  if(userWallet.ARC < item.price){
    spawnToast('❌ You need ' + item.price.toLocaleString() + ' ARC! Win rounds in Ships.exe.');
    return;
  }
  userWallet.ARC -= item.price;
  ownedMemes[id] = true;
  updateGlobalArcDisplays();
  try { accessSfx(); } catch(e){}
  try { confettiBurst(innerWidth/2, innerHeight/2); } catch(e){}
  spawnToast('🎉 You acquired ' + item.name + '! Perk: ' + item.perk);
  const c = document.getElementById('browserContent');
  if(c) c.innerHTML = renderMemeStorePage();
}

function switchSpace(spaceId){
  document.querySelectorAll('.space-btn').forEach(function(b){ b.classList.remove('active'); });
  const btn = document.getElementById('sp-' + spaceId);
  if(btn) btn.classList.add('active');
  if(spaceId === 'core'){
    loadUrl('arc://newtab', true);
  } else if(spaceId === 'synth' || spaceId === 'dex'){
    loadUrl('arc://synth', true);
  } else if(spaceId === 'shop'){
    loadUrl('piper.meme', true);
  }
}

const fakePages = {
  'arc://threats': {
    title: 'ARC Threats — Threat Dashboard',
    content: '<div class="fake-page"><div class="hero-img" style="background:linear-gradient(135deg,#ff2d55,#ff9500);">☣️</div><h1>ARC Threat Dashboard</h1><p>Last 24 hours: <b style="color:#ff2d55;">666 threats</b> neutralized by the system.</p><p><b>Top threats:</b></p><ul style="margin-left:20px; color:#cbd5e1;"><li>🦠 arc_meme_stealer.exe — CRITICAL</li><li>🐴 groovy_trojan.dll — HIGH</li><li>🪱 worm_red_arc.sys — CRITICAL</li><li>🔒 ransomware_meme.bat — CRITICAL</li><li>⌨️ keylogger_arc.dll — HIGH</li><li>🎵 adware_reggaeton.exe — MEDIUM</li></ul><p style="margin-top:20px;">System status: <b style="color:#10b981;">PROTECTED</b></p></div>'
  },
  'arc://about': {
    title: 'About ARC Browser',
    content: '<div class="fake-page"><div class="hero-img" style="background:linear-gradient(135deg,#00d4ff,#a855f7);">🌐</div><h1>ARC Browser v3.0 Pro</h1><p>The official next-generation browser of the ARC Network. Designed to surf the Web3 meme deep web in style.</p><p><b>Features:</b></p><ul style="margin-left:20px; color:#cbd5e1;"><li>🪐 Spaces Navigation (Core, Synth Lab, Meme Store)</li><li>🎹 ARC Synth Lab (8-Bit Chiptune Synth + Oscilloscope)</li><li>🛍️ Interactive Meme Collection Store</li><li>⌘K Quick Command Palette</li><li>🔒 Encrypted Antivirus Sandboxing</li><li>📱 100% Touch Responsive</li></ul><p style="margin-top:20px;">Developed by ARC AI. All rights reserved.</p></div>'
  },
  'arc://leaderboard': {
    title: 'ARC Top Pilots — Leaderboard',
    content: '<!-- dynamic: leaderboard -->'
  },
  'arc://wallet': {
    title: 'ARC Wallet — My Portfolio',
    content: '<!-- dynamic: wallet -->'
  },
  'arc://network': {
    title: 'ARC Network Status',
    content: '<!-- dynamic: network -->'
  },
  'arc://news': {
    title: 'ARC News Feed',
    content: '<!-- dynamic: news -->'
  },
  'arc://games': {
    title: 'ARC Games Launcher',
    content: '<!-- dynamic: games -->'
  }
};

const searchResults = {
  'konami': [{title:'Konami Code Activated',url:'arc://easter-egg',desc:'↑↑↓↓←→←→BA — Rainbow mode activated for 5 seconds. Enjoy the show!'}],
  'arc': [{title:'Final Boss Coordinates',url:'arc://boss-coords',desc:'Phase 1: blade fans. Phase 2: spinning spiral. Phase 3 (ENRAGE): 8-way bullet-hell. Weakness: penetrating laser in phase 2.'}],
  'piper': [{title:'Piper.meme — Official Store',url:'piper.meme',desc:'The official meme store of the ARC Network. Collect Pingu, Pug Galaxys, Shitcoin Lovers, and Tick.'}],
  'synth': [{title:'ARC Synth Lab — Chiptune Synthesizer',url:'arc://synth',desc:'Play 8-bit retro audio, chiptunes, and oscilloscope waveforms live in ARC Browser.'}],
  'piano': [{title:'ARC Synth Lab — Piano & Audio Engine',url:'arc://synth',desc:'Play retro melodies using your keyboard or touch screen.'}],
  'music': [{title:'ARC Synth Lab — 8-Bit Beats',url:'arc://synth',desc:'Create cyber soundscapes with square, sawtooth, and triangle waves.'}],
  'virus': [{title:'VirusARC — Official Antivirus',url:'antivirusarc.meme',desc:'The most powerful meme antivirus on the net. 500 million tokens protected. Your system is under the ARC shield.'}],
  'meme': [{title:'ARC Network Memes',url:'piper.meme',desc:'Official collection: Pingu, Pug Galaxys, Shitcoin Lovers, and Tick.'}],
  'leaderboard': [{title:'ARC Top Pilots Leaderboard',url:'arc://leaderboard',desc:'See the all-time champion pilots and this week\'s top scorers.'}],
  'wallet': [{title:'My ARC Wallet',url:'arc://wallet',desc:'Check your ARC, USDC, and PIPER token balances.'}],
  'network': [{title:'ARC Network Status',url:'arc://network',desc:'Live network nodes, blocks, and latency stats.'}],
  'news': [{title:'ARC News Feed',url:'arc://news',desc:'Latest updates from the ARC Network and meme ecosystem.'}],
  'games': [{title:'ARC Games Launcher',url:'arc://games',desc:'Play Ships.exe, Minesweeper, Spider Solitaire, and Space Pinball.'}],
  'forum': [{title:'ARC Forum — Public Channel',url:'arc://forum',desc:'Talk with other pilots. Immutable records: written is written forever.'}]
};

function renderTabs(){
  const bar = document.getElementById('browserTabbar');
  if(!bar) return;
  bar.innerHTML = '';
  browserTabs.forEach(function(tab){
    const el = document.createElement('div');
    el.className = 'browser-tab' + (tab.id === activeTabId ? ' active' : '');
    el.innerHTML = '<span class="tab-fav">'+esc(tab.favicon)+'</span><span class="tab-title">'+esc(tab.title)+'</span><span class="tab-close" data-id="'+esc(tab.id)+'">✕</span>';
    el.addEventListener('click', function(e){
      if(e.target.classList.contains('tab-close')){
        e.stopPropagation();
        closeTab(tab.id);
      } else {
        switchTab(tab.id);
      }
    });
    bar.appendChild(el);
  });
  const newBtn = document.createElement('div');
  newBtn.className = 'browser-tab-new';
  newBtn.textContent = '+';
  newBtn.title = 'New Tab';
  newBtn.addEventListener('click', newTab);
  bar.appendChild(newBtn);
  
  const activeTab = browserTabs.find(function(t){ return t.id === activeTabId; });
  if(activeTab){
    const inp = document.getElementById('browserUrlInput');
    if(inp) inp.value = activeTab.url;
  }
}

function newTab(){
  tabCounter++;
  const newTabObj = {id:'tab'+tabCounter, title:'New Tab', url:'arc://newtab', favicon:'🏠', history:['arc://newtab'], historyIdx:0};
  browserTabs.push(newTabObj);
  activeTabId = newTabObj.id;
  renderTabs();
  renderHomePage();
  try { accessSfx(); } catch(e){}
}

function closeTab(id){
  if(browserTabs.length <= 1){
    // Closing the last tab closes the browser window, like a real browser
    closeWindow('win-browser');
    try { sfx(300,.12,'triangle',.1); } catch(e){}
    return;
  }
  const idx = browserTabs.findIndex(function(t){ return t.id === id; });
  browserTabs.splice(idx, 1);
  if(activeTabId === id){
    const newIdx = Math.min(idx, browserTabs.length - 1);
    activeTabId = browserTabs[newIdx].id;
  }
  renderTabs();
  const activeTab = browserTabs.find(function(t){ return t.id === activeTabId; });
  if(activeTab) loadUrl(activeTab.url, false);
}

function switchTab(id){
  activeTabId = id;
  renderTabs();
  const activeTab = browserTabs.find(function(t){ return t.id === id; });
  if(activeTab) loadUrl(activeTab.url, false);
}

/** Enrutador del ARC Browser: arc://* internos, dominios → tarjeta de apertura, texto → búsqueda simulada. */
function loadUrl(url, addToHistory){
  const tab = browserTabs.find(function(t){ return t.id === activeTabId; });
  if(!tab) return;

  if(addToHistory !== false){
    tab.history = tab.history.slice(0, tab.historyIdx + 1);
    tab.history.push(url);
    tab.historyIdx = tab.history.length - 1;
  }
  tab.url = url;

  const content = document.getElementById('browserContent');
  if(content){
    content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:14px;"><div class="loading-spinner"></div><div style="color:#64748b;font-size:13px;font-family:Inter,sans-serif;">Loading...</div></div>';
    // Inject loading bar
    let lb = document.getElementById('browserLoadingBar');
    if(!lb){
      lb = document.createElement('div');
      lb.id = 'browserLoadingBar';
      lb.className = 'browser-loading';
      content.parentNode.insertBefore(lb, content);
    }
    lb.style.display = 'block';
    setTimeout(function(){ if(lb) lb.style.display = 'none'; }, 800);
  }

  setTimeout(function(){
    document.querySelectorAll('.space-btn').forEach(function(b){ b.classList.remove('active'); });
    if(url === 'arc://synth' || url === 'arc://swap'){
      const sp = document.getElementById('sp-synth'); if(sp) sp.classList.add('active');
      tab.title = 'ARC Synth Lab';
      tab.favicon = '🎹';
      if(content) content.innerHTML = renderSwapPage();
    } else if(url === 'piper.meme'){
      const sp = document.getElementById('sp-shop'); if(sp) sp.classList.add('active');
      tab.title = 'Piper.meme — Official Store';
      tab.favicon = '🛍️';
      if(content) content.innerHTML = renderMemeStorePage();
    } else if(url === 'arc://leaderboard'){
      const sp = document.getElementById('sp-core'); if(sp) sp.classList.add('active');
      tab.title = 'ARC Top Pilots';
      tab.favicon = '🏆';
      if(content) content.innerHTML = renderLeaderboardPage();
    } else if(url === 'arc://wallet'){
      const sp = document.getElementById('sp-core'); if(sp) sp.classList.add('active');
      tab.title = 'ARC Wallet';
      tab.favicon = '💰';
      if(content) content.innerHTML = renderWalletPage();
    } else if(url === 'arc://network'){
      const sp = document.getElementById('sp-core'); if(sp) sp.classList.add('active');
      tab.title = 'ARC Network';
      tab.favicon = '🌐';
      if(content) content.innerHTML = renderNetworkPage();
    } else if(url === 'arc://news'){
      const sp = document.getElementById('sp-core'); if(sp) sp.classList.add('active');
      tab.title = 'ARC News';
      tab.favicon = '📰';
      if(content) content.innerHTML = renderNewsPage();
    } else if(url === 'arc://games'){
      const sp = document.getElementById('sp-core'); if(sp) sp.classList.add('active');
      tab.title = 'ARC Games';
      tab.favicon = '🎮';
      if(content) content.innerHTML = renderGamesPage();
    } else if(url === 'arc://forum'){
      const sp = document.getElementById('sp-core'); if(sp) sp.classList.add('active');
      tab.title = 'ARC Forum';
      tab.favicon = '💬';
      forumLoad();
    } else {
      const sp = document.getElementById('sp-core'); if(sp) sp.classList.add('active');
      if(url === 'arc://newtab'){
        tab.title = 'New Tab';
        tab.favicon = '🏠';
        renderHomePage();
      } else if(fakePages[url]){
        tab.title = fakePages[url].title;
        tab.favicon = '🌐';
        if(content) content.innerHTML = fakePages[url].content;
      } else {
        const trimmed = url.trim();
        // 1) Internal ARC keyword search takes priority
        const query = trimmed.toLowerCase();
        let results = [];
        for(const key in searchResults){
          if(query.includes(key)){ results = results.concat(searchResults[key]); }
        }
        const isDomainLike = !/\s/.test(trimmed) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(trimmed);
        if(results.length > 0 && !isDomainLike){
          tab.title = trimmed + ' — ARC Search';
          tab.favicon = '🔍';
          renderSearchResults(trimmed, results);
        } else if(isDomainLike){
          // Looks like a real address — external open card (many sites block iframes)
          const safe = trimmed.replace(/[^a-z0-9.\-]/gi, '');
          const full = 'https://' + safe;
          tab.title = safe;
          tab.favicon = '🌐';
          if(content){
            content.innerHTML =
              '<div class="fake-page" style="text-align:center;">'+
              '<div class="hero-img" style="background:linear-gradient(135deg,#00d4ff,#0066cc);margin:0 auto 18px;">🌐</div>'+
              '<h1>'+safe+'</h1>'+
              '<p style="color:#94a3b8;font-family:Inter,sans-serif;font-size:13px;max-width:420px;margin:0 auto 20px;">This is a real website outside the ARC Network. ARC Browser can\'t embed it safely, but you can open it in a new browser tab.</p>'+
              '<button onclick="window.open(\''+full+'\',\'_blank\')" style="background:linear-gradient(90deg,#00d4ff,#0066cc);border:none;color:#fff;padding:14px 34px;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;">🔓 OPEN '+safe.toUpperCase()+' ↗</button>'+
              '<p style="margin-top:18px;"><a href="#" onclick="loadUrl(\'arc://newtab\',true);return false;" style="color:#00d4ff;font-size:12px;">← back to ARC home</a></p>'+
              '</div>';
          }
        } else {
          // Everything else is a SEARCH → fully simulated ARC results (no external exits)
          tab.title = '🔍 ' + trimmed.slice(0,40) + ' — ARC Search';
          tab.favicon = '🔍';
          if(content){
            const tema = esc(trimmed.slice(0,80)); // escaped: user input
            const fakeHits = [
              { t:'Arcpedia — "'+tema+'"', d:'Artículo verificado por la ARC Network sobre '+tema+'. Contenido certificado por 666 nodos.', u:'arc://wiki/'+encodeURIComponent(trimmed) },
              { t:tema.toUpperCase()+' en piper.meme', d:'La comunidad está hablando de '+tema+' en los foros oficiales del ecosistema.', u:'piper.meme' },
              { t:'Sector 7G Archives: '+tema, d:'Documentos desclasificados relacionados con '+tema+'. Nivel de amenaza: mínimo.', u:'arc://news' },
              { t:'ARC Marketplace — compra "'+tema+'"', d:'Ofertas y tokens relacionados con '+tema+'. Acepta pago en ARC, USDC y PIPER.', u:'piper.meme' }
            ];
            let rh = '<div class="fake-page"><h1 style="margin-bottom:4px;">🔍 Resultados ARC para "'+tema+'"</h1>'+
              '<p style="color:#64748b;font-size:12px;font-family:Inter,sans-serif;margin-bottom:20px;">~666 resultados certificados por la ARC Network (0.0042s)</p>';
            fakeHits.forEach(function(h){
              rh += '<div style="background:#252535;border:1px solid #3d3d4d;border-radius:12px;padding:14px 16px;margin-bottom:10px;">'+
                '<div style="color:#00d4ff;font-size:17px;font-family:VT323,monospace;">'+h.t+'</div>'+
                '<div style="color:#7cbb00;font-size:11px;font-family:VT323,monospace;margin:2px 0 6px;">🔒 '+h.u+'</div>'+
                '<div style="color:#94a3b8;font-size:12px;font-family:Inter,sans-serif;line-height:1.5;">'+h.d+'</div>'+
                '</div>';
            });
            rh += '<div style="text-align:center;margin-top:16px;"><button class="nv-glass" style="cursor:pointer;" onclick="loadUrl(\'arc://newtab\',true)">← Volver al inicio</button></div></div>';
            content.innerHTML = rh;
          }
        }
      }
    }
    renderTabs();
  }, 350);
}

function renderHomePage(){
  const content = document.getElementById('browserContent');
  if(!content) return;

  // Live stats for home page
  const alltime = safeParse(localStorage.getItem('arc_alltime_records'), []);
  const weekly = safeParse(localStorage.getItem('arc_weekly_leaderboard'), []);
  const top3 = alltime.slice(0,3);
  const weeklyTop = weekly[0];
  const bestScore = alltime[0] ? alltime[0].score.toLocaleString() : '---';
  const weeklyLead = weeklyTop ? weeklyTop.name + ' (' + weeklyTop.score.toLocaleString() + ')' : 'No entries yet';

  const arcNews = [
    { ic:'🚀', txt:'Ships.exe v4.2 — New boss: THE INDUSTRIAL FACTORY', time:'2h ago' },
    { ic:'🎹', txt:'ARC Synth Lab: Play 8-bit chiptunes & cyber melodies', time:'3h ago' },
    { ic:'🏆', txt:'Weekly leaderboard resets every 7 days — fight for #1!', time:'12h ago' },
    { ic:'🦠', txt:'VirusARC neutralized 666 new threats this cycle', time:'1d ago' },
    { ic:'🛍️', txt:'New meme: TICK — Buy it and enter invincible mode', time:'2d ago' }
  ];

  const top3HTML = top3.length === 0
    ? '<div style="color:#64748b;font-size:12px;font-family:Inter,sans-serif;">No records yet — play Ships.exe!</div>'
    : top3.map(function(r,i){ return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #3d3d4d;">'+
        '<span style="font-size:14px;">'+(i===0?'🥇':i===1?'🥈':'🥉')+'</span>'+
        '<span style="color:#e2e8f0;font-family:Inter,sans-serif;font-size:12px;font-weight:600;">'+r.name+'</span>'+
        '<span style="margin-left:auto;color:#fbbf24;font-family:VT323,monospace;font-size:16px;">'+r.score.toLocaleString()+'</span>'+
        '</div>'; }).join('');

  const newsHTML = arcNews.map(function(n){
    return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #2d2d3d;align-items:flex-start;">'+
      '<span style="font-size:18px;flex-shrink:0;">'+n.ic+'</span>'+
      '<div><div style="font-size:12px;color:#e2e8f0;font-family:Inter,sans-serif;line-height:1.4;">'+n.txt+'</div>'+
      '<div style="font-size:10px;color:#64748b;margin-top:2px;">'+n.time+'</div></div></div>';
  }).join('');

  const pilotNameHome = (localStorage.getItem('arc_last_pilot')||'ROOKIE');
  const pilotRec = alltime.find(function(r){ return r.name === pilotNameHome; });
  const pilotStrip =
    '<div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:12px 0 4px;">'+
      '<span style="font-family:VT323,monospace;font-size:16px;color:#9fd4ff;background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.3);border-radius:999px;padding:4px 16px;">👨‍🚀 '+pilotNameHome+'</span>'+
      '<span style="font-family:VT323,monospace;font-size:16px;color:#fbbf24;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.35);border-radius:999px;padding:4px 16px;">🏅 '+(pilotRec ? pilotRec.score.toLocaleString() : 'NO RECORD YET')+'</span>'+
      '<span style="font-family:VT323,monospace;font-size:16px;color:#7cbb00;background:rgba(124,187,0,.08);border:1px solid rgba(124,187,0,.35);border-radius:999px;padding:4px 16px;">🪙 '+userWallet.ARC.toLocaleString()+' ARC</span>'+
    '</div>';

  content.innerHTML =
    '<div class="home-page">' +
    '<div class="home-logo"><span>A</span><span>R</span><span>C</span></div>' +
    pilotStrip +
    '<div class="home-search"><span class="search-icon">🔍</span><input type="text" id="homeSearchInput" placeholder="Search the ARC Network or enter an arc:// URL" spellcheck="false"><span class="mic-icon" title="ARC Search">🌐</span></div>' +
    '<div class="home-tiles">' +
      '<div class="home-tile" data-url="arc://synth"><div class="tile-icon">🎹</div><div class="tile-name">ARC Synth Lab</div></div>' +
      '<div class="home-tile" data-url="piper.meme"><div class="tile-icon">🛍️</div><div class="tile-name">Meme Store</div></div>' +
      '<div class="home-tile" data-url="arc://leaderboard"><div class="tile-icon">🏆</div><div class="tile-name">Leaderboard</div></div>' +
      '<div class="home-tile" data-url="arc://wallet"><div class="tile-icon">💰</div><div class="tile-name">My Wallet</div></div>' +
      '<div class="home-tile" data-url="arc://games"><div class="tile-icon">🎮</div><div class="tile-name">Games</div></div>' +
      '<div class="home-tile" data-url="arc://network"><div class="tile-icon">🌐</div><div class="tile-name">Network</div></div>' +
      '<div class="home-tile" data-url="arc://news"><div class="tile-icon">📰</div><div class="tile-name">ARC News</div></div>' +
      '<div class="home-tile" data-url="arc://forum"><div class="tile-icon">💬</div><div class="tile-name">ARC Forum</div></div>' +
      '<div class="home-tile" data-url="arc://threats"><div class="tile-icon">☣️</div><div class="tile-name">Threats</div></div>' +
    '</div>' +
    '<div class="arc-news-block" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:580px;width:100%;margin-top:20px;">'+
    '<div style="background:#252535;border:1px solid #3d3d4d;border-radius:14px;padding:14px;">'+
    '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;font-family:Inter,sans-serif;">🏆 Top Pilots</div>'+
    top3HTML+
    '<div style="margin-top:8px;"><span class="home-tile" data-url="arc://leaderboard" style="display:inline-block;padding:4px 10px;border-radius:8px;font-size:11px;color:#00d4ff;border:1px solid #00d4ff;cursor:pointer;">View Full Board</span></div>'+
    '</div>'+
    '<div style="background:#252535;border:1px solid #3d3d4d;border-radius:14px;padding:14px;overflow:hidden;">'+
    '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-family:Inter,sans-serif;">📰 ARC News</div>'+
    newsHTML+
    '</div>'+
    '</div>'+
    '</div>';

  const searchInput = document.getElementById('homeSearchInput');
  if(searchInput){
    searchInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter' && this.value.trim()){
        loadUrl(this.value.trim(), true);
      }
    });
  }

  content.querySelectorAll('[data-url]').forEach(function(tile){
    tile.addEventListener('click', function(){
      const u = this.dataset.url;
      if(u) loadUrl(u, true);
    });
  });
}

function renderSearchResults(query, results){
  const content = document.getElementById('browserContent');
  if(!content) return;
  // Seguridad: `query` viene del input del usuario (barra de direcciones / palette).
  // Sin escapar, un texto como <img src=x onerror=...> se ejecutaría en la página.
  const q = esc(query);
  let html = '<div class="results-page"><div class="results-header">Results for "'+q+'" — '+results.length+' found</div>';
  results.forEach(function(r){
    html += '<div class="result-item"><div class="result-url">'+esc(r.url)+'</div><div class="result-title" data-url="'+esc(r.url)+'">'+esc(r.title)+'</div><div class="result-desc">'+esc(r.desc)+'</div></div>';
  });
  html += '<div class="result-item" style="margin-top:14px;background:rgba(0,212,255,0.05);border:1px solid #3d3d4d;border-radius:8px;padding:10px;"><div class="result-url">arc://network</div><div class="result-title" data-url="arc://network">🌐 More about &quot;'+q+'&quot; on the ARC Network</div><div class="result-desc">ARC Browser keeps everything inside the simulated ARC Network.</div></div>';
  html += '</div>';
  content.innerHTML = html;
  content.querySelectorAll('.result-title').forEach(function(el){
    el.addEventListener('click', function(){
      const url = this.dataset.url;
      const ext = this.dataset.ext;
      if(ext){
        loadUrl(decodeURIComponent(ext), true);
      } else if(url){
        loadUrl(url, true);
      }
    });
  });
}

/* ---------- ARC PAGE RENDERERS ---------- */
function renderLeaderboardPage(){
  const alltime = safeParse(localStorage.getItem('arc_alltime_records'), []);
  const weekly = safeParse(localStorage.getItem('arc_weekly_leaderboard'), []);
  let html = '<div class="fake-page"><div class="hero-img" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);">🏆</div>';
  html += '<h1>ARC Top Pilots</h1>';
  html += '<p style="color:#94a3b8;font-family:Inter,sans-serif;font-size:13px;margin-bottom:18px;">Permanent Hall of Fame records. Each pilot occupies at most one spot.</p>';
  html += '<h2 style="color:#fbbf24;font-size:18px;font-family:VT323,monospace;letter-spacing:2px;margin-bottom:8px;">🏅 ALL-TIME RECORDS</h2>';
  if(alltime.length === 0){
    html += '<p style="color:#64748b;">No records yet. Play Ships.exe and make history!</p>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-family:VT323,monospace;font-size:17px;">';
    html += '<tr><th style="color:#00d4ff;text-align:left;padding:6px 8px;border-bottom:2px solid #00d4ff;">#</th><th style="color:#00d4ff;text-align:left;padding:6px 8px;border-bottom:2px solid #00d4ff;">Pilot</th><th style="color:#00d4ff;text-align:left;padding:6px 8px;border-bottom:2px solid #00d4ff;">Wallet</th><th style="color:#00d4ff;text-align:right;padding:6px 8px;border-bottom:2px solid #00d4ff;">Score</th><th style="color:#00d4ff;text-align:center;padding:6px 8px;border-bottom:2px solid #00d4ff;">Sector</th></tr>';
    alltime.forEach(function(r, i){
      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';  
      html += '<tr style="border-bottom:1px solid rgba(0,212,255,0.12);"><td style="padding:5px 8px;color:#fbbf24;">'+(i+1)+medal+'</td><td style="padding:5px 8px;color:#e2e8f0;">'+esc(r.name)+'</td><td style="padding:5px 8px;color:#9fd4ff;font-size:14px;" title="'+esc(r.wallet||'')+'">'+esc(shortWallet(r.wallet))+'</td><td style="padding:5px 8px;text-align:right;color:#7cbb00;">'+r.score.toLocaleString()+'</td><td style="padding:5px 8px;text-align:center;color:#9fd4ff;">'+(r.round||'-')+'</td></tr>';
    });
    html += '</table>';
  }
  html += '<h2 style="color:#fbbf24;font-size:18px;font-family:VT323,monospace;letter-spacing:2px;margin:22px 0 8px;">📅 WEEKLY RECORDS</h2>';
  if(weekly.length === 0){
    html += '<p style="color:#64748b;">No weekly records yet.</p>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-family:VT323,monospace;font-size:17px;">';
    html += '<tr><th style="color:#00d4ff;text-align:left;padding:6px 8px;border-bottom:2px solid #00d4ff;">#</th><th style="color:#00d4ff;text-align:left;padding:6px 8px;border-bottom:2px solid #00d4ff;">Pilot</th><th style="color:#00d4ff;text-align:left;padding:6px 8px;border-bottom:2px solid #00d4ff;">Wallet</th><th style="color:#00d4ff;text-align:right;padding:6px 8px;border-bottom:2px solid #00d4ff;">Score</th></tr>';
    weekly.forEach(function(r, i){
      html += '<tr style="border-bottom:1px solid rgba(0,212,255,0.12);"><td style="padding:5px 8px;color:#fbbf24;">'+(i+1)+'</td><td style="padding:5px 8px;color:#e2e8f0;">'+esc(r.name)+'</td><td style="padding:5px 8px;color:#9fd4ff;font-size:14px;" title="'+esc(r.wallet||'')+'">'+esc(shortWallet(r.wallet))+'</td><td style="padding:5px 8px;text-align:right;color:#7cbb00;">'+r.score.toLocaleString()+'</td></tr>';
    });
    html += '</table>';
  }
  html += '</div>';
  return html;
}

function renderWalletPage(){
  const w = userWallet;
  const html = '<div class="fake-page">' +
    '<div class="hero-img" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);">💰</div>' +
    '<h1>ARC Wallet</h1>' +
    '<p style="color:#94a3b8;font-family:Inter,sans-serif;font-size:13px;">Your personal token holdings on the ARC Network.</p>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-top:20px;">' +
    '<div style="background:#252535;border:1px solid #fbbf24;border-radius:16px;padding:18px;text-align:center;">' +
    '<div style="font-size:32px;margin-bottom:6px;">🔵</div>' +
    '<div style="font-family:Inter,sans-serif;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">ARC</div>' +
    '<div style="font-family:VT323,monospace;font-size:28px;color:#fbbf24;margin-top:4px;">'+w.ARC.toLocaleString()+'</div>' +
    '</div>' +
    '<div style="background:#252535;border:1px solid #2775ca;border-radius:16px;padding:18px;text-align:center;">' +
    '<div style="font-size:32px;margin-bottom:6px;">💵</div>' +
    '<div style="font-family:Inter,sans-serif;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">USDC</div>' +
    '<div style="font-family:VT323,monospace;font-size:28px;color:#2775ca;margin-top:4px;">'+w.USDC.toLocaleString()+'</div>' +
    '</div>' +
    '<div style="background:#252535;border:1px solid #a855f7;border-radius:16px;padding:18px;text-align:center;">' +
    '<div style="font-size:32px;margin-bottom:6px;">🎵</div>' +
    '<div style="font-family:Inter,sans-serif;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">PIPER</div>' +
    '<div style="font-family:VT323,monospace;font-size:28px;color:#a855f7;margin-top:4px;">'+w.PIPER.toLocaleString()+'</div>' +
    '</div>' +
    '</div>' +
    '<div style="margin-top:20px;background:#252535;border:1px solid #3d3d4d;border-radius:14px;padding:14px;">' +
    '<div style="font-family:Inter,sans-serif;font-size:12px;color:#94a3b8;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;">⚡ Quick Actions</div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
    '<button onclick="loadUrl(\'arc://synth\',true)" style="background:linear-gradient(90deg,#00d4ff,#a855f7);border:none;color:#fff;padding:8px 16px;border-radius:10px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;font-size:12px;">🎹 ARC Synth Lab</button>' +
    '<button onclick="loadUrl(\'piper.meme\',true)" style="background:linear-gradient(90deg,#10b981,#059669);border:none;color:#fff;padding:8px 16px;border-radius:10px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;font-size:12px;">🛍️ Meme Store</button>' +
    '</div></div></div>';
  return html;
}

function renderNetworkPage(){
  const nodes = ['Node A — NYC', 'Node B — São Paulo', 'Node C — Tokyo', 'Node D — Berlin', 'Node E — Singapore'];
  const latencies = nodes.map(function(){ return (Math.round(Math.random()*80+12)); });
  const nodesHTML = nodes.map(function(n,i){
    const lat = latencies[i];
    const col = lat < 40 ? '#10b981' : lat < 70 ? '#fbbf24' : '#ef4444';
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #3d3d4d;">'+
      '<span style="width:10px;height:10px;border-radius:50%;background:'+col+';display:inline-block;box-shadow:0 0 6px '+col+';flex-shrink:0;"></span>'+
      '<span style="font-family:VT323,monospace;font-size:17px;color:#e2e8f0;flex:1;">'+n+'</span>'+
      '<span style="font-family:VT323,monospace;font-size:17px;color:'+col+';">'+lat+'ms</span>'+
      '</div>';
  }).join('');
  return '<div class="fake-page">'+
    '<div class="hero-img" style="background:linear-gradient(135deg,#00d4ff,#0066cc);">🌐</div>'+
    '<h1>ARC Network Status</h1>'+
    '<p style="color:#94a3b8;font-family:Inter,sans-serif;font-size:13px;margin-bottom:16px;">Live network nodes — real-time latency monitoring.</p>'+
    '<div style="background:#252535;border:1px solid #3d3d4d;border-radius:14px;padding:16px;margin-bottom:16px;">'+
    '<div style="font-family:Inter,sans-serif;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">🔴 Live Nodes</div>'+
    nodesHTML+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">'+
    '<div style="background:#252535;border:1px solid #3d3d4d;border-radius:12px;padding:12px;text-align:center;"><div style="font-family:VT323,monospace;font-size:26px;color:#10b981;">5</div><div style="font-family:Inter,sans-serif;font-size:10px;color:#94a3b8;margin-top:4px;">Active Nodes</div></div>'+
    '<div style="background:#252535;border:1px solid #3d3d4d;border-radius:12px;padding:12px;text-align:center;"><div style="font-family:VT323,monospace;font-size:26px;color:#fbbf24;">'+Math.floor(Math.random()*9000+1000)+'</div><div style="font-family:Inter,sans-serif;font-size:10px;color:#94a3b8;margin-top:4px;">Blocks</div></div>'+
    '<div style="background:#252535;border:1px solid #3d3d4d;border-radius:12px;padding:12px;text-align:center;"><div style="font-family:VT323,monospace;font-size:26px;color:#00d4ff;">99.9%</div><div style="font-family:Inter,sans-serif;font-size:10px;color:#94a3b8;margin-top:4px;">Uptime</div></div>'+
    '</div></div>';
}

/* ============ ARC FORUM (immutable, server-backed via api/forum.php) ============ */
const FORUM_API = 'api/forum.php';
function forumToken(){ return localStorage.getItem('arc_forum_token') || ''; }
function forumUser(){ return localStorage.getItem('arc_forum_user') || ''; }

function renderForumPage(posts){
  const content = document.getElementById('browserContent');
  if(!content) return;
  const logged = !!forumToken() && !!forumUser();
  const esc = function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

  let html = '<div class="fake-page" style="max-width:680px;margin:0 auto;">' +
    '<div class="hero-img" style="background:linear-gradient(135deg,#00d4ff,#7c3aed);margin-bottom:14px;">💬</div>' +
    '<h1 style="margin-bottom:2px;">ARC FORUM</h1>' +
    '<p style="color:#94a3b8;font-family:Inter,sans-serif;font-size:12px;margin-bottom:16px;">Public channel of the ARC Network — <b style="color:#fbbf24;">🔒 written is written forever</b> (immutable records, no edits, no deletes).</p>';

  if(!logged){
    html += '<div style="background:#252535;border:1px solid #3d3d4d;border-radius:14px;padding:16px;margin-bottom:16px;">' +
      '<div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:10px;font-family:Inter,sans-serif;">🔐 Identify yourself, pilot</div>' +
      '<input id="forumUser" placeholder="USERNAME (A-Z 0-9 _-)" maxlength="12" style="width:100%;box-sizing:border-box;background:#14141f;border:1px solid #3d3d4d;color:#00d4ff;border-radius:8px;padding:10px;font-family:VT323,monospace;font-size:18px;margin-bottom:8px;text-transform:uppercase;">' +
      '<input id="forumPass" type="password" placeholder="PASSWORD" style="width:100%;box-sizing:border-box;background:#14141f;border:1px solid #3d3d4d;color:#00d4ff;border-radius:8px;padding:10px;font-family:VT323,monospace;font-size:18px;margin-bottom:10px;">' +
      '<div style="display:flex;gap:10px;">' +
      '<button class="nv-glass" style="flex:1;cursor:pointer;" onclick="forumAuth(\'login\')">🚀 LOGIN</button>' +
      '<button class="nv-glass" style="flex:1;border-color:rgba(124,187,0,.5);color:#7cbb00;cursor:pointer;" onclick="forumAuth(\'register\')">📝 REGISTER</button>' +
      '</div>' +
      '<div id="forumMsg" style="margin-top:10px;font-size:12px;color:#f87171;font-family:Inter,sans-serif;"></div>' +
      '</div>';
  } else {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
      '<span style="font-family:VT323,monospace;font-size:18px;color:#00ff41;">👤 '+esc(forumUser())+'</span>' +
      '<button class="nv-glass" style="margin-left:auto;padding:6px 14px;font-size:14px;cursor:pointer;" onclick="forumLogout()">⏻ LOGOUT</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
      '<input id="forumText" maxlength="400" placeholder="Transmit a message to the whole network..." style="flex:1;background:#14141f;border:1px solid #3d3d4d;color:#e2e8f0;border-radius:10px;padding:10px;font-family:Inter,sans-serif;font-size:13px;" onkeydown="if(event.key===\'Enter\')forumPost()">' +
      '<button class="nv-primary" style="width:auto;padding:10px 18px;font-size:18px;cursor:pointer;" onclick="forumPost()">📡 SEND</button>' +
      '</div>' +
      '<div id="forumMsg" style="font-size:12px;color:#f87171;font-family:Inter,sans-serif;margin-bottom:8px;"></div>';
  }

  html += '<div id="forumPosts">';
  if(Array.isArray(posts)){
    if(posts.length === 0){
      html += '<div style="color:#64748b;font-size:13px;font-family:Inter,sans-serif;">The channel is silent... be the first pilot to transmit. 📡</div>';
    }
    posts.forEach(function(p){
      const d = new Date((p.ts||0)*1000);
      const when = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      html += '<div style="background:#1c1c2a;border-left:3px solid #00d4ff;border-radius:0 10px 10px 0;padding:10px 14px;margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
        '<span style="font-family:VT323,monospace;font-size:17px;color:#00d4ff;">'+esc(p.user)+'</span>' +
        '<span style="font-size:10px;color:#64748b;font-family:Inter,sans-serif;">'+when+'</span></div>' +
        '<div style="color:#cbd5e1;font-size:13px;font-family:Inter,sans-serif;line-height:1.5;word-break:break-word;">'+esc(p.text)+'</div>' +
        '</div>';
    });
  }
  html += '</div></div>';
  content.innerHTML = html;
}

function forumApi(body){
  return fetch(FORUM_API, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
    .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, data:j }; }); });
}
function forumMsg(t, ok){ const el=document.getElementById('forumMsg'); if(el){ el.textContent=t||''; el.style.color = ok ? '#7cbb00' : '#f87171'; } }

function forumAuth(action){
  const user = (document.getElementById('forumUser')||{}).value || '';
  const pass = (document.getElementById('forumPass')||{}).value || '';
  forumMsg('...');
  forumApi({ action:action, user:user, pass:pass }).then(function(r){
    if(!r.ok){ forumMsg(r.data && r.data.error ? r.data.error : 'Error'); return; }
    if(action === 'register'){
      forumMsg('Account created! Logging in...', true);
      forumApi({ action:'login', user:user, pass:pass }).then(function(r2){
        if(r2.ok && r2.data.token){
          localStorage.setItem('arc_forum_token', r2.data.token);
          localStorage.setItem('arc_forum_user', r2.data.user);
          forumLoad();
        } else { forumMsg('Registered — now log in.'); }
      });
    } else {
      localStorage.setItem('arc_forum_token', r.data.token);
      localStorage.setItem('arc_forum_user', r.data.user);
      sfx(880,.15,'square',.1);
      forumLoad();
    }
  }).catch(function(){ forumMsg('Forum server offline (needs PHP host with api/forum.php)'); });
}

function forumLogout(){
  localStorage.removeItem('arc_forum_token');
  localStorage.removeItem('arc_forum_user');
  renderForumPage([]);
}

function forumLoad(){
  fetch(FORUM_API + '?action=posts').then(function(r){ return r.json(); })
    .then(function(d){ renderForumPage(d.posts || []); })
    .catch(function(){ renderForumPage(null); });
}

function forumPost(){
  const inp = document.getElementById('forumText');
  const text = inp ? inp.value.trim() : '';
  if(!text) return;
  forumMsg('Transmitting...');
  forumApi({ action:'post', token:forumToken(), text:text }).then(function(r){
    if(!r.ok){ forumMsg(r.data && r.data.error ? r.data.error : 'Error'); return; }
    renderForumPage(r.data.posts || []);
    sfx(1200,.08,'square',.08);
  }).catch(function(){ forumMsg('Forum server offline (needs PHP host)'); });
}

function renderNewsPage(){
  const news = [
    { ic:'🚀', title:'Ships.exe v4.2 Update — New Boss Added', body:'THE INDUSTRIAL FACTORY is now live in Sector 10+. This dual-belt boss launches drone swarms and homing missiles. Good luck, pilot.', time:'2h ago' },
    { ic:'🎹', title:'ARC Synth Lab v2.0 Released in Browser', body:'Experience a real-time WebAudio chiptune synthesizer and oscilloscope right inside ARC Browser. Play keys with your keyboard or touch screen!', time:'3h ago' },
    { ic:'🏆', title:'Weekly Leaderboard: New #1 Pilot Crowned', body:'A new champion has claimed the #1 weekly spot. Will you beat them? Each week resets — your chance to shine starts now.', time:'12h ago' },
    { ic:'🛍️', title:'Meme Store: TICK Token Unlocks Invincibility', body:'TICK holders now get a free shield on game start. Stock up before supplies run out — 300M ARC per unit.', time:'1d ago' },
    { ic:'🦠', title:'VirusARC Shields 500M Tokens from Meme Exploits', body:'Over 666 new threat signatures were detected and neutralized this cycle. VirusARC v3 scan engine is running at full capacity.', time:'2d ago' }
  ];
  let html = '<div class="fake-page"><div class="hero-img" style="background:linear-gradient(135deg,#475569,#1e293b);">📰</div><h1>ARC News</h1>';
  news.forEach(function(n){
    html += '<div style="background:#252535;border:1px solid #3d3d4d;border-radius:12px;padding:16px;margin-bottom:12px;">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'+
      '<span style="font-size:20px;">'+n.ic+'</span>'+
      '<span style="font-family:Inter,sans-serif;font-size:14px;font-weight:700;color:#e2e8f0;">'+n.title+'</span>'+
      '<span style="margin-left:auto;font-size:11px;color:#64748b;white-space:nowrap;">'+n.time+'</span>'+
      '</div>'+
      '<p style="font-family:Inter,sans-serif;font-size:12px;color:#94a3b8;line-height:1.6;">'+n.body+'</p>'+
      '</div>';
  });
  html += '</div>';
  return html;
}

function renderGamesPage(){
  const games = [
    { ic:'🚀', name:'Ships.exe', desc:'Space shooter with infinite sectors, bosses, and crypto power-ups.', action:'openNaves()' },
    { ic:'💣', name:'Minesweeper', desc:'Classic 9x9 Minesweeper. Sweep the field before the mines blow.', action:'openWindow(\'win-mines\'); msNew();' },
    { ic:'🕷️', name:'Spider Solitaire', desc:'Classic card stacking game. Build suits from K to A.', action:'openWindow(\'win-spider\'); spiderNew();' },
    { ic:'🚀', name:'Space Pinball', desc:'High-score space pinball with ARC-themed obstacles.', action:'openWindow(\'win-pinball\');' }
  ];
  let html = '<div class="fake-page"><div class="hero-img" style="background:linear-gradient(135deg,#7c3aed,#4c1d95);">🎮</div><h1>ARC Games</h1>'+
    '<p style="color:#94a3b8;font-family:Inter,sans-serif;font-size:13px;margin-bottom:18px;">All games from the ARC Network desktop — launch directly from here.</p>'+
    '<div class="shop-grid">';
  games.forEach(function(g){
    html += '<div class="shop-card">'+
      '<div class="shop-icon">'+g.ic+'</div>'+
      '<div class="shop-title">'+g.name+'</div>'+
      '<div class="shop-desc">'+g.desc+'</div>'+
      '<button class="shop-buy-btn" onclick="'+g.action+'">▶ Launch</button>'+
      '</div>';
  });
  html += '</div></div>';
  return html;
}

function browserBack(){
  const tab = browserTabs.find(function(t){ return t.id === activeTabId; });
  if(!tab || tab.historyIdx <= 0) return;
  tab.historyIdx--;
  const url = tab.history[tab.historyIdx];
  tab.url = url;
  loadUrl(url, false);
}

function browserForward(){
  const tab = browserTabs.find(function(t){ return t.id === activeTabId; });
  if(!tab || tab.historyIdx >= tab.history.length - 1) return;
  tab.historyIdx++;
  const url = tab.history[tab.historyIdx];
  tab.url = url;
  loadUrl(url, false);
}

function browserReload(){
  const tab = browserTabs.find(function(t){ return t.id === activeTabId; });
  if(tab) loadUrl(tab.url, false);
}

function browserHome(){
  loadUrl('arc://newtab', true);
}

function toggleSidebar(){
  const sidebar = document.getElementById('browserSidebar');
  const toggle = document.getElementById('sidebarToggle');
  if(!sidebar || !toggle) return;
  sidebar.classList.toggle('collapsed');
  toggle.classList.toggle('collapsed');
  toggle.textContent = sidebar.classList.contains('collapsed') ? '▶' : '';
}

// ARC COMMAND PALETTE
const arcCommands = [
  { id:'naves', title:'Launch Ships.exe', ic:'🚀', cat:'App', run: function(){ openNaves(); } },
  { id:'synth', title:'ARC Synth Lab (Chiptune Synth)', ic:'🎹', cat:'Browser', run: function(){ openWindow('win-browser'); switchSpace('synth'); } },
  { id:'shop', title:'Piper.meme Official Store', ic:'🛍️', cat:'Browser', run: function(){ openWindow('win-browser'); switchSpace('shop'); } },
  { id:'scan', title:'VirusARC Quick Scan', ic:'🛡️', cat:'Antivirus', run: function(){ openWindow('win-main'); startScan(); } },
  { id:'config', title:'Customize Desktop & Wallpaper', ic:'🎛️', cat:'Settings', run: function(){ openWindow('win-config'); } },
  { id:'memes', title:'Open Memes Collection', ic:'📁', cat:'Explorer', run: function(){ openWindow('win-memes'); } },
  { id:'pinball', title:'Play Space Pinball', ic:'🚀', cat:'Arcade', run: function(){ openWindow('win-pinball'); } },
  { id:'mines', title:'Play Minesweeper', ic:'💣', cat:'Arcade', run: function(){ openWindow('win-mines'); msNew(); } },
  { id:'spider', title:'Play Spider Solitaire', ic:'🕷️', cat:'Arcade', run: function(){ openWindow('win-spider'); spiderNew(); } },
  { id:'sound', title:'Toggle Audio / Sound', ic:'🔊', cat:'System', run: function(){ toggleSound(); } },
  { id:'readme', title:'Open README.txt', ic:'📄', cat:'Notepad', run: function(){ openWindow('win-note'); } },
  { id:'confetti', title:'Trigger ARC Confetti', ic:'🎉', cat:'Fun', run: function(){ confettiBurst(innerWidth/2, innerHeight/2); spawnToast('🎉 ARC Confetti!'); } }
];

function toggleArcCmd(force){
  const modal = document.getElementById('arcCmdModal');
  if(!modal) return;
  const isShow = typeof force === 'boolean' ? force : !modal.classList.contains('show');
  if(isShow){
    modal.classList.add('show');
    const inp = document.getElementById('arcCmdInput');
    if(inp){ inp.value = ''; inp.focus(); }
    filterArcCmd('');
  } else {
    modal.classList.remove('show');
  }
}

function filterArcCmd(q){
  const query = (q||'').toLowerCase().trim();
  const list = document.getElementById('arcCmdList');
  if(!list) return;
  const matches = arcCommands.filter(function(c){
    return !query || c.title.toLowerCase().includes(query) || c.cat.toLowerCase().includes(query);
  });
  list.innerHTML = '';
  if(matches.length === 0){
    list.innerHTML = '<div style="padding:16px;text-align:center;color:#64748b;font-size:13px;">No commands matching "'+esc(q)+'"</div>';
    return;
  }
  matches.forEach(function(cmd, idx){
    const item = document.createElement('div');
    item.className = 'arc-cmd-item' + (idx === 0 ? ' sel' : '');
    item.innerHTML = '<span class="cmd-ic">'+cmd.ic+'</span><span style="font-weight:600;">'+cmd.title+'</span><span class="cmd-badge">'+cmd.cat+'</span>';
    item.addEventListener('click', function(){
      toggleArcCmd(false);
      cmd.run();
    });
    list.appendChild(item);
  });
}

/* ============ TAP TÁCTIL → CLICK (sintetizador global, 2 vías) ============
   Problema de fondo: en móvil el navegador NO siempre emite el 'click' después
   de un tap. Lo descarta cuando el gesto es ambiguo (scroll, doble-tap zoom,
   gesto capturado por un padre). Toda la interfaz está cableada con
   onclick/ondblclick (105 en el HTML + 27 generados), así que en el celular
   fallaban los botones de las ventanas, el menú inicio y los del juego
   (START MISSION, RANKINGS, BRIEFING, EXIT…).

   VÍA 1 — síntesis: se lanza un click real desde el tap, para que funcionen
   TODOS los manejadores (incluidos los addEventListener registrados).

   VÍA 2 — respaldo: si tras sintetizar el click NADIE lo ha gestionado (el
   navegador no lo entregó, o el texto del atributo no compiló como handler),
   se ejecuta directamente el código del propio atributo onclick/ondblclick. Es
   la garantía dura: no depende de que el navegador procese un evento sintético.

   Reglas:
   - Solo actúa en interfaz táctil/estrecha; en escritorio no interviene.
   - Si el dedo se desplaza > 10 px, era scroll: se ignora.
   - Si el navegador canceló el gesto (está haciendo scroll), se ignora.
   - Si otro manejador hizo preventDefault (joystick y habilidades del juego),
     su click ya está gestionado: no se duplica.
   - Anti-duplicado por gesto y en el tiempo, para no abrir dos veces.
   - No seactúa sobre campos de texto: un click sintético les quitaría el foco
     y cerraría el teclado del móvil. */
function initGlobalTapToClick(){
  const MAX_DRIFT = 10;          // px de movimiento tolerados para considerarlo tap
  const DEDUPE_MS = 350;         // ventana anti-repetición (gestos distintos)
  let lastTapHandled = 0;
  let syntheticInFlight = false; // evita que mi propio click bloquee la síntesis
  let clickSeenAt = 0;           // cuándo se vio un click nativo por última vez
  let startX = 0, startY = 0, tracking = false;
  let suppressUntil = 0;         // lo pone un manejador que ya hizo preventDefault

  function isTouchUI(){
    return isTouch || ('ontouchstart' in window) || window.innerWidth <= 768
        || (navigator.maxTouchPoints > 0);
  }
  function isTappable(el){
    if(!el || !el.closest) return false;
    if(el.closest('input, textarea, select, [contenteditable="true"]')) return false;
    return !!el.closest('button, a, .dicon, .ctx-item, .nv-btn, .nv-glass, .nv-primary, ' +
      '.meme-tile, .home-tile, .bm-btn, .space-btn, .lb-tab, .tb-win, .tbtn, .start-btn, ' +
      '.sm-item, .arc-cmd-item, .synth-key-white, .synth-key-black, .sidebar-toggle, ' +
      '[onclick], [ondblclick], [data-url]');
  }

  /** Dispara un click sintético sobre el elemento (y sobre sus ancestros
   *  pulsables, por si el manejador está en el contenedor). */
  function fireSynthetic(el, x, y){
    syntheticInFlight = true;
    try {
      try {
        el.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true, composed: true,
          clientX: x, clientY: y, button: 0, buttons: 0, view: window
        }));
      } catch(err){
        const ev = document.createEvent('MouseEvents');
        ev.initMouseEvent('click', true, true, window, 0, x, y, x, y, false, false, false, false, 0, null);
        el.dispatchEvent(ev);
      }
    } finally {
      syntheticInFlight = false;
    }
  }

  /** VÍA 2: último recurso. Ejecuta el handler del propio botón si nadie lo hizo. */
  function runAttrFallback(el){
    const node = el.closest('[onclick], [ondblclick], [data-url]');
    if(!node) return false;
    // 1) Handlers asignados por propiedad (los crea JS: `btn.onclick = fn`).
    //    Si el diseño de la página los bloqueó, el atributo de texto no existirá
    //    y esta es la única forma de recuperarlos.
    const direct = node.onclick || node.ondblclick;
    if(typeof direct === 'function'){
      try { direct.call(node, { target: node, type: 'click' }); return true; } catch(err){}
    }
    // 2) Handlers de atributo en texto (los inline del HTML).
    const attr = node.getAttribute('ondblclick') || node.getAttribute('onclick');
    if(attr){
      try { new Function('event', attr).call(node, { target: node, type: 'click' }); return true; }
      catch(err){ /* atributo no compilable: se ignora */ }
    }
    // 3) Elementos que navegan mediante data-url (fichas del ARC Browser).
    const url = node.getAttribute('data-url');
    if(url){
      try { loadUrl(url, true); return true; } catch(err){}
    }
    return false;
  }

  function handleTap(target, x, y){
    const now = Date.now();
    if(now - lastTapHandled < DEDUPE_MS) return;   // dos dedos / doble tap
    lastTapHandled = now;

    // Si el navegador acaba de emitir un click nativo, ese ya hizo el trabajo.
    if(now - clickSeenAt < DEDUPE_MS) return;

    fireSynthetic(target, x, y);

    // ¿Lo ha gestionado alguien? Si no, ejecutamos el handler a mano.
    if(clickSeenAt < now){
      runAttrFallback(target);
    }
  }

  document.addEventListener('touchstart', function(e){
    if(!isTouchUI() || !e.touches || e.touches.length !== 1){ tracking = false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { capture: true, passive: true });

  document.addEventListener('touchend', function(e){
    if(!tracking) return;
    tracking = false;
    // El propio navegador detectó scroll y canceló el gesto
    if(e.cancelable === false) return;
    // Ya venía cancelado (defensivo: cubre a los navegadores que fijan
    // defaultPrevented antes de que corra este listener de captura)
    if(e.defaultPrevented) return;
    // Otro manejador (joystick, habilidades del juego) ya gestionó este toque
    if(Date.now() < suppressUntil) return;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    if(!t) return;
    if(Math.abs(t.clientX - startX) > MAX_DRIFT || Math.abs(t.clientY - startY) > MAX_DRIFT) return;
    const target = e.target;
    if(!isTappable(target)) return;
    handleTap(target, t.clientX, t.clientY);
  }, { capture: true, passive: true });

  // Los manejadores que hacen preventDefault marcan el gesto como gestionado.
  document.addEventListener('touchstart', function(e){
    if(e.defaultPrevented) suppressUntil = Date.now() + 600;
  }, { capture: false, passive: true });
  document.addEventListener('touchend', function(e){
    if(e.defaultPrevented) suppressUntil = Date.now() + 600;
  }, { capture: false, passive: true });

  // Registro de clicks reales. CLAVE: el click que sintetizo yo NO debe contar
  // como "el navegador ya lo hizo", porque entonces la vía 2 se desactivaría
  // sola (era el bug que rompía Android, donde Chrome sí emite click nativo).
  document.addEventListener('click', function(){
    if(syntheticInFlight) return;   // es mi propio click
    clickSeenAt = Date.now();
  }, { capture: true, passive: true });
}
initGlobalTapToClick();

window.addEventListener('keydown', function(e){
  if((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')){
    e.preventDefault();
    toggleArcCmd();
  }
  if(e.key === 'Escape'){
    const modal = document.getElementById('arcCmdModal');
    if(modal && modal.classList.contains('show')) toggleArcCmd(false);
  }
});

// Initialize browser
renderTabs();
renderHomePage();

/* ============ CERRAR VENTANA DESLIZANDO HACIA ABAJO (táctil) ============
   En móvil las ventanas son hojas a pantalla completa y el botón ✕ queda lejos
   del pulgar: arrastrar la barra de título hacia abajo cierra la app. */
(function initSwipeToClose(){
  let sw = null;
  document.addEventListener('touchstart', function(e){
    if(!(window.innerWidth <= 768 || isTouch)) return;
    const bar = e.target.closest && e.target.closest('.title-bar');
    if(!bar || (e.target.closest && e.target.closest('button'))) return;
    const win = bar.closest('.window');
    if(!win) return;
    sw = { win:win, y:e.touches[0].clientY, dy:0, active:false, t:Date.now() };
  }, { passive:true });
  document.addEventListener('touchmove', function(e){
    if(!sw) return;
    const dy = e.touches[0].clientY - sw.y;
    if(!sw.active){
      if(Math.abs(dy) < 14) return;   // deja pasar el scroll normal
      sw.active = true;
      sw.win.style.transition = 'none';
    }
    if(dy > 0){
      sw.dy = dy;
      sw.win.style.transform = 'translateY(' + dy + 'px)';
    }
  }, { passive:true });
  document.addEventListener('touchend', function(){
    if(!sw) return;
    const s = sw; sw = null;
    if(!s.active) return;
    const fast = s.dy > 60 && (Date.now() - s.t) < 400;
    s.win.style.transition = 'transform .18s ease-out';
    if(s.dy > 110 || fast){
      s.win.style.transform = 'translateY(105%)';
      setTimeout(function(){
        closeWindow(s.win.id);
        s.win.style.transform = '';
        s.win.style.transition = '';
      }, 170);
    } else {
      s.win.style.transform = '';
      setTimeout(function(){ s.win.style.transition = ''; }, 200);
    }
  }, { passive:true });
})();

/* ============ POWER-UPS & CRYPTO ABILITIES ============ */
function powerUpColor(t){
  return {
    piper: '#7cbb00',
    circle: '#ffffff',
    usdc: '#2775ca',
    E: '#00d4ff',
    '+': '#ff2d55',
    Y: '#00ffff',
    P: '#a855f7',
    B: '#ff003c'
  }[t] || '#00d4ff';
}
function powerUpIcon(t){
  return {
    piper: '🎵',
    circle: '⭕',
    usdc: '$',
    E: '⚡',
    '+': '❤',
    Y: '❄',
    P: '👻',
    B: '💣'
  }[t] || '?';
}
function applyPowerUp(t){
  if(t==='usdc'){
    NV.usdcActive = 720;
    addScore(500, true);
    showStatus('💎 USDC LIQUID STAKING SHIELD (+500 PTS)');
  } else if(t==='circle'){
    NV.dronesT = 900;
    NV.magnetT = 900;
    NV.bombs = Math.min(NV.bombs + 1, NV.bombMax);
    showStatus('⭕ CIRCLE HYPER-DRONES & GRAVITY WELL');
  } else if(t==='piper'){
    NV.piperSymphonyT = 600;
    showStatus('🎵 PIPER SONIC SYMPHONY');
  } else if(t==='E'){
    NV.empT = 360;
    NV.ebullets = [];
    showStatus('⚡ EMP OVERCHARGE - WEAPONS OFFLINE');
  } else if(t==='+'){
    NV.lives = Math.min(NV.lives + 1, 5);
    renderHearts();
    showLifeBonus();
    showStatus('❤ NANITE CORE REPAIR (+1 LIFE)');
  } else if(t==='Y'){
    NV.cryoT = 480;
    showStatus('❄ ABSOLUTE ZERO CRYO SLOW');
  } else if(t==='P'){
    NV.phaseT = 300;
    showStatus('👻 PHASE GHOST SHIFT');
  } else if(t==='B'){
    NV.bombs = Math.min(NV.bombs + 1, NV.bombMax);
    showStatus('💣 THERMONUCLEAR VIRUS BOMB');
  }
}

/* ============ SHIPS GAME LOOP ============ */
let lastFrameTime = 0;
function nvLoop(timestamp){
  requestAnimationFrame(nvLoop);
  if(!NV.on)return;
  
  if(!lastFrameTime) lastFrameTime = timestamp;
  const dt = timestamp - lastFrameTime;
  lastFrameTime = timestamp;
  if(dt > 100) return;
  const dtScale = Math.min(Math.max(dt / 16.667, 0.4), 2.2);

  // === ADAPTIVE FPS QUALITY ===
  nvFpsFrames++;
  if(timestamp - nvFpsLast > 1000){
    nvFpsAvg = nvFpsFrames;
    nvFpsFrames = 0;
    nvFpsLast = timestamp;
    nvLowPerf = nvFpsAvg < 45;
    // Adapt resolution gradually to avoid visible oscillation. Recover only
    // after sustained headroom, so a busy bullet-hell scene remains stable.
    if(nvFpsAvg < 42 && nvRenderScale > NV_MIN_SCALE){
      // Hysteresis: drop fast, the same call also refits the spatial grid/atlas pools
      nvApplyRenderScale(nvRenderScale - 0.1);
      initSpatialGrid(innerWidth, innerHeight);
    } else if(nvFpsAvg > 57 && nvRenderScale < (isMobile ? 0.86 : 1.0)){
      nvApplyRenderScale(nvRenderScale + 0.04);
      initSpatialGrid(innerWidth, innerHeight);
    }
    // Drop the scrolling star-field's binary rain entirely under heavy load
    NV.hideBgFx = nvFpsAvg < 30;
  }
  
  const W=innerWidth,H=innerHeight, d=NV.diff;
  // Render in logical screen coordinates, mapped to the reduced backing
  // buffer. CSS stretches it back to the viewport with smoothing enabled.
  nvCtx.setTransform(nvRenderScale,0,0,nvRenderScale,0,0);
  nvCtx.clearRect(0,0,W,H); nvCtx.fillStyle='#000'; nvCtx.fillRect(0,0,W,H);


  if(NV.state==='crt'){
    NV.crtT++;
    const t=NV.crtT;
    if(t<26){ const wdt=Math.min(t/26,1)*W;
      nvCtx.fillStyle='#fff'; nvCtx.shadowColor='#fff'; nvCtx.shadowBlur=20;
      nvCtx.fillRect(W/2-wdt/2,H/2-1,wdt,2); nvCtx.shadowBlur=0; }
    else if(t<52){ const k=(t-26)/26; const hgt=k*H;
      nvCtx.fillStyle='rgba(255,255,255,'+(1-k*.85)+')'; nvCtx.fillRect(0,H/2-hgt/2,W,hgt); }
    else { NV.state='hyper'; NV.hyperT=0; NV.bootLine=0; NV.bootChar=0;
      NV.player={x:W/2,y:H+80,cd:0,inv:0,triple:0,shield:0,ax:0,face:1,dashT:0,ghosts:[],dead:false}; }
    return;
  }

  if(NV.neb && !NV.hideBgFx && !(nvLowPerf && NV.t%2===1)){
    NV.nebX+=.06;
    nvCtx.globalAlpha= nvLowPerf ? 0.3 : 0.5;
    for(let i=0;i<Math.ceil(W/512)+1;i++) nvCtx.drawImage(NV.neb, -(NV.nebX%512)+i*512, 0, 512, H);
    nvCtx.globalAlpha=1;
  }
  if(!NV.hideBgFx){
    nvCtx.font='13px VT323'; nvCtx.fillStyle='rgba(0,255,120,.10)';
    NV.bin.forEach(function(b){ b.y+=b.s; if(b.y>H){ b.y=-20; b.x=Math.random()*W; }
      if(Math.random()<.06) b.txt=String(Math.round(Math.random()));
      nvCtx.fillText(b.txt||'0', b.x, b.y); });
  }
  const bossActive=!!NV.boss;
  const starSpd = NV.state==='hyper' ? (NV.hyperT<110? 26 : Math.max(2.2, 26-(NV.hyperT-110)*1.2))
    : NV.state==='transition' ? 30 : NV.state==='countdown' ? 5 : (NV.state==='playing'? (bossActive?1.2:2.2) :0.8);
  NV.stars.forEach(function(s){ s.y+=s.z*starSpd; if(s.y>H){s.y=0;s.x=Math.random()*W;}
    if(nvLowPerf && s.z<1.1) return; // skip faint far stars under load
    if(starSpd>8){ nvCtx.strokeStyle='rgba(255,255,255,.7)'; nvCtx.lineWidth=s.z*.8;
      nvCtx.beginPath(); nvCtx.moveTo(s.x,s.y); nvCtx.lineTo(s.x,s.y-s.z*starSpd*.6); nvCtx.stroke(); }
    else { nvCtx.fillStyle='rgba(255,255,255,'+(.3+s.z*.3)+')'; nvCtx.fillRect(s.x,s.y,s.z,s.z); } });
  if(bossActive){ nvCtx.fillStyle='rgba(120,0,20,.14)'; nvCtx.fillRect(0,0,W,H); }

  if(NV.state==='hyper'){
    NV.hyperT++;
    const p=NV.player;
    if(NV.hyperT<110){ p.y += (H-90-p.y)*.06 + 3; p.x = W/2 + Math.sin(NV.hyperT*.1)*40; }
    else { p.y += (H-90-p.y)*.2; p.x += (W/2-p.x)*.15; }
    drawShip(p.x,p.y,0,false);
    if(NV.hyperT>120){
      nvCtx.font='22px VT323'; nvCtx.textAlign='left';
      let acc=0;
      for(let i=0;i<=NV.bootLine && i<BOOT_LINES.length;i++){
        const line=BOOT_LINES[i];
        const shown=Math.max(0,Math.min(line.length, Math.floor(NV.bootChar-acc)));
        nvCtx.fillStyle = (Math.floor(NV.hyperT/8)%2===0||i<NV.bootLine)?'#0f0':'rgba(0,255,65,.4)';
        nvCtx.fillText(line.slice(0,shown)+(shown<line.length&&i===NV.bootLine?'█':''), W*.12, H*.3+i*30);
        acc+=line.length;
        if(shown>=line.length && i===NV.bootLine && NV.bootChar>acc+4){ NV.bootLine++; }
      }
      NV.bootChar+=.6;
      if(NV.bootLine>=BOOT_LINES.length && NV.hyperT>210) nvToMenu();
    }
    return;
  }

  if(NV.state==='transition'){
    NV.transT--;
    const flash=Math.floor(NV.transT/8)%2===0;
    nvCtx.textAlign='center';
    nvCtx.font='64px VT323';
    nvCtx.fillStyle=flash?'#0f0':'#7cbb00';
    nvCtx.shadowColor='#0f0'; nvCtx.shadowBlur=nvLowPerf?0:24;
    nvCtx.fillText(NV.transTxt, W/2, H/2-10);
    nvCtx.font='26px VT323'; nvCtx.fillStyle=flash?'#fff':'#9fd4ff';
    nvCtx.shadowColor='#00d4ff'; nvCtx.shadowBlur=nvLowPerf?0:14;
    nvCtx.fillText('WARPING TO NEXT ROUND...', W/2, H/2+34);
    nvCtx.shadowBlur=0;
    if(NV.transT<=0){ nextRound(); }
    return;
  }

  if(NV.state==='countdown'){
    NV.cdT--;
    const stage=Math.ceil(NV.cdT/75);
    if(stage!==NV.cdStage){
      NV.cdStage=stage;
      if(stage>0){ sfx(440+(3-stage)*200,.18,'square',.25); }
      else { sfx(1320,.4,'square',.3); }
    }
    // Empty arena: keep stars/nebula, nothing else.
    const cp=NV.player;
    if(cp){ cp.x += (W/2 - cp.x)*.04; cp.y += (H-90 - cp.y)*.04; drawShip(cp.x,cp.y,0,false); }
    nvCtx.textAlign='center';
    const pulse=1+Math.sin(NV.cdT*.2)*.04;
    nvCtx.save();
    nvCtx.shadowColor='#00ff41'; nvCtx.shadowBlur=nvLowPerf?0:40;
    nvCtx.font=Math.floor(160*pulse)+'px VT323';
    nvCtx.fillStyle=stage>0?'#00ff41':'#00ffff';
    nvCtx.fillText(stage>0?stage:'GO!', W/2, H/2+40);
    nvCtx.restore();
    nvCtx.font='30px VT323'; nvCtx.fillStyle='#9fd4ff';
    nvCtx.fillText('SECTOR '+(NV.round+1)+' — PREPARE', W/2, H/2+100);
    if(NV.cdT<=0){ clearArena(); nextRound(); }
    return;
  }

  if(NV.shake>0){ NV.shake--; nvCtx.save(); nvCtx.translate((Math.random()-.5)*NV.shake,(Math.random()-.5)*NV.shake); }
  const r = Math.max(1, NV.round || 1);
  const prog = Math.min((r - 1) / 7, 1.5);
  const dm = (0.85 + prog * 0.45) * (NV.roundAffix && NV.roundAffix.id === 'solar' ? 1.15 : 1);
  const bm = (0.78 + prog * 0.45) * (NV.roundAffix && NV.roundAffix.id === 'warp' ? 1.2 : 1);
  const fan = r <= 1 ? 1 : r <= 2 ? 2 : r <= 4 ? 3 : r <= 7 ? 4 : 5;
  const firer = 0.0018 + prog * 0.0050;
  const astrate = (NV.roundAffix && NV.roundAffix.id === 'meteor' ? 30 : Math.max(45, Math.floor(115 - prog * 45)));
  const volp = (NV.roundAffix && NV.roundAffix.id === 'meteor' ? 0.65 : (0.20 + prog * 0.25));
  const frozen = NV.freeze>0;
  if(frozen) NV.freeze--;

  NV.debris=NV.debris.filter(function(dd){
    if(!frozen){ dd.x+=dd.vx*dtScale; dd.y+=dd.vy*dtScale; dd.rot+=dd.vr*dtScale; dd.sm++;
      if(dd.sm%14===0) { const p=getParticle(); if(p){ p.active=true; p.kind='smoke'; p.x=dd.x; p.y=dd.y; p.vx=0; p.vy=-.5; p.l=26; p.maxL=26; p.r=6; p.col='#5a5a5a'; } } }
    nvCtx.save(); nvCtx.translate(dd.x,dd.y); nvCtx.rotate(dd.rot);
    nvCtx.fillStyle='#4a4640'; nvCtx.strokeStyle='#2b2823'; nvCtx.lineWidth=1.5;
    nvCtx.beginPath();
    if(dd.seed===0){ nvCtx.rect(-dd.s/2,-dd.s/3,dd.s,dd.s*.66); }
    else if(dd.seed===1){ nvCtx.moveTo(-dd.s/2,dd.s/3); nvCtx.lineTo(0,-dd.s/2); nvCtx.lineTo(dd.s/2,dd.s/3); nvCtx.closePath(); }
    else { nvCtx.moveTo(-dd.s/2,0); nvCtx.lineTo(-dd.s/6,-dd.s/2); nvCtx.lineTo(dd.s/2,-dd.s/4); nvCtx.lineTo(dd.s/3,dd.s/2); nvCtx.closePath(); }
    nvCtx.fill(); nvCtx.stroke(); nvCtx.restore();
    return dd.y<H+30; });

  const p=NV.player;
  const playing = NV.state==='playing';

  if(playing && !frozen && !p.dead){
    NV.t++;
    if(NV.comboT>0){ NV.comboT--;
      const comboEl=document.getElementById('nvCombo');
      if(comboEl) comboEl.style.opacity = NV.comboT<40 ? (0.4+0.6*Math.abs(Math.sin(NV.comboT*.18))) : 1; // blinking "about to expire"
      if(NV.comboT===0){ NV.combo=0; comboEl.textContent=''; comboEl.style.opacity=1; } }
    const cdTick = (typeof ownedMemes !== 'undefined' && ownedMemes.whatif) ? 1.2 : 1; // WHATIF: 20% faster cooldowns
    if(NV.dashCd>0)NV.dashCd=Math.max(0,NV.dashCd-cdTick); if(NV.misCd>0)NV.misCd=Math.max(0,NV.misCd-cdTick); if(NV.lasCd>0)NV.lasCd=Math.max(0,NV.lasCd-cdTick);
    if(NV.laserFlash>0)NV.laserFlash--; if(NV.muzzle>0)NV.muzzle--;
    if(NV.overdriveT>0)NV.overdriveT--; if(NV.dronesT>0)NV.dronesT--;
    if(NV.cryoT>0)NV.cryoT--; if(NV.phaseT>0)NV.phaseT--; if(NV.magnetT>0)NV.magnetT--;
    if(NV.empT>0)NV.empT--; if(NV.usdcActive>0)NV.usdcActive--;
    if(NV.piperSymphonyT>0)NV.piperSymphonyT--; if(NV.chronoT>0)NV.chronoT--;
    if(NV.bombCd>0){ NV.bombCd--; if(NV.bombCd===0 && NV.bombs<NV.bombMax){ NV.bombs++; showStatus('💣 BOMB READY'); modReadySfx(); } }
    const K=NV.keys;
    const ax=((K['ArrowRight']||K['d']||NV.touch.dx>0)?1:0)-((K['ArrowLeft']||K['a']||NV.touch.dx<0)?1:0);
    const ay=((K['ArrowDown']||K['s']||NV.touch.dy>0)?1:0)-((K['ArrowUp']||K['w']||NV.touch.dy<0)?1:0);
    p.ax=ax; if(ax!==0)p.face=ax;
    p.x+=ax*6.5*dtScale; p.y+=ay*6.5*dtScale;
    if(p.dashT>0){ p.dashT--; p.x+=p.face*16*dtScale; p.ghosts.push({x:p.x,y:p.y,l:12}); }
    p.ghosts=p.ghosts.filter(function(g){ g.l--; return g.l>0; });
    p.x=Math.max(30,Math.min(W-30,p.x)); p.y=Math.max(H*.4,Math.min(H-55,p.y));
    if(p.cd>0)p.cd--; if(p.inv>0)p.inv--; if(p.triple>0)p.triple--; if(p.shield>0)p.shield--;
    
    // Dual thrusters from the two legs of the Arc logo (enlarged ship offsets)
    const fpLeft=getParticle();
    if(fpLeft){
      fpLeft.active=true; fpLeft.kind='fire';
      fpLeft.x=p.x - 17 - ax*2 + (Math.random()-.5)*3;
      fpLeft.y=p.y + 28;
      fpLeft.vx=-ax*1.8 + (Math.random()-.5)*0.8;
      fpLeft.vy=2.2 + Math.random()*2;
      fpLeft.l=14; fpLeft.maxL=14; fpLeft.r=4.2;
      fpLeft.col=ax!==0?'#ff9500':'#00d4ff';
    }
    const fpRight=getParticle();
    if(fpRight){
      fpRight.active=true; fpRight.kind='fire';
      fpRight.x=p.x + 18 - ax*2 + (Math.random()-.5)*3;
      fpRight.y=p.y + 28;
      fpRight.vx=-ax*1.8 + (Math.random()-.5)*0.8;
      fpRight.vy=2.2 + Math.random()*2;
      fpRight.l=14; fpRight.maxL=14; fpRight.r=4.2;
      fpRight.col=ax!==0?'#ff9500':'#00d4ff';
    }

    const fireCd=NV.overdriveT>0?4:9;
    if((K[' ']||K['Space']||isTouch) && p.cd<=0){
      p.cd=fireCd; NV.muzzle=5; laserSfx();
      if(p.triple>0){
        spawnPlayerBullet({x:p.x-16, y:p.y-34, vy:-13, vx:-2.2, rot:-.16});
        spawnPlayerBullet({x:p.x,    y:p.y-38, vy:-14, vx:0,    rot:0});
        spawnPlayerBullet({x:p.x+16, y:p.y-34, vy:-13, vx:2.2,  rot:.16});
      } else {
        spawnPlayerBullet({x:p.x, y:p.y-36, vy:-14, vx:0, rot:0});
      }
    }
    // Piper Sonic Symphony auto-barrage (5-way piercing resonant flutes)
    if(NV.piperSymphonyT>0 && NV.t%5===0){
      for(let k=-2; k<=2; k++){
        spawnPlayerBullet({x:p.x+k*12, y:p.y-34, vy:-15, vx:k*2.2, rot:k*0.12, green:true, pierce:2});
      }
      pentatonicNoteSfx(NV.symphonyCount++);
    }
    // Circle Hyper-Drones (Dual orbital companions)
    if(NV.dronesT>0){
      const ang=NV.t*.1;
      const dx1=p.x+Math.cos(ang)*44, dy1=p.y+Math.sin(ang)*44;
      const dx2=p.x+Math.cos(ang+Math.PI)*44, dy2=p.y+Math.sin(ang+Math.PI)*44;
      if(NV.t%8===0){
        spawnPlayerBullet({x:dx1,y:dy1,vy:-11,vx:0,rot:0});
        spawnPlayerBullet({x:dx2,y:dy2,vy:-11,vx:0,rot:0});
      }
      [ {x:dx1,y:dy1}, {x:dx2,y:dy2} ].forEach(function(dr){
        nvCtx.save(); nvCtx.translate(dr.x, dr.y);
        nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
        const dg=nvCtx.createRadialGradient(0,0,0,0,0,16);
        dg.addColorStop(0,'rgba(0,212,255,.8)'); dg.addColorStop(1,'rgba(0,0,0,0)');
        nvCtx.fillStyle=dg; nvCtx.beginPath(); nvCtx.arc(0,0,16,0,7); nvCtx.fill(); nvCtx.restore();
        nvCtx.fillStyle='#ffffff'; nvCtx.shadowColor='#00d4ff'; nvCtx.shadowBlur=10;
        nvCtx.beginPath(); nvCtx.arc(0,0,5,0,7); nvCtx.fill();
        nvCtx.strokeStyle='#00d4ff'; nvCtx.lineWidth=2;
        nvCtx.beginPath(); nvCtx.arc(0,0,9,0,7); nvCtx.stroke();
        nvCtx.restore();
      });
    }
    if(NV.budget>0){ NV.squadCd--;
      if(NV.squadCd<=0){
        const isMob = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window) || (W < 768) || (H > W);
        NV.squadCd = isMob ? Math.max(16, Math.floor(46 - NV.round * 2.2)) : Math.max(26, 90 - NV.round * 3);
        const size=Math.min(NV.budget, 3+Math.floor(Math.random()*3)+Math.min(Math.floor(NV.round/4),3));
        NV.budget-=size; spawnSquad(); } }
    NV.astCd--;
    if(NV.astCd<=0){ NV.astCd=astrate*(0.7+Math.random()*.6);
      const r=14+Math.random()*20;
      const dir=Math.random()<.5?1:-1;
      NV.asteroids.push({x: dir>0? -40 : W+40, y:-30-Math.random()*H*.4,
        vx:dir*(0.7+Math.random()*1.5)*dm, vy:(0.8+Math.random()*1.4)*dm, r:r,
        rot:0,vr:(Math.random()-.5)*.09, hp:Math.ceil(r/10), vol:Math.random()<volp,
        verts:Array.from({length:9},function(){return .75+Math.random()*.4;})});
    }
    NV.groups.forEach(function(g){ g.y+=g.vy; g.sway+=.02; });
    // Purge dead squads too: a group with no living members is dead weight
    NV.groups=NV.groups.filter(function(g){
      if(g.y>=H+120) return false;
      for(let i=0;i<NV.enemies.length;i++){ if(NV.enemies[i].g===g) return true; }
      return false;
    });
    if(NV.bombT>0){
      NV.bombT--;
      const sweepY=(1-NV.bombT/70)*H;
      NV.ebullets=NV.ebullets.filter(function(b){ if(b.y<sweepY){ const p=getParticle(); if(p){ p.active=true; p.kind='fire'; p.x=b.x; p.y=b.y; p.vx=0; p.vy=-1; p.l=10; p.maxL=10; p.r=3; p.col='#7cbb00'; } return false; } return true; });
      for(let i=NV.enemies.length-1;i>=0;i--){ const e=NV.enemies[i];
        if(e.y<sweepY && e.type!=='camo'){ killEnemy(e,i,false); } }
      for(let i=NV.asteroids.length-1;i>=0;i--){ const a=NV.asteroids[i];
        if(a.y<sweepY){ nvBoom(a.x,a.y,1,'rock'); NV.asteroids.splice(i,1); addScore(40); } }
      if(!NV.bombHit && NV.boss && NV.boss.y<sweepY){ NV.bombHit=true;
        if(NV.boss.type==='ac'){ NV.boss.plates.forEach(function(pl){ if(pl.hp>0){ pl.hp-=6; if(pl.hp<=0)nvBoom(NV.boss.x+pl.off,NV.boss.y+44,1.2,'rock'); } });
          if(!NV.boss.plates.some(function(pl){return pl.hp>0;}))NV.boss.core-=10; }
        else { NV.boss.belts.forEach(function(bl){ if(bl.hp>0){ bl.hp-=7; if(bl.hp<=0)nvBoom(NV.boss.x+bl.off,NV.boss.y+52,1.3,'rock'); } });
          if(!NV.boss.belts.some(function(bl){return bl.hp>0;}))NV.boss.core-=12; }
        NV.shake=14;
      }
    }
    if(NV.round > 0 && NV.budget <= 0 && !NV.boss && NV.enemies.length === 0){
      NV.state='countdown'; NV.cdT=300; NV.cdStage=4;
      NV.bombs=Math.min(NV.bombs+1,NV.bombMax);
      addScore(500,true); sfx(660,.2,'sine'); sfx(990,.3,'sine');
      showStatus('🏁 SECTOR CLEAR — +1 ☣️');
    }
  }

  NV.scraps=NV.scraps.filter(function(s){
    if(playing&&!frozen){ s.x+=s.vx; s.y+=s.vy; s.vx*=.985;
      if(p && Math.abs(p.x-s.x)<s.w/2+18 && Math.abs(p.y-s.y)<s.h/2+18){
        s.vx += (p.ax||((p.x<s.x)?-.5:.5))*.24; s.vy=Math.max(s.vy-.02,.15); sparks(p.x,p.y,3,'#9fd4ff');
      }
      for(let i=NV.enemies.length-1;i>=0;i--){ const e=NV.enemies[i];
        if(Math.abs(e.x-s.x)<s.w/2+14 && Math.abs(e.y-s.y)<s.h/2+14){
          killEnemy(e,i,false); NV.freeze=Math.max(NV.freeze,4); addScore(60); nvDebris(e.x,e.y,3); } }
      for(let i=NV.ebullets.length-1;i>=0;i--){ const b=NV.ebullets[i];
        if(b.active!==false && Math.abs(b.x-s.x)<s.w/2 && Math.abs(b.y-s.y)<s.h/2){ b.active=false; sparks(b.x,b.y,5,'#fbbf24'); } }
      for(let i=NV.bullets.length-1;i>=0;i--){ const b=NV.bullets[i];
        if(b.active!==false && Math.abs(b.x-s.x)<s.w/2 && Math.abs(b.y-s.y)<s.h/2){ b.active=false; sparks(b.x,b.y,4,'#fff'); } }
    }
    nvCtx.save(); nvCtx.translate(s.x,s.y);
    nvCtx.fillStyle='#5a564e'; nvCtx.strokeStyle='#33302a'; nvCtx.lineWidth=2;
    nvCtx.fillRect(-s.w/2,-s.h/2,s.w,s.h); nvCtx.strokeRect(-s.w/2,-s.h/2,s.w,s.h);
    nvCtx.fillStyle='#403c35';
    for(let i=0;i<4;i++) nvCtx.fillRect(-s.w/2+8+i*(s.w-16)/3.4, -s.h/2+6, (s.w-28)/4, s.h-12);
    nvCtx.fillStyle='#8a867a'; nvCtx.fillRect(-s.w/2-6,-6,6,12); nvCtx.fillRect(s.w/2,-6,6,12);
    nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
    nvCtx.fillStyle='rgba(0,212,255,.5)'; nvCtx.fillRect(-s.w/2+4,-s.h/2-3,s.w-8,3); nvCtx.restore();
    nvCtx.restore();
    return s.y<H+60; });

  let mw = 0;
  for(let mi = 0; mi < NV.missiles.length; mi++){
    const m = NV.missiles[mi];
    if(m.active === false) continue;
    let keep = true;
    if(playing && !frozen){
      m.t=(m.t||0)+1;
      if(m.t>170){ nvBoom(m.x,m.y,.5,'normal'); m.active=false; continue; }
      let tgt = null, td = 1e9;
      NV.enemies.forEach(function(e){ const dd=Math.hypot(e.x-m.x,e.y-m.y); if(dd<td){td=dd;tgt=e;} });
      if(NV.boss){ const dd=Math.hypot(NV.boss.x-m.x,NV.boss.y-m.y); if(dd<td){td=dd;tgt=NV.boss;} }
      NV.asteroids.forEach(function(a){ const dd=Math.hypot(a.x-m.x,a.y-m.y); if(dd<td){td=dd;tgt=a;} });
      if(tgt){ const dx=tgt.x-m.x,dy=tgt.y-m.y,dd=Math.hypot(dx,dy)||1;
        m.vx+= (dx/dd)*.7; m.vy+= (dy/dd)*.7;
        const sp=Math.hypot(m.vx,m.vy); if(sp>9){ m.vx*=9/sp; m.vy*=9/sp; } }
      else m.vy-=.5;
      m.x+=m.vx; m.y+=m.vy;
      { const fp=getParticle(); if(fp){ fp.active=true; fp.kind='fire'; fp.x=m.x; fp.y=m.y; fp.vx=0; fp.vy=1; fp.l=10; fp.maxL=10; fp.r=3; fp.col='#ff9500'; } }
      for(let i=NV.enemies.length-1;i>=0;i--){ const e=NV.enemies[i];
        if(Math.hypot(e.x-m.x,e.y-m.y)<22){ killEnemy(e,i); nvBoom(m.x,m.y,.8,'normal'); keep=false; break; } }
      if(keep && NV.boss && Math.hypot(NV.boss.x-m.x,NV.boss.y-m.y)<60){ nvBoom(m.x,m.y,.9,'normal'); damageBoss(3,m.x,m.y); keep=false; }
      if(keep){
        for(let i=NV.asteroids.length-1;i>=0;i--){ const a=NV.asteroids[i];
          if(Math.hypot(a.x-m.x,a.y-m.y)<a.r){ a.hp-=2; nvBoom(m.x,m.y,.7,'rock');
            if(a.hp<=0){ if(a.vol)detonateAsteroid(a,i); else { nvBoom(a.x,a.y,1,'rock'); NV.asteroids.splice(i,1); addScore(50); } }
            keep=false; break; } }
      }
    }
    nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
    const g=nvCtx.createRadialGradient(m.x,m.y,0,m.x,m.y,16);
    g.addColorStop(0,'rgba(255,150,0,.7)'); g.addColorStop(1,'rgba(0,0,0,0)');
    nvCtx.fillStyle=g; nvCtx.beginPath(); nvCtx.arc(m.x,m.y,16,0,7); nvCtx.fill(); nvCtx.restore();
    nvCtx.fillStyle='#ffcc00'; nvCtx.beginPath(); nvCtx.arc(m.x,m.y,4,0,7); nvCtx.fill();
    if(keep && m.y>-30 && m.x>-30 && m.x<W+30 && m.y<H+30 && m.active!==false){
      NV.missiles[mw++] = m;
    } else {
      m.active = false;
    }
  }
  NV.missiles.length = mw;

  // Holographic decoys from Arc Warp Split
  NV.decoys=NV.decoys.filter(function(d){
    if(playing&&!frozen){
      d.x+=(d.vx||0)*dtScale; d.y+=(d.vy||0)*dtScale; d.l-=dtScale;
      if(NV.t%4===0) sparks(d.x, d.y, 2, '#a855f7');
    }
    nvCtx.save(); nvCtx.translate(d.x,d.y);
    nvCtx.globalAlpha=Math.max(0,(d.l/d.maxL)*.75*(Math.random()>.15?1:.4));
    if(arcShipImg.complete && arcShipImg.naturalWidth>0){
      nvCtx.shadowColor='#a855f7'; nvCtx.shadowBlur=18;
      nvCtx.drawImage(arcShipImg, -35, -37, 70, 70);
    }
    nvCtx.restore();
    if(d.l<=0){
      sparks(d.x, d.y, 14, '#a855f7');
      NV.rings.push({x:d.x, y:d.y, r:8, max:70});
      sfx(520, .15, 'sine', .12);
      for(let eb=NV.ebullets.length-1; eb>=0; eb--){
        if(Math.hypot(NV.ebullets[eb].x-d.x, NV.ebullets[eb].y-d.y)<65){
          NV.ebullets.splice(eb, 1);
          addScore(15);
        }
      }
      return false;
    }
    return true;
  });

  // Harmonic Resonator toroidal sonic rings (transmute enemy bullets into allied flutes)
  NV.sonicRings=NV.sonicRings.filter(function(sr){
    if(playing&&!frozen){
      sr.y+=sr.vy*dtScale; sr.r+=3.8*dtScale; sr.t+=dtScale;
      for(let j=NV.ebullets.length-1; j>=0; j--){
        const eb=NV.ebullets[j];
        if(Math.hypot(eb.x-sr.x, eb.y-sr.y)<=sr.r+16 && Math.hypot(eb.x-sr.x, eb.y-sr.y)>=sr.r-22){
          NV.ebullets.splice(j, 1);
          sparks(eb.x, eb.y, 6, '#00ff41');
          spawnPlayerBullet({
            x:eb.x, y:eb.y,
            vx:(Math.random()-.5)*4,
            vy:-13,
            rot:-Math.PI/2,
            green:true,
            pierce:1
          });
          addScore(25);
          pentatonicNoteSfx(Math.floor(Math.random()*5));
        }
      }
      for(let i=0; i<NV.enemies.length; i++){
        const e=NV.enemies[i];
        if(Math.hypot(e.x-sr.x, e.y-sr.y)<=sr.r+20 && Math.hypot(e.x-sr.x, e.y-sr.y)>=sr.r-25){
          e.resonated=120;
          if(NV.t%6===0) sparks(e.x, e.y, 3, '#00ff41');
        }
      }
    }
    nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
    const ringAlpha=Math.max(0, 1-sr.r/sr.maxR);
    nvCtx.strokeStyle='rgba(0, 255, 65, '+(ringAlpha*.9)+')';
    nvCtx.lineWidth=4;
    nvCtx.beginPath(); nvCtx.arc(sr.x, sr.y, sr.r, 0, 7); nvCtx.stroke();
    nvCtx.strokeStyle='rgba(0, 212, 255, '+(ringAlpha*.6)+')';
    nvCtx.lineWidth=2;
    nvCtx.beginPath(); nvCtx.arc(sr.x, sr.y, Math.max(0, sr.r-12), 0, 7); nvCtx.stroke();
    nvCtx.restore();
    return sr.r<sr.maxR && sr.y>-50;
  });

  // Arc Chrono-Peeking Temporal Cone
  if(NV.chronoT>0 && playing && !p.dead){
    nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
    const coneGrad=nvCtx.createRadialGradient(p.x, p.y, 10, p.x, p.y-180, 260);
    coneGrad.addColorStop(0, 'rgba(0, 212, 255, 0.45)');
    coneGrad.addColorStop(0.6, 'rgba(0, 120, 255, 0.2)');
    coneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    nvCtx.fillStyle=coneGrad;
    nvCtx.beginPath();
    nvCtx.moveTo(p.x-18, p.y-20);
    nvCtx.lineTo(p.x-140, p.y-320);
    nvCtx.lineTo(p.x+140, p.y-320);
    nvCtx.lineTo(p.x+18, p.y-20);
    nvCtx.closePath();
    nvCtx.fill();
    nvCtx.strokeStyle='rgba(255, 255, 255, '+(0.15+Math.sin(NV.t*.2)*.1)+')';
    nvCtx.lineWidth=1;
    for(let sl=p.y-20; sl>p.y-320; sl-=24){
      const spread=((p.y-20-sl)/300)*130;
      nvCtx.beginPath(); nvCtx.moveTo(p.x-spread, sl); nvCtx.lineTo(p.x+spread, sl); nvCtx.stroke();
    }
    nvCtx.restore();

    for(let i=0; i<NV.enemies.length; i++){
      const e=NV.enemies[i];
      if(e.y<p.y+20 && e.y>p.y-320 && Math.abs(e.x-p.x)<140){
        e.y-=(e.vy||0)*0.85*dtScale;
        e.flash=2;
      }
    }
    for(let j=0; j<NV.ebullets.length; j++){
      const eb=NV.ebullets[j];
      if(eb.y<p.y && eb.y>p.y-320 && Math.abs(eb.x-p.x)<140){
        eb.y-=(eb.vy||0)*0.8*dtScale;
      }
    }
    if(NV.chronoT===1){
      sfx(900, .2, 'sawtooth', .15);
      NV.rings.push({x:p.x, y:p.y-140, r:20, max:220});
      // EMP discharge: dissipate ALL enemy bullets on screen + cone damage
      let cleared=0;
      for(let j=NV.ebullets.length-1; j>=0; j--){
        const eb=NV.ebullets[j];
        if(Math.random()<.5) sparks(eb.x, eb.y, 3, '#00d4ff');
        NV.ebullets.splice(j,1); cleared++;
      }
      if(cleared>0){ addScore(cleared*5); showStatus('⚡ EMP DISCHARGE: '+cleared+' SHOTS PURGED'); }
      for(let i=NV.enemies.length-1; i>=0; i--){
        const e=NV.enemies[i];
        if(e.y<p.y && e.y>p.y-320 && Math.abs(e.x-p.x)<150){
          if(e.hp && e.hp>5){ e.hp-=5; nvBoom(e.x, e.y, 1.2, 'purple'); }
          else { killEnemy(e, i); }
        }
      }
    }
  }

  // ARC RAILGUN beam render (long-range corridor)
  if(NV.railgunT>0){
    if(playing&&!frozen) NV.railgunT--;
    const rx=NV.railgunX;
    if(p){
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      const alpha=NV.railgunT/22;
      const bw2=10+Math.sin(NV.t*.9)*3;
      const gg=nvCtx.createLinearGradient(rx-bw2*3,0,rx+bw2*3,0);
      gg.addColorStop(0,'rgba(0,212,255,0)'); gg.addColorStop(.5,'rgba(160,240,255,'+(.85*alpha)+')'); gg.addColorStop(1,'rgba(0,212,255,0)');
      nvCtx.fillStyle=gg; nvCtx.fillRect(rx-bw2*3,0,bw2*6,p.y);
      nvCtx.fillStyle='rgba(255,255,255,'+(.9*alpha)+')'; nvCtx.fillRect(rx-2,0,4,p.y);
      if(!nvLowPerf){
        nvCtx.strokeStyle='rgba(0,212,255,'+(.5*alpha)+')'; nvCtx.lineWidth=1;
        for(let s=0;s<3;s++){ nvCtx.beginPath(); nvCtx.moveTo(rx+(Math.random()-.5)*30, p.y); nvCtx.lineTo(rx+(Math.random()-.5)*46, p.y-120-Math.random()*200); nvCtx.stroke(); }
      }
      nvCtx.restore();
    }
  }

  // ORBITAL STRIKE: telegraphed reticles -> ion columns from the sky
  NV.orbitals=NV.orbitals.filter(function(ob){
    if(playing&&!frozen){
      ob.t++;
      if(ob.t===ob.delay){
        sfx(1500,.2,'sawtooth',.15); NV.shake=Math.max(NV.shake,6);
        NV.rings.push({x:ob.x,y:ob.y,r:10,max:90});
        for(let i=NV.enemies.length-1;i>=0;i--){ const e=NV.enemies[i];
          if(Math.hypot(e.x-ob.x,e.y-ob.y)<56){
            if(e.hp && e.hp>10){ e.hp-=10; e.flash=4; nvBoom(e.x,e.y,.9,'purple'); }
            else killEnemy(e,i); } }
        for(let i=NV.asteroids.length-1;i>=0;i--){ const a=NV.asteroids[i];
          if(Math.hypot(a.x-ob.x,a.y-ob.y)<60){ a.hp-=8;
            if(a.hp<=0){ if(a.vol)detonateAsteroid(a,i); else { nvBoom(a.x,a.y,1,'rock'); NV.asteroids.splice(i,1); addScore(50); } } } }
        for(let j=NV.ebullets.length-1;j>=0;j--){ if(Math.hypot(NV.ebullets[j].x-ob.x,NV.ebullets[j].y-ob.y)<70) NV.ebullets.splice(j,1); }
        if(NV.boss && Math.hypot(NV.boss.x-ob.x,NV.boss.y-ob.y)<110){ damageBoss(6,ob.x,ob.y); }
      }
    }
    if(ob.t<ob.delay){
      // Telegraph reticle, contracts as the strike locks on
      const pr=ob.t/ob.delay;
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      nvCtx.strokeStyle='rgba(0,212,255,'+(0.3+pr*0.6)+')'; nvCtx.lineWidth=2;
      nvCtx.setLineDash([6,6]); nvCtx.beginPath(); nvCtx.arc(ob.x,ob.y,56*(1-pr*0.6),0,7); nvCtx.stroke();
      nvCtx.setLineDash([]);
      nvCtx.beginPath(); nvCtx.moveTo(ob.x-10,ob.y); nvCtx.lineTo(ob.x+10,ob.y); nvCtx.moveTo(ob.x,ob.y-10); nvCtx.lineTo(ob.x,ob.y+10); nvCtx.stroke();
      nvCtx.restore();
    } else if(ob.t<ob.delay+10){
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      const a2=1-(ob.t-ob.delay)/10;
      const og=nvCtx.createLinearGradient(ob.x,0,ob.x,ob.y);
      og.addColorStop(0,'rgba(0,212,255,0)'); og.addColorStop(1,'rgba(160,240,255,'+(.8*a2)+')');
      nvCtx.fillStyle=og; nvCtx.fillRect(ob.x-14,0,28,ob.y);
      nvCtx.fillStyle='rgba(255,255,255,'+(.9*a2)+')'; nvCtx.beginPath(); nvCtx.arc(ob.x,ob.y,26*a2,0,7); nvCtx.fill();
      nvCtx.restore();
    }
    return ob.t < ob.delay+12;
  });

  let bw = 0;
  for(let i = 0; i < NV.bullets.length; i++){
    const b = NV.bullets[i];
    if(playing && !frozen){
      b.x += (b.vx || 0) * dtScale;
      b.y += b.vy * dtScale;
      if(NV.t % 6 === 0 && !nvLowPerf){
        const np = getParticle();
        if(np){
          np.active = true; np.kind = 'note';
          np.x = b.x + (Math.random() - .5) * 10;
          np.y = b.y + 14;
          np.vx = (Math.random() - .5) * .8;
          np.vy = 1.2 + Math.random() * 1.2;
          np.l = 18; np.maxL = 18; np.r = 10;
          np.col = b.green ? '#00ff41' : (b.isMaster ? '#fbbf24' : '#00d4ff');
          np.char = Math.random() < .33 ? '♪' : (Math.random() < .66 ? '♫' : '♩');
        }
      }
    }
    drawFlute(nvCtx, b.x, b.y, b.rot || 0, b.isMaster, b.green);
    if(b.y > -35 && b.x > -30 && b.x < W + 30 && b.active !== false){
      NV.bullets[bw++] = b;
    } else {
      b.active = false;
    }
  }
  NV.bullets.length = bw;

  clearSpatialGrid();
  for(let bi = 0; bi < NV.bullets.length; bi++){
    const b = NV.bullets[bi];
    if(b.active !== false) insertSpatialGrid(b, b.x, b.y, 14, 'bullet');
  }
  for(let mi = 0; mi < NV.missiles.length; mi++){
    const m = NV.missiles[mi];
    if(m.active !== false) insertSpatialGrid(m, m.x, m.y, 16, 'missile');
  }
  for(let ei = 0; ei < NV.enemies.length; ei++){
    const e = NV.enemies[ei];
    if(e && e.y > -50 && e.y < H + 50) insertSpatialGrid(e, e.x, e.y, 24, 'enemy');
  }

  // Mobile / Tactical Top Radar Warning: Pulsing holographic chevron markers for approaching enemies
  if(playing && !p.dead){
    for(let i=0; i<NV.enemies.length; i++){
      const e = NV.enemies[i];
      if(e.y < 0 && e.y > -220){
        const radarAlpha = Math.min(1, Math.max(0.3, (220 + e.y) / 220));
        const pulse = 0.8 + Math.sin(NV.t * 0.25) * 0.25;
        nvCtx.save();
        nvCtx.globalAlpha = radarAlpha * pulse;
        let radarCol = '#ff2d55';
        if(e.type === 'shield' || e.type === 'recon') radarCol = '#00d4ff';
        else if(e.type === 'swarm') radarCol = '#10b981';
        else if(e.type === 'spinner') radarCol = '#a855f7';
        else if(e.type === 'convoy') radarCol = '#fbbf24';
        nvCtx.fillStyle = radarCol;
        nvCtx.beginPath();
        nvCtx.moveTo(e.x, 6);
        nvCtx.lineTo(e.x - 7, 18);
        nvCtx.lineTo(e.x + 7, 18);
        nvCtx.closePath();
        nvCtx.fill();
        nvCtx.restore();
      }
    }
  }

  for(let i=NV.enemies.length-1;i>=0;i--){
    const e=NV.enemies[i];
    const tgt=(NV.decoys&&NV.decoys.length>0)?NV.decoys[0]:p;
    if(playing&&!frozen && !p.dead){
      e.t++; if(e.flash>0)e.flash--;
      if(e.type==='kami'){
        const dx=tgt.x-e.x, dy=tgt.y-e.y, dd=Math.hypot(dx,dy)||1;
        const diveAcc = (0.08 + prog * 0.08) * dm;
        const maxSpd = (2.6 + prog * 1.8) * dm;
        e.vx+= (dx/dd)*diveAcc*1.5; e.vy+= (dy/dd)*diveAcc;
        e.vy=Math.min(e.vy,maxSpd); e.vx=Math.max(-maxSpd,Math.min(maxSpd,e.vx));
        e.x+=e.vx; e.y+=e.vy;
        if(!e.burst && dd<180){ e.burst=true;
          if(NV.empT<=0){
            const kamiFan = r <= 2 ? 1 : (r <= 5 ? 2 : 3);
            for(let k=0; k<kamiFan; k++){
              const spread = kamiFan === 1 ? 0 : (k - (kamiFan-1)/2)*0.6;
              spawnEnemyBullet({x:e.x, y:e.y, vx:(dx/dd)*5.2*bm + spread, vy:(dy/dd)*5.2*bm, kind:'dart', rot:Math.atan2(dy,dx), t:0});
            }
            sfx(320,.1,'square',.1);
          } else { sparks(e.x, e.y, 4, '#00d4ff'); }
        }
      } else if(e.type==='camo'){
        e.y+=.3*dm;
        if(e.st===0){ e.x+= (tgt.x-e.x)*.004; e.x+=Math.sin(e.t*.02)*.8; e.timer--;
          if(e.timer<=0){ e.st=1; e.timer=Math.max(30, Math.floor(55 - prog * 15)); chargeSfx(); } }
        else if(e.st===1){ e.timer--; if(e.timer<=0){ e.st=2; e.timer=Math.max(50, Math.floor(80 - prog * 20)); sfx(1600,.4,'sawtooth',.12); } }
        else if(e.st===2){ e.timer--;
          if(p && p.inv<=0 && Math.abs(p.x-e.x)<14 && p.y>e.y) playerHit();
          if(e.timer<=0){ e.st=3; e.timer=60; } }
        else { e.timer--; if(e.timer<=0){ e.st=0; e.timer=Math.max(80, Math.floor(140 - prog * 40)) + Math.random()*80; } }
      } else if(e.type==='swarm'){
        e.x+=Math.sin(e.t*.05)*2; e.y+=e.vy*dm;
        if(NV.empT<=0 && Math.random()<(0.003 + prog * 0.006)*dm) spawnEnemyBullet({x:e.x,y:e.y+8,vx:0,vy:3*bm,kind:'blade',rot:Math.random()*6,spin:.3,t:0});
      } else if(e.type==='convoy'){
        e.y+=e.vy*dm;
        if(NV.empT<=0 && Math.random()<(0.003 + prog * 0.004)*dm){
          for(let k=-1;k<=1;k++) spawnEnemyBullet({x:e.x,y:e.y+10,vx:k*2*bm,vy:3*bm,kind:'blade',rot:0,spin:.2,t:0});
        }
        if(e.hp<=0){ nvBoom(e.x,e.y,1.5,'volatile'); addScore(200,true); NV.enemies.splice(i,1); continue; }
      } else if(e.type==='cruiser'){
        e.x += Math.sin(e.t * 0.02) * 1.3;
        e.y += e.vy * dm;
        e.fireCd--;
        if(e.fireCd <= 0){
          e.fireCd = Math.max(50, Math.floor(85 - prog * 30));
          if(NV.empT<=0){
            spawnEnemyBullet({x:e.x-18, y:e.y+16, vx:-0.3, vy:4*bm, kind:'blade', rot:0, spin:.2, t:0});
            spawnEnemyBullet({x:e.x+18, y:e.y+16, vx:0.3, vy:4*bm, kind:'blade', rot:0, spin:.2, t:0});
            sfx(280, .12, 'sawtooth', .1);
          } else { sparks(e.x, e.y, 4, '#00d4ff'); }
        }
        e.pulseCd--;
        if(e.pulseCd <= 0){
          e.pulseCd = Math.max(110, Math.floor(170 - prog * 40));
          if(NV.empT<=0){
            const pulseRays = r <= 5 ? 4 : (r <= 7 ? 6 : 8);
            for(let k=0; k<pulseRays; k++){
              const an = k * (Math.PI * 2 / pulseRays);
              spawnEnemyBullet({x:e.x, y:e.y+10, vx:Math.cos(an)*3*bm, vy:Math.sin(an)*3*bm, kind:'blade', rot:an, spin:.25, t:0});
            }
            sfx(160, .25, 'triangle', .15);
          }
        }
      } else if(e.type==='shield'){
        e.x += e.vx * 1.1 * dm;
        if(e.x < 60 || e.x > W-60) e.vx *= -1;
        e.y += e.vy * dm;
        e.fireCd--;
        if(e.fireCd <= 0){
          e.fireCd = Math.max(55, Math.floor(90 - prog * 30));
          if(NV.empT<=0){
            const dx=tgt.x-e.x, dy=tgt.y-e.y, dd=Math.hypot(dx,dy)||1;
            if(r <= 3){
              spawnEnemyBullet({x:e.x, y:e.y+10, vx:(dx/dd)*4.2*bm, vy:(dy/dd)*4.2*bm, kind:'dart', rot:Math.atan2(dy,dx), t:0});
            } else {
              spawnEnemyBullet({x:e.x-12, y:e.y+10, vx:(dx/dd)*4.2*bm-0.3, vy:(dy/dd)*4.2*bm, kind:'dart', rot:Math.atan2(dy,dx), t:0});
              spawnEnemyBullet({x:e.x+12, y:e.y+10, vx:(dx/dd)*4.2*bm+0.3, vy:(dy/dd)*4.2*bm, kind:'dart', rot:Math.atan2(dy,dx), t:0});
            }
            sfx(340, .1, 'square', .09);
          } else { sparks(e.x, e.y, 4, '#00d4ff'); }
        }
      } else if(e.type==='spinner'){
        e.x += e.vx * dm;
        if(e.x < 50 || e.x > W-50) e.vx *= -1;
        e.y += e.vy * dm;
        const spinRate = 0.05 + prog * 0.04;
        e.spinAng = (e.spinAng || 0) + spinRate;
        const spinInterval = r <= 4 ? 20 : (r <= 7 ? 16 : 12);
        if(e.t % spinInterval === 0){
          if(NV.empT<=0){
            const a1 = e.spinAng, a2 = e.spinAng + Math.PI;
            spawnEnemyBullet({x:e.x, y:e.y, vx:Math.cos(a1)*3*bm, vy:Math.sin(a1)*3*bm, kind:'blade', rot:a1, spin:.25, t:0});
            spawnEnemyBullet({x:e.x, y:e.y, vx:Math.cos(a2)*3*bm, vy:Math.sin(a2)*3*bm, kind:'blade', rot:a2, spin:.25, t:0});
            if(e.t % (spinInterval * 2) === 0) sfx(440, .06, 'sine', .06);
          } else { sparks(e.x, e.y, 3, '#00d4ff'); }
        }
      } else if(e.type==='quantum'){
        e.warpCd--;
        if(e.warpCd <= 0){
          e.warpCd = Math.max(55, Math.floor(100 - prog * 35) + Math.random() * 30);
          sparks(e.x, e.y, 8, '#38bdf8');
          e.x = Math.max(50, Math.min(W-50, tgt.x + (Math.random() - .5) * 260));
          e.y = Math.max(60, Math.min(H * 0.45, e.y + (Math.random() - .5) * 100));
          sparks(e.x, e.y, 8, '#00d4ff');
          if(NV.empT<=0){
            const dx=tgt.x-e.x, dy=tgt.y-e.y, dd=Math.hypot(dx,dy)||1;
            spawnEnemyBullet({x:e.x, y:e.y+10, vx:(dx/dd)*5.2*bm, vy:(dy/dd)*5.2*bm, kind:'dart', rot:Math.atan2(dy,dx), t:0});
            sfx(900, .1, 'sawtooth', .1);
          } else { sparks(e.x, e.y, 4, '#00d4ff'); }
        } else {
          e.y += e.vy * dm;
          e.x += Math.sin(e.t * 0.04) * 1.5;
        }
      } else if(e.type==='beacon'){
        // BEACON: slow descent, buffs nearby allies' aggression, spiral + radial barrage
        e.y += e.vy * dm; e.x += Math.sin(e.t * 0.03) * 0.9;
        e.fireCd--; e.ringCd--;
        if(e.fireCd <= 0){
          e.fireCd = Math.max(70, Math.floor(110 - prog * 25));
          if(NV.empT<=0 && p && !p.dead){
            const dx=p.x-e.x, dy=p.y-e.y, dd=Math.hypot(dx,dy)||1;
            for(let k=-1;k<=1;k++){
              const sp=4.4*bm;
              spawnEnemyBullet({x:e.x, y:e.y+12, vx:(dx/dd)*sp + k*.5, vy:(dy/dd)*sp, kind:'dart', rot:Math.atan2(dy,dx), t:0});
            }
            sfx(520,.08,'triangle',.08);
          }
        }
        if(e.ringCd <= 0){
          e.ringCd = Math.max(150, Math.floor(220 - prog * 40));
          if(NV.empT<=0){
            const rays = r <= 4 ? 8 : 12;
            const off = e.t * 0.11;
            for(let k=0;k<rays;k++){
              const an = off + k * (Math.PI * 2 / rays);
              spawnEnemyBullet({x:e.x, y:e.y, vx:Math.cos(an)*2.6*bm, vy:Math.sin(an)*2.6*bm, kind:'blade', rot:an, spin:.2, t:0});
            }
            sfx(180,.25,'sine',.12);
          }
        }
        if(e.t % 20 === 0){ NV.rings.push({x:e.x, y:e.y, r:8, max:60}); }
      } else {
        if(e.g && !e.free){
          const tx=e.g.cx+e.dx+Math.sin(e.g.sway)*36, ty=e.g.y+e.dy;
          e.x+=(tx-e.x)*.09; e.y+=(ty-e.y)*.09;
          if(e.g.y>H*.55) e.free=true;
        } else { e.y+=e.vy*dm; e.x+=Math.sin(e.t*e.spd)*1.4*dm; }
        if(e.free && e.y>0 && e.y<H-240 && Math.random()<firer){
          if(NV.empT<=0){
            const n=fan;
            for(let k=0;k<n;k++){
              const an = Math.PI/2 + (n > 1 ? (k-(n-1)/2)*.24 : 0);
              spawnEnemyBullet({x:e.x,y:e.y+12,vx:Math.cos(an)*3.6*bm,vy:Math.sin(an)*3.6*bm,kind:'blade',rot:Math.random()*6,spin:.25,t:0});
            }
            if(r >= 3 && Math.random() < 0.22) spawnEnemyBullet({x:e.x,y:e.y+12,vx:0,vy:2.6*bm,kind:'snake',t:0,baseX:e.x,amp:48,trail:[]});
            sfx(220,.1,'square',.07);
          } else { sparks(e.x, e.y, 3, '#00d4ff'); }
        }
      }
    }
    nvCtx.save(); nvCtx.translate(e.x,e.y);
    if(e.type==='kami'){
      nvCtx.rotate(Math.atan2(e.vy,e.vx)-Math.PI/2);
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      const eg=nvCtx.createRadialGradient(0,-16,0,0,-16,28);
      eg.addColorStop(0,'rgba(255,140,0,.9)'); eg.addColorStop(1,'rgba(0,0,0,0)');
      nvCtx.fillStyle=eg; nvCtx.beginPath(); nvCtx.arc(0,-16,28,0,7); nvCtx.fill();
      nvCtx.fillStyle=(NV.t%4<2)?'#ff9500':'#ffcc00';
      nvCtx.beginPath(); nvCtx.moveTo(-6,-12); nvCtx.lineTo(0,-24-Math.random()*8); nvCtx.lineTo(6,-12); nvCtx.fill();
      nvCtx.restore();
      if(atlasTextures['enemy_kami']) nvCtx.drawImage(atlasTextures['enemy_kami'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'kami');
    } else if(e.type==='camo'){
      const vis = e.st===1 ? (Math.floor(e.t/3)%2? .9:.3) : e.st===2? .95 : e.st===3? .4 : .08;
      nvCtx.globalAlpha=vis;
      if(atlasTextures['enemy_camo']) nvCtx.drawImage(atlasTextures['enemy_camo'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'camo');
      nvCtx.globalAlpha=1;
    } else if(e.type==='swarm'){
      if(atlasTextures['enemy_swarm']) nvCtx.drawImage(atlasTextures['enemy_swarm'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'swarm');
    } else if(e.type==='convoy'){
      if(atlasTextures['enemy_convoy']) nvCtx.drawImage(atlasTextures['enemy_convoy'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'convoy');
    } else if(e.type==='cruiser'){
      if(atlasTextures['enemy_cruiser']) nvCtx.drawImage(atlasTextures['enemy_cruiser'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'cruiser');
      const pulse = 1 + Math.sin(NV.t * 0.15) * 0.2;
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      const rg=nvCtx.createRadialGradient(0,-2,0,0,-2,16*pulse);
      rg.addColorStop(0,'rgba(239,68,68,.9)'); rg.addColorStop(1,'rgba(0,0,0,0)');
      nvCtx.fillStyle=rg; nvCtx.beginPath(); nvCtx.arc(0,-2,16*pulse,0,7); nvCtx.fill(); nvCtx.restore();
      if(e.hp < (e.maxHp||10)){
        nvCtx.shadowBlur=0; nvCtx.fillStyle='rgba(0,0,0,.7)'; nvCtx.fillRect(-24,-34,48,5);
        nvCtx.fillStyle='#ef4444'; nvCtx.fillRect(-23,-33,46*(e.hp/(e.maxHp||10)),3);
      }
    } else if(e.type==='shield'){
      if(atlasTextures['enemy_shield']) nvCtx.drawImage(atlasTextures['enemy_shield'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'shield');
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      nvCtx.strokeStyle='rgba(56,189,248,'+(0.7+Math.sin(NV.t*0.2)*0.25)+')';
      nvCtx.lineWidth=4;
      nvCtx.beginPath(); nvCtx.arc(0,12,28,0.15,Math.PI-0.15); nvCtx.stroke();
      nvCtx.strokeStyle='rgba(255,255,255,0.6)'; nvCtx.lineWidth=1.5;
      nvCtx.beginPath(); nvCtx.arc(0,12,24,0.3,Math.PI-0.3); nvCtx.stroke();
      nvCtx.restore();
    } else if(e.type==='spinner'){
      nvCtx.save();
      nvCtx.rotate(e.spinAng || 0);
      nvCtx.strokeStyle='#a855f7'; nvCtx.lineWidth=2;
      nvCtx.beginPath(); nvCtx.arc(0,0,16,0,7); nvCtx.stroke();
      for(let b=0; b<4; b++){
        nvCtx.rotate(Math.PI/2);
        nvCtx.fillStyle='#c084fc'; nvCtx.fillRect(-3,10,6,12);
        nvCtx.fillStyle='#fff'; nvCtx.fillRect(-1,18,2,4);
      }
      nvCtx.restore();
      nvCtx.save();
      nvCtx.rotate(-(e.spinAng || 0)*1.5);
      nvCtx.strokeStyle='#34d399'; nvCtx.lineWidth=1.5;
      nvCtx.strokeRect(-6,-6,12,12);
      nvCtx.restore();
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      const sg=nvCtx.createRadialGradient(0,0,0,0,0,18);
      sg.addColorStop(0,'rgba(16,185,129,.95)'); sg.addColorStop(1,'rgba(0,0,0,0)');
      nvCtx.fillStyle=sg; nvCtx.beginPath(); nvCtx.arc(0,0,18,0,7); nvCtx.fill(); nvCtx.restore();
      if(atlasTextures['enemy_spinner']) nvCtx.drawImage(atlasTextures['enemy_spinner'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'spinner');
    } else if(e.type==='quantum'){
      // SPLITTER (splitter.svg): pulsing split-preview glow
      nvCtx.save(); nvCtx.rotate(Math.sin(e.t*0.08)*0.35);
      if(atlasTextures['enemy_quantum']) nvCtx.drawImage(atlasTextures['enemy_quantum'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'quantum');
      nvCtx.restore();
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      const qg=nvCtx.createRadialGradient(0,0,0,0,0,26);
      qg.addColorStop(0,'rgba(56,189,248,'+(0.25+Math.sin(e.t*0.15)*0.15)+')'); qg.addColorStop(1,'rgba(0,0,0,0)');
      nvCtx.fillStyle=qg; nvCtx.beginPath(); nvCtx.arc(0,0,26,0,7); nvCtx.fill(); nvCtx.restore();
    } else if(e.type==='beacon'){
      // BEACON (beacon.svg): rotating buffer ring + sprite
      nvCtx.save(); nvCtx.rotate(e.t*0.04);
      if(atlasTextures['enemy_beacon']) nvCtx.drawImage(atlasTextures['enemy_beacon'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'convoy');
      nvCtx.restore();
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      const bg2=nvCtx.createRadialGradient(0,0,6,0,0,34);
      bg2.addColorStop(0,'rgba(251,191,36,.35)'); bg2.addColorStop(1,'rgba(0,0,0,0)');
      nvCtx.fillStyle=bg2; nvCtx.beginPath(); nvCtx.arc(0,0,34,0,7); nvCtx.fill(); nvCtx.restore();
      if(e.hp < (e.maxHp||6)){
        nvCtx.shadowBlur=0; nvCtx.fillStyle='rgba(0,0,0,.7)'; nvCtx.fillRect(-20,-34,40,4);
        nvCtx.fillStyle='#fbbf24'; nvCtx.fillRect(-19,-33,38*(e.hp/(e.maxHp||6)),2);
      }
    } else {
      if(atlasTextures['enemy_hunt']) nvCtx.drawImage(atlasTextures['enemy_hunt'].cv,-45,-45);
      else drawEnemyBaseSprite(nvCtx, 'hunt');
    }
    if(e.flash>0){ nvCtx.globalAlpha=.85; nvCtx.fillStyle='#fff';
      nvCtx.beginPath(); nvCtx.ellipse(0,0,18,12,0,0,7); nvCtx.fill(); nvCtx.globalAlpha=1; }
    nvCtx.shadowBlur=0; nvCtx.restore();
    if(e.type==='camo' && e.st===2 && playing){
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      const jx=(Math.random()-.5)*3;
      let g=nvCtx.createLinearGradient(e.x-22+jx,0,e.x+22+jx,0);
      g.addColorStop(0,'rgba(168,85,247,0)'); g.addColorStop(.5,'rgba(168,85,247,.5)'); g.addColorStop(1,'rgba(168,85,247,0)');
      nvCtx.fillStyle=g; nvCtx.fillRect(e.x-22+jx,e.y,44,H-e.y);
      g=nvCtx.createLinearGradient(e.x-9+jx,0,e.x+9+jx,0);
      g.addColorStop(0,'rgba(220,150,255,0)'); g.addColorStop(.5,'rgba(230,180,255,.9)'); g.addColorStop(1,'rgba(220,150,255,0)');
      nvCtx.fillStyle=g; nvCtx.fillRect(e.x-9+jx,e.y,18,H-e.y);
      nvCtx.fillStyle='#fff'; nvCtx.fillRect(e.x-2.5+jx,e.y,5,H-e.y);
      nvCtx.restore();
    }
    if(playing&&!frozen && !p.dead){
      let died=false;
      querySpatialGrid(e.x, e.y, 28, function(item, type){
        if(died) return true;
        if(type==='bullet'){
          const b=item;
          if(b.active===false) return false;
          const bdx=b.x-e.x, bdy=b.y-e.y;
          if(Math.abs(bdx)<26 && Math.abs(bdy)<26 && (bdx*bdx+bdy*bdy)<676){
            if(b.pierce && b.pierce>1){ b.pierce--; }
            else if(!b.isMaster){ b.active=false; }
            // Check for frontal deflector shield on shield-ship
            if(e.type==='shield' && b.y > e.y - 6 && !b.isMaster){
              sparks(b.x, b.y, 6, '#00d4ff');
              sfx(650, .05, 'triangle', .08);
              return false;
            }
            e.flash=5;
            NV.symphonyCount = (NV.symphonyCount||0) + 1;
            pentatonicNoteSfx(NV.symphonyCount % 5);
            if(NV.symphonyCount % 8 === 0 && NV.player){
              showStatus('🎼 FULL OCTAVE! MASTER FLUTE!');
              spawnPlayerBullet({
                x: NV.player.x, y: NV.player.y - 45,
                vx: 0, vy: -18, rot: 0,
                isMaster: true, pierce: 99
              });
              sfx(880, .3, 'triangle', .2);
            }
            const dmg = (b.isMaster ? 8 : (e.resonated ? 2 : 1)) * (NV.cryoT>0 ? 2 : 1);
            if(e.hp && e.hp > dmg){
              e.hp -= dmg;
              sparks(b.x, b.y, 4, '#fbbf24');
              sfx(400, .06, 'square', .08);
            } else {
              killEnemy(e,i); died=true; return true;
            }
          }
        } else if(type==='missile'){
          const m=item;
          if(m.active===false) return false;
          if(Math.hypot(m.x-e.x,m.y-e.y)<26){
            m.active=false;
            if(e.hp && e.hp > 3){ e.hp-=3; nvBoom(m.x,m.y,.7,'rock'); }
            else { killEnemy(e,i); died=true; return true; }
          }
        }
        return false;
      });
      if(died) continue;
      if(p && p.inv<=0 && !(NV.phaseT>0) && Math.hypot(p.x-e.x,p.y-e.y)<30){ killEnemy(e,i,false); playerHit(); continue; }
      if(NV.phaseT>0 && Math.hypot(p.x-e.x,p.y-e.y)<30){ e.flash=6; killEnemy(e,i); continue; }
      if(e.y>H-24 && e.type!=='kami'){ killEnemy(e,i,false); if(p.inv<=0)playerHit(); continue; }
      if(e.y>H+60){ NV.enemies.splice(i,1); continue; }
    }
  }

  for(let i=NV.asteroids.length-1;i>=0;i--){
    const a=NV.asteroids[i];
    if(playing&&!frozen){ a.x+=a.vx; a.y+=a.vy; a.rot+=a.vr;
      let astDead = false;
      querySpatialGrid(a.x, a.y, a.r + 16, function(item, type){
        if(astDead) return true;
        if(type === 'enemy'){
          const e = item;
          const idx = NV.enemies.indexOf(e);
          if(idx >= 0){
            // El asteroide embiste al enemigo: muere, el asteroide pierde 1 HP y
            // ambos sueltan explosión. La colisión también puntúa.
            killEnemy(e, idx, false);
            a.hp -= 1;
            a.flash = 5;
            addScore(40);
            astHitFeedback(a.x, a.y);
            if(a.hp <= 0){
              astDead = true;
              if(a.vol) detonateAsteroid(a, i);
              else NV.asteroids.splice(i, 1);
              return true;
            }
          }
        }
        return false;
      });
      if(astDead) continue;
    }
    if(NV.asteroids[i]!==a) continue;
    nvCtx.save(); nvCtx.translate(a.x,a.y); nvCtx.rotate(a.rot);
    nvCtx.fillStyle='#8a867a'; nvCtx.strokeStyle='#55504a'; nvCtx.lineWidth=2;
    nvCtx.beginPath();
    a.verts.forEach(function(v,k){ const an=k/9*6.28,px=Math.cos(an)*a.r*v,py=Math.sin(an)*a.r*v; k?nvCtx.lineTo(px,py):nvCtx.moveTo(px,py); });
    nvCtx.closePath(); nvCtx.fill(); nvCtx.stroke();
    if(a.vol){ const pulse=(Math.sin(NV.t*.25)+1)/2;
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      nvCtx.fillStyle='rgba(255,45,60,'+(.35+pulse*.55)+')';
      nvCtx.beginPath(); nvCtx.arc(0,0,a.r*.42,0,7); nvCtx.fill(); nvCtx.restore(); }
    else { nvCtx.fillStyle='#6b665c'; nvCtx.beginPath(); nvCtx.arc(-a.r*.3,-a.r*.2,a.r*.22,0,7); nvCtx.fill(); }
    if(a.flash>0){ a.flash--; nvCtx.globalAlpha=.8; nvCtx.fillStyle='#fff';
      nvCtx.beginPath(); nvCtx.arc(0,0,a.r,0,7); nvCtx.fill(); nvCtx.globalAlpha=1; }
    nvCtx.restore();
    if(playing&&!frozen){
      let dead=false;
      querySpatialGrid(a.x, a.y, a.r+6, function(item, type){
        if(dead) return true;
        if(type==='bullet'){
          const b=item;
          if(b.active===false) return false;
          const bdx=b.x-a.x, bdy=b.y-a.y;
          if(Math.abs(bdx)<a.r+6 && Math.abs(bdy)<a.r+6 && (bdx*bdx+bdy*bdy)<a.r*a.r){
            b.active=false; a.hp--; a.flash=4; sparks(b.x,b.y,4,'#fbbf24');
            if(a.hp<=0){
              if(a.vol) detonateAsteroid(a,i);
              else {
                nvBoom(a.x,a.y,1,'rock'); nvDebris(a.x,a.y,2); addScore(50);
                if(a.r>22) for(let k=0;k<2;k++) NV.asteroids.push({x:a.x,y:a.y,vx:a.vx+(Math.random()-.5)*2,vy:a.vy*.9,r:a.r*.5,rot:0,vr:(Math.random()-.5)*.12,hp:1,vol:false,verts:a.verts});
                NV.asteroids.splice(i,1);
              }
              dead=true; return true;
            }
          }
        }
        return false;
      });
      if(dead)continue;
      if(p&&p.inv<=0&&!(NV.phaseT>0)&&Math.hypot(p.x-a.x,p.y-a.y)<a.r+16){ nvBoom(a.x,a.y,1.2,'rock'); NV.asteroids.splice(i,1); playerHit(); continue; }
      if(a.y>H+80||a.x<-120||a.x>W+120)NV.asteroids.splice(i,1);
    }
  }

  if(NV.boss){
    const B=NV.boss;
    if(playing&&!frozen && !p.dead){
      if(B.entering){ B.y+=2.2; if(B.y>=(B.type==='ac'?130:120))B.entering=false; }
      else {
        B.x+=B.dir*1.1*dm; if(B.x<170||B.x>W-170)B.dir*=-1;
        const hpPct=B.core/B.coreMax;
        if(hpPct<.3) B.phase=3; else if(hpPct<.6) B.phase=2; else B.phase=1;
        B.fireCd--;
        if(B.fireCd<=0){
          if(B.type==='ac'){
            if(B.phase===1){
              B.fireCd=Math.max(40,80-10*dm);
              const n=Math.min(6, fan + 1); for(let k=0;k<n;k++){ const an=Math.PI/2+(k-(n-1)/2)*.24;
                spawnEnemyBullet({x:B.x,y:B.y+52,vx:Math.cos(an)*3.8*bm,vy:Math.sin(an)*3.8*bm,kind:'blade',rot:Math.random()*6,spin:.25,t:0}); }
            } else if(B.phase===2){
              B.fireCd=20;
              const an=(NV.t*.05)%(Math.PI*2);
              spawnEnemyBullet({x:B.x,y:B.y+52,vx:Math.cos(an)*4*bm,vy:Math.sin(an)*4*bm,kind:'blade',rot:an,spin:0,t:0});
            } else {
              B.fireCd=10;
              for(let k=0;k<3;k++){ const an=Math.random()*Math.PI*2;
                spawnEnemyBullet({x:B.x,y:B.y+52,vx:Math.cos(an)*5*bm,vy:Math.sin(an)*5*bm,kind:'blade',rot:an,spin:.4,t:0}); }
              if(NV.t%60===0){ for(let k=0;k<8;k++){ const an=k*Math.PI/4;
                spawnEnemyBullet({x:B.x,y:B.y+52,vx:Math.cos(an)*3*bm,vy:Math.sin(an)*3*bm,kind:'blade',rot:an,spin:0,t:0}); } }
            }
          } else {
            B.belts.forEach(function(bl){ bl.anim+=2.4;
              if(bl.hp>0){ B.droneCd--; if(B.droneCd<=0){ B.droneCd=Math.max(50,120-14*dm);
                NV.enemies.push({type:'kami',x:B.x+bl.off,y:B.y+62,vx:0,vy:2,t:0,flash:0,burst:false}); sfx(300,.1,'square',.08); } } });
            if(B.phase===1){
              B.fireCd=Math.max(50,100-12*dm);
              const dx=p.x-B.x,dy=p.y-B.y,dd=Math.hypot(dx,dy)||1;
              spawnEnemyBullet({x:B.x-44,y:B.y+52,vx:dx/dd*5*bm,vy:dy/dd*5*bm,kind:'dart',rot:Math.atan2(dy,dx),t:0});
              spawnEnemyBullet({x:B.x+44,y:B.y+52,vx:dx/dd*5*bm,vy:dy/dd*5*bm,kind:'dart',rot:Math.atan2(dy,dx),t:0});
            } else if(B.phase===2){
              B.fireCd=30;
              const an=(NV.t*.04)%(Math.PI*2);
              spawnEnemyBullet({x:B.x,y:B.y+52,vx:Math.cos(an)*4*bm,vy:Math.sin(an)*4*bm,kind:'blade',rot:an,spin:0,t:0});
            } else {
              B.fireCd=15;
              for(let k=0;k<4;k++){ const an=Math.random()*Math.PI*2;
                spawnEnemyBullet({x:B.x,y:B.y+52,vx:Math.cos(an)*5*bm,vy:Math.sin(an)*5*bm,kind:'blade',rot:an,spin:.4,t:0}); }
            }
          }
          sfx(200,.15,'square',.1);
        }
      }
      querySpatialGrid(B.x, B.y+40, 180, function(item, type){
        if(!NV.boss) return true;
        if(type !== 'bullet') return false;
        const b = item;
        if(b.active === false) return false;
        let hit=false;
        if(B.type==='ac'){
          for(let q=0;q<B.plates.length;q++){ const pl=B.plates[q];
            if(pl.hp>0 && Math.abs(b.x-(B.x+pl.off))<30 && Math.abs(b.y-(B.y+46))<16){
              pl.hp--; hit=true; sparks(b.x,b.y,5,'#fbbf24');
              if(pl.hp<=0){ nvBoom(B.x+pl.off,B.y+46,1.2,'rock'); NV.freeze=Math.max(NV.freeze,4); addScore(300,true); }
              break; } }
          if(!hit && !B.plates.some(function(pl){return pl.hp>0;}) && Math.hypot(b.x-B.x,b.y-B.y)<42){
            B.core--; hit=true; sparks(b.x,b.y,4,'#0ff');
            if(B.core<=0){ nvBoom(B.x,B.y,2.6,'volatile'); nvDebris(B.x,B.y,6); addScore(2500,true); NV.freeze=8;
              NV.rings.push({x:B.x,y:B.y,r:10,max:280}); NV.boss=null;
              document.getElementById('nvBossWrap').classList.remove('show'); sfx(50,1.2,'sawtooth',.3);
              if(NV.lives<5){ NV.lives++; renderHearts(); showLifeBonus(); }
              return true;
            } }
        } else {
          for(let q=0;q<B.belts.length;q++){ const bl=B.belts[q];
            if(bl.hp>0 && Math.abs(b.x-(B.x+bl.off))<40 && Math.abs(b.y-(B.y+52))<16){
              bl.hp--; hit=true; sparks(b.x,b.y,5,'#fbbf24');
              if(bl.hp<=0){ nvBoom(B.x+bl.off,B.y+52,1.4,'rock'); NV.freeze=Math.max(NV.freeze,4); addScore(400,true); }
              break; } }
          if(!hit && !B.belts.some(function(bl){return bl.hp>0;}) && Math.hypot(b.x-B.x,b.y-B.y)<48){
            B.core--; hit=true; sparks(b.x,b.y,4,'#0ff');
            if(B.core<=0){ nvBoom(B.x,B.y,2.8,'volatile'); nvDebris(B.x,B.y,7); addScore(3000,true); NV.freeze=8;
              NV.rings.push({x:B.x,y:B.y,r:10,max:320}); NV.boss=null;
              document.getElementById('nvBossWrap').classList.remove('show'); sfx(45,1.4,'sawtooth',.3);
              if(NV.lives<5){ NV.lives++; renderHearts(); showLifeBonus(); }
              return true;
            } }
        }
        if(hit) b.active=false;
        return false;
      });
      if(NV.boss && p && p.inv<=0 && !(NV.phaseT>0) && Math.hypot(p.x-B.x,p.y-B.y)<74) playerHit();
      if(NV.boss) document.getElementById('nvBossFill').style.width = Math.max(B.core/B.coreMax*100,0)+'%';
    }
    if(NV.boss){
      nvCtx.save(); nvCtx.translate(B.x,B.y);
      // Flagship hull from assets/enemies/boss.svg (atlas pre-rendered)
      if(atlasTextures['enemy_boss']){
        const bs = B.type==='ac' ? 240 : 320;
        nvCtx.globalAlpha = .9;
        nvCtx.drawImage(atlasTextures['enemy_boss'].cv, -bs/2, -bs/2 + 10, bs, bs);
        nvCtx.globalAlpha = 1;
      }
      if(B.type==='ac'){
        nvCtx.fillStyle='#2b3a55'; nvCtx.strokeStyle='#0f1a2e'; nvCtx.lineWidth=3;
        nvCtx.beginPath(); nvCtx.moveTo(-136,-32); nvCtx.lineTo(136,-32); nvCtx.lineTo(94,42); nvCtx.lineTo(-94,42); nvCtx.closePath(); nvCtx.fill(); nvCtx.stroke();
        nvCtx.fillStyle='#1a2436'; nvCtx.fillRect(-114,-50,228,18);
        B.plates.forEach(function(pl){ if(pl.hp>0){ const k=pl.hp/pl.max;
          nvCtx.fillStyle='rgb('+Math.floor(120+80*k)+','+Math.floor(90+60*k)+',60)';
          nvCtx.strokeStyle='#5a4a2a'; nvCtx.lineWidth=2;
          nvCtx.fillRect(pl.off-29,34,58,25); nvCtx.strokeRect(pl.off-29,34,58,25);
          nvCtx.fillStyle='rgba(0,0,0,.3)'; nvCtx.fillRect(pl.off-29,34+25*k,58,25*(1-k)); } });
        const open=!B.plates.some(function(pl){return pl.hp>0;});
        nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
        const g=nvCtx.createRadialGradient(0,12,0,0,12,open?70:30);
        g.addColorStop(0,'rgba(0,255,255,'+(open?.6:.25)+')'); g.addColorStop(1,'rgba(0,0,0,0)');
        nvCtx.fillStyle=g; nvCtx.beginPath(); nvCtx.arc(0,12,open?70:30,0,7); nvCtx.fill(); nvCtx.restore();
        nvCtx.beginPath(); nvCtx.arc(0,12,open?27:18,0,7);
        nvCtx.fillStyle=open?'#00ffff':'#0a2a3a'; nvCtx.fill();
        if(open){ nvCtx.fillStyle='#fff'; nvCtx.beginPath(); nvCtx.arc(0,12,10+Math.sin(NV.t*.3)*3,0,7); nvCtx.fill(); }
      } else {
        nvCtx.fillStyle='#3a3325'; nvCtx.strokeStyle='#191510'; nvCtx.lineWidth=3;
        nvCtx.fillRect(-176,-42,352,84); nvCtx.strokeRect(-176,-42,352,84);
        nvCtx.fillStyle='#241f14'; nvCtx.fillRect(-176,-60,352,18);
        B.belts.forEach(function(bl){
          nvCtx.fillStyle= bl.hp>0?'#5a4a2a':'#241f14';
          nvCtx.fillRect(bl.off-42,42,84,25);
          if(bl.hp>0){ nvCtx.save(); nvCtx.beginPath(); nvCtx.rect(bl.off-42,42,84,25); nvCtx.clip();
            nvCtx.fillStyle='#8a7a4a';
            for(let s2=-1;s2<7;s2++){ const xx=bl.off-42+((bl.anim+s2*16)%100);
              nvCtx.fillRect(xx,46,8,17); }
            nvCtx.restore();
            nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
            nvCtx.fillStyle='#ff9500'; nvCtx.shadowColor='#ff9500'; nvCtx.shadowBlur=12;
            nvCtx.fillRect(bl.off-6,60,12,10); nvCtx.restore(); }
          else { nvCtx.fillStyle='#111'; nvCtx.fillRect(bl.off-42,42,84,25);
            nvCtx.strokeStyle='#ff2d55'; nvCtx.beginPath(); nvCtx.moveTo(bl.off-32,46); nvCtx.lineTo(bl.off+32,63); nvCtx.moveTo(bl.off+32,44); nvCtx.lineTo(bl.off-32,63); nvCtx.stroke(); } });
        const open=!B.belts.some(function(bl){return bl.hp>0;});
        nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
        const g2=nvCtx.createRadialGradient(0,8,0,0,8,open?80:32);
        g2.addColorStop(0,'rgba(255,150,0,'+(open?.6:.25)+')'); g2.addColorStop(1,'rgba(0,0,0,0)');
        nvCtx.fillStyle=g2; nvCtx.beginPath(); nvCtx.arc(0,8,open?80:32,0,7); nvCtx.fill(); nvCtx.restore();
        nvCtx.beginPath(); nvCtx.arc(0,8,open?31:20,0,7);
        nvCtx.fillStyle=open?'#ff9500':'#191510'; nvCtx.fill();
        nvCtx.strokeStyle='#6b5a3a'; nvCtx.lineWidth=5;
        const arm=Math.sin(NV.t*.1)*10;
        nvCtx.beginPath(); nvCtx.moveTo(-146,-42); nvCtx.lineTo(-156,-10+arm); nvCtx.moveTo(146,-42); nvCtx.lineTo(156,-10-arm); nvCtx.stroke();
      }
      nvCtx.restore();
    }
  }
  function damageBoss(n,x,y){ const B=NV.boss; if(!B)return;
    NV.freeze = Math.max(NV.freeze, 2);
    if(B.type==='ac'){ if(B.plates.some(function(pl){return pl.hp>0;})){ B.plates.forEach(function(pl){ if(pl.hp>0&&Math.abs(B.x+pl.off-x)<34){ pl.hp-=n; if(pl.hp<=0)nvBoom(B.x+pl.off,B.y+46,1.2,'rock'); } }); }
      else { B.core-=n; if(B.core<=0){ nvBoom(B.x,B.y,2.6,'volatile'); NV.boss=null; addScore(2500,true); document.getElementById('nvBossWrap').classList.remove('show'); if(NV.lives<5){ NV.lives++; renderHearts(); showLifeBonus(); } } } }
    else { if(B.belts.some(function(bl){return bl.hp>0;})){ B.belts.forEach(function(bl){ if(bl.hp>0&&Math.abs(B.x+bl.off-x)<44){ bl.hp-=n; if(bl.hp<=0)nvBoom(B.x+bl.off,B.y+52,1.3,'rock'); } }); }
      else { B.core-=n; if(B.core<=0){ nvBoom(B.x,B.y,2.8,'volatile'); NV.boss=null; addScore(3000,true); document.getElementById('nvBossWrap').classList.remove('show'); if(NV.lives<5){ NV.lives++; renderHearts(); showLifeBonus(); } } } }
  }

  let ebw = 0;
  for(let i = 0; i < NV.ebullets.length; i++){
    const b = NV.ebullets[i];
    if(b.active === false) continue;
    if(playing && !frozen){
      b.t++;
      if(b.kind === 'snake'){
        b.y += b.vy; b.x = b.baseX + Math.sin(b.t * .12) * b.amp;
        b.trail = b.trail || []; b.trail.push({x:b.x, y:b.y});
        if(b.trail.length > 9) b.trail.shift();
      } else {
        b.x += b.vx || 0; b.y += b.vy;
        if(b.kind === 'blade') b.rot += b.spin;
      }
    }
    if(b.kind === 'blade'){
      const tex = atlasTextures['ebullet_blade'];
      if(tex){
        nvCtx.save(); nvCtx.translate(b.x,b.y); nvCtx.rotate(b.rot||0);
        nvCtx.drawImage(tex.cv, -tex.w/2, -tex.h/2);
        nvCtx.restore();
      } else {
        nvCtx.save(); nvCtx.translate(b.x,b.y); nvCtx.rotate(b.rot||0);
        nvCtx.fillStyle='#ff2d95';
        nvCtx.beginPath();
        for(let k=0;k<4;k++){ const an=k*Math.PI/2;
          nvCtx.moveTo(0,0); nvCtx.lineTo(Math.cos(an-.35)*10,Math.sin(an-.35)*10);
          nvCtx.lineTo(Math.cos(an)*15,Math.sin(an)*15); nvCtx.lineTo(Math.cos(an+.35)*10,Math.sin(an+.35)*10); }
        nvCtx.fill();
        nvCtx.fillStyle='#fff'; nvCtx.beginPath(); nvCtx.arc(0,0,4,0,7); nvCtx.fill();
        nvCtx.restore();
      }
    } else if(b.kind === 'snake'){
      nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      if(b.trail) b.trail.forEach(function(tp,idx){ const a=(idx+1)/b.trail.length*.4;
        nvCtx.fillStyle='rgba(124,187,0,'+a+')';
        nvCtx.beginPath(); nvCtx.arc(tp.x,tp.y,3+idx*.6,0,7); nvCtx.fill(); });
      nvCtx.fillStyle='#7cbb00';
      nvCtx.beginPath(); nvCtx.arc(b.x,b.y,5.5,0,7); nvCtx.fill();
      nvCtx.fillStyle='#eaffd0'; nvCtx.beginPath(); nvCtx.arc(b.x,b.y,2.5,0,7); nvCtx.fill();
      nvCtx.restore();
    } else if(b.kind === 'dart'){
      const tex = atlasTextures['ebullet_dart'];
      if(tex){
        nvCtx.save(); nvCtx.translate(b.x,b.y); nvCtx.rotate(b.rot||Math.PI/2);
        nvCtx.drawImage(tex.cv, -tex.w/2, -tex.h/2);
        nvCtx.restore();
      } else {
        nvCtx.save(); nvCtx.translate(b.x,b.y); nvCtx.rotate(b.rot||Math.PI/2);
        nvCtx.fillStyle='#ff9500';
        nvCtx.beginPath(); nvCtx.moveTo(0,12); nvCtx.lineTo(3.5,-8); nvCtx.lineTo(0,-4); nvCtx.lineTo(-3.5,-8); nvCtx.closePath(); nvCtx.fill();
        nvCtx.fillStyle='#fff'; nvCtx.beginPath(); nvCtx.moveTo(0,10); nvCtx.lineTo(1.5,2); nvCtx.lineTo(-1.5,2); nvCtx.closePath(); nvCtx.fill();
        nvCtx.restore();
      }
    } else {
      const tex = atlasTextures['ebullet_normal'];
      if(tex){
        nvCtx.drawImage(tex.cv, b.x - tex.w/2, b.y - tex.h/2);
      } else {
        nvCtx.fillStyle='#ff2d55'; nvCtx.beginPath(); nvCtx.arc(b.x,b.y,4,0,7); nvCtx.fill();
      }
    }
    let keep = true;
    if(playing && !frozen && p && NV.usdcActive > 0 && Math.hypot(p.x - b.x, p.y - b.y) < 44){
      sparks(b.x, b.y, 6, '#fbbf24');
      addScore(50);
      sfx(950, .08, 'sine', .08);
      keep = false;
    } else if(playing && !frozen && p && p.inv <= 0 && !(NV.phaseT > 0) && Math.hypot(p.x - b.x, p.y - b.y) < 18){
      playerHit();
      keep = false;
    } else if(NV.magnetT > 0 && Math.hypot(p.x - b.x, p.y - b.y) < 60){
      spawnPlayerBullet({x: b.x, y: b.y, vy: -10, vx: 0});
      addScore(5);
      keep = false;
    }
    if(keep && b.y < H + 10 && b.x > -30 && b.x < W + 30){
      NV.ebullets[ebw++] = b;
    } else {
      b.active = false;
    }
  }
  NV.ebullets.length = ebw;

  NV.pows=NV.pows.filter(function(pw){
    if(playing&&!frozen){ pw.y+=pw.vy;
      if(NV.magnetT>0){ const dx=p.x-pw.x, dy=p.y-pw.y, dd=Math.hypot(dx,dy);
        if(dd<220){ pw.x+=dx/dd*5; pw.y+=dy/dd*5; } } }
    const col= powerUpColor(pw.type);
    const pulse=1+Math.sin(NV.t*.2)*.12;
    const rot = (NV.t * 0.04) % (Math.PI * 2);
    nvCtx.save(); nvCtx.translate(pw.x,pw.y); nvCtx.scale(pulse*1.45,pulse*1.45);

    // Glowing halo
    nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
    const g=nvCtx.createRadialGradient(0,0,0,0,0,32);
    g.addColorStop(0, col+'99'); g.addColorStop(1,'rgba(0,0,0,0)');
    nvCtx.fillStyle=g; nvCtx.beginPath(); nvCtx.arc(0,0,32,0,Math.PI*2); nvCtx.fill(); nvCtx.restore();

    // Outer rotating energy orbit rings (Circular design, ~44px)
    nvCtx.save(); nvCtx.rotate(rot);
    nvCtx.strokeStyle=col; nvCtx.lineWidth=2;
    nvCtx.beginPath(); nvCtx.arc(0,0,22,0,Math.PI*2); nvCtx.stroke();
    // Orbiting mini spark
    nvCtx.fillStyle='#fff'; nvCtx.beginPath(); nvCtx.arc(22,0,2.5,0,Math.PI*2); nvCtx.fill();
    nvCtx.restore();

    // Inner circular disc
    nvCtx.save();
    nvCtx.beginPath(); nvCtx.arc(0,0,20,0,Math.PI*2); nvCtx.clip();

    if(pw.type==='usdc' && itemUsdcImg.complete && itemUsdcImg.naturalWidth>0){
      nvCtx.drawImage(itemUsdcImg, -20, -20, 40, 40);
    } else if(pw.type==='circle' && itemCircleImg.complete && itemCircleImg.naturalWidth>0){
      nvCtx.drawImage(itemCircleImg, -20, -20, 40, 40);
    } else if(pw.type==='piper' && itemPiperImg.complete && itemPiperImg.naturalWidth>0){
      nvCtx.drawImage(itemPiperImg, -20, -20, 40, 40);
    } else {
      // Non-logo circular energy orbs
      nvCtx.fillStyle='#0f172a';
      nvCtx.fillRect(-20,-20,40,40);
      const bgGrad = nvCtx.createRadialGradient(0,0,0,0,0,20);
      bgGrad.addColorStop(0, col); bgGrad.addColorStop(1, '#050814');
      nvCtx.fillStyle=bgGrad; nvCtx.beginPath(); nvCtx.arc(0,0,20,0,Math.PI*2); nvCtx.fill();
      nvCtx.fillStyle='#fff'; nvCtx.font='bold 20px sans-serif'; nvCtx.textAlign='center';
      nvCtx.textBaseline='middle';
      nvCtx.fillText(powerUpIcon(pw.type), 0, 1);
    }
    nvCtx.restore();

    // Gloss sheen reflection across the circular glass token
    nvCtx.save();
    nvCtx.strokeStyle='rgba(255,255,255,0.7)';
    nvCtx.lineWidth=1.5;
    nvCtx.beginPath();
    nvCtx.arc(0, 0, 19, -Math.PI*0.75, -Math.PI*0.25);
    nvCtx.stroke();
    nvCtx.restore();

    nvCtx.restore();

    if(playing&&p&&Math.hypot(p.x-pw.x,p.y-pw.y)<48){
      applyPowerUp(pw.type);
      powerSfx(); NV.rings.push({x:pw.x,y:pw.y,r:6,max:55}); return false; }
    return pw.y<H+30; });

  if(playing && !p.dead){
    p.ghosts.forEach(function(g){
      nvCtx.save();
      nvCtx.globalAlpha=g.l/12*.45;
      if(arcShipImg.complete && arcShipImg.naturalWidth > 0){
        nvCtx.drawImage(arcShipImg, g.x-35, g.y-37, 70, 70);
      } else {
        nvCtx.fillStyle='#00d4ff'; nvCtx.beginPath();
        nvCtx.arc(g.x, g.y, 28, 0, 7); nvCtx.fill();
      }
      nvCtx.restore();
    });
    if(!(p.inv>0 && Math.floor(NV.t/4)%2===0)){
      if(NV.muzzle>0){ nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
        const g=nvCtx.createRadialGradient(p.x,p.y-26,0,p.x,p.y-26,120);
        g.addColorStop(0,'rgba(0,255,255,.4)'); g.addColorStop(1,'rgba(0,0,0,0)');
        nvCtx.fillStyle=g; nvCtx.beginPath(); nvCtx.arc(p.x,p.y-26,120,0,7); nvCtx.fill(); nvCtx.restore(); }
      drawShip(p.x,p.y,p.ax,p.dashT>0);
    }
    if(NV.laserFlash>0){ nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      const a=NV.laserFlash/14;
      nvCtx.fillStyle='rgba(0,255,255,'+(a*.8)+')'; nvCtx.fillRect(p.x-8,0,16,p.y-24);
      nvCtx.fillStyle='rgba(255,255,255,'+(a)+')'; nvCtx.fillRect(p.x-2.5,0,5,p.y-24);
      nvCtx.restore(); }
    if(NV.overdriveT>0 && NV.t%4===0){ nvCtx.save(); nvCtx.globalAlpha=.3; nvCtx.fillStyle='#fbbf24'; nvCtx.fillRect(0,0,W,H); nvCtx.restore(); }
    if(NV.cryoT>0 && NV.t%6===0){ nvCtx.save(); nvCtx.globalAlpha=.15; nvCtx.fillStyle='#00ffff'; nvCtx.fillRect(0,0,W,H); nvCtx.restore(); }
    if(NV.phaseT>0 && NV.t%8===0){ nvCtx.save(); nvCtx.globalAlpha=.2; nvCtx.fillStyle='#ff00ff'; nvCtx.fillRect(0,0,W,H); nvCtx.restore(); }
    document.getElementById('nvScore').textContent=NV.score;
    if(NV.t%10===0) renderModules();
  }

  for(let i=0;i<MAX_PARTS;i++){
    const pt=partsPool[i];
    if(!pt.active) continue;
    if(!frozen){ pt.x+=(pt.vx||0)*dtScale; pt.y+=(pt.vy||0)*dtScale;
      if(pt.kind==='spark'){ pt.vy+=.25*dtScale; }
      if(pt.kind==='smoke'){ pt.r+=.5*dtScale; }
      if(pt.kind==='note'){ pt.vy*=.96; pt.vx+=(Math.random()-.5)*.18; }
      pt.l-=dtScale; }
    if(pt.l<=0){ pt.active=false; continue; }
    if(pt.kind==='core'){ nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      nvCtx.fillStyle='rgba(255,255,255,'+(pt.l/pt.maxL)+')';
      nvCtx.beginPath(); nvCtx.arc(pt.x,pt.y,pt.r*(1.4-pt.l/pt.maxL),0,7); nvCtx.fill(); nvCtx.restore(); }
    else if(pt.kind==='fire'){ nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
      nvCtx.fillStyle=pt.col; nvCtx.globalAlpha=pt.l/pt.maxL;
      nvCtx.beginPath(); nvCtx.arc(pt.x,pt.y,pt.r*(pt.l/pt.maxL+.3),0,7); nvCtx.fill(); nvCtx.restore(); }
    else if(pt.kind==='smoke'){ nvCtx.fillStyle='rgba(90,90,90,'+(pt.l/pt.maxL*.5)+')';
      nvCtx.beginPath(); nvCtx.arc(pt.x,pt.y,pt.r,0,7); nvCtx.fill(); }
    else if(pt.kind==='spark'){ nvCtx.strokeStyle=pt.col; nvCtx.globalAlpha=pt.l/pt.maxL;
      nvCtx.beginPath(); nvCtx.moveTo(pt.x,pt.y); nvCtx.lineTo(pt.x-pt.vx*2,pt.y-pt.vy*2); nvCtx.stroke(); nvCtx.globalAlpha=1; }
    else if(pt.kind==='note'){
      nvCtx.save();
      nvCtx.globalAlpha=(pt.l/pt.maxL)*.95;
      nvCtx.fillStyle=pt.col||'#00d4ff';
      nvCtx.font='bold 15px Tahoma,sans-serif';
      nvCtx.textAlign='center';
      nvCtx.fillText(pt.char||'♪', pt.x, pt.y);
      nvCtx.restore();
    }
  }
  NV.rings=NV.rings.filter(function(r){ if(!frozen)r.r+= (r.max-r.r)*.12+2;
    nvCtx.strokeStyle='rgba(255,255,255,'+Math.max(1-r.r/r.max,0)+')'; nvCtx.lineWidth=3;
    nvCtx.beginPath(); nvCtx.arc(r.x,r.y,r.r,0,7); nvCtx.stroke(); return r.r<r.max; });

  if(NV.bombT>0){
    const sweepY=(1-NV.bombT/70)*H;
    nvCtx.fillStyle='rgba(0,0,0,.55)'; nvCtx.fillRect(0,0,W,H);
    nvCtx.strokeStyle='rgba(0,255,65,.28)'; nvCtx.lineWidth=1;
    for(let x=0;x<W;x+=44){ nvCtx.beginPath(); nvCtx.moveTo(x,0); nvCtx.lineTo(x,H); nvCtx.stroke(); }
    for(let y=0;y<H;y+=44){ nvCtx.beginPath(); nvCtx.moveTo(0,y); nvCtx.lineTo(W,y); nvCtx.stroke(); }
    nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
    nvCtx.fillStyle='rgba(0,255,65,.85)'; nvCtx.shadowColor='#0f0'; nvCtx.shadowBlur=30;
    nvCtx.fillRect(0,sweepY-3,W,6); nvCtx.restore();
    nvCtx.font='20px VT323'; nvCtx.fillStyle='#0f0'; nvCtx.textAlign='center';
    nvCtx.fillText('VIRUS BOMB // PURGING SYSTEM...', W/2, sweepY-14);
  }

  if(NV.shake>=0&&NV.shake>0)nvCtx.restore();

  if(NV.glitch>0){
    NV.glitch--;
    for(let i=0;i<3;i++){
      const sy=Math.random()*H, h=6+Math.random()*22, dx=(Math.random()-.5)*36;
      nvCtx.drawImage(nvCv,0,sy,W,h,dx,sy,W,h);
    }
    nvCtx.save(); nvCtx.globalCompositeOperation='lighter'; nvCtx.globalAlpha=.1;
    nvCtx.fillStyle='#f00'; nvCtx.fillRect(3,0,W,H);
    nvCtx.fillStyle='#00f'; nvCtx.fillRect(-3,0,W,H);
    nvCtx.restore();
  }
}
function drawShip(x,y,ax,dashing){
  nvCtx.save(); nvCtx.translate(x,y); nvCtx.rotate(-ax*.14);
  nvCtx.scale(1.28,1.28); // Bigger player ship

  // Dual plasma thruster halos at the bottom legs of the Arc logo (x = -17 and x = +18)
  nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
  const egLeft=nvCtx.createRadialGradient(-17,20,0,-17,20,34);
  egLeft.addColorStop(0,'rgba(0,212,255,.8)'); egLeft.addColorStop(1,'rgba(0,0,0,0)');
  nvCtx.fillStyle=egLeft; nvCtx.beginPath(); nvCtx.arc(-17,20,34,0,7); nvCtx.fill();

  const egRight=nvCtx.createRadialGradient(18,20,0,18,20,34);
  egRight.addColorStop(0,'rgba(0,212,255,.8)'); egRight.addColorStop(1,'rgba(0,0,0,0)');
  nvCtx.fillStyle=egRight; nvCtx.beginPath(); nvCtx.arc(18,20,34,0,7); nvCtx.fill();
  nvCtx.restore();

  // Dual thruster flames from both legs (enlarged)
  const fCol = (NV.t%6<3)?'#00d4ff':'#aefcff';
  const fCore = (NV.t%6<3)?'#ffffff':'#7cbb00';
  // Left leg flame
  nvCtx.fillStyle=fCol;
  nvCtx.beginPath();
  nvCtx.moveTo(-20-ax*1.5, 19);
  nvCtx.lineTo(-17-ax*3, 33+Math.random()*10);
  nvCtx.lineTo(-14-ax*1.5, 19);
  nvCtx.closePath(); nvCtx.fill();
  nvCtx.fillStyle=fCore;
  nvCtx.beginPath();
  nvCtx.moveTo(-19-ax, 19);
  nvCtx.lineTo(-17-ax*2, 27+Math.random()*5);
  nvCtx.lineTo(-15-ax, 19);
  nvCtx.closePath(); nvCtx.fill();

  // Right leg flame
  nvCtx.fillStyle=fCol;
  nvCtx.beginPath();
  nvCtx.moveTo(15-ax*1.5, 19);
  nvCtx.lineTo(18-ax*3, 33+Math.random()*10);
  nvCtx.lineTo(21-ax*1.5, 19);
  nvCtx.closePath(); nvCtx.fill();
  nvCtx.fillStyle=fCore;
  nvCtx.beginPath();
  nvCtx.moveTo(16-ax, 19);
  nvCtx.lineTo(18-ax*2, 27+Math.random()*5);
  nvCtx.lineTo(20-ax, 19);
  nvCtx.closePath(); nvCtx.fill();

  // Shield aura when active
  if(NV.player&&NV.player.shield>0){
    nvCtx.strokeStyle='rgba(0,212,255,.85)'; nvCtx.lineWidth=3;
    nvCtx.beginPath(); nvCtx.arc(0,-2,40,0,7); nvCtx.stroke();
  }
  // USDC Liquid Staking Shield aura
  if(NV.usdcActive>0){
    nvCtx.save();
    nvCtx.strokeStyle='rgba(39,117,202,.9)'; nvCtx.lineWidth=2.5;
    nvCtx.beginPath(); nvCtx.arc(0,-2,44,0,7); nvCtx.stroke();
    const uAng=(NV.t*0.08)%(Math.PI*2);
    nvCtx.fillStyle='#fbbf24';
    nvCtx.beginPath(); nvCtx.arc(Math.cos(uAng)*44, -2+Math.sin(uAng)*44, 4, 0, 7); nvCtx.fill();
    nvCtx.restore();
  }

  // Cyan ambient core aura
  nvCtx.save(); nvCtx.globalCompositeOperation='lighter';
  const bg=nvCtx.createRadialGradient(0,-4,0,0,-4,44);
  bg.addColorStop(0,'rgba(0,212,255,.45)'); bg.addColorStop(1,'rgba(0,0,0,0)');
  nvCtx.fillStyle=bg; nvCtx.beginPath(); nvCtx.arc(0,-4,44,0,7); nvCtx.fill();
  nvCtx.restore();

  // Draw Arc Logo Ship Sprite (70x70)
  if(arcShipImg.complete && arcShipImg.naturalWidth > 0){
    nvCtx.save();
    nvCtx.drawImage(arcShipImg, -35, -37, 70, 70);
    nvCtx.restore();
  } else {
    // Vector fallback for Arc arch
    nvCtx.save();
    nvCtx.strokeStyle='#fff'; nvCtx.lineWidth=7;
    nvCtx.beginPath();
    nvCtx.arc(0, 0, 24, Math.PI, 0, false);
    nvCtx.stroke();
    nvCtx.restore();
  }

  nvCtx.restore();
}
requestAnimationFrame(nvLoop);
/* Redimensionado adaptativo: en móvil el viewport cambia constantemente (barra
   de URL al hacer scroll, rotación, teclado). nvResize() reconstruye el grid
   espacial y el atlas de texturas, así que se debounce para no hacerlo en cada
   píxel de scroll. */
let nvResizeT = null;
function nvScheduleResize(){
  clearTimeout(nvResizeT);
  nvResizeT = setTimeout(function(){ if(NV.on) nvResize(); }, 220);
}
addEventListener('resize', nvScheduleResize);
addEventListener('orientationchange',function(){ setTimeout(nvScheduleResize, 260); });
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', nvScheduleResize);
}
addEventListener('keydown',function(e){
  if(!NV.on)return;
  if(NV.state==='intro'){ endNvIntro(); return; }
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].indexOf(e.key)>=0)e.preventDefault();
  NV.keys[e.key]=true;
  if(e.key==='Shift')doDash();
  if(e.key==='x'||e.key==='X')fireMissiles();
  if(e.key==='c'||e.key==='C')firePierce();
  if(e.key==='b'||e.key==='B')useBomb();
  if(e.key==='p'||e.key==='P'){ if(NV.state==='playing'){NV.state='paused';nvShow('nvPause');} else if(NV.state==='paused')nvResume(); }
  if(e.key==='Escape'){ if(NV.state==='playing'||NV.state==='paused')nvToMenu(); }
  if(e.key==='Enter'&&NV.state==='menu')nvStart();
  if((e.key==='g'||e.key==='G') && localStorage.getItem('arc_godmode_unlocked')==='true'){
    NV.phaseT=1800; showToast('⚡ GODMODE ACTIVATED for 30s');
    sfx(800,.2,'sine',.15); setTimeout(()=>sfx(1200,.2,'sine',.15),150);
  }
});
addEventListener('keyup',function(e){ NV.keys[e.key]=false; });

const joyBase=document.querySelector('.joy-base');
const joyStick=document.getElementById('joyStick');
let joyActive=false, joyStartX=0, joyStartY=0;
function handleJoyStart(e){ e.preventDefault(); joyActive=true;
  const r=joyBase.getBoundingClientRect();
  joyStartX=r.left+r.width/2; joyStartY=r.top+r.height/2;
  handleJoyMove(e); }
function handleJoyMove(e){ if(!joyActive)return; e.preventDefault();
  const touch=e.touches?e.touches[0]:e;
  let dx=touch.clientX-joyStartX, dy=touch.clientY-joyStartY;
  const maxR=50; const d=Math.hypot(dx,dy);
  if(d>maxR){ dx=dx/d*maxR; dy=dy/d*maxR; }
  NV.touch.dx=dx/maxR; NV.touch.dy=dy/maxR;
  joyStick.style.left=(60+dx)+'px'; joyStick.style.bottom=(60-dy)+'px'; }
function handleJoyEnd(e){ if(e) e.preventDefault(); joyActive=false;
  NV.touch.dx=0; NV.touch.dy=0;
  joyStick.style.left='60px'; joyStick.style.bottom='60px'; }
joyBase.addEventListener('mousedown',handleJoyStart);
joyBase.addEventListener('touchstart',handleJoyStart,{passive:false});
document.addEventListener('mousemove',handleJoyMove);
document.addEventListener('touchmove',handleJoyMove,{passive:false});
document.addEventListener('mouseup',handleJoyEnd);
document.addEventListener('touchend',handleJoyEnd);

document.querySelectorAll('.tbtn').forEach(function(btn){
  const a=btn.dataset.a;
  function act(e){ if(e) e.preventDefault();
    if(a==='dash')doDash(); else if(a==='mis')fireMissiles();
    else if(a==='las')firePierce(); else if(a==='bmb')useBomb(); }
  btn.addEventListener('mousedown',act);
  btn.addEventListener('touchstart',act,{passive:false});
});

const cCv=document.getElementById('confetti'),cCtx=cCv.getContext('2d');
function cSize(){cCv.width=innerWidth;cCv.height=innerHeight;} cSize(); addEventListener('resize',cSize);
let parts=[]; const cEm=['🪙','🎊','😈','🎈','🎆','💳'];
function confettiBurst(x,y){ for(let i=0;i<70;i++)parts.push({x:x,y:y,vx:(Math.random()-.5)*14,vy:Math.random()*-12-3,g:.4,r:Math.random()*360,vr:(Math.random()-.5)*20,e:cEm[Math.floor(Math.random()*cEm.length)],s:14+Math.random()*16,l:120}); }
(function cLoop(){ cCtx.clearRect(0,0,cCv.width,cCv.height); parts=parts.filter(function(pp){return pp.l>0;});
  parts.forEach(function(pp){ pp.x+=pp.vx;pp.y+=pp.vy;pp.vy+=pp.g;pp.r+=pp.vr;pp.l--;
    cCtx.save();cCtx.translate(pp.x,pp.y);cCtx.rotate(pp.r*Math.PI/180);cCtx.font=pp.s+'px serif';cCtx.textAlign='center';cCtx.fillText(pp.e,0,0);cCtx.restore(); });
  requestAnimationFrame(cLoop); })();

setInterval(function(){ document.getElementById('shieldPct').textContent=(96+Math.random()*4).toFixed(0)+'%'; },2500);
if(window.innerWidth > 768 && !isTouch){
  openWindow('win-main');
} else {
  closeWindow('win-main');
}
refreshTask(); setTimeout(spawnPopup,6000);

/* ============ VIRUSARC ANTI-TAMPER & CRYPTOGRAPHIC SECURITY SHIELD ============ */
function initSecurityShield(){
  // 1. Block Context Menu (permit desktop right-click menu & Minesweeper flagging)
  window.addEventListener('contextmenu', function(e){
    if(e.target.closest('.desktop') || e.target.closest('#ctxMenu') || e.target.closest('#msGrid') || e.target.closest('.dicon')) return;
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // 2. Block DevTools Shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S)
  window.addEventListener('keydown', function(e){
    if(e.key === 'F12' ||
       (e.ctrlKey && e.shiftKey && ['I','J','C','i','j','c'].includes(e.key)) ||
       (e.ctrlKey && ['u','U','s','S'].includes(e.key))){
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // 3. Heartbeat Memory Verification for Game
  setInterval(function(){
    if(typeof NV !== 'undefined' && NV.on){
      if(NV.score !== ((NV._scoreShadow - 0x1A4) ^ NV._scoreKey)){
        console.warn('[VIRUSARC ANTI-CHEAT] Tampered score memory discrepancy. Resetting.');
        NV.score = 0; NV._score = 0;
        NV._scoreShadow = (0 ^ NV._scoreKey) + 0x1A4;
        showStatus('⚠️ CHEAT DETECTED: SCORE RESET');
      }
    }
  }, 400);

  // 4. "Security Lockdown" anti-inspección (SOLO ESCRITORIO, y sin dimensiones)
  //
  // HISTORIAL DEL BUG: la detección comparaba outerWidth/outerHeight con
  // innerWidth/innerHeight. Esa diferencia es el chrome del navegador, así que
  // en móviles y webviews supera cualquier umbral SIEMPRE (barras de URL,
  // barra de gestos, teclado) => el lockdown saltaba en el celular. El intento
  // de blindarlo con "innerWidth < 900" y "pointer:coarse" tampoco era fiable:
  // tablets, móviles grandes, ventanas estrechas y webviews con stylus/hover
  // pasaban el filtro. Se ELIMINA la comprobación por dimensiones.
  //
  // Ahora:
  //  - Solo se arma en escritorio real: sin táctil, puntero fino y con hover.
  //    En móvil/tablet la comprobación NI SE PROGRAMA, así que es imposible que
  //    aparezca allí.
  //  - La señal es una pausa del `debugger` (si DevTools está abierto, la
  //    ejecución se detiene y el tiempo medido se dispara). No depende del
  //    tamaño de la ventana ni de la plataforma.
  //  - Se puede desactivar siempre con ?lockdown=off y forzar con ?lockdown=on.
  //  - Si llegara a aparecer, tiene botón IGNORE y se cierra con Escape.
  let lockdownShown = false;
  const lockdownParam = (function(){
    try { return new URLSearchParams(location.search).get('lockdown') || ''; } catch(e){ return ''; }
  })();
  const lockdownOff = (lockdownParam === 'off' || lockdownParam === '0');
  const lockdownForced = (lockdownParam === 'on' || lockdownParam === '1');

  function lockdownAllowed(){
    if(lockdownOff) return false;
    if(lockdownForced) return true;
    // Escritorio real: táctil fuera, y puntero fino + hover obligatorios
    if(isTouch || navigator.maxTouchPoints > 0) return false;
    if(!window.matchMedia) return false;
    try{
      if(!window.matchMedia('(pointer: fine)').matches) return false;
      if(window.matchMedia('(hover: none)').matches) return false;
      if(window.matchMedia('(any-pointer: coarse)').matches) return false;
    }catch(e){ return false; }
    return true;
  }

  function removeLockout(){
    const el = document.getElementById('secLockout');
    if(el) el.remove();
  }

  function showLockout(){
    if(document.getElementById('secLockout')) return;
    const lockout = document.createElement('div');
    lockout.id = 'secLockout';
    lockout.style.cssText = 'position:fixed;inset:0;background:rgba(10,0,0,0.96);color:#ff003c;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;text-align:center;padding:20px;';
    lockout.innerHTML = '<div style="font-size:60px;margin-bottom:14px;filter:drop-shadow(0 0 20px #ff003c);">🛡️</div><h2 style="font-size:28px;letter-spacing:3px;margin-bottom:12px;color:#ff003c;text-shadow:0 0 10px #ff003c;">VIRUSARC SECURITY LOCKDOWN</h2><p style="font-size:15px;color:#cfe8ff;max-width:540px;line-height:1.6;">Developer inspection environment detected. Client memory manipulation, console modifications, and script injections are cryptographically blocked.</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:24px;"><button id="secLockoutIgnore" style="padding:12px 28px;background:transparent;color:#cfe8ff;border:1px solid #cfe8ff;border-radius:6px;cursor:pointer;font-weight:bold;font-size:15px;">IGNORE (ESC)</button><button onclick="location.reload()" style="padding:12px 28px;background:linear-gradient(180deg,#ff003c,#b91c1c);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:15px;box-shadow:0 0 20px rgba(255,0,60,.5);">RELOAD SYSTEM</button></div>';
    document.body.appendChild(lockout);
    const ign = document.getElementById('secLockoutIgnore');
    if(ign) ign.addEventListener('click', removeLockout);
  }

  function devtoolsLikelyOpen(){
    // Señal por pausa del debugger: si DevTools está abierto, la ejecución se
    // detiene aquí y el tiempo medido se dispara. Se exige un umbral amplio para
    // no confundirlo con un frame lento.
    const t0 = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    return (performance.now() - t0) > 250;
  }

  // Red de seguridad: si por caché quedara un lockout de una versión anterior, fuera.
  removeLockout();
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') removeLockout();
  });

  if(lockdownAllowed()){
    // Enfriamiento: no se comprueba mientras el jugador está en partida (sería
    // una pausa molesta justo en el peor momento) y se empieza a vigilar pasado
    // un margen, para no interrumpir a nadie que esté trasteando la consola.
    let armado = false;
    setTimeout(function(){ armado = true; }, 10000);
    setInterval(function(){
      if(lockdownShown || !armado) return;
      if(typeof NV !== 'undefined' && NV.on) return;   // jugando: no molestar
      if(devtoolsLikelyOpen()){
        lockdownShown = true;
        showLockout();
      }
    }, 2500);
  }
}
initSecurityShield();
