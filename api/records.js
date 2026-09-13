/**
 * ARC NETWORK — LEADERBOARD API para VERCEL / NETLIFY (función serverless)
 *
 * POR QUÉ EXISTE ESTE ARCHIVO:
 * En Vercel no hay PHP, así que api/records.php no ejecuta nada (se sirve como
 * texto). Este handler es el backend real en hostings Node.
 *
 * ALMACENAMIENTO (ver api/_storage.js):
 *   - Con KV_REST_API_URL + KV_REST_API_TOKEN (Upstash/Vercel KV) => Redis, persistente.
 *   - Sin ellas => /tmp, funcional pero NO persistente (el endpoint lo avisa).
 *
 * Rutas:
 *   GET  /api/records                 -> { success, allTime, weekly, storage }
 *   GET  /api/records?debug=1         -> + diagnóstico del backend y almacenamiento
 *   POST /api/records {entry:{...}}   -> valida firma v2 + wallet y guarda
 *   OPTIONS                           -> CORS preflight
 *
 * La lógica de validación/ranking vive en api/_records-core.js, compartida con
 * api/records.node.js. api/records.php replica las mismas reglas para Hostinger.
 */
const storage = require('./_storage.js');
const core = require('./_records-core.js');

const ALLTIME_KEY = 'leaderboard';
const WEEKLY_KEY = 'weekly';
const EPOCH_KEY = 'weekly_epoch';
const RATE_KEY = 'ratelimit';

function setHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, payload) {
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch (e) { return null; }
    }
    return req.body; // Vercel ya lo parseó
  }
  return await new Promise(function (resolve) {
    let data = '';
    let tooBig = false;
    req.on('data', function (chunk) {
      data += chunk;
      if (data.length > core.MAX_BODY) tooBig = true;
    });
    req.on('end', function () {
      if (tooBig) return resolve('__TOO_BIG__');
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve(null); }
    });
    req.on('error', function () { resolve(null); });
  });
}

async function ensureWeeklyEpoch() {
  const now = Date.now();
  const raw = await storage.load(EPOCH_KEY);
  const state = core.checkWeeklyEpoch(raw, now);
  if (state.reset) {
    await storage.save(EPOCH_KEY, state.epoch);
    await storage.save(WEEKLY_KEY, []);
  }
  return state.epoch;
}

module.exports = async function handler(req, res) {
  setHeaders(res);

  const method = (req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return json(res, 200, { ok: true });

  const url = req.url || '/';
  const params = new URLSearchParams((url.split('?')[1] || ''));
  const wantsDebug = params.get('debug') === '1';

  const diag = {
    api: 'records.js (serverless Node)',
    storage: storage.describe(),
    storageAvailable: storage.available()
  };

  try {
    if (method === 'GET') {
      const allTime = (await storage.load(ALLTIME_KEY)) || [];
      const weekly = (await storage.load(WEEKLY_KEY)) || [];
      const payload = { success: true, allTime: allTime, weekly: weekly, storage: diag.storage };
      if (wantsDebug) payload.diagnostics = diag;
      return json(res, 200, payload);
    }

    if (method === 'POST') {
      const body = await readBody(req);
      if (body === '__TOO_BIG__') return json(res, 413, { error: 'Payload too large' });
      if (!body) return json(res, 400, { error: 'Invalid JSON body' });

      const nowMs = Date.now();
      const check = core.validateEntry(body, nowMs);
      if (check.error) {
        const out = { error: check.error, storage: diag.storage };
        if (wantsDebug) out.diagnostics = diag;
        return json(res, check.status, out);
      }

      // Rate limit + nonce único por IP
      const rlTable = (await storage.load(RATE_KEY)) || {};
      const ip = core.clientIp(req.headers || {}, (req.socket && req.socket.remoteAddress) || 'unknown');
      const rl = core.checkRateLimit(rlTable, ip, check.entry._n, nowMs);
      if (rl.error) {
        await storage.save(RATE_KEY, rl.table);
        return json(res, 429, { error: rl.error, storage: diag.storage });
      }
      await storage.save(RATE_KEY, rl.table);

      await ensureWeeklyEpoch();

      const allTime = core.updateOrInsert((await storage.load(ALLTIME_KEY)) || [], check.entry);
      const savedAll = await storage.save(ALLTIME_KEY, allTime);
      const weekly = core.updateOrInsert((await storage.load(WEEKLY_KEY)) || [], check.entry);
      const savedWeekly = await storage.save(WEEKLY_KEY, weekly);

      if (!savedAll || !savedWeekly) {
        return json(res, 500, {
          error: 'Storage write failed on the server',
          storage: diag.storage,
          diagnostics: diag
        });
      }

      const out = {
        success: true,
        message: 'Record recorded successfully',
        allTime: allTime,
        weekly: weekly,
        storage: diag.storage
      };
      if (!diag.storage.persistent) out.warning = diag.storage.note;
      return json(res, 200, out);
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(res, 500, {
      error: 'Server error: ' + (err && err.message ? err.message : 'unknown'),
      diagnostics: diag
    });
  }
};
