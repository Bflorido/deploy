/**
 * Recupera líneas de js/console.js desde el transcript de la sesión.
 * Los bloques vienen como <path>…</path> … <content>\n1: …\n</content> dentro de
 * una cadena JSON, así que los saltos están escapados como \\n y hay que
 * desescaparlos antes de parsear los números de línea.
 *
 * Uso: node tools/dev/_recover-console.js <transcript.jsonl> [--list]
 */
const fs = require('fs');
const path = require('path');

const t = process.argv[2];
const listOnly = process.argv.indexOf('--list') >= 0;
if (!t || !fs.existsSync(t)) { console.log('FATAL: falta el transcript'); process.exit(1); }

const raw = fs.readFileSync(t, 'utf8');
const lineRe = /^\s*(\d+)(?::|→)\s?(.*)$/;

function unescapeJson(s) {
  try { return JSON.parse('"' + s.replace(/"/g, '\\"') + '"'); }
  catch (e) {
    return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

const found = new Map();     // n -> contenido
const bloques = [];          // informe
let pos = 0;
while (true) {
  const open = raw.indexOf('<content>', pos);
  if (open < 0) break;
  const close = raw.indexOf('</content>', open);
  if (close < 0) break;
  const body = unescapeJson(raw.slice(open + 9, close));
  const ps = raw.lastIndexOf('<path>', open);
  const pe = raw.indexOf('</path>', ps);
  const file = (ps >= 0 && pe > ps) ? raw.slice(ps + 6, pe) : '(sin ruta)';

  const lines = body.split('\n');
  let n = 0;
  lines.forEach(function (l) {
    const m = l.match(lineRe);
    if (!m) return;
    const num = parseInt(m[1], 10);
    if (!num || num > 20000) return;
    n++;
    if (file.indexOf('console.js') >= 0) {
      if (!found.has(num)) found.set(num, m[2]);
    }
  });
  bloques.push({ file: file, lineas: n, chars: body.length });
  pos = close + 10;
}

console.log('=== Bloques de lectura (' + bloques.length + ') ===');
bloques.forEach(function (b) {
  if (listOnly || b.file.indexOf('console.js') >= 0) {
    console.log('  ' + b.lineas + ' lineas | ' + b.chars + ' chars | ' + b.file);
  }
});

const nums = Array.from(found.keys()).sort(function (a, b) { return a - b; });
console.log('\n=== console.js ===');
console.log('lineas distintas recuperadas: ' + nums.length);
if (nums.length) {
  console.log('rango: ' + nums[0] + ' .. ' + nums[nums.length - 1]);
  const holes = [];
  let prev = nums[0];
  nums.forEach(function (x) { if (x > prev + 1) holes.push((prev + 1) + '-' + (x - 1)); prev = x; });
  console.log('huecos (' + holes.length + '): ' + holes.join(', '));
  const out = nums.map(function (x) { return x + '|' + found.get(x); }).join('\n');
  fs.writeFileSync(path.join(__dirname, '_recovered_lines.txt'), out, 'utf8');
  console.log('volcado: tools/dev/_recovered_lines.txt (' + out.length + ' bytes)');
}
