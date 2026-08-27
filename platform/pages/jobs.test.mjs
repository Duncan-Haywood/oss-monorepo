import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXCLUDED_FIELD_IDS,
  SAVED_BIDS_CLAUSE,
  addSavedBidsClause,
  MAX_SAVED_BIDS,
  MIN_SAVEABLE_FIELDS,
  SAVED_BIDS_KEY,
  injectSavedBids,
  normalizeBid,
  normalizeBidName,
  pageSaveableFieldIds,
  pageTakesSavedBids,
  parseStoredBids,
  restoreMismatch,
  serializeBids,
} from './jobs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.join(HERE, '..', '..', 'ventures');

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
  assert.match(out, /"roofing-bid-calculator"/);
  assert.match(out, new RegExp(SAVED_BIDS_KEY));
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
  assert.match(out, /<section class="pf-jobs" hidden data-pf-jobs-root>/);
  assert.match(out, /root\.hidden = false/);
});

/**
 * Rendered at build time rather than assembled in script, so a crawler and an
 * answer engine can see that these tools keep a bid.
 */
test('the explanation is in the markup, not built by script', () => {
  const out = injectSavedBids(page(inputs(6)), 'x');
  assert.match(out, /still here when the customer calls back/);
});

test('the slug is JSON-encoded into the script, not interpolated raw', () => {
  const out = injectSavedBids(page(inputs(6)), 'a"b');
  assert.match(out, /var SLUG = "a\\"b"/);
});

// ---------------------------------------------------------------------------
// Structured data — #1894's lesson, applied to this feature
// ---------------------------------------------------------------------------

const ld = (list, spacing = '') =>
  `<script type="application/ld+json">{"@type":"WebApplication","featureList":${spacing}"${list}"}</script>`;

test('the clause is appended to a page’s feature list', () => {
  const out = addSavedBidsClause(page(ld('Roof squares, waste factor')));
  assert.match(out, /"featureList":"Roof squares, waste factor, saved bids you can name, reopen and reprice"/);
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
  assert.match(out, /"featureList":"A 12\\" run, B, saved bids you can name, reopen and reprice"/);
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
