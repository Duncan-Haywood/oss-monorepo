import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COST_STRUCTURE_SLUGS,
  BID_FOLLOW_UP_HELPERS,
  BID_OUTCOMES,
  BID_AMOUNT_HELPER,
  BID_PRICE_BAND_HELPERS,
  bidPriceSide,
  MIN_PRICE_BAND_SIDE,
  MIN_UNDERCUT_SAMPLE,
  MAX_LOST_TO,
  normalizeLostTo,
  undercutSentence,
  pricingSentence,
  BID_PRICING_HELPERS,
  winRateSentence,
  MIN_WIN_RATE_SAMPLE,
  WIN_RATE_SPLIT_POINTS,
  MIN_CROSS_TOOL_SAMPLE,
  MIN_MARGIN_SAMPLE,
  MARGIN_SPREAD_POINTS,
  MIN_KEEP_PER_TOOL,
  MIN_KEEP_TOOLS,
  KEEP_SPREAD_POINTS,
  keepSentence,
  MIN_MIX_TOOLS,
  mixSentence,
  MIN_TREND_PER_HALF,
  TREND_SPLIT_POINTS,
  trendSplit,
  trendSentence,
  toolTrendSentence,
  BID_TREND_HELPERS,
  normalizeJobCost,
  marginSentence,
  costGapSentence,
  PRICE_BAND_CLAUSE,
  bidAmountValue,
  formatBidAmount,
  revisionSentence,
  MIN_REVISION_PERCENT,
  priceBandSentence,
  EXCLUDED_FIELD_IDS,
  HEADLINE_AMOUNT_OVERRIDES,
  SAVED_BIDS_CLAUSE,
  addSavedBidsClause,
  bidWaitingDays,
  bidWaitingPhrase,
  bidResponseDays,
  chaseSentence,
  responseWindow,
  isQuietBid,
  MIN_RESPONSE_SAMPLE,
  followUpSentence,
  MAX_SAVED_BIDS,
  MIN_SAVEABLE_FIELDS,
  SAVED_BIDS_KEY,
  injectSavedBids,
  renderSavedBidsModule,
  renderSavedBidsStyle,
  SAVED_BIDS_STYLE_FILE,
  SAVED_BIDS_MODULE_FILE,
  normalizeBid,
  normalizeBidName,
  normalizeOutcome,
  normalizeHeadlineAmount,
  pageHeadlineAmountSelector,
  pageSaveableFieldIds,
  pageTakesSavedBids,
  parseStoredBids,
  restoreMismatch,
  savedBidIndex,
  serializeBids,
  stripForInjection,
} from './jobs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.join(HERE, '..', '..', 'ventures');

// The saved-bids script is one file for the whole site now, so an assertion
// about what the browser runs reads it here rather than out of a page. The page
// carries only the tag that names it, which is what the tag assertions check.
const module_ = () => renderSavedBidsModule();
// The band's stylesheet, likewise one file for the whole site.
const style = () => renderSavedBidsStyle();

const page = (body, head = '') =>
  `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;

const inputs = (n, prefix = 'f') =>
  Array.from({ length: n }, (_, i) => `<input id="${prefix}${i}" type="number">`).join('');

// ---------------------------------------------------------------------------
// Which pages get the bar
// ---------------------------------------------------------------------------

test('a page with a form is remembered', () => {
  assert.equal(pageTakesSavedBids(page(inputs(MIN_SAVEABLE_FIELDS))), true);
});

test('a page one field short of a bid is not', () => {
  assert.equal(pageTakesSavedBids(page(inputs(MIN_SAVEABLE_FIELDS - 1))), false);
});

test('a deep SEO page with no form gets nothing', () => {
  const prose = page('<h1>How to price a roof by the square</h1><p>Measure it.</p>');
  assert.equal(pageTakesSavedBids(prose), false);
  assert.equal(injectSavedBids(prose, 'roofing-bid-calculator'), prose);
});

test('selects and textareas count toward a form', () => {
  const html = page('<select id="a"><option>1</option></select><textarea id="b"></textarea><input id="c">');
  assert.deepEqual(pageSaveableFieldIds(html), ['a', 'b', 'c']);
});

test('buttons are not fields, so a page of buttons is not a form', () => {
  const html = page(
    '<input id="go" type="submit"><input id="reset" type="reset"><input id="up" type="file">',
  );
  assert.deepEqual(pageSaveableFieldIds(html), []);
  assert.equal(pageTakesSavedBids(html), false);
});

test('a hidden field is part of the form — some ventures keep a preset key in one', () => {
  assert.deepEqual(pageSaveableFieldIds(page('<input id="unit" type="hidden">')), ['unit']);
});

/**
 * The privacy checkbox is a fact about the browser, not about the job. A
 * restore that flipped counting back on because it was on when the bid was
 * saved would be changing a setting the visitor never asked this button to
 * touch.
 */
test('the usage opt-out is never part of a bid', () => {
  assert.ok(EXCLUDED_FIELD_IDS.has('usageOptOut'));
  assert.deepEqual(
    pageSaveableFieldIds(page('<input id="usageOptOut" type="checkbox"><input id="a"><input id="b">')),
    ['a', 'b'],
  );
});

/**
 * And under the other spelling, which is the one 15 published pages actually
 * use. The exclusion named a single id and so silently missed them: on the 10
 * that carry this band a restore was writing the visitor's counting preference
 * out of a saved document, including switching it on for someone who had left
 * it off.
 */
test('the usage checkbox is never part of a bid under either spelling', () => {
  assert.ok(EXCLUDED_FIELD_IDS.has('usage'));
  assert.deepEqual(
    pageSaveableFieldIds(page('<input id="usage" type="checkbox"><input id="a"><input id="b">')),
    ['a', 'b'],
  );
  // Only the exact id. A field that merely starts with it is the venture's.
  assert.deepEqual(
    pageSaveableFieldIds(page('<input id="usageHours"><input id="a"><input id="b">')),
    ['usageHours', 'a', 'b'],
  );
});

/**
 * The proposal header's customer name and home address, and the contractor's
 * own business identity, are never serialized into a saved bid or (via
 * `link.mjs`, which reads this same set) a shareable link. 104 ventures share
 * these seven ids for that header, and a "Copy link to this bid" URL is built
 * to be pasted into email or text to the customer — so a customer's own name
 * and home address must never round-trip through it.
 */
test('the proposal header (customer and business identity) is never part of a bid', () => {
  for (const id of [
    'clientName', 'clientAddress', 'companyName', 'companyAddress',
    'companyPhone', 'companyEmail', 'companyLicense',
  ]) {
    assert.ok(EXCLUDED_FIELD_IDS.has(id), id);
  }
  assert.deepEqual(
    pageSaveableFieldIds(page(
      '<input id="clientName"><input id="clientAddress">' +
        '<input id="companyName"><input id="companyAddress">' +
        '<input id="companyPhone"><input id="companyEmail"><input id="companyLicense">' +
        '<input id="lengthFt"><input id="pitch">',
    )),
    ['lengthFt', 'pitch'],
  );
});

/**
 * The label a saved bid is listed under ("14 Oak St — Mrs Reid") is typed by
 * the contractor into its own box, `pf-jobs-name` — never read off
 * `clientName`/`clientAddress` — so excluding those two ids from the
 * serialized field set cannot break the naming feature: `normalizeBid` keeps
 * whatever `name` it is handed regardless of which form fields survived.
 */
test('excluding the proposal header does not touch a bid\'s own name', () => {
  const bid = normalizeBid({
    name: '14 Oak St — Mrs Reid',
    at: '2026-01-01T00:00:00.000Z',
    fields: { clientName: 'Mrs Reid', clientAddress: '14 Oak St', lengthFt: '40' },
  });
  assert.equal(bid.name, '14 Oak St — Mrs Reid');
  assert.deepEqual(bid.fields, { lengthFt: '40' });
});

/** Including this feature's own name box, which would otherwise save itself. */
test('the site chrome’s own inputs are never part of a bid', () => {
  assert.deepEqual(
    pageSaveableFieldIds(page('<input id="pf-jobs-name"><input id="pf-search"><input id="a">')),
    ['a'],
  );
});

/**
 * The itemised calculators ship their row markup as a template string, so the
 * static page carries `id="${id}-foot"` and not a field anything can address.
 * Counting those would put the bar on a page whose real form is built in
 * script — which the runtime half checks for itself.
 */
test('template placeholder ids are not counted as fields', () => {
  const html = page('<input id="${id}-foot"><input id="${id}-pitch"><input id="a">');
  assert.deepEqual(pageSaveableFieldIds(html), ['a']);
});

test('a repeated id is counted once', () => {
  assert.deepEqual(pageSaveableFieldIds(page('<input id="a"><input id="a"><input id="b">')), ['a', 'b']);
});

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

test('the bar and its script land on a page with a form', () => {
  const out = injectSavedBids(page(inputs(6)), 'roofing-bid-calculator');
  assert.match(out, /data-pf-jobs-root/);
  assert.match(out, /class="pf-jobs"/);
  // The page carries the tag; the code it names is one file for the whole site.
  assert.match(out, /<script type="module" src="\.\/pf-jobs\.js" data-pf-jobs-slug="roofing-bid-calculator"/);
  assert.match(module_(), new RegExp(SAVED_BIDS_KEY));
});

test('the band points at the backup panel, at the depth the page is served from', () => {
  // The person most likely to want a backup is the one who has just saved a
  // bid they care about — and the file is written on the hub, so without this
  // link they are the one person never told it exists. These pages are served
  // at two depths, so a hard-coded `../` would be wrong at one of them.
  assert.match(injectSavedBids(page(inputs(6)), 'x', '../'), /href="\.\.\/#backup-box"/);
  assert.match(injectSavedBids(page(inputs(6)), 'x', '../../'), /href="\.\.\/\.\.\/#backup-box"/);
  // The sentence it answers must still be there: the offer only makes sense
  // beside the statement of what it protects against.
  assert.match(injectSavedBids(page(inputs(6)), 'x', '../'), /clearing your browser data clears it/);
});

test('injection is safe to run twice', () => {
  const once = injectSavedBids(page(inputs(6)), 'x');
  assert.equal(injectSavedBids(once, 'x'), once);
});

test('the bar anchors under the shop-rates bar when there is one', () => {
  const html = page(
    `<nav class="pf-chrome pf-chrome-top">n</nav><section class="pf-rates">r</section>${inputs(6)}`,
  );
  const out = injectSavedBids(html, 'x');
  assert.ok(out.indexOf('class="pf-rates"') < out.indexOf('data-pf-jobs-root'));
  assert.ok(out.indexOf('data-pf-jobs-root') < out.indexOf('id="f0"'));
});

test('the bar anchors under the nav when there is no rates bar', () => {
  const html = page(`<nav class="pf-chrome pf-chrome-top">n</nav>${inputs(6)}`);
  const out = injectSavedBids(html, 'x');
  assert.ok(out.indexOf('pf-chrome-top') < out.indexOf('data-pf-jobs-root'));
});

test('every button this injects stays inside the root, so a sweep can tell them apart', () => {
  // The band sits above the form by design, which means on a tool that does not
  // recalculate live, the first <button> in the document is this one and not
  // "Calculate true-up". `sweep.mjs` presses the first button it finds to decide
  // whether a tool still computes, and on 2026-08-28 that made nine tools pass
  // on the strength of this panel opening — the exact silent failure the sweep
  // exists to catch, passing because of the sweep. It now excludes
  // `[data-pf-jobs-root] button`, which is only true while every control this
  // injects is inside that element. A button moved outside it would restore the
  // false pass with nothing failing.
  const out = injectSavedBids(page(inputs(6) + hero('price')), 'fence-bid-calculator');
  const band = out.slice(out.indexOf('data-pf-jobs-root'), out.indexOf('</section>'));
  const all = out.match(/<button\b/g) ?? [];
  const inBand = band.match(/<button\b/g) ?? [];
  assert.ok(inBand.length >= 2, 'the band should carry at least its toggle and its save button');
  assert.equal(all.length, inBand.length, 'a button was injected outside data-pf-jobs-root');
});

test('a page with no head still gets the stylesheet ahead of the bar', () => {
  const out = injectSavedBids(`<body>${inputs(6)}</body>`, 'x');
  assert.ok(out.indexOf('.pf-jobs{') < out.indexOf('data-pf-jobs-root'));
});

test('a fragment with no body is left alone', () => {
  const fragment = `<div>${inputs(6)}</div>`;
  assert.equal(injectSavedBids(fragment, 'x'), fragment);
});

test('a non-string is returned unchanged', () => {
  assert.equal(injectSavedBids(null, 'x'), null);
  assert.deepEqual(pageSaveableFieldIds(null), []);
});

/**
 * The band renders the names a contractor gave their other bids, which are
 * customer names and street addresses more often than not. The proposal sheet
 * exists so a homeowner receives their own price and nothing else.
 */
test('the band is hidden in print', () => {
  // The stylesheet is one file at the site root now, so the rule is read from
  // there and the page is checked for the link that pulls it in. Either half
  // missing is the same defect: the band lands on the sheet the homeowner is
  // handed, listing the other customers by name.
  const out = injectSavedBids(page(inputs(6)), 'x');
  assert.match(out, new RegExp(`<link rel="stylesheet" href="\\./${SAVED_BIDS_STYLE_FILE}">`));
  assert.match(style(), /@media print\{\.pf-jobs\{display:none !important\}\}/);
});

/** With scripting off there is nothing behind the buttons. */
test('the band starts hidden and is revealed by script', () => {
  const out = injectSavedBids(page(inputs(6)), 'x');
  assert.match(out, /<section class="pf-jobs" id="pf-jobs" hidden data-pf-jobs-root>/);
  assert.match(module_(), /root\.hidden = false/);
});

/**
 * Rendered at build time rather than assembled in script, so a crawler and an
 * answer engine can see that these tools keep a bid.
 */
test('the explanation is in the markup, not built by script', () => {
  const out = injectSavedBids(page(inputs(6)), 'x');
  assert.match(out, /still here when the customer calls back/);
});

test('a hostile slug cannot break out of the attribute that carries it', () => {
  // It used to be JSON-encoded into a string literal; it is an attribute value
  // now, so the character that would escape it is a different one. Same guard,
  // moved to where the danger moved.
  const out = injectSavedBids(page(inputs(6)), 'a"b><img src=x>');
  assert.match(out, /data-pf-jobs-slug="a&quot;b&gt;&lt;img src=x&gt;"/);
  assert.doesNotMatch(out, /<img src=x>/);
});

// ---------------------------------------------------------------------------
// Structured data — #1894's lesson, applied to this feature
// ---------------------------------------------------------------------------

const ld = (list, spacing = '') =>
  `<script type="application/ld+json">{"@type":"WebApplication","featureList":${spacing}"${list}"}</script>`;

test('the clause is appended to a page’s feature list', () => {
  const out = addSavedBidsClause(page(ld('Roof squares, waste factor')));
  // Built from the constant, not spelled out: the wording is product copy that
  // changes when the feature does, and a literal here fails the next time it
  // does without saying anything about whether appending still works.
  assert.ok(out.includes(`"featureList":"Roof squares, waste factor, ${SAVED_BIDS_CLAUSE}"`));
});

/**
 * The repo uses both spellings. A strict match on `"featureList":"` reported 37
 * calculators as having no feature list at all.
 */
test('both spellings of the key are matched', () => {
  assert.ok(addSavedBidsClause(page(ld('A', ' '))).includes(SAVED_BIDS_CLAUSE));
  assert.ok(addSavedBidsClause(page(ld('A', ''))).includes(SAVED_BIDS_CLAUSE));
});

