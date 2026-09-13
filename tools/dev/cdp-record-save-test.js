/**
 * Prueba en navegador del flujo de guardado de records con wallet obligatoria.
 * Requiere dev-server.js en el puerto 8099 y Chrome con --remote-debugging-port=9222.
 * Uso: node tools/dev/cdp-record-save-test.js
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
  await send('Page.navigate', { url: PAGE });
  await sleep(11000);

  const ev = async function (e) {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? 'EXC: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') : r.result.value;
  };

  console.log('=== 1. El formulario de fin de partida tiene los dos campos ===');
  const campos = await ev(`(function(){
    return { name: !!document.getElementById('nvPilotName'), wallet: !!document.getElementById('nvPilotWallet'),
      walletPlaceholder: (document.getElementById('nvPilotWallet')||{}).placeholder,
      cabeceraWallet: !!Array.from(document.querySelectorAll('.lb-table th')).filter(function(t){return /WALLET/i.test(t.textContent);}).length };
  })()`);
  check('campo pilot name presente', campos.name === true, campos);
  check('campo wallet presente', campos.wallet === true, campos);
  check('columna WALLET en la tabla', campos.cabeceraWallet === true, campos);

  console.log('=== 2. Sin wallet: NO se guarda y avisa ===');
  const sinWallet = await ev(`(function(){
    openNaves(); NV.score = 1234; NV.round = 3;
    document.getElementById('nvPilotWallet').value = '';
    document.getElementById('lbSaveMsg').textContent = '';
    saveLeaderboard();
    return { msg: document.getElementById('lbSaveMsg').textContent,
             marcaError: document.getElementById('nvPilotWallet').classList.contains('err'),
             localGuardado: localStorage.getItem('arc_alltime_records') };
  })()`);
  check('muestra mensaje de wallet obligatoria', /wallet es obligatoria/i.test(sinWallet.msg || ''), sinWallet);
  check('marca el campo en rojo', sinWallet.marcaError === true, sinWallet);
  check('no guarda nada en local', !sinWallet.localGuardado, sinWallet.localGuardado);

  console.log('=== 3. Wallet inválida: tampoco guarda ===');
  const malaWallet = await ev(`(function(){
    document.getElementById('nvPilotWallet').value = 'esto-no-es-una-wallet';
    document.getElementById('lbSaveMsg').textContent = '';
    saveLeaderboard();
    return { msg: document.getElementById('lbSaveMsg').textContent, local: localStorage.getItem('arc_alltime_records') };
  })()`);
  check('rechaza wallet con formato inválido', /wallet es obligatoria/i.test(malaWallet.msg || ''), malaWallet);
  check('sigue sin guardar', !malaWallet.local, malaWallet.local);

  console.log('=== 4. Wallet válida: guarda y envía al servidor ===');
  const okWallet = await ev(`(async function(){
    document.getElementById('nvPilotWallet').value = '0xAbC1234567890aBcD1234567890aBcD1234567890';
    document.getElementById('nvPilotName').value = 'tester';
    document.getElementById('lbSaveMsg').textContent = '';
    saveLeaderboard();
    await new Promise(function(r){ setTimeout(r, 2500); });
    const guardado = JSON.parse(localStorage.getItem('arc_alltime_records') || '[]');
    return { msg: document.getElementById('lbSaveMsg').textContent, guardado: guardado,
             walletGuardada: guardado[0] ? guardado[0].wallet : null, nombreGuardado: guardado[0] ? guardado[0].name : null };
  })()`);
  check('guarda en local', Array.isArray(okWallet.guardado) && okWallet.guardado.length === 1, okWallet.guardado);
  check('nombre normalizado a mayúsculas', okWallet.nombreGuardado === 'TESTER', okWallet.nombreGuardado);
  check('wallet normalizada a minúsculas', okWallet.walletGuardada === '0xabc1234567890abcd1234567890abcd1234567890', okWallet.walletGuardada);
  check('mensaje de éxito del servidor', /guardado/i.test(okWallet.msg || ''), okWallet.msg);

  console.log('=== 5. El servidor lo tiene (GET desde el navegador) ===');
  const servidor = await ev(`(async function(){
    const r = await fetch('api/records.js', { method: 'GET' });
    const d = await r.json();
    return { status: r.status, allTime: d.allTime, storage: d.storage };
  })()`);
  check('GET responde 200', servidor.status === 200, servidor);
  check('el record está en el servidor', !!(servidor.allTime && servidor.allTime.length === 1), servidor.allTime);
  check('con su wallet', servidor.allTime && servidor.allTime[0].wallet === '0xabc1234567890abcd1234567890abcd1234567890', servidor.allTime && servidor.allTime[0]);
  check('el endpoint informa del almacenamiento', !!(servidor.storage && servidor.storage.backend), servidor.storage);

  console.log('=== 6. El ranking muestra la wallet truncada ===');
  const tabla = await ev(`(function(){
    switchLbTab('alltime');
    renderLeaderboard('TESTER');
    const celdas = Array.from(document.querySelectorAll('#lbBody tr td')).map(function(t){ return t.textContent; });
    const cabeceras = Array.from(document.querySelectorAll('.lb-table th')).map(function(t){ return t.textContent; });
    return { celdas: celdas, cabeceras: cabeceras, html: document.getElementById('lbBody').innerHTML.slice(0,300) };
  })()`);
  check('cabecera incluye WALLET', tabla.cabeceras.join('|').indexOf('WALLET') >= 0, tabla.cabeceras);
  check('fila muestra wallet truncada', /0xabc1…7890/.test(tabla.html), tabla.html);

  console.log('=== 7. Endpoint caído: el cliente lo dice, no lo oculta ===');
  const caido = await ev(`(async function(){
    _recordsEndpoint = 'api/no-existe.js';
    const e = { name:'X', score:1, round:1, date:'01/15/2026', wallet:'x.eth' };
    e._ts = Date.now(); e._n = 'abcdef123456'; e._sig = computeRecordSig(e);
    try { await syncPostRecord(e); return { ok:true }; }
    catch(err){ return { ok:false, status: err.status, msg: recordsErrorMsg({status: err.status}, err.data) }; }
  })()`);
  check('el fallo se propaga (no se traga)', caido.ok === false, caido);
  check('con mensaje comprensible', /no hay backend|no se pudo guardar/i.test(caido.msg || ''), caido);

  console.log('=== ERRORES DE CONSOLA ===');
  console.log(errors.length ? errors.slice(0, 6).join('\n') : '(ninguno)');

  console.log('\n=== RESULTADO: ' + pass + ' OK, ' + fail + ' fallos ===');
  ws.close();
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('FATAL ' + e.message); process.exit(1); });
