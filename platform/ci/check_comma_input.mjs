// Thousands-comma sweep: does a numeric text field read "2,500" as 2,500?
//
// A field written <input type="text" inputmode="decimal"> (chosen so phones show
// a number pad and the browser does not reject a comma) hands the script
// whatever the person typed. `parseFloat("2,500")` is 2, so a page that parses
// that way answers for 2 instead of 2,500 and says nothing. People type
// amounts the way they write them, with the comma (the sibling static check
// check_thousands_split.py covers the same mistake in list fields).
//
// For every venture page with a text field whose inputmode is decimal or
// numeric, and for each such field (up to 8 per page) whose own value is empty
// or a plain number: load the page, type "2500", fire input/change, click a
// Calculate-like button and keep the page text; then reload and do the same
// with "2,500". A page that reads both the same is fine. A difference is a hit,
// classed as
//   silent:  the comma run shows no more error words than the plain run, so it
//            most likely computed on a different number (the bug this sweep
//            exists for);
//   rejects: the comma run shows NaN or an error-like phrase: not a wrong
//            answer, but the person is told their normal input is invalid.
// Every hit needs a human look. Exit 1 when any field is silent.
// Usage: node platform/ci/check_comma_input.mjs [path-substring ...]
import http from 'http';
import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const BUTTON = /calculat|compute|check|run|generat|estimate|plan|show|build|go\b|update|submit|price|quote/i;
const SKIP_BUTTON = /clear|reset|delete|remove|print|copy|download|share|example|sample|demo/i;
const ERROR = /\bNaN\b|invalid|not a (valid )?number|enter a (valid )?(number|amount)|must be a number|please enter|numbers? only|could not read|can't read|cannot read|must be (between|a whole|at least|from)|should be (a whole|between)|digits only/gi;
const SEL = 'input[inputmode=decimal]:not([type]), input[inputmode=numeric]:not([type]), input[inputmode=decimal][type=text], input[inputmode=numeric][type=text]';

// Fields triaged by hand: no real value reaches 1,000, so "2,500" there is a
// typo whatever the page does with it. Reviewed 2026-11-13.
const SMALL = 'no real value reaches 1,000';
export const ALLOWED = {
  'ventures/estimate-maker/index.html': { 'i-validdays': SMALL, 'i-tax': 'a percent' },
  'ventures/proposal-maker/index.html': { 'i-validdays': SMALL, 'i-tax': 'a percent', 'i-depval': 'a percent', 't-rounds': 'revision rounds', 't-net': 'net payment days' },
  'ventures/invoice-maker/index.html': { 'i-tax': 'a percent', 'i-latepct': 'a percent per month' },
  'ventures/freelance-dashboard/index.html': { rate: 'a set-aside percent, capped at 70' },
  'ventures/freelance-contract-maker/index.html': { 'f-depositPct': 'a percent', 'f-payDays': 'payment days', 'f-lateFeePct': 'a percent', 'f-revisions': 'revision rounds', 'f-noticeDays': 'notice days' },
  'ventures/freelance-proposal-maker/index.html': { 'f-depositPct': 'a percent' },
  'ventures/shift-roster-builder/shifts-from-sales.html': { shortcost: 'a cost ratio, 1 to about 5' },
  'ventures/league-schedule-generator/index.html': { rounds: 'rounds of a season' },
  'ventures/ebike-rental-fleet-profit-calculator/index.html': { f_peakDays: 'days in a year, already range-checked', f_offDays: 'days in a year, already range-checked' },
};

export function lineDiff(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || '') !== (y[i] || '')) return [(x[i] || '').slice(0, 140), (y[i] || '').slice(0, 140)];
  }
  return null;
}

export function classify(plainText, commaText) {
  if (plainText === commaText) return null;
  const errPlain = (plainText.match(ERROR) || []).length;
  const errComma = (commaText.match(ERROR) || []).length;
  return errComma > errPlain ? 'rejects' : 'silent';
}

// The typed value echoes back into summaries and share links; mask it so only
// the computed answer is compared.
export function maskTyped(text) {
  return text.replace(/(?<![\d,.])2(%2C|,)?500(\.00?)?(?![\d,])/g, '<v>');
}

async function main() {
  const { chromium } = require('playwright');
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
  let files = cp.execSync("grep -rlE --include=*.html 'inputmode=\"(decimal|numeric)\"' ventures | grep -v node_modules | grep -v '/test' || true")
    .toString().trim().split('\n').filter(Boolean).sort();
  if (filters.length) files = files.filter((f) => filters.some((s) => f.includes(s)));

  const browser = await chromium.launch();
  async function run(file, index, value) {
    const ctx = await browser.newContext({ locale: 'en-US', serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    const page = await ctx.newPage();
    try {
      await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(150);
      const fields = await page.$$(SEL);
      if (value === null) {
        const out = [];
        for (const [i, f] of fields.entries()) {
          out.push({ i, visible: await f.isVisible(), value: await f.inputValue(), name: await f.evaluate((e) => e.id || e.name || '') });
        }
        return { fields: out };
      }
      const f = fields[index];
      await f.fill(value, { timeout: 2000 });
      await f.evaluate((e) => e.dispatchEvent(new Event('change', { bubbles: true })));
      const buttons = await page.$$('button:visible, input[type=submit]:visible');
      for (const b of buttons) {
        const t = ((await b.innerText().catch(() => '')) || (await b.getAttribute('value')) || '');
        if (BUTTON.test(t) && !SKIP_BUTTON.test(t)) {
          await b.click({ timeout: 1000 }).catch(() => {});
          break;
        }
      }
      await page.waitForTimeout(250);
      const text = await page.evaluate(() => document.body.innerText);
      return { text: maskTyped(text) };
    } catch (e) {
      return { error: e.message.split('\n')[0].slice(0, 100) };
    } finally {
      await ctx.close();
    }
  }

  const hits = [];
  let fieldsTried = 0;
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const f = files[next++];
      const probe = await run(f, 0, null);
      if (probe.error) { hits.push([f, '-', 'error', probe.error]); continue; }
      const usable = probe.fields.filter((x) => x.visible && /^\s*-?[\d.]*\s*$/.test(x.value)).slice(0, 8);
      for (const fld of usable) {
        fieldsTried++;
        const a = await run(f, fld.i, '2500');
        const b = await run(f, fld.i, '2,500');
        if (a.error || b.error) { hits.push([f, fld.name, 'error', a.error || b.error]); continue; }
        const kind = classify(a.text, b.text);
        if (kind) hits.push([f, fld.name, kind, lineDiff(a.text, b.text)]);
      }
    }
  }
  await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
  await browser.close();
  server.close();
  for (const h of hits) if (h[2] === 'silent' && ALLOWED[h[0]]?.[h[1]]) h[2] = `allowed (${ALLOWED[h[0]][h[1]]})`;
  const silent = hits.filter((h) => h[2] === 'silent');
  console.log(`${files.length} pages, ${fieldsTried} numeric text fields tried; ${silent.length} silent, ${hits.filter((h) => h[2] === 'rejects').length} rejects, ${hits.filter((h) => h[2] === 'error').length} errors`);
  for (const h of hits) console.log(JSON.stringify(h));
  process.exit(silent.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
