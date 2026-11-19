// Whist designs for rotating-partner doubles: whist.mjs, whist-bases.mjs and americano()'s use of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { whistDesign, checkWhist, checkNearWhist, whistSizes, nearWhistSizes, whistRotation } from "./whist.mjs";
import { americano, americanoStats, validateAmericano } from "./calc.mjs";
import { directBase, multiplierSearch } from "./eval/whist-multiplier.mjs";

const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const opponentRange = (plan, n) => {
  let lo = Infinity, hi = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { lo = Math.min(lo, plan.opponent[i][j]); hi = Math.max(hi, plan.opponent[i][j]); }
  return [lo, hi];
};

test("whist: every stored base develops into a design where each pair partners once and opposes twice", () => {
  const sizes = whistSizes();
  for (const m of [4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29]) assert.ok(sizes.includes(m), `size ${m} stored`);
  for (const m of sizes) {
    assert.ok(m % 4 === 0 || m % 4 === 1, `size ${m} is 4k or 4k+1`);
    const d = whistDesign(m);
    assert.equal(d.length, m % 4 === 0 ? m - 1 : m, `round count for ${m}`);
    assert.ok(checkWhist(m, d), `design ${m}`);
    for (const r of d) assert.equal(r.out.length, m % 4, `sit-outs per round at ${m}`);
  }
  assert.equal(whistDesign(7), null);
});

test("near-whist: every stored 4k+2 base develops into a design that passes checkNearWhist", () => {
  const sizes = nearWhistSizes();
  for (const m of [6, 10, 14, 18, 22, 26, 30, 34, 38]) assert.ok(sizes.includes(m), `size ${m} stored`);
  for (const m of sizes) {
    const d = whistDesign(m);
    assert.equal(d.length, m, `round count for ${m}`);
    for (const r of d) assert.equal(r.out.length, 2, `two sit out each round at ${m}`);
    assert.ok(checkNearWhist(m, d), `design ${m}`);
    assert.equal(checkWhist(m, d), false, `${m} cannot be a full whist design`);
  }
});

test("near-whist: the two points out of a base round are an odd distance apart exactly when k is even", () => {
  // README "Near-whist designs by SAT": the k odd partner distances each join an even and an odd point,
  // so the seated evens and odds balance only for this parity; eval/near-whist-sat.py --out2 relies on it.
  for (const m of nearWhistSizes()) {
    const seated = new Set(whistDesign(m)[0].tables.flat());
    const [a, b] = [...Array(m).keys()].filter((i) => !seated.has(i));
    const k = (m - 2) / 4;
    assert.equal((b - a) % 2 === 1, k % 2 === 0, `size ${m}`);
  }
});

test("near-whist: checkNearWhist rejects a broken design and a whist design", () => {
  const d = whistDesign(10);
  const broken = d.map((r) => ({ ...r, tables: r.tables.map((t) => t.slice()) }));
  [broken[0].tables[0][1], broken[0].tables[1][1]] = [broken[0].tables[1][1], broken[0].tables[0][1]];
  assert.equal(checkNearWhist(10, broken), false);
  assert.equal(checkNearWhist(10, d.slice(1)), false);
  assert.equal(checkNearWhist(8, whistDesign(8)), false);
});

test("whist: checkWhist rejects a broken design", () => {
  const d = whistDesign(8);
  const broken = d.map((r) => ({ ...r, tables: r.tables.map((t) => t.slice()) }));
  [broken[0].tables[0][1], broken[0].tables[1][1]] = [broken[0].tables[1][1], broken[0].tables[0][1]];
  assert.equal(checkWhist(8, broken), false);
});

test("americano: a court for every four players gives the exact whist guarantee", () => {
  for (const n of whistSizes().filter((m) => m <= 29)) {
    const P = names(n);
    const plan = americano(P, { courts: Math.floor(n / 4), seed: n });
    assert.ok(plan.design, `n=${n} uses a design`);
    assert.deepEqual(validateAmericano(P, plan), []);
    const st = americanoStats(P, plan);
    assert.equal(st.repeatPartners, 0, `n=${n}`);
    assert.equal(st.unmetPartners, 0, `n=${n}`);
    assert.deepEqual(opponentRange(plan, n), [2, 2], `n=${n}`);
  }
});

test("americano: 39, 40, 41, 45, 49, 56, 63 and 64 players (eval/whist-multiplier.mjs, eval/whist-search.c) get the guarantee", () => {
  for (const m of [40, 41, 45, 49, 53, 56, 61, 64]) assert.ok(whistSizes().includes(m), `size ${m} stored`);
  for (const n of [40, 41, 45, 49, 56, 64]) {
    const P = names(n);
    const plan = americano(P, { courts: Math.floor(n / 4), seed: n });
    assert.ok(plan.design, `n=${n} uses a design`);
    assert.deepEqual(validateAmericano(P, plan), []);
    const st = americanoStats(P, plan);
    assert.equal(st.repeatPartners, 0, `n=${n}`);
    assert.equal(st.unmetPartners, 0, `n=${n}`);
    assert.deepEqual(opponentRange(plan, n), [2, 2], `n=${n}`);
  }
  for (const n of [39, 63]) { // 4k+3: the next design up with one empty seat
    const P = names(n);
    const plan = americano(P, { courts: Math.floor(n / 4), seed: n });
    assert.ok(plan.design, `n=${n} uses a design`);
    assert.equal(americanoStats(P, plan).repeatPartners, 0, `n=${n}`);
  }
});

