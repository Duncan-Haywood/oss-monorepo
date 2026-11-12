// Timezone drift sweep: does a date tool give a different answer in Los Angeles
// than in UTC or on Kiritimati (UTC+14), for the same typed dates on the same day?
//
// A page that parses an <input type="date"> value with `new Date("2026-03-02")`
// gets UTC midnight, which is the evening of 1 March in the Americas; read back
// with getDate()/getDay()/toLocaleDateString() it shows the day before the one
// typed. And `new Date().toISOString().slice(0, 10)` as "today" is tomorrow
// for anyone in the Americas after about 4 pm. Neither shows up in a test run in
// UTC, which is where CI and most cloud sessions live.
//
// Two checks, both with Playwright's fake clock:
//   drift:  at 2026-03-04T09:30Z (4 March in all three zones), fill every date
//           input (its own value, else 2026-03-02 + 30 days per input), fire
//           input/change, click a Calculate-like button, and compare the page
//           text across UTC, America/Los_Angeles and Pacific/Kiritimati.
//   today:  load the page in Los Angeles at 15:30 and at 21:30 on 4 March
//           (21:30 is already 5 March in UTC) and flag date inputs whose initial
//           values differ: a default that changes within one local day is
//           following the UTC date, not the user's.
// Every hit needs a human look: a page that prints the time zone or a clock
// time differs legitimately. Exit 1 when any page differs.
// Usage: node platform/ci/check_timezone_drift.mjs [path-substring ...]
import http from 'http';
import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const ZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'];
const DRIFT_AT = new Date('2026-03-04T09:30:00Z');
const EVENING = new Date('2026-03-05T05:30:00Z');
const AFTERNOON = new Date('2026-03-04T23:30:00Z');
const BUTTON = /calculat|compute|check|run|generat|estimate|plan|show|build|go\b|update|submit/i;

export function lineDiff(a, b) {
  // First differing line pair, trimmed for the report.
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || '') !== (y[i] || '')) return [(x[i] || '').slice(0, 140), (y[i] || '').slice(0, 140)];
  }
  return null;
}

async function main() {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  }).listen(0);
  await new Promise((r) => server.on('listening', r));
  const port = server.address().port;

  const filters = process.argv.slice(2);
  let files = cp.execSync("grep -rl --include=*.html 'type=\"date\"' ventures | grep -v node_modules | grep -v '/test' || true")
    .toString().trim().split('\n').filter(Boolean).sort();
  if (filters.length) files = files.filter((f) => filters.some((s) => f.includes(s)));

  const browser = await chromium.launch();
  async function run(file, zone, at, fill) {
    const ctx = await browser.newContext({ timezoneId: zone, locale: 'en-US', serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await ctx.clock.setFixedTime(at);
    const page = await ctx.newPage();
    try {
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(200);
      const initial = await page.$$eval('input[type=date]', (els) => els.map((e) => e.value));
      if (!fill) return { initial };
      await page.$$eval('input[type=date]', (els) => els.forEach((e, i) => {
        if (!e.value) {
          const d = new Date(Date.UTC(2026, 2, 2 + 30 * i));
          e.value = d.toISOString().slice(0, 10);
        }
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      }));
      const buttons = await page.$$('button:visible');
      for (const b of buttons) {
        const t = (await b.innerText().catch(() => '')) || '';
        if (BUTTON.test(t) && !/clear|reset|delete|remove|print|copy|download|share/i.test(t)) {
          await b.click({ timeout: 1000 }).catch(() => {});
          break;
        }
      }
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => document.body.innerText);
      return { initial, text };
    } catch (e) {
      return { error: e.message.slice(0, 100) };
    } finally {
      await ctx.close();
    }
  }

  const hits = [];
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const f = files[next++];
      const runs = [];
      for (const z of ZONES) runs.push(await run(f, z, DRIFT_AT, true));
      if (runs.some((r) => r.error)) { hits.push([f, 'error', runs.map((r) => r.error).filter(Boolean)[0]]); continue; }
      for (let i = 1; i < runs.length; i++) {
        const d = lineDiff(runs[0].text, runs[i].text);
        if (d) hits.push([f, `drift UTC vs ${ZONES[i]}`, d]);
      }
      const pm = await run(f, 'America/Los_Angeles', AFTERNOON, false);
      const eve = await run(f, 'America/Los_Angeles', EVENING, false);
      if (pm.initial && eve.initial && JSON.stringify(pm.initial) !== JSON.stringify(eve.initial)) {
        hits.push([f, 'date default changes between 15:30 and 21:30 in Los Angeles', [pm.initial, eve.initial]]);
      }
    }
  }
  await Promise.all([1, 2, 3, 4].map(worker));
  await browser.close();
  server.close();
  console.log(`${files.length} pages with a date input; ${new Set(hits.map((h) => h[0])).size} differ`);
  for (const h of hits) console.log(JSON.stringify(h));
  process.exit(hits.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
