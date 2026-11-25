// The footer line that points a free tool at the for-profit product it is a
// smaller piece of (portfolio/monetization/funnels.json, owner 2026-11-24).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectChrome, loadProductFunnels } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const funnels = JSON.parse(readFileSync(path.join(root, 'portfolio/monetization/funnels.json'), 'utf8'));
const transition = JSON.parse(readFileSync(path.join(root, 'portfolio/monetization/transition.json'), 'utf8'));
const products = new Set(transition.proprietary.map((p) => p.venture));

test('every funnel points at a for-profit product from a free tool that exists', () => {
  const seen = new Set();
  for (const [product, { pitch, feeders }] of Object.entries(funnels.products)) {
    assert.ok(products.has(product), `${product} is not a proprietary product in transition.json`);
    assert.ok(existsSync(path.join(root, 'ventures', product)), `${product} has no venture directory`);
    assert.ok(pitch && pitch.length <= 160 && !/[.]$/.test(pitch), `${product}: one short line, no full stop (the footer adds it)`);
    assert.ok(!/\$|£|€|free|best|#1|guarantee/i.test(pitch), `${product}: the pitch states what it does, with no price or superlative`);
    for (const feeder of feeders) {
      assert.ok(existsSync(path.join(root, 'ventures', feeder)), `${feeder} has no venture directory`);
      assert.ok(!products.has(feeder), `${feeder} is itself a product`);
      assert.ok(!seen.has(feeder), `${feeder} feeds two products`);
      seen.add(feeder);
    }
  }
});

test('loadProductFunnels maps each feeder to its product and pitch', () => {
  const map = loadProductFunnels(root);
  const [product, { pitch, feeders }] = Object.entries(funnels.products)[0];
  assert.deepEqual(map.get(feeders[0]), { product, pitch });
  assert.equal(map.get(product), undefined, 'a product does not point at itself');
  assert.equal(loadProductFunnels(path.join(root, 'no-such-dir')).size, 0, 'a missing file is an empty map');
});

const page = '<!doctype html><html><head><title>T</title></head><body><main><p>tool</p></main></body></html>';
const chrome = (extra) => injectChrome(page, { slug: 'stripe-payout-to-journal', toRoot: '../', total: 3, ...extra });

test('a feeder page carries one tracked link to its product, above the related tools', () => {
  const html = chrome({ product: { slug: 'sales-export-to-journal', title: 'Sales Export to Journal', pitch: 'any platform <export>' } });
  const line = html.match(/<p class="pf-product">.*?<\/p>/)?.[0];
  assert.ok(line, 'the product line is in the footer');
  assert.match(line, /href="\.\.\/sales-export-to-journal\/" data-pf-to="sales-export-to-journal" data-pf-funnel>Sales Export to Journal<\/a>: any platform &lt;export&gt;\./);
  assert.ok(html.indexOf('pf-product') < html.indexOf('<h2>More free tools</h2>'));
});

test('a page with no funnel has no product line', () => {
  assert.ok(!chrome({}).includes('pf-product'));
});
