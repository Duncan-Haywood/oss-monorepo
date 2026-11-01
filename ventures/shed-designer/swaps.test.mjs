import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, PRESETS } from './model.mjs';
import { estimate, shoppingCsv, sourceLabel } from './estimate.mjs';
import { costBreakdown } from './costs.mjs';
import { applySwaps, cleanSwap, cleanSwaps, swapKey } from './swaps.mjs';

const first = () => PRESETS['8x10']();

function sidedEstimate() {
  const shed = buildShed(normalize({ ...first(), siding: true, sidingType: 'T1-11' }));
  return { shed, est: estimate(shed) };
}

test('a swap replaces the line, keeps its section and key, and reprices the total', () => {
  const { shed, est } = sidedEstimate();
  const line = est.shopping.find((r) => r.section === 'Siding' && /T1-11/.test(r.name));
  assert.ok(line, 'the design buys T1-11');
  const key = swapKey(line);
  const out = applySwaps(est, { [key]: { name: 'Primed wood lap siding, 8 in x 16 ft', price: 30, qty: 40, unit: 'piece', url: 'https://www.homedepot.com/p/x/1' } }, 7);
  const r = out.shopping.find((x) => x.name.startsWith('Primed wood'));
  assert.equal(out.swapped, 1);
  assert.equal(r.section, 'Siding');
  assert.equal(r.source.key, line.source.key);
  assert.equal(r.total, 1200);
  assert.equal(r.unit, 'piece');
  assert.equal(r.was.name, line.name);
  assert.equal(sourceLabel(r.source), 'your price');
  const diff = 1200 - line.total;
  assert.ok(Math.abs(out.total - (est.total + diff)) < 0.011);
  assert.equal(out.tax, Math.round(out.total * 7) / 100);
  // The breakdown still adds up to the list's total, with the swap under siding.
  const b = costBreakdown(shed, out);
  const sum = b.assemblies.reduce((t, g) => t + g.total, 0);
  assert.ok(Math.abs(sum - out.total) < 0.05);
  assert.ok(b.assemblies.find((g) => g.key === 'siding').lines.some((l) => l.name.startsWith('Primed wood')));
  assert.match(shoppingCsv(out), /Primed wood lap siding/);
});

test('without a quantity the swap keeps the list quantity', () => {
  const { est } = sidedEstimate();
  const line = est.shopping.find((r) => r.section !== 'Lumber');
  const out = applySwaps(est, { [swapKey(line)]: { name: 'Mine', price: 1 } });
  const r = out.shopping.find((x) => x.name === 'Mine');
  assert.equal(r.qty, line.qty);
  assert.equal(r.total, Math.round(line.qty * 100) / 100);
});

test('lumber lines are not swappable and no swaps leave the estimate alone', () => {
  const { est } = sidedEstimate();
  assert.equal(swapKey(est.shopping.find((r) => r.section === 'Lumber')), '');
  const out = applySwaps(est, {});
  assert.equal(out.total, est.total);
  assert.equal(out.swapped, 0);
  assert.equal(applySwaps(est, { nothing: { name: 'x', price: 1 } }).total, est.total);
});

test('bad swaps are dropped and only web links are kept', () => {
  assert.equal(cleanSwap({ name: '', price: 3 }), null);
  assert.equal(cleanSwap({ name: 'a', price: -1 }), null);
  assert.equal(cleanSwap({ name: 'a', price: 'x' }), null);
  assert.equal(cleanSwap({ name: 'a', price: 2, url: 'javascript:alert(1)' }).url, undefined);
  assert.equal(cleanSwap({ name: 'a', price: 2, url: 'https://www.homedepot.com/p/1' }).url, 'https://www.homedepot.com/p/1');
  assert.equal(cleanSwap({ name: 'a', price: 2, qty: '' }).qty, undefined);
  assert.equal(cleanSwap({ name: 'a', price: 2, qty: 0 }).qty, undefined);
  assert.deepEqual(cleanSwaps({ k: { name: 'a', price: 1 }, bad: { price: 1 } }), { k: { name: 'a', price: 1 } });
  assert.deepEqual(cleanSwaps([1, 2]), {});
});
