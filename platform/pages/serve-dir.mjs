// A static server for a built site directory on a free 127.0.0.1 port, for the
// browser checks here (fold-check.mjs, ask-suggestions-check.mjs). Moved out of
// fold-check.mjs on 2026-11-19 so the next check does not paste a third copy.
// Paths cannot leave the directory; a path ending in / serves its index.html.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/** Resolves to { srv, base } once listening. */
export async function serveDir(root) {
  const dir = path.resolve(root);
  const srv = http.createServer((q, r) => {
    let rel;
    try { rel = decodeURIComponent(new URL(q.url, 'http://x').pathname); } catch { rel = '/'; }
    let p = path.join(dir, rel);
    if (p !== dir && !p.startsWith(dir + path.sep)) { r.writeHead(403); r.end(); return; }
    if (rel.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((ok, fail) => { srv.once('error', fail); srv.listen(0, '127.0.0.1', ok); });
  return { srv, base: `http://127.0.0.1:${srv.address().port}` };
}
