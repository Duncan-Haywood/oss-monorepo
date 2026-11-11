// Lighthouse scores for the pages a first-time visitor is most likely to see:
// the hub, the section indexes, a post, and every flagship in
// portfolio/flagships.yaml. It serves the built dist itself, so there is no
// server to forget.
//
//   npm i --prefix "$SCRATCH/lh" lighthouse@12.8.2      # once; not a repo dependency
//   LIGHTHOUSE="$SCRATCH/lh/node_modules/.bin/lighthouse" node platform/pages/lighthouse.mjs
//   ... --pages=research/,writing/        # just these paths
//   ... --min-a11y=95                     # exit 1 if any page scores lower
//
// Why: no polish run had recorded a Lighthouse number before 2026-11-11. The
// first run found /research/ at accessibility 88 (theme-tag text at 3.1:1,
// a heading-order skip, body links told apart by colour alone) and /writing/
// at 92 (chip counts at 3.25:1, 9 px pager targets), none of which any check
// in CI looks for.
//
// Two things the numbers are not:
// - Not production. A local build writes absolute links to DEFAULT_BASE_URL,
//   so this server rewrites that origin to itself, gzips text like Cloudflare
//   does, and blocks nothing else. Third-party hosts (the usage beacon, Google
//   Fonts) do not resolve in a cloud session, which costs best-practices 4
//   points on every venture page ("errors-in-console": ERR_NAME_NOT_RESOLVED)
//   that the live site does not lose.
// - Not stable to the point. Simulated mobile throttling on a shared runner
//   moves performance by a few points between runs; compare runs from the
//   same session, and trust accessibility/SEO (deterministic) over performance.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DIST = process.env.DIST || path.join(here, 'dist');
const LH = process.env.LIGHTHOUSE || 'lighthouse';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const PORT = Number(process.env.PORT || 8791);
const FORM = args.form || 'mobile';
const MIN_A11Y = args['min-a11y'] ? Number(args['min-a11y']) : null;

export function defaultPages(dist = DIST) {
  const pages = ['', 'research/', 'writing/', 'stories/'];
  const posts = fs.existsSync(path.join(dist, 'writing'))
    ? fs.readdirSync(path.join(dist, 'writing')).filter((d) => /^[0-9a-z]/.test(d) && fs.existsSync(path.join(dist, 'writing', d, 'index.html'))).sort()
    : [];
  if (posts.length) pages.push(`writing/${posts[0]}/`);
  const flagships = fs.readFileSync(path.join(repo, 'portfolio/flagships.yaml'), 'utf8')
    .split('\n').map((l) => l.match(/^\s*-\s*venture:\s*(\S+)/)?.[1]).filter(Boolean);
  for (const f of flagships) if (fs.existsSync(path.join(dist, f, 'index.html'))) pages.push(`${f}/`);
  return pages;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function serve(dist, port, fromOrigin) {
  const to = `http://127.0.0.1:${port}/`;
  return http.createServer((req, res) => {
    let f = path.join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f) && fs.existsSync(`${f}.html`)) f += '.html';
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    const type = TYPES[path.extname(f)] || 'application/octet-stream';
    const text = /text|javascript|json|svg|xml|manifest/.test(type);
    let body = fs.readFileSync(f);
    if (text && fromOrigin) body = Buffer.from(body.toString('utf8').split(fromOrigin).join(to));
    const headers = { 'content-type': type, 'cache-control': 'public, max-age=3600' };
    if (text && /gzip/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); headers['content-encoding'] = 'gzip'; }
    res.writeHead(200, headers);
    res.end(body);
  }).listen(port, '127.0.0.1');
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`no build at ${DIST}: run node platform/pages/build.mjs first`); process.exit(2); }
  // Read, not imported: importing build.mjs would pull in the whole build.
  const DEFAULT_BASE_URL = fs.readFileSync(path.join(here, 'build.mjs'), 'utf8').match(/export const DEFAULT_BASE_URL = '([^']+)'/)?.[1];
  const server = serve(DIST, PORT, DEFAULT_BASE_URL);
  const pages = args.pages ? args.pages.split(',').map((p) => (p === '/' ? '' : p)) : defaultPages();
  const out = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'lh-'));
  const rows = [];
  for (const p of pages) {
    const json = path.join(out, `${rows.length}.json`);
    // Not spawnSync: it would block the event loop this file's server answers on.
    const r = await new Promise((resolve) => {
      {
        const child = spawn(LH, [`http://127.0.0.1:${PORT}/${p}`, ...(FORM === 'desktop' ? ['--preset=desktop'] : []),
          `--chrome-flags=--headless=new --no-sandbox --proxy-server=direct:// --proxy-bypass-list=*`,
          '--quiet', '--output=json', `--output-path=${json}`],
        { env: { ...process.env, CHROME_PATH: CHROME, NO_PROXY: '*' }, stdio: ['ignore', 'ignore', 'pipe'] });
        let err = ''; child.stderr.on('data', (d) => { err += d; });
        child.on('close', (code) => resolve({ code, err }));
      }
    });
    if (r.code !== 0 || !fs.existsSync(json)) { rows.push({ page: `/${p}`, error: r.err.split('\n').slice(-3).join(' ') }); continue; }
    const rep = JSON.parse(fs.readFileSync(json, 'utf8'));
    const s = (k) => Math.round((rep.categories[k]?.score ?? 0) * 100);
    const fails = Object.values(rep.categories.accessibility.auditRefs)
      .filter((a) => a.weight > 0 && rep.audits[a.id].score !== null && rep.audits[a.id].score < 1).map((a) => a.id);
    rows.push({ page: `/${p}`, perf: s('performance'), a11y: s('accessibility'), bp: s('best-practices'), seo: s('seo'),
      lcp: Math.round(rep.audits['largest-contentful-paint'].numericValue), cls: rep.audits['cumulative-layout-shift'].numericValue.toFixed(3), fails });
  }
  server.close();
  console.log(`| page (${FORM}) | perf | a11y | best practices | SEO | LCP ms | CLS | failing a11y audits |`);
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(r.error ? `| ${r.page} | error: ${r.error} |` : `| ${r.page} | ${r.perf} | ${r.a11y} | ${r.bp} | ${r.seo} | ${r.lcp} | ${r.cls} | ${r.fails.join(', ') || '-'} |`);
  const low = rows.filter((r) => r.error || (MIN_A11Y !== null && r.a11y < MIN_A11Y));
  if (low.length) { console.error(`\n${low.length} page(s) errored or scored below accessibility ${MIN_A11Y}`); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
