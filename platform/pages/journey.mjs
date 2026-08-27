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
// Serve it under a `/monorepo-projects/` prefix when you want the local run to
// mirror the deployment, because some defects only exist at a path:
//
//   mkdir -p sp && cp -r dist sp/monorepo-projects
//   python3 -m http.server 8793 --directory sp &
//   BASE_URL=http://localhost:8793/monorepo-projects node platform/pages/journey.mjs
//
// A browser with no declared icon asks the ORIGIN root for `/favicon.ico`, so
// served from `/` a missing icon link is masked by the `favicon.ico` this build
// writes, and served from `/monorepo-projects/` it is not -- which is the shape
// GitHub Pages actually serves. Run both.
//
// PLAYWRIGHT overrides the module path when Playwright is installed somewhere
// other than beside this repo. CHROME_PATH reuses a Chromium already on the
// machine when its build number does not match the installed Playwright, rather
// than downloading a second browser to sit beside a working one.

// Playwright ships CommonJS, so a PLAYWRIGHT that names its entry *file*
// resolves the exports under `.default`, while a bare specifier on the
// resolution path gives them directly. Accept either, and say which it is when
// neither resolves -- the previous destructure failed with an unhelpful
// "cannot read properties of undefined" on the documented file-path form.
const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) {
  console.error('Could not load Playwright. Set PLAYWRIGHT to its entry point, ' +
    'e.g. PLAYWRIGHT=./node_modules/playwright/index.js');
  process.exit(2);
}

const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');

const errors = [];
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));

// Every product here is offline-capable by design: no CDN, no font host, no
// analytics beacon. The hub says so in as many words ("everything runs in your
// browser, and nothing you type is uploaded"), which makes an off-origin
// request a broken promise rather than a performance note -- so it is collected
// and asserted on rather than ignored.
const ORIGIN = new URL(BASE).origin;
const offOrigin = [];
page.on('request', (r) => {
  if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) offOrigin.push(r.url());
});

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
}

/**
 * Run one section so that a throw inside it is a reported failure, not the end
 * of the run.
 *
 * Playwright's default is to throw after a 30s wait, and the steps below click
 * buttons that only exist when the step before them worked — so one broken
 * feature two thirds of the way down used to abort the process with a raw
 * TimeoutError and take every later check with it. That is not hypothetical:
 * the share-link step (5b) had been throwing on a hidden `apply` button, so
 * sections 6 through 9 — sitemaps, every sitemap URL, the 404, and mobile —
 * had not run in this harness for as long as that step was broken. A harness
 * that stops at its first problem reports one defect and hides the rest, which
 * is the opposite of what it is for.
 *
 * Sections are still ordered, not independent: several assert exact usage
 * counts, so a later section may legitimately depend on an earlier one having
 * run. A skipped section is therefore reported loudly rather than papered over.
 */
