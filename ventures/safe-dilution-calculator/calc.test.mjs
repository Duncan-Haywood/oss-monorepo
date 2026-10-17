import { test } from "node:test";
import assert from "node:assert/strict";
import { solveRound, valuationSweep, followOnRound, exitWaterfall, money, percent } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} !~ ${b}`);
const base = { founders: [{ name: "A", shares: 5_000_000 }, { name: "B", shares: 3_000_000 }], issuedOptions: 0, unissuedPool: 1_000_000, otherShares: 0 };

test("a single post-money SAFE owns amount/cap of the company right after it converts", () => {
  // No priced round pricing in the way: a giant pre-money so the cap binds.
  const r = solveRound({ ...base, safes: [{ amount: 1_000_000, cap: 10_000_000, kind: "post" }], preMoney: 100_000_000, raise: 0 });
  assert.ok(r.ok);
  // 10% of (base + SAFE): 1,000,000/10,000,000.
  near(r.safeRows[0].shares / (r.baseShares + r.safeRows[0].shares), 0.1);
  assert.equal(r.safeRows[0].boundBy, "valuation cap");
});

test("YC post-money example: $1M at a $10M cap on 10M shares is 1,111,111 shares", () => {
  const r = solveRound({ founders: [{ name: "F", shares: 10_000_000 }], safes: [{ amount: 1_000_000, cap: 10_000_000, kind: "post" }], preMoney: 1e9, raise: 0 });
  near(r.safeRows[0].shares, 1_111_111.111, 1e-6);
});

test("several post-money SAFEs each hold amount/cap of the SAFE-inclusive company", () => {
  const r = solveRound({ ...base, safes: [{ amount: 500_000, cap: 5_000_000 }, { amount: 1_000_000, cap: 8_000_000 }], preMoney: 1e10, raise: 0 });
  const C = r.baseShares + r.safeRows.reduce((a, s) => a + s.shares, 0);
  near(r.safeRows[0].shares / C, 0.1);
  near(r.safeRows[1].shares / C, 0.125);
});

test("a pre-money SAFE ignores the other SAFEs when it sets its price", () => {
  const r = solveRound({ ...base, safes: [{ amount: 1_000_000, cap: 9_000_000, kind: "pre" }], preMoney: 1e10, raise: 0 });
  near(r.safeRows[0].price, 9_000_000 / 9_000_000); // B is 9,000,000 shares
});

test("price times total shares equals pre-money plus raise, and investors own raise/post", () => {
  const r = solveRound({ ...base, safes: [{ amount: 750_000, cap: 8_000_000, discount: 0.2 }], preMoney: 12_000_000, raise: 3_000_000, poolTarget: 0.1 });
  assert.ok(r.ok);
  near(r.price * r.totalShares, 15_000_000);
  near(r.investorOwnership, 3_000_000 / 15_000_000);
});

test("the pool target is met exactly after the round", () => {
  const r = solveRound({ ...base, safes: [{ amount: 500_000, cap: 6_000_000 }], preMoney: 10_000_000, raise: 2_000_000, poolTarget: 0.12 });
  near(r.poolOwnership, 0.12, 1e-9);
});

test("a pool already above target is not topped up", () => {
  const r = solveRound({ ...base, safes: [], preMoney: 10_000_000, raise: 2_000_000, poolTarget: 0.05 });
  assert.equal(r.newPoolShares, 0);
});

test("ownership adds to 100% and shares add to the total", () => {
  const r = solveRound({ ...base, safes: [{ amount: 400_000, cap: 4_000_000, discount: 0.15 }, { amount: 250_000, discount: 0.2 }], preMoney: 9_000_000, raise: 1_500_000, poolTarget: 0.1 });
  near(r.rows.reduce((a, x) => a + x.ownership, 0), 1, 1e-12);
  near(r.rows.reduce((a, x) => a + x.shares, 0), r.totalShares, 1e-12);
});

test("an uncapped SAFE with no discount converts at the round price", () => {
  const r = solveRound({ ...base, safes: [{ amount: 300_000 }], preMoney: 10_000_000, raise: 1_000_000 });
  assert.equal(r.safeRows[0].boundBy, "round price");
  near(r.safeRows[0].price, r.price);
});

test("a discount binds when the cap is above the round price", () => {
  const r = solveRound({ ...base, safes: [{ amount: 300_000, cap: 100_000_000, discount: 0.2 }], preMoney: 10_000_000, raise: 1_000_000 });
  assert.equal(r.safeRows[0].boundBy, "discount");
  near(r.safeRows[0].price, r.price * 0.8);
});

test("a cap above the round price never makes the SAFE pay more than the round", () => {
  const r = solveRound({ ...base, safes: [{ amount: 300_000, cap: 500_000_000 }], preMoney: 10_000_000, raise: 1_000_000 });
  near(r.safeRows[0].price, r.price);
});

test("a lower cap costs the founders more", () => {
  const a = solveRound({ ...base, safes: [{ amount: 1_000_000, cap: 6_000_000 }], preMoney: 15_000_000, raise: 3_000_000 });
  const b = solveRound({ ...base, safes: [{ amount: 1_000_000, cap: 12_000_000 }], preMoney: 15_000_000, raise: 3_000_000 });
  assert.ok(a.founderOwnership < b.founderOwnership);
});

test("impossible SAFE stacks and missing inputs return an error instead of throwing", () => {
  assert.equal(solveRound({ ...base, safes: [{ amount: 6_000_000, cap: 5_000_000 }, { amount: 1_000_000, cap: 5_000_000 }], preMoney: 1e7, raise: 1e6 }).ok, false);
  assert.equal(solveRound({ founders: [], preMoney: 1e7 }).ok, false);
  assert.equal(solveRound({ ...base, preMoney: 0 }).ok, false);
  assert.equal(solveRound({ ...base, preMoney: 1e7, raise: 1e7, poolTarget: 0.5 }).ok, false);
  assert.doesNotThrow(() => solveRound({}));
  assert.doesNotThrow(() => solveRound({ founders: [{ shares: "abc" }], preMoney: "x" }));
});

test("the solver converges across a grid of awkward terms", () => {
  for (const cap of [1e6, 3e6, 1e7, 5e7]) for (const disc of [0, 0.1, 0.3]) for (const pre of [2e6, 8e6, 3e7]) for (const kind of ["post", "pre"]) {
    const r = solveRound({ ...base, safes: [{ amount: 500_000, cap, discount: disc, kind }, { amount: 250_000, discount: 0.2 }], preMoney: pre, raise: 2e6, poolTarget: 0.1 });
    if (r.ok) near(r.price * r.totalShares, pre + 2e6, 1e-8);
    else assert.match(r.error, /100%|settle/);
  }
});

test("founder ownership falls monotonically as the round valuation falls", () => {
  const sweep = valuationSweep({ ...base, safes: [{ amount: 1e6, cap: 8e6 }], preMoney: 10e6, raise: 2e6, poolTarget: 0.1 });
  for (let i = 1; i < sweep.length; i++) assert.ok(sweep[i].founderOwnership >= sweep[i - 1].founderOwnership - 1e-12);
});

test("a follow-on round dilutes founders by raise / post-money", () => {
  const r = solveRound({ ...base, safes: [], preMoney: 10e6, raise: 2e6 });
  const next = followOnRound(r, { raise: 10e6, preMoney: 40e6 });
  near(next.founderOwnership, r.founderOwnership * (40 / 50), 1e-9);
});

test("waterfall: below the preference the investors are paid first and founders get nothing", () => {
  const r = solveRound({ ...base, safes: [], preMoney: 8e6, raise: 2e6 });
  const w = exitWaterfall(r, 1e6);
  near(w.founderPayout, 0);
  near(w.total, 1e6);
});

test("waterfall: a large exit converts everyone and splits by ownership", () => {
  const r = solveRound({ ...base, safes: [{ amount: 500_000, cap: 5e6 }], preMoney: 8e6, raise: 2e6 });
  const w = exitWaterfall(r, 1e9);
  near(w.founderPayout / 1e9, r.founderShares / (r.totalShares - r.rows.filter((x) => x.group === "pool").reduce((a, x) => a + x.shares, 0) + r.rows.filter((x) => x.group === "pool").reduce((a, x) => a + x.shares, 0)), 1e-9);
  near(w.total, 1e9, 1e-9);
  assert.ok(w.holders.filter((h) => h.group === "safe" || h.group === "investor").every((h) => h.converted === true));
});

test("waterfall always pays out exactly the exit value", () => {
  const r = solveRound({ ...base, safes: [{ amount: 500_000, cap: 5e6 }, { amount: 300_000, discount: 0.2 }], preMoney: 8e6, raise: 2e6, poolTarget: 0.1 });
  for (const x of [0, 5e5, 2e6, 5e6, 1.2e7, 3e7, 1e8, 1e9]) near(exitWaterfall(r, x).total, x, 1e-9);
});

test("waterfall: a low-cap SAFE converts before the new investors do", () => {
  const r = solveRound({ ...base, safes: [{ amount: 500_000, cap: 4e6 }], preMoney: 12e6, raise: 4e6 });
  const w = exitWaterfall(r, 9e6);
  const safe = w.holders.find((h) => h.group === "safe"), inv = w.holders.find((h) => h.group === "investor");
  assert.equal(safe.converted, true);
  assert.equal(inv.converted, false);
});

test("the pool can be left out of the waterfall", () => {
  const withPool = exitWaterfall(solveRound({ ...base, safes: [], preMoney: 8e6, raise: 2e6 }), 1e8);
  const noPool = exitWaterfall(solveRound({ ...base, safes: [], preMoney: 8e6, raise: 2e6, poolGranted: false }), 1e8);
  assert.ok(noPool.founderPayout > withPool.founderPayout);
});

test("formatters", () => {
  assert.equal(money(1234567), "$1,234,567");
  assert.equal(money(-5), "-$5");
  assert.equal(percent(0.1234), "12.3%");
  assert.equal(money(NaN), "n/a");
});
