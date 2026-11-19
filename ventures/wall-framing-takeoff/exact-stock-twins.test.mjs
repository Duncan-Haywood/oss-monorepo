// exactStock drops a cut's copies on dearer boards before its DP (perf, 2026-11-19). The
// answer must be the one the plain DP over every board's patterns gives: same cost, same
// bars in the same order, same board for every bar. `reference` below is that plain DP,
// kept as the exactStock of 2026-11-18 minus its bitset index (the bitsets visit fitting
// patterns lowest index first, which is what the plain j loop does).
import test from "node:test";
import assert from "node:assert/strict";
import { exactStock } from "./engine.mjs";

function reference(items, boards, workLimit = 3e7) {
  const n = items.length;
  const radix = items.map((it) => it.d + 1);
  let states = 1;
  for (const r of radix) { states *= r; if (states > 2e5) return null; }
  const pats = [];
  for (let k = 0; k < boards.length; k++) {
    const c = new Array(n).fill(0);
    const rec = (i, room) => {
      if (pats.length * states > workLimit) return;
      if (i === n) { if (c.some((v) => v)) pats.push({ board: k, counts: [...c], price: boards[k].price }); return; }
      for (let v = 0; v <= items[i].d && v * items[i].w <= room; v++) { c[i] = v; rec(i + 1, room - v * items[i].w); }
      c[i] = 0;
    };
    rec(0, boards[k].cap);
  }
  if (pats.length * states > workLimit) return null;
  const mult = [];
  let m = 1;
  for (const r of radix) { mult.push(m); m *= r; }
  const step = pats.map((p) => p.counts.reduce((s, v, i) => s + v * mult[i], 0));
  const f = new Float64Array(states).fill(Infinity);
  const how = new Int32Array(states).fill(-1);
  f[0] = 0;
  const d = new Array(n).fill(0);
  for (let idx = 1; idx < states; idx++) {
    let k = 0;
    d[0]++;
    while (d[k] === radix[k]) { d[k] = 0; k++; d[k]++; }
    let best = Infinity;
    let arg = -1;
    for (let j = 0; j < pats.length; j++) {
      if (!pats[j].counts.every((c, i) => c <= d[i])) continue;
      const v = pats[j].price + f[idx - step[j]];
      if (v < best - 1e-12) { best = v; arg = j; }
    }
    f[idx] = best;
    how[idx] = arg;
  }
  const bars = [];
  for (let idx = states - 1; idx > 0; idx -= step[how[idx]]) {
    const p = pats[how[idx]];
    const pieces = [];
    p.counts.forEach((v, i) => { for (let t = 0; t < v; t++) pieces.push(i); });
    bars.push({ board: p.board, pieces, used: pieces.reduce((s, i) => s + items[i].w, 0) });
  }
  return { cost: f[states - 1], bars };
}

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("exactStock matches the plain DP over every board's patterns on 300 seeded instances", () => {
  const rand = rng(1119);
  let solved = 0;
  let twins = 0;
  for (let n = 0; n < 300; n++) {
    const kinds = 1 + Math.floor(rand() * 4);
    const items = Array.from({ length: kinds }, () => ({ w: 200 + Math.floor(rand() * 1400), d: 1 + Math.floor(rand() * 4) }));
    // Price shapes: lumber-yard cents, equal prices on two boards, a cheaper board listed
    // after a dearer longer one, and whole-dollar prices.
    const feet = [8, 10, 12, 14, 16].filter(() => rand() < 0.8);
    if (!feet.length) feet.push(16);
    const shape = n % 4;
    let boards = feet.map((f) => ({
      cap: f * 12 * 16 + 2,
      price: shape === 0 ? Math.round(f * (0.8 + rand() * 0.6) * 100) / 100 : shape === 1 ? 10 : f,
    }));
    if (shape === 2) boards = boards.reverse();
    if (shape === 3) boards.push({ cap: 104 * 16 + 2, price: 8.72 });
    if (items.some((it) => it.w > Math.max(...boards.map((b) => b.cap)))) continue;
    const want = reference(items, boards);
    const got = exactStock(items, boards);
    assert.equal(got === null, want === null, `case ${n}: null-ness`);
    if (!want) continue;
    solved++;
    if (boards.length > 1) twins++;
    assert.equal(got.cost, want.cost, `case ${n}`);
    assert.deepEqual(got.bars, want.bars, `case ${n}`);
  }
  assert.ok(solved >= 200, `only ${solved} instances solved`);
  assert.ok(twins >= 150, `only ${twins} instances with more than one board`);
});
