// The primary customer journey for the browser tool, driven through a real
// browser against the real page.
//
// Not part of CI, and follows the same convention as `platform/pages/journey.mjs`
// for the same reason: it needs Playwright, which is not a dependency of this
// repo. `dns-evidence.test.mjs` gates the logic; this is what you run before
// claiming the *page* works.
//
//   node ventures/dns-configuration-evidence/tests/journey.mjs
//
// It lives under `tests/` rather than beside `index.html` because the apex
// mirror copies whole venture directories minus a few excluded ones, and a
// harness sitting at the venture root gets shipped into the ConfigMap and
// served to visitors. Verified by regenerating the mirror both ways.
//
// It serves the venture directory itself on an ephemeral port and stubs the
// three DoH endpoints, so it needs no network and no real domain. That is
// deliberate rather than a limitation: the two cases worth asserting are a
// resolver that has the change and one that has not, and two resolvers
// presenting the same record differently. Neither is reproducible against live
// DNS on demand, and a test that waits for real propagation is a test nobody
// runs. (It also could not reach a DoH endpoint from the agent sandbox anyway,
// where outbound HTTPS to arbitrary hosts is refused.)
//
// Playwright ships CommonJS, so accept either resolution shape -- same handling
// and same reason as `platform/pages/journey.mjs`.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) {
  console.error('Could not load Playwright. Set PLAYWRIGHT to its entry point, ' +
    'e.g. PLAYWRIGHT=./node_modules/playwright/index.js');
  process.exit(2);
}

// The venture root, one level up — that is what gets served.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const rel = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'text/plain' });
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

// The scenario: an A record moves, an MX stays put, and one resolver is down.
// Google is left lagging on the A record on purpose -- partial propagation is
// the situation this product exists to make visible.
let phase = 'before';
const A_RECORD = { before: '192.0.2.1', after: '198.51.100.7' };

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
const failures = [];
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  // The Quad9 route is aborted deliberately to exercise the dead-resolver path,
  // and the browser logs that as a failed resource. Everything else is a bug.
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
    failures.push(`console: ${m.text()}`);
  }
});

await page.route('**://cloudflare-dns.com/**', (route) => {
  const type = new URL(route.request().url()).searchParams.get('type').toUpperCase();
  if (type === 'A') return route.fulfill({ json: { Status: 0, Answer: [{ name: 'x', type: 1, data: A_RECORD[phase] }] } });
  if (type === 'MX') return route.fulfill({ json: { Status: 0, Answer: [{ name: 'x', type: 15, data: '10 mail.example.com.' }] } });
  return route.fulfill({ json: { Status: 3 } });
});
await page.route('**://dns.google/**', (route) => {
  const type = new URL(route.request().url()).searchParams.get('type').toUpperCase();
  if (type === 'A') return route.fulfill({ json: { Status: 0, Answer: [{ name: 'x', type: 1, data: A_RECORD.before } ] } });
  // Presented differently from Cloudflare's copy of the same record: uppercase,
  // no trailing dot. `normalizeAnswer` must make these compare equal, or every
  // real capture would show a change that did not happen.
  if (type === 'MX') return route.fulfill({ json: { Status: 0, Answer: [{ name: 'x', type: 15, data: '10 MAIL.example.com' }] } });
  return route.fulfill({ json: { Status: 3 } });
});
await page.route('**://dns.quad9.net:5053/**', (route) => route.abort('failed'));

const step = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures.push(name);
};

await page.goto(base);

// --- the guard rails, before anything is captured
await page.click('#capture');
step('empty domain is refused', (await page.textContent('#capture-msg')).includes('Enter the customer domain'));

await page.fill('#domain', 'not a domain');
await page.click('#capture');
step('a malformed domain is refused', (await page.textContent('#capture-msg')).includes('does not look like a domain'));

await page.fill('#domain', 'example.com');
await page.click('#capture');
step('capture without the authorization tick is refused', (await page.textContent('#capture-msg')).includes('authorized'));

await page.check('#authorized');
await page.fill('#records', 'elsewhere.net A');
await page.click('#capture');
step('a name outside the domain is refused', (await page.textContent('#capture-msg')).includes('outside the authorized domain'));

