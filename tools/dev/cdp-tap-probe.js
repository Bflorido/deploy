// Probe profundo de la cadena de toque en los iconos del escritorio móvil.
// Uso: node tools/dev/cdp-tap-probe.js [puertoCDP] [url]
const http = require('http');
const PORT = Number(process.argv[2] || 9222);
const PAGE = process.argv[3] || 'http://127.0.0.1:8099/console.html';
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

function getJson(path) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: PORT, path: path }, function (res) {
      let d = ''; res.on('data', function (c) { d += c; });
      res.on('end', function () { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async function () {
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try { targets = await getJson('/json'); if (targets && targets.length) break; } catch (e) {}
    await sleep(500);
  }
  if (!targets || !targets.length) { console.log('NO_TARGETS'); process.exit(2); }
  const page = targets.filter(function (t) { return t.type === 'page'; })[0] || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  function send(method, params) {
    return new Promise(function (resolve, reject) {
      const myId = ++id; pending.set(myId, { resolve: resolve, reject: reject });
      ws.send(JSON.stringify({ id: myId, method: method, params: params || {} }));
    });
  }
  ws.addEventListener('message', function (ev) {
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
    }
  });
  await new Promise(function (res, rej) { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });
  await send('Page.navigate', { url: PAGE });
  await sleep(11000);

  async function evalJs(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EXCEPTION: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  }

  // 1) Instrumentar: contar eventos y capturar el error real del manejador
  const setup = await evalJs(`(function(){
    const games = Array.from(document.querySelectorAll('.dicon')).filter(function(d){ return /Games/.test(d.textContent); })[0];
    if(!games) return 'no-games';
    window.__T = { target:'games', clicked:0, dblclicked:0, touched:0, openWindowCalls:[] };
    ['click','dblclick','touchstart','touchend','mousedown','pointerdown','pointerup'].forEach(function(t){
      games.addEventListener(t, function(){ window.__T[t] = (window.__T[t]||0)+1; }, true);
    });
    // espiar openWindow / openNaves SIN romper el flujo real
    const ow = window.openWindow, on = window.openNaves;
    window.openWindow = function(){ try{ window.__T.openWindowCalls.push(String(arguments[0])); }catch(e){} return ow.apply(this, arguments); };
    window.openNaves = function(){ try{ window.__T.openWindowCalls.push('openNaves'); }catch(e){} return on.apply(this, arguments); };
    // reproducir EXACTAMENTE lo que hace initMobileTouchIcons y capturar el error
    const dbl = games.getAttribute('ondblclick');
    const inner = initMobileTouchIcons.toString();
    let handlerErr = null, fnErr = null, ran = false;
    try { new Function(dbl)(); ran = true; } catch(e){ fnErr = e.name + ': ' + e.message; }
    return { dblAttr: dbl, innerWidthOK: (window.innerWidth <= 768), touchOK: ('ontouchstart' in window),
             fnRan: ran, fnError: fnErr, openWindowCalls: window.__T.openWindowCalls,
             handlerSourceStart: inner.slice(0, 160) };
  })()`);
  console.log('=== SETUP / reproducción directa del handler ===');
  console.log(JSON.stringify(setup, null, 1));

  await evalJs("document.getElementById('win-games').classList.remove('open'); document.getElementById('win-games').style.display='none'; window.__T.openWindowCalls=[];");
  await sleep(200);

  // 2) Tap táctil real y ver qué eventos llegaron
  const cx = 156, cy = 171;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  await sleep(80);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1200);

  const after = await evalJs(`(function(){
    const g = document.getElementById('win-games');
    return { eventos: window.__T, winGamesDisplay: getComputedStyle(g).display, open: g.classList.contains('open') };
  })()`);
  console.log('=== TRAS TAP TÁCTIL REAL ===');
  console.log(JSON.stringify(after, null, 1));

  await sleep(1500); // limpiar listeners antes de cerrar
  ws.close();
  process.exit(0);
})().catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
