import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize, PRESETS } from './model.mjs';
import { estimate, sourceLabel, shoppingCsv } from './estimate.mjs';
import { OFFERS, storeComparison } from './catalog.mjs';
import { itemPrice } from './prices.mjs';
import { EXAMPLE_ITEMS } from './lumber.mjs';

test('an estimate never reads as a listed price, even when it links the page it came from', () => {
  let linkedEstimates = 0;
  for (const k of Object.keys(EXAMPLE_ITEMS)) {
    const s = itemPrice(k);
    if (s.kind !== 'estimate') continue;
    assert.match(sourceLabel(s), /estimate\)?$/, k);
    if (s.url) linkedEstimates += 1;
  }
  // The gravel price is an estimate from a cost guide, and it links that guide.
  assert.ok(linkedEstimates >= 1);
  assert.match(sourceLabel(itemPrice('gravelTon')), /\(estimate\)$/);
  assert.match(sourceLabel({ kind: 'derived', store: 'Home Depot', seen: '2026-10-29' }), /\(scaled\)$/);
  assert.equal(sourceLabel({ kind: 'listed', store: 'Home Depot', seen: '2026-10-29' }), 'Home Depot, 2026-10-29');
  assert.equal(sourceLabel({ kind: 'yours', price: 3 }), 'your price');
  assert.equal(sourceLabel({ kind: 'estimate', price: 10, note: 'no listing' }), 'estimate');
  const est = estimate(buildShed(normalize({ ...defaultDesign(), foundation: 'gravel' })));
  const csv = shoppingCsv(est);
  for (const r of est.shopping.filter((x) => x.source?.kind === 'estimate')) assert.ok(csv.includes(sourceLabel(r.source)), r.name);
});

test('store comparison shows each store once, and the line\'s own store at the price the line uses', () => {
  for (const d of [defaultDesign(), PRESETS['8x12 classic'](), { ...defaultDesign(), sidingType: 'LP SmartSide' }, { ...defaultDesign(), sidingType: 'LP SmartSide 7/16' }]) {
    const est = estimate(buildShed(normalize(d)));
    for (const row of storeComparison(est).rows) {
      const stores = row.offers.map((o) => o.store);
      assert.equal(new Set(stores).size, stores.length, `${row.line.name}: ${stores}`);
      const s = row.line.source;
      if (s?.kind === 'listed') {
        const own = row.offers.find((o) => o.store === s.store);
        assert.equal(own?.price, row.line.price, row.line.name);
      }
      // No "saving" for buying from the store the line is already priced at.
      if (row.best.store === s?.store) assert.equal(row.saving, 0, row.line.name);
    }
  }
});

test('a catalogue offer from the store a line is priced at carries the same price', () => {
  for (const [k, list] of Object.entries(OFFERS)) {
    if (k.startsWith('lumber:')) continue;
    const s = itemPrice(k);
    const same = list.find((o) => o.store === s.store);
    if (s.kind === 'listed' && same) assert.equal(same.price, s.price, `${k}: ${s.store} offer ${same.price}, listing ${s.price}`);
  }
});

test('a custom-size door or window is named as not in the total, and a picked unit is priced', () => {
  const d = PRESETS['8x12 classic']();
  const est = estimate(buildShed(normalize(d)));
  assert.equal(est.unpriced.length, 3);
  assert.match(est.unpriced[0], /^Door 38" x 82" on the front wall \(custom size\)$/);
  assert.match(shoppingCsv(est), /Not in the total,"Door 38/);
  const picked = { ...d, openings: d.openings.map((op) => (op.kind === 'door' ? { ...op, product: 'site-built' } : { ...op, product: 'swm-2436' })) };
  const est2 = estimate(buildShed(normalize(picked)));
  assert.deepEqual(est2.unpriced, []);
  assert.ok(est2.shopping.some((r) => r.section === 'Doors and windows' && r.qty === 2));
  assert.ok(est2.shopping.some((r) => r.section === 'Door hardware'));
});
