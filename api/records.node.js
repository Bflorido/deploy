/**
 * ARC NETWORK — LEADERBOARD API para servidor Node clásico (http.createServer)
 *
 * Es el mismo backend que api/records.js pero como servidor autónomo, para
 * hosts Node donde se levanta un proceso propio.
 *
 *   node api/records.node.js [puerto]      # por defecto 8787
 *
 * Comparte toda la lógica con api/_records-core.js y el almacenamiento con
 * api/_storage.js, así que no hay reglas duplicadas. api/records.php es el
 * equivalente para hostings PHP (Hostinger) y debe mantenerse en sync.
 */
const http = require('http');
const storage = require('./_storage.js');
const core = require('./_records-core.js');

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const ALLTIME_KEY = 'leaderboard';
const WEEKLY_KEY = 'weekly';
const EPOCH_KEY = 'weekly_epoch';
const RATE_KEY = 'ratelimit';

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise(function (resolve) {
    let data = '', tooBig = false;
    req.on('data', function (c) { data += c; if (data.length > core.MAX_BODY) tooBig = true; });
    req.on('end', function () {
      if (tooBig) return resolve('__TOO_BIG__');
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve(null); }
    });
    req.on('error', function () { resolve(null); });
  });
}

async function ensureWeeklyEpoch() {
  const now = Date.now();
  const state = core.checkWeeklyEpoch(await storage.load(EPOCH_KEY), now);
  if (state.reset) {
    await storage.save(EPOCH_KEY, state.epoch);
    await storage.save(WEEKLY_KEY, []);
  }
  return state.epoch;
}

const server = http.createServer(async function (req, res) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return send(res, 200, { ok: true });

  const url = req.url || '/';
  const params = new URLSearchParams((url.split('?')[1] || ''));
  const wantsDebug = params.get('debug') === '1';
  const diag = {
    api: 'records.node.js (servidor Node)',
    storage: storage.describe(),
    storageAvailable: storage.available()
  };

  try {
    if (method === 'GET') {
      const allTime = (await storage.load(ALLTIME_KEY)) || [];
      const weekly = (await storage.load(WEEKLY_KEY)) || [];
      const payload = { success: true, allTime: allTime, weekly: weekly, storage: diag.storage };
      if (wantsDebug) payload.diagnostics = diag;
      return send(res, 200, payload);
    }

    if (method === 'POST') {
      const body = await readBody(req);
      if (body === '__TOO_BIG__') return send(res, 413, { error: 'Payload too large' });
      if (!body) return send(res, 400, { error: 'Invalid JSON body' });

      const nowMs = Date.now();
      const check = core.validateEntry(body, nowMs);
      if (check.error) {
        const out = { error: check.error, storage: diag.storage };
        if (wantsDebug) out.diagnostics = diag;
        return send(res, check.status, out);
      }

      const ip = core.clientIp(req.headers || {}, (req.socket && req.socket.remoteAddress) || 'unknown');
      const rl = core.checkRateLimit((await storage.load(RATE_KEY)) || {}, ip, check.entry._n, nowMs);
      if (process.env.ARC_DEBUG_RL) console.error('[RL] ip=' + ip + ' nowMs=' + nowMs + ' error=' + rl.error);
      if (rl.error) {
        await storage.save(RATE_KEY, rl.table);
        return send(res, 429, { error: rl.error, storage: diag.storage });
      }
      await storage.save(RATE_KEY, rl.table);

      await ensureWeeklyEpoch();

      const allTime = core.updateOrInsert((await storage.load(ALLTIME_KEY)) || [], check.entry);
      const weekly = core.updateOrInsert((await storage.load(WEEKLY_KEY)) || [], check.entry);
      const okAll = await storage.save(ALLTIME_KEY, allTime);
      const okWeek = await storage.save(WEEKLY_KEY, weekly);
      if (!okAll || !okWeek) {
        return send(res, 500, { error: 'Storage write failed on the server', storage: diag.storage, diagnostics: diag });
      }

      const out = { success: true, message: 'Record recorded successfully', allTime: allTime, weekly: weekly, storage: diag.storage };
      if (!diag.storage.persistent) out.warning = diag.storage.note;
      return send(res, 200, out);
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return send(res, 500, { error: 'Server error: ' + (err && err.message ? err.message : 'unknown'), diagnostics: diag });
  }
});

server.listen(PORT, function () {
  const s = storage.describe();
  console.log('ARC records API escuchando en http://127.0.0.1:' + PORT);
  console.log('  almacenamiento: ' + s.backend + (s.persistent ? ' (persistente)' : ' (NO persistente)'));
  if (!s.persistent) console.log('  aviso: ' + s.note);
});
