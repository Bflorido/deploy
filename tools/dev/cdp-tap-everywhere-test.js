/**
 * Prueba en móvil emulado: los botones deben responder al TAP en TODA la
 * interfaz (juego, ventanas, menú inicio, escritorio), no solo en los iconos.
 * Requiere dev-server.js en 8099 y Chrome con --remote-debugging-port=9222.
 * Uso: node tools/dev/cdp-tap-everywhere-test.js
 */
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

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
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
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push((d.exception && d.exception.description) || d.text); }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  });
  await new Promise(function (r, j) { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });
  await send('Page.navigate', { url: PAGE });
  await sleep(11000);

  const ev = async function (e) {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? 'EXC: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') : r.result.value;
  };
  async function tapSelector(sel) {
    const box = await ev(`(function(){ const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null;
      const r=el.getBoundingClientRect(); if(r.width<1||r.height<1) return null;
      return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)]; })()`);
    if (!box) return null;
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box[0], y: box[1], id: 1 }] });
    await sleep(70);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
    return box;
  }

  console.log('=== 0. Sin dock ===');
  check('no existe el dock en el DOM', (await ev("!!document.getElementById('mobileDock')")) === false);
  check('existe el sintetizador global', (await ev("typeof initGlobalTapToClick")) === 'function');

  console.log('=== 1. Icono del escritorio -> abre ventana ===');
  await tapSelector('.dicon[ondblclick*="win-games"]');
  check('1 tap en "Games" abre su ventana', (await ev("document.getElementById('win-games').classList.contains('open')")) === true);
  await tapSelector('#win-games .title-bar button.close');
  check('el botón ✕ cierra la ventana', (await ev("document.getElementById('win-games').classList.contains('open')")) === false);

  console.log('=== 2. Botones dentro de una ventana ===');
  await tapSelector('.dicon[ondblclick*="openNaves"]');
  check('1 tap en "Ships.exe" abre el juego', (await ev("document.getElementById('navesGame').classList.contains('show')")) === true);

  console.log('=== 3. Botones del menú del juego (el fallo reportado) ===');
  await sleep(6500); // deja pasar la intro
  const estadoMenu = await ev("NV.state + '|' + document.getElementById('nvMenu').classList.contains('show')");
  console.log('  estado tras la intro: ' + estadoMenu);

  // BRIEFING (abre y luego volvemos)
  await tapSelector('#nvMenu .nv-glass:not(.nv-exit):nth-of-type(2)');
  await sleep(400);
  const ayuda = await ev("document.getElementById('nvHelp').classList.contains('show')");
  check('tap en BRIEFING abre la ayuda', ayuda === true);
  if (ayuda) { await tapSelector('#nvHelp .nv-btn'); await sleep(400); }

  // START MISSION -> debe arrancar la partida
  await ev("nvShow('nvMenu'); 'menu'");
  await sleep(300);
  const botonStart = await tapSelector('#nvMenu .nv-primary');
  check('el botón START MISSION es alcanzable', botonStart !== null, botonStart);
  await sleep(900);
  const trasStart = await ev("JSON.stringify({ estado: NV.state, hud: document.getElementById('nvHUD').classList.contains('show'), menu: document.getElementById('nvMenu').classList.contains('show') })");
  console.log('  tras tap en START MISSION: ' + trasStart);
  const st = JSON.parse(trasStart);
  check('el tap en START MISSION arranca la partida', st.estado === 'briefing' || st.estado === 'playing' || st.estado === 'hyper', st);
  check('el HUD del juego se muestra', st.hud === true, st);

  console.log('=== 4. Controles táctiles del juego siguen funcionando ===');
  await sleep(4500);
  const jugando = await ev("JSON.stringify({ estado: NV.state, joy: document.getElementById('touchJoy').classList.contains('show'), btns: document.getElementById('touchBtns').classList.contains('show') })");
  console.log('  estado: ' + jugando);
  const jg = JSON.parse(jugando);
  check('el joystick está visible', jg.joy === true, jg);
  check('los botones de habilidad están visibles', jg.btns === true, jg);
  await ev("NV.bombs=2; NV.bombT=0; 'reset'");
  await tapSelector('.tbtn.bmb');
  check('tap en el botón BOMBA la dispara', (await ev("NV.bombT > 0")) === true, await ev("NV.bombT"));

  console.log('=== 5. Escape del juego y menú inicio ===');
  await tapSelector('#nvMenu .nv-exit, .nv-exit');
  await ev("nvShow('nvMenu'); closeNaves(); 'salir'");
  await sleep(500);
  check('el juego se cierra', (await ev("document.getElementById('navesGame').classList.contains('show')")) === false);
  await tapSelector('#startBtn');
  check('el botón Inicio abre el menú', (await ev("document.getElementById('startMenu').classList.contains('open')")) === true);
  await tapSelector('#startMenu .sm-item');
  await sleep(600);
  check('un elemento del menú inicio responde al tap', (await ev("document.querySelectorAll('.window.open').length")) >= 1);

  console.log('=== ERRORES DE CONSOLA ===');
  console.log(errors.length ? errors.slice(0, 8).join('\n') : '(ninguno)');

  console.log('\n=== RESULTADO: ' + pass + ' OK, ' + fail + ' fallos ===');
  ws.close();
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('FATAL ' + e.message); process.exit(1); });
