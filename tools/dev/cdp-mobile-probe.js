// Probe de la UI móvil vía Chrome DevTools Protocol.
// Requiere: Chrome con --remote-debugging-port=9222 y el static-server corriendo.
// Uso:  node tools/dev/cdp-mobile-probe.js [puertoCDP] [url]
// Solo desarrollo: no forma parte del build ni del despliegue.
const http = require('http');

const PORT = Number(process.argv[2] || 9222);
const PAGE = process.argv[3] || 'http://127.0.0.1:8099/console.html';
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

function getJson(path) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: PORT, path: path }, function (res) {
      let d = '';
      res.on('data', function (c) { d += c; });
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
  if (!targets || !targets.length) { console.log('NO_TARGETS: ¿Chrome con --remote-debugging-port=' + PORT + '?'); process.exit(2); }
  const page = targets.filter(function (t) { return t.type === 'page'; })[0] || targets[0];

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  function send(method, params) {
    return new Promise(function (resolve, reject) {
      const myId = ++id;
      pending.set(myId, { resolve: resolve, reject: reject });
      ws.send(JSON.stringify({ id: myId, method: method, params: params || {} }));
    });
  }
  const consoleErrors = [];
  ws.addEventListener('message', function (ev) {
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleErrors.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map(function (a) { return a.value || a.description; }).join(' '));
    }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
    }
  });
  await new Promise(function (res, rej) {
    ws.addEventListener('open', res); ws.addEventListener('error', rej);
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 915, deviceScaleFactor: 2, mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle: 0 }
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  });
  await send('Page.navigate', { url: PAGE });
  await sleep(11000);

  async function evalJs(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      return 'EXCEPTION: ' + ((d.exception && d.exception.description) || d.text);
    }
    return r.result.value;
  }

  async function tap(x, y) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x, y: y, id: 1 }] });
    await sleep(70);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(900);
  }

  const state = await evalJs(`(function(){
    const out = { innerW: innerWidth, innerH: innerHeight, isTouch: (typeof isTouch!=='undefined')?isTouch:'undef',
      lockout: !!document.getElementById('secLockout'), boot: getComputedStyle(document.getElementById('boot')).display };
    const icons = Array.from(document.querySelectorAll('.dicon'));
    out.iconCount = icons.length;
    out.icons = icons.map(function(d){
      const r = d.getBoundingClientRect(); const cs = getComputedStyle(d);
      return { lbl: d.querySelector('.lbl').textContent.trim(),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        pe: cs.pointerEvents };
    });
    out.fn = { openWindow: typeof openWindow, openNaves: typeof openNaves };
    out.attrSample = (icons[5]||icons[0]).getAttribute('ondblclick');
    return out;
  })()`);
  console.log('=== ESTADO INICIAL (412x915 táctil) ===');
  console.log(JSON.stringify(state, null, 1));

  const iconFor = function (re) {
    return (state.icons || []).filter(function (i) { return re.test(i.lbl); })[0];
  };

  async function testTap(label, re) {
    const ic = iconFor(re);
    if (!ic) { console.log('--- ' + label + ': icono no encontrado'); return; }
    const cx = ic.rect[0] + Math.round(ic.rect[2] / 2);
    const cy = ic.rect[1] + Math.round(ic.rect[3] / 2);
    const hit = await evalJs('(function(){ const el=document.elementFromPoint(' + cx + ',' + cy + '); return el ? el.tagName+"."+el.className : "null"; })()');
    await tap(cx, cy);
    const res = await evalJs(`(function(){
      const g = document.getElementById('win-games'), n = document.getElementById('navesGame');
      return { tapEn: ${JSON.stringify(label)}, elementoBajoElToque: ${JSON.stringify(hit)},
        winGames: getComputedStyle(g).display, winGamesOpen: g.classList.contains('open'),
        navesGame: n.classList.contains('show'),
        nvState: (typeof NV!=='undefined') ? NV.state : 'undef' };
    })()`);
    console.log('--- TAP en "' + label + '" (1 toque) ---');
    console.log(JSON.stringify(res, null, 1));
  }

  await testTap('Games', /Games/);
  await testTap('Ships.exe', /Ships/);

  // ¿Y con doble toque?
  const ic = iconFor(/Games/);
  if (ic) {
    const cx = ic.rect[0] + Math.round(ic.rect[2] / 2);
    const cy = ic.rect[1] + Math.round(ic.rect[3] / 2);
    await evalJs("document.getElementById('win-games').classList.remove('open'); document.getElementById('win-games').style.display='none';");
    await tap(cx, cy);
    await sleep(60);
    await tap(cx, cy);
    const res2 = await evalJs("(function(){ const g=document.getElementById('win-games'); return { trasDobleToque: getComputedStyle(g).display, open: g.classList.contains('open') }; })()");
    console.log('--- DOBLE TOQUE en "Games" ---');
    console.log(JSON.stringify(res2, null, 1));
  }

  console.log('=== ERRORES DE CONSOLA ===');
  console.log(consoleErrors.length ? consoleErrors.slice(0, 20).join('\n') : '(ninguno)');

  ws.close();
  process.exit(0);
})().catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