test("whist: the field construction gives a whist design whenever every prime-power factor is 1 mod 4", () => {
  // eval/whist-multiplier.mjs, directBase: tables a & -a vs Ea & -Ea with E^2 = -1.
  const develop = (n, { mods, tables }) => {
    const co = (x) => mods.map((m) => { const c = x % m; x = Math.floor(x / m); return c; });
    const enc = (c) => c.reduceRight((acc, ci, i) => acc * mods[i] + ci, 0);
    const add = (a, b) => { const ca = co(a), cb = co(b); return enc(ca.map((x, i) => (x + cb[i]) % mods[i])); };
    return Array.from({ length: n }, (_, g) => ({ tables: tables.map((t) => t.map((p) => add(p, g))) }));
  };
  for (const n of [5, 9, 13, 17, 25, 29, 37, 41, 45, 49, 53, 61, 65, 73, 85, 89, 97, 101]) {
    const b = directBase(n);
    assert.ok(b, `n=${n} has a base`);
    assert.ok(checkWhist(n, develop(n, b)), `n=${n}`);
  }
  for (const n of [21, 33, 57, 69, 77]) assert.equal(directBase(n), null, `n=${n}: a factor 3 mod 4, no field construction`);
});

test("whist: an order-3 multiplier search finds 40 players on Z39 + infinity", () => {
  const r = multiplierSearch(40, 16, { ms: 30000 });
  assert.ok(r.tables, "found");
  assert.deepEqual(r.fixed, [0, 13, 26]);
});

test("americano: 20 and 24 players, where the greedy search repeats partners, now repeat none", () => {
  for (const n of [20, 24]) {
    const P = names(n);
    const courts = n / 4;
    const greedy = americanoStats(P, americano(P, { courts, whist: false }));
    const whist = americanoStats(P, americano(P, { courts }));
    assert.ok(greedy.repeatPartners > 0, `greedy repeats at ${n}`);
    assert.equal(whist.repeatPartners, 0);
  }
});

test("americano: 4k+3 players play the next design with one empty seat", () => {
  for (const n of [7, 11, 15, 19, 23, 27]) {
    const P = names(n);
    const plan = americano(P, { courts: Math.floor(n / 4), seed: 2 });
    assert.equal(plan.design?.ghosts, 1, `n=${n}`);
    assert.deepEqual(validateAmericano(P, plan), []);
    const st = americanoStats(P, plan);
    assert.equal(st.repeatPartners, 0);
    assert.ok(st.games.every((g) => g === n - 3), `n=${n} everyone plays ${n - 3}`);
    assert.deepEqual(opponentRange(plan, n), [1, 2]);
  }
});

test("americano: 4k+2 players play a near-whist design: one missed partner each, every pair meets", () => {
  for (const n of nearWhistSizes().filter((m) => m <= 30)) {
    const P = names(n);
    const courts = Math.floor(n / 4);
    const plan = americano(P, { courts, seed: n });
    assert.equal(plan.design?.near, true, `n=${n}`);
    assert.equal(plan.design.ghosts, 0);
    assert.equal(plan.rounds.length, n);
    assert.deepEqual(validateAmericano(P, plan), []);
    const st = americanoStats(P, plan);
    assert.equal(st.repeatPartners, 0, `n=${n}`);
    assert.equal(st.unmetPartners, n / 2, `n=${n}: a perfect matching never partners`);
    assert.ok(st.games.every((g) => g === n - 2), `n=${n} everyone plays ${n - 2}`);
    assert.deepEqual(opponentRange(plan, n), [1, 2], `n=${n}`);
    const greedy = americanoStats(P, americano(P, { courts, seed: n, whist: false }));
    assert.ok(greedy.unmetPartners >= st.unmetPartners, `n=${n} greedy misses at least as many partners`);
  }
});

test("americano: fewer courts than tables hints the whole design's length, and uses it when asked", () => {
  const P = names(20);
  const short = americano(P, { courts: 3 });
  assert.equal(short.design, undefined);
  assert.equal(short.rounds.length, 20);
  const want = short.whistHint.rounds;
  assert.ok(want > 20);
  const whole = americano(P, { courts: 3, rounds: want });
  assert.ok(whole.design.packed);
  assert.equal(whole.rounds.length, want);
  assert.ok(whole.rounds.every((r) => r.matches.length <= 3));
  assert.deepEqual(validateAmericano(P, whole), []);
  const st = americanoStats(P, whole);
  assert.equal(st.repeatPartners, 0);
  assert.equal(st.unmetPartners, 0);
  assert.deepEqual(opponentRange(whole, 20), [2, 2]);
});

test("americano: a shorter night keeps the better of the design's first rounds and the greedy search", () => {
  const P = names(16);
  const plan = americano(P, { courts: 4, rounds: 6, seed: 5 });
  assert.equal(plan.rounds.length, 6);
  assert.equal(americanoStats(P, plan).repeatPartners, 0);
  assert.deepEqual(validateAmericano(P, plan), []);
});

test("americano: the seed shuffles who gets which seat, deterministically", () => {
  const P = names(12);
  const a = americano(P, { courts: 3, seed: 1 }), b = americano(P, { courts: 3, seed: 1 }), c = americano(P, { courts: 3, seed: 2 });
  assert.deepEqual(a.rounds, b.rounds);
  assert.notDeepEqual(a.rounds, c.rounds);
});

test("whistRotation: a prefix of the design never repeats a partner", () => {
  const w = whistRotation(16, { courts: 4, rounds: 6 });
  assert.equal(w.rounds.length, 6);
  const seen = new Set();
  for (const r of w.rounds) for (const m of r.matches) for (const [a, b] of [m.a, m.b]) {
    assert.ok(!seen.has(`${a},${b}`));
    seen.add(`${a},${b}`);
  }
});

test("whistRotation: refuses a round count longer than the design", () => {
  assert.equal(whistRotation(8, { courts: 2, rounds: 8 }), null);
});
