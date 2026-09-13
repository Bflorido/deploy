// Prueba de flujo móvil completo: boot, dock, apps, juego y gestos.
// Uso: node tools/dev/cdp-mobile-flow.js [puertoCDP] [url]
const http = require('http');
const PORT = Number(process.argv[2] || 9222);
const PAGE = process.argv[3] || 'http://127.0.0.1:8099/console.html';
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function getJson(p) {
  return new Promise(function (res, rej) {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, function (r) {
      let d = ''; r.on('data', function (c) { d += c; }); r.on('end', function () { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
(async function () {
  const targets = await getJson('/json');
  const page = targets.filter(function (t) { return t.type === 'page'; })[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  function send(m, p) { return new Promise(function (res, rej) { const i = ++id; pending.set(i, { res: res, rej: rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); }
  const errors = [];
  ws.addEventListener('message', function (ev) {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  });
  await new Promise(function (r, j) { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });
  await send('Page.navigate', { url: PAGE });
  await sleep(12000);

  const ev = async function (e) {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? 'EXC: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') : r.result.value;
  };
  async function tap(x, y) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x, y: y, id: 1 }] });
    await sleep(70);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(1000);
  }
  function show(label, v) { console.log('\n--- ' + label + ' ---\n' + JSON.stringify(v, null, 1)); }

  show('1. BOOT + DOCK', await ev(`(function(){
    const dock = document.getElementById('mobileDock');
    const btns = Array.from(dock.querySelectorAll('.mobile-dock-btn'));
    const r = dock.getBoundingClientRect();
    return {
      boot: getComputedStyle(document.getElementById('boot')).display,
      biosTexto: (document.getElementById('bios').textContent||'').slice(0,40),
      dockBtns: btns.map(function(b){ return b.textContent + ':' + b.title; }),
      dockVisible: getComputedStyle(dock).display,
      dockRect: [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)],
      dockEnPantalla: r.left >= 0 && r.right <= innerWidth && r.top >= 0,
      errores: 0
    };
  })()`));

  // posición del botón Games del dock
  const gamesBtn = await ev(`(function(){
    const b = Array.from(document.querySelectorAll('.mobile-dock-btn')).filter(function(x){ return /Games/.test(x.title); })[0];
    if(!b) return null; const r = b.getBoundingClientRect();
    return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)];
  })()`);
  if (gamesBtn) { await tap(gamesBtn[0], gamesBtn[1]); }
  show('2. TAP en dock "Games"', await ev(`(function(){
    const g=document.getElementById('win-games'); const r=g.getBoundingClientRect();
    return { abierta: g.classList.contains('open'), display: getComputedStyle(g).display,
      rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)],
      dentroDePantalla: r.top >= 0 && r.bottom <= innerHeight + 1,
      targetaMinesweeper: !!Array.from(document.querySelectorAll('#win-games .meme-tile')).length };
  })()`));

  // cerrar con el gesto de deslizar hacia abajo desde la barra de título
  const bar = await ev(`(function(){
    const g=document.getElementById('win-games'); const b=g.querySelector('.title-bar');
    const r=b.getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)];
  })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bar[0], y: bar[1], id: 1 }] });
  for (let i = 1; i <= 6; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bar[0], y: bar[1] + i * 30, id: 1 }] }); await sleep(30); }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(900);
  show('3. GESTO deslizar-abajo para cerrar', await ev(`(function(){
    const g=document.getElementById('win-games');
    return { abierta: g.classList.contains('open'), display: getComputedStyle(g).display, transform: g.style.transform };
  })()`));

  // abrir Ships.exe desde el dock y comprobar que el juego llega a estado jugable
  const shipsBtn = await ev(`(function(){
    const b = Array.from(document.querySelectorAll('.mobile-dock-btn')).filter(function(x){ return /Ships/.test(x.title); })[0];
    if(!b) return null; const r = b.getBoundingClientRect();
    return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)];
  })()`);
  if (shipsBtn) { await tap(shipsBtn[0], shipsBtn[1]); }
  show('4. TAP en dock "Ships.exe"', await ev(`(function(){
    const n=document.getElementById('navesGame');
    return { juegoShow: n.classList.contains('show'), estado: (typeof NV!=='undefined')?NV.state:'undef',
      intro: document.getElementById('nvIntro').classList.contains('show') };
  })()`));

  await sleep(6500); // dejar pasar la intro
  show('5. INTRO/PARTIDA + CONTROLES TÁCTILES', await ev(`(function(){
    const joy=document.getElementById('touchJoy'), tb=document.getElementById('touchBtns');
    const r=tb.getBoundingClientRect();
    return { estado: NV.state, intro: document.getElementById('nvIntro').classList.contains('show'),
      menu: document.getElementById('nvMenu').classList.contains('show'),
      hud: document.getElementById('nvHUD').classList.contains('show'),
      joy: joy.classList.contains('show'), btns: tb.classList.contains('show'),
      btnsRect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)],
      ronda: NV.round, puntuacion: NV.score };
  })()`));

  // arrancar partida real y verificar controles + disparo automático
  await ev("nvStart(); 'ok'");
  await sleep(4000);
  show('6. JUGANDO (mobile)', await ev(`(function(){
    return { estado: NV.state, ronda: NV.round, vidas: NV.lives,
      joy: document.getElementById('touchJoy').classList.contains('show'),
      btns: document.getElementById('touchBtns').classList.contains('show'),
      enemigos: NV.enemies.length, balasJugador: NV.bullets.length, balasEnemigas: NV.ebullets.length,
      lockoutDevtools: !!document.getElementById('secLockout'),
      canvas: document.getElementById('nvCanvas').width + 'x' + document.getElementById('nvCanvas').height };
  })()`));

  // tocar el botón de bomba del juego (pointerdown/touchend)
  const bomb = await ev(`(function(){ const b=document.querySelector('.tbtn.bmb'); const r=b.getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)]; })()`);
  await ev("NV.bombT=0; NV.bombs=2; 'reset'");
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bomb[0], y: bomb[1], id: 1 }] });
  await sleep(70);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  show('7. TAP en botón BOMBA del juego', await ev(`(function(){ return { bombT: NV.bombT, bombs: NV.bombs }; })()`));

  console.log('\n=== ERRORES DE CONSOLA ===');
  console.log(errors.length ? errors.slice(0, 10).join('\n---\n') : '(ninguno)');
  ws.close(); process.exit(0);
})().catch(function (e) { console.log('FATAL ' + e.message); process.exit(1); });
