/**
 * ARC NETWORK — NÚCLEO COMPARTIDO DEL LEADERBOARD (Node)
 *
 * Fuente única de la lógica de validación/ranking para los dos backends Node:
 *   - api/records.js       → función serverless (Vercel/Netlify)
 *   - api/records.node.js  → servidor Node clásico (http.createServer)
 *
 * La versión PHP (api/records.php) replica esta misma lógica byte a byte y es
 * la fuente de verdad en hostings con PHP (Hostinger). Si tocas una regla aquí,
 * replica el cambio allí.
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SEC_SALT = 'ARC_VIRUS_v5_SALT_9973';

// --- Perillas de endurecimiento ---
const FRESH_WINDOW_MS = 10 * 60 * 1000;  // ventana de frescura de la firma
const MIN_POST_GAP_MS = 8000;            // separación mínima entre envíos por IP
const MAX_POSTS_PER_DAY = 200;           // tope diario por IP
const ABS_SCORE_CAP = 2000000;           // techo absoluto de puntuación
const PER_ROUND_BUDGET = 6000;           // puntuación plausible por ronda
const ROUND_GRACE = 20000;               // margen base
const MAX_BODY = 8192;

/** Firma FNV-1a v2: name|score|round|date|ts|nonce|wallet|salt */
function computeSig(entry, salt) {
  const str = (entry.name || '') + '|' + (entry.score || 0) + '|' + (entry.round || 0) + '|' +
    (entry.date || '') + '|' + (entry._ts || 0) + '|' + (entry._n || '') + '|' +
    (entry.wallet || '') + '|' + (salt || SEC_SALT);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Acepta 0x + 40 hex (EVM) o un ENS tipo nombre.eth */
function cleanWallet(w) {
  const s = String(w == null ? '' : w).trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return s.toLowerCase();
  if (/^[a-z0-9][a-z0-9-]{1,61}\.eth$/i.test(s)) return s.toLowerCase();
  return '';
}

function cleanName(n) {
  const s = String(n == null ? '' : n).toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 10);
  return s || 'PILOT';
}

/** Una entrada por piloto (nombre), conservando la mejor puntuación. */
function deduplicateAndRank(list) {
  if (!Array.isArray(list)) return [];
  const map = new Map();
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || typeof entry.score !== 'number') continue;
    const cleanN = cleanName(entry.name);
    const normalized = {
      name: cleanN,
      score: entry.score,
      round: entry.round || 1,
      date: entry.date || new Date().toLocaleDateString('en-US'),
      wallet: cleanWallet(entry.wallet),
      _ts: entry._ts || 0,
      _n: entry._n || '',
      _sig: entry._sig || ''
    };
    if (!map.has(cleanN)) {
      map.set(cleanN, normalized);
    } else {
      const cur = map.get(cleanN);
      const better = normalized.score > cur.score ||
        (normalized.score === cur.score && (normalized.round || 1) > (cur.round || 1)) ||
        (normalized.score === cur.score && (normalized.round || 1) === (cur.round || 1) && !cur.wallet && normalized.wallet);
      if (better) map.set(cleanN, normalized);
    }
  }
  const unique = Array.from(map.values());
  unique.sort(function (a, b) { return (b.score - a.score) || ((b.round || 1) - (a.round || 1)); });
  return unique.slice(0, 10);
}

function updateOrInsert(list, entry) {
  const clean = Array.isArray(list) ? list.slice() : [];
  clean.push(entry);
  return deduplicateAndRank(clean);
}

/**
 * Valida y normaliza un envío. Devuelve { error, status } o { entry }.
 * No toca almacenamiento: eso lo hace cada backend.
 */
