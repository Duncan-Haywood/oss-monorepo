import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSales, fitElasticity, planMarkdown, demandPmf, sampleText, markdownCsv, mulberry32, num, pct, money } from "./calc.mjs";

const base = { units: 300, price: 40, cost: 18, salvage: 6, weeks: 8, baseDemand: 30, elasticity: -2.2, decay: 0.96, simRuns: 1500 };

// ---- parsing

test("parses ISO, slash and month-name dates and sums days into weeks", () => {
  const p = parseSales("date,price,units\n2026-06-01,40,3\n2026-06-03,40,4\n6/9/2026,36,10\n\"Jun 16, 2026\",36,8");
  assert.equal(p.error, undefined);
  assert.equal(p.weeks.length, 3);
  assert.equal(p.weeks[0].units, 7);
  assert.equal(p.weeks[0].key, "2026-06-01");
  assert.equal(p.weeks[1].price, 36);
});

test("weekly price is the units-weighted average of the days", () => {
  const p = parseSales("2026-06-01,40,10\n2026-06-02,20,30");
  assert.equal(p.weeks.length, 1);
  assert.ok(Math.abs(p.weeks[0].price - 25) < 1e-9);
});

test("reads currency symbols, tabs, semicolons, week numbers and named headers in any order", () => {
  assert.equal(parseSales("week\tunits\tprice\n1\t5\t$40.00\n2\t7\t$38").weeks[1].price, 38);
  assert.equal(parseSales("1;40;5\n2;38;7").weeks.length, 2);
  const p = parseSales("Date,Qty sold,Unit price\n2026-06-01,5,\"$1,040.00\"");
  assert.equal(p.weeks[0].units, 5);
  assert.equal(p.weeks[0].price, 1040);
});

test("bad rows are skipped and counted; empty input errors", () => {
  const p = parseSales("date,price,units\nnot a date,40,3\n2026-06-01,-4,3\n2026-06-01,40,3");
  assert.equal(p.weeks.length, 1);
  assert.match(p.warnings[0], /2 rows/);
  assert.match(parseSales("").error, /Paste or upload/);
  assert.match(parseSales("a,b,c\nx,y,z").error, /No readable rows/);
});

// ---- elasticity

function synth(eps, n, seed, noise = 0.1, decay = 0.97) {
  const rnd = mulberry32(seed);
  const g = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const grid = [50, 45, 40, 35, 30];
  return Array.from({ length: n }, (_, i) => {
    const p = grid[Math.floor(rnd() * grid.length)];
    return { key: `w${i}`, t: i, price: p, units: Math.max(1, Math.round(80 * (p / 50) ** eps * decay ** i * Math.exp(noise * g()))) };
  });
}

test("recovers a planted elasticity and a planted weekly decay", () => {
  const f = fitElasticity(synth(-2.6, 40, 1), { refPrice: 50 });
  assert.ok(f.usable);
  assert.ok(Math.abs(f.raw + 2.6) < 0.25, String(f.raw));
  assert.ok(Math.abs(f.decay - 0.97) < 0.02, String(f.decay));
  assert.ok(f.lo < f.elasticity && f.elasticity < f.hi);
  assert.match(f.model, /time trend/);
});

test("the shrunk estimate sits between the data and the prior, and leans on data as it grows", () => {
  const small = fitElasticity(synth(-3.4, 10, 2, 0.35), { refPrice: 50 });
  const large = fitElasticity(synth(-3.4, 120, 2, 0.35), { refPrice: 50 });
  assert.ok(small.usable && large.usable);
  for (const f of [small, large]) assert.ok(f.elasticity >= Math.min(f.raw, -2) - 1e-9 && f.elasticity <= Math.max(f.raw, -2) + 1e-9);
  assert.ok(large.dataWeight > small.dataWeight);
  const pull = (f) => (f.elasticity - f.raw) / (-2 - f.raw);
  assert.ok(pull(large) < pull(small));
});

test("refuses a history that cannot show a price response", () => {
  const flat = Array.from({ length: 12 }, (_, i) => ({ key: `${i}`, t: i, price: 40, units: 20 + (i % 3) }));
  assert.match(fitElasticity(flat).reason, /barely moved/);
  assert.match(fitElasticity(synth(-2, 5, 3)).reason, /at least 8/);
  assert.equal(fitElasticity(flat).usable, false);
});

test("warns when price and time move together, and uses the price-only fit", () => {
  const ramp = Array.from({ length: 14 }, (_, i) => ({ key: `${i}`, t: i, price: 50 - i * 1.5, units: Math.round(30 * 1.06 ** i) }));
  const f = fitElasticity(ramp, { refPrice: 30 });
  assert.match(f.model, /^log units on log price$/);
  assert.ok(f.warnings.some((w) => /moved together/.test(w)));
});

