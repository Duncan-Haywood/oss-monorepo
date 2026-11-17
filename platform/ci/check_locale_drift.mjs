// Locale drift sweep: does a calculator give a different *number* in German
// than in US English, for the same inputs?
//
// Formatting may differ ("1,234.50" vs "1.234,50"); the value must not. The bug
// class this catches is a round trip through the browser's locale:
//   input.value = total.toLocaleString();  ...  parseFloat(input.value)
// reads "1.234,5" back as 1.234 in Germany, and Number("1.234,5") is NaN. Code
// that strips commas before parsing (`s.replace(/,/g, '')`) does the same.
// None of it shows up in CI, which runs in en-US.
//
// Each page with a number input is loaded in en-US and de-DE (same time zone,
// fixed clock). Empty number inputs get 1250 (clamped to max), then
// input/change fire and a Calculate-like button is clicked, as in
// check_timezone_drift.mjs. Lines of page text that differ are tokenised; a
// German token passes when either its US reading or its German reading equals
// the US value in the same position. A line fails when a value matches neither
// reading, the token counts differ, or NaN/Infinity/undefined appears only in
// German. A page outside FOLLOWS_READER also fails when its text differs at
// all (elapsed times aside): an English, US-dollar page should not print
// "$1.250" for twelve hundred and fifty dollars to a German reader.
// Math.random is seeded the same in both renders. Every hit needs a human
// look. Exit 1 when any page differs.
// Usage: node platform/ci/check_locale_drift.mjs [path-substring ...]
import http from 'http';
import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { createRequire } from 'module';
import { pathToFileURL } from 'node:url';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const AT = new Date('2026-03-04T15:30:00Z');
const BUTTON = /calculat|compute|check|run|generat|estimate|plan|show|build|go\b|update|submit/i;
const LOCALES = ['en-US', 'de-DE'];
// Ventures that offer several currencies and format in the reader's locale on
// purpose (a German user picking EUR sees "75,00 €"). Every other page here is
// English, in US dollars, and formats with 'en-US' like the rest of the repo.
export const FOLLOWS_READER = [
  'appointment-deposit-calculator', 'asbestos-abatement-bid-calculator', 'clothing-design-studio',
  'commercial-photo-license-calculator', 'freelance-retainer-calculator', 'land-survey-bid-calculator',
  'no-show-fee-calculator', 'quote-margin-check', 'security-camera-bid-calculator', 'window-tinting-bid-calculator',
].map((v) => `ventures/${v}/`);

const BAD = /\b(NaN|Infinity|undefined)\b/g;

// A number as printed: digits joined by single '.' or ',' (or a thin/no-break
// space used as a group separator). "1,234.50", "1.234,50", "4.3.2026", "12".
const TOKEN = /\d+(?:(?:[.,]|[\u00a0\u202f](?=\d{3}\b))\d+)*/g;

// Elapsed times ("Settled in 5264 ms", "Done in 0.9 s") differ run to run.
const TIMING = /\d+(?:[.,]\d+)?\s?(?:ms|s|sec|seconds?)\b/g;

export function tokens(line) {
  return (line.replace(TIMING, '').match(TOKEN) || []).map((t) => t.replace(/[\u00a0\u202f]/g, ''));
}

export function usRead(t) {
  return Number(t.replace(/,/g, ''));
}

export function deRead(t) {
  return Number(t.replace(/\./g, '').replace(',', '.'));
}

// German short dates print as 4.3.2026 where US prints 3/4/2026; compare the
// day/month/year parts as a set so a date is not read as a number.
function dateParts(t) {
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  return m ? [m[1], m[2], m[3]].map(Number) : null;
}

function same(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
}

