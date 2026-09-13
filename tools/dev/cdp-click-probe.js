// Comprueba si un tap táctil produce 'click' en la página (diagnóstico).
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
  ws.addEventListener('message', function (ev) {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  });
  await new Promise(function (r, j) { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: PAGE });
  await sleep(9000);
  const ev = async function (e) { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.exceptionDetails ? 'EXC' : r.result.value; };

  // añadir un div limpio y ver si recibe click
  await ev(`(function(){
    const d=document.createElement('div');
    d.id='__clean';
    d.style.cssText='position:fixed;left:20px;top:600px;width:200px;height:100px;background:#0f0;z-index:99999;';
    document.body.appendChild(d);
    window.__C={click:0,pointerup:0,touchend:0,mousedown:0};
    ['click','pointerup','touchend','mousedown'].forEach(function(t){ d.addEventListener(t,function(){window.__C[t]++;},true); });
    return 'ok';
  })()`);
  await sleep(300);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 650, id: 1 }] });
  await sleep(80);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1000);
  const res = await ev("JSON.stringify(window.__C)");
  console.log('Eventos en div LIMPIO tras tap: ' + res);

  // repetir con un toque "largo" (200ms) por si el umbral de tap lo bloquea
  await ev("window.__C={click:0,pointerup:0,touchend:0,mousedown:0}");
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 650, id: 1 }] });
  await sleep(200);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1000);
  console.log('Eventos con toque de 200ms: ' + await ev("JSON.stringify(window.__C)"));

  await ev("const e=document.getElementById('__clean'); if(e)e.remove();");
  ws.close(); process.exit(0);
})().catch(function (e) { console.log('FATAL ' + e.message); process.exit(1); });
