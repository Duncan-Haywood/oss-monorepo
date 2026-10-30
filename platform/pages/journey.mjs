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
//   BASE_URL=https://duncan-haywood.github.io/oss-monorepo node platform/pages/journey.mjs
//
// **Check what is answering before you believe the result.** A server left
// running by an earlier build keeps the port, the second `http.server` exits
// with "Address already in use", and the run passes against the old tree
// without a word. It cost a false clean report on 2026-08-28. One curl settles
// it -- ask for something only the build under test has:
//
//   curl -s http://localhost:8793/<slug>/ | grep -c 'the thing you just added'
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
// Which document was current when each request *started*. A `requestfailed`
// fires when the navigation that supersedes a page cancels its still-inflight
// subresources, and by then `page.url()` is already the next page -- so the
// only moment the originating document can be read reliably is at request
// start. Step 8 below uses this to excise the deliberate 404's own fallout by
// cause rather than by a timer it can lose.
const startedOn = new WeakMap();
// Error strings whose request began on the deliberate 404 page. Kept as a set
// of the messages themselves rather than of indices, because step 8 splices
// `errors` and every index after the cut would shift under it.
const fromNotFoundPage = new Set();
let notFoundUrl = null;
page.on('request', (r) => startedOn.set(r, page.url()));
// The reason matters as much as the URL and used to be dropped. Playwright
// does not raise `requestfailed` for a 404 at all -- that is a response, not a
// failure -- so everything arriving here is a transport-level event, and
// `net::ERR_ABORTED` (the browser cancelled it) reads very differently from
// `net::ERR_CONNECTION_REFUSED` (nothing was listening). Reporting only the
// URL made an aborted precache indistinguishable from a dead asset, which cost
// a session an hour proving that a file the server returns 200 for was in fact
// present.
page.on('requestfailed', (r) => {
  const message = `requestfailed: ${r.url()} (${r.failure()?.errorText ?? 'no reason reported'})`;
  errors.push(message);
  if (notFoundUrl && startedOn.get(r) === notFoundUrl) fromNotFoundPage.add(message);
});

// Every product here is offline-capable by design: no CDN, no font host, no
// analytics beacon. The hub says so in as many words ("everything runs in your
// browser, and nothing you type is uploaded"), which makes an off-origin
// request a broken promise rather than a performance note -- so it is collected
// and asserted on rather than ignored.
//
// One exception, read from the file the build reads: the usage counter in
// `platform/counter/site.json`. The published site sends it page-view and
// feature counts (never what anyone typed), on purpose, and the build stamps
// that origin in. Until 2026-10-30 this check called those beacons a broken
// promise, so `journey` could not pass on any build that carried the counter.
// Only `<counter>/hit` is let through; any other request to that host, or to
// anywhere else, still fails here.
const ORIGIN = new URL(BASE).origin;
let COUNTER_HIT = null;
try {
  const { readFileSync } = await import('node:fs');
  const url = JSON.parse(readFileSync(new URL('../counter/site.json', import.meta.url), 'utf8')).url;
  if (url) COUNTER_HIT = `${new URL(url).origin}/hit`;
} catch { /* no counter configured: every off-origin request counts */ }
const offOrigin = [];
page.on('request', (r) => {
  const url = r.url();
  if (COUNTER_HIT && url.split(/[?#]/)[0] === COUNTER_HIT) return;
  if (!url.startsWith(ORIGIN) && !url.startsWith('data:')) offOrigin.push(url);
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

// 1. The front page: a front door, not the catalogue. It names the site, puts
// the search over everything first, and lists the sections.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check('hub h1 renders', (await page.textContent('h1')).trim().length > 10);
check('the site header is there', await page.locator('[data-pfs-head]').count() === 1);

// Counts are derived, never hardcoded: ventures land here weekly and a literal
// would fail on a healthy site the moment someone ships a calculator.
const categoryCount = await page.locator('.cat h3 a[data-category]').count();
check('the hub lists the sections', categoryCount >= 6, `${categoryCount} sections`);

// 1b. A section page carries the full list, sub-divided, with jump links that
// land. A broken anchor fails silently — the click does nothing — so it is
// clicked, not just counted.
await page.goto(`${BASE}/c/trades/`, { waitUntil: 'networkidle' });
const cardCount = await page.locator('.card').count();
check('a section page lists its tools', cardCount >= 30, `${cardCount} cards`);
const subgroupCount = await page.locator('.subgroup').count();
check('the largest section is sub-divided', subgroupCount >= 2, `${subgroupCount} sub-groups`);
const biggestSubgroup = await page.evaluate(() =>
  Math.max(0, ...[...document.querySelectorAll('.subgroup')].map(
    (s) => s.querySelectorAll('.card').length)));
check('no sub-group is itself a wall', biggestSubgroup > 0 && biggestSubgroup <= 60,
  `largest holds ${biggestSubgroup}`);
const target = await page.locator('.jumps a').last().getAttribute('href');
const beforeJump = await page.evaluate(() => window.scrollY);
await page.locator('.jumps a').last().click();
await page.waitForTimeout(400);
const jumped = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? Math.abs(el.getBoundingClientRect().top) : Infinity;
}, target);
check('the last jump link lands on its section',
  jumped < 120 && (await page.evaluate(() => window.scrollY)) > beforeJump,
  `${target} landed ${Math.round(jumped)}px from the viewport top`);
await page.fill('#cat-filter', 'roof');
await page.waitForTimeout(100);
const filtered = await page.locator('main .card:not([hidden])').count();
check('the section filter narrows the list', filtered > 0 && filtered < cardCount, `${filtered} of ${cardCount}`);
check('the filter hides sections it emptied', await page.evaluate(() =>
  [...document.querySelectorAll('.subgroup:not([hidden])')].every(
    (s) => s.querySelector('.card:not([hidden])'))));

// 2. Search, over the JSON index of every tool and research project.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.fill('#q', 'ebay');
await page.waitForSelector('#results li', { timeout: 10000 }).catch(() => {});
const visible = await page.locator('#results li').count();
check('search finds tools', visible > 0, `${visible} results`);
check('the first result for "ebay" is an eBay tool',
  /ebay/i.test((await page.locator('#results li a').first().textContent()) ?? ''));

await page.fill('#q', 'zzzznotathing');
await page.waitForTimeout(300);
check('empty state appears', await page.locator('#empty').isVisible());
check('an empty search lists nothing', (await page.locator('#results li').count()) === 0);

await page.fill('#q', '');
await page.waitForTimeout(300);
check('clearing search clears the results', await page.locator('#results').isHidden());

// The header's search box on every other page lands here with the query.
await page.goto(`${BASE}/?q=walmart`, { waitUntil: 'networkidle' });
await page.waitForSelector('#results li', { timeout: 10000 }).catch(() => {});
check('a ?q= link opens with results', (await page.locator('#results li').count()) > 0);

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
await page.goto(`${BASE}/c/marketplace/`, { waitUntil: 'networkidle' });
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

// 6b. Saved bids (`jobs.mjs`) — the Friday half of a bid.
//
//     The unit tests cover the storage shape and the restore rule as pure
//     functions. What only a browser can show is that a restored bid actually
//     reprices to the number the contractor saved, on a page whose rows were
//     built at runtime — which is the whole promise, and the one thing a
//     half-working restore would fake convincingly.
const jobsReady = () => page.waitForFunction(
  () => !document.querySelector('[data-pf-jobs-root]')?.hidden, null, { timeout: 5000 });

// Every currency figure the *tool* shows, in order. Comparing the whole set
// rather than one element keeps this generic across tools that name their
// output differently — and a restore that got one line right and another wrong
// would still be caught.
//
// The injected bands are excluded, and that is not tidiness. Since #1906 a
// saved-bid row prints the figure its bid was saved at, so a scrape of the
// whole body reads one contractor's other quotes as part of this tool's answer:
// saving a bid and then restoring it appeared to reprice the job, because the
// list above the form had grown a row. Both "restores to the same price" checks
// have been failing on `main` for that reason since it landed, and the failure
// was in the measurement rather than in the product.
const figures = () => page.evaluate(() => {
  const text = Array.from(document.body.children)
    .filter((node) => !/^pf-(jobs|rates|chrome)\b/.test(node.className || ''))
    .map((node) => node.innerText || '')
    .join('\n');
  return (text.match(/\$[\d,]+(?:\.\d{2})?/g) || []).join('|');
});

await step('a bid is still there when the customer calls back', async () => {
  const SLUG = 'water-heater-bid-calculator';
  await page.goto(`${BASE}/${SLUG}/`, { waitUntil: 'networkidle' });
  await jobsReady();
  check('saved-bids band appears on a bid calculator', await page.isVisible('#pf-jobs-toggle'));
  await page.click('#pf-jobs-toggle');

  // Price something that is not the tool's defaults, so a restore that quietly
  // did nothing could not pass by leaving the form where it started.
  const ids = (await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[type="number"][id]').forEach((n) => {
      if (!n.id.startsWith('pf-') && n.id !== 'usageOptOut') out.push(n.id);
    });
    return out;
  })).slice(0, 4);
  for (const [i, id] of ids.entries()) {
    await page.fill(`#${id}`, String(11 + i * 7));
    await page.dispatchEvent(`#${id}`, 'input');
  }
  const priced = await figures();
  check('the tool prices the job', /\$[\d,]/.test(priced), priced.slice(0, 40));

  await page.fill('#pf-jobs-name', '14 Oak St — Mrs Reid');
  await page.click('[data-pf-jobs="save"]');
  check('the bid saves under the name the contractor gave it',
    (await page.textContent('#pf-jobs-status')).includes('Saved “14 Oak St'),
    await page.textContent('#pf-jobs-status'));

  // A fresh load is the actual journey: Tuesday's tab is long closed.
  await page.goto(`${BASE}/${SLUG}/`, { waitUntil: 'networkidle' });
  await jobsReady();
  await page.click('#pf-jobs-toggle');
  check('it is still there after the tab was closed',
    (await page.textContent('#pf-jobs-status')).includes('1 saved bid'),
    await page.textContent('#pf-jobs-status'));

  await page.click('[data-pf-jobs="restore"]');
  check('restoring reprices to exactly the bid that was saved',
    (await figures()) === priced, `${(await figures()).slice(0, 40)} vs ${priced.slice(0, 40)}`);

  // The rule the module exists to enforce. A form carrying a field this bid
  // never priced must not be half-filled: the result would be a real,
  // plausible, different job that looks finished.
  const before = await figures();
  await page.evaluate(() => {
    const extra = document.createElement('input');
    extra.id = 'row2-qty';
    extra.type = 'number';
    extra.value = '9';
    document.body.appendChild(extra);
  });
  await page.click('[data-pf-jobs="restore"]');
  const refused = await page.textContent('#pf-jobs-status');
  check('a form that no longer matches refuses the restore',
    refused.includes('Not restored') && refused.includes('never priced'), refused);
  check('and leaves the form exactly as it was', (await figures()) === before);

  // Bids belong to the tool that priced them. A roof bid appearing under siding
  // would be a list of the wrong jobs at the moment a contractor trusts it.
  await page.goto(`${BASE}/siding-bid-calculator/`, { waitUntil: 'networkidle' });
  await jobsReady();
  await page.click('#pf-jobs-toggle');
  check('another tool shows none of this tool’s bids',
    !(await page.isVisible('#pf-jobs-list')));

  const jobCounts = await page.evaluate(
    () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
  check('saves and restores are counted, and refusals separately',
    jobCounts.bid_saved >= 1 && jobCounts.bid_restored >= 1 && jobCounts.bid_restore_refused >= 1,
    JSON.stringify(jobCounts));
  // The names are customer names and street addresses. They stay in the bid.
  check('and the usage counter holds no customer name',
    !/Oak|Reid/.test(JSON.stringify(jobCounts)));
});

