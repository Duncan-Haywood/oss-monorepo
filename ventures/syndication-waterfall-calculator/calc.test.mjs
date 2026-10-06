import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, waterfall, irr, parseCashFlows, money, pct } from "./calc.mjs";

const tiers = [
  { hurdle: 8, promote: 0 }, { hurdle: 12, promote: 20 }, { hurdle: 16, promote: 30 }, { hurdle: null, promote: 40 },
];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("irr: simple one-period and no-sign-change cases", () => {
  near(irr([-100, 110]), 0.1);
  near(irr([-1000, 0, 0, 1331]), 0.1);
  assert.equal(irr([100, 100]), null);
  assert.equal(irr([]), null);
});

test("cash flow parsing reports bad tokens instead of dropping them", () => {
  const p = parseCashFlows("100, 200\n300;abc,-5");
  assert.deepEqual(p.flows, [100, 200, 300]);
  assert.deepEqual(p.bad, ["abc", "-5"]);
});

test("below the pref everything goes pro rata and there is no promote", () => {
  const w = waterfall({ equity: 1000000, gpPct: 10, cashFlows: [50000, 50000, 1000000], tiers });
  assert.equal(w.promote, 0);
  assert.ok(w.investorIrr < 0.08);
  near(w.lpTotal + w.gpTotal, 1100000, 0.02);
  near(w.gpTotal / (w.lpTotal + w.gpTotal), 0.1, 1e-6);
});

test("single-period deal: pref is hit exactly then the 20% tier splits the rest", () => {
  // equity 1,000,000, one year. 8% hurdle needs 1,080,000; 12% needs 1,120,000.
  const w = waterfall({ equity: 1000000, gpPct: 0, cashFlows: [1200000], tiers });
  // tier1 1,080,000 all investors; tier2: investor needs 40,000 at 80% -> cash 50,000; promote 10,000.
  assert.equal(w.tiers[0].investor, 1080000);
  assert.equal(w.tiers[1].cash, 50000);
  assert.equal(w.tiers[1].sponsor, 10000);
  assert.equal(w.tiers[1].investor, 40000);
  // tier3: investor needs 16%: 1,160,000 - 1,120,000 = 40,000 at 70% -> cash 57,142.86; remaining cash 70,000 -> 12,857.14 in tier 4 (60%)
  assert.equal(w.tiers[2].cash, 57142.86);
  assert.equal(w.tiers[2].sponsor, 17142.86);
  assert.equal(w.tiers[3].cash, 12857.14);
  near(w.tiers[3].sponsor, 5142.86, 0.011);
  near(w.totalCash, w.lpTotal + w.gpTotal, 0.02);
});

test("money is conserved across partners for a multi-year deal", () => {
  const flows = [120000, 130000, 140000, 150000, 3400000];
  const w = waterfall({ equity: 2000000, gpPct: 5, cashFlows: flows, tiers });
  near(w.lpTotal + w.gpTotal, flows.reduce((s, v) => s + v, 0), 0.05);
  assert.ok(w.promote > 0);
  assert.ok(w.lpIrr < w.dealIrr);
  assert.ok(w.gpIrr > w.dealIrr);
});

test("a higher promote never helps LPs", () => {
  const f = [100000, 100000, 100000, 2600000];
  const lo = waterfall({ equity: 2000000, gpPct: 0, cashFlows: f, tiers: [{ hurdle: 8, promote: 0 }, { hurdle: 12, promote: 10 }, { hurdle: 16, promote: 10 }, { hurdle: null, promote: 10 }] });
  const hi = waterfall({ equity: 2000000, gpPct: 0, cashFlows: f, tiers });
  assert.ok(hi.lpIrr <= lo.lpIrr);
});

test("analyse flags missing inputs, unordered hurdles and money-losing deals", () => {
  const base = { equity: 1000000, gpPct: 0, cashFlowText: "100000, 800000", pref: 8, hurdle2: 12, hurdle3: 16, promote2: 20, promote3: 30, promote4: 40 };
  assert.equal(analyse({ ...base, equity: 0 }).result, null);
  assert.ok(analyse({ ...base, hurdle2: 5 }).findings.some((f) => /Hurdles should rise/.test(f.title)));
  const loss = analyse(base);
  assert.ok(loss.result.dealIrr < 0);
  assert.ok(loss.findings.some((f) => /never returns/.test(f.title)));
  assert.ok(analyse({ ...base, cashFlowText: "1, x" }).findings.some((f) => f.severity === "high" && /not read/.test(f.title)));
});

test("formatting helpers", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(pct(0.1234), "12.34%");
  assert.equal(pct(null), "n/a");
});
