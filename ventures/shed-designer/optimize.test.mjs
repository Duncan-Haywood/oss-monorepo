import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeCuts, patternLP, usedLength } from './optimize.mjs';

const stocks = [8, 10, 12, 14, 16].map((ft) => ({ length: ft * 12, price: ft }));

test('kerf is counted between cuts', () => {
  assert.equal(usedLength([{ len: 90 }, { len: 90 }], 0.125), 180.125);
  assert.equal(usedLength([], 0.125), 0);
});

// The offcut is what is left after the last saw cut, so it loses one more kerf.
test('two studs share a 16 ft board when it is no dearer per foot', () => {
  const r = optimizeCuts([{ len: 91.5 }, { len: 91.5 }], stocks, 0.125);
  assert.equal(r.boards.length, 1);
  assert.equal(r.boards[0].stock, 192);
  assert.ok(Math.abs(r.boards[0].offcut - (192 - 183.125 - 0.125)) < 1e-9);
});

test('a cheaper short board wins when long boards cost more per foot', () => {
  const pricey = [{ length: 96, price: 4 }, { length: 192, price: 12 }];
  const r = optimizeCuts([{ len: 91.5 }, { len: 91.5 }], pricey, 0.125);
  assert.deepEqual(r.boards.map((b) => b.stock), [96, 96]);
  assert.equal(r.cost, 8);
});

test('every piece is cut exactly once, and the cost is never under the lower bound', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 40; k++) {
    const pieces = Array.from({ length: 5 + Math.floor(rnd() * 30) }, (_, i) => ({ len: Math.round((6 + rnd() * 180) * 16) / 16, id: String(i) }));
    const r = optimizeCuts(pieces, stocks, 0.125);
    const ids = r.boards.flatMap((b) => b.cuts.map((c) => c.id)).sort();
    assert.deepEqual(ids, pieces.map((p) => p.id).sort());
    for (const b of r.boards) assert.ok(usedLength(b.cuts, 0.125) <= b.stock + 1e-9);
    assert.ok(r.cost + 1e-9 >= r.lowerBound);
  }
});

test('pieces longer than any board are reported, not dropped silently', () => {
  const r = optimizeCuts([{ len: 200 }, { len: 50 }], stocks, 0.125);
  assert.equal(r.tooLong.length, 1);
  assert.equal(r.boards.length, 1);
});

/** The true cheapest order for a few pieces: every way to group them, each group in its cheapest board. */
function bruteForce(pieces, stockList, kerf) {
  const cheapest = (cuts) => {
    const used = usedLength(cuts, kerf);
    let best = Infinity;
    for (const s of stockList) if (s.length + 1e-9 >= used) best = Math.min(best, s.price);
    return best;
  };
  let best = Infinity;
  const groups = [];
  const go = (i, cost) => {
    if (cost >= best) return;
    if (i === pieces.length) { best = cost; return; }
    for (const g of groups) {
      const before = cheapest(g);
      g.push(pieces[i]);
      const after = cheapest(g);
      if (after < Infinity) go(i + 1, cost - before + after);
      g.pop();
    }
    groups.push([pieces[i]]);
    go(i + 1, cost + cheapest([pieces[i]]));
    groups.pop();
  };
  go(0, 0);
  return best;
}

test('the lower bound never exceeds the true optimum, and the order is often exactly optimal', () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Real board prices do not scale with length, so price them unevenly.
  const uneven = [{ length: 96, price: 4.98 }, { length: 120, price: 7.25 }, { length: 144, price: 8.4 }, { length: 192, price: 12.9 }];
  let optimal = 0;
  for (let k = 0; k < 60; k++) {
    const pieces = Array.from({ length: 3 + Math.floor(rnd() * 6) }, () => ({ len: Math.round((12 + rnd() * 170) * 16) / 16 }));
    const r = optimizeCuts(pieces, uneven, 0.125);
    const best = bruteForce([...pieces].sort((a, b) => b.len - a.len), uneven, 0.125);
    assert.ok(r.lowerBound <= best + 1e-6, `bound ${r.lowerBound} above optimum ${best}`);
    assert.ok(r.cost + 1e-9 >= best);
    if (Math.abs(r.cost - best) < 1e-6) optimal++;
  }
  assert.ok(optimal >= 59, `${optimal} of 60 optimal`);
});

test('the relaxation beats the per-inch bound when pieces waste boards', () => {
  // Two 50" pieces and a kerf do not fit an 8 ft board, so three need three boards.
  const r = optimizeCuts([{ len: 50 }, { len: 50 }, { len: 50 }], [{ length: 96, price: 8 }], 0.125);
  assert.equal(r.cost, 24);
  // Per inch the bound would be 150 / 96 x $8 = $12.50; the relaxation proves $24.
  assert.equal(r.lowerBound, 24);
  assert.equal(r.gap, 0);
});

test('patternLP certifies a simple case exactly', () => {
  // 4 pieces of 45" and 2 of 90" from 96" boards at $10: the relaxation needs 4 boards (2 + 2), as does the order.
  const lp = patternLP([90, 45], [2, 4], [{ length: 96, price: 10 }], 0.125);
  assert.ok(lp && lp.optimal);
  assert.ok(Math.abs(lp.bound - 40) < 1e-6, String(lp?.bound));
  const r = optimizeCuts([90, 90, 45, 45, 45, 45].map((len) => ({ len })), [{ length: 96, price: 10 }], 0.125);
  assert.equal(r.cost, 40);
  assert.equal(r.gap, 0);
});

test('the relaxation\'s fractional patterns are tried rounded up as well as down', () => {
  // A 2x6 cut list from a preset's options (rafters, eave blocks, sub-fascia) at the starting prices.
  const pieces = [[21, 8], [35, 4], [144, 2], [79.5, 14], [21.75, 2], [20.25, 2]].flatMap(([len, n]) => Array.from({ length: n }, () => ({ len })));
  const stocks = [[96, 6.83], [120, 12.48], [144, 10.68], [168, 14.78], [192, 14.34]].map(([length, price]) => ({ length, price }));
  const r = optimizeCuts(pieces, stocks, 0.125);
  // Rounding only down cost $139.44; taking a fractional pattern once more gives $139.25.
  assert.ok(r.cost <= 139.25 + 1e-9, String(r.cost));
  assert.ok(r.cost >= r.lowerBound - 1e-9);
  assert.equal(r.boards.flatMap((b) => b.cuts).length, pieces.length);
  for (const b of r.boards) assert.ok(b.used <= b.stock + 1e-9);
});
