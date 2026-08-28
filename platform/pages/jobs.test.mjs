import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BID_FOLLOW_UP_HELPERS,
  BID_OUTCOMES,
  BID_AMOUNT_HELPER,
  BID_PRICE_BAND_HELPERS,
  MIN_PRICE_BAND_SIDE,
  PRICE_BAND_CLAUSE,
  bidAmountValue,
  formatBidAmount,
  priceBandSentence,
  EXCLUDED_FIELD_IDS,
  HEADLINE_AMOUNT_OVERRIDES,
  SAVED_BIDS_CLAUSE,
  addSavedBidsClause,
  bidWaitingDays,
  bidWaitingPhrase,
  bidResponseDays,
  chaseSentence,
  MIN_RESPONSE_SAMPLE,
  followUpSentence,
  MAX_SAVED_BIDS,
  MIN_SAVEABLE_FIELDS,
  SAVED_BIDS_KEY,
  injectSavedBids,
  renderSavedBidsModule,
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
  const out = injectSavedBids(page(inputs(6)), 'x');
  assert.match(out, /@media print\{\.pf-jobs\{display:none !important\}\}/);
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
    return { chaseSentence: chaseSentence, bidResponseDays: bidResponseDays };`)();
  const rows = [answered(2), answered(9), answered(5), waiting(19), waiting(3)];
  assert.equal(evaluated.chaseSentence(rows, NOW), chaseSentence(rows, NOW));
  assert.equal(evaluated.bidResponseDays(answered(6)), bidResponseDays(answered(6)));
});

test('the feature list says the tool knows how long an answer takes', () => {
  assert.match(SAVED_BIDS_CLAUSE, /how long the ones you heard back on took/);
});
