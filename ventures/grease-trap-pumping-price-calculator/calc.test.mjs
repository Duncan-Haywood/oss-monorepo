import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, interval, visitCost, intervalTable, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example prices a visit from labour, truck, disposal and paperwork", () => {
  const c = visitCost(base());
  assert.equal(c.stopsPerLoad, 3);
  assert.equal(c.pumpMin, 16.7);
  assert.equal(c.dumpShare, 23.3);
  assert.equal(c.minutes, 95);
  assert.equal(c.disposalCost, 120);
  assert.equal(c.cost, 261.75);
  assert.equal(c.price, 373.93);
  assert.equal(c.actualMarginPct, 30);
});

test("a trap that fills the truck carries the whole dump trip", () => {
  const v = { ...base(), trapGal: 3000 };
  const c = visitCost(v);
  assert.equal(c.stopsPerLoad, 1);
  assert.equal(c.dumpShare, 70);
});

test("minimum charge sets the price when the cost-plus price is lower", () => {
  const v = { ...base(), minCharge: 500 };
  const c = visitCost(v);
  assert.equal(c.minApplied, true);
  assert.equal(c.price, 500);
  assert.ok(plan({ ...sampleInput(), minCharge: "500" }).advice.some((a) => /minimum charge sets this price/.test(a)));
});

test("interval comes from how fast the trap filled", () => {
  const iv = interval(base());
  assert.equal(iv.perWeek, 2.5);
  assert.equal(iv.rawWeeks, 10);
  assert.equal(iv.weeks, 10);
  assert.equal(iv.overdue, false);
});

test("a trap already over the limit is flagged overdue with a shorter interval", () => {
  const iv = interval({ ...base(), fogPct: 40, weeksSince: 12 });
  assert.equal(iv.overdue, true);
  assert.equal(iv.weeks, 7);
});

test("interval is capped to one visit a year at most and one week at least", () => {
  assert.equal(interval({ ...base(), fogPct: 1, weeksSince: 52 }).weeks, 52);
  assert.equal(interval({ ...base(), fogPct: 90, weeksSince: 4 }).weeks, 1);
});

test("no inspection reading means no interval but still a visit price", () => {
  const r = plan({ ...sampleInput(), fogPct: "", weeksSince: "" });
  assert.equal(r.error, null);
  assert.equal(r.iv, null);
  assert.ok(r.table.every((t) => t.compliant === null));
});

test("annual price is the visit price times visits per year and compliance follows the interval", () => {
  const v = base();
  const visit = visitCost(v);
  const t = intervalTable(v, visit, interval(v));
  const ten = t.find((x) => x.weeks === 10);
  assert.equal(ten.recommended, true);
  assert.equal(ten.annual, 1944.44);
  assert.equal(t.find((x) => x.weeks === 13).compliant, false);
  assert.equal(t.find((x) => x.weeks === 8).compliant, true);
});

test("the customer's annual target is compared to the compliant interval, not a longer one", () => {
  const r = plan(sampleInput());
  assert.ok(r.advice.some((a) => /A longer interval would not be compliant|above the \$1,500/.test(a)));
  const short = plan({ ...sampleInput(), targetAnnual: "3000" });
  assert.ok(short.advice.some((a) => /short\. A longer interval would not be compliant/.test(a)));
});

test("disposal sensitivity raises the price with the fee", () => {
  const s = plan(sampleInput()).sensitivity;
  assert.ok(s[0].price < s[1].price && s[1].price < s[4].price);
  assert.equal(s[1].price, 373.93);
});

test("bad input is explained, not computed", () => {
  assert.match(plan({ ...sampleInput(), trapGal: "0" }).error, /capacity/);
  assert.match(plan({ ...sampleInput(), truckGal: "500" }).error, /at least one full trap/);
  assert.match(plan({ ...sampleInput(), fogPct: "120" }).error, /100 percent/);
  assert.match(plan({ ...sampleInput(), crew: "0" }).error, /Crew/);
  assert.match(plan({ ...sampleInput(), marginPct: "95" }).error, /Margin/);
  assert.match(plan({ ...sampleInput(), laborRate: "-5" }).error, /laborRate/);
  assert.match(plan({ ...sampleInput(), pumpGpm: "0" }).error, /pump rate/);
});

test("share links carry only known keys and round-trip", () => {
  assert.deepEqual(decodeShare("#" + encodeShare(sampleInput())), sampleInput());
  assert.deepEqual(decodeShare("#evil=1&trapGal=800"), { trapGal: "800" });
  assert.equal(SHARE_KEYS.length, Object.keys(sampleInput()).length);
});

test("CSV has a row per interval", () => {
  const r = plan(sampleInput());
  assert.equal(toCsv(r).split("\n").length, r.table.length + 1);
});
