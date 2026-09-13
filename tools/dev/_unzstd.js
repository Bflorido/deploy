// Descomprime un .jsonl.zstd con marcos zstd concatenados.
// Uso: node tools/dev/_unzstd.js <origen> <destino>
const fs = require('fs');
const zlib = require('zlib');

const src = process.argv[2];
const dst = process.argv[3];
const buf = fs.readFileSync(src);

// Firma de marco zstd: 0x28 0xB5 0x2F 0xFD
const FRAME = Buffer.from([0x28, 0xB5, 0x2F, 0xFD]);
const starts = [];
let from = 0;
while (true) {
  const i = buf.indexOf(FRAME, from);
  if (i < 0) break;
  starts.push(i);
  from = i + 4;
}
console.log('marcos zstd encontrados: ' + starts.length);

const out = [];
let ok = 0, bad = 0;
for (let k = 0; k < starts.length; k++) {
  const s = starts[k];
  const e = (k + 1 < starts.length) ? starts[k + 1] : buf.length;
  try {
    out.push(zlib.zstdDecompressSync(buf.slice(s, e)));
    ok++;
  } catch (err) {
    bad++;
  }
}
console.log('marcos descomprimidos: ' + ok + ' | fallidos: ' + bad);
const total = Buffer.concat(out);
fs.writeFileSync(dst, total);
console.log('escrito ' + dst + ': ' + (total.length / 1024 / 1024).toFixed(2) + ' MB');