function validateEntry(body, nowMs) {
  const raw = body && body.entry;
  if (!raw || typeof raw !== 'object') return { status: 400, error: 'Invalid entry payload' };
  if (raw.name === undefined || raw.score === undefined || raw.round === undefined) {
    return { status: 400, error: 'Invalid entry payload' };
  }

  const name = cleanName(raw.name);
  const score = Math.max(0, Math.floor(Number(raw.score) || 0));
  const round = Math.max(1, Math.min(999, Math.floor(Number(raw.round) || 1)));
  const date = String(raw.date || '').replace(/<[^>]*>/g, '').slice(0, 20) || new Date().toLocaleDateString('en-US');
  const sig = String(raw._sig || '');
  const ts = Number(raw._ts) || 0;
  const nonce = String(raw._n || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
  const wallet = cleanWallet(raw.wallet);

  // 1. Wallet obligatoria: sin dirección no se registra el record
  if (!wallet) {
    return { status: 422, error: 'Wallet required: a valid 0x… address or name.eth is mandatory to save a record' };
  }
  // 2. Frescura de la firma (anti reenvío de firmas precalculadas)
  if (ts <= 0 || Math.abs(nowMs - ts) > FRESH_WINDOW_MS) {
    return { status: 403, error: 'Stale or invalid timestamp' };
  }
  // 3. Nonce obligatorio
  if (nonce.length < 8) {
    return { status: 403, error: 'Missing submission nonce' };
  }

  const entry = { name, score, round, date, wallet, _ts: ts, _n: nonce, _sig: sig };

  // 4. Firma v2 (incluye ts, nonce y wallet)
  if (sig !== computeSig(entry, SEC_SALT)) {
    return { status: 403, error: 'Cryptographic signature mismatch' };
  }
  // 5. Plausibilidad según la ronda alcanzada
  const maxPlausible = Math.min(ABS_SCORE_CAP, round * PER_ROUND_BUDGET + ROUND_GRACE);
  if (score > maxPlausible) {
    return { status: 422, error: 'Score exceeds plausible value for the round reached' };
  }
  return { entry: entry };
}

function clientIp(headers, fallback) {
  const h = headers || {};
  const fwd = h['x-forwarded-for'] || h['x-real-ip'] || '';
  const ip = String(fwd).split(',')[0].trim() || fallback || 'unknown';
  return ip.replace(/[^0-9a-fA-F:.]/g, '') || 'unknown';
}

/** Rate limit por IP + nonce único (anti replay). Devuelve mensaje de error o null. */
function checkRateLimit(rl, ip, nonce, nowMs) {
  const table = (rl && typeof rl === 'object') ? rl : {};
  // Garbage-collect de entradas con más de 24 h
  Object.keys(table).forEach(function (k) {
    if (!table[k] || !table[k].day || (nowMs - table[k].day) > 86400000) delete table[k];
  });
  const entry = table[ip] || { last: 0, count: 0, day: nowMs, nonces: [] };
  if ((nowMs - entry.last) < MIN_POST_GAP_MS) {
    return { error: 'Rate limited: too many submissions, wait a few seconds', table: table };
  }
  if (entry.count >= MAX_POSTS_PER_DAY) {
    return { error: 'Rate limited: daily submission cap reached', table: table };
  }
  if (entry.nonces.indexOf(nonce) >= 0) {
    return { error: 'Replay detected: nonce already used', table: table };
  }
  entry.last = nowMs;
  entry.count = (entry.count || 0) + 1;
  entry.nonces = (entry.nonces || []).concat([nonce]).slice(-64);
  table[ip] = entry;
  return { error: null, table: table };
}

/** Comprueba el epoch semanal y devuelve { epoch, reset } (reset = hubo que limpiar). */
function checkWeeklyEpoch(epochRaw, nowMs) {
  const epoch = Number(epochRaw) || 0;
  if (!epoch || (nowMs - epoch) >= WEEK_MS) return { epoch: nowMs, reset: true };
  return { epoch: epoch, reset: false };
}

module.exports = {
  WEEK_MS, SEC_SALT, FRESH_WINDOW_MS, MIN_POST_GAP_MS, MAX_POSTS_PER_DAY,
  ABS_SCORE_CAP, PER_ROUND_BUDGET, ROUND_GRACE, MAX_BODY,
  computeSig, cleanWallet, cleanName, deduplicateAndRank, updateOrInsert,
  validateEntry, clientIp, checkRateLimit, checkWeeklyEpoch
};
