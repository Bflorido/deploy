/**
 * Pruebas de integración del backend de records (Node) y de la firma v3.
 * Uso:  node tools/dev/api-records-test.js
 * Arranca api/records.node.js en un puerto libre con un directorio temporal,
 * así no toca data/ del proyecto.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 8791;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-test-'));
process.env.ARC_DATA_DIR = dataDir;

/** FNV-1a del cliente (js/console.js) */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}
const SALT = 'ARC_VIRUS_v5_SALT_9973';

function clientSig(e) {
  return fnv1a((e.name || '') + '|' + (e.score || 0) + '|' + (e.round || 0) + '|' + (e.date || '') +
    '|' + (e._ts || 0) + '|' + (e._n || '') + '|' + (e.wallet || '') + '|' + SALT);
}

/** Réplica EXACTA del fnvMul32 de api/records.php (acarreo con mitades de 16 bits). */
function fnvMul32php(h, prime) {
  const aLo = h & 0xFFFF;
  const aHi = (h >>> 16) & 0xFFFF;
  const mid = ((((aLo * prime) >>> 16) + aHi * prime) & 0xFFFF);
  return (((mid * 65536) >>> 0) | ((aLo * prime) & 0xFFFF)) >>> 0;
}
/** Verdad matemática: (h * prime) mod 2^32 con precisión arbitraria */
function fnvMulTruth(h, prime) {
  return Number((BigInt(h) * BigInt(prime)) % 4294967296n);
}
function phpSig(e) {
  const str = e.name + '|' + e.score + '|' + e.round + '|' + e.date + '|' + e._ts + '|' + e._n + '|' + e.wallet + '|' + SALT;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h = (h ^ str.charCodeAt(i)) >>> 0; h = fnvMul32php(h, 0x01000193); }
  return h.toString(16);
}

const core = require(path.join(__dirname, '..', '..', 'api', '_records-core.js'));

