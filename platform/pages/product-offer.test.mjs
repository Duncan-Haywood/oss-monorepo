import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadFunnel, offerTable, renderProductOffer, OFFER_ATTR } from './product-offer.mjs';
import { injectChrome } from './build.mjs';

const root = new URL('../../', import.meta.url);
const funnel = loadFunnel();
const transition = JSON.parse(readFileSync(new URL('portfolio/monetization/transition.json', root), 'utf8'));
const proprietary = new Set(transition.proprietary.map((row) => row.venture));

test('every product is on the proprietary track and every feeder is a venture', () => {
  for (const [product, { pitch, feeders }] of Object.entries(funnel.products)) {
    assert.ok(proprietary.has(product), `${product} is not a proprietary product in transition.json`);
    assert.ok(existsSync(new URL(`ventures/${product}/`, root)), `${product} has no venture directory`);
    assert.ok(pitch && pitch.length <= 140, `${product}: pitch is missing or longer than 140 characters`);
    assert.ok(feeders.length > 0, `${product}: no feeders`);
    for (const feeder of feeders) {
      assert.ok(existsSync(new URL(`ventures/${feeder}/`, root)), `${feeder} (feeding ${product}) is not a venture`);
      assert.ok(!proprietary.has(feeder), `${feeder} is itself a product, not a lead magnet`);
    }
  }
});

test('a pitch claims no price, paid tier or superlative the product page cannot back', () => {
  for (const [product, { pitch }] of Object.entries(funnel.products)) {
    assert.doesNotMatch(pitch, /[$€£]|\b(paid|pro|premium|upgrade|subscribe|subscription|best|#1|guarantee\w*)\b/i, product);
  }
});

test('one product per feeder; a feeder listed twice throws', () => {
  const table = offerTable(funnel);
  assert.ok(table.size > 50);
  assert.throws(() => offerTable({ products: { a: { pitch: 'x', feeders: ['f'] }, b: { pitch: 'y', feeders: ['f'] } } }), /feeds both/);
});

test('an unpublished product makes no offer', () => {
  const table = offerTable(funnel, new Set(['cut-list-optimizer']));
  assert.equal(table.size, 0);
});

test('the line links the product, escapes, and carries the click attribute', () => {
  const html = renderProductOffer({ offer: { product: 'shed-designer', pitch: 'draws <sheds> & more' }, name: 'Shed Designer', toRoot: '../' });
  assert.match(html, /href="\.\.\/shed-designer\/"/);
  assert.match(html, new RegExp(`${OFFER_ATTR}="shed-designer"`));
  assert.match(html, /draws &lt;sheds&gt; &amp; more\./);
  assert.equal(renderProductOffer({ offer: null, toRoot: './' }), '');
});

test('injectChrome puts the offer in the footer, above the free-tool list, only when given', () => {
  const page = '<!doctype html><html><head><title>t</title></head><body><h1>Cut list</h1></body></html>';
  const base = { slug: 'cut-list-optimizer', toRoot: '../', total: 3, title: 'Cut List Optimizer' };
  const offer = { product: 'wall-framing-takeoff', pitch: 'lays out walls' };
  const withOffer = injectChrome(page, { ...base, offer, offerName: 'Wall Framing Takeoff' });
  const at = withOffer.indexOf('class="pf-product"');
  assert.ok(at > 0, 'offer line present');
  assert.ok(at < withOffer.indexOf('<h2>More free tools</h2>'), 'offer sits above the free-tool list');
  assert.match(withOffer, />Wall Framing Takeoff<\/a> lays out walls\./);
  assert.ok(!injectChrome(page, base).includes('pf-product'));
});
