// Unit tests for compact.mjs on hand-built rectangle rasters, where the
// shortest strip is known, so a weaker search or a broken stopping rule
// shows up as a longer strip (red-team run 2026-11-23: 8 of 12 seeded faults
// in compact.mjs passed nest.test.mjs, which only checks that compaction
// never lengthens a sheet and keeps the gap).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compactSheet } from "./compact.mjs";
import { dilate } from "./nest.mjs";

function rect(w, h) {
  return { w, h, grid: new Uint8Array(w * h).fill(1), spans: Array.from({ length: h }, () => [[0, w]]) };
}
function shape(w, h, k) {
  const rots = [];
  const a = rect(w, h);
  rots.push({ deg: 0, mask: a, dmask: dilate(a, k), fits: true });
  if (w !== h) { const b = rect(h, w); rots.push({ deg: 90, mask: b, dmask: dilate(b, k), fits: true }); }
  return { rots };
}
// Every placement inside the strip, and every pair at least k cells apart.
function assertValid(pl, shapes, env, k) {
  const box = (p) => { const m = shapes[p.si].rots[p.ri].mask; return { x: p.x, y: p.y, w: m.w, h: m.h }; };
  const bs = pl.map(box);
  for (const b of bs) {
    assert.ok(b.x >= env.lo.i && b.y >= env.lo.j, `part at ${b.x},${b.y} before the strip's start`);
    assert.ok(b.x + b.w - 1 <= env.hi.i && b.y + b.h - 1 <= env.hi.j, `part at ${b.x},${b.y} past the strip's edge`);
  }
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const apart = a.x + a.w + k <= b.x || b.x + b.w + k <= a.x || a.y + a.h + k <= b.y || b.y + b.h + k <= a.y;
    assert.ok(apart, `parts ${i} and ${j} closer than ${k} cells`);
  }
}
// n squares of side s laid in one row on a strip two squares (plus gap) high.
function rowOfSquares(n, s, k) {
  const H = 2 * s + k;
  const shapes = [shape(s, s, k)];
  const pl = Array.from({ length: n }, (_, c) => ({ si: 0, c, ri: 0, x: c * (s + k), y: 0 }));
  const env = { GW: n * (s + k), GH: H, lo: { i: 0, j: 0 }, hi: { i: n * (s + k) - 1, j: H - 1 } };
  return { shapes, pl, env };
}

test("four squares in a row fold into two columns, with and without a gap", () => {
  for (const k of [0, 1, 2]) for (const seed of [1, 7, 4242]) {
    const { shapes, pl, env } = rowOfSquares(4, 5, k);
    const before = JSON.stringify(pl);
    const r = compactSheet(pl, shapes, env, { moves: 2000, seed });
    assert.equal(JSON.stringify(pl), before, "input placements left untouched");
    assert.equal(r.extent, 2 * 5 + k, `k=${k} seed=${seed}: extent ${r.extent}`);
    assert.ok(r.successes > 0);
    assertValid(r.placements, shapes, env, k);
  }
});

test("a separation that succeeds on its last round is kept (rounds: 1)", () => {
  for (const seed of [1, 7, 4242]) {
    const { shapes, pl, env } = rowOfSquares(4, 5, 1);
    const r = compactSheet(pl, shapes, env, { moves: 2000, seed, rounds: 1 });
    assert.equal(r.extent, 11, `seed=${seed}: extent ${r.extent}`);
    assertValid(r.placements, shapes, env, 1);
  }
});

test("six 8x2 bars laid 3 wide in two rows fold into two columns of three", () => {
  // Strip 8 high, gap 1: three flat bars stack to exactly 2+1+2+1+2 = 8 rows,
  // so two columns need 8 + 1 + 8 = 17 (the greedy left them 26 long). Any
  // mix of upright (2 wide) and flat bars also needs 17.
  const k = 1;
  for (const seed of [1, 3, 4242]) {
    const shapes = [shape(8, 2, k)];
    const pl = [];
    for (let c = 0; c < 6; c++) pl.push({ si: 0, c, ri: 0, x: (c % 3) * 9, y: Math.floor(c / 3) * 3 });
    const env = { GW: 40, GH: 8, lo: { i: 0, j: 0 }, hi: { i: 39, j: 7 } };
    const r = compactSheet(pl, shapes, env, { moves: 3000, seed });
    assertValid(r.placements, shapes, env, k);
    assert.equal(r.extent, 17, `seed=${seed}: extent ${r.extent}`);
  }
});

test("one part, or nothing to gain, returns the input", () => {
  const { shapes, env } = rowOfSquares(1, 5, 0);
  const one = [{ si: 0, c: 0, ri: 0, x: 0, y: 0 }];
  const r = compactSheet(one, shapes, env, { moves: 100 });
  assert.equal(r.placements, one);
  assert.equal(r.extent, 5);
  assert.equal(r.attempts, 0);
  // already optimal: two squares stacked, nothing shorter exists
  const two = [{ si: 0, c: 0, ri: 0, x: 0, y: 0 }, { si: 0, c: 1, ri: 0, x: 0, y: 5 }];
  const r2 = compactSheet(two, shapes, { ...env, GW: 10, hi: { i: 9, j: 9 } }, { moves: 300 });
  assert.equal(r2.placements, two);
  assert.equal(r2.extent, 5);
  assert.equal(r2.successes, 0);
});
