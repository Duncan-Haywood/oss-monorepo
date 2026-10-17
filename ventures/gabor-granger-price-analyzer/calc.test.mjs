import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResponses, prices, demandAt, demandTable, bestPrices, bootstrapBest, analyze, reportCsv, sampleText, money } from "./calc.mjs";

// Hand-checkable: 10 respondents. Highest accepted price: two refuse, three stop at 10,
// three at 20, two at 30.
const V = [0, 0, 10, 10, 10, 20, 20, 20, 30, 30];

test("parseResponses handles header, currency, none/0, extra columns and junk", () => {
  const p = parseResponses("max price\n$10\n20, yes\nnone\n0\nNo\nfoo\n1,5\n");
  assert.equal(p.skippedHeader, true);
  assert.deepEqual(p.values, [10, 20, 0, 0, 0, 1]); // "1,5": only the first cell counts
  assert.equal(p.unparseable, 1); // foo
});

test("parseResponses without a header keeps the first line", () => {
  const p = parseResponses("10\n20\n");
  assert.equal(p.skippedHeader, false);
  assert.deepEqual(p.values, [10, 20]);
});

test("prices lists distinct positive values, sorted", () => {
  assert.deepEqual(prices(V), [10, 20, 30]);
});

test("demand counts refusers in the denominator", () => {
  assert.equal(demandAt(V, 10), 8 / 10);
  assert.equal(demandAt(V, 20), 5 / 10);
  assert.equal(demandAt(V, 30), 2 / 10);
  assert.equal(demandAt(V, 31), 0);
});

test("revenue per respondent and best price by hand", () => {
  const t = demandTable(V);
  assert.deepEqual(t.map((r) => r.revenue), [8, 10, 6]); // 10*.8, 20*.5, 30*.2
  assert.equal(bestPrices(V).revenue.price, 20);
});

test("profit-maximising price moves up with unit cost", () => {
  // cost 10: profits 0, 5, 4 -> still 20. cost 15: -4, 2.5, 3 -> 30.
  assert.equal(bestPrices(V, 10).profit.price, 20);
  assert.equal(bestPrices(V, 15).profit.price, 30);
  assert.equal(bestPrices(V, 30).profit, null);
});

test("ties go to the lower price", () => {
  // 10 * 1 = 10 and 20 * .5 = 10
  assert.equal(bestPrices([10, 10, 20, 20]).revenue.price, 10);
});

test("arc elasticity between adjacent prices", () => {
  const t = demandTable(V);
  assert.equal(t[0].elasticity, null);
  // 10 -> 20: dD = -.3, avg D = .65 ; dp = 10, avg p = 15 => (-.3/.65)/(10/15) = -0.6923
  assert.ok(Math.abs(t[1].elasticity - -0.6923) < 1e-3);
});

test("bootstrap is deterministic and reports a band and a modal price", () => {
  const a = bootstrapBest(V), b = bootstrapBest(V);
  assert.deepEqual(a, b);
  assert.ok(a.revenue.low <= a.revenue.high);
  assert.ok(a.revenue.modalShare > 0 && a.revenue.modalShare <= 1);
});

test("analyze rejects too little data", () => {
  assert.match(analyze("10\n20\n30").error, /at least 5/);
  assert.match(analyze("10\n10\n10\n10\n10\n10").error, /2 different prices/);
});

test("analyze reports best price, refusers and the intent caveat", () => {
  const a = analyze(V.join("\n"));
  assert.equal(a.revenue.price, 20);
  assert.equal(a.refusers, 2);
  const titles = a.findings.map((f) => f.title);
  assert.ok(titles.includes("Small sample"));
  assert.ok(titles.includes("Would not buy at any tested price"));
  assert.ok(titles.includes("What this does not tell you"));
});

test("analyze flags a best price at the top of the ladder", () => {
  const a = analyze([50, 50, 50, 50, 50, 50, 10, 20].join("\n"));
  assert.equal(a.revenue.price, 50);
  assert.ok(a.findings.some((f) => f.title === "Best price is the top of the ladder"));
});

test("analyze with unit cost adds a profit finding and flags an unprofitable ladder", () => {
  assert.ok(analyze(V.join("\n"), { unitCost: 15 }).findings.some((f) => f.title === "Profit-maximising price"));
  assert.ok(analyze(V.join("\n"), { unitCost: 99 }).findings.some((f) => f.title === "No price covers the unit cost"));
});

test("reportCsv has the demand table and both best prices", () => {
  const csv = reportCsv(analyze(V.join("\n"), { unitCost: 15 }));
  assert.match(csv, /^price,buyers,demand/);
  assert.match(csv, /\n10,8,0\.8,8,/);
  assert.match(csv, /revenue_maximising,20\.00/);
  assert.match(csv, /profit_maximising,30\.00/);
});

test("the sample text analyses cleanly and is stable", () => {
  const a = analyze(sampleText());
  assert.ok(!a.error);
  assert.equal(a.n, 80);
  assert.equal(sampleText(), sampleText());
  assert.equal(money(1.005 + 1), "2.01");
});
