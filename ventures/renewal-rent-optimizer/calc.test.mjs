import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, parseOutcome, fitLogit, analyze, leaveValue, expectedValue, sampleText, reportCsv } from "./calc.mjs";

const sig = (z) => 1 / (1 + Math.exp(-z));

// Deterministic simulated renewals: P(renew) = sigmoid(a + b * (increase - 0.04)) on the raw increase.
function renewals({ n = 400, a = 2, b = -30, seed = 5, center = 0.04, spread = 0.03 } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  return Array.from({ length: n }, () => {
    const current = 1000 + rnd() * 1500;
    const inc = Math.max(-0.02, center + spread * gauss());
    return { current, offered: current * (1 + inc), renewed: rnd() < sig(a + b * (inc - center)) ? 1 : 0 };
  });
}
const ECO = { rentNow: 1500, marketRent: 1500, vacancyDays: 30, turnoverCost: 1000, termMonths: 12 };

test("outcome words map to renewed and left, and unknown words are not guessed", () => {
  for (const w of ["1", "Renewed", "YES", "stayed", "Signed"]) assert.equal(parseOutcome(w), 1, w);
  for (const w of ["0", "Left", "no", "moved out", "Gave notice"]) assert.equal(parseOutcome(w), 0, w);
  assert.equal(parseOutcome("pending"), null);
  assert.equal(parseOutcome(""), null);
});

test("parseRows reads headers in any order and money formats, and skips unreadable or absurd rows", () => {
  const p = parseRows("Result,Offered rent,Current rent\nrenewed,\"$1,560\",\"$1,500\"\nleft,1700,1500\nmaybe,1,2\nrenewed,9000,1500");
  assert.deepEqual(p.rows[0], { current: 1500, offered: 1560, renewed: 1 });
  assert.equal(p.rows.length, 2);
  assert.ok(p.warnings.some((w) => /skipped/.test(w)));
});

test("parseRows without a header reads current, offered, renewed, with tab and semicolon delimiters", () => {
  assert.equal(parseRows("1500,1560,1\n1500,1600,0").rows.length, 2);
  assert.equal(parseRows("1500\t1560\t1").rows[0].offered, 1560);
  assert.equal(parseRows("current;offer;renewed\n1500;1560;yes").rows[0].renewed, 1);
});

test("empty and two-column input give an error", () => {
  assert.ok(parseRows("").error);
  assert.ok(parseRows("1500,1560\n1500,1600").error);
});

test("the economics: a departure is vacancy plus turnover, a stay is the offered rent", () => {
  assert.equal(Math.round(leaveValue(ECO)), Math.round(1500 * (12 - 30 / 30.4) - 1000));
  const f = { a: 0, b: 0 }; // 50% either way
  const x = Math.log(1.05);
  const want = 0.5 * 1500 * 1.05 * 12 + 0.5 * leaveValue(ECO);
  assert.ok(Math.abs(expectedValue(f, x, ECO) - want) < 1e-6);
  // a vacancy longer than the lease cannot make the new tenant's rent negative
  assert.ok(leaveValue({ ...ECO, vacancyDays: 900, turnoverCost: 0 }) >= 0);
});

test("logit recovers a known slope from a large simulated sample", () => {
  const rows = renewals({ n: 4000, a: 1, b: -30 });
  const f = fitLogit(rows.map((r) => Math.log(r.offered / r.current)), rows.map((r) => r.renewed));
  assert.ok(f.converged);
  assert.ok(Math.abs(f.b - -30) < 4, `slope ${f.b}`);
  assert.ok(f.b - 1.96 * f.seB < -30 && -30 < f.b + 1.96 * f.seB, "95% interval covers the truth");
});

test("perfectly separated data stays finite and is flagged", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ current: 1000, offered: 1000 * (1 + i * 0.005), renewed: i < 20 ? 1 : 0 }));
  const r = analyze(rows, ECO);
  assert.ok(Number.isFinite(r.slope));
  assert.ok(r.warnings.some((w) => /perfectly split/.test(w)));
});

