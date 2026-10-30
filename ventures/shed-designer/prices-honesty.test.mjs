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
  assert.match(est.unpriced[0], /^Door 38" x 82" on the front wall \(custom size; typical range \$246\.00 to \$615\.00 across the 5 single shed doors in our catalogue\)$/);
  assert.match(shoppingCsv(est), /Not in the total,"Door 38/);
  const picked = { ...d, openings: d.openings.map((op) => (op.kind === 'door' ? { ...op, product: 'site-built' } : { ...op, product: 'swm-2436' })) };
  const est2 = estimate(buildShed(normalize(picked)));
  assert.deepEqual(est2.unpriced, []);
  assert.ok(est2.shopping.some((r) => r.section === 'Doors and windows' && r.qty === 2));
  assert.ok(est2.shopping.some((r) => r.section === 'Door hardware'));
});

test('a custom-size opening counts at the range median only when asked, marked as an estimate', () => {
  const d = PRESETS['8x12 classic']();
  const off = estimate(buildShed(normalize(d)));
  const on = estimate(buildShed(normalize({ ...d, customRange: true })));
  assert.deepEqual(on.unpriced, []);
  const lines = on.shopping.filter((r) => r.section === 'Doors and windows');
  assert.equal(lines.length, 3);
  for (const r of lines) {
    assert.match(r.name, /custom size: typical range .* counted at the median$/);
    assert.equal(r.source.kind, 'estimate');
    assert.equal(sourceLabel(r.source), 'estimate', 'never reads as a listing');
    assert.equal(r.source.url, undefined, 'links no listing');
  }
  assert.equal(Math.round((on.total - off.total) * 100) / 100, Math.round(lines.reduce((t, r) => t + r.total, 0) * 100) / 100);
  // A double door is compared with the double doors.
  const wide = estimate(buildShed(normalize({ ...d, openings: [{ id: 'o1', kind: 'door', wall: 'left', offset: 18, width: 60, height: 74 }] })));
  assert.match(wide.unpriced[0], /\$465\.00 to \$585\.00 across the 2 double shed doors/);
});

test('a custom window is priced against catalogue windows of about its size', async () => {
  const { catalogueRange } = await import('./products.mjs');
  const small = catalogueRange('window', 14, 21);
  const big = catalogueRange('window', 32, 24);
  assert.ok(small && big);
  assert.ok(small.hi < big.median, `a 14 x 21 (${small.lo}-${small.hi}) costs less than a 32 x 24 (median ${big.median})`);
  assert.match(big.group, /nearest that size/);
  assert.ok(small.n >= 3 && big.n >= 3, 'never fewer than three units');
  // Without a height it is the whole kind, as before.
  assert.equal(catalogueRange('window', 32).n, 8);
});