// 6bc. The price band (`priceBandSentence`) — what the decided bids add up to.
//
//      The arithmetic is unit tested against rows built by hand. What only a
//      browser can show is that the figures reaching it are the ones this tool
//      actually printed: the band reads `bid.amount`, which was scraped off the
//      page's own hero at save time, so a selector that pointed at the wrong
//      element would produce a confident average of the wrong numbers. Four
//      bids are priced here at four different sizes for that reason, and the
//      sentence is checked against the figures the page itself showed.
await step('four decided bids say where this tool’s price tips', async () => {
  const SLUG = 'water-heater-bid-calculator';
  await page.goto(`${BASE}/${SLUG}/`, { waitUntil: 'networkidle' });
  // This step needs a known store and the backup step below needs the one the
  // step above built, so it borrows rather than clears: whatever is on the
  // device is put back before this step returns, including on the way out of a
  // failed check.
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await jobsReady();
  await page.click('#pf-jobs-toggle');
  try {

  const ids = (await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[type="number"][id]').forEach((n) => {
      if (!n.id.startsWith('pf-') && n.id !== 'usageOptOut') out.push(n.id);
    });
    return out;
  })).slice(0, 4);

  // Each job is priced by scaling the first field, so the four bids come out
  // in a known order without this test knowing what the tool prices.
  const hero = () => page.evaluate(() => {
    const node = document.querySelector('.hero-number');
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  const shown = [];
  for (const [n, size] of [8, 14, 20, 26].entries()) {
    for (const [i, id] of ids.entries()) {
      await page.fill(`#${id}`, String(size + i * 3));
      await page.dispatchEvent(`#${id}`, 'input');
    }
    shown.push(await hero());
    await page.fill('#pf-jobs-name', `Job ${n + 1}`);
    await page.click('[data-pf-jobs="save"]');
  }
  check('four jobs price to four different figures', new Set(shown).size === 4, shown.join(' '));

  // Nothing yet: four bids, none of them decided.
  check('an undecided list says nothing about price', !(await page.isVisible('#pf-jobs-band')));

  // Newest first, so row 0 is Job 4 (the dearest) and row 3 is Job 1.
  // Win the two cheapest, lose the two dearest — the separated case.
  const mark = async (index, value) => {
    await page.selectOption(`select[data-pf-jobs-index="${index}"]`, value);
    await page.waitForTimeout(50);
  };
  await mark(3, 'won');
  await mark(2, 'won');
  await mark(1, 'lost');
  check('one decided side is not a comparison', !(await page.isVisible('#pf-jobs-band')));
  await mark(0, 'lost');

  const band = (await page.textContent('#pf-jobs-band')).replace(/\s+/g, ' ').trim();
  check('the band reads once both sides have two', await page.isVisible('#pf-jobs-band'), band);
  check('it counts both sides', /The 2 you won here averaged .*, the 2 you lost, /.test(band), band);
  // The two cheapest were won and the two dearest lost, so the edges are the
  // figures this page printed for Job 2 and Job 3 — not a re-rendering of them.
  check('and quotes the tool’s own figures at the edges',
    band.includes(shown[1]) && band.includes(shown[2]), `${band} :: ${shown.join(' ')}`);
  check('and names the threshold rather than an overlap',
    /Every bid you won was .* or under, and every one you lost .* or over\./.test(band), band);

  // Undo one: the reading has to follow the data back down.
  await mark(0, '');
  check('taking a side back below two withdraws the reading',
    !(await page.isVisible('#pf-jobs-band')));

  const counts = await page.evaluate(
    () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
  check('the reading is counted', counts.bid_price_band_shown >= 1, JSON.stringify(counts));
  check('and the counter still holds no customer name and no figure',
    !/Job |\$/.test(JSON.stringify(counts)), JSON.stringify(counts));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6bcc. The margin reading (`marginSentence`) — what the won jobs kept.
//
//       Unit tests hand the function rows with an `amount` and a `cost`
//       already on them. Three things only a browser can settle, and all three
//       are wiring rather than arithmetic:
//
//       - the cost box exists on a won row and *not* on a lost or waiting one,
//         which is a render-time branch no string assertion reaches;
//       - what a person types into it survives the 'change' listener, the
//         normaliser, storage and the re-render, in a panel that rebuilds its
//         whole list on every keystroke-committing event; and
//       - the figure it is divided by is the one this page actually printed,
//         because `amount` is scraped off the hero at save time — the same
//         defect class 6bc exists for, one field along.
//
//       Priced deliberately so the pooled figure and the mean disagree: a
//       small job at 40% and two large ones near 4%. If this ever starts
//       reading ~16% the reading has quietly switched to the mean.
await step('costing the won jobs says whether the wins were worth having', async () => {
  const SLUG = 'water-heater-bid-calculator';
  await page.goto(`${BASE}/${SLUG}/`, { waitUntil: 'networkidle' });
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  try {
    await page.reload({ waitUntil: 'networkidle' });
    await jobsReady();
    await page.click('#pf-jobs-toggle');

    const ids = (await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input[type="number"][id]').forEach((n) => {
        if (!n.id.startsWith('pf-') && n.id !== 'usageOptOut') out.push(n.id);
      });
      return out;
    })).slice(0, 4);

    const hero = () => page.evaluate(() => {
      const node = document.querySelector('.hero-number');
      return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    const money = (text) => Number((/[\d,]+(?:\.\d+)?/.exec(text) || ['0'])[0].replace(/,/g, ''));

    // Three jobs at three sizes, cheapest first, so the small one can be the
    // profitable one below.
    const priced = [];
    for (const [n, size] of [6, 18, 30].entries()) {
      for (const [i, id] of ids.entries()) {
        await page.fill(`#${id}`, String(size + i * 2));
        await page.dispatchEvent(`#${id}`, 'input');
      }
      priced.push(money(await hero()));
      await page.fill('#pf-jobs-name', `Costed ${n + 1}`);
      await page.click('[data-pf-jobs="save"]');
    }
    check('three jobs price to three different figures',
      new Set(priced).size === 3, priced.join(' '));

    // Newest first: row 0 is Costed 3 (dearest), row 2 is Costed 1.
    const mark = async (index, value) => {
      await page.selectOption(`select[data-pf-jobs-index="${index}"]`, value);
      await page.waitForTimeout(50);
    };
    check('a waiting row offers nowhere to enter a cost',
      (await page.locator('[data-pf-jobs-cost]').count()) === 0);
    await mark(0, 'lost');
    check('and a lost row offers the winning price instead, not a cost',
      (await page.locator('[data-pf-jobs-cost]').count()) === 0 &&
      (await page.locator('[data-pf-jobs-lostto]').count()) === 1);

    await mark(0, 'won');
    await mark(1, 'won');
    await mark(2, 'won');
    check('every won row gets a cost box',
      (await page.locator('[data-pf-jobs-cost]').count()) === 3);
    check('three uncosted wins say nothing about margin',
      !(await page.isVisible('#pf-jobs-margin')));
    // …but the panel no longer says nothing at all. Before this reading, a
    // book in exactly this state had one paragraph fewer than a costed book
    // and no way for its owner to tell that was a choice rather than a tool
    // with nothing to offer them — which is the narrowest point of the whole
    // money funnel, and the one thing no calculation can widen.
    const askedFor = (await page.textContent('#pf-jobs-costgap')).replace(/\s+/g, ' ').trim();
    check('instead the panel says what it is missing and what that would buy',
      await page.isVisible('#pf-jobs-costgap') &&
      /^None of the 3 jobs you have won here carry what they came to once they were delivered\./
        .test(askedFor), askedFor);
    check('and asks for exactly what the reading needs, not for all of them',
      /the box beside 3 more of them/.test(askedFor) &&
      /the one question every reading above it leaves open/.test(askedFor), askedFor);

    // 40% on the small job, ~4% on the two large ones. Typed and committed
    // through 'change', which is the path a person's keyboard takes.
    const costs = [
      Math.round(priced[2] * 0.96), // row 0, dearest
      Math.round(priced[1] * 0.96), // row 1
      Math.round(priced[0] * 0.60), // row 2, cheapest and the profitable one
    ];
    for (const [index, cost] of costs.entries()) {
      await page.fill(`[data-pf-jobs-cost][data-pf-jobs-index="${index}"]`, String(cost));
      await page.dispatchEvent(`[data-pf-jobs-cost][data-pf-jobs-index="${index}"]`, 'change');
      await page.waitForTimeout(50);
    }

    const margin = (await page.textContent('#pf-jobs-margin')).replace(/\s+/g, ' ').trim();
    check('the reading appears once all three are costed',
      await page.isVisible('#pf-jobs-margin'), margin);
    // And the ask goes away the moment it is answered, which is the whole
    // difference between a prompt and a banner.
    check('the panel stops asking once every won job carries a cost',
      !(await page.isVisible('#pf-jobs-costgap')));
    check('it counts the finished jobs and quotes what they charged',
      /^The 3 you finished here were priced at .* and cost you .* — you kept .*, \d+% of what you charged\./
        .test(margin), margin);

    // The figure the tool itself printed, summed — not a re-rendering, and not
    // a number this feature invented.
    const charged = priced[0] + priced[1] + priced[2];
    const kept = charged - costs.reduce((a, b) => a + b, 0);
    const pooled = Math.round((kept / charged) * 100);
    const mean = Math.round(
      ((priced[2] - costs[0]) / priced[2] + (priced[1] - costs[1]) / priced[1] +
        (priced[0] - costs[2]) / priced[0]) * 100 / 3);
    check('the share is pooled, not the mean of the three jobs',
      margin.includes(`${pooled}% of what you charged`) && pooled !== mean,
      `${margin} :: pooled ${pooled} mean ${mean}`);
    check('and the spread is named, because no one job did the average',
      /They run from \d+% to \d+%,/.test(margin), margin);

    // The figure has to survive a reload — it is on disk, not in the render.
    await page.reload({ waitUntil: 'networkidle' });
    await jobsReady();
    await page.click('#pf-jobs-toggle');
    check('the costs are still there after a reload',
      (await page.textContent('#pf-jobs-margin')).replace(/\s+/g, ' ').trim() === margin);

    // A cost belongs to a job that was done. Taking the win back takes it.
    await mark(2, '');
    check('un-winning a job drops its cost and withdraws the reading',
      !(await page.isVisible('#pf-jobs-margin')));
    await mark(2, 'won');
    check('and the figure does not come back with the outcome',
      await page.inputValue('[data-pf-jobs-cost][data-pf-jobs-index="2"]') === '');
    // Two of three costed now, so the ask is back and counts down rather than
    // repeating itself.
    const partly = (await page.textContent('#pf-jobs-costgap')).replace(/\s+/g, ' ').trim();
    check('a partly costed book is asked only for what is still missing',
      /^Only 2 of the 3 jobs you have won here carry/.test(partly) &&
      /the box beside one more of them/.test(partly), partly);

    // The other branch: a margin that is drawing while part of the book sits
    // outside it. Put row 2's cost back, then add a fourth win and leave it
    // uncosted — the shape a contractor is actually in most of the time, and
    // the one where a pooled figure is read as the whole book.
    await page.fill('[data-pf-jobs-cost][data-pf-jobs-index="2"]', String(costs[2]));
    await page.dispatchEvent('[data-pf-jobs-cost][data-pf-jobs-index="2"]', 'change');
    await page.waitForTimeout(50);
    await page.fill('#pf-jobs-name', 'Costed 4');
    await page.click('[data-pf-jobs="save"]');
    await page.waitForTimeout(50);
    await mark(0, 'won');
    const blind = (await page.textContent('#pf-jobs-costgap')).replace(/\s+/g, ' ').trim();
    check('a drawing margin is told how much of the book it cannot see',
      await page.isVisible('#pf-jobs-margin') && await page.isVisible('#pf-jobs-costgap') &&
      /^Of the 4 jobs you have won here, 3 carry what they came to and 1 do not\./.test(blind),
      blind);
    check('and that the missing job is absent from the figure, not averaged into it',
      /missing from it rather than averaged into it/.test(blind) &&
      /describes part of your book and not all of it\.$/.test(blind), blind);
    check('the ask never prints a money figure, so it is safe on a mixed book',
      !/[$£€]/.test(blind + ' ' + partly + ' ' + askedFor), blind);

    const counts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
    check('the cost entries and the reading are counted',
      counts.bid_cost_set >= 3 && counts.bid_margin_shown >= 1, JSON.stringify(counts));
    // The funnel's own numerator and denominator, side by side: how often the
    // gap was named against how often a cost was then typed.
    check('and so is the ask that precedes them',
      counts.bid_cost_gap_shown >= 1, JSON.stringify(counts));
    check('and the counter holds no customer name, figure or cost',
      !/Costed |\$/.test(JSON.stringify(counts)), JSON.stringify(counts));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6bd. The chase line (`chaseSentence`) — which quotes have gone quiet.
//
//      Unit tests build the timestamps by hand. What only a browser shows is
//      that the timestamps a real save and a real "Won" actually write are the
//      ones this reads: `at` from the save path, `decidedAt` from the select.
//      They are written by two different code paths and had never been read
//      together by anything a visitor sees.
await step('the tool says which quotes have outlived every answer it has seen', async () => {
  const SLUG = 'water-heater-bid-calculator';
  await page.goto(`${BASE}/${SLUG}/`, { waitUntil: 'networkidle' });
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  try {
    // Three answered bids and two still out. The store is seeded directly
    // because a browser cannot be made to wait nine days, but the *shape* is
    // the one the save path writes — asserted below by driving a real save and
    // a real "Won" through the UI and checking the panel counts them.
    await page.evaluate(({ slug, now }) => {
      const at = (d) => new Date(now - d * 86400000).toISOString();
      localStorage.setItem('portfolio-saved-bids', JSON.stringify({ v: 1, bids: { [slug]: [
        { name: 'A', at: at(40), outcome: 'won', decidedAt: at(38), fields: { a: '1' } },
        { name: 'B', at: at(30), outcome: 'lost', decidedAt: at(21), fields: { a: '1' } },
        { name: 'C', at: at(25), outcome: 'won', decidedAt: at(20), fields: { a: '1' } },
        { name: 'D', at: at(19), fields: { a: '1' } },
        { name: 'E', at: at(3), fields: { a: '1' } },
      ] } }));
    }, { slug: SLUG, now: Date.now() });
    await page.reload({ waitUntil: 'networkidle' });
    await jobsReady();
    await page.click('#pf-jobs-toggle');

    const line = (await page.textContent('#pf-jobs-chase')).replace(/\s+/g, ' ').trim();
    check('the panel reports the spread of answers it has actually seen',
      /^The 3 bids you have heard back on came back in 2 to 9 days\./.test(line), line);
    // D is 19 days out and nothing has ever taken longer than 9. E, at 3 days,
    // is not late and must not be counted — a line that flagged every waiting
    // bid would be the age column again with more words.
    check('and counts only the quotes that have outlived all of them',
      /1 still waiting has been out longer than that\.$/.test(line), line);

    // The other half: which one. The sentence counts, the row is marked, and
    // the two come off one `responseWindow` — so a panel that said "1 still
    // waiting" over a list with two tags on it would be caught here.
    const marked = await page.locator('.pf-jobs-list li[data-pf-jobs-quiet]').count();
    check('the row the sentence means is the one marked', marked === 1, `${marked} marked`);
    const markedName = await page.textContent('.pf-jobs-list li[data-pf-jobs-quiet] .pf-jobs-name');
    check('and it is D at 19 days, not E at 3', markedName.trim() === 'D', markedName);
    const tagText =
      (await page.textContent('.pf-jobs-list li[data-pf-jobs-quiet] .pf-jobs-quiet') || '').trim();
    check('the mark is a word and not only a colour', tagText === 'Chase', tagText || '(no tag)');

    // Now the part the seed cannot prove: that a bid saved and decided through
    // the UI lands in the same window. Saving E again reprices it to today and
    // marking it won writes decidedAt now, so it answers in 0 days and drags
    // the low end of the range down.
    const ids = (await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input[type="number"][id]').forEach((n) => {
        if (!n.id.startsWith('pf-') && n.id !== 'usageOptOut') out.push(n.id);
      });
      return out;
    })).slice(0, 4);
    for (const [i, id] of ids.entries()) {
      await page.fill(`#${id}`, String(9 + i * 4));
      await page.dispatchEvent(`#${id}`, 'input');
    }
    await page.fill('#pf-jobs-name', 'F');
    await page.click('[data-pf-jobs="save"]');
    await page.selectOption('select[data-pf-jobs-index="0"]', 'won');
    await page.waitForTimeout(50);

    const after = (await page.textContent('#pf-jobs-chase')).replace(/\s+/g, ' ').trim();
    check('a bid saved and decided through the UI joins the same window',
      /^The 4 bids you have heard back on came back in 0 to 9 days\./.test(after), after);

    const counts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
    check('the chase reading is counted', counts.bid_chase_shown >= 1, JSON.stringify(counts));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6be. The chase line on the hub — the window read across every tool at once.
//
//      The step above proves the reading works on one tool. This proves the
//      case that tool can never reach: the window needs three answered bids,
//      and a contractor working six calculators has three answers in *total*
//      and one in each. Per-tool, the line is blank on all six. Pooled, it is
//      the whole signal — and it is sound to pool because a reply time is a
//      fact about their customers rather than about a trade. (The price band is
//      the opposite case and stays per-tool: a gutter bid and a deck bid do not
//      belong in one dollar comparison.)
//
//      It also covers the cut. A quiet bid is an old bid by definition, so a
//      plain newest-first slice of eight hid exactly the rows the line above it
//      had just asked the contractor to act on.
await step('the hub pools answers no single tool has enough of', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  try {
    // One answer each on three tools, and two quotes long out. Eight fresher
    // waiting bids sit on a fourth so both quiet ones fall past the cut.
    await page.evaluate((now) => {
      const at = (d) => new Date(now - d * 86400000).toISOString();
      const fresh = [];
      for (let i = 0; i < 8; i++) fresh.push({ name: 'Fresh ' + i, at: at(i), fields: { a: '1' } });
      localStorage.setItem('portfolio-saved-bids', JSON.stringify({ v: 1, bids: {
        'fence-bid-calculator': [
          { name: 'A', at: at(40), outcome: 'won', decidedAt: at(38), fields: { a: '1' } },
          { name: 'Quiet 30', at: at(30), fields: { a: '1' } }],
        'deck-bid-calculator': [
          { name: 'B', at: at(50), outcome: 'lost', decidedAt: at(41), fields: { a: '1' } },
          { name: 'Quiet 19', at: at(19), fields: { a: '1' } }],
        'drywall-bid-calculator': [
          { name: 'C', at: at(20), outcome: 'won', decidedAt: at(18), fields: { a: '1' } }],
        'flooring-bid-calculator': fresh,
      } }));
    }, Date.now());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const line = (await page.textContent('#bidsChase')).replace(/\s+/g, ' ').trim();
    check('the hub draws a window from one answer on each of three tools',
      /^The 3 bids you have heard back on came back in 2 to 9 days\./.test(line), line);
    check('and counts both quotes that have outlived it',
      /2 still waiting have been out longer than that\.$/.test(line), line);

    const tags = await page.locator('#bidsList .bid-chase-tag').count();
    check('both rows are marked, not just counted', tags === 2, `${tags} tags`);

    // The cut: eight newest plus the two quiet ones, and a count line that says
    // so rather than claiming ten "most recent".
    const drawn = await page.locator('#bidsList li').count();
    check('a quiet quote is surfaced past the eight-row cut', drawn === 10, `${drawn} rows`);
    const more = (await page.textContent('#bidsMore')).replace(/\s+/g, ' ').trim();
    check('and the count line names both tiers',
      /Showing the 8 most recent of 13 saved bids, plus 2 that have gone quiet\./.test(more), more);

    // Order is the index's, not the chase list's: the section is used to find
    // the job whose customer just rang, and resorting it would cost that.
    const first = await page.textContent('#bidsList .bid-name');
    check('the newest bid is still first', first.trim() === 'Fresh 0', first);

    const counts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
    check('the hub chase reading is counted', counts.saved_bid_chase_shown >= 1, JSON.stringify(counts));
    check('and the counter holds no customer name',
      !/Quiet |Fresh /.test(JSON.stringify(counts)), JSON.stringify(counts));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6bf. The pricing line on the hub — the same pooling argument, for price.
//
//      The step above pools *timing* across tools. This pools how the pricing
//      is landing, and it is the same case: three lost bids spread over three
//      calculators draw nothing on any of them, because each tool is below its
//      own threshold. Pooled they are a season's evidence.
//
//      What only a browser pass can show is that the whole chain survives the
//      trip through storage: the band writes `lostTo` on a lost bid, the hub's
//      savedBids() carries it through `normalizeLostTo`, and `pricingSentence`
//      reads it. That chain is exactly where the chase line was broken for a
//      release — the hub built rows without `decidedAt`, so the reading was
//      injected on every visit and returned '' forever. Nothing failed, and the
//      unit tests passed throughout, because the unit tests hand the function
//      the field the page was not carrying.
//
//      Mixed currencies are in the fixture on purpose. Every money reading here
//      refuses them and is right to; a percentage over the winning price is
//      computed inside one bid's own currency, so it pools with no conversion.
await step('the hub pools how the pricing is landing, in percentages', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  try {
    // One lost bid with a known winning price on each of three tools, each 20%
    // over, in three different currencies. Plus a won bid and a waiting bid
    // that must contribute nothing.
    await page.evaluate((now) => {
      const at = (d) => new Date(now - d * 86400000).toISOString();
      const lost = (name, amount, lostTo, d) => ({
        name, at: at(d), fields: { a: '1' }, amount,
        outcome: 'lost', decidedAt: at(d - 4), lostTo,
      });
      localStorage.setItem('portfolio-saved-bids', JSON.stringify({ v: 1, bids: {
        'fence-bid-calculator': [
          lost('Oak St', '$2,400', '2000', 30),
          { name: 'Won it', at: at(28), fields: { a: '1' }, amount: '$9,999',
            outcome: 'won', decidedAt: at(26), lostTo: '1' }],
        'deck-bid-calculator': [
          lost('Mrs Reid', '£3,600', '3000', 25),
          { name: 'Still out', at: at(3), fields: { a: '1' }, amount: '$9,999' }],
        'pergola-bid-calculator': [lost('Cedar', '€1,200', '1000', 20)],
      } }));
    }, Date.now());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const line = (await page.textContent('#bidsPricing')).replace(/\s+/g, ' ').trim();
    check('the hub pools three lost bids no single tool could report',
      /^Across the 3 bids you lost on 3 tools where you know the winning price,/.test(line), line);
    check('and reports the mean percentage, across three currencies',
      /yours averaged 20% over\./.test(line), line);
    check('with the closest near-miss', /The closest was 20% over\.$/.test(line), line);
    // The reason it may be pooled at all: no figure in it is money.
    check('no money figure is on the pooled line', !/[$£€]/.test(line), line);
    check('and no customer name is either', !/Oak St|Reid|Cedar/.test(line), line);

    const counts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
    check('the hub pricing reading is counted',
      counts.saved_bid_pricing_shown >= 1, JSON.stringify(counts));
    check('and that counter holds no customer name either',
      !/Oak St|Reid|Cedar/.test(JSON.stringify(counts)), JSON.stringify(counts));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6bw. The win rate on the hub — the reading that needs no figure at all.
//
//      The step above needs a winning price on each lost bid, which is evidence
//      most books do not carry. This one needs nothing but the outcome, so it
//      is the reading a real contractor is most likely to actually see, and the
//      fixture is built to prove that: not one bid in it has an amount, a
//      winning price, or a currency. `pricingSentence` and both money readings
//      draw nothing on this book; the win rate draws.
//
//      Only a browser pass can show the second half. `winRateSentence` names a
//      tool by its `label`, and nothing in storage carries one — the hub reads
//      it off the card the row was matched to, at render time. A unit test
//      hands the function a label and so cannot fail the way this can: if the
//      hub ever stops attaching it, the sentence silently reverts to naming
//      "deck-bid-calculator" at a contractor, which is exactly the kind of
//      quiet regression the chase line shipped once already.
await step('the hub says how often the quotes land, with no figure anywhere', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  try {
    // Four won and one lost on one tool, one won and five lost on another: a
    // 63-point gap, so the trades are named. Plus a waiting bid that must not
    // count as decided, and a third tool below the naming floor that must be
    // counted in the rate and never named.
    await page.evaluate((now) => {
      const at = (d) => new Date(now - d * 86400000).toISOString();
      const run = (outcome, n, from) => Array.from({ length: n }, (_, i) => ({
        name: outcome + ' ' + i, at: at(from - i), fields: { a: '1' },
        outcome, decidedAt: at(from - i - 2),
      }));
      localStorage.setItem('portfolio-saved-bids', JSON.stringify({ v: 1, bids: {
        'fence-bid-calculator': [...run('won', 4, 40), ...run('lost', 1, 30)],
        'deck-bid-calculator': [...run('won', 1, 28), ...run('lost', 5, 25)],
        'pergola-bid-calculator': [...run('won', 1, 18),
          { name: 'Still out', at: at(2), fields: { a: '1' } }],
      } }));
    }, Date.now());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const line = (await page.textContent('#bidsWinRate')).replace(/\s+/g, ' ').trim();
    // 6 won of 12 decided. The waiting bid is the thirteenth and must not be in
    // the denominator — the bug that would read as "you win 46%" forever.
    check('the hub counts every decided bid and no waiting one',
      /^You have won 6 of 12 decided bids — 50%, across 3 tools\./.test(line), line);
    // The half no single tool can produce, and the proof the label survived the
    // trip from the card to the sentence: these are headings, not slugs.
    check('and names the trades the rate is coming from, as the hub names them',
      /Fence Bid Calculator is winning 4 of 5; Deck Bid Calculator, 1 of 6\./.test(line), line);
    check('the tool below the naming floor is counted but not named',
      !/Pergola/.test(line) && !/pergola-bid-calculator/.test(line), line);
    check('no slug leaked into the sentence in place of a name',
      !/-bid-calculator/.test(line), line);
    // A count has no unit; a figure here would mean money got pooled.
    check('no money figure is on the win-rate line', !/[$£€]/.test(line), line);
    // The pricing line must stay silent: not one bid here carries a figure.
    const priced = (await page.textContent('#bidsPricing')).trim();
    check('and the money reading correctly draws nothing on this book',
      priced === '', priced);

    const counts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
    check('the win-rate reading is counted',
      counts.saved_bid_win_rate_shown >= 1, JSON.stringify(counts));
    check('and the counter names no tool and no trade',
      !/fence|deck|pergola/i.test(JSON.stringify(counts)), JSON.stringify(counts));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6bk. Which of these trades the finished work is worth doing (`keepSentence`).
//
//      The one reading on the hub about money already earned, and the one with
//      the longest chain of wiring behind it. `savedBids()` on the hub is a
//      hand copy of `normalizeBid`, and `cost` was not in it until this step
//      existed: every field that reading needs has to survive being written by
//      a tool page's band, parsed by the hub's own transcription, and matched
//      to a card whose heading becomes the trade's name. A unit test is handed
//      rows with `cost` and `label` already on them and so cannot fail the way
//      this can — the reading would simply be injected on every visit and
//      return '' forever, exactly as the chase line did before 6bw.
//
//      The fixture is three trades priced so the ends are far apart and the
//      middle one is neither, plus three rows that must not count: a lost bid
//      carrying a cost, a won bid nobody costed, and a fourth trade with a
//      single costed win — below the naming floor, so it may not appear.
await step('the hub says which of these trades the finished work is worth doing', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  try {
    await page.evaluate((now) => {
      const at = (d) => new Date(now - d * 86400000).toISOString();
      let n = 0;
      const won = (amount, cost, day) => ({
        name: 'Job ' + (++n), at: at(day), fields: { a: '1' },
        outcome: 'won', decidedAt: at(day - 2), amount, cost,
      });
      localStorage.setItem('portfolio-saved-bids', JSON.stringify({ v: 1, bids: {
        // 1,400 kept of 5,000 charged — 28%.
        'fence-bid-calculator': [won('$3,000', '2100', 40), won('$2,000', '1500', 38)],
        // 1,600 of 10,000 — 16%, and neither end of the spread.
        'deck-bid-calculator': [won('$4,000', '3400', 36), won('$6,000', '5000', 34)],
        // 50 of 1,100 — 5%. Busy, winning, and barely worth the drive.
        'lawn-care-bid-calculator': [won('$500', '480', 30), won('$600', '570', 28)],
        'pergola-bid-calculator': [
          won('$2,000', '1000', 26),
          { name: 'Lost one', at: at(24), fields: { a: '1' }, outcome: 'lost',
            decidedAt: at(22), amount: '$9,999', cost: '1' },
          { name: 'Never costed', at: at(20), fields: { a: '1' }, outcome: 'won',
            decidedAt: at(18), amount: '$9,999' },
        ],
      } }));
    }, Date.now());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const line = (await page.textContent('#bidsKeep')).replace(/\s+/g, ' ').trim();
    check('the hub draws the reading at all, which is the whole cost round trip',
      await page.isVisible('#bidsKeep'), line);
    // Six, not nine: the lost bid, the uncosted win and the lone costed win on
    // a fourth trade are all outside the comparison.
    check('it counts only the finished jobs that were actually costed',
      /^Of the 6 finished jobs you have costed, across 3 tools, /.test(line), line);
    // The ends, by their card headings rather than their slugs — the half only
    // a browser can prove, because nothing in storage carries a label.
    check('and names the two ends as the hub names them',
      /Fence Bid Calculator kept the most: 28% of what you charged on 2;/.test(line) &&
      /Lawn Care Bid Calculator kept 5% on 2\./.test(line), line);
    check('the trade below the naming floor is left out entirely',
      !/Pergola/i.test(line), line);
    check('no slug leaked into the sentence in place of a name',
      !/-bid-calculator/.test(line), line);
    // 23 points apart, so the finding is which work they take.
    check('a wide gap is aimed at the trade rather than at the price list',
      /gap is in which work you take rather than across your prices/.test(line), line);
    // Percentages only. A currency symbol here would mean money was pooled
    // across trades, which is the one thing this reading must never do.
    check('no money figure is on the keep line', !/[$£€]/.test(line), line);

    const counts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
    check('the keep reading is counted',
      counts.saved_bid_keep_shown >= 1, JSON.stringify(counts));
    check('and the counter names no trade and holds no figure',
      !/fence|deck|lawn|Job /i.test(JSON.stringify(counts)), JSON.stringify(counts));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6bx. Whether the work that lands is the work that pays (`mixSentence`).
//
//      The reading that needs both of the two above at once, on the same
//      trade, which is why it gets a browser step of its own rather than
//      riding on 6bk's fixture: it is the only line on the hub that reads a
//      tool's decided *and* costed history together, so a wiring fault in
//      either half silences it while both neighbours keep drawing and nothing
//      anywhere looks wrong. The label round trip is the same one 6bk proves
//      and is proved again here because this sentence names two trades in a
//      different order and a card-matching bug could reach one and not the
//      other.
//
//      The fixture is the book every other reading in this panel calls good
//      news: the fence work is landing, four quotes out of five. It is landing
//      because it is priced at a twentieth over what it costs to deliver, and
//      the deck work that keeps 28% is the work being lost.
await step('the hub says whether the work that lands is the work that pays', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  try {
    await page.evaluate((now) => {
      const at = (d) => new Date(now - d * 86400000).toISOString();
      let n = 0;
      const decided = (outcome, day, extra) => ({
        name: 'Job ' + (++n), at: at(day), fields: { a: '1' },
        outcome, decidedAt: at(day - 2), ...extra,
      });
      localStorage.setItem('portfolio-saved-bids', JSON.stringify({ v: 1, bids: {
        // Lands 4 of 5. The two costed wins keep 100 of 2,000 — 5%.
        'fence-bid-calculator': [
          decided('won', 40, { amount: '$1,000', cost: '950' }),
          decided('won', 39, { amount: '$1,000', cost: '950' }),
          decided('won', 38, { amount: '$1,000' }),
          decided('won', 37, { amount: '$1,000' }),
          decided('lost', 36, {}),
        ],
        // Lands 2 of 8. The two costed wins keep 2,800 of 10,000 — 28%.
        'deck-bid-calculator': [
          decided('won', 35, { amount: '$5,000', cost: '3600' }),
          decided('won', 34, { amount: '$5,000', cost: '3600' }),
          ...[33, 32, 31, 30, 29, 28].map((d) => decided('lost', d, {})),
        ],
      } }));
    }, Date.now());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const line = (await page.textContent('#bidsMix')).replace(/\s+/g, ' ').trim();
    check('the hub draws the crossed reading at all',
      await page.isVisible('#bidsMix'), line);
    check('it says plainly that the two disagree',
      /^The work you win is not the work that pays: /.test(line), line);
    // Both halves of both trades, by their card headings rather than their
    // slugs — the part only a browser can prove, because nothing in storage
    // carries a label.
    check('and names the landing trade with both its figures',
      /Fence Bid Calculator lands 4 of 5 quotes and keeps 5% of what it charged on the 2 you costed;/
        .test(line), line);
    check('and the paying trade with both of its own',
      /Deck Bid Calculator lands 2 of 8 and keeps 28% on 2\./.test(line), line);
    check('no slug leaked into the sentence in place of a name',
      !/-bid-calculator/.test(line), line);
    check('it points the price rise at the trade that is winning',
      /worth a price rise before it is worth more of your time/.test(line), line);
    // Percentages and counts only. A currency symbol here would mean money was
    // pooled across two trades, which this reading must never do.
    check('no money figure is on the mix line', !/[$£€]/.test(line), line);

    const counts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
    check('the mix reading is counted',
      counts.saved_bid_mix_shown >= 1, JSON.stringify(counts));
    check('and the counter names no trade, no figure and no branch',
      !/fence|deck|pays|Job /i.test(JSON.stringify(counts)), JSON.stringify(counts));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6bp. The same finding, in the panel on the tool's own page
//      (`toolTrendSentence`).
//
//      The hub step below proves the reading; this one proves it reaches the
//      page where it is worth the most. A contractor opens the hub when a
//      customer rings back, and opens this panel while deciding what to charge
//      for the next job — the only moment the finding can still change an
//      outcome.
//
//      Two things only a browser settles, and both are wiring. First, the line
//      is on a tool with **no headline figure**: every other reading in this
//      panel rides on the page having a hero number to compare, and this one
//      counts outcomes and never looks at a figure, so gating it away with the
//      money half would silently cost it a third of the pages the panel
//      reaches. Second, `trendDetail` calls `bidWaitingDays`, which ships in a
//      different injected bundle in the same shared script — if that ordering
//      ever breaks the panel throws mid-render and the whole feature goes with
//      it, which a string assertion cannot see.
await step('the tool page says whether its own quotes have been landing differently', async () => {
  const SLUG = 'cleaning-dilution-calculator';
  await page.goto(`${BASE}/${SLUG}/`, { waitUntil: 'networkidle' });
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  try {
    check('this tool keeps no headline figure, so the money readings are absent',
      (await page.locator('#pf-jobs-margin').count()) === 0 &&
      (await page.locator('#pf-jobs-band').count()) === 0);

    await page.evaluate((now) => {
      const at = (d) => new Date(now - d * 86400000).toISOString();
      const run = (outcome, n, from) => Array.from({ length: n }, (_, i) => ({
        name: outcome + ' ' + i, at: at(from - i * 10), fields: { a: '1' },
        outcome, decidedAt: at(from - i * 10 - 2),
      }));
      localStorage.setItem('portfolio-saved-bids', JSON.stringify({ v: 1, bids: {
        // Five won last spring, five lost since, plus one still waiting that
        // must not be counted on either side.
        'cleaning-dilution-calculator': [
          ...run('lost', 5, 60), ...run('won', 5, 200),
          { name: 'Still out', at: at(1), fields: { a: '1' } },
        ],
      } }));
    }, Date.now());
    await page.reload({ waitUntil: 'networkidle' });
    await jobsReady();
    await page.click('#pf-jobs-toggle');
    await page.waitForTimeout(100);

    const line = (await page.textContent('#pf-jobs-trend')).replace(/\s+/g, ' ').trim();
    check('the panel draws the reading with no hero figure anywhere on the page',
      await page.isVisible('#pf-jobs-trend'), line);
    check('it speaks about this page rather than naming the trade back at the reader',
      /^The bids you saved here have been landing less often than they were: /.test(line) &&
      !/Cleaning|Dilution|calculator/i.test(line), line);
    check('the waiting bid is on neither side of the split',
      /0 of 5 on the 5 most recent, against 5 of 5 before them\./.test(line), line);
    // The clause that needs bidWaitingDays out of the other bundle. Its absence
    // would mean the helper returned null; a throw would have emptied the panel.
    check('and the turn is dated, which is the cross-bundle half',
      /The recent half starts \d+ days back\./.test(line), line);
    check('no money figure is on it, because this reading never reads one',
      !/[$£€]/.test(line), line);

    // On disk, not in the render.
    await page.reload({ waitUntil: 'networkidle' });
    await jobsReady();
    await page.click('#pf-jobs-toggle');
    await page.waitForTimeout(100);
    check('the reading survives a reload',
      (await page.textContent('#pf-jobs-trend')).replace(/\s+/g, ' ').trim() === line);

    const counts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
    check('the panel reading is counted separately from the hub\'s',
      counts.bid_trend_shown >= 1, JSON.stringify(counts));
    // The event itself carries nothing. `tool_viewed:<slug>` is a different,
    // long-standing counter and is not this reading's to answer for, so the
    // assertion is over this reading's own keys rather than the whole blob.
    const trendKeys = Object.keys(counts).filter((k) => k.indexOf('bid_trend') === 0);
    check('and the event names no trade, no direction and no figure',
      trendKeys.length === 1 && trendKeys[0] === 'bid_trend_shown', trendKeys.join(' '));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6bt. Whether what the contractor changed is working (`trendSentence`).
//
//      The only reading on the hub that asks *when* a bid was priced, and the
//      only one the eight-row cut could quietly break: it splits a trade's bids
//      into an older and a newer half, and the rows the page draws are the
//      newest. Computed off `drawn` rather than `rows` it would compare the
//      recent half against itself and report "nothing has changed" on every
//      book forever — a failure no unit test can see, because a unit test hands
//      the function the whole book by definition. The fixture below is built to
//      catch exactly that: twelve fence bids, so the cut is real.
//
//      It also carries the label proof the two steps above carry, and one more
//      of its own — `trendSentence` calls `bidWaitingDays` for its date clause,
//      which ships in a different injected bundle. If that ordering ever breaks
//      the sentence throws mid-render and takes the whole saved-bid section
//      down with it, which is worse than drawing nothing.
await step('the hub says whether a trade has been landing differently lately', async () => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const held = await page.evaluate(() => {
    const raw = localStorage.getItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-saved-bids');
    return raw;
  });
  try {
    await page.evaluate((now) => {
      const at = (d) => new Date(now - d * 86400000).toISOString();
      // Six fence bids won last winter, six lost since — a book whose pooled
      // win rate is exactly 50% and whose recent half is 0 of 6. This is the
      // shop the snapshot readings cannot see: they average the before and the
      // after into a number describing neither half of its year.
      const run = (outcome, n, from) => Array.from({ length: n }, (_, i) => ({
        name: outcome + ' ' + i, at: at(from - i * 10), fields: { a: '1' },
        outcome, decidedAt: at(from - i * 10 - 2),
      }));
      localStorage.setItem('portfolio-saved-bids', JSON.stringify({ v: 1, bids: {
        'fence-bid-calculator': [...run('lost', 6, 70), ...run('won', 6, 240)],
        // A second trade, steady throughout and below the eight-bid floor: it
        // must be in neither the sentence nor the split.
        'deck-bid-calculator': [...run('won', 2, 50), ...run('lost', 2, 30)],
      } }));
    }, Date.now());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const line = (await page.textContent('#bidsTrend')).replace(/\s+/g, ' ').trim();
    check('the hub draws the trend reading at all', await page.isVisible('#bidsTrend'), line);
    // The half a unit test cannot reach: 6 and 6, not 4 and 4. Eight rows are
    // drawn and twelve are counted, so this is the assertion that fails if the
    // reading is ever computed off the visible list.
    check('it reads every bid on the device, not the eight rows drawn',
      /0 of 6 on the 6 most recent, against 6 of 6 before them\./.test(line), line);
    check('and names the trade as the hub names it, not as storage keys it',
      /^Fence Bid Calculator has been landing less often than it was: /.test(line), line);
    check('the trade below the eight-bid floor is left out entirely',
      !/Deck/i.test(line), line);
    check('no slug leaked into the sentence in place of a name',
      !/-bid-calculator/.test(line), line);
    // The date clause, which is the part that needs a helper from the other
    // injected bundle. Its absence here would mean bidWaitingDays returned null
    // rather than that the ordering broke — a throw would have emptied the line.
    check('the turn is dated in days back off the recent half',
      /The recent half starts \d+ days back\./.test(line), line);
    check('and it says plainly that this is not a cause',
      /moves this as much as a price does/.test(line), line);
    // The pooled rate on the identical book, for contrast: 6 of 12, 50%, and
    // blind to the entire finding above.
    const rate = (await page.textContent('#bidsWinRate')).replace(/\s+/g, ' ').trim();
    check('the snapshot rate on the same book cannot see any of this',
      /You have won 8 of 16 decided bids — 50%/.test(rate), rate);

    const counts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
    check('the trend reading is counted',
      counts.saved_bid_trend_shown >= 1, JSON.stringify(counts));
    check('and the counter names no trade and no direction',
      !/fence|deck|less|more/i.test(JSON.stringify(counts)), JSON.stringify(counts));
  } finally {
    await page.evaluate((raw) => {
      if (raw === null) localStorage.removeItem('portfolio-saved-bids');
      else localStorage.setItem('portfolio-saved-bids', raw);
    }, held);
  }
});

// 6bb. Backup and restore (`backup.mjs`) — the bids surviving the browser.
//
//      Everything above stands on one `localStorage` key in one browser, and
//      the hub says so. What only a browser pass can show is the journey out of
//      that: a real download, a real file picker, and the same bid arriving on a
//      browser whose store has been emptied. The merge arithmetic is unit
//      tested; this is the plumbing between it and a person, which is where a
//      feature like this actually fails.
await step('saved bids survive the browser that holds them', async () => {
  // The band on a tool page is where the intent is — someone has just saved a
  // bid they care about — and the file is written on the hub. Without this link
  // they are the one person never told the backup exists.
  await page.goto(`${BASE}/water-heater-bid-calculator/`, { waitUntil: 'networkidle' });
  await jobsReady();
  await page.click('#pf-jobs-toggle');
  const bandLink = page.locator('.pf-jobs-note a[href$="#backup-box"]');
  check('the band on a tool page points at the backup panel',
    (await bandLink.count()) === 1, `${await bandLink.count()} links`);
  await bandLink.click();
  await page.waitForLoadState('networkidle');
  check('and following it lands on the hub with that panel on screen',
    await page.isVisible('#backup-box')
      && new URL(page.url()).hash === '#backup-box', page.url());

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check('the backup panel is on the hub', await page.isVisible('#backup-box'));
  check('and offers a download once there is something to back up',
    await page.isVisible('#backup-download'), await page.textContent('#backup-copy'));

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.click('#backup-download'),
  ]).then(([d]) => d);
  check('the file is named for the day it was taken',
    /^saved-bids-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()),
    download.suggestedFilename());

  const backupPath = `${process.env.TMPDIR || '/tmp'}/journey-${download.suggestedFilename()}`;
  await download.saveAs(backupPath);
  const { readFile, writeFile } = await import('node:fs/promises');
  const written = JSON.parse(await readFile(backupPath, 'utf8'));
  check('the file holds the bid that was saved',
    JSON.stringify(written.bids).includes('14 Oak St'), Object.keys(written.bids).join(','));
  check('and the shop rates saved earlier in this run', Boolean(written.rates),
    JSON.stringify(written.rates));

  // The case the feature exists for: a browser that has none of this. Emptying
  // the key is what a "clear browsing data", a new phone, or a seven-day
  // storage eviction leaves behind.
  await page.evaluate(() => {
    localStorage.removeItem('portfolio-saved-bids');
    localStorage.removeItem('portfolio-shop-rates');
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check('with nothing saved, the bid list is gone', !(await page.isVisible('#bids')));
  check('but the restore offer is not — this is the browser that needs it',
    await page.isVisible('#backup-file'));
  check('and it says so rather than offering a download of nothing',
    !(await page.isVisible('#backup-download'))
      && (await page.textContent('#backup-title')).includes('another browser'),
    await page.textContent('#backup-title'));

  // A file that is not ours must be refused, and must change nothing.
  const junkPath = `${process.env.TMPDIR || '/tmp'}/journey-not-a-backup.json`;
  await writeFile(junkPath, JSON.stringify({ hello: 'world', bids: { a: [] } }));
  await page.setInputFiles('#backup-file', junkPath);
  await page.waitForFunction(
    () => document.getElementById('backup-status').textContent.trim() !== ''
      && !document.getElementById('backup-status').textContent.includes('Reading'),
    null, { timeout: 5000 });
  check('a file from somewhere else is refused',
    (await page.textContent('#backup-status')).includes('not a backup from this site'),
    await page.textContent('#backup-status'));
  check('and nothing was written', await page.evaluate(
    () => localStorage.getItem('portfolio-saved-bids') === null));

  // The real restore.
  await page.setInputFiles('#backup-file', backupPath);
  await page.waitForFunction(
    () => document.getElementById('backup-status').textContent.includes('Restored'),
    null, { timeout: 5000 });
  const restored = await page.textContent('#backup-status');
  check('the backup restores, and says what it did', restored.includes('1 bid added'), restored);
  check('the shop rates came back too, because there were none to overwrite',
    restored.includes('shop rates were restored'), restored);
  check('the bid list redraws immediately rather than on the next visit',
    await page.isVisible('#bids')
      && (await page.textContent('#bidsList')).includes('14 Oak St'),
    await page.textContent('#bidsList'));

  // Restoring the same file again is the accident a person actually makes.
  // Nothing should double, and the page should say why nothing happened.
  await page.setInputFiles('#backup-file', backupPath);
  await page.waitForFunction(
    () => document.getElementById('backup-status').textContent.includes('already here'),
    null, { timeout: 5000 });
  const twice = await page.textContent('#backup-status');
  check('restoring the same file twice adds nothing and says so',
    twice.includes('1 bid already here') && !twice.includes('added'), twice);
  check('and the shop rates in this browser are kept, never overwritten from a file',
    twice.includes('were kept'), twice);
  const rows = await page.locator('#bidsList li').count();
  check('the bid is listed once, not twice', rows === 1, `${rows} rows`);

  // Follow the restored bid back to the tool and reprice it: a restore that put
  // the row on the hub but not the numbers in the form would pass every check
  // above.
  await page.click('#bidsList li a');
  await page.waitForLoadState('networkidle');
  await page.click('[data-pf-jobs="restore"]');
  check('the restored bid still reprices on the tool that saved it',
    (await page.textContent('#pf-jobs-status')).includes('Restored'),
    await page.textContent('#pf-jobs-status'));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const backupCounts = await page.evaluate(
    () => JSON.parse(localStorage.getItem('portfolio-hub-usage') || '{}'));
  check('downloads, restores and refusals are counted separately',
    backupCounts.bids_backup_downloaded >= 1 && backupCounts.bids_backup_restored >= 2
      && backupCounts.bids_backup_rejected >= 1, JSON.stringify(backupCounts));
  check('and the counter still holds no customer name',
    !/Oak|Reid/.test(JSON.stringify(backupCounts)));
});

// 6c. An itemised calculator, whose rows do not exist until its module runs.
await step('an itemised bid keeps its rows', async () => {
  await page.goto(`${BASE}/roofing-bid-calculator/`, { waitUntil: 'networkidle' });
  await jobsReady();
  await page.click('#pf-jobs-toggle');
  const priced = await figures();
  await page.fill('#pf-jobs-name', 'Section test');
  await page.click('[data-pf-jobs="save"]');
  check('an itemised bid saves its runtime rows',
    (await page.textContent('#pf-jobs-status')).includes('Saved'),
    await page.textContent('#pf-jobs-status'));
  await page.click('[data-pf-jobs="restore"]');
  check('and restores to the same price',
    (await figures()) === priced, await page.textContent('#pf-jobs-status'));

  // The band lists other customers' names, and the proposal sheet exists so a
  // homeowner receives their own price and nothing else.
  await page.emulateMedia({ media: 'print' });
  check('the band is not on the printed proposal', !(await page.isVisible('.pf-jobs')));
  await page.emulateMedia({ media: 'screen' });
});

// 7. Sitemap URLs are absolute and free of repo paths — the regression that
//    shipped 69 unusable entries before the sitemaps were generated.
const sitemapXml = await (await page.request.get(`${BASE}/sitemap.xml`)).text();
const children = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check('sitemap index lists a child per venture', children.length >= 30, `${children.length} children`);

// Sitemap <loc>s are absolute production URLs even when serving locally, so
// rewrite the origin before fetching — otherwise the sample silently fetches
// nothing and the check passes over zero URLs.
//
// Which origin that is depends on where the artifact is going, and there are
// now two: GitHub Pages serves it under `/monorepo-projects/`, and
// `gitops/prod/portfolio-site.yaml` serves it at the root of
// `tools.marisstella.dev` from the Hetzner box. This constant was hardcoded to
// the Pages one, so against a Hetzner-stamped build — the artifact that
// deployment actually publishes — every rewrite missed, every fetch went
// off-origin to a name that does not resolve, `checked` stayed 0, and the
// resolve check below passed over nothing. Exactly the failure the comment
// above warns about, reintroduced by a second deploy target.
//
// So read the prefix off the artifact rather than naming it: the index always
// lists the hub sitemap at the site root, which pins the origin *and* the base
// path in one entry.
const HUB_SITEMAP = '/sitemap-hub.xml';
const stampedRoot = children.find((loc) => loc.endsWith(HUB_SITEMAP));
check('the sitemap index names the hub sitemap, which pins the stamped origin',
  Boolean(stampedRoot), stampedRoot || 'no child ends in sitemap-hub.xml');
const PRODUCTION = stampedRoot ? stampedRoot.slice(0, -HUB_SITEMAP.length) : null;
const local = (url) =>
  (PRODUCTION && url.startsWith(PRODUCTION) ? BASE + url.slice(PRODUCTION.length) : url);

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
// `checked > 0` here as well as above: with nothing fetched this line reads
// "all 0 sitemap URLs resolve — PASS", which is how a run that verified none of
// them still looks half-green.
check(`all ${checked} sitemap URLs resolve`,
  dead.length === 0 && checked > 0, dead.slice(0, 5).join(' | '));

// 8. 404.
//    This step deliberately provokes errors -- the 404 itself, and on a plain
//    static server a bare error page with no icon link, which sends the browser
//    after `/favicon.ico` at the origin root and 404s again. Both belong to this
//    navigation, so everything it raises is excised by position rather than by
//    filtering 404s everywhere, which is what let a real one hide for weeks.
notFoundUrl = `${BASE}/no-such-page-here`;
const beforeNotFound = errors.length;
const notFound = await page.goto(notFoundUrl, { waitUntil: 'domcontentloaded' });
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
// The positional splice above catches everything the 404 step raised *before*
// the 300ms cut. What it cannot catch is a subresource of that page still in
// flight when step 9 navigates away: the cancellation fires `requestfailed`
// after the cut, so it lands attributed to step 9 and reads as a fresh defect
// on the hub.
//
// Measured 2026-09-09: a full catalogue run failed on
// `requestfailed: http://127.0.0.1:48141/icon-192.png` — the bare 404 error
// page's own icon link, cancelled by the navigation to `/`. The asset was
// present and served 200 from the very tree the run had built, so the check
// was reporting a missing file that was not missing, on the one check that
// walks the whole customer journey. Widening the 300ms wait would only make
// the race rarer; this removes it, by asking which document the request
// started on rather than when its failure happened to arrive.
const lateFromNotFound = errors.filter((e) => fromNotFoundPage.has(e));
const realErrors = errors.filter((e) => !fromNotFoundPage.has(e));
if (deliberate.length || lateFromNotFound.length) {
  console.log(`\n(${deliberate.length + lateFromNotFound.length} error(s) from the deliberate 404 step, ignored)`);
}
check('no off-origin request was made', offOrigin.length === 0, offOrigin.slice(0, 3).join(' | '));
check('no unexpected page, console, or resource error', realErrors.length === 0,
  realErrors.slice(0, 3).join(' | '));
console.log(`\n${failures} failed check(s), ${realErrors.length} page/console error(s)`);
for (const e of realErrors.slice(0, 10)) console.log(`  ${e}`);
if (failures || realErrors.length) process.exitCode = 1;
