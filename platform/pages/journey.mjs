#!/usr/bin/env node
// The primary customer journey, driven through a real browser.
//
// Deliberately not part of CI: it needs Playwright, which is not a dependency
// of this repo, and the unit suites plus `check_site.mjs` already gate the
// build. This is what you run before claiming the site works — and, pointed at
// the live origin, after the owner flips Pages on.
//
//   node build.mjs --out=dist
//   python3 -m http.server 8792 --directory dist &
//   node journey.mjs
//
// Against the published site:
//
//   BASE_URL=https://duncan-haywood.github.io/monorepo-projects node journey.mjs
//
// `PLAYWRIGHT` points at an install elsewhere, since this repo has none:
//
//   PLAYWRIGHT=/path/to/node_modules/playwright node journey.mjs

// Dynamic import: the specifier would otherwise have to be a literal, and
// Playwright is not installed here.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:8792').replace(/\/$/, '');

const errors = [];
// Set while deliberately requesting a missing page, so the 404 this test wants
// is not also reported as a page error. Filtering on the URL is not enough:
// the browser's console message for a failed subresource does not name it.
let expectingMissing = false;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => { if (!expectingMissing) errors.push(`pageerror: ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error' && !expectingMissing) errors.push(`console: ${m.text()}`); });
page.on('requestfailed', (r) => { if (!expectingMissing) errors.push(`requestfailed: ${r.url()}`); });

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
}

// 1. Land on the directory.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check('directory renders a heading', (await page.locator('h1').count()) > 0, await page.title());

// Counts are derived, never hardcoded: ventures land here most weeks and a
// literal would fail on a healthy site the moment someone ships a calculator.
const links = await page.locator('a[href]').count();
check('the directory links to a substantial number of pages', links >= 25, `${links} links`);

// 2. Every tool the hub advertises must actually answer.
const toolHrefs = await page.locator('a[href]').evaluateAll((nodes) =>
  nodes.map((n) => n.getAttribute('href')).filter((h) => h && !/^(https?:|mailto:|#)/.test(h)));
const unique = [...new Set(toolHrefs)];
check('the hub advertises tool links', unique.length > 10, `${unique.length} internal links`);

let broken = [];
for (const href of unique) {
  const response = await page.request.get(new URL(href, `${BASE}/`).href);
  if (!response.ok()) broken.push(`${href} -> ${response.status()}`);
}
check('every link the hub advertises resolves', broken.length === 0, broken.slice(0, 5).join(', '));

// 3. Open a real product and confirm it computes, not merely that it renders.
await page.goto(`${BASE}/ebay-fee-calculator/`, { waitUntil: 'networkidle' });
check('a product page renders', /ebay/i.test(await page.title()), await page.title());
const money = await page.locator('body').evaluate((b) => /\$\s?\d/.test(b.innerText));
check('the product shows a computed figure', money);

// 4. Disclaimers are a shipping requirement, not decoration.
const body = await page.locator('body').innerText();
check('the product carries a no-warranty disclaimer', /no warranty|as is|not .* advice/i.test(body));

// 5. A missing page must 404 rather than soft-404 into the hub, or every typo
//    becomes an indexable duplicate of the directory.
expectingMissing = true;
const missing = await page.goto(`${BASE}/no-such-page-here`, { waitUntil: 'domcontentloaded' });
check('a missing page returns 404', missing.status() === 404, String(missing.status()));
expectingMissing = false;

// 6. Mobile: most of this traffic will be a contractor on a phone.
await page.setViewportSize({ width: 375, height: 720 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('the directory does not scroll sideways at 375px', overflow <= 0, `overflow ${overflow}px`);

await browser.close();

console.log(`\n${errors.length} page/console error(s)`);
for (const e of errors.slice(0, 10)) console.log('  ' + e);
if (errors.length) process.exitCode = 1;
