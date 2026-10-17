import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNum, parseInput, savings, analyze, sampleInput, reportCsv, MAX_DAYS } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const base = { days: "10", rate: "1000", entity: "s", fedRate: "24", stateRate: "0", qbi: "no", ssBase: "under", seRate: "", setupCost: "", annualCost: "", years: "" };

test("parseNum handles money strings and junk", () => {
  assert.equal(parseNum("$1,200"), 1200);
  assert.equal(parseNum("32%"), 32);
  assert.equal(parseNum(""), null);
  assert.ok(Number.isNaN(parseNum("abc")));
});

test("S corporation: saving is rent times the income tax rate, no payroll tax", () => {
  const a = analyze(base);
  near(a.rent, 10000);
  near(a.fed, 2400);
  assert.equal(a.se, 0);
  near(a.gross, 2400);
});

test("sole proprietor also saves self-employment tax on 92.35 percent of the rent", () => {
  const a = analyze({ ...base, entity: "se" });
  near(a.se, 10000 * 0.9235 * 0.153, 0.01);
  near(a.gross, 2400 + 1412.955, 0.01);
});

test("above the Social Security wage base only the Medicare share is saved", () => {
  const a = analyze({ ...base, entity: "se", ssBase: "over" });
  near(a.se, 10000 * 0.9235 * 0.029, 0.01);
});

test("an explicit self-employment rate overrides the default", () => {
  const a = analyze({ ...base, entity: "se", seRate: "10" });
  near(a.se, 923.5);
});

test("the QBI toggle trims the federal saving by 20 percent, but not for a C corporation", () => {
  near(analyze({ ...base, qbi: "yes" }).fed, 1920);
  near(analyze({ ...base, entity: "c", qbi: "yes" }).fed, 2400);
});

test("state tax adds to the saving", () => {
  near(analyze({ ...base, stateRate: "5" }).state, 500);
});

test("costs and setup come off the net, over the chosen number of years", () => {
  const a = analyze({ ...base, annualCost: "300", setupCost: "1000", years: "4" });
  near(a.yearNet, 2100);
  near(a.totalNet, 2100 * 4 - 1000);
});

test("years default to five and costs to zero", () => {
  const { p } = parseInput(base);
  assert.equal(p.years, 5);
  assert.equal(p.annualCost, 0);
});

test("more than 14 days is refused, and 14 is accepted", () => {
  assert.equal(MAX_DAYS, 14);
  assert.match(analyze({ ...base, days: "15" }).error, /at most 14 days/);
  assert.equal(analyze({ ...base, days: "14" }).error, undefined);
});

test("bad input gives a message, not a result", () => {
  assert.match(analyze({ ...base, days: "" }).error, /Days rented is required/);
  assert.match(analyze({ ...base, rate: "abc" }).error, /not a number/);
  assert.match(analyze({ ...base, fedRate: "80" }).error, /between/);
  assert.match(analyze({ ...base, days: "2.5" }).error, /whole number/);
  assert.match(analyze({ ...base, rate: "-5" }).error, /between/);
});

test("zero days is a valid, empty result", () => {
  const a = analyze({ ...base, days: "0" });
  assert.equal(a.gross, 0);
  assert.equal(a.findings[0].title, "Nothing to deduct");
});

test("rate table scales the saving with the rate", () => {
  const a = analyze(base);
  assert.equal(a.rateTable.length, 4);
  near(a.rateTable[2].gross, a.gross / 2);
  const d = analyze(base).dayTable;
  assert.equal(d.at(-1).days, 14);
  near(d[0].rent, 1000);
});

test("savings() with overrides matches analyze()", () => {
  const { p } = parseInput(base);
  near(savings(p, 5, 1000).gross, 1200);
});

test("a cost larger than the saving raises a warning", () => {
  const a = analyze({ ...base, annualCost: "5000" });
  assert.ok(a.findings.some((f) => f.title === "Costs cancel the saving"));
});

test("sample input analyzes and exports a CSV", () => {
  const a = analyze(sampleInput());
  assert.equal(a.error, undefined);
  assert.ok(a.gross > 0);
  const csv = reportCsv(a);
  assert.match(csv, /^Item,Value/);
  assert.match(csv, /Total tax saved per year/);
});
