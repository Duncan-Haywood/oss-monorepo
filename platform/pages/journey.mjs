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


// 1b. The contents index. On a phone the hub is tens of screens tall, so a
// visitor who is not searching needs a route to a section that is not scrolling
// past every section above it. A broken anchor here fails silently — the click
// simply does nothing — so it is clicked, not just counted.
const contentsLinks = await page.locator('.contents a').count();
check('the contents index lists sections', contentsLinks >= 6, `${contentsLinks} links`);

const target = await page.locator('.contents a').last().getAttribute('href');
const beforeJump = await page.evaluate(() => window.scrollY);
await page.locator('.contents a').last().click();
await page.waitForTimeout(400);
const jumped = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? Math.abs(el.getBoundingClientRect().top) : Infinity;
}, target);
check('the last contents link jumps to its section',
  jumped < 120 && (await page.evaluate(() => window.scrollY)) > beforeJump,
  `${target} landed ${Math.round(jumped)}px from the viewport top`);

await page.evaluate(() => window.scrollTo(0, 0));

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
// Its counts are of the whole catalogue, so leaving it up over a filtered page
// would state a number the page below contradicts.
check('the contents index steps aside during a search', await page.locator('.contents').isHidden());

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
check('clearing search brings the contents index back', await page.locator('.contents').isVisible());

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
