// The primary customer journey, driven through a real browser against a built
// artifact.
//
// Not part of CI: it needs Playwright, which is not a dependency of this repo,
// and `build.test.mjs` plus `check.mjs` already gate the build. This is what you
// run before claiming the site works — including against the live site once the
// owner flip lands.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/journey.mjs
//
//   # or against production:
//   BASE_URL=https://duncan-haywood.github.io/monorepo-projects node platform/pages/journey.mjs
//
// PLAYWRIGHT overrides the module path when Playwright is installed globally
// rather than beside this repo.

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
}

// 1. The front page.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check('hub h1 renders', /decisions that cost real money/.test(await page.textContent('h1')));

// Counts are derived, never hardcoded: ventures land here weekly and a literal
// would fail on a healthy site the moment someone ships a calculator.
const cardCount = await page.locator('.card').count();
check('a substantial number of tools are listed', cardCount >= 30, `${cardCount} cards`);

const groupCount = await page.locator('.group').count();
check('tools are grouped', groupCount >= 2, `${groupCount} groups`);

// 2. Search.
await page.fill('#q', 'ebay');
await page.waitForTimeout(150);
const visible = await page.locator('.card:not([hidden])').count();
check('search narrows the list', visible > 0 && visible < cardCount, `${visible} of ${cardCount}`);

await page.fill('#q', 'zzzznotathing');
await page.waitForTimeout(150);
check('empty state appears', await page.locator('#empty').isVisible());

await page.fill('#q', '');
await page.waitForTimeout(150);
check('clearing search restores every tool',
  (await page.locator('.card:not([hidden])').count()) === cardCount);

// 3. Usage counting is local, and the opt-out actually stops it.
const storageKey = await page.evaluate(() =>
  Object.keys(localStorage).find((k) => k.includes('usage') || k.includes('hub')) ?? null);
check('a local usage key exists', storageKey !== null, String(storageKey));

if (storageKey) {
  // The checkbox itself, not the `.optout` paragraph that wraps it — clicking
  // the wrapper leaves the box unchecked and the test passes vacuously.
  await page.check('#optout');
  await page.waitForTimeout(100);
  const before = await page.evaluate((k) => localStorage.getItem(k), storageKey);
  await page.reload({ waitUntil: 'networkidle' });
  const after = await page.evaluate((k) => localStorage.getItem(k), storageKey);
  check('opt-out stops counting across a reload', before === after, `${before} -> ${after}`);
}

// 4. Click through to a tool and confirm it computes rather than just paints.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.click('.card a[href*="walmart-marketplace-calculator"]');
await page.waitForLoadState('networkidle');
check('navigated to the tool', page.url().includes('/walmart-marketplace-calculator/'), page.url());
check('the tool computes a figure', /\$\d/.test(await page.textContent('body')));

// 5. The cross-product sibling link that only resolves under this layout.
await page.goto(`${BASE}/where-to-sell-calculator/`, { waitUntil: 'networkidle' });
const sibling = page.locator('a[href="../ebay-fee-calculator/"]').first();
check('cross-product link is present', (await sibling.count()) > 0);
if (await sibling.count()) {
  await sibling.click();
  await page.waitForLoadState('networkidle');
  check('cross-product link resolves', page.url().includes('/ebay-fee-calculator/'), page.url());
}

// 6. A product mounted from a subdirectory.
await page.goto(`${BASE}/ai-engineering-academy/`, { waitUntil: 'networkidle' });
check('nested product hub renders', (await page.locator('h1').count()) > 0, await page.title());

// 7. Sitemap URLs are absolute and free of repo paths — the regression that
//    shipped 69 unusable entries before the sitemaps were generated.
const sitemapXml = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
const children = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check('sitemap index lists a child per venture', children.length >= 30, `${children.length} children`);

// Sitemap <loc>s are absolute production URLs even when serving locally, so
// rewrite the origin before fetching — otherwise the sample silently fetches
// nothing and the check passes over zero URLs.
const PRODUCTION = 'https://duncan-haywood.github.io/monorepo-projects';
const local = (url) => (url.startsWith(PRODUCTION) ? BASE + url.slice(PRODUCTION.length) : url);

let badLocs = 0;
let sampled = 0;
for (const child of children.slice(0, 8)) {
  const xml = await (await page.request.get(local(child))).text();
  for (const loc of [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    sampled += 1;
    if (!/^https?:\/\//.test(loc) || loc.includes('/ventures/')) badLocs += 1;
  }
}
check('sampled sitemap URLs are absolute and repo-path-free',
  badLocs === 0 && sampled > 0, `${badLocs} bad of ${sampled} sampled`);

// 8. 404.
const notFound = await page.goto(`${BASE}/no-such-page-here`, { waitUntil: 'domcontentloaded' });
check('unknown path returns 404', notFound.status() === 404, String(notFound.status()));

// 9. Mobile.
await page.setViewportSize({ width: 375, height: 720 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow at 375px', overflow <= 0, `overflow ${overflow}px`);

await browser.close();

// The deliberate 404 above is the only expected console error.
const realErrors = errors.filter((e) => !/404/.test(e));
console.log(`\n${failures} failed check(s), ${realErrors.length} page/console error(s)`);
for (const e of realErrors.slice(0, 10)) console.log(`  ${e}`);
if (failures || realErrors.length) process.exitCode = 1;
