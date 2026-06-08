// Minimal static server for the Pink Trombone app, with the one thing that
// actually matters here: Content-Type carries `charset=utf-8`.
//
// The app's JS (e.g. src/utils-v2.js) contains IPA characters. A server that
// sends `text/javascript` WITHOUT a charset (e.g. `python -m http.server`)
// makes the browser misdecode those bytes, the script dies with
// "Invalid or unexpected token", window.isTTSReady never appears, and the
// whole generator hangs. Serving with charset=utf-8 avoids that.
//
// Usage: node serve.js [port]   (defaults to 8080; serves the repo root)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2], 10) || 8080;
const ROOT = path.resolve(__dirname, '..'); // pink-trombone-demos/

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`Serving ${ROOT} on http://localhost:${PORT} (charset=utf-8)`);
});
