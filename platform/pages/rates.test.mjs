import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SHOP_RATE_FIELDS,
  SHOP_RATES_KEY,
  injectShopRates,
  normalizeRates,
  pageCarriesShopRates,
  parseStoredRates,
  serializeRates,
} from './rates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.join(HERE, '..', '..', 'ventures');

const page = (body, head = '') =>
  `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;

const form = SHOP_RATE_FIELDS.map((f) => `<input id="${f.id}" type="number" value="1">`).join('');

// ---------------------------------------------------------------------------
// The field spec against the actual products
// ---------------------------------------------------------------------------

test('every trade bid calculator on main carries all four shop-rate fields', async () => {
  const slugs = (await fs.readdir(VENTURES, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-bid-calculator'))
    .map((entry) => entry.name);

  assert.ok(slugs.length >= 30, `expected the bid-calculator family, saw ${slugs.length}`);

  const missing = [];
  for (const slug of slugs) {
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
// Injection
// ---------------------------------------------------------------------------

test('injectShopRates adds the bar, the style and the script exactly once', () => {
  const once = injectShopRates(page(form));
  assert.match(once, /data-pf-rates-root/);
  assert.match(once, /<style>\s*\n\.pf-rates\{/);
  assert.match(once, /<script type="module">/);
  assert.equal(injectShopRates(once), once, 'the pass must be safe to run twice');
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
  const script = out.slice(out.lastIndexOf('<script'));
  assert.match(script, /^<script type="module">/);
});

test('nothing is injected into a fragment with no body', () => {
  const fragment = `<div>${form}</div>`;
  assert.equal(injectShopRates(fragment), fragment);
});

test('a page with no head still gets the stylesheet before the bar it styles', () => {
  const out = injectShopRates(`<body>${form}</body>`);
  assert.ok(out.indexOf('.pf-rates{') < out.indexOf('data-pf-rates-root'));
});

test('the injected script names the storage key and every field id', () => {
  const out = injectShopRates(page(form));
  assert.ok(out.includes(JSON.stringify(SHOP_RATES_KEY)));
  for (const field of SHOP_RATE_FIELDS) assert.ok(out.includes(`"${field.id}"`), field.id);
});

test('the bar carries the privacy statement it has to carry', () => {
  const out = injectShopRates(page(form));
  assert.match(out, /Kept in this browser only/);
  assert.match(out, /Nothing is uploaded/);
});

test('the injected script honours the site-wide usage opt-out', () => {
  const out = injectShopRates(page(form));
  assert.match(out, /doNotTrack/);
  assert.match(out, /globalPrivacyControl/);
  assert.match(out, /portfolio-hub-optout/);
});

test('a bid link keeps the sender numbers unless the visitor asks otherwise', () => {
  // The rule `share.mjs` exists to protect: a link that computes a different
  // price for the recipient than the sender saw is worse than no link.
  const out = injectShopRates(page(form));
  assert.match(out, /if \(!force && params\.has\(f\.id\)\)/);
});
