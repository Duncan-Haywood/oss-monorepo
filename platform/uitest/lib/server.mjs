// Getting the app up: a built-in static server for a directory, or the
// app's own start command (a full-stack app, an API plus a frontend) and a
// URL to poll until it answers.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm',
  '.csv': 'text/csv; charset=utf-8', '.pdf': 'application/pdf', '.map': 'application/json',
};

/** Map a request path to a file under root, or null if it escapes root. */
export function safePath(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  const full = resolve(root, '.' + (p.startsWith('/') ? p : '/' + p));
  const base = resolve(root);
  return full === base || full.startsWith(base + sep) ? full : null;
}

/** Serve a directory on 127.0.0.1 at a free port. Resolves to { url, close }. */
export async function serveStatic(dir, { port = 0 } = {}) {
  const root = resolve(dir);
  if (!(await stat(root).catch(() => null))?.isDirectory()) throw new Error(`--serve: ${dir} is not a directory`);
  const server = createServer(async (req, res) => {
    let file = safePath(root, req.url || '/');
    if (!file) { res.writeHead(403).end(); return; }
    try {
      const s = await stat(file).catch(() => null);
      if (s?.isDirectory()) {
        if (!req.url.split('?')[0].endsWith('/')) { res.writeHead(301, { location: req.url.replace(/^([^?]*)/, '$1/') }).end(); return; }
        file = join(file, 'index.html');
      } else if (!s && !extname(file)) {
        // Pretty URLs: /pricing -> /pricing.html when it exists.
        if (await stat(file + '.html').catch(() => null)) file += '.html';
      }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  await new Promise((ok, fail) => server.once('error', fail).listen(port, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(r => server.close(r)) };
}

/** Poll a URL until it answers below 500, or throw after timeoutMs. */
export async function waitForUrl(url, { timeoutMs = 60000, intervalMs = 500, fetch: f = globalThis.fetch, isAlive = () => true } = {}) {
  const until = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < until) {
    if (!isAlive()) throw new Error(`the start command exited before ${url} answered`);
    try {
      const res = await f(url, { redirect: 'manual' });
      if (res.status < 500) return res.status;
      last = `HTTP ${res.status}`;
    } catch (err) { last = err.cause?.code || err.message; }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`${url} did not come up within ${Math.round(timeoutMs / 1000)}s (last: ${last})`);
}

/** Run the app's start command in its own process group; resolves to { close, output }. */
export function startCommand(cmd, { cwd = process.cwd(), env = process.env } = {}) {
  const child = spawn(cmd, { shell: true, cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  const keep = chunk => { output.push(String(chunk)); if (output.length > 200) output.shift(); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  let exited = false;
  child.on('exit', () => { exited = true; });
  return {
    isAlive: () => !exited,
    output: () => output.join('').slice(-4000),
    async close() {
      if (exited) return;
      try { process.platform === 'win32' ? child.kill() : process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
      await new Promise(r => { const t = setTimeout(r, 3000); child.once('exit', () => { clearTimeout(t); r(); }); });
    },
  };
}
