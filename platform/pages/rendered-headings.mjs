// Heading-order skips that only exist once a tool has drawn its result.
//
//   node platform/pages/rendered-headings.mjs                     # every venture page whose script draws a heading
//   node platform/pages/rendered-headings.mjs --slugs=a,b          # just these
//   node platform/pages/rendered-headings.mjs --dist=DIR --json=out.json
//
// heading-order.mjs reads the static HTML and strips <script>, so a result
// renderer that writes <h4> under <h2>Result</h2> passes it. This serves the
// built site (platform/pages/dist by default; build it first), opens each page
// in the pre-installed Chromium, clicks a sample/example button and then the
// run button (Check, Calculate, ...), waits, and runs the same skip rule on
// the headings that are actually displayed. Third-party requests are blocked.
//
// Not in CI: it needs a build and a browser. Exit 1 when any page skips.
// Why: docs/reports/polish-2026-11-12-finding-headings.md (270 pages fixed).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const dist = path.resolve(arg('dist') ?? fileURLToPath(new URL('./dist', import.meta.url)));
const ventures = fileURLToPath(new URL('../../ventures/', import.meta.url));

/** Skips in a list of displayed heading levels: ['2>4', ...]. */
export function skipsOf(levels) {
  const out = [];
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) out.push(`${levels[i - 1]}>${levels[i]}`);
  return out;
}

function defaultSlugs() {
  return fs.readdirSync(ventures).filter((s) => {
    const f = path.join(ventures, s, 'index.html');
    if (!fs.existsSync(f) || !fs.existsSync(path.join(dist, s, 'index.html'))) return false;
    const html = fs.readFileSync(f, 'utf8');
    return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].some((m) => /<h[3-6][\s>]/.test(m[1]));
  }).sort();
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const RUN = /^(check|run|calculate|compute|analy|compare|estimate|build|plan|score|show|get|see|find|price|convert|validate|go)/i;

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const { default: pw } = await import('/opt/node-tools/node_modules/playwright/index.js');
  const slugs = arg('slugs')?.split(',').filter(Boolean) ?? defaultSlugs();
  const srv = http.createServer((q, r) => {
    let p = path.join(dist, decodeURIComponent(q.url.split('?')[0]));
    if (p.endsWith(path.sep) || p.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port;
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const res = {};
  let next = 0;
  async function one(slug) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    try {
      await page.goto(`http://127.0.0.1:${port}/${slug}/`, { waitUntil: 'load', timeout: 20000 });
      const buttons = await page.$$('main button, main input[type=submit]');
      const label = async (h) => ((await h.innerText().catch(() => '')) || (await h.getAttribute('value')) || '').trim();
      const order = [];
      for (const h of buttons) if (/sample|example|demo|try/i.test(await label(h))) order.push(h);
      for (const h of buttons) if (RUN.test(await label(h))) order.push(h);
      for (const h of order.slice(0, 3)) {
        if (await h.isVisible().catch(() => false)) { await h.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300); }
      }
      await page.waitForTimeout(400);
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .filter((h) => h.getClientRects().length).map((h) => Number(h.tagName[1])));
      res[slug] = { skips: skipsOf(levels), errors };
    } catch (e) {
      res[slug] = { fail: String(e).slice(0, 160) };
    }
    await page.close();
  }
  await Promise.all(Array.from({ length: 6 }, async () => { while (next < slugs.length) await one(slugs[next++]); }));
  await browser.close();
  srv.close();
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(res, null, 1));
  const skipping = Object.entries(res).filter(([, r]) => r.skips?.length);
  for (const [slug, r] of skipping) console.log(`${slug}: ${r.skips.join(' ')}`);
  const failed = Object.values(res).filter((r) => r.fail).length;
  console.log(`${slugs.length} page(s), ${skipping.length} with a rendered heading skip, ${failed} failed to load`);
  process.exitCode = skipping.length ? 1 : 0;
}
