// A static server that answers like the live site: every file `public, max-age=0,
// must-revalidate` with an ETag (docs/reports/2026-11-07-live-site-measurements.md), gzip,
// and a fixed delay per request standing in for a phone's round trip. Revalidations come
// back 304, so a waterfall of conditional requests (a Web Worker loading its module graph,
// which the page's modulepreload links do not cover) shows up as it does on the real site.
// Usage: node platform/perf/revalidate-serve.mjs <built-site-dir> <port> <delay-ms>
//   GET /__log lists requests since start or the last GET /__reset ({ t, u, st }).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
const root = path.resolve(process.argv[2]); const port = +process.argv[3]; const delay = +process.argv[4];
const types = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.txt':'text/plain' };
const log = []; let t0 = Date.now();
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/__log') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(log)); return; }
  if (u === '/__reset') { log.length = 0; t0 = Date.now(); res.end('ok'); return; }
  // Serve only files inside the site directory: a `..` request must not reach the rest of the disk.
  let f = path.resolve(root, '.' + u);
  if (f === root) f = path.join(root, 'index.html');
  if (!f.startsWith(root + path.sep)) { res.statusCode = 404; res.end(); return; }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  setTimeout(() => {
    if (!fs.existsSync(f)) { res.statusCode = 404; res.end(); return; }
    const body = fs.readFileSync(f); const etag = '"' + crypto.createHash('md5').update(body).digest('hex') + '"';
    const st = req.headers['if-none-match'] === etag ? 304 : 200;
    log.push({ t: Date.now() - t0, u, st });
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate'); res.setHeader('ETag', etag);
    res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream');
    if (st === 304) { res.statusCode = 304; res.end(); return; }
    res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync(body));
  }, delay);
}).listen(port);
