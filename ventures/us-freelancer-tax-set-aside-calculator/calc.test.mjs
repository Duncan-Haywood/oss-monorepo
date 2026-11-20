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
