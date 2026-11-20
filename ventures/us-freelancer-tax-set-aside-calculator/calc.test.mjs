import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, seTax, incomeTax, marginalRate, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("SE tax: 15.3% of 92.35% of profit, under the wage base", () => {
  const s = seTax(100000, 0, "single");
  assert.equal(s.earnings, 92350);
  assert.equal(s.ss, 11451.4);
  assert.equal(s.medicare, 2678.15);
  assert.equal(s.total, 14129.55);
});
test("W-2 wages use up the Social Security wage base first", () => {
  const s = seTax(100000, 184500, "single");
  assert.equal(s.ss, 0);
  assert.equal(s.medicare, 2678.15);
});
test("no SE tax under $400 of net earnings", () => {
  assert.equal(seTax(400, 0, "single").total, 0);
});
test("income tax brackets stack", () => {
  assert.equal(incomeTax(12400, "single"), 1240);
  assert.equal(incomeTax(61468.18, "single"), 8235);
  assert.equal(incomeTax(24800, "mfj"), 2480);
  assert.equal(marginalRate(61468, "single"), 0.22);
});
test("worked example matches a by-hand return", () => {
  const r = run({});
  assert.equal(r.net, 100000);
  assert.equal(r.agi, 92935.22);
  assert.equal(r.qbi, 15367.04);
  assert.equal(r.taxable, 61468.18);
  assert.equal(r.federal, 8235);
  assert.equal(r.state, 4646.76);
  assert.equal(r.total, 27011.31);
  assert.equal(r.afterTax, r.net - r.total);
});
test("marginal set-aside on the next $1,000 exceeds the average", () => {
  const r = run({});
  assert.ok(r.marginalPer1000 > r.perThousand);
  assert.ok(r.marginalPer1000 < 600);
});
test("QBI off raises the federal tax", () => {
  assert.ok(run({ qbi: "no" }).federal > run({}).federal);
  assert.equal(run({ qbi: "no" }).qbi, 0);
});
test("no QBI is taken above the threshold, with a finding", () => {
  const r = run({ revenue: "400000", expenses: "0" });
  assert.equal(r.qbi, 0);
  assert.ok(r.findings.some((f) => /QBI/.test(f.title)));
});
test("joint filers pay less federal tax than single on the same profit", () => {
  assert.ok(run({ filingStatus: "mfj" }).federal < run({}).federal);
});
test("Additional Medicare Tax appears past the threshold", () => {
  assert.ok(run({ revenue: "300000", expenses: "0" }).se.additional > 0);
});
test("expenses above revenue give nothing to set aside", () => {
  const r = run({ revenue: "1000", expenses: "5000" });
  assert.equal(r.net, 0);
  assert.equal(r.total, 0);
});
test("estimated-payment finding uses the prior-year safe harbor when it is lower", () => {
  const f = run({ priorYearTax: "10000" }).findings.find((x) => /1040-ES/.test(x.title));
  assert.match(f.title, /at least \$10000\.00/);
  assert.match(f.title, /last year/);
});
test("small profit raises no estimated-payment finding", () => {
  assert.ok(!run({ revenue: "4000", expenses: "0", stateRate: "0" }).findings.some((x) => /1040-ES/.test(x.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ stateRate: "50" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
  assert.ok(run({ priorYearTax: "-1" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on irs\.gov/);
});
test("head of household brackets match Rev. Proc. 2025-32 Table 2 (tax at each edge)", () => {
  // Tax owed at each 2026 HoH bracket edge as printed in Rev. Proc. 2025-32 sec. 4.01, Table 2.
  const edges = [[17700, 1770], [67450, 7740], [105700, 16155], [201750, 39207], [256200, 56631], [640600, 191171]];
  for (const [ti, tax] of edges) assert.equal(incomeTax(ti, "hoh"), tax, `HoH tax at ${ti}`);
  assert.equal(incomeTax(201775, "hoh"), 39215); // $25 past the 24% edge is taxed at 32%
});

test("1040-ES 90% safe harbor uses federal tax only, not state (audit 2026-11-20)", () => {
  const r = compute({ ...SAMPLE, priorYearTax: "" });
  assert.ok(r.state > 0);
  const f = r.findings.find((x) => /underpayment penalty/.test(x.title));
  const fed90 = (Math.round((r.total - r.state) * 0.9 * 100) / 100).toFixed(2);
  const all90 = (Math.round(r.total * 0.9 * 100) / 100).toFixed(2);
  assert.ok(f.title.includes("$" + fed90), f.title);
  assert.ok(!f.title.includes("$" + all90), f.title);
  // independent recomputation of the worked example (audit file, check C4): federal 14,129.55 + 8,235 = 22,364.55; 90% = 20,128.095
  assert.ok(Math.abs(Number(fed90) - 20128.095) <= 0.01, fed90);
});

test("with a salary, the set-aside is only the tax the freelance work adds (audit 2026-11-20, defect 0)", () => {
  // $10k gig, $100k W-2, single, no state. By hand: SE 10,000 x 0.9235 x 15.3% = 1,412.96;
  // extra taxable = 10,000 - 706.48 half-SE - 1,858.70 QBI = 7,434.82 at 22% = 1,635.66; total 3,048.62.
  const r = compute({ filingStatus: "single", revenue: "10000", expenses: "0", w2Wages: "100000", otherIncome: "0", stateRate: "0" });
  assert.equal(r.se.total, 1412.96);
  assert.equal(r.federal, 1635.66);
  assert.equal(r.total, 3048.62);
  assert.equal(r.setAsidePct, 30.49);
  assert.ok(r.totalAll > 16000);
  assert.ok(r.findings.some((f) => /tax on your W-2 wages and other income alone/.test(f.title)));
  const es = r.findings.find((f) => /underpayment penalty/.test(f.title));
  assert.match(es.title, /left for estimates/);
});

test("with no other income the set-aside equals the tax on everything", () => {
  const r = compute(SAMPLE);
  assert.equal(r.total, r.totalAll);
});

// Red-team 2026-11-20: guards for mutants that escaped this suite.
test("a state rate that is not a number is rejected, not turned into NaN tax", () => {
  assert.ok(run({ stateRate: "abc" }).errors.length);
  assert.ok(run({ stateRate: "-1" }).errors.length);
});
test("share of profit and the quarterly figure are exact on the worked example", () => {
  const r = run({});
  assert.equal(r.setAsideOfNet, 27.01); // 27,011.31 / 100,000
  assert.equal(r.quarter, 6752.83); // 27,011.31 / 4
  assert.equal(r.monthly, 2250.94);
});
test("the even quarterly split in the 1040-ES finding is in cents", () => {
  const f = run({}).findings.find((x) => /1040-ES/.test(x.title));
  assert.match(f.title, /The even split is about \$5032\.02 per quarter\./); // 20,128.10 / 4
});
test("a federal set-aside of exactly $1,000 is 'at least $1,000' and gets the 1040-ES finding", () => {
  const r = run({ revenue: "7077.34", expenses: "0", stateRate: "0" });
  assert.equal(r.total, 1000);
  assert.ok(r.findings.some((x) => /1040-ES/.test(x.title)));
});
test("110% safe harbor needs AGI over $150,000: exactly $150,000 stays at 100%", () => {
  const r = run({ revenue: "161402.74", expenses: "0", priorYearTax: "1000" });
  assert.equal(r.agi, 150000);
  const f = r.findings.find((x) => /1040-ES/.test(x.title));
  assert.match(f.title, /at least \$1000\.00/);
});
test("37% starts right above the top 35% edge for every filing status", () => {
  // Rev. Proc. 2025-32 Tables 1-3: 37% over $640,600 single and HoH, $768,700 joint.
  for (const [st, edge] of [["single", 640600], ["hoh", 640600], ["mfj", 768700]]) {
    assert.equal(r2t(incomeTax(edge + 100, st) - incomeTax(edge, st)), 37, st);
  }
});
const r2t = (n) => Math.round(n * 100) / 100;
test("next $1,000 on the worked example adds $351.34 (by hand)", () => {
  // SE 1,000 x 0.9235 x 15.3% = 141.30; profit after half SE 929.35;
  // taxable +929.35 - 20% QBI 185.87 = 743.48 at 22% = 163.57; state 5% = 46.47.
  assert.equal(run({}).marginalPer1000, 351.34);
});
test("zero profit gives 0% of profit, not NaN", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).setAsideOfNet, 0);
});
test("HoH QBI deduction stops once taxable income passes $201,750", () => {
  const r = run({ filingStatus: "hoh", revenue: "10000", expenses: "0", stateRate: "0", w2Wages: "216033.92" });
  assert.equal(r.agi, 225900.01); // taxable before QBI 201,750.01
  assert.equal(r.qbi, 0);
  const under = run({ filingStatus: "hoh", revenue: "10000", expenses: "0", stateRate: "0", w2Wages: "216000" });
  assert.ok(under.qbi > 0);
});

// Red-team 2026-11-20 real defects.
test("110% safe harbor keys on last year's AGI when it is entered (defect 0)", () => {
  // Income fell: this year's AGI ~92.9k, last year's 200k. The rule needs 110% of last year's tax.
  const f = run({ priorYearTax: "10000", priorYearAgi: "200000" }).findings.find((x) => /1040-ES/.test(x.title));
  assert.match(f.title, /at least \$11000\.00/);
  assert.match(f.title, /110% of last year's tax/);
  // Income rose: this year's AGI 150k+, last year's 100k: 100% is enough.
  const g = run({ revenue: "200000", expenses: "0", priorYearTax: "10000", priorYearAgi: "100000" }).findings.find((x) => /1040-ES/.test(x.title));
  assert.match(g.title, /at least \$10000\.00/);
  assert.match(g.title, /100% of last year's tax\)/);
  // Not entered: this year's AGI stands in, and the finding says so.
  const h = run({ priorYearTax: "10000" }).findings.find((x) => /1040-ES/.test(x.title));
  assert.match(h.title, /judged on this year's AGI/);
  assert.ok(run({ priorYearAgi: "abc" }).errors.length);
});
test("zero tax last year means no underpayment penalty, not a payment demand (defect 1)", () => {
  const r = run({ priorYearTax: "0" });
  assert.ok(!r.findings.some((x) => /IRS expects estimated payments/.test(x.title)));
  assert.ok(r.findings.some((x) => /no underpayment penalty/.test(x.title)));
});
test("no 'above the QBI line' message when taxable income is zero (defect 2)", () => {
  const r = run({ revenue: "5000", expenses: "0" });
  assert.equal(r.taxable, 0);
  assert.ok(!r.findings.some((x) => /above the \$/.test(x.title)), JSON.stringify(r.findings));
});
