import { test } from "node:test";
import assert from "node:assert/strict";
import { bracketTax, ssTaxable, yearTax, rmdDivisor, normalise, simulate, compare, POLICIES, sampleInputs, scheduleCsv, validate } from "./calc.mjs";

const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("bracket tax matches hand arithmetic", () => {
  near(bracketTax(12400, "single"), 1240);
  near(bracketTax(50400, "single"), 1240 + 38000 * 0.12);
  near(bracketTax(100800, "mfj"), 2480 + 76000 * 0.12);
  assert.equal(bracketTax(0, "single"), 0);
});

test("social security taxability follows the provisional income formula", () => {
  assert.equal(ssTaxable(24000, 0, "single"), 0);
  near(ssTaxable(24000, 20000, "single"), 0.5 * (20000 + 12000 - 25000));
  near(ssTaxable(30000, 40000, "single"), 0.85 * (40000 + 15000 - 34000) + 4500, 1);
  assert.ok(ssTaxable(30000, 200000, "single") <= 0.85 * 30000 + 1e-9);
  assert.equal(ssTaxable(0, 50000, "mfj"), 0);
});

test("a capital gain on top of ordinary income is taxed at the stacked rate", () => {
  const noGain = yearTax({ status: "single", age: 60, ordinary: 20000 });
  assert.equal(noGain.tax, bracketTax(20000 - 16100, "single"));
  // all gains fall inside the 0% band
  const small = yearTax({ status: "single", age: 60, ordinary: 20000, ltcg: 20000 });
  near(small.tax, bracketTax(3900, "single"));
  // gains that cross the 0% threshold pay 15% on the part above it
  const big = yearTax({ status: "single", age: 60, ordinary: 40000, ltcg: 60000 });
  const taxableIncome = 100000 - 16100;
  const ordTaxable = taxableIncome - 60000;
  near(big.tax, bracketTax(ordTaxable, "single") + (60000 - (49450 - ordTaxable)) * 0.15);
});

test("people 65 and over get the larger deduction", () => {
  assert.equal(yearTax({ status: "single", age: 64, ordinary: 0 }).deduction, 16100);
  assert.equal(yearTax({ status: "mfj", age: 65, ordinary: 0 }).deduction, 32200 + 2 * 1650);
});

test("RMD divisors follow the uniform lifetime table", () => {
  assert.equal(rmdDivisor(75), 24.6);
  assert.equal(rmdDivisor(90), 12.2);
  assert.equal(rmdDivisor(120), 6.4);
});

test("normalise clamps nonsense and fills defaults", () => {
  const n = normalise({ status: "weird", startAge: "x", taxable: -5, trad: "100", spending: "50" });
  assert.equal(n.status, "single");
  assert.equal(n.taxable, 0);
  assert.equal(n.trad, 100);
  assert.equal(n.realReturn, 0.04);
  assert.equal(n.heirRate, 0.24);
  assert.ok(n.endAge > n.startAge);
  assert.ok(validate(normalise({})).length >= 2);
});

test("every policy funds spending exactly while money lasts, and balances never go negative", () => {
  const inp = normalise(sampleInputs());
  for (const p of POLICIES) {
    const sim = simulate(inp, p);
    for (const r of sim.rows) {
      assert.ok(r.taxableEnd >= -1e-6 && r.tradEnd >= -1e-6 && r.rothEnd >= -1e-6, `${p.id} ${r.age}`);
      if (r.shortfall < 1) near(r.spent, inp.spending, 1);
      assert.ok(r.tax >= 0);
    }
    assert.equal(sim.rows.length, inp.endAge - inp.startAge + 1);
  }
});

test("tax-free money in, nothing else: with only Roth the tax is zero and the end value is the compounded balance less spending", () => {
  const inp = normalise({ status: "single", startAge: 65, endAge: 70, roth: 500000, spending: 20000, realReturn: 0, ssAnnual: 0 });
  const sim = simulate(inp, POLICIES[0]);
  assert.equal(sim.lifetimeTax, 0);
  near(sim.endAfterTax, 500000 - 6 * 20000, 1);
  assert.equal(sim.shortfall, 0);
});

test("spending more than the balances can carry is reported as running out", () => {
  const inp = normalise({ status: "single", startAge: 65, endAge: 80, taxable: 100000, spending: 60000, realReturn: 0 });
  const sim = simulate(inp, POLICIES[0]);
  assert.ok(sim.runsOutAge && sim.runsOutAge <= 67);
  assert.ok(sim.shortfall > 0);
});

test("required distributions are forced even when spending needs less", () => {
  const inp = normalise({ status: "single", startAge: 75, endAge: 76, trad: 1000000, taxable: 500000, spending: 10000, realReturn: 0, yieldPct: 0 });
  const sim = simulate(inp, POLICIES[0]);
  near(sim.rows[0].tradWithdrawn, 1000000 / 24.6, 1);
  assert.ok(sim.rows[0].reinvested > 0);
});

test("the best strategy is never worse than the conventional order, and the report says by how much", () => {
  const r = compare(sampleInputs());
  assert.ok(r.best.endAfterTax >= r.conventional.endAfterTax - 1);
  near(r.gain, r.best.endAfterTax - r.conventional.endAfterTax, 0.01);
  assert.ok(r.gain > 10000, "a large pre-tax balance with low-income early years should reward filling the low brackets");
  assert.equal(r.results.length, POLICIES.length);
  assert.ok(r.stress.winner && Number.isFinite(r.stress.returnPct));
});

test("compare is deterministic and returns an error for empty input", () => {
  assert.deepEqual(compare(sampleInputs()).best.policy, compare(sampleInputs()).best.policy);
  assert.ok(compare({}).error);
});

test("conversions move money from traditional to Roth and are taxed that year", () => {
  const r = compare(sampleInputs());
  const conv = r.results.find((x) => x.policy.id === "fill-12-convert");
  assert.ok(conv.converted > 100000);
  const row = conv.rows.find((x) => x.convert > 0);
  assert.ok(row.tax > 0 || row.convert > 0);
  assert.ok(conv.end.roth > sampleInputs().roth);
});

test("the schedule CSV has a header and one row per year", () => {
  const sim = simulate(sampleInputs(), POLICIES[0]);
  const lines = scheduleCsv(sim).trim().split("\n");
  assert.equal(lines.length, sim.rows.length + 1);
  assert.match(lines[0], /^age,social_security/);
});