// First line whose numbers disagree, or null. Lines are compared in order; the
// two renders come from the same DOM, so they line up unless a value changed.
export function numberDiff(usText, deText) {
  const x = usText.split('\n'), y = deText.split('\n');
  if (x.length !== y.length) return { why: `line count ${x.length} vs ${y.length}`, us: '', de: '' };
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    const badUs = (x[i].match(BAD) || []).length, badDe = (y[i].match(BAD) || []).length;
    if (badDe > badUs) return { why: 'NaN/Infinity/undefined only in de-DE', us: x[i], de: y[i] };
    const a = tokens(x[i]);
    let b = [];
    for (const t of tokens(y[i])) {
      const d = dateParts(t);
      b = b.concat(d ? d.map((n) => ({ date: n })) : [{ t }]);
    }
    const av = a.map(usRead);
    if (b.some((v) => 'date' in v)) {
      // Dates: match as multisets, since day and month swap places.
      const used = b.map(() => false);
      const fits = (v, j) => ('date' in b[j] ? same(b[j].date, v) : same(usRead(b[j].t), v) || same(deRead(b[j].t), v));
      const ok = av.length === b.length && av.every((v) => {
        const j = b.findIndex((_, k) => !used[k] && fits(v, k));
        if (j < 0) return false;
        used[j] = true;
        return true;
      });
      if (!ok) return { why: 'numbers differ', us: x[i], de: y[i] };
      continue;
    }
    if (a.length !== b.length) return { why: `token count ${a.length} vs ${b.length}`, us: x[i], de: y[i] };
    for (let k = 0; k < a.length; k++) {
      if (!same(av[k], usRead(b[k].t)) && !same(av[k], deRead(b[k].t))) {
        return { why: `${a[k]} became ${b[k].t}`, us: x[i], de: y[i] };
      }
    }
  }
  return null;
}

// First line pair that differs once elapsed times are removed, or null.
export function formatDiff(usText, deText) {
  const x = usText.replace(TIMING, '').split('\n'), y = deText.replace(TIMING, '').split('\n');
  const k = x.findIndex((l, i) => l !== y[i]);
  return k < 0 ? null : [x[k].slice(0, 140), (y[k] || '').slice(0, 140)];
}

async function main() {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const root = process.cwd();
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
  let files = cp.execSync("grep -rlE --include=*.html 'type=\"number\"|inputmode=\"(decimal|numeric)\"' ventures | grep -v node_modules | grep -v '/test' || true")
    .toString().trim().split('\n').filter(Boolean).sort();
  if (filters.length) files = files.filter((f) => filters.some((s) => f.includes(s)));

  const browser = await chromium.launch();
  async function run(file, locale) {
    const ctx = await browser.newContext({ timezoneId: 'UTC', locale, serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await ctx.clock.setFixedTime(AT);
    // Same pseudo-random sequence in both locales (mulberry32, seed 1).
    await ctx.addInitScript(() => {
      let a = 1;
      Math.random = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(200);
      await page.$$eval('input[type=number]', (els) => els.forEach((e) => {
        if (!e.value) {
          const max = e.max !== '' ? Number(e.max) : Infinity;
          e.value = String(Math.min(1250, max));
        }
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      }));
      const buttons = await page.$$('button:visible');
      for (const b of buttons) {
        const t = (await b.innerText().catch(() => '')) || '';
        if (BUTTON.test(t) && !/clear|reset|delete|remove|print|copy|download|share|language|sprache/i.test(t)) {
          await b.click({ timeout: 1000 }).catch(() => {});
          break;
        }
      }
      await page.waitForTimeout(300);
      return { text: await page.evaluate(() => document.body.innerText) };
    } catch (e) {
      return { error: e.message.slice(0, 100) };
    } finally {
      await ctx.close();
    }
  }

  const hits = [];
  let next = 0, formatted = 0;
  async function worker() {
    while (next < files.length) {
      const f = files[next++];
      const [us, de] = [await run(f, LOCALES[0]), await run(f, LOCALES[1])];
      if (us.error || de.error) { hits.push([f, 'error', us.error || de.error]); continue; }
      if (us.text !== de.text) formatted++;
      const d = numberDiff(us.text, de.text);
      if (d) hits.push([f, d.why, [d.us.slice(0, 140), d.de.slice(0, 140)]]);
      else if (!FOLLOWS_READER.some((v) => f.startsWith(v))) {
        const k = formatDiff(us.text, de.text);
        if (k) hits.push([f, 'formats numbers in the reader\'s locale; pin the page\'s own (en-US)', k]);
      }
    }
  }
  await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
  await browser.close();
  server.close();
  console.log(`${files.length} pages with a number input; ${formatted} render differently in de-DE; ${new Set(hits.map((h) => h[0])).size} fail (value or format drift)`);
  for (const h of hits) console.log(JSON.stringify(h));
  process.exit(hits.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