/** `ev-charger` nests its node under `@graph`, so a top-level lookup misses it. */
test('a feature list nested under @graph is still found', () => {
  const nested = page(
    '<script type="application/ld+json">{"@graph":[{"@type":"WebApplication","featureList":"A, B"}]}</script>',
  );
  assert.match(addSavedBidsClause(nested), /"featureList":"A, B, saved bids/);
});

test('an escaped quote inside the list does not end it early', () => {
  const out = addSavedBidsClause(page(ld('A 12\\" run, B')));
  assert.ok(out.includes(`"featureList":"A 12\\" run, B, ${SAVED_BIDS_CLAUSE}"`));
});

test('appending is idempotent', () => {
  const once = addSavedBidsClause(page(ld('A')));
  assert.equal(addSavedBidsClause(once), once);
});

test('a page with no feature list is left alone rather than given one', () => {
  const bare = page('<p>no json-ld here</p>');
  assert.equal(addSavedBidsClause(bare), bare);
});

test('an empty feature list is not turned into a list of one claim', () => {
  const empty = page(ld(''));
  assert.equal(addSavedBidsClause(empty), empty);
});

/**
 * The coupling that matters: the claim ships in the same statement as the
 * feature, so a page can never advertise saved bids it does not have. This is
 * the reverse-direction guard #1894 had to add as a separate test.
 */
test('injecting the band declares the feature', () => {
  const out = injectSavedBids(page(ld('A') + inputs(6)), 'x');
  assert.match(out, /data-pf-jobs-root/);
  assert.ok(out.includes(SAVED_BIDS_CLAUSE));
});

test('a page that does not get the band never claims the feature', () => {
  const tooSmall = page(ld('A') + inputs(MIN_SAVEABLE_FIELDS - 1));
  const out = injectSavedBids(tooSmall, 'x');
  assert.ok(!out.includes(SAVED_BIDS_CLAUSE));
  assert.equal(out, tooSmall);
});

// ---------------------------------------------------------------------------
// The restore rule
// ---------------------------------------------------------------------------

test('an exactly matching form restores', () => {
  assert.deepEqual(restoreMismatch(['a', 'b'], ['b', 'a']), { missing: [], extra: [] });
});

/**
 * A bid saved with four rooms meeting a form with one. Writing the field that
 * matched would leave a real, plausible, smaller job on screen.
 */
test('a form missing saved fields reports them as missing', () => {
  assert.deepEqual(restoreMismatch(['a', 'b', 'c'], ['a']), { missing: ['b', 'c'], extra: [] });
});

/** And the reverse: rows on the form this bid never priced would be added to it. */
test('a form with fields the bid never had reports them as extra', () => {
  assert.deepEqual(restoreMismatch(['a'], ['a', 'b']), { missing: [], extra: ['b'] });
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const bid = (over = {}) => ({
  name: 'A',
  at: '2026-08-27T10:00:00.000Z',
  fields: { a: '1', b: 'two', c: true },
  ...over,
});

test('a well-formed bid survives normalization', () => {
  assert.deepEqual(normalizeBid(bid()), bid());
});

test('a bid with no name or no date is not a bid', () => {
  assert.equal(normalizeBid(bid({ name: '   ' })), null);
  assert.equal(normalizeBid(bid({ at: '' })), null);
});

test('a bid with no usable field is not a bid', () => {
  assert.equal(normalizeBid(bid({ fields: {} })), null);
  assert.equal(normalizeBid(bid({ fields: { usageOptOut: true } })), null);
  assert.equal(normalizeBid(bid({ fields: 'nope' })), null);
});

/** Only what round-trips through a form field. An object would write `[object Object]`. */
test('values that are not a string or a boolean are dropped', () => {
  assert.deepEqual(normalizeBid(bid({ fields: { a: '1', n: 2, o: {}, z: null } })).fields, { a: '1' });
});

test('an absurdly long value is dropped rather than stored', () => {
  assert.equal(normalizeBid(bid({ fields: { a: 'x'.repeat(2001) } })), null);
});

test('a name is collapsed and capped', () => {
  assert.equal(normalizeBidName('  14  Oak   St  '), '14 Oak St');
  assert.equal(normalizeBidName('y'.repeat(80)).length, 60);
  assert.equal(normalizeBidName(42), '');
});

test('storage that is not this shape reads as no saved bids', () => {
  for (const raw of ['', 'null', '{}', '[]', 'not json', '{"bids":[]}', '{"v":1}']) {
    assert.deepEqual(parseStoredBids(raw), {}, raw);
  }
  assert.deepEqual(parseStoredBids(undefined), {});
});

test('bids round-trip through the stored form', () => {
  const store = { roofing: [bid()], siding: [bid({ name: 'B' })] };
  assert.deepEqual(parseStoredBids(serializeBids(store)), store);
});

test('a slug whose bids are all unreadable is dropped, and the rest survive', () => {
  const raw = JSON.stringify({ v: 1, bids: { good: [bid()], bad: [{ nope: 1 }], worse: 'x' } });
  assert.deepEqual(Object.keys(parseStoredBids(raw)), ['good']);
});

test('a tool cannot grow past the cap', () => {
  const many = Array.from({ length: MAX_SAVED_BIDS + 5 }, (_, i) => bid({ name: `n${i}` }));
  assert.equal(parseStoredBids(serializeBids({ x: many })).x.length, MAX_SAVED_BIDS);
});

// ---------------------------------------------------------------------------
// Against the actual products
// ---------------------------------------------------------------------------

/**
 * The point of injecting at build time is that a calculator landing on `main`
 * is covered for free. This asserts the family is actually covered rather than
 * trusting that it is — a venture that stops shipping a static form would drop
 * out silently otherwise.
 */
test('every bid calculator on main carries a form worth remembering', async () => {
  const slugs = (await fs.readdir(VENTURES, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-bid-calculator'))
    .map((entry) => entry.name);

  assert.ok(slugs.length > 50, `expected the bid-calculator family, found ${slugs.length}`);

  const without = [];
  for (const slug of slugs) {
    const file = path.join(VENTURES, slug, 'index.html');
    let html;
    try {
      html = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (!pageTakesSavedBids(html)) without.push(slug);
  }
  assert.deepEqual(without, [], `these ship no static form: ${without.join(', ')}`);
});

// The hub's saved-bid index. These run here rather than in build.test.mjs
// because the ordering and hardening rules belong to the store, and the hub's
// script is a transcription of this function into a page it cannot import.

test('savedBidIndex flattens every tool into one list, newest first', () => {
  const raw = serializeBids({
    'gutter-bid-calculator': [
      { name: '14 Oak St — Mrs Reid', at: '2026-08-25T09:00:00.000Z', fields: { a: '1' } },
    ],
    'metal-roof-bid-calculator': [
      { name: 'Hollis barn', at: '2026-08-27T11:30:00.000Z', fields: { a: '2' } },
      { name: 'Prior job', at: '2026-08-20T08:00:00.000Z', fields: { a: '3' } },
    ],
  });

  assert.deepEqual(
    savedBidIndex(raw).map((row) => [row.slug, row.name]),
    [
      ['metal-roof-bid-calculator', 'Hollis barn'],
      ['gutter-bid-calculator', '14 Oak St — Mrs Reid'],
      ['metal-roof-bid-calculator', 'Prior job'],
    ],
  );
});

test('savedBidIndex never hands out the numbers, only where to find them', () => {
  const raw = serializeBids({
    'deck-bid-calculator': [
      { name: 'Job', at: '2026-08-27T11:30:00.000Z', fields: { hourlyWage: '55' } },
    ],
  });
  assert.deepEqual(Object.keys(savedBidIndex(raw)[0]).sort(), ['at', 'name', 'slug']);
});

test('savedBidIndex orders totally, so equal timestamps cannot swap between renders', () => {
  const at = '2026-08-27T11:30:00.000Z';
  const bids = {
    'b-tool': [{ name: 'z', at, fields: { a: '1' } }, { name: 'a', at, fields: { a: '1' } }],
    'a-tool': [{ name: 'm', at, fields: { a: '1' } }],
  };
  const once = savedBidIndex(serializeBids(bids)).map((r) => `${r.slug}/${r.name}`);
  assert.deepEqual(once, ['a-tool/m', 'b-tool/a', 'b-tool/z']);
  // Same input, re-parsed: the sort must not depend on key iteration order.
  assert.deepEqual(savedBidIndex(serializeBids(bids)).map((r) => `${r.slug}/${r.name}`), once);
});

test('savedBidIndex survives whatever is actually in storage', () => {
  for (const raw of ['', 'not json', '{}', '{"bids":null}', '{"bids":{"x":"nope"}}', null]) {
    assert.deepEqual(savedBidIndex(raw), []);
  }
  // A row missing a name or a timestamp is skipped rather than rendered blank.
  assert.deepEqual(
    savedBidIndex('{"v":1,"bids":{"t":[{"name":"","at":"2026-08-27","fields":{"a":"1"}},{"name":"n"}]}}'),
    [],
  );
});

test('savedBidIndex caps the list it hands the hub', () => {
  const list = Array.from({ length: 30 }, (_, i) => ({
    name: `job ${i}`,
    at: `2026-08-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`,
    fields: { a: '1' },
  }));
  assert.equal(savedBidIndex(serializeBids({ 'a-tool': list }), { limit: 8 }).length, 8);
  assert.equal(savedBidIndex(serializeBids({ 'a-tool': list })).length, MAX_SAVED_BIDS);
});

test('the band carries the id the hub links to, and opens on that anchor', () => {
  const html = injectSavedBids(page(inputs(4)), 'gutter-bid-calculator');
  assert.match(html, /<section class="pf-jobs" id="pf-jobs"/);
  // The hub sends visitors to /<slug>/#pf-jobs; landing there must open the
  // panel rather than leaving a collapsed strip under the anchor.
  assert.match(module_(), /location\.hash === '#pf-jobs'/);
});

// ---------------------------------------------------------------------------
// Outcomes: won, lost, and the absence of both
// ---------------------------------------------------------------------------

test('only the two decided states are outcomes', () => {
  assert.deepEqual(BID_OUTCOMES, ['won', 'lost']);
  assert.equal(normalizeOutcome('won'), 'won');
  assert.equal(normalizeOutcome('lost'), 'lost');
  // Everything else is waiting, including the shapes a future version of the
  // site or a hand-edited backup could put here.
  for (const junk of ['waiting', 'WON', '', null, undefined, 0, 1, {}, ['won']]) {
    assert.equal(normalizeOutcome(junk), null, `expected ${JSON.stringify(junk)} to read as waiting`);
  }
});

test('a waiting bid carries no outcome key at all', () => {
  // The load-bearing compatibility property: every bid saved before outcomes
  // existed must be byte-identical to one saved after and left undecided, so
  // nothing has to migrate and no record grows a null.
  const bid = normalizeBid({ name: 'n', at: '2026-08-01T09:00:00.000Z', fields: { a: '1' } });
  assert.deepEqual(bid, { name: 'n', at: '2026-08-01T09:00:00.000Z', fields: { a: '1' } });
  assert.equal('outcome' in bid, false);
  assert.equal('decidedAt' in bid, false);
});

test('a decided bid keeps its outcome and when it was decided', () => {
  const bid = normalizeBid({
    name: 'n',
    at: '2026-08-01T09:00:00.000Z',
    fields: { a: '1' },
    outcome: 'won',
    decidedAt: '2026-08-20T12:00:00.000Z',
  });
  assert.equal(bid.outcome, 'won');
  assert.equal(bid.decidedAt, '2026-08-20T12:00:00.000Z');
});

test('a junk outcome is dropped rather than stored or thrown', () => {
  const bid = normalizeBid({
    name: 'n',
    at: '2026-08-01T09:00:00.000Z',
    fields: { a: '1' },
    outcome: 'maybe',
    decidedAt: '2026-08-20T12:00:00.000Z',
  });
  assert.equal('outcome' in bid, false);
  // decidedAt without a decision is meaningless and would survive into the next
  // merge as a tiebreak for an outcome that is not there.
  assert.equal('decidedAt' in bid, false);
});

test('an outcome survives a round trip through storage', () => {
  const raw = serializeBids({
    't': [{ name: 'n', at: '2026-08-01T09:00:00.000Z', fields: { a: '1' }, outcome: 'lost', decidedAt: '2026-08-09T00:00:00.000Z' }],
  });
  assert.deepEqual(parseStoredBids(raw).t[0], {
    name: 'n',
    at: '2026-08-01T09:00:00.000Z',
    fields: { a: '1' },
    outcome: 'lost',
    decidedAt: '2026-08-09T00:00:00.000Z',
  });
});

test('the hub index carries the outcome, and omits it while waiting', () => {
  const raw = serializeBids({
    't': [
      { name: 'won one', at: '2026-08-02T09:00:00.000Z', fields: { a: '1' }, outcome: 'won' },
      { name: 'open one', at: '2026-08-01T09:00:00.000Z', fields: { a: '1' } },
    ],
  });
  assert.deepEqual(savedBidIndex(raw), [
    { slug: 't', name: 'won one', at: '2026-08-02T09:00:00.000Z', outcome: 'won' },
    { slug: 't', name: 'open one', at: '2026-08-01T09:00:00.000Z' },
  ]);
});

// ---------------------------------------------------------------------------
// How old a waiting bid is
// ---------------------------------------------------------------------------

const AT = '2026-08-01T09:00:00.000Z';
const ms = (iso) => Date.parse(iso);

test('waiting age is whole days', () => {
  assert.equal(bidWaitingDays(AT, ms('2026-08-01T09:00:00.000Z')), 0);
  assert.equal(bidWaitingDays(AT, ms('2026-08-02T08:59:00.000Z')), 0);
  assert.equal(bidWaitingDays(AT, ms('2026-08-02T09:00:00.000Z')), 1);
  assert.equal(bidWaitingDays(AT, ms('2026-08-20T09:00:00.000Z')), 19);
});

test('a clock that moved backwards reports today, not a negative age', () => {
  assert.equal(bidWaitingDays(AT, ms('2026-07-01T09:00:00.000Z')), 0);
});

test('an unreadable timestamp has no age rather than a wrong one', () => {
  for (const junk of ['', 'someday', null, undefined, {}, 17]) {
    assert.equal(bidWaitingDays(junk, ms(AT)), null);
  }
});

test('the waiting badge is silent on a bid that is not late yet', () => {
  assert.equal(bidWaitingPhrase(0), '');
  assert.equal(bidWaitingPhrase(null), '');
  assert.equal(bidWaitingPhrase(1), 'waiting 1 day');
  assert.equal(bidWaitingPhrase(19), 'waiting 19 days');
});

// ---------------------------------------------------------------------------
// The summary sentence
// ---------------------------------------------------------------------------

const NOW = ms('2026-08-20T09:00:00.000Z');
const row = (props) => ({ at: AT, ...props });

test('nothing saved says nothing', () => {
  assert.equal(followUpSentence([], NOW), '');
  assert.equal(followUpSentence(null, NOW), '');
});

test('the waiting clause counts the open bids and ages the oldest', () => {
  assert.equal(
    followUpSentence([row({}), row({ at: '2026-08-19T09:00:00.000Z' })], NOW),
    '2 bids are waiting on an answer, the oldest saved 19 days ago.',
  );
});

test('one waiting bid is described in the singular', () => {
  assert.equal(followUpSentence([row({})], NOW), '1 bid is waiting on an answer, saved 19 days ago.');
  assert.equal(
    followUpSentence([row({ at: '2026-08-19T09:00:00.000Z' })], NOW),
    '1 bid is waiting on an answer, saved 1 day ago.',
  );
});

test('bids priced today are not described as overdue', () => {
  const today = { at: '2026-08-20T08:00:00.000Z' };
  assert.equal(followUpSentence([today], NOW), '1 bid is waiting on an answer, saved today.');
  assert.equal(
    followUpSentence([today, { at: '2026-08-20T07:00:00.000Z' }], NOW),
    '2 bids are waiting on an answer, all saved today.',
  );
});

test('decided bids are counted, not turned into a percentage', () => {
  const rows = [
    row({ outcome: 'won' }),
    row({ outcome: 'won' }),
    row({ outcome: 'lost' }),
  ];
  assert.equal(followUpSentence(rows, NOW), 'You have won 2 of the 3 you have heard back on.');
});

test('both clauses appear together when there is both news and a chase', () => {
  assert.equal(
    followUpSentence([row({}), row({ outcome: 'won' })], NOW),
    '1 bid is waiting on an answer, saved 19 days ago. You have won 1 of the 1 you have heard back on.',
  );
});

test('an outcome nobody recognises is counted as waiting, never dropped', () => {
  // A row whose outcome came from a newer version of the site still has to be
  // chased: hiding a live quote behind a state this page cannot clear is the
  // one failure worse than showing it in the wrong column.
  assert.equal(
    followUpSentence([row({ outcome: 'archived' })], NOW),
    '1 bid is waiting on an answer, saved 19 days ago.',
  );
});

test('a waiting bid with no readable date still counts, without an age', () => {
  assert.equal(followUpSentence([{ at: 'someday' }], NOW), '1 bid is waiting on an answer.');
});

// ---------------------------------------------------------------------------
// The hub and the calculator run the same code
// ---------------------------------------------------------------------------

test('injection strips prose and indentation, and only that', () => {
  const src = [
    'function f(a) {',
    '  // a comment that costs a quarter of a megabyte across the bundle',
    '  var s = "keep  // this";',
    '',
    '  return s;',
    '}',
  ].join('\n');
  assert.equal(stripForInjection(src), 'function f(a) {\nvar s = "keep  // this";\nreturn s;\n}');
});

test('the injected helpers answer exactly as the module does', () => {
  // The point of embedding these by toString rather than re-writing them: the
  // hub, the calculator band and these tests cannot disagree about how old a
  // bid is. Evaluated here so a change that breaks the embedding is caught in
  // Node rather than by a visitor reading two different numbers.
  const evaluated = new Function(`${BID_FOLLOW_UP_HELPERS}
    return { bidWaitingDays: bidWaitingDays, bidWaitingPhrase: bidWaitingPhrase, followUpSentence: followUpSentence };`)();

  const rows = [row({}), row({ outcome: 'won' }), row({ at: '2026-08-18T09:00:00.000Z' })];
  assert.equal(evaluated.followUpSentence(rows, NOW), followUpSentence(rows, NOW));
  assert.equal(evaluated.bidWaitingDays(AT, NOW), bidWaitingDays(AT, NOW));
  assert.equal(evaluated.bidWaitingPhrase(19), bidWaitingPhrase(19));
});

// ---------------------------------------------------------------------------
// What the band ships
// ---------------------------------------------------------------------------

test('the band ships the outcome control and the summary line', () => {
  const html = injectSavedBids(page(inputs(4)), 'fence-bid-calculator');
  assert.match(html, /id="pf-jobs-summary"/);
  assert.match(module_(), /data-pf-jobs-state/);
  // The select fires change, not click, and the panel's click delegate would
  // never see it.
  assert.match(module_(), /addEventListener\('change'/);
  // The three states, in the order a bid moves through them.
  assert.match(module_(), /\[\['', 'Waiting'\], \['won', 'Won'\], \['lost', 'Lost'\]\]/);
});

test('re-pricing a job does not move it back into the chase list', () => {
  // Saving over a bid of the same name splices the old row out; its outcome has
  // to be carried onto the replacement, or marking a job won and then re-saving
  // it silently un-wins it.
  assert.match(module_(), /entry\.outcome = carried\.outcome/);
});

test('the feature list says the tool tracks outcomes', () => {
  // #1894's lesson: a feature no search engine or answer engine can see is a
  // feature the only channel that brings these tools traffic does not know
  // about. The claim ships with the control, in the same statement.
  const html = injectSavedBids(page(inputs(4), ld('Fence panels')), 'fence-bid-calculator');
  assert.ok(html.includes(SAVED_BIDS_CLAUSE));
  assert.match(SAVED_BIDS_CLAUSE, /won or lost/);
});

// ---------------------------------------------------------------------------
// The figure the tool gave
// ---------------------------------------------------------------------------

const hero = (id, text = '$1,035') => `<p id="${id}" class="hero-number">${text}</p>`;

test('a hero figure is read as an amount, and anything else is not', () => {
  assert.equal(normalizeHeadlineAmount('$1,035'), '$1,035');
  assert.equal(normalizeHeadlineAmount('  $106.09\n'), '$106.09');
  assert.equal(normalizeHeadlineAmount('$589.38 · 13.2 h'), '$589.38 · 13.2 h');
  assert.equal(normalizeHeadlineAmount('£240'), '£240');

  // Found on the built site, each of them: a hero holding a count, an
  // unfilled form, a hero carrying a sentence of advice, and an empty one.
  assert.equal(normalizeHeadlineAmount('0'), '');
  assert.equal(normalizeHeadlineAmount('$0.00'), '');
  assert.equal(normalizeHeadlineAmount(
    'Referral is a tie (same fee base), but moving the shipping'), '');
  assert.equal(normalizeHeadlineAmount(''), '');
  assert.equal(normalizeHeadlineAmount('   '), '');

  assert.equal(normalizeHeadlineAmount(null), '');
  assert.equal(normalizeHeadlineAmount(1035), '');
});

test('the amount element is the hero, or nothing', () => {
  assert.equal(pageHeadlineAmountSelector(page(hero('price'))), '#price');
  assert.equal(pageHeadlineAmountSelector(page(`${hero('price')}${hero('other')}`)), '#price');
  assert.equal(pageHeadlineAmountSelector(page('<p class="hero-number">$5</p>')), '');
  assert.equal(pageHeadlineAmountSelector(page('<p id="total">$25,739.73</p>')), '',
    'an id that merely looks like a price must not be guessed at');
  assert.equal(pageHeadlineAmountSelector(page(inputs(4))), '');
  assert.equal(pageHeadlineAmountSelector(null), '');
});

test('a tool whose headline is not what it sells on names the element that is', () => {
  // lawn-care leads with a per-visit price and sells a monthly contract.
  assert.equal(
    pageHeadlineAmountSelector(page(hero('price', '$106.09')), 'lawn-care-bid-calculator'),
    '#monthly',
  );
});

test('the override agrees with the one the printed proposal is verified against', async () => {
  // Two places answer "which element carries the price this tool quotes". They
  // are allowed to be in two files; they are not allowed to disagree, or the
  // saved bid says one number and the customer's sheet says another.
  const trades = JSON.parse(
    await fs.readFile(path.join(HERE, '..', 'proposal', 'trades.json'), 'utf8'),
  );
  for (const [slug, trade] of Object.entries(trades)) {
    if (!trade.screenPriceSelector) continue;
    assert.equal(HEADLINE_AMOUNT_OVERRIDES[slug], trade.screenPriceSelector, slug);
  }
  for (const [slug, selector] of Object.entries(HEADLINE_AMOUNT_OVERRIDES)) {
    if (!trades[slug]) continue;
    assert.equal(trades[slug].screenPriceSelector, selector, slug);
  }
});

test('a bid keeps the figure it was saved at, and only when there is one', () => {
  const base = { name: 'x', at: '2026-08-20T10:00:00.000Z', fields: { a: '1' } };
  assert.equal(normalizeBid({ ...base, amount: '$1,035' }).amount, '$1,035');
  // Absent rather than empty, so every bid saved before this reads unchanged
  // and no byte is spent on a blank.
  assert.equal('amount' in normalizeBid(base), false);
  assert.equal('amount' in normalizeBid({ ...base, amount: '0' }), false);
  assert.equal('amount' in normalizeBid({ ...base, amount: { $: 5 } }), false);
});

test('the hub index carries the figure, not the numbers behind it', () => {
  const rows = savedBidIndex({
    g: [{ name: 'x', at: '2026-08-20T10:00:00.000Z', fields: { a: '1' }, amount: '$1,035' }],
    h: [{ name: 'y', at: '2026-08-19T10:00:00.000Z', fields: { a: '1' } }],
  });
  assert.equal(rows[0].amount, '$1,035');
  assert.equal('fields' in rows[0], false, 'the index must not carry the job');
  assert.equal('amount' in rows[1], false);
});

test('the band captures the headline figure and draws it', () => {
  const html = injectSavedBids(page(inputs(4) + hero('price')), 'fence-bid-calculator');
  assert.match(html, /data-pf-jobs-amount="#price"/);
  assert.match(module_(), /entry\.amount = shown/);
  assert.match(module_(), /pf-jobs-amount/);
});

test('a tool with no headline figure ships no selector rather than a guess', () => {
  const html = injectSavedBids(page(inputs(4)), 'cleaning-dilution-calculator');
  assert.match(html, /data-pf-jobs-amount=""/);
  // And the guard is still shipped, so a bid restored from a device that did
  // capture one still draws it.
  assert.match(module_(), /var normalizeHeadlineAmount =/);
});

test('a selector that is not the shape this build writes is refused at runtime', () => {
  // It used to be a build-time literal; it now travels through the DOM and is
  // handed to querySelector, so the shared script re-checks it rather than
  // trusting what it reads off a page.
  const guard = new Function('claimed',
    `${module_().match(/var AMOUNT_SELECTOR = [^;]+;/)[0]} return AMOUNT_SELECTOR;`);
  assert.equal(guard('#price'), '#price');
  assert.equal(guard('#hero-number'), '#hero-number');
  assert.equal(guard('script'), '');
  assert.equal(guard('*'), '');
  assert.equal(guard(''), '');
});

test('the injected amount guard answers exactly as the module does', () => {
  const evaluated = new Function(`${BID_AMOUNT_HELPER}
    return normalizeHeadlineAmount;`)();
  for (const value of ['$1,035', '0', '$0.00', ' £240 ', '', 'a sentence about fees']) {
    assert.equal(evaluated(value), normalizeHeadlineAmount(value), JSON.stringify(value));
  }
});

test('the feature list says a saved bid keeps its figure', () => {
  // #1894: a feature that never names itself in featureList is invisible to
  // the only channel that brings these tools traffic.
  assert.match(SAVED_BIDS_CLAUSE, /figure the tool gave you/);
});

// ---------------------------------------------------------------------------
// Where this tool's quotes tip from won to lost
// ---------------------------------------------------------------------------

const decided = (outcome, amount) => ({ name: amount, at: AT, outcome, amount });

test('a headline figure reads back as a number this can compare', () => {
  assert.deepEqual(bidAmountValue('$1,035'), { currency: '$', value: 1035, text: '$1,035' });
  assert.deepEqual(bidAmountValue('£240.50'), { currency: '£', value: 240.5, text: '£240.50' });
  // A unit appended to the quote is a second fact about it, not a second quote.
  assert.deepEqual(bidAmountValue('$589.38 · 13.2 h'),
    { currency: '$', value: 589.38, text: '$589.38' });
  // A seller-fee page can answer with a loss.
  assert.deepEqual(bidAmountValue('-$1.20'), { currency: '$', value: -1.2, text: '-$1.20' });
});

test('anything it cannot read with certainty is refused, not guessed at', () => {
  // A range: averaging its low end reports a figure nobody was quoted.
  assert.equal(bidAmountValue('$1,200–$1,800'), null);
  // Symbol after the digits — whether that comma is a decimal point is a guess.
  assert.equal(bidAmountValue('1.234,56 €'), null);
  // A comma that is not a thousands separator.
  assert.equal(bidAmountValue('$1,5'), null);
  // And everything normalizeHeadlineAmount already refuses stays refused.
  assert.equal(bidAmountValue('0'), null);
  assert.equal(bidAmountValue('$0.00'), null);
  assert.equal(bidAmountValue(42), null);
});

test('an average is written to the precision its own tool answers in', () => {
  // A trade quote in the thousands gains nothing from .00 on a phone.
  assert.equal(formatBidAmount('$', 1840.5), '$1,841');
  assert.equal(formatBidAmount('$', 24500), '$24,500');
  // A seller-fee page answers in cents; rounding $2.35 to $2 misstates it.
  assert.equal(formatBidAmount('$', 2.35), '$2.35');
  assert.equal(formatBidAmount('£', -1.2), '-£1.20');
});

// ---------------------------------------------------------------------------
// The reprice, against the figure the customer already has
// ---------------------------------------------------------------------------

test('a cheaper reprice is stated against the quoted figure, in money and percent', () => {
  assert.equal(
    revisionSentence('$8,450', '$7,210'),
    '$7,210 now, against $8,450 saved — $1,240 less (14.7%).',
  );
});

test('a dearer reprice reads the same way, pointed the other direction', () => {
  assert.equal(
    revisionSentence('$8,450', '$9,100'),
    '$9,100 now, against $8,450 saved — $650 more (7.7%).',
  );
});

test('the figures are quoted back exactly as the tool wrote them', () => {
  // Not reformatted: the contractor is reading this out against a printed
  // proposal, so the characters have to match it.
  assert.equal(
    revisionSentence('£240.50', '£198.00'),
    '£198.00 now, against £240.50 saved — £42.50 less (17.7%).',
  );
  // A unit appended to the hero is a second fact about the quote, not a
  // second quote — bidAmountValue drops it and so does this.
  assert.equal(
    revisionSentence('$589.38 · 13.2 h', '$610.00 · 14.1 h'),
    '$610.00 now, against $589.38 saved — $20.62 more (3.5%).',
  );
});

test('a form still holding the bid it restored says so rather than nothing', () => {
  // The state a restore lands in. Silence here would read as "the comparison
  // is broken", which is the opposite of what has happened.
  assert.equal(revisionSentence('$8,450', '$8,450'), 'Still $8,450, the figure this bid was saved at.');
});

test('a difference too small to round to a tenth of a percent drops the percent', () => {
  // A rounded 0.0% beside a real $2 difference reads as "no change".
  const sentence = revisionSentence('$100,000', '$99,998');
  // The difference is written to formatBidAmount's own rule — cents under
  // $100 — because it is a figure this file computed rather than one a tool
  // wrote, the same treatment the panel's averages get.
  assert.equal(sentence, '$99,998 now, against $100,000 saved — $2.00 less.');
  assert.ok(!sentence.includes('%'));
  assert.equal(MIN_REVISION_PERCENT, 0.1);
});

test('a quote that cannot be read, on either side, draws nothing', () => {
  assert.equal(revisionSentence('', '$7,210'), '');
  assert.equal(revisionSentence('$8,450', ''), '');
  // A range is not a quote this can subtract from.
  assert.equal(revisionSentence('$1,200–$1,800', '$7,210'), '');
  assert.equal(revisionSentence(undefined, undefined), '');
});

test('two currencies are refused rather than converted — this file has no rates', () => {
  assert.equal(revisionSentence('$8,450', '£7,210'), '');
});

test('a saved figure of zero or less carries the money difference without a percent', () => {
  // Some seller-fee tools headline a profit that can go below zero, where
  // "40% more" against a loss is a sentence with no agreed meaning.
  assert.equal(
    revisionSentence('-$1.20', '$3.40'),
    '$3.40 now, against -$1.20 saved — $4.60 more.',
  );
});

test('the comparison line is on the pages that can draw it, and only those', () => {
  const withHero = injectSavedBids(page(`<p id="h" class="hero-number">$1,035</p>${inputs(6)}`), 'x');
  assert.match(withHero, /<p class="pf-jobs-revision" id="pf-jobs-revision" hidden>/);
  // A tool with no headline figure stores no amounts, so it could never fill
  // this line — and a line that can never fill is an empty box on the page.
  const noHero = injectSavedBids(page(inputs(6)), 'x');
  assert.ok(!noHero.includes('pf-jobs-revision'));
});

test('the comparison line stays down until the script has something to say', () => {
  // Regression: the rule below sets `display:flex`, which outranks the user
  // agent's `[hidden]` rule. Without the guard the line rendered — empty, with
  // a Stop comparing button behind it — on every page load of 116 tools. Found
  // by driving a browser; no unit test then existing could have seen it.
  assert.match(style(), /\.pf-jobs-revision\[hidden\]\{display:none\}/);
  assert.match(style(), /\.pf-jobs-revision\{[^}]*display:flex/);
  assert.match(module_(), /box\.hidden = sentence === ''/);
});

test('restoring a bid puts its name back in the box', () => {
  // Otherwise a re-save after "what if we skip the tear-off" writes a second
  // row under today's date, and the match-by-name that exists for exactly this
  // sequence never fires.
  assert.match(module_(), /el\('pf-jobs-name'\)\.value = bid\.name;/);
});

test('the comparison ends when the stored bid becomes the form', () => {
  // Saving over the bid makes the two agree by construction; leaving the line
  // up would quote a figure the customer was never given.
  const script = module_();
  const save = script.slice(script.indexOf('var save = function'), script.indexOf('var restore = function'));
  assert.ok(save.includes('stopComparing();'));
});

test('the reprice reading ships to the browser with the readers it calls', () => {
  // It reads a hero figure through bidAmountValue and writes a difference
  // through formatBidAmount, so it can only draw where those two already are.
  assert.ok(BID_PRICE_BAND_HELPERS.includes('var revisionSentence ='));
  assert.ok(BID_PRICE_BAND_HELPERS.includes(`var MIN_REVISION_PERCENT = ${MIN_REVISION_PERCENT};`));
});

test('the band brackets where the price tips when wins and losses separate', () => {
  const sentence = priceBandSentence([
    decided('won', '$1,800'), decided('won', '$2,400'),
    decided('lost', '$2,600'), decided('lost', '$3,200'),
  ]);
  assert.match(sentence, /The 2 you won here averaged \$2,100, the 2 you lost, \$2,900\./);
  assert.match(sentence, /Every bid you won was \$2,400 or under, and every one you lost \$2,600 or over\./);
});

test('and says the opposite when they overlap, because that is the useful reading', () => {
  // Won as high as $2,400 and lost as low as $2,050: the jobs in that range
  // were not decided on price, and dropping it will not win them.
  const sentence = priceBandSentence([
    decided('won', '$1,800'), decided('won', '$2,400'),
    decided('lost', '$2,050'), decided('lost', '$3,200'),
  ]);
  assert.match(sentence, /You have won as high as \$2,400 and lost as low as \$2,050, so price alone has not been deciding these\./);
});

test('winning and losing at the same figure reads correctly, not as a nonsense range', () => {
  // Why the overlap clause names its two edges instead of "between X and Y":
  // here they are the same figure, and a range would say "between $2,000 and
  // $2,000".
  const sentence = priceBandSentence([
    decided('won', '$900'), decided('won', '$2,000'),
    decided('lost', '$2,000'), decided('lost', '$3,000'),
  ]);
  assert.match(sentence, /won as high as \$2,000 and lost as low as \$2,000/);
});

test('two a side, because one win and one loss is a pair of anecdotes', () => {
  assert.equal(MIN_PRICE_BAND_SIDE, 2);
  const thin = [decided('won', '$1,800'), decided('lost', '$2,600'), decided('lost', '$3,000')];
  assert.equal(priceBandSentence(thin), '');
  assert.match(priceBandSentence(thin.concat(decided('won', '$1,900'))), /you won here averaged/);
});

test('a waiting bid is not evidence either way and a figureless one cannot be', () => {
  const rows = [
    decided('won', '$1,800'), decided('won', '$2,400'),
    decided('lost', '$2,600'), decided('lost', '$3,200'),
    { name: 'still out', at: AT, amount: '$9,999' },
    { name: 'no figure', at: AT, outcome: 'lost' },
  ];
  // The two extra rows must not move either average or either edge.
  assert.equal(priceBandSentence(rows), priceBandSentence(rows.slice(0, 4)));
});

test('mixed currencies on one tool are refused rather than converted', () => {
  // This feature has no exchange rates and must never acquire any: $2,000
  // against £2,000 is not a comparison, it is a wrong answer.
  assert.equal(priceBandSentence([
    decided('won', '$1,800'), decided('won', '£1,900'),
    decided('lost', '$2,600'), decided('lost', '$3,200'),
  ]), '');
});

test('nothing to say draws nothing', () => {
  assert.equal(priceBandSentence([]), '');
  assert.equal(priceBandSentence(null), '');
  assert.equal(priceBandSentence([decided('won', '$1'), null, 'not a bid']), '');
});

test('the injected price-band helpers answer exactly as the module does', () => {
  // Same guarantee as the follow-up helpers, and the same reason: #1905 was a
  // hand-written copy of a tested function going stale in the browser while
  // every test passed. These are averages read next to a customer's name.
  const evaluated = new Function(`${BID_AMOUNT_HELPER}
${BID_PRICE_BAND_HELPERS}
    return { bidAmountValue: bidAmountValue, formatBidAmount: formatBidAmount, priceBandSentence: priceBandSentence };`)();

  for (const value of ['$1,035', '$589.38 · 13.2 h', '$1,200–$1,800', '$1,5', '-£1.20', '0']) {
    assert.deepEqual(evaluated.bidAmountValue(value), bidAmountValue(value), JSON.stringify(value));
  }
  assert.equal(evaluated.formatBidAmount('$', 1840.5), formatBidAmount('$', 1840.5));
  const rows = [
    decided('won', '$1,800'), decided('won', '$2,400'),
    decided('lost', '$2,050'), decided('lost', '$3,200'),
  ];
  assert.equal(evaluated.priceBandSentence(rows), priceBandSentence(rows));
});

// ---------------------------------------------------------------------------
// How far the winning bid actually was
// ---------------------------------------------------------------------------

/** A lost bid whose winning price the contractor heard. */
const lostTo = (amount, went) => ({ name: amount, at: AT, outcome: 'lost', amount, lostTo: went });

test('a price is read the way a person copies one off a text message', () => {
  // All four of these are what somebody types when they are transcribing a
  // figure, and refusing any of them would read as the box being broken.
  assert.equal(normalizeLostTo('1900'), '1900');
  assert.equal(normalizeLostTo('$1,900'), '1900');
  assert.equal(normalizeLostTo(' 1 900.50 '), '1900.5');
  assert.equal(normalizeLostTo(1900), '1900');

  // Canonical, so two devices that typed the same figure differently store one
  // value and a backup merge does not see a change that never happened.
  assert.equal(normalizeLostTo('01900'), '1900');
  assert.equal(normalizeLostTo('1900.00'), '1900');
});

test('anything that is not a plain positive amount is refused, not coerced', () => {
  for (const value of ['', '   ', 'about 1900', '1900-2100', '-1900', '0', '1900.005',
    '1.9e3', null, undefined, {}, NaN, Infinity, String(MAX_LOST_TO + 1)]) {
    assert.equal(normalizeLostTo(value), '', JSON.stringify(String(value)));
  }
  assert.equal(normalizeLostTo(String(MAX_LOST_TO)), String(MAX_LOST_TO));
});

test('the winning price is kept only on a bid that was actually lost', () => {
  // The record shape is the guard, not the UI: a figure carried onto a won or
  // waiting bid would be averaged against a job nobody lost.
  const fields = { a: '1' };
  assert.equal(normalizeBid({ name: 'n', at: AT, fields, outcome: 'lost', lostTo: '1900' }).lostTo,
    '1900');
  assert.equal(normalizeBid({ name: 'n', at: AT, fields, outcome: 'won', lostTo: '1900' }).lostTo,
    undefined);
  assert.equal(normalizeBid({ name: 'n', at: AT, fields, lostTo: '1900' }).lostTo, undefined);
  // And an unreadable one is absent rather than stored empty, the same rule
  // `amount` and `outcome` already follow.
  assert.ok(!('lostTo' in normalizeBid({ name: 'n', at: AT, fields, outcome: 'lost', lostTo: 'x' })));
});

test('how far over the winning price you were, in money and in percent', () => {
  // $2,400 against $2,000 and $3,600 against $3,000: $1,000 over across two
  // jobs, so $500 each on average. The percentage is of what the jobs went
  // for — $1,000 on $5,000 — because "20% over" is read as over *their* price.
  const sentence = undercutSentence([lostTo('$2,400', '2000'), lostTo('$3,600', '3000')]);
  assert.match(sentence, /^On the 2 you lost where you know the winning price, yours averaged \$500 more — 20% over\./);
  // The near miss, because a shop $400 off is deciding something different
  // from a shop $600 off.
  assert.match(sentence, /The closest was \$400 over\.$/);
});

test('losing to a dearer bid is said as loudly as losing to a cheaper one', () => {
  // The finding that stops a contractor cutting a price that was never the
  // problem — and the one a cheaper quote cannot fix.
  assert.match(
    undercutSentence([lostTo('$2,000', '2400'), lostTo('$1,800', '2000')]),
    /yours averaged \$300 under\. None of them went to a cheaper bid, so price is not what decided these\.$/,
  );
  // Mixed: over on average, but one of them was not, and that is worth saying.
  assert.match(
    undercutSentence([lostTo('$3,000', '2000'), lostTo('$1,900', '2000')]),
    /1 of them went to a bid no cheaper than yours, so price alone has not been deciding these\.$/,
  );
});

test('two lost jobs with a known price, because one is an anecdote', () => {
  assert.equal(MIN_UNDERCUT_SAMPLE, 2);
  assert.equal(undercutSentence([lostTo('$2,400', '2000')]), '');
  assert.match(undercutSentence([lostTo('$2,400', '2000'), lostTo('$3,200', '2800')]),
    /you know the winning price/);
});

test('only a lost bid with both figures counts toward the gap', () => {
  const rows = [lostTo('$2,400', '2000'), lostTo('$3,200', '2800')];
  const noise = [
    { name: 'won it', at: AT, outcome: 'won', amount: '$9,999', lostTo: '1' },
    { name: 'still out', at: AT, amount: '$9,999' },
    { name: 'no figure of mine', at: AT, outcome: 'lost', lostTo: '2000' },
    { name: 'no winning price', at: AT, outcome: 'lost', amount: '$5,000' },
    // A loss-per-unit reading is not a quote; a percentage over it is
    // arithmetic about nothing.
    { name: 'negative hero', at: AT, outcome: 'lost', amount: '-$4.20', lostTo: '2' },
    null, 'not a bid',
  ];
  assert.equal(undercutSentence(rows.concat(noise)), undercutSentence(rows));
});

test('mixed currencies are refused here too, for the same reason', () => {
  assert.equal(undercutSentence([lostTo('$2,400', '2000'), lostTo('£3,200', '2800')]), '');
});

test('nothing to compare draws nothing', () => {
  assert.equal(undercutSentence([]), '');
  assert.equal(undercutSentence(null), '');
  assert.equal(undercutSentence([lostTo('$2,400', 'x'), lostTo('$3,200', '')]), '');
});

// --- the hub's cross-tool pricing reading -----------------------------------

// `lostTo` with the slug the bid was priced on, which is what the hub carries
// and what lets this reading count the tools it spans.
const onTool = (slug, amount, went) => ({ ...lostTo(amount, went), slug });

test('how the pricing is landing, pooled across every tool', () => {
  // 20% over, 20% over, 20% over — on three different calculators, none of
  // which has enough decided bids to draw anything on its own. This is the
  // whole reason the reading exists.
  const sentence = pricingSentence([
    onTool('fence-bid-calculator', '$2,400', '2000'),
    onTool('deck-bid-calculator', '$3,600', '3000'),
    onTool('pergola-bid-calculator', '$1,200', '1000'),
  ]);
  assert.match(
    sentence,
    /^Across the 3 bids you lost on 3 tools where you know the winning price, yours averaged 20% over\./,
  );
  assert.match(sentence, /The closest was 20% over\.$/);
});

test('the mean of the percentages, never a ratio of summed money', () => {
  // The distinction that makes pooling legitimate, and these figures are
  // chosen so the two forms cannot be confused. Per-bid percentages are +100%,
  // 0% and 0%, so the mean is 33%. Summing the money first would give
  // (200 + 1000 + 1000 - 100 - 1000 - 1000) / 2100 = 5% — a different answer,
  // and the one that would be quietly adding currencies together on a book
  // that mixed them.
  assert.match(
    pricingSentence([
      onTool('a', '$200', '100'),
      onTool('b', '$1,000', '1000'),
      onTool('c', '$1,000', '1000'),
    ]),
    /yours averaged 33% over\./,
  );
});

test('percentages pool across currencies, because a percentage has no currency', () => {
  // The money readings refuse this outright and are right to: there is no rate
  // here and there must never be one. A percentage over the winning price is
  // computed inside one bid's own currency, so it carries none of that problem.
  assert.match(
    pricingSentence([
      onTool('a', '$2,400', '2000'),
      onTool('b', '£3,600', '3000'),
      onTool('c', '€1,200', '1000'),
    ]),
    /yours averaged 20% over\./,
  );
});

test('losing to a dearer bid is said as loudly here too', () => {
  assert.match(
    pricingSentence([
      onTool('a', '$1,800', '2000'),
      onTool('b', '$900', '1000'),
      onTool('c', '$2,700', '3000'),
    ]),
    /yours averaged 10% under\. None of them went to a cheaper bid, so price is not what decided these\.$/,
  );
  assert.match(
    pricingSentence([
      onTool('a', '$3,000', '2000'),
      onTool('b', '$3,000', '2000'),
      onTool('c', '$1,900', '2000'),
    ]),
    /1 of them went to a bid no cheaper than yours, so price alone has not been deciding these\.$/,
  );
});

test('a gap that rounds to nothing is not reported as parity', () => {
  // 0.4% over is a real gap. "0% over" would read as measured parity, so it is
  // said as the bound it actually is.
  const sentence = pricingSentence([
    onTool('a', '$1,004', '1000'),
    onTool('b', '$1,004', '1000'),
    onTool('c', '$1,004', '1000'),
  ]);
  assert.match(sentence, /yours came within 1% of what they went for\./);
  assert.match(sentence, /The closest was within 1% of it\.$/);
});

test('one tool is not claimed as breadth it does not have', () => {
  // At a single tool this is the same book undercutSentence already reports in
  // money on that tool's own page, so the sentence does not say "on 1 tool".
  const sentence = pricingSentence([
    onTool('fence-bid-calculator', '$2,400', '2000'),
    onTool('fence-bid-calculator', '$3,600', '3000'),
    onTool('fence-bid-calculator', '$1,200', '1000'),
  ]);
  assert.match(sentence, /^Across the 3 bids you lost where you know the winning price,/);
  assert.doesNotMatch(sentence, /on 1 tools?/);
});

test('three lost jobs with a known price, one more than the single-tool reading', () => {
  assert.equal(MIN_CROSS_TOOL_SAMPLE, 3);
  assert.equal(MIN_CROSS_TOOL_SAMPLE, MIN_UNDERCUT_SAMPLE + 1);
  assert.equal(pricingSentence([onTool('a', '$2,400', '2000'), onTool('b', '$3,600', '3000')]), '');
});

test('only a lost bid with both figures counts toward the pooled reading', () => {
  const rows = [onTool('a', '$2,400', '2000'), onTool('b', '$3,200', '2800'),
    onTool('c', '$1,200', '1000')];
  const noise = [
    { name: 'won it', at: AT, slug: 'd', outcome: 'won', amount: '$9,999', lostTo: '1' },
    { name: 'still out', at: AT, slug: 'e', amount: '$9,999' },
    { name: 'no figure of mine', at: AT, slug: 'f', outcome: 'lost', lostTo: '2000' },
    { name: 'no winning price', at: AT, slug: 'g', outcome: 'lost', amount: '$5,000' },
    { name: 'negative hero', at: AT, slug: 'h', outcome: 'lost', amount: '-$4.20', lostTo: '2' },
    null, 'not a bid',
  ];
  // The noise carries five slugs of its own; none of them may reach the count.
  const sentence = pricingSentence(rows.concat(noise));
  assert.equal(sentence, pricingSentence(rows));
  assert.match(sentence, /on 3 tools/);
});

test('the pooled reading draws nothing when there is nothing to say', () => {
  assert.equal(pricingSentence([]), '');
  assert.equal(pricingSentence(null), '');
  assert.equal(
    pricingSentence([onTool('a', '$2,400', 'x'), onTool('b', '$3,200', ''),
      onTool('c', '$1,200', '0')]),
    '',
  );
});

// --- the hub's cross-tool win rate -----------------------------------------

// A decided bid and nothing else: no figure, no currency, no winning price.
// That absence is the point of these tests — this is the one reading in the
// portfolio that draws off a book carrying none of it.
const settled = (slug, outcome, label) => ({
  name: slug + ' ' + outcome, at: AT, slug, outcome, ...(label ? { label } : {}),
});
const runOf = (slug, won, lost, label) => [
  ...Array.from({ length: won }, () => settled(slug, 'won', label)),
  ...Array.from({ length: lost }, () => settled(slug, 'lost', label)),
];

test('how often the quotes land, counted across every tool', () => {
  // Five decided bids on three calculators, not one of which carries a figure.
  // priceBandSentence, undercutSentence and pricingSentence all draw nothing
  // on this book; this is the whole reason the reading exists.
  const sentence = winRateSentence([
    ...runOf('fence-bid-calculator', 1, 1),
    ...runOf('deck-bid-calculator', 1, 1),
    ...runOf('pergola-bid-calculator', 0, 1),
  ]);
  assert.match(sentence, /^You have won 2 of 5 decided bids — 40%, across 3 tools\./);
});

test('one tool is not claimed as breadth it does not have', () => {
  // The same restraint pricingSentence applies: at a single tool this is a
  // reading about one trade, and "across 1 tools" would be both wrong and a
  // claim of a span the book does not have.
  const sentence = winRateSentence(runOf('fence-bid-calculator', 2, 3));
  assert.match(sentence, /^You have won 2 of 5 decided bids — 40%\./);
  assert.doesNotMatch(sentence, /across 1 tools?/);
});

test('the rate needs no figure, no winning price and no single currency', () => {
  // Each of these bids would be refused by every money reading here: two carry
  // no amount at all, and the two that do are in different currencies, which
  // priceBandSentence and undercutSentence both reject outright.
  const sentence = winRateSentence([
    { name: 'a', at: AT, slug: 'a', outcome: 'won', amount: '$2,400' },
    { name: 'b', at: AT, slug: 'b', outcome: 'lost', amount: '€3,600' },
    settled('c', 'won'), settled('d', 'lost'), settled('e', 'lost'),
  ]);
  assert.match(sentence, /^You have won 2 of 5 decided bids — 40%, across 5 tools\./);
});

test('the trade the rate is actually coming from is named', () => {
  // The finding no single tool can produce, and the one that changes what
  // someone does on Monday. 4 of 5 against 1 of 6 is a 63-point gap.
  const sentence = winRateSentence([
    ...runOf('fence-bid-calculator', 4, 1, 'Fence Bid Calculator'),
    ...runOf('deck-bid-calculator', 1, 5, 'Deck Bid Calculator'),
  ]);
  assert.match(sentence, /^You have won 5 of 11 decided bids — 45%, across 2 tools\./);
  assert.match(
    sentence,
    /Fence Bid Calculator is winning 4 of 5; Deck Bid Calculator, 1 of 6\. That gap sits in one trade rather than across your prices\.$/,
  );
});

test('a gap of one bid is not a trade, so it is not named as one', () => {
  // 3 of 4 against 2 of 4 is 25 points — one job of difference, which is what a
  // single unusual customer looks like. The restraint sentence is what a
  // contractor gets instead, and it is the one that stops the across-the-board
  // price cut.
  const sentence = winRateSentence([
    ...runOf('a', 3, 1, 'A'), ...runOf('b', 2, 2, 'B'),
  ]);
  assert.doesNotMatch(sentence, /is winning/);
  assert.match(sentence, /A win rate moves with which jobs you choose to quote as much as with what you charge, so this is where to start looking rather than a verdict on your prices\.$/);
});

test('a tool below the floor is counted in the rate but never named', () => {
  // 3 of 3 is a 100% tool, and it would top the ranking if it were eligible.
  // It is not: on three bids the achievable rates are thirds, so putting that
  // trade forward would rest the finding on one job.
  const sentence = winRateSentence([
    ...runOf('thin', 3, 0, 'Thin Tool'),
    ...runOf('a', 3, 1, 'A'), ...runOf('b', 0, 4, 'B'),
  ]);
  assert.match(sentence, /^You have won 6 of 11 decided bids — 55%, across 3 tools\./);
  assert.doesNotMatch(sentence, /Thin Tool/);
  assert.match(sentence, /A is winning 3 of 4; B, 0 of 4\./);
});

test('the tool is named as the contractor knows it, falling back to the slug', () => {
  // The label comes off the hub card the row was matched to. A row that reached
  // the reading without one still has to produce a sentence, and the slug is
  // the only name left.
  assert.match(
    winRateSentence([...runOf('fence-bid-calculator', 4, 0), ...runOf('deck-bid-calculator', 0, 4)]),
    /fence-bid-calculator is winning 4 of 4; deck-bid-calculator, 0 of 4\./,
  );
});

test('two tools that have gone the same way cannot swap places between renders', () => {
  const book = [...runOf('b-tool', 4, 0, 'B'), ...runOf('a-tool', 4, 0, 'A'),
    ...runOf('z-tool', 0, 4, 'Z')];
  const once = winRateSentence(book);
  assert.equal(once, winRateSentence([...book].reverse()));
  // Ties broken by slug, so the 100% pair reports the alphabetically first.
  assert.match(once, /^You have won 8 of 12 decided bids — 67%, across 3 tools\./);
  assert.match(once, /A is winning 4 of 4; Z, 0 of 4\./);
});

test('only a decided bid counts toward the rate', () => {
  const book = runOf('a', 2, 3);
  const noise = [
    { name: 'still out', at: AT, slug: 'waiting-tool', amount: '$9,999' },
    { name: 'unknown state', at: AT, slug: 'odd-tool', outcome: 'maybe' },
    null, 'not a bid', 7,
  ];
  // The noise carries two slugs of its own; neither may reach the tool count.
  assert.equal(winRateSentence(book.concat(noise)), winRateSentence(book));
  assert.doesNotMatch(winRateSentence(book.concat(noise)), /across/);
});

test('five decided bids before a rate is stated at all', () => {
  assert.equal(MIN_WIN_RATE_SAMPLE, 5);
  assert.equal(winRateSentence(runOf('a', 2, 2)), '');
  assert.match(winRateSentence(runOf('a', 2, 3)), /^You have won 2 of 5/);
});

test('the win rate draws nothing when there is nothing to say', () => {
  assert.equal(winRateSentence([]), '');
  assert.equal(winRateSentence(null), '');
  assert.equal(winRateSentence(undefined), '');
  // Five bids, none of them decided.
  assert.equal(
    winRateSentence(Array.from({ length: 5 }, () => ({ name: 'x', at: AT, slug: 'a' }))),
    '',
  );
});

test('the win rate never states a rate to aim for', () => {
  // There is no correct win rate, and a tool that printed one would be
  // inventing the number its user came here to avoid guessing.
  for (const book of [
    runOf('a', 5, 0), runOf('a', 0, 5), runOf('a', 2, 3),
    [...runOf('a', 4, 0, 'A'), ...runOf('b', 0, 4, 'B')],
  ]) {
    const sentence = winRateSentence(book);
    assert.doesNotMatch(sentence, /should|aim|target|too (high|low)|healthy|ideal/i);
  }
});

test('the injected win-rate helper answers exactly as the module does', () => {
  // The same guarantee the gap helpers carry: the hub must run the tested body,
  // not a paraphrase of it.
  const evaluated = new Function(`${BID_AMOUNT_HELPER}
${BID_PRICING_HELPERS}
    return winRateSentence;`)();

  for (const book of [
    [], runOf('a', 2, 2), runOf('a', 2, 3),
    [...runOf('a', 4, 1, 'A'), ...runOf('b', 1, 5, 'B')],
    [...runOf('a', 3, 1, 'A'), ...runOf('b', 2, 2, 'B')],
  ]) {
    assert.equal(evaluated(book), winRateSentence(book), JSON.stringify(book.length));
  }
});

test('the injected gap helpers answer exactly as the module does', () => {
  // The guarantee #1905 exists to enforce, extended to the two functions the
  // browser now needs: the page must run the tested body, not a paraphrase.
  const evaluated = new Function(`${BID_AMOUNT_HELPER}
${BID_PRICE_BAND_HELPERS}
    return { normalizeLostTo: normalizeLostTo, undercutSentence: undercutSentence };`)();

  for (const value of ['1900', '$1,900', ' 1 900.50 ', '01900', 'about 1900', '', '-1']) {
    assert.equal(evaluated.normalizeLostTo(value), normalizeLostTo(value), JSON.stringify(value));
  }
  const rows = [lostTo('$2,400', '2000'), lostTo('$3,200', '2800'), lostTo('$1,900', '2000')];
  assert.equal(evaluated.undercutSentence(rows), undercutSentence(rows));
});

test('the box is on lost rows only, and only where there is a figure to compare', () => {
  // Same gate as the band above: on a page that captures no hero number the
  // gap can never be drawn, so the box would be somewhere to type a number
  // nothing reads.
  const script = module_();
  assert.match(script, /var gapEl = el\('pf-jobs-gap'\);/);
  assert.match(script, /if \(outcome === 'lost' && gapEl\) \{/);
  assert.match(injectSavedBids(page(inputs(4) + hero('price')), 'fence-bid-calculator'),
    /id="pf-jobs-gap"/);
  assert.doesNotMatch(injectSavedBids(page(inputs(4)), 'cleaning-dilution-calculator'),
    /id="pf-jobs-gap"/);
});

test('the band is drawn only where the tool has a figure to compare', () => {
  const withHero = injectSavedBids(page(inputs(4) + hero('price')), 'fence-bid-calculator');
  assert.match(withHero, /id="pf-jobs-band"/);
  assert.match(withHero, /where your price tips/);

  // A tool that saves no amounts could never produce a sentence, so it gets
  // neither the paragraph nor the prose that promises one. The code is shared
  // now, so the element is what gates it — which is what the script checks.
  const without = injectSavedBids(page(inputs(4)), 'cleaning-dilution-calculator');
  assert.doesNotMatch(without, /id="pf-jobs-band"/);
  assert.doesNotMatch(without, /where your price tips/);
  assert.match(module_(), /var band = el\('pf-jobs-band'\);/);
});

test('the feature list claims the comparison only on the pages that can draw it', () => {
  // #1894 in both directions: a feature that never names itself is invisible to
  // search, and a page that names one it does not have is making it up.
  const list = '<script type="application/ld+json">{"featureList":"prices a fence"}</script>';
  assert.match(
    injectSavedBids(page(inputs(4) + hero('price'), list), 'fence-bid-calculator'),
    new RegExp(PRICE_BAND_CLAUSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  const without = injectSavedBids(page(inputs(4), list), 'cleaning-dilution-calculator');
  assert.match(without, /saved bids you can name/);
  assert.doesNotMatch(without, /have averaged against the ones you lost/);
});

// ---------------------------------------------------------------------------
// What the won jobs actually kept
// ---------------------------------------------------------------------------

/** A won job with the delivered cost the contractor entered against it. */
const finished = (amount, cost) => ({ name: amount, at: AT, outcome: 'won', amount, cost });

test('a delivered cost is read on the same rules as a winning price', () => {
  // The alias is the point: one validation, so a figure that is acceptable in
  // one box cannot be refused in the other.
  for (const value of ['1900', '$1,900', ' 1 900.50 ', 1900, '01900', '1900.00',
    '', 'about 1900', '-1900', '0', '1.9e3', null, undefined, {}, NaN,
    String(MAX_LOST_TO + 1)]) {
    assert.equal(normalizeJobCost(value), normalizeLostTo(value), JSON.stringify(String(value)));
  }
  assert.equal(normalizeJobCost('$1,900'), '1900');
});

test('a delivered cost is kept only on a bid that was actually won', () => {
  // The mirror of the `lostTo` guard, and the reason is sharper here: a cost
  // left on a bid the contractor has just said they lost would be divided by
  // that bid's own price and reported as a margin on a job never done.
  const fields = { a: '1' };
  assert.equal(normalizeBid({ name: 'n', at: AT, fields, outcome: 'won', cost: '1900' }).cost,
    '1900');
  assert.equal(normalizeBid({ name: 'n', at: AT, fields, outcome: 'lost', cost: '1900' }).cost,
    undefined);
  assert.equal(normalizeBid({ name: 'n', at: AT, fields, cost: '1900' }).cost, undefined);
  assert.ok(!('cost' in normalizeBid({ name: 'n', at: AT, fields, outcome: 'won', cost: 'x' })));
  // The two figures do not collide: a record carrying both keeps only the one
  // its outcome allows.
  const won = normalizeBid({ name: 'n', at: AT, fields, outcome: 'won', cost: '900', lostTo: '80' });
  assert.equal(won.cost, '900');
  assert.equal(won.lostTo, undefined);
});

test('what the finished jobs kept, pooled rather than averaged', () => {
  // $1,000 + $2,000 + $3,000 charged against $800 + $1,600 + $2,700 spent:
  // $6,000 in, $5,100 out, $900 kept — 15% of what was charged.
  const sentence = marginSentence([
    finished('$1,000', '800'), finished('$2,000', '1600'), finished('$3,000', '2700'),
  ]);
  assert.match(sentence, /^The 3 you finished here were priced at \$6,000 and cost you \$5,100 — you kept \$900, 15% of what you charged\./);
});

test('the pooled share is not the mean of the per-job shares', () => {
  // The case the choice was made for: a small job at 40% and two big ones at
  // 4%. The mean of the three shares is 16%; what actually went in the bank is
  // $160 + $480 + $480 on $12,400 — 9%. A reading that said 16% would flatter
  // a book whose profitable jobs are its smallest, which is the common shape.
  const sentence = marginSentence([
    finished('$400', '240'), finished('$6,000', '5520'), finished('$6,000', '5520'),
  ]);
  assert.match(sentence, /you kept \$1,120, 9% of what you charged/);
  assert.doesNotMatch(sentence, /16%/);
});

test('a job worked at a loss is named rather than averaged away', () => {
  // -$300 on one job inside two healthy ones still pools positive, which is
  // exactly how a pooled figure buries the finding that matters most.
  const sentence = marginSentence([
    finished('$5,000', '4000'), finished('$5,000', '4000'), finished('$1,000', '1300'),
  ]);
  assert.match(sentence, /you kept \$1,700, 15% of what you charged\./);
  assert.match(sentence, /One of them cost more than it was priced at, by \$300\. That job is inside the figure above rather than beside it\.$/);
});

test('more than one loss is counted, and the worst of them is the one quoted', () => {
  // $8,000 charged against $8,200 spent, so the whole book is under water and
  // the pooled figure says so rather than clamping at zero.
  const sentence = marginSentence([
    finished('$5,000', '4000'), finished('$1,000', '1300'), finished('$2,000', '2900'),
  ]);
  assert.match(sentence, /you kept -\$200, -2% of what you charged\./);
  assert.match(sentence, /2 of them cost more than they were priced at, the worst by \$900\./);
});

test('the loss quoted is the deepest in money, not the deepest in percent', () => {
  // The two disagree here and the distinction is the point: the $100 job is
  // 100% under and the $10,000 job is 5% under, and it is the $500 hole a
  // contractor needs pointed at. Quoting the worst *share* would have said
  // "$100" while the larger loss went unmentioned.
  const sentence = marginSentence([
    finished('$100', '200'), finished('$10,000', '10500'), finished('$4,000', '3000'),
  ]);
  assert.match(sentence, /2 of them cost more than they were priced at, the worst by \$500\./);
});

test('a wide spread is named, because the average is then nobody’s job', () => {
  // 40%, 20% and 5%: no loss, but a 35-point spread, so quoting the pooled
  // figure alone would send someone to re-price a book whose top end is fine.
  const sentence = marginSentence([
    finished('$1,000', '600'), finished('$1,000', '800'), finished('$1,000', '950'),
  ]);
  assert.match(sentence, /They run from 5% to 40%, so the figure above is not what any one of these jobs did — the low end is the one to go back over\.$/);
});

test('a tight book gets the limit of the reading instead of a finding', () => {
  // 20%, 18% and 16% — inside MARGIN_SPREAD_POINTS and nothing under water, so
  // there is no finding to report and the honest half is the caveat.
  const sentence = marginSentence([
    finished('$1,000', '800'), finished('$1,000', '820'), finished('$1,000', '840'),
  ]);
  assert.match(sentence, /only as complete as your own job costing — your own hours are the ones most often left out\.$/);
  assert.ok(MARGIN_SPREAD_POINTS > 4);
});

test('the margin reading never prints a figure to aim for', () => {
  // The same guard `winRateSentence` carries. There is no correct margin, and
  // a tool that printed one would be inventing the number its user came here to
  // stop guessing at. Every branch, including the two the others do not reach.
  const books = [
    [finished('$1,000', '800'), finished('$2,000', '1600'), finished('$3,000', '2700')],
    [finished('$5,000', '4000'), finished('$5,000', '4000'), finished('$1,000', '1300')],
    [finished('$1,000', '600'), finished('$1,000', '800'), finished('$1,000', '950')],
    [finished('$1,000', '800'), finished('$1,000', '820'), finished('$1,000', '840')],
  ];
  for (const book of books) {
    const sentence = marginSentence(book);
    assert.notEqual(sentence, '');
    assert.doesNotMatch(sentence, /should|aim|target|too high|too low|healthy|ideal|industry/i);
  }
});

test('the margin is drawn only from won jobs that carry both halves', () => {
  const rows = [finished('$1,000', '800'), finished('$2,000', '1600'), finished('$3,000', '2700')];
  const pooled = marginSentence(rows);
  // None of these adds anything, and each is a record the built site produces.
  for (const noise of [
    // Lost, however much it cost to bid.
    { name: 'lost it', at: AT, outcome: 'lost', amount: '$9,999', cost: '1' },
    // Won but never costed — the common case, and it must not count as $0.
    { name: 'uncosted', at: AT, outcome: 'won', amount: '$9,999' },
    // Costed but priced on a page with no hero figure.
    { name: 'no figure', at: AT, outcome: 'won', cost: '500' },
    // A hero figure that is a saving or a difference rather than a price.
    { name: 'negative hero', at: AT, outcome: 'won', amount: '-$4.20', cost: '2' },
    // Still waiting on an answer.
    { name: 'waiting', at: AT, amount: '$9,999', cost: '1' },
    // An unreadable cost is not a cost of nothing.
    { name: 'garbled', at: AT, outcome: 'won', amount: '$9,999', cost: 'about 500' },
  ]) {
    assert.equal(marginSentence([...rows, noise]), pooled, noise.name);
  }
});

test('the margin is refused below its sample floor and on mixed currencies', () => {
  assert.equal(MIN_MARGIN_SAMPLE, 3);
  assert.equal(marginSentence([finished('$1,000', '800'), finished('$2,000', '1600')]), '');
  assert.equal(marginSentence([]), '');
  assert.equal(marginSentence(null), '');
  // Refused outright rather than converted: this feature has no exchange rates.
  assert.equal(marginSentence([
    finished('$1,000', '800'), finished('$2,000', '1600'), finished('£3,000', '2700'),
  ]), '');
});

test('the cost box and the margin ride on the same gate as the price band', () => {
  const withHero = injectSavedBids(page(inputs(4) + hero('price')), 'fence-bid-calculator');
  assert.match(withHero, /id="pf-jobs-margin"/);
  assert.match(withHero, /worth winning/);

  // A tool that stores no amounts can never divide a cost by one, so it gets
  // neither the paragraph nor a box to type into.
  const without = injectSavedBids(page(inputs(4)), 'cleaning-dilution-calculator');
  assert.doesNotMatch(without, /id="pf-jobs-margin"/);
  assert.doesNotMatch(without, /worth winning/);

  // The script's own guard is the element, the same as the band's, and the
  // row's box is gated on the gap element for the same reason.
  const script = module_();
  assert.match(script, /var marginEl = el\('pf-jobs-margin'\);/);
  assert.match(script, /if \(outcome === 'won' && gapEl\)/);
});

// --- why the money reading is quiet, and what would make it speak -----------

// A won bid the panel can read a price off, with no delivered cost — the
// common case, and the one the whole money half of this feature is gated on.
const uncosted = (amount) => ({ name: amount, at: AT, outcome: 'won', amount });

test('an uncosted book is told what it is missing and what it would buy', () => {
  // Three wins, none costed. marginSentence draws nothing here and, before
  // this reading, said nothing about why — the panel simply had one paragraph
  // fewer than a costed book, with no way to tell that was a choice.
  const sentence = costGapSentence([uncosted('$1,000'), uncosted('$2,000'), uncosted('$3,000')]);
  assert.match(sentence,
    /^None of the 3 jobs you have won here carry what they came to once they were delivered\./);
  assert.match(sentence, /Put that figure in the box beside 3 more of them/);
  assert.match(sentence, /the one question every reading above it leaves open/);
});

test('a partly costed book counts only what is still needed', () => {
  const sentence = costGapSentence([
    finished('$1,000', '800'), finished('$2,000', '1600'), uncosted('$3,000'),
  ]);
  assert.match(sentence,
    /^Only 2 of the 3 jobs you have won here carry what they came to once they were delivered\./);
  // One, not three: the ask is what the reading actually needs.
  assert.match(sentence, /the box beside one more of them/);
});

test('a drawing margin is told how much of the book it cannot see', () => {
  // Four costed jobs pool to a figure a reader will take for the whole book;
  // five uncosted wins sit in the same list. marginSentence's honest half says
  // the costs are only as good as the job costing. This says how many jobs are
  // not in them at all, which is the half a count can settle and prose cannot.
  const sentence = costGapSentence([
    finished('$1,000', '800'), finished('$2,000', '1600'), finished('$3,000', '2700'),
    finished('$4,000', '3000'),
    uncosted('$5,000'), uncosted('$6,000'), uncosted('$7,000'), uncosted('$8,000'),
    uncosted('$9,000'),
  ]);
  assert.match(sentence, /^Of the 9 jobs you have won here, 4 carry what they came to and 5 do not\./);
  assert.match(sentence, /missing from it rather than averaged into it/);
  assert.match(sentence, /describes part of your book and not all of it\.$/);
});

test('a fully costed book is quiet, which is what makes this a prompt and not a banner', () => {
  assert.equal(costGapSentence([
    finished('$1,000', '800'), finished('$2,000', '1600'), finished('$3,000', '2700'),
  ]), '');
  // And a book that could never reach the floor is quiet too: promising a
  // reading two more entries cannot produce would be worse than saying nothing.
  assert.equal(MIN_MARGIN_SAMPLE, 3);
  assert.equal(costGapSentence([uncosted('$1,000'), uncosted('$2,000')]), '');
  assert.equal(costGapSentence([]), '');
  assert.equal(costGapSentence(null), '');
  assert.equal(costGapSentence(undefined), '');
});

test('it counts only won jobs whose figure the panel can actually read', () => {
  const rows = [uncosted('$1,000'), uncosted('$2,000'), uncosted('$3,000')];
  const drawn = costGapSentence(rows);
  for (const noise of [
    // Lost, however much it cost to bid — a cost box never appears on it.
    { name: 'lost it', at: AT, outcome: 'lost', amount: '$9,999', cost: '1' },
    // Won on a page with no hero figure: no price to take a cost away from, so
    // asking for one would be asking for a number nothing reads.
    { name: 'no figure', at: AT, outcome: 'won', cost: '500' },
    { name: 'no figure either', at: AT, outcome: 'won' },
    // A hero figure that is a saving or a difference rather than a price.
    { name: 'negative hero', at: AT, outcome: 'won', amount: '-$4.20' },
    // Still waiting on an answer, so there is no delivered job to cost.
    { name: 'waiting', at: AT, amount: '$9,999' },
    // A garbled saved list: a stranger's localStorage can hold anything.
    null,
    'not a bid',
  ]) {
    assert.equal(costGapSentence([...rows, noise]), drawn, noise && noise.name);
  }
  // An unreadable cost is not a cost: that row still counts as uncosted, which
  // is the honest reading of a box holding "about 500".
  assert.match(
    costGapSentence([...rows, { name: 'garbled', at: AT, outcome: 'won', amount: '$500', cost: 'about 500' }]),
    /None of the 4 jobs/,
  );
});

test('the cost-gap reading never nags and never states a figure to aim for', () => {
  for (const book of [
    [uncosted('$1,000'), uncosted('$2,000'), uncosted('$3,000')],
    [finished('$1,000', '800'), finished('$2,000', '1600'), uncosted('$3,000')],
    [finished('$1,000', '800'), finished('$2,000', '1600'), finished('$3,000', '2700'),
      uncosted('$4,000')],
  ]) {
    const sentence = costGapSentence(book);
    assert.notEqual(sentence, '');
    assert.doesNotMatch(sentence, /should|aim|target|too (high|low)|healthy|ideal|industry/i);
    // No money figure: this reading counts jobs, it does not price them, so it
    // is safe on a book whose rows are in more than one currency.
    assert.doesNotMatch(sentence, /[$£€]/);
  }
});

test('the injected cost-gap helper answers exactly as the module does', () => {
  const evaluated = new Function(`${BID_AMOUNT_HELPER}
${BID_PRICE_BAND_HELPERS}
    return costGapSentence;`)();

  for (const book of [
    [], null,
    [uncosted('$1,000'), uncosted('$2,000')],
    [uncosted('$1,000'), uncosted('$2,000'), uncosted('$3,000')],
    [finished('$1,000', '800'), finished('$2,000', '1600'), uncosted('$3,000')],
    [finished('$1,000', '800'), finished('$2,000', '1600'), finished('$3,000', '2700')],
    [finished('$1,000', '800'), finished('$2,000', '1600'), finished('$3,000', '2700'),
      uncosted('$4,000'), uncosted('£5,000')],
  ]) {
    assert.equal(evaluated(book), costGapSentence(book), JSON.stringify(book && book.length));
  }
});

test('the cost-gap line rides on the same gate as the margin it is about', () => {
  const withHero = injectSavedBids(page(inputs(4) + hero('price')), 'fence-bid-calculator');
  assert.match(withHero, /id="pf-jobs-costgap"/);
  // Below the margin line: in the branch that fires while that line is drawing
  // it says what the line does not cover, and a caveat above its claim is not
  // a caveat.
  assert.ok(withHero.indexOf('id="pf-jobs-costgap"') > withHero.indexOf('id="pf-jobs-margin"'));
  assert.match(withHero, /still missing that figure, rather than going quiet about it/);

  const without = injectSavedBids(page(inputs(4)), 'cleaning-dilution-calculator');
  assert.doesNotMatch(without, /id="pf-jobs-costgap"/);

  const script = module_();
  assert.match(script, /var costGapEl = el\('pf-jobs-costgap'\);/);
  assert.match(script, /var costGap = costGapSentence\(list\);/);
  assert.match(script, /bump\('bid_cost_gap_shown'\)/);
  assert.ok(!/bump\('bid_cost_gap_shown:' ?\+/.test(script), 'the event names nothing');
});

test('the cost box is wired for change and for Enter, like the price box', () => {
  const script = module_();
  // Enter must be intercepted: these boxes sit inside the page's own form, and
  // a submit would reload the page and lose the bid being costed.
  assert.match(script, /if \(onCost\) setCost\(index, field\.value\); else setLostTo/);
  assert.match(script, /else if \(cost\) setCost\(index, field\.value\);/);
  // Clearing the decision clears the figure that belonged to it, both ways.
  assert.match(script, /if \(value !== 'won'\) delete bid\.cost;/);
  assert.match(script, /if \(value !== 'lost'\) delete bid\.lostTo;/);
});

// ---------------------------------------------------------------------------
// Which of the waiting bids have gone quiet
// ---------------------------------------------------------------------------

const day = (n) => new Date(ms(AT) + n * 86400000).toISOString();
const answered = (days, outcome = 'won') =>
  ({ name: 'j' + days, at: AT, outcome, decidedAt: day(days) });
const waiting = (agoDays) =>
  ({ name: 'w' + agoDays, at: new Date(NOW - agoDays * 86400000).toISOString() });

test('a bid that has been answered knows how long that took', () => {
  assert.equal(bidResponseDays(answered(6)), 6);
  assert.equal(bidResponseDays(answered(0, 'lost')), 0);
  // Still waiting: there is no answer to have taken any time.
  assert.equal(bidResponseDays(waiting(19)), null);
  // Decided before decidedAt was stored. It does not count rather than
  // counting as zero, which would drag the low end of the range to nothing.
  assert.equal(bidResponseDays({ name: 'old', at: AT, outcome: 'won' }), null);
  assert.equal(bidResponseDays(null), null);
});

test('a clock that ran backwards cannot report an answer before the quote', () => {
  assert.equal(bidResponseDays({ name: 'x', at: AT, outcome: 'won', decidedAt: day(-3) }), 0);
});

test('the panel reports the spread of what actually happened, not a prediction', () => {
  // A spread, never an average: an average invites "so I will hear on
  // Thursday", which nothing here can know.
  const sentence = chaseSentence([answered(2), answered(9), answered(5)], NOW);
  assert.match(sentence, /^The 3 bids you have heard back on came back in 2 to 9 days\.$/);
});

test('and names how many quotes have outlived every answer it has seen', () => {
  // 19 days means nothing on its own. 19 days when every customer who ever
  // answered did so inside 9 is the whole signal.
  const sentence = chaseSentence(
    [answered(2), answered(9), answered(5), waiting(19), waiting(30), waiting(3)], NOW);
  assert.match(sentence, /came back in 2 to 9 days\. 2 still waiting have been out longer than that\.$/);
});

test('one overdue bid is not two', () => {
  assert.match(
    chaseSentence([answered(1), answered(2), answered(3), waiting(9)], NOW),
    /1 still waiting has been out longer than that\.$/);
});

test('nothing overdue is the happy case and says nothing extra', () => {
  const sentence = chaseSentence([answered(4), answered(6), answered(8), waiting(2)], NOW);
  assert.match(sentence, /came back in 4 to 8 days\.$/);
});

test('an identical run of answers is not written as a range of one number', () => {
  assert.match(chaseSentence([answered(4), answered(4), answered(4)], NOW),
    /came back in 4 days\.$/);
  assert.match(chaseSentence([answered(1), answered(1), answered(1)], NOW),
    /came back in 1 day\.$/);
  assert.match(chaseSentence([answered(0), answered(0), answered(0)], NOW),
    /came back the same day\.$/);
});

test('three answers, because a range drawn from two points is just the two points', () => {
  assert.equal(MIN_RESPONSE_SAMPLE, 3);
  const two = [answered(2), answered(9), waiting(30)];
  assert.equal(chaseSentence(two, NOW), '');
  assert.match(chaseSentence(two.concat(answered(5)), NOW), /you have heard back on/);
});

test('bids decided before decidedAt existed do not corrupt the window', () => {
  // They are simply not part of it. Counting them as same-day answers would
  // report "came back in 0 to 9 days" and make nothing ever look overdue.
  const legacy = { name: 'old', at: AT, outcome: 'won' };
  assert.equal(
    chaseSentence([answered(4), answered(6), answered(8), legacy, waiting(20)], NOW),
    chaseSentence([answered(4), answered(6), answered(8), waiting(20)], NOW));
});

test('nothing to say draws nothing', () => {
  assert.equal(chaseSentence([], NOW), '');
  assert.equal(chaseSentence(null, NOW), '');
  assert.equal(chaseSentence([waiting(9), null, 'not a bid'], NOW), '');
});

// ---------------------------------------------------------------------------
// The window as a value, so the rows can say which quotes the sentence means
// ---------------------------------------------------------------------------

test('the response window is the spread the sentence is written from', () => {
  assert.deepEqual(responseWindow([answered(2), answered(9), answered(5)]),
    { answered: 3, low: 2, high: 9 });
});

test('the window is null below the sample, so nothing is marked on a guess', () => {
  // The same threshold the sentence applies, and for the same reason: a range
  // drawn from two points is just the two points. A caller below it must mark
  // nothing rather than fall back to a rule of thumb this feature does not
  // carry.
  assert.equal(responseWindow([answered(2), answered(9)]), null);
  assert.equal(responseWindow([]), null);
  assert.equal(responseWindow(null), null);
  // Bids decided before decidedAt was stored do not count toward it, exactly
  // as they do not count toward the sentence.
  assert.equal(responseWindow([answered(4), answered(6), { name: 'old', at: AT, outcome: 'won' }]),
    null);
});

test('a quote is quiet once it has outlived every answer, and not before', () => {
  const seen = responseWindow([answered(2), answered(9), answered(5)]);
  assert.equal(isQuietBid(waiting(19), seen, NOW), true);
  assert.equal(isQuietBid(waiting(3), seen, NOW), false);
  // Strictly longer, never equal: a bid out exactly as long as the slowest
  // reply this contractor ever got has not yet outlived it, and the sentence
  // counts it the same way.
  assert.equal(isQuietBid(waiting(9), seen, NOW), false);
  assert.equal(isQuietBid(waiting(10), seen, NOW), true);
});

test('a decided bid is never quiet, whatever its age', () => {
  const seen = responseWindow([answered(2), answered(9), answered(5)]);
  assert.equal(isQuietBid(answered(2), seen, NOW), false);
  assert.equal(isQuietBid({ name: 'l', at: day(-99), outcome: 'lost' }, seen, NOW), false);
});

test('no window marks nothing, and junk in the store marks nothing', () => {
  assert.equal(isQuietBid(waiting(400), null, NOW), false);
  const seen = responseWindow([answered(2), answered(9), answered(5)]);
  assert.equal(isQuietBid(null, seen, NOW), false);
  assert.equal(isQuietBid('not a bid', seen, NOW), false);
  // No readable date is not an overdue quote — the row simply cannot be judged.
  assert.equal(isQuietBid({ name: 'x', at: 'whenever' }, seen, NOW), false);
});

test('the sentence counts exactly the bids isQuietBid marks', () => {
  // The count in the paragraph and the marks on the rows are one value read
  // twice. If these could disagree the page would say "2 have gone quiet" over
  // a list with three tags on it.
  const bids = [answered(2), answered(9), answered(5),
    waiting(19), waiting(30), waiting(3), waiting(9)];
  const seen = responseWindow(bids);
  const marked = bids.filter((bid) => isQuietBid(bid, seen, NOW)).length;
  assert.equal(marked, 2);
  assert.match(chaseSentence(bids, NOW), new RegExp(marked + ' still waiting have been out longer'));
});

test('the chase line ships on every page that keeps bids, figure or no figure', () => {
  // Unlike the price band, this needs no headline figure — only timestamps,
  // which every bid has. It is one shared file now, so it costs one copy.
  for (const slug of ['fence-bid-calculator', 'cleaning-dilution-calculator']) {
    assert.match(injectSavedBids(page(inputs(4)), slug), /id="pf-jobs-chase"/);
  }
  assert.match(module_(), /var chaseSentence =/);
  assert.match(module_(), /var bidResponseDays =/);
});

test('the injected chase helpers answer exactly as the module does', () => {
  const evaluated = new Function(`${BID_FOLLOW_UP_HELPERS}
    return { chaseSentence: chaseSentence, bidResponseDays: bidResponseDays,
             responseWindow: responseWindow, isQuietBid: isQuietBid };`)();
  const rows = [answered(2), answered(9), answered(5), waiting(19), waiting(3)];
  assert.equal(evaluated.chaseSentence(rows, NOW), chaseSentence(rows, NOW));
  assert.equal(evaluated.bidResponseDays(answered(6)), bidResponseDays(answered(6)));
  // The two the renderers call directly. Embedded by toString like the rest,
  // so the browser marks the rows the tested function marks.
  assert.deepEqual(evaluated.responseWindow(rows), responseWindow(rows));
  const seen = responseWindow(rows);
  for (const bid of rows) {
    assert.equal(evaluated.isQuietBid(bid, seen, NOW), isQuietBid(bid, seen, NOW));
  }
});

test('the band marks the rows its chase line is counting', () => {
  // The sentence could always say "2 still waiting have been out longer than
  // that" and never which two, leaving a contractor to check every row's age
  // against a number in the paragraph above it.
  const script = module_();
  assert.match(script, /var seen = responseWindow\(list\);/);
  assert.match(script, /if \(isQuietBid\(bid, seen, Date\.now\(\)\)\)/);
  assert.match(script, /li\.setAttribute\('data-pf-jobs-quiet', ''\)/);
  assert.match(script, /chaseTag\.textContent = 'Chase'/);
  // Only on a waiting row: the marking sits inside the branch that draws the
  // age, which a decided row never enters.
  const waitingBranch = script.slice(script.indexOf('var phrase = bidWaitingPhrase'));
  assert.ok(waitingBranch.indexOf('isQuietBid') < waitingBranch.indexOf('pf-jobs-state'),
    'the mark belongs to the waiting branch, not to every row');
});

test('the quiet mark is a word, not only a colour', () => {
  // 180 venture palettes do not agree on a warning hue, and a visitor may not
  // separate two of them at all. Weight and a border carry it, so it also
  // survives a monochrome print.
  assert.match(style(), /\.pf-jobs-quiet\{[^}]*border:1px solid currentColor/);
});

test('the feature list says the tool knows how long an answer takes', () => {
  assert.match(SAVED_BIDS_CLAUSE, /how long the ones you heard back on took/);
});

test('a page whose form is the shop\u2019s cost structure gets no saved-bid band', () => {
  // shop-rate-calculator carries a wage, a workers' comp rate, benefits and the
  // owner's salary. It passes the shape test easily; what disqualifies it is
  // that none of that is a bid. Saving it would list the business's costs on the
  // hub beside customer job names.
  const form = ['hourlyWage', 'workersCompPercent', 'ownerAdminSalary', 'targetMargin']
    .map((id) => `<input id="${id}" type="number" value="1">`)
    .join('');
  const html = `<html><head></head><body><main>${form}</main></body></html>`;
  assert.ok(pageTakesSavedBids(html), 'the form is saveable by shape, which is the point');
  assert.ok(COST_STRUCTURE_SLUGS.has('shop-rate-calculator'));
  assert.equal(injectSavedBids(html, 'shop-rate-calculator'), html);
  // The same markup under any other slug still gets the band, so the exclusion
  // is about the page rather than about the fields.
  assert.notEqual(injectSavedBids(html, 'some-bid-calculator'), html);
});

// --- the hub's cross-tool keep reading --------------------------------------

// A finished job on a named tool: the figure the tool gave, and what the job
// came to once it was delivered. `label` is what the hub reads off the card,
// so it is what the sentence must say back.
const kept = (slug, amount, cost, label) => ({
  name: slug + ' ' + amount, at: AT, slug, outcome: 'won', amount, cost,
  ...(label ? { label } : {}),
});

test('which trade the finished work is actually worth doing', () => {
  // Fence keeps 1,400 of 5,000 (28%), deck 1,600 of 10,000 (16%), lawn 50 of
  // 1,100 (5%). marginSentence draws all three of these on three separate
  // pages and can never put them next to each other; this is the sentence that
  // tells the crew which of the three to go and sell.
  const sentence = keepSentence([
    kept('fence-bid-calculator', '$3,000', '2100', 'Fence bid calculator'),
    kept('fence-bid-calculator', '$2,000', '1500', 'Fence bid calculator'),
    kept('deck-bid-calculator', '$4,000', '3400', 'Deck bid calculator'),
    kept('deck-bid-calculator', '$6,000', '5000', 'Deck bid calculator'),
    kept('lawn-care-bid-calculator', '$500', '480', 'Lawn care bid calculator'),
    kept('lawn-care-bid-calculator', '$600', '570', 'Lawn care bid calculator'),
  ]);
  assert.match(sentence, /^Of the 6 finished jobs you have costed, across 3 tools, /);
  assert.match(sentence, /Fence bid calculator kept the most: 28% of what you charged on 2;/);
  assert.match(sentence, /Lawn care bid calculator kept 5% on 2\./);
  // 23 points apart, so the finding is the trade rather than the price list.
  assert.match(sentence, /gap is in which work you take rather than across your prices/);
});

test('the share inside a trade is pooled, not the mean of its jobs', () => {
  // A $400 job at 50% and a $9,600 job at 0% pool to 2% and average to 25%.
  // Two is what went in the bank; twenty-five is the flattery marginSentence
  // refuses on one tool, and it would be the same lie here.
  const sentence = keepSentence([
    kept('fence-bid-calculator', '$400', '200', 'Fence'),
    kept('fence-bid-calculator', '$9,600', '9600', 'Fence'),
    kept('deck-bid-calculator', '$1,000', '900', 'Deck'),
    kept('deck-bid-calculator', '$1,000', '900', 'Deck'),
  ]);
  assert.match(sentence, /Deck kept the most: 10% of what you charged on 2; Fence kept 2% on 2\./);
  assert.doesNotMatch(sentence, /25%/);
});

test('a trade finishing below its own cost is said plainly', () => {
  // Every other reading in this panel would call this book a good one: the
  // deck work is winning. It is winning at a price that takes money out.
  const sentence = keepSentence([
    kept('fence-bid-calculator', '$1,000', '700', 'Fence'),
    kept('fence-bid-calculator', '$1,000', '800', 'Fence'),
    kept('deck-bid-calculator', '$1,000', '1100', 'Deck'),
    kept('deck-bid-calculator', '$1,000', '1200', 'Deck'),
  ]);
  assert.match(sentence, /Deck kept -15% on 2\./);
  assert.match(sentence, /below what those jobs cost you to deliver/);
  assert.match(sentence, /one trade to re-cost before you quote it again/);
});

test('trades that agree get the reading’s own blind spot instead of a finding', () => {
  // 19% and 14% — inside KEEP_SPREAD_POINTS, so there is no trade to send
  // anyone to, and the honest half is what this sentence cannot see.
  const sentence = keepSentence([
    kept('fence-bid-calculator', '$1,000', '800', 'Fence'),
    kept('fence-bid-calculator', '$1,000', '820', 'Fence'),
    kept('lawn-care-bid-calculator', '$1,000', '850', 'Lawn'),
    kept('lawn-care-bid-calculator', '$1,000', '870', 'Lawn'),
  ]);
  assert.match(sentence, /keeping much the same share/);
  assert.match(sentence, /a trade you have not costed is missing here, not average\.$/);
  assert.ok(KEEP_SPREAD_POINTS > 5);
});

test('the keep reading is refused until there are two trades to compare', () => {
  assert.equal(MIN_KEEP_TOOLS, 2);
  assert.equal(MIN_KEEP_PER_TOOL, 2);
  // One tool, four costed wins. marginSentence says this in money on that
  // tool's own page, and a percentages-only copy of it here would be worse.
  assert.equal(keepSentence([
    kept('fence-bid-calculator', '$1,000', '800', 'Fence'),
    kept('fence-bid-calculator', '$2,000', '1500', 'Fence'),
    kept('fence-bid-calculator', '$3,000', '2000', 'Fence'),
    kept('fence-bid-calculator', '$4,000', '3000', 'Fence'),
  ]), '');
  // Two tools, but the second carries one job, so there is no second trade to
  // name — only a second anecdote.
  assert.equal(keepSentence([
    kept('fence-bid-calculator', '$1,000', '800', 'Fence'),
    kept('fence-bid-calculator', '$2,000', '1500', 'Fence'),
    kept('deck-bid-calculator', '$1,000', '900', 'Deck'),
  ]), '');
  assert.equal(keepSentence([]), '');
  assert.equal(keepSentence(null), '');
  assert.equal(keepSentence(undefined), '');
});

test('a trade priced in two currencies is dropped, never converted', () => {
  const book = [
    kept('fence-bid-calculator', '$1,000', '800', 'Fence'),
    kept('fence-bid-calculator', '£1,000', '800', 'Fence'),
    kept('deck-bid-calculator', '$1,000', '600', 'Deck'),
    kept('deck-bid-calculator', '$1,000', '700', 'Deck'),
    kept('lawn-care-bid-calculator', '$1,000', '900', 'Lawn'),
    kept('lawn-care-bid-calculator', '$1,000', '950', 'Lawn'),
  ];
  const sentence = keepSentence(book);
  // The fence rows are gone entirely — not summed across two currencies, and
  // not counted from whichever one happened to be seen first.
  assert.match(sentence, /^Of the 4 finished jobs you have costed, across 2 tools, /);
  assert.doesNotMatch(sentence, /Fence/);
});

test('two trades in two currencies still compare, because a share is unit-free', () => {
  // The argument pricingSentence makes: "I kept 30% of that job" is a fact
  // inside one bid's own currency, so no conversion is needed to say that one
  // trade keeps more than another. Money is never printed, which is what makes
  // that safe.
  const sentence = keepSentence([
    kept('fence-bid-calculator', '$1,000', '700', 'Fence'),
    kept('fence-bid-calculator', '$1,000', '700', 'Fence'),
    kept('deck-bid-calculator', '€1,000', '950', 'Deck'),
    kept('deck-bid-calculator', '€1,000', '950', 'Deck'),
  ]);
  assert.match(sentence, /Fence kept the most: 30% of what you charged on 2; Deck kept 5% on 2\./);
  assert.doesNotMatch(sentence, /[$€£]/);
});

test('the keep reading is drawn only from won jobs that carry every half', () => {
  const rows = [
    kept('fence-bid-calculator', '$1,000', '700', 'Fence'),
    kept('fence-bid-calculator', '$1,000', '750', 'Fence'),
    kept('deck-bid-calculator', '$1,000', '900', 'Deck'),
    kept('deck-bid-calculator', '$1,000', '950', 'Deck'),
  ];
  const drawn = keepSentence(rows);
  assert.notEqual(drawn, '');
  for (const noise of [
    // Lost, however much the bid cost to put together.
    { name: 'lost', at: AT, slug: 'x-calculator', outcome: 'lost', amount: '$9,999', cost: '1' },
    // Won but never costed — the common case, and it is not a job that cost $0.
    { name: 'uncosted', at: AT, slug: 'x-calculator', outcome: 'won', amount: '$9,999' },
    // Costed on a page with no hero figure to take a share of.
    { name: 'no figure', at: AT, slug: 'x-calculator', outcome: 'won', cost: '500' },
    // A hero figure that is a saving or a difference rather than a price.
    { name: 'negative', at: AT, slug: 'x-calculator', outcome: 'won', amount: '-$4.20', cost: '2' },
    // Still waiting on an answer, so nothing has been delivered.
    { name: 'waiting', at: AT, slug: 'x-calculator', amount: '$9,999', cost: '1' },
    // An unreadable cost is not a cost of nothing.
    { name: 'garbled', at: AT, slug: 'x-calc', outcome: 'won', amount: '$9,999', cost: 'about 5' },
    // A bid whose tool the hub no longer shows carries no slug to name.
    { name: 'no slug', at: AT, outcome: 'won', amount: '$9,999', cost: '1' },
  ]) {
    assert.equal(keepSentence([...rows, noise]), drawn, noise.name);
  }
});

test('the keep reading says the same thing whatever order the book arrives in', () => {
  const book = [
    kept('fence-bid-calculator', '$3,000', '2100', 'Fence'),
    kept('fence-bid-calculator', '$2,000', '1500', 'Fence'),
    kept('deck-bid-calculator', '$4,000', '3400', 'Deck'),
    kept('deck-bid-calculator', '$6,000', '5000', 'Deck'),
  ];
  assert.equal(keepSentence(book), keepSentence([...book].reverse()));
  // Two trades that have gone the same way cannot swap places between renders.
  const tied = [
    kept('a-calculator', '$1,000', '800', 'A'), kept('a-calculator', '$1,000', '800', 'A'),
    kept('b-calculator', '$1,000', '800', 'B'), kept('b-calculator', '$1,000', '800', 'B'),
  ];
  assert.match(keepSentence(tied), /A kept the most: 20% of what you charged on 2; B kept 20%/);
  assert.equal(keepSentence(tied), keepSentence([...tied].reverse()));
});

test('the keep reading never states a share to aim for', () => {
  // The guard winRateSentence and marginSentence both carry. There is no
  // correct margin, and printing one would invent the number the contractor
  // came here to stop guessing at. Every branch, including the two the tests
  // above reach separately.
  for (const book of [
    [kept('a', '$1,000', '700', 'A'), kept('a', '$1,000', '700', 'A'),
      kept('b', '$1,000', '990', 'B'), kept('b', '$1,000', '990', 'B')],
    [kept('a', '$1,000', '700', 'A'), kept('a', '$1,000', '700', 'A'),
      kept('b', '$1,000', '1200', 'B'), kept('b', '$1,000', '1200', 'B')],
    [kept('a', '$1,000', '800', 'A'), kept('a', '$1,000', '820', 'A'),
      kept('b', '$1,000', '850', 'B'), kept('b', '$1,000', '870', 'B')],
  ]) {
    const sentence = keepSentence(book);
    assert.notEqual(sentence, '');
    assert.doesNotMatch(sentence, /should|aim|target|too (high|low)|healthy|ideal|industry/i);
  }
});

test('the injected keep helper answers exactly as the module does', () => {
  // The guarantee every reading here carries: the hub runs the tested body,
  // not a paraphrase of it.
  const evaluated = new Function(`${BID_AMOUNT_HELPER}
${BID_PRICING_HELPERS}
    return keepSentence;`)();

  for (const book of [
    [], null,
    [kept('a', '$1,000', '800', 'A'), kept('a', '$1,000', '800', 'A')],
    [kept('a', '$1,000', '700', 'A'), kept('a', '$1,000', '700', 'A'),
      kept('b', '$1,000', '1200', 'B'), kept('b', '$1,000', '1200', 'B')],
    [kept('a', '$3,000', '2100', 'A'), kept('a', '$2,000', '1500', 'A'),
      kept('b', '$500', '480', 'B'), kept('b', '$600', '570', 'B'),
      kept('c', '£400', '300', 'C'), kept('c', '$400', '300', 'C')],
  ]) {
    assert.equal(evaluated(book), keepSentence(book), JSON.stringify(book && book.length));
  }
});

// --- the hub's mix reading --------------------------------------------------

// A lost bid on a named tool. It carries no figure and no cost on purpose: a
// lost quote is what makes a win rate readable and contributes nothing to a
// kept share, which is the asymmetry this reading has to hold both halves of.
const missed = (slug, label) => ({
  name: slug + ' lost', at: AT, slug, outcome: 'lost',
  ...(label ? { label } : {}),
});

// Fence: four wins (two of them costed, keeping 5%) and one loss — lands 4 of
// 5. Deck: two costed wins keeping 28%, and six losses — lands 2 of 8. Every
// other reading in the panel reads this book as good news about fences.
const opposed = () => [
  kept('fence-bid-calculator', '$1,000', '950', 'Fence'),
  kept('fence-bid-calculator', '$1,000', '950', 'Fence'),
  kept('fence-bid-calculator', '$1,000', undefined, 'Fence'),
  kept('fence-bid-calculator', '$1,000', undefined, 'Fence'),
  missed('fence-bid-calculator', 'Fence'),
  kept('deck-bid-calculator', '$5,000', '3600', 'Deck'),
  kept('deck-bid-calculator', '$5,000', '3600', 'Deck'),
  ...Array.from({ length: 6 }, () => missed('deck-bid-calculator', 'Deck')),
];

test('the trade that lands most and the trade that pays most are crossed', () => {
  const sentence = mixSentence(opposed());
  // winRateSentence reads this book and names Fence as the trade that is
  // working; keepSentence reads the same book and names Deck. Neither is
  // wrong, and neither says the thing that decides what to do on Monday.
  assert.match(sentence, /^The work you win is not the work that pays: /);
  assert.match(
    sentence,
    /Fence lands 4 of 5 quotes and keeps 5% of what it charged on the 2 you costed;/,
  );
  assert.match(sentence, /Deck lands 2 of 8 and keeps 28% on 2\./);
  assert.match(sentence, /worth a price rise before it is worth more of your time/);
  assert.match(sentence, /re-cost it before you re-price it\.$/);
});

test('the trade that lands most being the trade that pays most is also a finding', () => {
  // The same two books swapped. Every other line in the panel warns about
  // something; this branch exists because "keep selling this" is a decision
  // too, and no single tool page can reach it either.
  const sentence = mixSentence([
    kept('fence-bid-calculator', '$5,000', '3600', 'Fence'),
    kept('fence-bid-calculator', '$5,000', '3600', 'Fence'),
    kept('fence-bid-calculator', '$5,000', undefined, 'Fence'),
    kept('fence-bid-calculator', '$5,000', undefined, 'Fence'),
    missed('fence-bid-calculator', 'Fence'),
    kept('deck-bid-calculator', '$1,000', '950', 'Deck'),
    kept('deck-bid-calculator', '$1,000', '950', 'Deck'),
    ...Array.from({ length: 6 }, () => missed('deck-bid-calculator', 'Deck')),
  ]);
  assert.match(sentence, /^The work you win is also the work that pays: /);
  assert.match(
    sentence,
    /Fence lands 4 of 5 quotes and keeps 28% of what it charged on the 2 you costed,/,
  );
  // One trade holds both other ends, so it is named once rather than twice.
  assert.match(sentence, /where Deck lands 2 of 8 and keeps 5% on 2\./);
  assert.equal(sentence.match(/Deck/g).length, 1);
  assert.match(sentence, /worth answering with more selling rather than a price change/);
});

test('two trades at the other end are both named', () => {
  // Fence tops both rankings; Lawn is the worst keeper and Deck the worst
  // lander, so the sentence has two trades to name rather than one.
  const sentence = mixSentence([
    kept('fence-bid-calculator', '$5,000', '3600', 'Fence'),
    kept('fence-bid-calculator', '$5,000', '3600', 'Fence'),
    kept('fence-bid-calculator', '$5,000', undefined, 'Fence'),
    kept('fence-bid-calculator', '$5,000', undefined, 'Fence'),
    missed('fence-bid-calculator', 'Fence'),
    // Lawn keeps 2% and lands 2 of 4.
    kept('lawn-care-bid-calculator', '$1,000', '980', 'Lawn'),
    kept('lawn-care-bid-calculator', '$1,000', '980', 'Lawn'),
    missed('lawn-care-bid-calculator', 'Lawn'),
    missed('lawn-care-bid-calculator', 'Lawn'),
    // Deck keeps 10% and lands 2 of 8.
    kept('deck-bid-calculator', '$1,000', '900', 'Deck'),
    kept('deck-bid-calculator', '$1,000', '900', 'Deck'),
    ...Array.from({ length: 6 }, () => missed('deck-bid-calculator', 'Deck')),
  ]);
  assert.match(sentence, /where Deck lands 2 of 8 and Lawn keeps 2% on 2\./);
});

test('the mix reading needs both halves of both trades before it says anything', () => {
  assert.equal(MIN_MIX_TOOLS, 2);
  const book = opposed();
  assert.notEqual(mixSentence(book), '');

  // One tool cannot be crossed with anything, however long its own history.
  assert.equal(mixSentence(book.filter((row) => row.slug === 'fence-bid-calculator')), '');
  // A trade with a win rate but no costed job is missing half the cross. Deck
  // keeps its eight decided bids and loses one of its two delivered costs.
  assert.equal(mixSentence(book.map((row) => (
    row.slug === 'deck-bid-calculator' && row.cost ? { ...row, cost: undefined } : row
  ))).indexOf('Deck'), -1);
  // A trade with costed jobs but too few decided bids is missing the other
  // half: fence drops to three decided, under MIN_WIN_RATE_PER_TOOL.
  assert.equal(mixSentence(book.filter((row, i) => !(row.slug === 'fence-bid-calculator' &&
    (i === 2 || i === 4)))), '');
  assert.equal(mixSentence([]), '');
  assert.equal(mixSentence(null), '');
  assert.equal(mixSentence(undefined), '');
});

test('the mix reading draws nothing when the two rankings neither oppose nor agree', () => {
  // Fence lands 4 of 5 and keeps 5%; Deck lands 3 of 6 and keeps 28%. The
  // kept-share gap clears KEEP_SPREAD_POINTS and the rate gap — 80 against 50
  // — does not clear WIN_RATE_SPLIT_POINTS, so there is no finding, and a
  // sentence saying so would be a line on the busiest page in the site that
  // changes nothing anyone does.
  assert.ok(WIN_RATE_SPLIT_POINTS > 30);
  assert.equal(mixSentence([
    kept('fence-bid-calculator', '$1,000', '950', 'Fence'),
    kept('fence-bid-calculator', '$1,000', '950', 'Fence'),
    kept('fence-bid-calculator', '$1,000', undefined, 'Fence'),
    kept('fence-bid-calculator', '$1,000', undefined, 'Fence'),
    missed('fence-bid-calculator', 'Fence'),
    kept('deck-bid-calculator', '$5,000', '3600', 'Deck'),
    kept('deck-bid-calculator', '$5,000', '3600', 'Deck'),
    kept('deck-bid-calculator', '$5,000', undefined, 'Deck'),
    ...Array.from({ length: 3 }, () => missed('deck-bid-calculator', 'Deck')),
  ]), '');
  // And the mirror: rates far apart, kept shares 3 points apart.
  assert.equal(mixSentence([
    kept('fence-bid-calculator', '$1,000', '950', 'Fence'),
    kept('fence-bid-calculator', '$1,000', '950', 'Fence'),
    kept('fence-bid-calculator', '$1,000', undefined, 'Fence'),
    kept('fence-bid-calculator', '$1,000', undefined, 'Fence'),
    missed('fence-bid-calculator', 'Fence'),
    kept('deck-bid-calculator', '$1,000', '920', 'Deck'),
    kept('deck-bid-calculator', '$1,000', '920', 'Deck'),
    ...Array.from({ length: 6 }, () => missed('deck-bid-calculator', 'Deck')),
  ]), '');
});

test('a trade priced in two currencies is dropped from the cross, never converted', () => {
  const book = opposed().map((row, i) => (
    row.slug === 'deck-bid-calculator' && i === 6 ? { ...row, amount: '£5,000' } : row
  ));
  // Deck is gone entirely, and with it the only trade Fence could be crossed
  // against — so the reading refuses rather than reporting on Fence alone.
  assert.equal(mixSentence(book), '');
});

test('the mix reading says the same thing whatever order the book arrives in', () => {
  const book = opposed();
  assert.equal(mixSentence(book), mixSentence([...book].reverse()));
  // Two trades that have gone the same way cannot swap places between renders.
  const tied = [
    kept('a-calculator', '$1,000', '800', 'A'), kept('a-calculator', '$1,000', '800', 'A'),
    missed('a-calculator', 'A'), missed('a-calculator', 'A'),
    kept('b-calculator', '$1,000', '800', 'B'), kept('b-calculator', '$1,000', '800', 'B'),
    missed('b-calculator', 'B'), missed('b-calculator', 'B'),
  ];
  assert.equal(mixSentence(tied), mixSentence([...tied].reverse()));
});

test('the mix reading never states a rate, a margin or a mix to aim for', () => {
  // The guard every reading in this panel carries. This one needs it most: it
  // is the only line here that tells someone to change a price, so an invented
  // number beside that instruction would be the worst kind of advice this site
  // could give.
  for (const book of [
    opposed(),
    opposed().map((row) => (row.slug === 'fence-bid-calculator' && row.cost
      ? { ...row, amount: '$5,000', cost: '3600' } : row)).map((row) => (
      row.slug === 'deck-bid-calculator' && row.cost ? { ...row, cost: '4900' } : row)),
  ]) {
    const sentence = mixSentence(book);
    assert.notEqual(sentence, '');
    assert.doesNotMatch(sentence, /should|aim|target|too (high|low)|healthy|ideal|industry/i);
  }
});

test('the injected mix helper answers exactly as the module does', () => {
  // The guarantee every reading here carries: the hub runs the tested body,
  // not a paraphrase of it.
  const evaluated = new Function(`${BID_AMOUNT_HELPER}
${BID_PRICING_HELPERS}
    return mixSentence;`)();

  for (const book of [
    [], null,
    opposed(),
    opposed().filter((row) => row.slug === 'fence-bid-calculator'),
    [...opposed(), kept('deck-bid-calculator', '$5,000', undefined, 'Deck')],
  ]) {
    assert.equal(evaluated(book), mixSentence(book), JSON.stringify(book && book.length));
  }
});

// --- the hub's trend reading ------------------------------------------------

// A decided bid on a named tool, dated. Only three fields matter here — when it
// was priced, which tool priced it, and what became of it — which is exactly
// the argument for the reading: it needs no figure and no currency, so it draws
// for a book where every money reading in the portfolio draws nothing.
const TREND_NOW = Date.parse('2026-08-29T09:00:00.000Z');
const trendDay = (n) => new Date(TREND_NOW - n * 86400000).toISOString();
const landed = (slug, dayssince, outcome, label) => ({
  name: slug + ' ' + dayssince, at: trendDay(dayssince), slug, outcome,
  ...(label ? { label } : {}),
});

// Eight fence bids: the four oldest won, the four newest lost. The pooled win
// rate over the same book is 50%, which is the whole point — winRateSentence
// reads "4 of 8" and cannot see that the shop stopped winning.
const turned = [
  landed('fence-bid-calculator', 200, 'won', 'Fence bid calculator'),
  landed('fence-bid-calculator', 180, 'won', 'Fence bid calculator'),
  landed('fence-bid-calculator', 160, 'won', 'Fence bid calculator'),
  landed('fence-bid-calculator', 140, 'won', 'Fence bid calculator'),
  landed('fence-bid-calculator', 60, 'lost', 'Fence bid calculator'),
  landed('fence-bid-calculator', 40, 'lost', 'Fence bid calculator'),
  landed('fence-bid-calculator', 20, 'lost', 'Fence bid calculator'),
  landed('fence-bid-calculator', 10, 'lost', 'Fence bid calculator'),
];

test('a trade that has stopped landing is named, where the pooled rate cannot', () => {
  const sentence = trendSentence(turned, TREND_NOW);
  assert.match(sentence, /^Fence bid calculator has been landing less often than it was: /);
  assert.match(sentence, /0 of 4 on the 4 most recent, against 4 of 4 before them\./);
  // The turn is dated off the oldest bid in the recent half, which is a fact
  // about the sample rather than a claim about when anything changed.
  assert.match(sentence, /The recent half starts 60 days back\./);
  // What winRateSentence says about the identical book, for contrast: a rate
  // that averages the shop's before and after into a number describing neither.
  assert.match(winRateSentence(turned), /You have won 4 of 8 decided bids — 50%\./);
});

test('the other direction reads the same way round', () => {
  const recovered = turned.map((bid) => ({
    ...bid, outcome: bid.outcome === 'won' ? 'lost' : 'won',
  }));
  assert.match(trendSentence(recovered, TREND_NOW),
    /^Fence bid calculator has been landing more often than it was: 4 of 4 on the 4 most recent/);
});

test('the halves are equal, so the counts read straight across', () => {
  // Nine decided bids: the middle one belongs to neither half rather than being
  // lent to one of them, which would make a four-bid half a five-bid half and
  // the two counts no longer comparable.
  const odd = [
    ...turned.slice(0, 4),
    landed('fence-bid-calculator', 100, 'won', 'Fence bid calculator'),
    ...turned.slice(4),
  ];
  const sentence = trendSentence(odd, TREND_NOW);
  assert.match(sentence, /0 of 4 on the 4 most recent, against 4 of 4 before them\./);
  assert.match(sentence, /Both halves hold the same number of bids/);
});

test('bids are split by when they were priced, not by when they were answered', () => {
  // One of the four old winners was only answered last week. Ordering by
  // decidedAt would drag it into the recent half and credit this shop's current
  // prices with a job quoted at last year's.
  const lateAnswer = turned.map((bid, i) => (
    i === 0 ? { ...bid, decidedAt: trendDay(3) } : { ...bid, decidedAt: bid.at }
  ));
  assert.equal(trendSentence(lateAnswer, TREND_NOW), trendSentence(turned, TREND_NOW));
});

test('the trend reading needs eight decided bids on one trade', () => {
  assert.equal(MIN_TREND_PER_HALF, 4);
  // Seven of the eight: three a side once the middle is dropped, one short.
  assert.equal(trendSentence(turned.slice(1), TREND_NOW), '');
  assert.equal(trendSentence(turned, TREND_NOW) === '', false);
  // Eight decided bids split over two trades is not eight on either of them. A
  // movement pooled across trades would mix a fence change with a deck change
  // and describe neither.
  const split = turned.map((bid, i) => (
    i % 2 ? { ...bid, slug: 'deck-bid-calculator', label: 'Deck bid calculator' } : bid
  ));
  assert.equal(trendSentence(split, TREND_NOW), '');
});

test('one bid of difference is not a change in how the work is landing', () => {
  assert.equal(TREND_SPLIT_POINTS, 40);
  // 3 of 4 against 2 of 4 — 25 points, one job, the customer's brother-in-law.
  const flat = turned.map((bid, i) => (
    { ...bid, outcome: i === 3 ? 'lost' : i === 4 || i === 5 ? 'won' : bid.outcome }
  ));
  assert.equal(trendSentence(flat, TREND_NOW), '');
  // 3 of 4 against 1 of 4 — 50 points, two jobs, and reportable.
  const moved = flat.map((bid, i) => (i === 5 ? { ...bid, outcome: 'lost' } : bid));
  assert.match(trendSentence(moved, TREND_NOW), /1 of 4 on the 4 most recent, against 3 of 4/);
});

test('only the furthest movement is named, and stably', () => {
  const decks = [
    landed('deck-bid-calculator', 200, 'won', 'Deck bid calculator'),
    landed('deck-bid-calculator', 180, 'won', 'Deck bid calculator'),
    landed('deck-bid-calculator', 160, 'won', 'Deck bid calculator'),
    landed('deck-bid-calculator', 140, 'lost', 'Deck bid calculator'),
    landed('deck-bid-calculator', 60, 'lost', 'Deck bid calculator'),
    landed('deck-bid-calculator', 40, 'lost', 'Deck bid calculator'),
    landed('deck-bid-calculator', 20, 'lost', 'Deck bid calculator'),
    landed('deck-bid-calculator', 10, 'won', 'Deck bid calculator'),
  ];
  // Decks moved 3-of-4 to 1-of-4; fences moved 4-of-4 to 0-of-4. Fences moved
  // further, so fences is the trade to go and look at.
  const book = [...decks, ...turned];
  assert.match(trendSentence(book, TREND_NOW), /^Fence bid calculator/);
  assert.equal(trendSentence(book, TREND_NOW), trendSentence([...book].reverse(), TREND_NOW));
  // Two trades that moved by exactly the same amount cannot swap places between
  // two renders of the same book.
  const tied = turned.map((bid) => (
    { ...bid, slug: 'zzz-calculator', label: 'Zzz', name: 'z' + bid.name }
  ));
  const both = [...turned, ...tied];
  assert.match(trendSentence(both, TREND_NOW), /^Fence bid calculator/);
  assert.equal(trendSentence(both, TREND_NOW), trendSentence([...both].reverse(), TREND_NOW));
});

test('the trend reading counts only decided bids it can place in time', () => {
  const drawn = trendSentence(turned, TREND_NOW);
  assert.notEqual(drawn, '');
  for (const noise of [
    // Still waiting on an answer: it has no side of the split to be on.
    { name: 'waiting', at: trendDay(1), slug: 'fence-bid-calculator' },
    // A date the browser cannot parse cannot be placed either, and placing it
    // anyway would put it wherever the store happened to hold it.
    { name: 'garbled', at: 'last Tuesday', slug: 'fence-bid-calculator', outcome: 'lost' },
    // A bid whose tool the hub no longer shows carries no trade to name.
    { name: 'no slug', at: trendDay(1), outcome: 'lost' },
  ]) {
    assert.equal(trendSentence([...turned, noise], TREND_NOW), drawn, noise.name);
  }
});

test('the trend reading never states a rate to aim for, or a cause', () => {
  // The guard winRateSentence and keepSentence both carry. There is no correct
  // win rate and this reading cannot see why one moved, so both branches say so
  // rather than inventing the number or the reason its reader came here for.
  for (const book of [turned, turned.map((bid) => (
    { ...bid, outcome: bid.outcome === 'won' ? 'lost' : 'won' }
  ))]) {
    const sentence = trendSentence(book, TREND_NOW);
    assert.notEqual(sentence, '');
    assert.doesNotMatch(sentence, /should|aim|target|too (high|low)|healthy|ideal|industry/i);
    assert.match(sentence, /a slow season or a run of unusual jobs moves this as much as a price/);
  }
});

test('a book with nothing to say draws nothing', () => {
  assert.equal(trendSentence([], TREND_NOW), '');
  assert.equal(trendSentence(null, TREND_NOW), '');
  assert.equal(trendSentence(undefined, TREND_NOW), '');
  // Eight decided bids that all went the same way have not moved at all.
  assert.equal(trendSentence(turned.map((bid) => ({ ...bid, outcome: 'won' })), TREND_NOW), '');
});

test('the injected trend helper answers exactly as the module does', () => {
  // The guarantee every reading here carries — and this one needs two bundles,
  // because trendSentence calls bidWaitingDays, which ships with the follow-up
  // helpers the hub emits above these.
  const evaluated = new Function(`${BID_FOLLOW_UP_HELPERS}
${BID_AMOUNT_HELPER}
${BID_PRICING_HELPERS}
    return trendSentence;`)();

  for (const book of [
    [], null, turned.slice(1), turned,
    turned.map((bid) => ({ ...bid, outcome: bid.outcome === 'won' ? 'lost' : 'won' })),
    [...turned, { name: 'waiting', at: trendDay(1), slug: 'fence-bid-calculator' }],
  ]) {
    assert.equal(evaluated(book, TREND_NOW), trendSentence(book, TREND_NOW),
      JSON.stringify(book && book.length));
  }
});

// --- the same finding, in the panel on the tool's own page ------------------

test('the tool page says it about its own bids, and names no trade', () => {
  // The hub's copy of this reading has to name the trade, because a crew works
  // six calculators and the finding is which one moved. On the fence page there
  // is only one, and a sentence saying "Fence Bid Calculator" there would be
  // telling the reader where they are standing. These rows carry no slug and no
  // label at all — which is also what the panel actually holds.
  const bare = turned.map(({ slug, label, ...bid }) => bid);
  const sentence = toolTrendSentence(bare, TREND_NOW);
  assert.match(sentence,
    /^The bids you saved here have been landing less often than they were: 0 of 4/);
  assert.doesNotMatch(sentence, /Fence|calculator/i);
  // And the detail after the subject is the hub's, word for word: one split,
  // one set of counts, one honest half, so the two pages cannot disagree about
  // what moved.
  const detail = trendSentence(turned, TREND_NOW).split('was: ')[1];
  assert.equal(sentence.endsWith(detail), true, sentence);
});

test('the two sentences refuse on exactly the same evidence', () => {
  for (const book of [
    [], null, undefined,
    turned.slice(1),
    turned.map((bid) => ({ ...bid, outcome: 'won' })),
  ]) {
    assert.equal(toolTrendSentence(book, TREND_NOW), '', JSON.stringify(book));
    assert.equal(trendSentence(book, TREND_NOW), '');
  }
  // trendSplit is the single gate under both, so the floors are asserted once.
  assert.equal(trendSplit(turned.slice(1)), null);
  assert.equal(trendSplit(turned).half, MIN_TREND_PER_HALF);
  assert.equal(trendSplit(turned).move, -100);
});

test('the tool page draws the trend without needing a headline figure', () => {
  // The price band, the undercut line and the margin all ride on the page
  // having a hero number to compare. This one counts outcomes and never looks
  // at a figure, so a tool that stores no amounts can still tell its user their
  // quotes have stopped landing — and the markup must not gate it away with the
  // money readings.
  const without = injectSavedBids(page(inputs(4)), 'cleaning-dilution-calculator');
  assert.match(without, /id="pf-jobs-trend"/);
  assert.doesNotMatch(without, /id="pf-jobs-margin"/);
  const withHero = injectSavedBids(page(inputs(4) + hero('price')), 'fence-bid-calculator');
  assert.match(withHero, /id="pf-jobs-trend"/);
  // Said in the panel's own copy, on both, because the line is on both.
  assert.match(without, /landing differently lately/);
  assert.match(withHero, /landing differently lately/);

  const script = module_();
  // The element is the guard, as it is for every reading in this panel.
  assert.match(script, /var trendEl = el\('pf-jobs-trend'\);/);
  assert.match(script, /var trending = toolTrendSentence\(list, Date\.now\(\)\);/);
  // Counted on change rather than per render, so marking three bids in a row is
  // three readings and not thirty. No name, no figure, no direction.
  assert.match(script, /bump\('bid_trend_shown'\)/);
  assert.ok(!/bump\('bid_trend_shown:' ?\+/.test(script), 'the event names nothing');
});

test('the shared band script carries the trend body the tests run', () => {
  // The guarantee the whole file is built on, checked on the second bundle:
  // the browser runs the tested definition, not a paraphrase. Two lists are
  // needed because trendDetail calls bidWaitingDays, which ships with the
  // follow-up helpers — and the band script emits both, in that order.
  const evaluated = new Function(`${BID_FOLLOW_UP_HELPERS}
${BID_TREND_HELPERS}
    return toolTrendSentence;`)();
  for (const book of [
    [], null, turned.slice(1), turned,
    turned.map((bid) => ({ ...bid, outcome: bid.outcome === 'won' ? 'lost' : 'won' })),
  ]) {
    assert.equal(evaluated(book, TREND_NOW), toolTrendSentence(book, TREND_NOW),
      JSON.stringify(book && book.length));
  }
  const script = module_();
  assert.ok(script.indexOf('var bidWaitingDays = function bidWaitingDays(') <
    script.indexOf('var trendDetail = function trendDetail('),
    'trendDetail is emitted before the helper it calls');
});

test('the band bundle ships one sentence, not both', () => {
  // BID_TREND_HELPERS and BID_PRICING_HELPERS share the arithmetic and part
  // company at the sentence. Neither page pays for the other's: the hub cannot
  // use a sentence that names no trade, and the tool page cannot use one that
  // groups a book by slug it does not have.
  assert.ok(BID_TREND_HELPERS.includes('var toolTrendSentence = function'));
  assert.ok(!BID_TREND_HELPERS.includes('var trendSentence = function'));
  assert.ok(BID_PRICING_HELPERS.includes('var trendSentence = function'));
  assert.ok(!BID_PRICING_HELPERS.includes('var toolTrendSentence = function'));
  // And the money readings still stay off the hub, which is the rule this
  // split was modelled on.
  assert.ok(!BID_PRICING_HELPERS.includes('var priceBandSentence = function'));
});

// ---------------------------------------------------------------------------
// Itemised rows
// ---------------------------------------------------------------------------

test('a page declares its row groups on the control that appends a row', async () => {
  const { pageRepeatPrefixes } = await import('./jobs.mjs');
  assert.deepEqual(pageRepeatPrefixes('<button id="addTree" data-pf-repeat="t">+ Add</button>'), ['t']);
  // Two groups on one page — carpet cleaning prices rooms and upholstery
  // separately — come back in document order and without duplicates.
  assert.deepEqual(
    pageRepeatPrefixes(
      '<button data-pf-repeat="r"></button><button data-pf-repeat="u"></button><button data-pf-repeat="r"></button>'),
    ['r', 'u']);
  // Silence is the answer for the 161 tools that declare nothing, which is what
  // keeps the exact-id rule in place everywhere it was already right.
  assert.deepEqual(pageRepeatPrefixes('<button id="addTree">+ Add</button>'), []);
  assert.deepEqual(pageRepeatPrefixes('<button data-pf-repeat="  "></button>'), []);
  assert.deepEqual(pageRepeatPrefixes(null), []);
});

test('a generated id splits into its group, its counter and its field', async () => {
  const { splitRepeatId } = await import('./jobs.mjs');
  assert.deepEqual(splitRepeatId('t12-dbh', ['t']), { prefix: 't', index: 12, field: 'dbh' });
  // The static fields on the same page must go on comparing exactly, so
  // anything that is not `<prefix><digits>-<field>` is not a row.
  assert.equal(splitRepeatId('crewRate', ['t']), null);
  assert.equal(splitRepeatId('t-dbh', ['t']), null);
  assert.equal(splitRepeatId('tx1-dbh', ['t']), null);
  assert.equal(splitRepeatId('t1-', ['t']), null);
  assert.equal(splitRepeatId('t1-dbh', ['r']), null);
  // Longest prefix wins, so declaring both `r` and `rt` is unambiguous.
  assert.deepEqual(splitRepeatId('rt4-x', ['r', 'rt']), { prefix: 'rt', index: 4, field: 'x' });
});

test('rows are keyed by their position in the group, not by the counter', async () => {
  const { normalizeRepeatIds } = await import('./jobs.mjs');
  // The recorded case: a contractor who deleted the second room holds r1 and
  // r3, and a form freshly grown to two rows holds r1 and r2. Nothing about
  // those two bids differs, and by position they agree.
  const saved = normalizeRepeatIds(['r1-sqft', 'r3-sqft', 'crewRate'], ['r']);
  const form = normalizeRepeatIds(['r1-sqft', 'r2-sqft', 'crewRate'], ['r']);
  assert.deepEqual(saved.map, { 'r1-sqft': 'r#1-sqft', 'r3-sqft': 'r#2-sqft', crewRate: 'crewRate' });
  assert.deepEqual(form.map, { 'r1-sqft': 'r#1-sqft', 'r2-sqft': 'r#2-sqft', crewRate: 'crewRate' });
  assert.deepEqual(Object.values(saved.map).sort(), Object.values(form.map).sort());
  assert.deepEqual(saved.counts, { r: 2 });

  // Carpet cleaning shares one counter across both groups, so its ids
  // interleave (r1, u2, r3). Ranking happens inside a group, which is what
  // makes the interleaving irrelevant.
  const mixed = normalizeRepeatIds(['r1-sqft', 'u2-min', 'r3-sqft'], ['r', 'u']);
  assert.equal(mixed.map['r3-sqft'], 'r#2-sqft');
  assert.equal(mixed.map['u2-min'], 'u#1-min');
  assert.deepEqual(mixed.counts, { r: 2, u: 1 });

  // With no groups declared every id is its own key, which is the exact-id
  // rule this replaced.
  assert.deepEqual(normalizeRepeatIds(['r1-sqft', 'crewRate'], []).map,
    { 'r1-sqft': 'r1-sqft', crewRate: 'crewRate' });
});

test('the form is grown to the bid, and only ever grown', async () => {
  const { rowsToGrow, MAX_REPEAT_ROWS } = await import('./jobs.mjs');
  assert.deepEqual(rowsToGrow({ r: 6, u: 2 }, { r: 1 }, ['r', 'u']), { r: 5, u: 2 });
  // A group the form already satisfies asks for no clicks, and one the form has
  // too many of is not reported as a negative: no page here declares a remove
  // control, so that case has to fall through to the ordinary refusal rather
  // than invite a caller to click backwards.
  assert.deepEqual(rowsToGrow({ r: 2 }, { r: 2 }, ['r']), {});
  assert.deepEqual(rowsToGrow({ r: 1 }, { r: 4 }, ['r']), {});
  // A crafted bid cannot make the page click forever.
  assert.deepEqual(rowsToGrow({ r: 9999 }, { r: 0 }, ['r']), { r: MAX_REPEAT_ROWS });
  assert.deepEqual(rowsToGrow({ r: 3 }, {}, []), {});
});

test('the browser gets the tested row-group definitions, not a paraphrase', async () => {
  const { BID_REPEAT_HELPERS } = await import('./jobs.mjs');
  for (const name of ['splitRepeatId', 'normalizeRepeatIds', 'rowsToGrow']) {
    assert.ok(BID_REPEAT_HELPERS.includes(`var ${name} = `), `${name} is injected`);
  }
  // The two constants the injected bodies close over are emitted as literals;
  // `REPEAT_ATTR` is also read by the runtime's own querySelectorAll.
  assert.match(BID_REPEAT_HELPERS, /var REPEAT_ATTR = "data-pf-repeat";/);
  assert.match(BID_REPEAT_HELPERS, /var MAX_REPEAT_ROWS = \d+;/);
});

/**
 * `bump` is the panel's one usage counter, and the privacy promise is that it
 * stays silent for a browser that asked not to be counted. Run the real
 * function against a fake navigator and store: counting once proves the
 * counter works, and each off switch proves it is actually wired.
 */
test('the panel counter counts, and stays silent for Do Not Track, Global Privacy Control and the hub opt-out', () => {
  const script = module_();
  const start = script.indexOf('var bump = function(event){');
  assert.ok(start >= 0, 'bump was not found in the panel script');
  const end = script.indexOf('\n};', start);
  const source = script.slice(start, end + '\n};'.length);

  const run = (nav, stored = {}) => {
    const data = { ...stored };
    const store = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
    new Function('navigator', 'store', `${source}; bump('saved'); bump('saved');`)(nav, store);
    return data['portfolio-hub-usage'] ? JSON.parse(data['portfolio-hub-usage']) : null;
  };

  assert.equal(run({}).saved, 2, 'an ordinary browser is counted');
  assert.equal(run({ doNotTrack: '1' }), null, 'Do Not Track did not silence the count');
  assert.equal(run({ globalPrivacyControl: true }), null, 'Global Privacy Control did not silence the count');
  assert.equal(run({}, { 'portfolio-hub-optout': '1' }), null, 'the hub opt-out did not silence the count');
  assert.equal(run({ globalPrivacyControl: false }).saved, 2, 'GPC explicitly off still counts');
});

/**
 * The edge of a side is its outer bid, wherever in the list it sits: the
 * dearest won bid and the cheapest lost one. A loop that merely kept the last
 * bid it saw would pass any test whose extreme happens to come last.
 */
test('bidPriceSide finds the outer edge and the average wherever the extreme sits', () => {
  const bids = [{ value: 500 }, { value: 900 }, { value: 300 }, { value: 700 }];
  assert.deepEqual(bidPriceSide(bids, 1), { average: 600, edge: { value: 900 } });
  assert.deepEqual(bidPriceSide(bids, -1), { average: 600, edge: { value: 300 } });
  assert.deepEqual(bidPriceSide([{ value: 400 }], 1), { average: 400, edge: { value: 400 } });
});

test('the outcome menu preselects by option value, not by its label', () => {
  // `outcome` is 'won' or 'lost'; the labels are 'Won' and 'Lost'. Comparing
  // against the label would show every restored bid as Waiting.
  assert.match(module_(), /if \(options\[o\]\[0\] === outcome\) option\.selected = true;|if\(options\[o\]\[0\]===outcome\)option\.selected=true;/);
});

test('field ids are read whether the attribute is double-quoted, single-quoted or bare', () => {
  assert.deepEqual(
    pageSaveableFieldIds(page('<input id="a"><input id=\'b\'><input id=c><select id=\'d\'></select>')),
    ['a', 'b', 'c', 'd'],
  );
});

test('the module dates a saved bid with today\'s ISO date and labels each outcome menu by bid', () => {
  assert.match(module_(), /var today = function\(\)\{\s*try \{ return new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(module_(), /'Outcome of the bid named ' \+ bid\.name/);
});

test('a trade that charged only a dollar in total still takes part in the keep ranking', () => {
  // charged is exactly $1 across two jobs: positive, so it is ranked, and
  // keeps 50% ($0.50 of $1) against the fence's 28%.
  const sentence = keepSentence([
    kept('fence-bid-calculator', '$3,000', '2100', 'Fence bid calculator'),
    kept('fence-bid-calculator', '$2,000', '1500', 'Fence bid calculator'),
    kept('tiny-bid-calculator', '$0.50', '0.25', 'Tiny bid calculator'),
    kept('tiny-bid-calculator', '$0.50', '0.25', 'Tiny bid calculator'),
  ]);
  assert.match(sentence, /across 2 tools/);
  assert.match(sentence, /Tiny bid calculator kept the most/);
});