await page.fill('#records', '@ A\n@ MX\n@ NOPE');
await page.click('#capture');
step('an unknown record type is refused', (await page.textContent('#capture-msg')).includes('not a record type'));

// --- the "before" capture
await page.fill('#records', '@ A\n@ MX');
await page.click('#capture');
await page.waitForSelector('#capture-result:not([hidden])');
const beforeRows = await page.$$eval('#capture-table tbody tr',
  (rs) => rs.map((r) => [...r.cells].map((c) => c.textContent.trim())));
step('before capture ran every name against every resolver', beforeRows.length === 6, `${beforeRows.length} rows`);
step('the down resolver is recorded as inconclusive, not as an empty answer',
  beforeRows.filter((r) => r[2] === 'quad9' && r[3] === 'error').length === 2);
step('the live resolvers recorded the A record',
  beforeRows.some((r) => r[2] === 'cloudflare' && r[3].includes('192.0.2.1')));

await page.click('#save-baseline');
step('baseline saves to the browser', (await page.textContent('#capture-msg')).includes('Saved to this browser'));

// --- the change lands, then the "after" capture
phase = 'after';
await page.click('#capture');
await page.waitForFunction(() => [...document.querySelectorAll('#capture-table tbody tr')]
  .some((r) => r.cells[2].textContent === 'cloudflare' && r.cells[3].textContent.includes('198.51.100.7')));
step('after capture picked up the changed A record', true);

await page.click('#use-baseline');
step('the saved baseline loads as "before"', (await page.textContent('#before-state')).includes('Saved baseline'));

await page.click('#compare');
await page.waitForSelector('#report:not([hidden])');
const counts = await page.$$eval('#counts li',
  (ls) => Object.fromEntries(ls.map((l) => [l.querySelector('span').textContent, l.childNodes[1].textContent])));
console.log('   counts:', JSON.stringify(counts));
step('the resolver that moved is reported as changed', counts.changed === '1');
step('the resolver that lagged plus the MX rows are unchanged', counts.unchanged === '3');
step('the dead resolver is inconclusive, never unchanged', counts.inconclusive === '2');

const rows = await page.$$eval('#report-table tbody tr',
  (rs) => rs.map((r) => [...r.cells].map((c) => c.textContent.trim())));
step('propagation is visible per resolver rather than averaged',
  rows.some((r) => r[2] === 'cloudflare' && r[1] === 'A' && r[3] === 'changed') &&
  rows.some((r) => r[2] === 'google' && r[1] === 'A' && r[3] === 'unchanged'));
step('a trailing-dot/case difference between resolvers is not a false change',
  rows.filter((r) => r[1] === 'MX' && r[3] === 'unchanged').length === 2);
step('an inconclusive row says so rather than showing blank',
  rows.some((r) => r[2] === 'quad9' && r[4].includes('not observed')));

// --- the report leaves the page
await page.evaluate(() => {
  window.__copied = null;
  navigator.clipboard.writeText = async (text) => { window.__copied = text; };
});
await page.click('#copy-md');
const markdown = await page.evaluate(() => window.__copied);
step('Markdown copy produces the report', Boolean(markdown && markdown.includes('# DNS evidence: `example.com`')));
step('Markdown states inconclusive separately', Boolean(markdown && /\*\*inconclusive:\*\* 2/.test(markdown)));

// --- the second visit, which is the one that matters
await page.goto(base);
step('a returning visitor is offered the saved baseline',
  (await page.textContent('#before-state')).includes('saved baseline for example.com'));
step('and the domain is prefilled', (await page.inputValue('#domain')) === 'example.com');

// --- accessibility and structure spot checks
step('every input has a label', await page.evaluate(() => [...document.querySelectorAll('input,textarea')]
  .every((el) => el.type === 'file' || el.closest('label') || document.querySelector(`label[for="${el.id}"]`))));
step('progress is announced to screen readers', (await page.getAttribute('#progress', 'aria-live')) === 'polite');
step('the disclaimer is present', (await page.textContent('footer')).includes('No warranty'));

await browser.close();
server.close();
console.log(failures.length
  ? `\n${failures.length} FAILURE(S): ${failures.join('; ')}`
  : '\nAll journey checks passed.');
process.exit(failures.length ? 1 : 0);