async function step(label, run) {
  try {
    await run();
  } catch (error) {
    failures += 1;
    const detail = String(error?.message ?? error).split('\n')[0];
    console.log(`FAIL  ${label} threw, later checks may be affected  -> ${detail}`);
  }
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

// The trades section is most of the site, so its sub-groups are what makes the
// hub browsable rather than a wall. A visitor who is not searching reads these
// headings; if they stop rendering, the failure is silent — every tool is still
// listed, just not findable by anyone who cannot already name it.
const subgroupCount = await page.locator('.subgroup').count();
check('the largest section is sub-divided', subgroupCount >= 2, `${subgroupCount} sub-groups`);
const biggestSubgroup = await page.evaluate(() =>
  Math.max(0, ...[...document.querySelectorAll('.subgroup')].map(
    (s) => s.querySelectorAll('.card').length)));
check('no sub-group is itself a wall', biggestSubgroup > 0 && biggestSubgroup <= 40,
  `largest holds ${biggestSubgroup}`);


// 2. Search.
await page.fill('#q', 'ebay');
await page.waitForTimeout(150);
const visible = await page.locator('.card:not([hidden])').count();
check('search narrows the list', visible > 0 && visible < cardCount, `${visible} of ${cardCount}`);

// A sub-group whose every card is filtered out has to go too: an empty heading
// with a count beside it reads as "no results here" repeated eight times.
await page.fill('#q', 'metal roof');
await page.waitForTimeout(150);
const staleSubgroups = await page.evaluate(() =>
  [...document.querySelectorAll('.subgroup:not([hidden])')].filter(
    (s) => ![...s.querySelectorAll('.card')].some((c) => !c.hidden)).length);
check('search hides sub-groups it emptied', staleSubgroups === 0, `${staleSubgroups} left showing`);

await page.fill('#q', 'zzzznotathing');
await page.waitForTimeout(150);
check('empty state appears', await page.locator('#empty').isVisible());
check('an empty search leaves no section showing',
  (await page.locator('.subgroup:not([hidden]), .group:not([hidden])').count()) === 0);

await page.fill('#q', '');
await page.waitForTimeout(150);
check('clearing search restores every tool',
  (await page.locator('.card:not([hidden])').count()) === cardCount);
check('clearing search restores every sub-group',
  (await page.locator('.subgroup:not([hidden])').count()) === subgroupCount);

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

// A figure being *present* proves very little: every tool here ships
// worked-example defaults, so the page shows money on load whether or not the
// arithmetic ran. A calculator whose `calc.mjs` throws on load passes the check
// above, passes every static check in `check.mjs`, and is useless in front of a
// user. So change an input and require the output to move.
async function drives(slug) {
  await page.goto(`${BASE}/${slug}/`, { waitUntil: 'networkidle' });
  const readout = async () =>
    (await page.textContent('body')).match(/\$\s?-?[\d,]+(?:\.\d+)?/g)?.join('|') ?? '';

  const onLoad = await readout();
  const fields = page.locator('input[type="number"]');
  const total = await fields.count();
  if (total === 0) return { moved: false, detail: 'no numeric inputs' };

  // Stop at the first field that moves the output. Which field that is differs
  // per tool, and several are only wired once a mode is selected.
  for (let i = 0; i < Math.min(total, 12); i++) {
    const field = fields.nth(i);
    if (!(await field.isVisible()) || !(await field.isEditable())) continue;
    await field.fill(String(Number((await field.inputValue()) || '0') + 137));
    await field.dispatchEvent('input');
    await page.waitForTimeout(200);
    if ((await readout()) !== onLoad) return { moved: true, detail: `input ${i} of ${total}` };
  }
  return { moved: false, detail: `${total} inputs, none changed the output` };
}

// One per shape of calculator on the site, so a regression in a shared helper
// shows up rather than hiding behind a tool that does not use it.
for (const slug of [
  'ebay-fee-calculator',
  'invoice-payment-terms-calculator',
  'amazon-fba-calculator',
  'janitorial-bid-calculator',
]) {
  const { moved, detail } = await drives(slug);
  check(`${slug} recomputes when an input changes`, moved, detail);
}

// 5. The cross-product sibling link that only resolves under this layout.
await page.goto(`${BASE}/where-to-sell-calculator/`, { waitUntil: 'networkidle' });
const sibling = page.locator('a[href="../ebay-fee-calculator/"]').first();
check('cross-product link is present', (await sibling.count()) > 0);
if (await sibling.count()) {
  await sibling.click();
  await page.waitForLoadState('networkidle');
  check('cross-product link resolves', page.url().includes('/ebay-fee-calculator/'), page.url());
}

// 5b. The shop rates a contractor saves once, carried to the next trade tool.
//     This is the one journey that spans two products, so nothing inside either
//     venture's own suite can cover it: the value only exists because they share
//     an origin, and it can only break at the seam.
// Defined outside the section because section 7 waits on the bar too, and a
// section that throws must not take a later section's helper with it.
const ratesReady = () => page.waitForFunction(
  () => !document.querySelector('[data-pf-rates-root]')?.hidden, null, { timeout: 5000 });

await step('shop rates carried between tools', async () => {
  await page.goto(`${BASE}/crown-molding-bid-calculator/`, { waitUntil: 'networkidle' });
  await ratesReady();
  check('shop-rates bar appears on a bid calculator', await page.isVisible('#pf-rates-toggle'));

  for (const [id, value] of [['hourlyWage', '56'], ['burdenRate', '34'], ['overheadRate', '12'], ['targetMargin', '26']]) {
    await page.fill(`#${id}`, value);
  }
  await page.click('#pf-rates-toggle');
  await page.click('[data-pf-rates="save"]');

  await page.goto(`${BASE}/interior-door-bid-calculator/`, { waitUntil: 'networkidle' });
  await ratesReady();
  const carried = await page.evaluate(() =>
    ['hourlyWage', 'burdenRate', 'overheadRate', 'targetMargin']
      .map((id) => document.getElementById(id).value).join('/'));
  check('saved rates carry into another trade calculator', carried === '56/34/12/26', carried);
  check('the receiving tool still prices the job',
    /\$[\d,]/.test(await page.textContent('#price')), await page.textContent('#price'));

  // The rule `share.mjs` exists to protect: a recipient must see the price the
  // sender saw. Their own saved rates must not quietly reprice someone's bid.
  await page.goto(
    `${BASE}/interior-door-bid-calculator/#hourlyWage=39&burdenRate=25&overheadRate=10&targetMargin=18`,
    { waitUntil: 'networkidle' });
  // The step above is a *hash-only* change from the previous URL — the same page
  // was just visited without a fragment — so the browser treats it as an in-page
  // jump and does not reload. Nothing re-reads the link, and the assertion below
  // then inspects a form still holding whatever the previous step left in it.
  //
  // That is how this check reported a share-link regression that does not exist:
  // it read `56` (the rates carried in moments earlier) and called it the
  // visitor's rates overwriting the sender's. `share.mjs` is fine — a recipient
  // opening this link in a fresh tab, or on any real load, gets 39. The harness
  // was wrong, and it then died on the hidden `apply` button below, taking every
  // later step with it.
  //
  // A recipient's browser always *loads* the link. Reload so this one does too.
  await page.reload({ waitUntil: 'networkidle' });
  await ratesReady();
  check('a bid link keeps the sender’s rates',
    (await page.inputValue('#hourlyWage')) === '39', await page.inputValue('#hourlyWage'));

  await page.click('#pf-rates-toggle');
  await page.click('[data-pf-rates="apply"]');
  check('...until the visitor asks for their own',
    (await page.inputValue('#hourlyWage')) === '56', await page.inputValue('#hourlyWage'));

  await page.click('[data-pf-rates="clear"]');
  await page.goto(`${BASE}/metal-roof-bid-calculator/`, { waitUntil: 'networkidle' });
  await ratesReady();
  check('forgetting them returns a never-opened tool to its own default',
    (await page.inputValue('#hourlyWage')) === '36', await page.inputValue('#hourlyWage'));
});

// Step 3 turned the site-wide opt-out on and never turned it off, so at this
// point nothing above should have been counted — including the shop rates. That
// is worth asserting rather than working around: an opt-out that a later feature
// quietly ignores is a broken promise, not a missing number.
await step('usage counting around shop rates', async () => {
  const silenced = await page.evaluate(
    () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
  check('the site-wide opt-out silences shop-rate counting too',
    !silenced.shop_rates_saved && !silenced.shop_rates_applied, JSON.stringify(silenced));

  // Then take the opt-out off and do it once more, so the counting itself is
  // covered. A prefill is not a bid the visitor priced: counting it as one would
  // inflate the only adoption number this portfolio has.
  await page.evaluate(() => localStorage.removeItem('portfolio-hub-optout'));
  await page.goto(`${BASE}/metal-roof-bid-calculator/`, { waitUntil: 'networkidle' });
  await ratesReady();
  await page.click('#pf-rates-toggle');
  await page.click('[data-pf-rates="save"]');
  await page.goto(`${BASE}/crown-molding-bid-calculator/`, { waitUntil: 'networkidle' });
  await ratesReady();
  const ratesCounts = await page.evaluate(
    () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
  check('the prefill records itself and not a false bid',
    ratesCounts.shop_rates_saved >= 1 && ratesCounts.shop_rates_applied >= 1
      && !ratesCounts.bid_calculated, JSON.stringify(ratesCounts));

  // 6. A product mounted from a subdirectory.
  await page.goto(`${BASE}/ai-engineering-academy/`, { waitUntil: 'networkidle' });
  check('nested product hub renders', (await page.locator('h1').count()) > 0, await page.title());
});

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

// Every sitemap, not a sample -- and every URL fetched rather than
// pattern-matched. A loc can be absolute, free of repo paths, and still 404,
// which is the only thing a crawler actually cares about.
let badLocs = 0;
let checked = 0;
const dead = [];
for (const child of children) {
  const xml = await (await page.request.get(local(child))).text();
  for (const loc of [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    checked += 1;
    if (!/^https?:\/\//.test(loc) || loc.includes('/ventures/')) { badLocs += 1; continue; }
    const res = await page.request.get(local(loc));
    if (!res.ok()) dead.push(`${loc} -> ${res.status()}`);
  }
}
check('every sitemap URL is absolute and repo-path-free',
  badLocs === 0 && checked > 0, `${badLocs} bad of ${checked}`);
check(`all ${checked} sitemap URLs resolve`, dead.length === 0, dead.slice(0, 5).join(' | '));

// 8. 404.
//    This step deliberately provokes errors -- the 404 itself, and on a plain
//    static server a bare error page with no icon link, which sends the browser
//    after `/favicon.ico` at the origin root and 404s again. Both belong to this
//    navigation, so everything it raises is excised by position rather than by
//    filtering 404s everywhere, which is what let a real one hide for weeks.
const beforeNotFound = errors.length;
const notFound = await page.goto(`${BASE}/no-such-page-here`, { waitUntil: 'domcontentloaded' });
check('unknown path returns 404', notFound.status() === 404, String(notFound.status()));
await page.waitForTimeout(300); // let the icon fallback land before the cut
const deliberate = errors.splice(beforeNotFound, errors.length - beforeNotFound);

// 9. Mobile.
await page.setViewportSize({ width: 375, height: 720 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow at 375px', overflow <= 0, `overflow ${overflow}px`);

await browser.close();

// The deliberate 404 above is the only expected console error.
// `errors` no longer contains anything the deliberate 404 step raised, so what
// is left is unexpected by construction. The previous `!/404/.test(e)` filter
// dropped every 404 anywhere in the run -- which is how every page shipped with
// a failing `/favicon.ico` on load until #1746, with this harness green
// throughout.
const realErrors = errors;
if (deliberate.length) {
  console.log(`\n(${deliberate.length} error(s) from the deliberate 404 step, ignored)`);
}
check('no off-origin request was made', offOrigin.length === 0, offOrigin.slice(0, 3).join(' | '));
check('no unexpected page, console, or resource error', realErrors.length === 0,
  realErrors.slice(0, 3).join(' | '));
console.log(`\n${failures} failed check(s), ${realErrors.length} page/console error(s)`);
for (const e of realErrors.slice(0, 10)) console.log(`  ${e}`);
if (failures || realErrors.length) process.exitCode = 1;
