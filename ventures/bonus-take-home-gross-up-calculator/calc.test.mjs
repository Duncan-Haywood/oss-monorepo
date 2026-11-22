import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, pct, payrollTaxes, bonusBreakdown, grossUp, deferralTable, sizeTable, analyze } from "./calc.mjs";

const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
// Hand-checkable: $10,000 bonus, nothing earned yet, 22% federal + 5% state withholding.
const base = { ...DEFAULTS, bonus: 10000, ytdWages: 0, fedWithholdPct: 22, fedMarginalPct: 22, stateWithholdPct: 5, stateMarginalPct: 5, k401Pct: 0 };

test("num parses money and percents, NaN otherwise", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("22%"), 22);
  assert.ok(Number.isNaN(num("abc")));
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(0.1234), "12.3%");
});

test("take-home on a plain $10,000 bonus: 620 + 145 + 2,200 + 500 withheld", () => {
  const b = bonusBreakdown(10000, base);
  near(b.ss, 620);
  near(b.medicare, 145);
  near(b.fedW, 2200);
  near(b.stateW, 500);
  near(b.net, 6535);
  near(b.keptRate, 0.6535, 1e-9);
  near(b.settlement, 0); // withholding equals the real rate
});

test("Social Security stops at the wage base", () => {
  const p = payrollTaxes(10000, { ...base, ytdWages: 180000 }); // 4,500 of room
  near(p.ssWages, 4500);
  near(p.ss, 279);
  near(payrollTaxes(10000, { ...base, ytdWages: 190000 }).ss, 0);
});

test("Additional Medicare applies only to wages above the threshold", () => {
  near(payrollTaxes(10000, { ...base, ytdWages: 195000 }).addl, 45); // 5,000 over x 0.9%
  near(payrollTaxes(10000, { ...base, ytdWages: 250000 }).addl, 90); // all 10,000 over
  near(payrollTaxes(10000, { ...base, ytdWages: 100000 }).addl, 0);
});

test("withholding above the real marginal rate is refunded at filing, below it is owed", () => {
  near(bonusBreakdown(10000, { ...base, fedMarginalPct: 12 }).settlement, 1000); // 22% vs 12%
  near(bonusBreakdown(10000, { ...base, fedMarginalPct: 32 }).settlement, -1000);
});

test("a 401(k) deferral cuts income tax but not FICA", () => {
  const b = bonusBreakdown(10000, { ...base, k401Pct: 50 });
  near(b.deferred, 5000);
  near(b.ss, 620); // still on the full 10,000
  near(b.fedW, 1100);
  near(b.stateW, 250);
  near(b.net, 10000 - 5000 - 620 - 145 - 1100 - 250);
});

test("gross-up solves for the bonus that leaves the target in the paycheck", () => {
  const g = grossUp(10000, base);
  near(g, 10000 / 0.6535, 0.02); // one minus 22% + 5% + 7.65%
  near(bonusBreakdown(g, base).net, 10000, 0.02);
  assert.equal(grossUp(0, base), 0);
});

test("gross-up crosses the wage base and the Additional Medicare line correctly", () => {
  const o = { ...base, ytdWages: 180000 };
  const g = grossUp(10000, o);
  near(bonusBreakdown(g, o).net, 10000, 0.02);
  assert.ok(g < 10000 / 0.6535); // Social Security stops partway, so less gross is needed
});

test("employer cost adds matching Social Security and Medicare only", () => {
  const b = bonusBreakdown(10000, { ...base, ytdWages: 195000 });
  near(b.employerFica, 145); // the Social Security base is already used up
  const plain = bonusBreakdown(10000, base);
  near(plain.employerFica, 765);
  near(plain.employerCost, 10765);
});

test("tables: deferral shares and bonus sizes", () => {
  const d = deferralTable(base);
  assert.deepEqual(d.map((r) => r.share), [0, 25, 50, 100]);
  assert.ok(d[3].net < d[0].net);
  assert.ok(d[3].afterTaxValue > d[0].afterTaxValue); // deferral keeps income tax off
  const s = sizeTable(base);
  near(s[1].gross, 10000);
  near(s[3].gross, 20000);
});

test("analyze returns the breakdown, the gross-up, and both tables", () => {
  const a = analyze({ ...base, targetNet: 5000 });
  near(a.b.net, 6535);
  near(a.grossUp.net, 5000, 0.02);
  assert.equal(analyze({ ...base, targetNet: 0 }).grossUp, null);
});

test("bad input never produces NaN", () => {
  const b = bonusBreakdown(NaN, { ...DEFAULTS, ytdWages: NaN, fedWithholdPct: -5 });
  for (const v of Object.values(b)) assert.ok(Number.isFinite(v));
});

// Quality audit 2026-11-22 (portfolio/quality/audits/2026-11-22-bonus-take-home-gross-up-calculator.json):
// Pub 15 section 7 requires 37% on supplemental wages over $1M for the year, and a gross-up with
// no answer used to print 6.43e64 as a dollar amount.
test("supplemental pay over $1M is withheld at the mandatory 37%", () => {
  const o = { ...DEFAULTS, ytdWages: 0 };
  near(bonusBreakdown(1500000, o).fedW, 1000000 * 0.22 + 500000 * 0.37, 0.001);
  near(bonusBreakdown(1500000, o).mandatoryWages, 500000, 0.001);
  // $800k of bonuses already paid: only $200k of a $500k bonus is under the line.
  near(bonusBreakdown(500000, { ...o, ytdSupplemental: 800000 }).fedW, 200000 * 0.22 + 300000 * 0.37, 0.001);
  // Under the line nothing changes.
  near(bonusBreakdown(10000, o).fedW, 2200, 0.001);
  // The gross-up honours it: $1M net at YTD $200k of regular wages. No Social Security is left,
  // so net = g(1 - .0145 - .009 - .05 - .37) + 1M x (.37 - .22) and g = 850,000 / 0.5565.
  const g = grossUp(1000000, { ...DEFAULTS, ytdWages: 200000 });
  near(g, 850000 / 0.5565, 0.02);
  // With $200k of bonuses already paid the 37% line is $800k into this one: 880,000 / 0.5565.
  near(grossUp(1000000, { ...DEFAULTS, ytdWages: 200000, ytdSupplemental: 200000 }), 880000 / 0.5565, 0.02);
  near(bonusBreakdown(g, { ...DEFAULTS, ytdWages: 200000 }).net, 1000000, 0.02);
});

test("a gross-up with no answer returns null, not a huge number", () => {
  assert.equal(grossUp(10000, { ...DEFAULTS, k401Pct: 100 }), null);
  // 100% withheld under $1M and still over 100% past it (37% federal + 70% state).
  assert.equal(grossUp(10000, { ...DEFAULTS, fedWithholdPct: 30, stateWithholdPct: 70 }), null);
  const a = analyze({ ...DEFAULTS, k401Pct: 100 });
  assert.equal(a.grossUp, null);
  assert.equal(a.grossUpImpossible, true);
  assert.equal(analyze(DEFAULTS).grossUpImpossible, false);
});

test("afterTaxValue counts Additional Medicare", () => {
  // $10k bonus at YTD $195k: $5k above the threshold, 0.9% of it = $45.
  const b = bonusBreakdown(10000, { ...DEFAULTS, ytdWages: 195000 });
  near(b.addl, 45, 0.001);
  near(b.afterTaxValue, 10000 - b.ss - b.medicare - 45 - 2400 - 500, 0.001);
});