test("stock-out weeks are excluded from the fit and said so", () => {
  const w = synth(-2.2, 20, 5);
  w[3].units = 0; w[9].units = 0;
  const f = fitElasticity(w, { refPrice: 50 });
  assert.equal(f.n, 18);
  assert.ok(f.warnings.some((x) => /2 weeks with no net sales/.test(x)));
});

test("a wrong-signed raw slope is flagged rather than trusted", () => {
  const w = Array.from({ length: 16 }, (_, i) => { const p = i % 2 ? 50 : 40; return { key: `${i}`, t: i, price: p, units: p === 50 ? 40 : 25 }; });
  const f = fitElasticity(w, { refPrice: 45 });
  assert.ok(f.raw > 0);
  assert.ok(f.warnings.some((x) => /not a price effect/.test(x)));
  assert.ok(Math.abs(f.elasticity + 2) < 1e-9);
  assert.equal(f.dataWeight, 0);
});

// ---- demand distribution

test("demand pmf sums to one and has the requested mean and variance", () => {
  for (const [mu, k] of [[3, 0], [40, 0.25], [800, 0.3], [0.4, 0.2]]) {
    const v = mu + (k * mu) ** 2;
    const { lo, p } = demandPmf(mu, v);
    const sum = p.reduce((a, b) => a + b, 0);
    const mean = p.reduce((s, x, i) => s + x * (lo + i), 0);
    const vr = p.reduce((s, x, i) => s + x * (lo + i - mean) ** 2, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    assert.ok(Math.abs(mean - mu) / mu < 0.01, `mean ${mean} vs ${mu}`);
    assert.ok(Math.abs(vr - v) / v < 0.06, `var ${vr} vs ${v}`);
  }
});

// ---- the plan

test("one-week closed form: value is price * E[min(D, I)] plus salvage on the rest", () => {
  const r = planMarkdown({ ...base, weeks: 1, units: 20, baseDemand: 12, decay: 1, maxDiscount: 0, simRuns: 100 });
  assert.equal(r.error, "The price floor leaves no room to mark down. Lower the floor or raise the maximum discount.");
  const r2 = planMarkdown({ ...base, weeks: 1, units: 20, baseDemand: 12, decay: 1, maxDiscount: 10, step: 10, dispersion: 0, cost: 0, simRuns: 100 });
  const { lo, p } = demandPmf(12, 12);
  const es = p.reduce((s, x, i) => s + x * Math.min(lo + i, 20), 0);
  const best = Math.max(
    40 * es + 6 * (20 - es),
    36 * (() => { const q = demandPmf(12 * 0.9 ** -2.2, 12 * 0.9 ** -2.2); return q.p.reduce((s, x, i) => s + x * Math.min(q.lo + i, 20), 0); })() + 6 * (20 - (() => { const q = demandPmf(12 * 0.9 ** -2.2, 12 * 0.9 ** -2.2); return q.p.reduce((s, x, i) => s + x * Math.min(q.lo + i, 20), 0); })()),
  );
  assert.ok(Math.abs(r2.expectedValue - best) < 1e-6, `${r2.expectedValue} vs ${best}`);
});

test("the optimal plan is never worse than any baseline rule", () => {
  const r = planMarkdown(base);
  assert.equal(r.baselines.length, 4);
  for (const b of r.baselines) assert.ok(b.gapToPlan >= -1e-6, `${b.name}: ${b.gapToPlan}`);
  assert.ok(r.bestBaselineGap >= -1e-6);
});

test("the dynamic-programming value matches a Monte Carlo of its own policy", () => {
  const r = planMarkdown({ ...base, simRuns: 12000 });
  assert.ok(Math.abs(r.simulation.meanProfit - r.expectedProfit) / Math.abs(r.expectedProfit) < 0.02, `${r.simulation.meanProfit} vs ${r.expectedProfit}`);
  assert.ok(r.simulation.p10 <= r.simulation.p50 && r.simulation.p50 <= r.simulation.p90);
});

test("the expected sell-through from the state distribution matches the simulation", () => {
  const r = planMarkdown({ ...base, simRuns: 12000 });
  const simSell = 1 - r.simulation.meanLeftover / base.units;
  assert.ok(Math.abs(simSell - r.sellThrough) < 0.02, `${simSell} vs ${r.sellThrough}`);
});

test("scarce stock holds the price; a glut marks down", () => {
  const scarce = planMarkdown({ ...base, units: 40 });
  assert.equal(Math.max(...scarce.path.map((p) => p.discount)), 0);
  const glut = planMarkdown({ ...base, units: 600 });
  assert.ok(Math.max(...glut.path.map((p) => p.discount)) >= 20);
});

test("markdowns only ever go deeper, never back up", () => {
  const r = planMarkdown({ ...base, units: 500 });
  for (let i = 1; i < r.path.length; i++) assert.ok(r.path[i].discount >= r.path[i - 1].discount);
});

test("inelastic buyers (|e| < 1) are not marked down, since a cut loses revenue", () => {
  const r = planMarkdown({ ...base, elasticity: -0.6, salvage: 0, units: 200 });
  assert.equal(Math.max(...r.path.map((p) => p.discount)), 0);
});

test("a better salvage channel means less markdown; a disposal cost means more", () => {
  const depth = (salvage) => planMarkdown({ ...base, units: 450, salvage, simRuns: 50 }).path.reduce((s, p) => s + p.discount, 0);
  assert.ok(depth(30) <= depth(6));
  assert.ok(depth(-5) >= depth(6));
});

test("more weeks never lowers expected value", () => {
  const v = (weeks) => planMarkdown({ ...base, weeks, units: 400, simRuns: 50 }).expectedValue;
  assert.ok(v(10) >= v(6) - 1e-6);
  assert.ok(v(6) >= v(3) - 1e-6);
});

test("a relabel cost reduces the number of price changes", () => {
  const free = planMarkdown({ ...base, units: 500, simRuns: 50 });
  const dear = planMarkdown({ ...base, units: 500, changeCost: 400, simRuns: 50 });
  assert.ok(dear.markdowns <= free.markdowns);
});

test("the price floor is respected", () => {
  const r = planMarkdown({ ...base, units: 700, floorPrice: 32, simRuns: 50 });
  for (const p of r.path) assert.ok(p.price >= 32 - 1e-9);
  assert.ok(r.levels.every((l) => l.price >= 32 - 1e-9));
});

test("the plan is stored as checkpoints: behind schedule never marks down less than on schedule", () => {
  const r = planMarkdown({ ...base, units: 450, simRuns: 50 });
  assert.ok(r.checkpoints.length > 0);
  for (const c of r.checkpoints) { assert.ok(c.behind >= c.asPlanned); assert.ok(c.ahead <= c.asPlanned); }
});

test("robustness table: the plan loses little value if the elasticity estimate is off", () => {
  const r = planMarkdown({ ...base, elasticityLo: -2.8, elasticityHi: -1.6, simRuns: 50 });
  assert.equal(r.sensitivity.length, 3);
  for (const s of r.sensitivity) { assert.ok(s.regret >= -1e-9); assert.ok(s.planValue <= s.bestValue + 1e-6); }
  assert.equal(r.sensitivity[1].regret, 0);
});

test("large inventories are solved in lots and stay consistent per unit", () => {
  const small = planMarkdown({ ...base, units: 900, baseDemand: 90, simRuns: 50 });
  const big = planMarkdown({ ...base, units: 9000, baseDemand: 900, simRuns: 50 });
  assert.equal(small.lot, 1);
  assert.ok(big.lot > 1);
  assert.ok(big.warnings.some((w) => /lots of/.test(w)));
  assert.ok(Math.abs(big.expectedValue / 10 - small.expectedValue) / small.expectedValue < 0.06);
});

test("the path is reproducible and the CSV lists the plan", () => {
  const a = planMarkdown(base), b = planMarkdown(base);
  assert.deepEqual(a.path, b.path);
  assert.deepEqual(a.simulation, b.simulation);
  const csv = markdownCsv(a).trim().split("\n");
  assert.equal(csv[0].split(",").length, 7);
  assert.equal(csv.length, a.path.length + 1);
});

test("bad inputs are refused with a plain message", () => {
  assert.match(planMarkdown({ ...base, units: 0 }).error, /units you still have/);
  assert.match(planMarkdown({ ...base, price: 0 }).error, /current price/);
  assert.match(planMarkdown({ ...base, weeks: 40 }).error, /between 1 and 26/);
  assert.match(planMarkdown({ ...base, baseDemand: 0 }).error, /per week/);
  assert.match(planMarkdown({ ...base, salvage: 99 }).error, /Salvage/);
});

test("warns when even the best plan cannot clear half the stock", () => {
  const r = planMarkdown({ ...base, units: 5000, baseDemand: 20, weeks: 4, simRuns: 50 });
  assert.ok(r.warnings.some((w) => /constraint is the window/.test(w)));
});

test("end to end: the sample history produces a usable fit and a plan", () => {
  const p = parseSales(sampleText());
  const f = fitElasticity(p.weeks, { refPrice: 48 });
  assert.ok(f.usable);
  assert.ok(Math.abs(f.elasticity + 2.3) < 0.4);
  const r = planMarkdown({ units: 400, price: 48, cost: 20, salvage: 8, weeks: 10, baseDemand: f.baseWeekly, elasticity: f.elasticity, decay: f.decay, dispersion: f.residualSd, elasticityLo: f.lo, elasticityHi: f.hi, simRuns: 500 });
  assert.ok(!r.error);
  assert.ok(r.expectedProfit > 0 && r.sellThrough > 0.5);
});

test("formatting helpers", () => {
  assert.equal(num(1234567), "1,234,567");
  assert.equal(pct(0.256, 1), "25.6%");
  assert.equal(money(-1234.5), "-$1,235");
  assert.equal(num(NaN), "n/a");
});
