// Servidor estático mínimo para pruebas locales del proyecto.
// Uso:  node tools/dev/static-server.js [ruta-raiz] [puerto]
// Solo desarrollo: no forma parte del build ni del despliegue.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const port = Number(process.argv[3] || 8099);

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
  const file = path.join(root, urlPath === '/' ? '/index.html' : urlPath);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found: ' + urlPath); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', function () {
  console.log('static server: http://127.0.0.1:' + port + '  root=' + root);
});
