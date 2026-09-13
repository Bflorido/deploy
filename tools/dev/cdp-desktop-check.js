// Comprueba que la experiencia de escritorio (ratón) no se rompió.
// Uso: node tools/dev/cdp-desktop-check.js [puertoCDP] [url]
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
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push((d.exception && d.exception.description) || d.text); }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  });
  await new Promise(function (r, j) { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: PAGE });
  await sleep(10000);
  const ev = async function (e) {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    return r.exceptionDetails ? 'EXC: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') : r.result.value;
  };

  console.log('--- ESCRITORIO 1440x900 ---');
  console.log(JSON.stringify(await ev(`(function(){
    const dock = document.getElementById('mobileDock');
    const games = Array.from(document.querySelectorAll('.dicon')).filter(function(d){return /Games/.test(d.textContent);})[0];
    const r = games.getBoundingClientRect();
    return { dockDisplay: getComputedStyle(dock).display,
      winMainVisible: getComputedStyle(document.getElementById('win-main')).display,
      iconPosicionadaAbsoluta: getComputedStyle(games).position,
      gamesCenter: [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)],
      erroresHasta: 0 };
  })()`), null, 1));

  // click de ratón real en el icono (debe seguir el flujo normal)
  const c = await ev(`(function(){ const g=Array.from(document.querySelectorAll('.dicon')).filter(function(d){return /Games/.test(d.textContent);})[0]; const r=g.getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)]; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c[0], y: c[1], button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c[0], y: c[1], button: 'left', clickCount: 1 });
  await sleep(700);
  console.log('tras 1 click de ratón en Games: ' + await ev("document.getElementById('win-games').classList.contains('open')"));

  // doble click de ratón (gesto original del escritorio)
  await ev("document.getElementById('win-games').classList.remove('open'); document.getElementById('win-games').style.display='none'; 'reset'");
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c[0], y: c[1], button: 'left', clickCount: 2 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c[0], y: c[1], button: 'left', clickCount: 2 });
  await sleep(700);
  console.log('tras doble click de ratón en Games: ' + await ev("document.getElementById('win-games').classList.contains('open')"));

  // arrastrar un icono (debe seguir funcionando y NO abrir la app)
  await ev("document.getElementById('win-games').classList.remove('open'); document.getElementById('win-games').style.display='none'; 'reset2'");
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c[0], y: c[1], button: 'left', clickCount: 1 });
  for (let i = 1; i <= 5; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c[0] + i * 12, y: c[1] + i * 10, button: 'left' }); await sleep(25); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c[0] + 60, y: c[1] + 50, button: 'left', clickCount: 1 });
  await sleep(900);
  console.log('tras ARRASTRAR el icono -> movido: ' + await ev(`(function(){ const g=Array.from(document.querySelectorAll('.dicon')).filter(function(d){return /Games/.test(d.textContent);})[0]; return g.style.left + ',' + g.style.top + ' | appAbierta=' + document.getElementById('win-games').classList.contains('open'); })()`));

  // juego en escritorio: debe seguir abriendo con el icono (doble click)
  const s = await ev(`(function(){ const g=Array.from(document.querySelectorAll('.dicon')).filter(function(d){return /Ships/.test(d.textContent);})[0]; const r=g.getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)]; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: s[0], y: s[1], button: 'left', clickCount: 2 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: s[0], y: s[1], button: 'left', clickCount: 2 });
  await sleep(1200);
  console.log('tras doble click en Ships.exe: ' + await ev("(function(){ return JSON.stringify({show: document.getElementById('navesGame').classList.contains('show'), estado: NV.state, canvas: document.getElementById('nvCanvas').width+'x'+document.getElementById('nvCanvas').height}); })()"));

  console.log('=== ERRORES DE CONSOLA ===');
  console.log(errors.length ? errors.slice(0, 8).join('\n') : '(ninguno)');
  ws.close(); process.exit(0);
})().catch(function (e) { console.log('FATAL ' + e.message); process.exit(1); });