test("a real curve is usable and the best increase is inside the tested range and near a brute-force optimum", () => {
  const rows = renewals({ n: 800, a: 1.5, b: -30 });
  const r = analyze(rows, { ...ECO, turnoverCost: 3000, vacancyDays: 45 });
  assert.equal(r.verdict, "usable");
  assert.ok(r.slope < -20 && r.slope > -40, `slope ${r.slope}`);
  const inc = r.optimum.increase;
  assert.ok(inc >= r.range.lo - 1e-9 && inc <= r.range.hi + 1e-9);
  assert.ok(r.optimum.increaseRange80[0] <= inc + 1e-9 && inc <= r.optimum.increaseRange80[1] + 1e-9);
  // brute force over the fitted model itself
  let best = -Infinity, bi = 0;
  for (let i = r.range.lo; i <= r.range.hi; i += 0.0005) {
    const v = expectedValue({ a: r.intercept, b: r.slope }, Math.log(1 + i), { ...ECO, rentNow: r.eco.rentNow, turnoverCost: 3000, vacancyDays: 45 });
    if (v > best) { best = v; bi = i; }
  }
  assert.ok(Math.abs(inc - bi) < 0.01, `got ${inc} want ${bi}`);
  assert.ok(r.optimum.gain >= 0 && r.optimum.pGain > 0.5);
});

test("a costlier turnover pushes the best increase down", () => {
  const rows = renewals({ n: 800, a: 1.5, b: -30 });
  const cheap = analyze(rows, { ...ECO, turnoverCost: 0, vacancyDays: 0 });
  const dear = analyze(rows, { ...ECO, turnoverCost: 8000, vacancyDays: 90 });
  assert.ok(dear.optimum.increase <= cheap.optimum.increase + 1e-9);
  assert.ok(dear.turnoverCost > cheap.turnoverCost);
});

test("the result is reproducible: the bootstrap is seeded", () => {
  const rows = renewals({ n: 200 });
  const a = analyze(rows, ECO), b = analyze(rows, ECO);
  assert.deepEqual(a.optimum.increaseRange80, b.optimum.increaseRange80);
  assert.equal(a.optimum.pGain, b.optimum.pGain);
});

test("a flat curve (the increase does not matter) is not called usable", () => {
  assert.notEqual(analyze(renewals({ n: 300, b: 0, seed: 9 }), ECO).verdict, "usable");
});

test("a positive slope is unidentified and says why", () => {
  const r = analyze(renewals({ n: 300, b: 40, seed: 4 }), ECO);
  assert.equal(r.verdict, "unidentified");
  assert.ok(r.warnings.some((w) => /already likelier to stay/.test(w)));
});

test("refusals: too few offers, too few leavers, flat offers, too few levels", () => {
  assert.match(analyze(renewals({ n: 20 }), ECO).error, /at least 25/);
  const few = renewals({ n: 60 }).map((r, i) => ({ ...r, renewed: i < 3 ? 0 : 1 }));
  assert.match(analyze(few, ECO).error, /renewed and 6 who left/);
  const flat = renewals({ n: 60, spread: 0 }).map((r, i) => ({ ...r, renewed: i % 3 ? 1 : 0 }));
  assert.match(analyze(flat, ECO).error, /barely varied/);
  const two = renewals({ n: 60 }).map((r, i) => ({ ...r, renewed: i % 3 ? 1 : 0, offered: r.current * (i % 2 ? 1.03 : 1.06) }));
  assert.match(analyze(two, ECO).error, /distinct/);
});

test("a missing market rent is assumed to be today's rent and the page says so", () => {
  const r = analyze(renewals({ n: 200 }), { vacancyDays: 30, turnoverCost: 1000 });
  assert.ok(r.warnings.some((w) => /No market rent/.test(w)));
  assert.equal(r.eco.marketRent, r.eco.rentNow);
});

test("scenarios: renewal chance falls as the increase rises and untested ones are marked", () => {
  const r = analyze(renewals({ n: 300 }), ECO);
  for (let i = 1; i < r.scenarios.length; i++) assert.ok(r.scenarios[i].renewChance < r.scenarios[i - 1].renewChance);
  assert.ok(r.scenarios.every((s) => typeof s.tested === "boolean"));
  assert.ok(r.sens.drop1 > 0);
});

test("bands cover every offer and the fitted rate tracks the observed rate on a real curve", () => {
  const r = analyze(renewals({ n: 800 }), ECO);
  assert.equal(r.bands.reduce((s, b) => s + b.n, 0), 800);
  for (const b of r.bands) assert.ok(Math.abs(b.observed - b.fitted) < 0.12, JSON.stringify(b));
});

test("hold-out: knowing the increase helps on a real curve", () => {
  const r = analyze(renewals({ n: 400 }), ECO);
  assert.ok(r.holdout.helps);
});

test("the built-in example parses, analyses and is usable", () => {
  const p = parseRows(sampleText());
  assert.equal(p.rows.length, 80);
  const r = analyze(p.rows, { ...ECO, vacancyDays: 40, turnoverCost: 2500 });
  assert.equal(r.verdict, "usable");
  assert.equal(reportCsv(r).split("\n").length, r.scenarios.length + 1);
});