function req(method, pathName, body) {
  return new Promise(function (resolve, reject) {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port: PORT, path: pathName, method: method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
    }, function (res) {
      let d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        let json = null; try { json = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, json: json });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function entryFor(name, score, round, wallet) {
  const e = { name: name, score: score, round: round, date: '01/15/2026', wallet: wallet };
  e._ts = Date.now();
  e._n = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  e._sig = clientSig(e);
  return e;
}
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  -> ' + JSON.stringify(extra) : '')); }
}

(async function () {
  console.log('=== 1. FNV: cliente (Math.imul), PHP (fnvMul32) y verdad BigInt ===');
  let truthBad = 0, imulBad = 0, phpBad = 0;
  for (let i = 0; i < 20000; i++) {
    const h = (Math.random() * 0x100000000) >>> 0;
    const truth = fnvMulTruth(h, 0x01000193);
    if (fnvMul32php(h, 0x01000193) !== truth) phpBad++;
    if (((Math.imul(h, 0x01000193)) >>> 0) !== truth) imulBad++;
  }
  check('fnvMul32 de PHP === verdad (20000 casos)', phpBad === 0, { phpBad: phpBad });
  check('Math.imul del cliente === verdad (20000 casos)', imulBad === 0, { imulBad: imulBad });

  // Riesgo real que motivó el cambio: en un PHP de 32 bits, `$h * $prime` pasa a
  // float y pierde los bits bajos. Se mide cuánto diverge esa vía.
  function fnvMul32bitBuild(h, prime) { return Math.fround(h * prime) % 4294967296; }
  let bit32Diff = 0;
  for (let i = 0; i < 2000; i++) {
    const h = (Math.random() * 0x100000000) >>> 0;
    if (fnvMul32bitBuild(h, 0x01000193) !== fnvMulTruth(h, 0x01000193)) bit32Diff++;
  }
  console.log('  (referencia: en un PHP de 32 bits la multiplicación directa divergiría en ' + bit32Diff + '/2000 casos)');
  check('el fnvMul32 troceado evita ese riesgo', bit32Diff > 0 && phpBad === 0);

  const sample = { name: 'PILOTO', score: 12345, round: 4, date: '01/15/2026', wallet: '0x1234567890abcdef1234567890abcdef12345678', _ts: 1768500000000, _n: 'abc123def456' };
  const a = clientSig(sample), b = core.computeSig(sample, SALT), c = phpSig(sample);
  console.log('  cliente=' + a + '  coreNode=' + b + '  php=' + c);
  check('cliente === núcleo Node', a === b);
  check('cliente === PHP corregido', a === c);

  // Cadenas de longitudes variadas (el fallo antiguo aparecía a partir de ~16 chars)
  let lenFail = 0;
  for (let len = 1; len <= 120; len++) {
    const e = { name: 'A'.repeat(Math.min(len, 10)), score: len * 7, round: len, date: '01/15/2026', wallet: 'vitalik.eth', _ts: 1768500000000 + len, _n: 'n' + len };
    if (clientSig(e) !== phpSig(e)) lenFail++;
  }
  check('coincide en 120 longitudes distintas de payload', lenFail === 0, { lenFail: lenFail });

  console.log('=== 2. Validación de wallet ===');
  check('wallet 0x válida', core.cleanWallet('0x1234567890abcdef1234567890abcdef12345678') === '0x1234567890abcdef1234567890abcdef12345678');
  check('wallet 0x se normaliza a minúsculas', core.cleanWallet('0xABCDEF7890abcdef1234567890abcdef12345678') === '0xabcdef7890abcdef1234567890abcdef12345678');
  check('wallet ENS válida', core.cleanWallet('vitalik.eth') === 'vitalik.eth');
  check('wallet corta rechazada', core.cleanWallet('0x1234') === '');
  check('wallet vacía rechazada', core.cleanWallet('') === '');
  check('texto aleatorio rechazado', core.cleanWallet('mi-wallet-123') === '');

  const proc = spawn(process.execPath, [path.join(__dirname, '..', '..', 'api', 'records.node.js'), String(PORT)], {
    env: Object.assign({}, process.env, { ARC_DATA_DIR: dataDir }), stdio: 'ignore'
  });
  await sleep(1200);

  try {
    console.log('=== 3. GET inicial ===');
    const g0 = await req('GET', '/api/records');
    check('GET responde 200', g0.status === 200, g0);
    check('allTime vacío', Array.isArray(g0.json.allTime) && g0.json.allTime.length === 0);
    check('expone diagnóstico de almacenamiento', !!(g0.json.storage && g0.json.storage.backend), g0.json.storage);

    console.log('=== 4. POST sin wallet -> rechazado ===');
    const sinWallet = entryFor('NOVA', 5000, 2, '');
    const r1 = await req('POST', '/api/records', { entry: sinWallet });
    check('responde 422', r1.status === 422, r1);
    check('mensaje menciona wallet', /wallet/i.test(r1.json.error || ''), r1.json);

    console.log('=== 5. POST con wallet inválida -> rechazado ===');
    const r2 = await req('POST', '/api/records', { entry: entryFor('NOVA', 5000, 2, 'no-es-wallet') });
    check('responde 422', r2.status === 422, r2);

    console.log('=== 6. POST con firma manipulada -> rechazado ===');
    const malFirmada = entryFor('NOVA', 5000, 2, '0x1234567890abcdef1234567890abcdef12345678');
    malFirmada._sig = 'deadbeef';
    const r3 = await req('POST', '/api/records', { entry: malFirmada });
    check('responde 403', r3.status === 403, r3);

    console.log('=== 7. POST válido -> guardado con wallet ===');
    const ok = entryFor('NOVA', 5000, 2, '0x1234567890abcdef1234567890abcdef12345678');
    const r4 = await req('POST', '/api/records', { entry: ok });
    check('responde 200', r4.status === 200, r4);
    check('guardado en allTime', !!(r4.json.allTime && r4.json.allTime.length === 1), r4.json);
    check('la wallet se guarda', r4.json.allTime[0].wallet === '0x1234567890abcdef1234567890abcdef12345678', r4.json.allTime[0]);
    check('nombre normalizado a mayúsculas', r4.json.allTime[0].name === 'NOVA', r4.json.allTime[0]);
    check('avisa si el almacenamiento no es persistente', typeof r4.json.warning === 'string', Object.keys(r4.json));

    console.log('=== 8. Persistencia: GET lo devuelve ===');
    const g1 = await req('GET', '/api/records');
    check('allTime tiene 1 registro', g1.json.allTime.length === 1, g1.json.allTime);
    check('weekly tiene 1 registro', g1.json.weekly.length === 1, g1.json.weekly);

    console.log('=== 9. Dedupe por piloto (conserva el mejor) ===');
    await sleep(8100); // respeta el gap anti-spam de 8 s
    const mejor = entryFor('NOVA', 9999, 5, 'vitalik.eth');
    const r5 = await req('POST', '/api/records', { entry: mejor });
    check('responde 200', r5.status === 200, r5);
    check('un solo registro de NOVA', r5.json.allTime.filter(function (e) { return e.name === 'NOVA'; }).length === 1, r5.json.allTime);
    check('conserva la puntuación mayor', r5.json.allTime[0].score === 9999, r5.json.allTime[0]);

    console.log('=== 10. Rate limit ===');
    await sleep(8100); // deja pasar la ventana anti-spam para partir de un estado limpio
    const t0 = Date.now();
    const rl1 = await req('POST', '/api/records', { entry: entryFor('VELOZ', 100, 1, 'veloz.eth') });
    const t1 = Date.now();
    check('primer envío tras la espera -> 200', rl1.status === 200, rl1);
    const r6 = await req('POST', '/api/records', { entry: entryFor('RAPIDO', 100, 1, 'rapido.eth') });
    const t2 = Date.now();
    console.log('  (t del 1er POST=' + t0 + ' respuesta=' + t1 + ' | 2º POST=' + t1 + ' respuesta=' + t2 + ' -> separación ' + (t1 - t0) + ' ms)');
    check('envío inmediatamente siguiente -> 429', r6.status === 429, r6);

    console.log('=== 11. Diagnóstico ?debug=1 ===');
    const g2 = await req('GET', '/api/records');
    check('GET normal no expone diagnostics', g2.json.diagnostics === undefined);
    const g3 = await req('GET', '/api/records?debug=1');
    check('GET ?debug=1 expone diagnostics', !!(g3.json && g3.json.diagnostics), g3.json);
    check('debug informa el almacenamiento', !!(g3.json.diagnostics && g3.json.diagnostics.storage.backend), g3.json.diagnostics);
  } finally {
    proc.kill();
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n=== RESULTADO: ' + pass + ' OK, ' + fail + ' fallos ===');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('FATAL ' + e.message); process.exit(1); });
