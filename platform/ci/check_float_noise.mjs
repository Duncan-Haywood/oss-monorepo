// Loads every venture page in headless Chromium and reports floating-point
// noise a reader can see: "0.30000000000000004", "1.2999999999999998",
// "14.000000000000002". It reads the rendered text on load, then again after
// re-firing input/change on every field (so pages that compute on input have
// computed), after clicking each calculate-looking button, and after nudging
// each number field to an awkward decimal (a reader types 12.1, not 12).
//
// Why: the NaN/Infinity/undefined sweeps (check_page_runtime.js,
// check_blank_inputs.js, ...) pass a page that prints an unrounded float,
// because the value is finite and numeric. It only looks broken.
//
// Usage: node platform/ci/check_float_noise.mjs [out.json] [--limit N] [--only <substr>]
// Exit 1 when any page shows noise. Offline: every non-local request is aborted.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import cp from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// A run of six or more 0s or 9s after the decimal point, ended by another
// digit: the signature of binary float error, not of a chosen precision.
export const NOISE = /(?<![\d.])-?\d+\.\d*?(?:0{6,}[1-9]|9{6,}[0-8])\d*/g;

export function findNoise(text) {
  const out = [];
  for (const m of text.matchAll(NOISE)) {
    const digits = m[0].split('.')[1] || '';
    if (digits.length < 9) continue; // "1.0000001" can be a real 7-place quantity
    const s = Math.max(0, m.index - 30);
    out.push(text.slice(s, m.index + m[0].length + 20).replace(/\s+/g, ' '));
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const out = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const limit = args.includes('--limit') ? +args[args.indexOf('--limit') + 1] : 0;
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
  const { chromium } = require('playwright');
  const root = process.cwd();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    // Resolve under root and refuse anything that escapes it (../, encoded or not).
    let file = path.resolve(root, '.' + path.sep + decodeURIComponent(req.url.split('?')[0]));
    if (file !== root && !file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  }).listen(0);
  await new Promise((r) => server.on('listening', r));
  const port = server.address().port;

  let files = cp.execSync("find ventures -name '*.html' -not -path '*/node_modules/*' -not -path '*/test*' -not -path '*/fixtures/*'")
    .toString().trim().split('\n').filter((f) => f && f.includes(only)).sort();
  if (limit) files = files.slice(0, limit);
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', (r) => (r.request().url().startsWith(`http://localhost:${port}/`) ? r.continue() : r.abort()));
  const hits = [];
  let next = 0;
  const read = (p) => p.evaluate(() => {
    const vals = [...document.querySelectorAll('output, input[readonly], textarea[readonly]')].map((e) => e.value || e.textContent || '');
    return (document.body ? document.body.innerText : '') + '\n' + vals.join('\n');
  });
  async function worker() {
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.dismiss().catch(() => {}));
    while (next < files.length) {
      const f = files[next++];
      const seen = new Map();
      const note = (stage, t) => { for (const h of findNoise(t)) if (!seen.has(h)) seen.set(h, stage); };
      try {
        await p.goto(`http://localhost:${port}/${f}`, { waitUntil: 'load', timeout: 10000 });
        await p.waitForTimeout(120);
        note('load', await read(p));
        await p.evaluate(() => {
          // Keep submits on the page: the page's own handler still runs.
          document.addEventListener('submit', (e) => e.preventDefault(), true);
          for (const e of document.querySelectorAll('input, select, textarea')) {
            if (['hidden', 'file', 'submit', 'button'].includes(e.type)) continue;
            for (const t of ['input', 'change']) try { e.dispatchEvent(new Event(t, { bubbles: true })); } catch (x) {}
          }
        });
        await p.waitForTimeout(80);
        note('input', await read(p));
        const n = await p.evaluate(() => {
          const re = /calculat|compute|estimate|run|show|check|convert|score|compare|go\b/i;
          const bs = [...document.querySelectorAll('button, input[type=submit], input[type=button]')]
            .filter((b) => re.test(b.textContent || b.value || '') && !/reset|clear|delete|remove|download|export|print|copy|share/i.test(b.textContent || b.value || ''));
          bs.slice(0, 4).forEach((b, i) => b.setAttribute('data-fn-click', i));
          return Math.min(bs.length, 4);
        });
        for (let i = 0; i < n; i++) {
          await p.evaluate((i) => {
            const b = document.querySelector(`[data-fn-click="${i}"]`);
            if (!b) return;
            b.click();
          }, i).catch(() => {});
          await p.waitForTimeout(60);
        }
        if (n) note('click', await read(p));
        // Nudge: give each filled number field an awkward decimal (12 -> 12.1,
        // 0.5 -> 0.7), the inputs that make 0.1 + 0.2 show up in a sum.
        const nudged = await p.evaluate(() => {
          let k = 0;
          for (const e of document.querySelectorAll('input[type=number], input[inputmode=decimal]')) {
            const v = parseFloat(e.value);
            if (!Number.isFinite(v) || e.readOnly || e.disabled) continue;
            const step = e.getAttribute('step');
            if (step && step !== 'any' && Number.isInteger(+step)) continue; // whole-number fields
            e.value = String(v >= 1 ? Math.round(v * 10 + 1) / 10 : Math.round(v * 10 + 2) / 10);
            for (const t of ['input', 'change']) try { e.dispatchEvent(new Event(t, { bubbles: true })); } catch (x) {}
            k++;
          }
          return k;
        });
        if (nudged) {
          await p.waitForTimeout(80);
          for (let i = 0; i < n; i++) {
            await p.evaluate((i) => { const b = document.querySelector(`[data-fn-click="${i}"]`); if (b) b.click(); }, i).catch(() => {});
            await p.waitForTimeout(60);
          }
          note('nudge', await read(p));
        }
      } catch (e) { /* navigation timeouts are other sweeps' business */ }
      if (seen.size) hits.push({ f, hits: [...seen].slice(0, 3).map(([h, s]) => `${s}: ${h}`) });
      if (p.url() !== 'about:blank') await p.goto('about:blank').catch(() => {});
    }
    await p.close();
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  await browser.close();
  server.close();
  console.log(`${files.length} pages; ${hits.length} showing float noise`);
  for (const h of hits) console.log(h.f, JSON.stringify(h.hits));
  if (out) fs.writeFileSync(out, JSON.stringify(hits, null, 1));
  process.exit(hits.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
