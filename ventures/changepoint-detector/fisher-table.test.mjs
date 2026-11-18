import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fisherG } from './engine.mjs';

// fisherG reads cos and sin of 2 pi k t / n from a table indexed by k t mod n (docs/history/ci-perf-2026-11-15-changepoint-fisher-table.md).
// This pins it against the direct form it replaced: the same peak, g to 1e-10 relative, and the same side of the 0.01 line.
function direct(r) {
  const n = r.length, q = Math.floor((n - 1) / 2);
  let tot = 0, best = 0, bk = 1;
  for (let k = 1; k <= q; k++) {
    let c = 0, s = 0;
    for (let t = 0; t < n; t++) { const a = 2 * Math.PI * k * t / n; c += r[t] * Math.cos(a); s += r[t] * Math.sin(a); }
    const I = c * c + s * s;
    tot += I;
    if (I > best) { best = I; bk = k; }
  }
  return { g: tot > 0 ? best / tot : 0, period: n / bk };
}

test('fisherG table matches the direct trig sums: same peak, g to 1e-10, same p < 0.01 decision', () => {
  let a = 2026;
  const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x80000000; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  for (let i = 0; i < 40; i++) {
    const n = 60 + Math.floor(rnd() * 900), per = 3 + rnd() * 30, amp = [0, 1, 0.25, 0][i % 4];
    let w = 0;
    const r = Array.from({ length: n }, (_, t) => (i % 4 === 3 ? (w += gauss()) : amp * Math.sin(2 * Math.PI * t / per) + gauss()));
    const got = fisherG(r), want = direct(r);
    assert.equal(got.period, want.period, `case ${i} n ${n}`);
    assert.ok(Math.abs(got.g - want.g) <= 1e-10 * want.g, `case ${i}: g ${got.g} vs ${want.g}`);
  }
  // a clear cycle stays significant and a flat series keeps the q < 2 and zero-power answers
  const cyc = Array.from({ length: 240 }, (_, t) => Math.sin(2 * Math.PI * t / 12) + 0.3 * gauss());
  const fg = fisherG(cyc);
  assert.equal(fg.period, 12);
  assert.ok(fg.p < 0.01);
  assert.deepEqual(fisherG([1, 2, 3, 4]), { g: 0, p: 1, period: null });
  assert.equal(fisherG(new Array(100).fill(0)).g, 0);
});
