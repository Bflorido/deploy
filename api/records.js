// ARC NETWORK - GLOBAL LEADERBOARD & RECORDS API (hardened v2, Node mirror)
// NOTE: api/records.php is the production source of truth. This file mirrors
// its logic exactly for Node/Vercel-style hosts. Keep both in sync.
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const allTimeFile = path.join(dataDir, 'leaderboard.json');
const weeklyFile = path.join(dataDir, 'weekly.json');
const weeklyEpochFile = path.join(dataDir, 'weekly_epoch.txt');
const rateFile = path.join(dataDir, 'ratelimit.json');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SEC_SALT = 'ARC_VIRUS_v5_SALT_9973';

// --- Hardening knobs ---
const FRESH_WINDOW_MS = 10 * 60 * 1000;
const MIN_POST_GAP_MS = 8000;
const MAX_POSTS_PER_DAY = 200;
const ABS_SCORE_CAP = 2000000;
const PER_ROUND_BUDGET = 6000;
const ROUND_GRACE = 20000;

function computeSig(entry, salt) {
  const str = (entry.name || '') + '|' + (entry.score || 0) + '|' + (entry.round || 0) + '|' + (entry.date || '') +
    '|' + (entry._ts || 0) + '|' + (entry._n || '') + '|' + salt;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function loadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : (typeof parsed === 'object' && parsed !== null ? parsed : []);
  } catch (e) {
    return [];
  }
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function checkWeeklyEpoch() {
  const now = Date.now();
  let epoch = 0;
  try {
    if (fs.existsSync(weeklyEpochFile)) {
      epoch = parseInt(fs.readFileSync(weeklyEpochFile, 'utf8'), 10) || 0;
    }
  } catch (e) {}
  if (!epoch || (now - epoch) >= WEEK_MS) {
    epoch = now;
    try {
      fs.writeFileSync(weeklyEpochFile, epoch.toString(), 'utf8');
      saveJson(weeklyFile, []);
    } catch (e) {}
  }
  return epoch;
}

function deduplicateAndRank(list) {
  if (!Array.isArray(list)) return [];
  const map = new Map();
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || typeof entry.score !== 'number') continue;
    const cleanName = (entry.name || 'PILOT').trim().toUpperCase().slice(0, 10) || 'PILOT';
    const normalized = {
      name: cleanName,
      score: entry.score,
      round: entry.round || 1,
      date: entry.date || new Date().toLocaleDateString('en-US'),
      _ts: entry._ts || 0,
      _n: entry._n || '',
      _sig: entry._sig || ''
    };
    if (!map.has(cleanName)) {
      map.set(cleanName, normalized);
    } else {
      const existing = map.get(cleanName);
      if (normalized.score > existing.score || (normalized.score === existing.score && normalized.round > existing.round)) {
        map.set(cleanName, normalized);
      }
    }
  }
  const unique = Array.from(map.values());
  unique.sort((a, b) => (b.score - a.score) || (b.round - a.round));
  return unique.slice(0, 10);
}

function updateOrInsert(list, newEntry) {
  const clean = Array.isArray(list) ? list.slice() : [];
  clean.push(newEntry);
  return deduplicateAndRank(clean);
}

function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  const ip = (fwd ? String(fwd).split(',')[0] : (req.socket && req.socket.remoteAddress) || 'unknown').trim();
  return ip.replace(/[^0-9a-fA-F:\.]/g, '');
}

function checkRateLimit(nonce) {
  const nowMs = Date.now();
  const rlRaw = loadJson(rateFile);
  const rl = (rlRaw && !Array.isArray(rlRaw)) ? rlRaw : {};
  const ip = clientIpCache;
  for (const k of Object.keys(rl)) {
    if (!rl[k].day || (nowMs - rl[k].day) > 86400000) delete rl[k];
  }
  const entry = rl[ip] || { last: 0, count: 0, day: nowMs, nonces: [] };

  if ((nowMs - entry.last) < MIN_POST_GAP_MS) { saveJson(rateFile, rl); return 'Rate limited: too many submissions, wait a few seconds'; }
  if (entry.count >= MAX_POSTS_PER_DAY) return 'Rate limited: daily submission cap reached';
  if (entry.nonces.includes(nonce)) return 'Replay detected: nonce already used';

  entry.last = nowMs;
  entry.count = entry.count + 1;
  entry.nonces.push(nonce);
  if (entry.nonces.length > 64) entry.nonces = entry.nonces.slice(-64);
  rl[ip] = entry;
  saveJson(rateFile, rl);
  return null;
}

let clientIpCache = 'unknown';

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  checkWeeklyEpoch();
  clientIpCache = clientIp(req);

  if (req.method === 'GET') {
    const allTime = loadJson(allTimeFile);
    const weekly = loadJson(weeklyFile);
    res.statusCode = 200;
    return res.end(JSON.stringify({ success: true, allTime, weekly }));
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      if (body.length > 8192) { res.statusCode = 413; return res.end(JSON.stringify({ error: 'Payload too large' })); }
      try { body = JSON.parse(body); } catch(e) {}
    }
    const entry = body && body.entry;
    if (!entry || typeof entry.score !== 'number' || !entry.name || entry.round === undefined) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Invalid entry payload' }));
    }

    const nowMs = Date.now();
    const name = String(entry.name).trim().toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 10) || 'PILOT';
    const score = Math.max(0, parseInt(entry.score, 10) || 0);
    const round = Math.max(1, Math.min(999, parseInt(entry.round, 10) || 1));
    const date = String(entry.date || new Date().toLocaleDateString('en-US')).slice(0, 20);
    const sig = String(entry._sig || '');
    const ts = parseFloat(entry._ts) || 0;
    const nonce = String(entry._n || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);

    // 1. Timestamp freshness
    if (ts <= 0 || Math.abs(nowMs - ts) > FRESH_WINDOW_MS) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: 'Stale or invalid timestamp' }));
    }
    // 2. Nonce required
    if (nonce.length < 8) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: 'Missing submission nonce' }));
    }

    const sanitized = { name, score, round, date, _ts: ts, _n: nonce, _sig: sig };

    // 3. Signature (v2)
    if (sig !== computeSig(sanitized, SEC_SALT)) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: 'Cryptographic signature mismatch' }));
    }

    // 4. Plausibility
    const maxPlausible = Math.min(ABS_SCORE_CAP, round * PER_ROUND_BUDGET + ROUND_GRACE);
    if (score > maxPlausible) {
      res.statusCode = 422;
      return res.end(JSON.stringify({ error: 'Score exceeds plausible value for the round reached' }));
    }

    // 5. Rate limiting + replay protection
    const rlError = checkRateLimit(nonce);
    if (rlError) {
      res.statusCode = 429;
      return res.end(JSON.stringify({ error: rlError }));
    }

    const allTime = updateOrInsert(loadJson(allTimeFile), sanitized);
    saveJson(allTimeFile, allTime);

    const weekly = updateOrInsert(loadJson(weeklyFile), sanitized);
    saveJson(weeklyFile, weekly);

    res.statusCode = 200;
    return res.end(JSON.stringify({ success: true, allTime, weekly }));
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
