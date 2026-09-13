/**
 * Servidor de desarrollo: sirve el sitio estático Y ejecuta el handler
 * serverless api/records.js, para poder probar en local el flujo completo del
 * leaderboard tal como funcionaría en Vercel.
 *
 *   node tools/dev/dev-server.js [puerto]      # por defecto 8099
 *
 * Solo desarrollo: no forma parte del despliegue.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(path.join(__dirname, '..', '..'));
const port = Number(process.argv[2] || 8099);
const recordsHandler = require(path.join(root, 'api', 'records.js'));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8'
};

http.createServer(function (req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // API de records -> ejecuta el handler serverless (igual que en Vercel)
  if (urlPath === '/api/records' || urlPath === '/api/records.js') {
    return recordsHandler(req, res);
  }

  const file = path.join(root, urlPath === '/' ? '/index.html' : urlPath);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found: ' + urlPath); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', function () {
  console.log('dev server: http://127.0.0.1:' + port + '  (estático + api/records.js)');
  console.log('  almacenamiento: ' + JSON.stringify(require(path.join(root, 'api', '_storage.js')).describe()));
});
