import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, planYear, crossover, splitToMatch, sampleInput, reportCsv, parseNum } from "./calc.mjs";

const plan = (o) => ({ split: 0.7, cap: 0, postCapSplit: 1, txnFee: 0, postCapTxnFee: 0, royaltyPct: 0, royaltyCap: 0, monthlyFee: 0, annualFee: 0, referralPct: 0, ...o });

test("plain split: net is split share of commission less fees", () => {
  const y = planYear(plan({ txnFee: 300, monthlyFee: 100 }), 10000, 10);
  assert.equal(y.net, 70000 - 3000 - 1200);
  assert.equal(y.capReached, false);
});

test("cap: brokerage stops taking its share once it has been paid the cap", () => {
  const y = planYear(plan({ split: 0.8, cap: 16000 }), 10000, 10);
  // 2000 company share per deal, cap fills exactly on deal 8.
  assert.equal(y.capHitDeal, 8);
  assert.equal(y.net, 100000 - 16000);
});

test("a deal that crosses the cap is split in two", () => {
  const y = planYear(plan({ split: 0.8, cap: 5000 }), 10000, 3);
  assert.equal(y.capHitDeal, 3);
  assert.equal(y.companyPaid, 5000);
  assert.equal(y.net, 30000 - 5000);
});

test("post-cap fee applies only after the cap-hit deal", () => {
  const y = planYear(plan({ split: 0.8, cap: 4000, txnFee: 500, postCapTxnFee: 100 }), 10000, 5);
  assert.equal(y.capHitDeal, 2);
  assert.equal(y.txnFees, 500 * 2 + 100 * 3);
});

test("post-cap split below 100 keeps a share for the brokerage", () => {
  const y = planYear(plan({ split: 0.8, cap: 2000, postCapSplit: 0.95 }), 10000, 2);
  // deal 1 pays the whole 2000 cap; deal 2 pays 5% of 10000.
  assert.equal(y.net, 20000 - 2000 - 500);
});

test("referral fee comes off the top before the split", () => {
  const y = planYear(plan({ referralPct: 0.25 }), 10000, 1);
  assert.equal(y.net, 10000 * 0.75 * 0.7);
});

test("royalty is a percent of commission held under its own yearly cap", () => {
  const y = planYear(plan({ split: 1, royaltyPct: 0.06, royaltyCap: 3000 }), 10000, 10);
  assert.equal(y.royaltyOwed, 3000);
  assert.equal(y.net, 100000 - 3000);
});

test("fractional deals are prorated", () => {
  const y = planYear(plan({ split: 1, txnFee: 400 }), 10000, 2.5);
  assert.equal(y.net, 25000 - 1000);
});

test("crossover finds where a capped plan passes a plain split", () => {
  const capped = plan({ split: 0.8, cap: 16000 });
  const plain = plan({ split: 0.9 });
  const gci = 10000;
  const c = crossover(capped, plain, gci);
  assert.ok(c > 1);
  assert.ok(planYear(capped, gci, c).net >= planYear(plain, gci, c).net);
  assert.ok(planYear(capped, gci, c - 1).net < planYear(plain, gci, c - 1).net);
  assert.equal(crossover(plain, plain, gci), 0);
});

test("splitToMatch returns the split that equalises net", () => {
  const p = plan({ split: 0.6 });
  const target = planYear(plan({ split: 0.75 }), 10000, 10).net;
  const s = splitToMatch(p, 10000, 10, target);
  assert.ok(Math.abs(s - 0.75) < 1e-6);
  assert.equal(splitToMatch(plan({ split: 0.6, monthlyFee: 5000 }), 10000, 1, 1e9), 1);
});

test("analyze: sample input ranks three plans and states findings", () => {
  const a = analyze(sampleInput());
  assert.equal(a.error, undefined);
  assert.equal(a.results.length, 3);
  assert.ok(a.best.net >= a.results[0].net);
  assert.ok(a.findings.length >= 2);
  assert.equal(a.results[1].capHitDeal, 8);
  assert.equal(a.results[0].table.length, 7);
});

test("analyze: input validation", () => {
  const ok = sampleInput();
  assert.match(analyze({ ...ok, price: "" }).error, /sale price/);
  assert.match(analyze({ ...ok, commissionPct: "40" }).error, /commission percent/);
  assert.match(analyze({ ...ok, deals: "0" }).error, /deals/);
  assert.match(analyze({ ...ok, plans: [] }).error, /at least one/);
  assert.match(analyze({ ...ok, plans: [{ name: "X", split: "" }] }).error, /agent split/);
  assert.match(analyze({ ...ok, plans: [{ split: "150" }] }).error, /between 0 and 100/);
  assert.match(analyze({ ...ok, plans: [{ split: "70", cap: "abc" }] }).error, /cap/);
  assert.match(analyze({ ...ok, plans: Array(4).fill({ split: "70" }) }).error, /at most 3/);
});

test("analyze: a capped plan the agent would not fill is flagged", () => {
  const a = analyze({ price: "300000", commissionPct: "3", deals: "3", plans: [{ name: "Capped", split: "80", cap: "20000" }] });
  assert.ok(a.findings.some((f) => /would not reach the cap/.test(f.title)));
});

test("csv neutralises formula injection in a brokerage name", () => {
  const a = analyze({ price: "300000", commissionPct: "3", deals: "5", plans: [{ name: "=HYPERLINK(1)", split: "70" }] });
  assert.match(reportCsv(a), /'=HYPERLINK/);
});

test("parseNum accepts dollars, commas and percents", () => {
  assert.equal(parseNum("$1,250.50"), 1250.5);
  assert.equal(parseNum("70%"), 70);
  assert.ok(Number.isNaN(parseNum("abc")));
});
