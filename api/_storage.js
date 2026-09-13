/**
 * ARC NETWORK — ALMACENAMIENTO ADAPTATIVO DEL LEADERBOARD (solo Node)
 *
 * Resuelve el problema de fondo: en un host serverless (Vercel, Netlify,
 * Cloudflare) el filesystem es de solo lectura y `/tmp` es efímero, así que
 * escribir los JSON junto al proyecto no persiste nada.
 *
 * Estrategia:
 *   1. Si existen las variables de Upstash / Vercel KV, se usa Redis vía REST
 *      (persistencia real, plan gratuito).
 *   2. Si no, se usa /tmp (funciona, pero los datos pueden perderse al reciclar
 *      la instancia). El endpoint lo declara en su respuesta para que el cliente
 *      pueda avisar al jugador.
 *
 * Interfaz (todo async):
 *   describe()    -> { backend, persistent, note }
 *   available()   -> boolean
 *   load(key)     -> valor o null
 *   save(key,val) -> boolean
 */
const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const HAS_KV = !!(KV_URL && KV_TOKEN);
const PREFIX = 'arc:records:';

/** Directorio de datos: ARC_DATA_DIR permite redirigirlo (tests, volúmenes). */
function dataDir(){
  return process.env.ARC_DATA_DIR || path.join(require('os').tmpdir(), 'arc-records');
}

function redisCmd(args) {
  return fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  }).then(function (r) {
    // El endpoint raíz de Upstash acepta un comando plano; si el proxy devuelve
    // un array de resultados (pipeline) también lo toleramos.
    return r.json();
  });
}

function kvLoad(key) {
  return redisCmd(['GET', PREFIX + key]).then(function (data) {
    if (!data) return null;
    const val = (data.result !== undefined) ? data.result : data;
    if (val === null || val === undefined || val === '') return null;
    try { return (typeof val === 'string') ? JSON.parse(val) : val; } catch (e) { return null; }
  });
}

function kvSave(key, value) {
  return redisCmd(['SET', PREFIX + key, JSON.stringify(value)]).then(function (data) {
    return !!(data && (data.result === 'OK' || data.result === true || data.error === undefined));
  });
}

function ensureTmp() {
  const dir = dataDir();
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
}

function fileFor(key) { return path.join(dataDir(), key + '.json'); }

function fileLoad(key) {
  try {
    const f = fileFor(key);
    if (!fs.existsSync(f)) return null;
    const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
    // Se aceptan arrays (leaderboard, weekly) y objetos (ratelimit, epoch):
    // devolver solo arrays hacía que la tabla de rate limit se leyera como null
    // y el limitador nunca se aplicara.
    return (parsed === null || parsed === undefined) ? null : parsed;
  } catch (e) { return null; }
}

function fileSave(key, value) {
  try {
    ensureTmp();
    fs.writeFileSync(fileFor(key), JSON.stringify(value, null, 2), 'utf8');
    return true;
  } catch (e) { return false; }
}

module.exports = {
  describe: function () {
    return HAS_KV
      ? { backend: 'upstash-redis', persistent: true, note: 'Persistencia real vía Redis (KV_REST_API_URL).' }
      : { backend: 'tmp-filesystem', persistent: false, note: 'Almacenamiento temporal: en un host serverless los records pueden perderse al reciclar la instancia. Configura KV_REST_API_URL y KV_REST_API_TOKEN (Upstash, plan gratuito) para persistencia real.' };
  },
  available: function () {
    if (HAS_KV) return true;
    try { ensureTmp(); fs.accessSync(dataDir(), fs.constants.W_OK); return true; } catch (e) { return false; }
  },
  load: async function (key) {
    if (HAS_KV) {
      try { const v = await kvLoad(key); if (v !== null) return v; } catch (e) {}
    }
    return fileLoad(key);
  },
  save: async function (key, value) {
    if (HAS_KV) {
      try { if (await kvSave(key, value)) return true; } catch (e) {}
    }
    return fileSave(key, value);
  }
};
