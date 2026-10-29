import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MIN_CARRIED_FIELDS,
  RATE_SOURCE_SLUGS,
  PARTIAL_SHOP_RATE_PAGES,
  SHOP_RATE_ALIASES,
  SHOP_RATE_FIELDS,
  SHOP_RATES_KEY,
  SHOP_RATES_MODULE_FILE,
  SHOP_RATES_STYLE_FILE,
  injectShopRates,
  renderShopRatesModule,
  renderShopRatesStyle,
  normalizeRates,
  pageCarriesShopRates,
  pageShopRateFields,
  pageTakesShopRates,
  parseStoredRates,
  serializeRates,
} from './rates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.join(HERE, '..', '..', 'ventures');

const page = (body, head = '') =>
  `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;

const form = SHOP_RATE_FIELDS.map((f) => `<input id="${f.id}" type="number" value="1">`).join('');

// The browser half is one file at the site root now, so the rules it enforces
// are asserted against that file rather than against a page it was written
// into. What the page still has to carry — the tag, its field pairs, and the
// stylesheet link — is asserted separately below.
const script = renderShopRatesModule();

// ---------------------------------------------------------------------------
// The field spec against the actual products
// ---------------------------------------------------------------------------

/**
 * Bid calculators that must NOT share the site-wide shop rates, and why.
 *
 * Sharing is only safe where a field means the same quantity everywhere. The
 * saved `hourlyWage` is what *one* person is paid: "Cleaner hourly wage" $17,
 * "Operator hourly wage" $22. A calculator whose comparable field means
 * something else cannot read that value, and giving it the id anyway to
 * satisfy this test would prefill a wrong number into a real bid -- a worse
 * outcome than no bar at all.
 *
 * `pageCarriesShopRates` already gates injection at build time, so an excluded
 * venture simply gets no bar. This list exists so the exclusion is a stated
 * decision rather than a silent absence, and so adding to it needs a reason
 * that the assertion below actually checks.
 */
const NO_SHARED_SHOP_RATES = {
  'water-well-drilling-bid-calculator':
    'it has no payroll-burden field, its labour is a rig, compressor and crew rate per rig hour beside a ' +
    'separate install crew rate, and its margin is a share of the price after a dry-hole allowance, so ' +
    'sharing the four canonical rates would prefill figures that mean different things.',
  'sauna-cold-plunge-install-bid-calculator':
    'it has no payroll-burden field, its overhead is a monthly dollar total spread over billable hours ' +
    'rather than a percentage of direct cost, and its labour rate sits beside a separate helper rate, so ' +
    'sharing the four canonical rates would prefill figures that mean different things.',
  'tree-service-bid-calculator':
    'its wage field is a whole-crew rate (~$180/h), not a per-person wage. ' +
    'Sharing would prefill one person\'s $17-22 as the crew rate and bid the job ~10x low. ' +
    'Its burden, overhead and margin do match, and it now carries those three: see ' +
    'PARTIAL_SHOP_RATE_PAGES.',
  'mobile-detailing-bid-calculator':
    'its "overhead" is dollars allocated to the job, not a percentage of direct cost, so the ' +
    'overhead rate cannot be shared onto it. Its wage and burden do match -- spelled `wage` and ' +
    '`burdenPercent` -- so SHOP_RATE_ALIASES maps those and it now carries three of the four: ' +
    'see PARTIAL_SHOP_RATE_PAGES. The earlier reason recorded here ("no wage input at all") ' +
    'described the page as it was before it costed the whole stop in #1172.',
  'snow-removal-bid-calculator':
    'its per-person wage is `operatorWage` rather than `hourlyWage`. The concept matches ' +
    '("Operator hourly wage", $22), so rather than rename an id that reaches calc.mjs\'s ' +
    'input contract, its tests and every bid link already shared, SHOP_RATE_ALIASES maps ' +
    'the canonical field onto that id and the page carries the full set.',
  'pet-grooming-bid-calculator':
    'its "overhead" is dollars allocated to the job, not a percentage of direct cost, so the ' +
    'overhead rate cannot be shared onto it. Its wage and burden do match -- spelled `wage` and ' +
    '`burdenPercent` -- and its target margin already matches the canonical id directly, so it ' +
    'now carries three of the four: see PARTIAL_SHOP_RATE_PAGES.',
  'vehicle-wrap-bid-calculator':
    'its installer rate is a loaded rate -- wage and burden together, spelled `installerHourlyRate` ' +
    '-- with no separate burden field, so hourlyWage and burdenRate cannot be shared onto it. Its ' +
    'overhead and target margin already carry the canonical ids directly, so it carries two of the ' +
    'four: see PARTIAL_SHOP_RATE_PAGES.',
  'locksmith-bid-calculator':
    'it prices time as one billed hourly rate rather than a separate crew wage and payroll ' +
    'burden -- there is no `hourlyWage` or `burdenRate` concept on this page to alias. Its ' +
    'overhead and target margin do match the canonical meaning exactly and are spelled ' +
    '`overheadRate` and `targetMargin` directly, so it carries two of the four: see ' +
    'PARTIAL_SHOP_RATE_PAGES.',
  'ice-dam-removal-bid-calculator':
    'its per-tech wage is spelled `crewHourlyRate` rather than `hourlyWage`, but means the same ' +
    'raw, un-burdened wage -- SHOP_RATE_ALIASES maps it. Its overhead and target margin already ' +
    'match the canonical ids directly. It has no separate payroll-burden field at all, so it ' +
    'carries three of the four: see PARTIAL_SHOP_RATE_PAGES.',
  'home-staging-bid-calculator':
    'its per-tech wage is spelled `crewHourlyRate` rather than `hourlyWage`, but means the same ' +
    'raw, un-burdened wage -- SHOP_RATE_ALIASES maps it. Its overhead and target margin already ' +
    'match the canonical ids directly. It has no separate payroll-burden field at all, so it ' +
    'carries three of the four: see PARTIAL_SHOP_RATE_PAGES.',
  'forestry-mulching-bid-calculator':
    'it costs a machine hour, not a crew hour, and carries none of the four canonical ids. Its ' +
    'operator line (`operatorWagePerHour`) is explicitly a burdened rate -- wage and payroll ' +
    'burden together -- so aliasing `hourlyWage` onto it would prefill a raw wage into a field ' +
    'that already includes burden and understate every hour of the job, the same defect the ' +
    'vehicle-wrap entry above records. There is no payroll-burden field to alias, and no ' +
    'overhead-on-direct-cost percentage either: this tool carries overhead as the machine\'s own ' +
    'payment and insurance spread over billable hours a month, in dollars per hour, which is a ' +
    'different quantity from a percentage of direct cost. Only target margin means the same ' +
    'thing, spelled `targetMarginPct` and capped at 95 rather than 99.9, and one carried field ' +
    'is below MIN_CARRIED_FIELDS, so no bar is shown and no PARTIAL_SHOP_RATE_PAGES note is due.',
  'land-survey-bid-calculator':
    'its per-person wage is spelled `crewHourlyRatePerPerson` rather than `hourlyWage`, but means the ' +
    'same raw, un-burdened wage -- SHOP_RATE_ALIASES maps it. Its "target margin on price" is spelled ' +
    '`targetMarginPercentPct` and means the same net-margin-on-price concept as `targetMargin` -- ' +
    'aliased too. It has no separate payroll-burden field, and it prices office research and drafting ' +
    'time as their own hourly rates rather than an overhead percentage of direct cost, so it carries ' +
    'two of the four: see PARTIAL_SHOP_RATE_PAGES.',
  'asbestos-abatement-bid-calculator':
    'its per-worker wage is spelled `crewHourlyRatePerWorker` rather than `hourlyWage`, but means the ' +
    'same raw, un-burdened wage -- SHOP_RATE_ALIASES maps it. Its "target margin on price" is spelled ' +
    '`targetMarginPercentPct` and means the same net-margin-on-price concept as `targetMargin` -- ' +
    'aliased too. It has no separate payroll-burden field, and it prices containment setup, air ' +
    'monitoring, and waste disposal as their own line items rather than an overhead percentage of ' +
    'direct cost, so it carries two of the four: see PARTIAL_SHOP_RATE_PAGES.',
  'biohazard-cleanup-bid-calculator':
    'its per-tech rate is spelled `laborRatePerHour` rather than `hourlyWage`, but means the same ' +
    'raw, loaded hourly rate for one technician\'s time -- SHOP_RATE_ALIASES maps it. Its "target ' +
    'margin" is spelled `targetMarginPercent` and means the same net-margin-on-price concept as ' +
    '`targetMargin` -- aliased too. It has no separate payroll-burden field and no overhead-on-' +
    'direct-cost percentage (equipment, supplies and disposal are priced as their own line items, ' +
    'not a percentage markup), so it carries two of the four: see PARTIAL_SHOP_RATE_PAGES.',
  'storage-auction-max-bid-calculator':
    'this is not a contractor job bid -- it is a max hammer bid for a stranger\'s storage-unit ' +
    'contents at a lien auction. Its `laborRatePerHour` prices cleanout hours on one unit, not a ' +
    'crew wage the business pays across every job, and there is no payroll-burden or ' +
    'overhead-on-direct-cost field at all: cleanout cost is a flat dump fee plus a labor line, and ' +
    '`targetMarginPercent` is margin on realized resale revenue after channel fees, a different base ' +
    'from the spec\'s margin on a priced job. Zero of the four canonical concepts apply, so no bar is ' +
    'shown and no PARTIAL_SHOP_RATE_PAGES note is due. (Same field names as ' +
    'biohazard-cleanup-bid-calculator above, coincidentally -- the two calculators were built the ' +
    'same afternoon and independently landed on `laborRatePerHour`/`targetMarginPercent`, but the ' +
    'underlying quantities differ: that page carries two of the four via aliasing, this one carries ' +
    'zero because there is no crew wage or overhead-on-direct-cost concept here at all.)',
  'liquidation-pallet-bid-calculator':
    'this is not a contractor job bid -- it is a max hammer bid for a liquidation pallet or ' +
    'truckload that the buyer resells. There is no crew wage, payroll burden or overhead-on-direct-' +
    'cost concept: costs are buyer\'s premium, freight, per-unit handling, storage and cost of ' +
    'capital, and the target is a profit, ROI and chance-of-loss limit on realized resale revenue ' +
    'after channel fees. Zero of the four canonical concepts apply, so no bar is shown and no ' +
    'PARTIAL_SHOP_RATE_PAGES note is due.',
  'window-tinting-bid-calculator':
    'its per-installer rate is spelled `installerRate` rather than `hourlyWage`, but means the same ' +
    'raw, loaded hourly rate for one installer\'s time -- SHOP_RATE_ALIASES maps it. Its "target ' +
    'margin on price" is spelled `targetMarginPercent` and means the same net-margin-on-price concept ' +
    'as `targetMargin` -- aliased too. It has no separate payroll-burden field, and its overhead ' +
    '("Booth / shop overhead") is a flat dollar figure per job rather than a percentage of direct ' +
    'cost, so it carries two of the four: see PARTIAL_SHOP_RATE_PAGES.',
  'hydroseeding-job-bid-calculator':
    'it has no overhead-percentage or shop-rate field: labour is a per-person hourly rate applied to setup, spraying and tank-refill hours, and the hydroseeder and overhead are season fixed costs spread over jobs, so sharing the four canonical rates would prefill figures that mean different things.',
  'lawn-aeration-overseeding-bid-calculator':
    'it has no overhead-percentage or shop-rate field: labour is a per-person hourly rate applied to aerator, seeding, drive and load hours, and overhead is a season fixed cost spread over jobs, so sharing the four canonical rates would prefill figures that mean different things.',
  'hoarding-cleanout-bid-calculator':
    'it has no payroll-burden or overhead field: labour is a per-person hourly rate applied to whole paid crew days, ' +
    'and its risk allowance is a share of cost for pests and sharps rather than overhead, so sharing the four ' +
    'canonical rates would prefill figures that mean different things.',
};

test('every trade bid calculator on main carries all four shop-rate fields', async () => {
  const slugs = (await fs.readdir(VENTURES, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-bid-calculator'))
    .map((entry) => entry.name);

  assert.ok(slugs.length >= 30, `expected the bid-calculator family, saw ${slugs.length}`);

  const missing = [];
  for (const slug of slugs) {
    if (slug in NO_SHARED_SHOP_RATES) continue;
    const file = path.join(VENTURES, slug, 'index.html');
    const html = await fs.readFile(file, 'utf8').catch(() => null);
    if (html === null) continue;
    // The point of this test: if a venture renames one of these ids, the bar
    // silently stops appearing on that tool rather than failing anywhere. The
    // build only injects where all four exist, so the failure is invisible.
    if (!pageCarriesShopRates(html)) missing.push(slug);
  }

  assert.deepEqual(missing, []);
});

test('an excluded calculator is one that really cannot take the shared rates', async () => {
  // Keeps the list above from becoming a place to park a venture that simply
  // has not been wired up: an entry only stays legitimate while the page
  // genuinely lacks the shared fields. Once a venture adopts them, its
  // exclusion has to go, and this fails until it does.
  for (const [slug, reason] of Object.entries(NO_SHARED_SHOP_RATES)) {
    const html = await fs.readFile(path.join(VENTURES, slug, 'index.html'), 'utf8').catch(() => null);
    assert.ok(html !== null, `${slug} is excluded but no longer exists -- drop the entry`);
    assert.ok(
      !pageCarriesShopRates(html),
      `${slug} now carries all four shop-rate fields, so it should not be excluded any more`,
    );
    assert.ok(reason.length > 40, `${slug} needs a real reason for being excluded`);
  }
});

test('a percentage field never carries a value its own form would reject', () => {
  // `targetMargin` is capped below 100 in the forms because the arithmetic
  // divides by (1 - margin). A stored 100 has to be dropped, not prefilled.
  assert.equal(normalizeRates({ targetMargin: 100 }), null);
  assert.deepEqual(normalizeRates({ targetMargin: 99.9 }), { targetMargin: 99.9 });
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

test('normalizeRates keeps only known fields with usable numbers', () => {
  assert.deepEqual(
    normalizeRates({
      hourlyWage: '38.5',
      burdenRate: 31,
      overheadRate: -2,
      targetMargin: 'not a number',
      linearFeet: 80,
    }),
    { hourlyWage: 38.5, burdenRate: 31 },
  );
});

test('normalizeRates reports "nothing saved" as one state', () => {
  assert.equal(normalizeRates(null), null);
  assert.equal(normalizeRates({}), null);
  assert.equal(normalizeRates({ linearFeet: 80 }), null);
  assert.equal(normalizeRates('42'), null);
});

test('a blank field is dropped rather than stored as an explicit zero', () => {
  // Number('') is 0, so the naive read would save a $0 wage and then prefill it
  // onto the next tool, where it prices labour at nothing and looks deliberate.
  assert.equal(normalizeRates({ hourlyWage: '' }), null);
  assert.deepEqual(normalizeRates({ hourlyWage: 0 }), { hourlyWage: 0 });
});

test('a round trip through storage preserves the rates', () => {
  const rates = { hourlyWage: 38.5, burdenRate: 31, overheadRate: 14, targetMargin: 22 };
  assert.deepEqual(parseStoredRates(serializeRates(rates)), rates);
});

test('serializeRates writes the versioned shape, so a later shape can be told apart', () => {
  assert.equal(
    serializeRates({ hourlyWage: 40 }),
    '{"v":1,"rates":{"hourlyWage":40}}',
  );
});

test('serializeRates refuses to write an empty payload', () => {
  assert.equal(serializeRates({ linearFeet: 80 }), null);
});

test('parseStoredRates survives anything already on the visitor disk', () => {
  for (const raw of ['', 'null', '{', '[]', '"42"', '{"v":1}', '{"v":1,"rates":null}', null, 7]) {
    assert.equal(parseStoredRates(raw), null, `expected null for ${JSON.stringify(raw)}`);
  }
});

test('parseStoredRates reads a bare rates object as well as the versioned one', () => {
  // Cheap forward/backward tolerance: a payload written by a different shape
  // still yields rates rather than dropping the visitor back to defaults.
  assert.deepEqual(parseStoredRates('{"hourlyWage":40}'), { hourlyWage: 40 });
  assert.deepEqual(parseStoredRates('{"v":1,"rates":{"hourlyWage":40}}'), { hourlyWage: 40 });
});

test('parseStoredRates drops a value outside the range the forms accept', () => {
  assert.equal(parseStoredRates('{"v":1,"rates":{"targetMargin":150}}'), null);
});

// ---------------------------------------------------------------------------
// Which pages get the bar
// ---------------------------------------------------------------------------

test('pageCarriesShopRates requires the whole set, not a subset', () => {
  assert.equal(pageCarriesShopRates(page(form)), true);
  assert.equal(
    pageCarriesShopRates(page('<input id="hourlyWage"><input id="burdenRate">')),
    false,
  );
  assert.equal(pageCarriesShopRates(page('<p>how much to charge to install crown molding</p>')), false);
});

test('a marketplace fee calculator is left alone', () => {
  const seller = page('<input id="salePrice"><input id="costOfGoods"><input id="shipping">');
  assert.equal(injectShopRates(seller), seller);
});

// ---------------------------------------------------------------------------
// Aliased and partial pages
//
// The four tools these cover were outside the shared bar for two different
// reasons, neither of which was "this page cannot take shop rates": one spells a
// field differently, three ask for only some of them. A contractor retyped the
// same overhead on each.
// ---------------------------------------------------------------------------

test('an alias carries a field a page spells differently', async () => {
  const html = await fs.readFile(
    path.join(VENTURES, 'snow-removal-bid-calculator', 'index.html'),
    'utf8',
  );
  // Without the slug it reads as a three-field page: the alias is what makes
  // `operatorWage` the wage field, and it is per page rather than global.
  assert.equal(pageShopRateFields(html).length, SHOP_RATE_FIELDS.length - 1);

  const fields = pageShopRateFields(html, 'snow-removal-bid-calculator');
  assert.equal(fields.length, SHOP_RATE_FIELDS.length);
  assert.equal(fields.find((f) => f.id === 'hourlyWage').inputId, 'operatorWage');

  const out = injectShopRates(html, 'snow-removal-bid-calculator');
  assert.notEqual(out, html, 'the bar has to reach the page it was aliased for');
  // The alias is one of the two facts the shared script cannot know until it is
  // on a page, so it rides on the tag.
  assert.match(out, /data-pf-rates-fields="[^"]*hourlyWage:operatorWage/);
});

test('an aliased id is only ever the one the venture actually uses', async () => {
  // The alias writes into a real input on a real page. A stale entry — a
  // venture that renamed the field again — would leave the bar offering a
  // control that silently does nothing, so it fails here instead.
  for (const [slug, aliases] of Object.entries(SHOP_RATE_ALIASES)) {
    const html = await fs.readFile(path.join(VENTURES, slug, 'index.html'), 'utf8').catch(() => null);
    assert.ok(html !== null, `${slug} is aliased but no longer exists -- drop the entry`);
    for (const [canonical, inputId] of Object.entries(aliases)) {
      assert.ok(
        SHOP_RATE_FIELDS.some((f) => f.id === canonical),
        `${slug} aliases ${canonical}, which is not a shop-rate field`,
      );
      assert.match(
        html,
        new RegExp(`<input[^>]*\\bid="${inputId}"`, 'i'),
        `${slug} no longer has an input called ${inputId}`,
      );
    }
  }
});

test('a partial page carries the fields it shares and says why the rest are absent', async () => {
  for (const [slug, note] of Object.entries(PARTIAL_SHOP_RATE_PAGES)) {
    const html = await fs.readFile(path.join(VENTURES, slug, 'index.html'), 'utf8').catch(() => null);
    assert.ok(html !== null, `${slug} is listed as partial but no longer exists -- drop the entry`);

    const fields = pageShopRateFields(html, slug);
    assert.ok(
      fields.length >= MIN_CARRIED_FIELDS && fields.length < SHOP_RATE_FIELDS.length,
      `${slug} carries ${fields.length} fields, which is not a partial page any more`,
    );
    assert.ok(note.length > 40, `${slug} needs a real reason a visitor can read`);

    const out = injectShopRates(html, slug);
    assert.notEqual(out, html, `${slug} should get the bar`);
    assert.ok(out.includes(note), `${slug} should show its note in the panel`);
    // The whole point of the exclusion it replaces: the field whose meaning
    // differs is never written, so it cannot be prefilled with a wrong number.
    for (const field of SHOP_RATE_FIELDS) {
      if (fields.some((f) => f.id === field.id)) continue;
      assert.ok(
        !out.includes(`"id":"${field.id}"`),
        `${slug} must not carry ${field.id}, whose meaning differs there`,
      );
    }
  }
});

test('an undocumented partial page still gets nothing', () => {
  // The old all-or-nothing rule was right about the unread page: two of the
  // four is not evidence that those two mean what they mean elsewhere.
  const partial = page('<input id="overheadRate"><input id="targetMargin">');
  assert.equal(pageTakesShopRates(partial, 'some-new-calculator'), false);
  assert.equal(injectShopRates(partial, 'some-new-calculator'), partial);
});

test('one shared field is below the floor, however it is documented', () => {
  const single = page('<input id="targetMargin">');
  assert.equal(pageShopRateFields(single).length, 1);
  assert.ok(MIN_CARRIED_FIELDS > 1);
  assert.equal(pageTakesShopRates(single, 'mobile-detailing-bid-calculator'), false);
});

test('saving on a partial page merges rather than replacing what is stored', () => {
  // A contractor who saved a wage on a four-field tool, then saves overhead and
  // margin on a two-field one, must not lose the wage.
  const out = injectShopRates(
    page('<input id="overheadRate"><input id="targetMargin">'),
    'appliance-repair-quote-calculator',
  );
  assert.notEqual(out, page('<input id="overheadRate"><input id="targetMargin">'));
  assert.match(script, /var merged = readAll\(\);/);
  assert.match(script, /Object\.keys\(rates\)\.forEach/);
});

test('a saved set missing one field still opens the tools that have it', () => {
  // Was `kept === FIELDS.length ? out : null`, which discarded three good rates
  // because a fourth had never been saved.
  assert.match(script, /return kept > 0 \? out : null;/);
});

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

test('injectShopRates adds the bar, the style link and the script tag exactly once', () => {
  const once = injectShopRates(page(form));
  assert.match(once, /data-pf-rates-root/);
  assert.match(once, new RegExp(`<link rel="stylesheet" href="\\./${SHOP_RATES_STYLE_FILE}">`));
  assert.match(once, new RegExp(`<script type="module" src="\\./${SHOP_RATES_MODULE_FILE}"`));
  // The stylesheet and the script are files now, not bodies: a page that
  // carried either inline would be paying for it 105 times over.
  assert.doesNotMatch(once, /<style>\s*\n\.pf-rates\{/);
  assert.doesNotMatch(once, /<script type="module">/);
  assert.equal(injectShopRates(once), once, 'the pass must be safe to run twice');
});

test('the tag names exactly the fields the page carries, and nothing else', () => {
  const out = injectShopRates(page(form));
  const pairs = out.match(/data-pf-rates-fields="([^"]*)"/)[1].split(',');
  assert.deepEqual(pairs, SHOP_RATE_FIELDS.map((f) => `${f.id}:${f.id}`));

  // A partial page names only its own two, so the shared script cannot write
  // into a field this tool was never read to carry.
  const partial = injectShopRates(
    page('<input id="overheadRate"><input id="targetMargin">'),
    'appliance-repair-quote-calculator',
  );
  assert.deepEqual(
    partial.match(/data-pf-rates-fields="([^"]*)"/)[1].split(','),
    ['overheadRate:overheadRate', 'targetMargin:targetMargin'],
  );
});

test('a field the tag names but the build does not know is dropped, not trusted', () => {
  // The list used to be a build-time literal and now arrives through the DOM,
  // where any page on this origin could put something else in it. The script
  // reads a field's label, units and ceiling from its own table, keyed by id,
  // so a pair naming an unknown id has nothing to resolve to.
  assert.match(script, /var spec = CATALOG\[parts\[0\]\];/);
  assert.match(script, /if \(!spec \|\| !parts\[1\]\) return null;/);
  // And an empty list is the same verdict as a missing input: no bar at all,
  // rather than one that saves nothing.
  assert.match(script, /if \(!FIELDS\.length\) \{ root\.remove\(\); return; \}/);
});

test('the shared stylesheet is the bar it styles, and only that', () => {
  const css = renderShopRatesStyle();
  assert.match(css, /^\.pf-rates\{/);
  assert.match(css, /@media print\{\.pf-rates\{display:none !important\}\}/);
  // No element wrapper: it is served as a stylesheet, not written into a page.
  assert.doesNotMatch(css, /<style|<\/style>/);
});

test('the bar sits under the site navigation when there is one', () => {
  const nav = '<nav class="pf-chrome pf-chrome-top" aria-label="Site"><a href="../">← All 59 free tools</a></nav>';
  const out = injectShopRates(page(`${nav}${form}`));
  const navEnd = out.indexOf('</nav>');
  const bar = out.indexOf('data-pf-rates-root');
  assert.ok(navEnd > 0 && bar > navEnd, 'the bar must follow the nav, not precede it');
});

test('a page with no navigation still gets the bar, at the top of the body', () => {
  const out = injectShopRates(page(form));
  assert.ok(out.indexOf('data-pf-rates-root') < out.indexOf('id="hourlyWage"'));
});

test('the script is a module, so it runs after the venture restores a bid', () => {
  // Load-bearing: a classic inline script runs at parse time, which is before
  // the venture's deferred module has restored a saved or shared bid. It would
  // then decide what to overwrite by reading a form that is not filled in yet.
  const out = injectShopRates(page(form));
  const tag = out.slice(out.lastIndexOf('<script'));
  assert.match(tag, /^<script type="module" src="/);
});

test('nothing is injected into a fragment with no body', () => {
  const fragment = `<div>${form}</div>`;
  assert.equal(injectShopRates(fragment), fragment);
});

test('a page with no head still gets the stylesheet before the bar it styles', () => {
  const out = injectShopRates(`<body>${form}</body>`);
  const link = out.indexOf(`<link rel="stylesheet" href="./${SHOP_RATES_STYLE_FILE}">`);
  assert.ok(link >= 0, 'the link has to be written even with nowhere in the head to put it');
  assert.ok(link < out.indexOf('data-pf-rates-root'));
});

test('the shared script names the storage key and every field id', () => {
  assert.ok(script.includes(JSON.stringify(SHOP_RATES_KEY)));
  for (const field of SHOP_RATE_FIELDS) assert.ok(script.includes(`"${field.id}"`), field.id);
});

test('the bar carries the privacy statement it has to carry', () => {
  const out = injectShopRates(page(form));
  assert.match(out, /Kept in this browser only/);
  assert.match(out, /Nothing is uploaded/);
});

test('the shared script honours the site-wide usage opt-out', () => {
  assert.match(script, /doNotTrack/);
  assert.match(script, /globalPrivacyControl/);
  assert.match(script, /portfolio-hub-optout/);
});

test('a bid link keeps the sender numbers unless the visitor asks otherwise', () => {
  // The rule `share.mjs` exists to protect: a link that computes a different
  // price for the recipient than the sender saw is worse than no link.
  // Both spellings: a bid link uses the ids of the page that made it, which for
  // an aliased field is the page's own id rather than the canonical one.
  assert.match(script, /if \(!force && \(params\.has\(f\.inputId\) \|\| params\.has\(f\.id\)\)\)/);
  // #1796 moved bid links into the fragment. Reading only location.search
  // would make every shared bid look like an ordinary page and overwrite it.
  assert.match(script, /location\.hash \|\| location\.search/);
});

test('the injected script rejects a blank field before Number()', () => {
  // Number('') is 0. Without this guard, clearing a field and clicking Save
  // persists a $0 wage onto the next trade.
  assert.match(script, /raw === '' \|\| raw === null \|\| raw === undefined/);
  assert.match(script, /kept === FIELDS\.length \? out : null/);
});

test('the injected script only saves on the save button, and only counts a real apply', () => {
  // Inverting either guard would save on every other button, or count an
  // "applied" event on a page where nothing was applied.
  assert.match(script, /if \(name === 'save'\) \{/);
  assert.match(script, /if \(outcome && outcome\.applied\.length\) bump\('shop_rates_applied'\)/);
});

test('the injected script skips an unusable field instead of storing it', () => {
  assert.match(script, /if \(value === null\) return;\s+out\[f\.id\] = value; kept\+\+;/);
});

test('the injected script keeps zero, checks every field, reads both stored shapes and hides Clear when empty', () => {
  // Seeded faults that escaped (redteam 2026-10-19): a field loop starting at 1
  // skips the first field's presence check; `value < 1` rejects a saved 0%
  // overhead; `||` for `&&` reads a bare `{rates: null}` as a rates map; and
  // `hidden = false` shows a Clear button when nothing is saved.
  assert.match(script, /for \(var i = 0; i < FIELDS\.length; i\+\+\) \{\s+if \(!fieldFor\(FIELDS\[i\]\)\)/);
  assert.match(script, /if \(!isFinite\(value\) \|\| value < 0 \|\| value > max\) return null;/);
  assert.match(script, /var source = parsed\.rates && typeof parsed\.rates === 'object' \? parsed\.rates : parsed;/);
  assert.match(script, /button\('apply'\)\.hidden = true;\s+button\('clear'\)\.hidden = true;/);
});

test('the page that produces the rates does not also receive the bar', () => {
  // `shop-rate-calculator` carries hourlyWage and targetMargin as inputs and
  // computes the other two, so it clears MIN_CARRIED_FIELDS on the letter of the
  // rule. It must still be skipped: it writes all four itself, and a bar
  // offering "Save the rates on this bid" for two of them beside that control
  // would leave the one page that settles these numbers with two save buttons of
  // different scope.
  const producer = page('<input id="hourlyWage"><input id="targetMargin">');
  assert.ok(RATE_SOURCE_SLUGS.has('shop-rate-calculator'));
  assert.equal(pageTakesShopRates(producer, 'shop-rate-calculator'), false);
  assert.equal(injectShopRates(producer, 'shop-rate-calculator'), producer);
});

test('a rate source is skipped even when it carries all four ids', () => {
  // Defensive: the exclusion must not depend on how many fields the page
  // happens to have, or a later edit there would silently re-inject the bar.
  assert.equal(pageTakesShopRates(page(form), 'shop-rate-calculator'), false);
  assert.equal(injectShopRates(page(form), 'shop-rate-calculator'), page(form));
});

test('every rate source names a venture that exists', async () => {
  // A stale slug here silently stops excluding anything, which is exactly the
  // failure it was added to prevent.
  for (const slug of RATE_SOURCE_SLUGS) {
    const entry = path.join(VENTURES, slug, 'index.html');
    await assert.doesNotReject(fs.access(entry), `${slug} has no index.html`);
  }
});

// ---------------------------------------------------------------------------
// Behaviour: the shared script run against a tiny fake DOM
// ---------------------------------------------------------------------------
// The tests above only match the script's text, so a fault in a line they do
// not quote (rounding, the usage counter, the empty-storage guard) escaped the
// 2026-10-23 red-team campaign 8 of 8. These execute it.
const PAIRS = 'hourlyWage:wage,burdenRate:burden';

function mount({ stored, optOut, dnt, gpc, hash = '', inputs = { wage: '', burden: '' }, pairs = PAIRS } = {}) {
  const data = new Map();
  if (stored !== undefined) data.set(SHOP_RATES_KEY, stored);
  if (optOut) data.set('portfolio-hub-optout', '1');
  const store = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  const mk = () => ({ hidden: false, textContent: '', innerHTML: '', listeners: {}, dataset: {},
    addEventListener(t, fn) { this.listeners[t] = fn; }, setAttribute() {} });
  const nodes = { 'pf-rates-list': mk(), 'pf-rates-status': mk(), 'pf-rates-toggle': mk(), 'pf-rates-panel': mk() };
  const buttons = { save: mk(), apply: mk(), clear: mk() };
  const root = Object.assign(mk(), {
    removed: false, remove() { this.removed = true; },
    querySelector: (sel) => buttons[/"(\w+)"/.exec(sel)[1]],
  });
  for (const [id, value] of Object.entries(inputs)) {
    nodes[id] = Object.assign(mk(), { tagName: 'INPUT', value, dispatchEvent() {} });
  }
  const tag = { getAttribute: () => pairs };
  const document = {
    readyState: 'complete',
    querySelector: (sel) => (sel.startsWith('script[') ? tag : sel.includes('root') ? root : null),
    getElementById: (id) => nodes[id] || null,
    createElement: () => {
      const e = { children: [], textContent: '', appendChild(c) { this.children.push(c); },
        get outerHTML() { return `<li>${this.textContent}${this.children.map((c) => c.outerHTML).join('')}</li>`; } };
      return e;
    },
  };
  const window = { localStorage: store, addEventListener() {} };
  const navigator = { doNotTrack: dnt ? '1' : null, globalPrivacyControl: !!gpc };
  vm.runInNewContext(script, { document, window, navigator, URLSearchParams, Event: class {},
    location: { hash, search: '' }, Date });
  const click = (name) => root.listeners.click({ target: { closest: () => ({ getAttribute: () => name }) } });
  return { data, nodes, buttons, root, click, usage: () => JSON.parse(data.get('portfolio-hub-usage') || '{}') };
}

test('saved rates are applied, listed with their prefix and suffix, and rounded to cents', () => {
  const m = mount({ stored: JSON.stringify({ v: 1, rates: { hourlyWage: 31.456, burdenRate: 22 } }) });
  assert.equal(m.nodes.wage.value, 31.456);
  assert.match(m.nodes['pf-rates-list'].innerHTML, /\$31\.46\/h/);
  assert.match(m.nodes['pf-rates-list'].innerHTML, /22%/);
  assert.doesNotMatch(m.nodes['pf-rates-list'].innerHTML, /undefined/);
});

test('empty, null or junk storage shows the empty state instead of throwing', () => {
  for (const stored of [undefined, 'null', '"x"', '{bad', '{}']) {
    const m = mount({ stored });
    assert.equal(m.buttons.clear.hidden, true, String(stored));
    assert.equal(m.nodes.wage.value, '');
  }
});

test('a saved set with none of this page\'s fields counts as nothing saved', () => {
  const m = mount({ stored: JSON.stringify({ v: 1, rates: { overheadRate: 10 } }) });
  assert.equal(m.buttons.clear.hidden, true);
});

test('applying counts one event, dated with the full ISO day', () => {
  const m = mount({ stored: JSON.stringify({ hourlyWage: 20, burdenRate: 10 }) });
  const u = m.usage();
  assert.equal(u.shop_rates_applied, 1);
  assert.match(u.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test('usage counters accumulate across events', () => {
  const m = mount({ stored: JSON.stringify({ hourlyWage: 20, burdenRate: 10 }) });
  m.click('apply');
  m.click('apply');
  assert.equal(m.usage().shop_rates_applied, 3);
});

test('Do Not Track, Global Privacy Control and the site opt-out each stop all counting', () => {
  const stored = JSON.stringify({ hourlyWage: 20, burdenRate: 10 });
  for (const opts of [{ dnt: true }, { gpc: true }, { optOut: true }]) {
    const m = mount({ stored, ...opts });
    assert.equal(m.data.has('portfolio-hub-usage'), false, JSON.stringify(opts));
  }
});

test('saving stores the form values, but a blank field refuses the save', () => {
  const m = mount({ inputs: { wage: '25', burden: '' } });
  m.click('save');
  assert.equal(m.data.has(SHOP_RATES_KEY), false);
  assert.match(m.nodes['pf-rates-status'].textContent, /Fill in all 2/);
  m.nodes.burden.value = '0';
  m.click('save');
  assert.deepEqual(JSON.parse(m.data.get(SHOP_RATES_KEY)).rates, { hourlyWage: 25, burdenRate: 0 });
  // the in-page writer must stamp the same version serializeRates does
  assert.equal(JSON.parse(m.data.get(SHOP_RATES_KEY)).v, 1);
});

test('the saved-rates list is shown when rates exist and hidden when none do', () => {
  const saved = mount({ stored: JSON.stringify({ hourlyWage: 20, burdenRate: 10 }) });
  assert.equal(saved.nodes['pf-rates-list'].hidden, false);
  const empty = mount({});
  assert.equal(empty.nodes['pf-rates-list'].hidden, true);
});

test('the bar removes itself when the tag names no usable field', () => {
  assert.equal(mount({ pairs: 'bogus:wage' }).root.removed, true);
  assert.equal(mount({ pairs: '' }).root.removed, true);
});

test('the stylesheet strips every card style the venture sets on a bare section', () => {
  assert.match(renderShopRatesStyle(),
    /section\.pf-rates\{background:none;border:0;border-radius:0;box-shadow:none;min-height:0\}/);
});

// ---------------------------------------------------------------------------
// Red-team 2026-10-29: four mutants escaped the suite; these catch them.
// ---------------------------------------------------------------------------
test('pageCarriesShopRates is false for anything that is not a string', () => {
  for (const junk of [undefined, null, 42, {}, ['<input id="hourlyWage">']]) {
    assert.equal(pageCarriesShopRates(junk), false, String(junk));
  }
});

test('the list items in the bar carry no margin of their own', () => {
  assert.match(renderShopRatesStyle(), /\.pf-rates-list li\{margin:0\}/);
});

test('a bid link keeps the sender rate on load and offers to apply the saved one', () => {
  const stored = JSON.stringify({ hourlyWage: 20, burdenRate: 10 });
  const m = mount({ stored, hash: '#wage=45', inputs: { wage: '45', burden: '' } });
  assert.equal(m.nodes.wage.value, '45', 'the sender wage must survive');
  assert.equal(m.nodes.burden.value, 10, 'a field the link does not set is filled');
  assert.equal(m.buttons.apply.hidden, false);
  assert.match(m.nodes['pf-rates-status'].textContent, /came from a link/);
  m.click('apply');
  assert.equal(m.nodes.wage.value, 20, 'asking overrides the link');
});

test('saving keeps stored rates for fields this page does not carry', () => {
  const stored = JSON.stringify({ v: 1, rates: { overheadRate: 12, hourlyWage: 1, burdenRate: 1 } });
  const m = mount({ stored });
  m.nodes.wage.value = '25';
  m.nodes.burden.value = '5';
  m.click('save');
  assert.deepEqual(JSON.parse(m.data.get(SHOP_RATES_KEY)).rates,
    { overheadRate: 12, hourlyWage: 25, burdenRate: 5 });
});

test('saving keeps a bare (unversioned) stored object too', () => {
  const m = mount({ stored: JSON.stringify({ overheadRate: 12 }), inputs: { wage: '25', burden: '5' } });
  m.click('save');
  assert.equal(JSON.parse(m.data.get(SHOP_RATES_KEY)).rates.overheadRate, 12);
});
