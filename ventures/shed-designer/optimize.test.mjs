import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeCuts, usedLength } from './optimize.mjs';

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
