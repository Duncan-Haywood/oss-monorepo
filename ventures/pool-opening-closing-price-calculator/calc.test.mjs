import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, gallons, visitCost, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example prices each visit from labour, chemical, supplies, redo risk and margin", () => {
  const c = visitCost(base(), "close"), o = visitCost(base(), "open");
  assert.equal(c.gallons, 19200);
  assert.equal(c.cost, 235.72);
  assert.equal(c.price, 392.87);
  assert.equal(o.cost, 252.48);
  assert.equal(o.price, 420.81);
  assert.equal(c.marginPct, 40);
});

test("gallons follow the shape", () => {
  assert.equal(gallons({ ...base(), shape: "rectangle" }), 19200);
  assert.ok(gallons({ ...base(), shape: "freeform" }) < gallons({ ...base(), shape: "oval" }));
  assert.ok(gallons({ ...base(), shape: "oval" }) < gallons({ ...base(), shape: "rectangle" }));
});

test("green water takes longer and costs more than clear water, and only at opening", () => {
  const s = plan(sampleInput()).conditions;
  assert.deepEqual(s.map((x) => x.condition), ["clear", "cloudy", "green"]);
  assert.ok(s[0].price < s[1].price && s[1].price < s[2].price);
  assert.ok(s[0].onSiteHrs < s[2].onSiteHrs);
  assert.equal(visitCost({ ...base(), condition: "green" }, "close").cost, visitCost({ ...base(), condition: "clear" }, "close").cost);
});

test("a bigger pool costs more and a solid cover is slower to remove than to fit", () => {
  const s = plan(sampleInput()).sizes;
  assert.ok(s[0].closePrice < s[4].closePrice && s[0].openPrice < s[4].openPrice);
  const solid = { ...base(), cover: "solid" };
  assert.ok(visitCost(solid, "open").onSiteHrs - visitCost({ ...base(), cover: "none" }, "open").onSiteHrs > visitCost(solid, "close").onSiteHrs - visitCost({ ...base(), cover: "none" }, "close").onSiteHrs);
});

test("the bundle is the two list prices less the discount and the margin falls with it", () => {
  const r = plan(sampleInput());
  assert.equal(r.bundle.price, 773);
  assert.equal(r.bundle.saving, 40.68);
  assert.ok(r.bundle.marginPct < 40);
  assert.equal(plan({ ...sampleInput(), bundlePct: "0" }).bundle.saving, 0);
});

test("minimum charge sets the price on a small pool", () => {
  const r = plan({ ...sampleInput(), lengthFt: "12", widthFt: "10", avgDepthFt: "3", minCharge: "600" });
  assert.equal(r.close.minApplied, true);
  assert.equal(r.close.price, 600);
  assert.ok(r.advice.some((a) => /minimum charge sets/.test(a)));
});

test("stops per day fill the crew day", () => {
  const o = visitCost({ ...base(), driveHrs: 0.5, dayHrs: 8 }, "open", { condition: "clear" });
  assert.equal(o.stopsPerDay, Math.floor(8 / o.elapsedHrs));
  assert.ok(Math.abs(o.dayRevenue - o.stopsPerDay * o.price) < 0.02);
});

test("bad input is explained, not computed", () => {
  assert.match(plan({ ...sampleInput(), lengthFt: "0" }).error, /length and width/);
  assert.match(plan({ ...sampleInput(), avgDepthFt: "30" }).error, /depth/);
  assert.match(plan({ ...sampleInput(), shape: "star" }).error, /Shape/);
  assert.match(plan({ ...sampleInput(), cover: "tarp" }).error, /Cover/);
  assert.match(plan({ ...sampleInput(), condition: "black" }).error, /condition/);
  assert.match(plan({ ...sampleInput(), crew: "0" }).error, /Crew/);
  assert.match(plan({ ...sampleInput(), marginPct: "95" }).error, /Margin/);
  assert.match(plan({ ...sampleInput(), laborRate: "-5" }).error, /laborRate/);
  assert.match(plan({ ...sampleInput(), bundlePct: "60" }).error, /Bundle/);
  assert.match(plan({ ...sampleInput(), redoPct: "150" }).error, /Redo/);
});

test("share links carry only known keys and round-trip", () => {
  assert.deepEqual(decodeShare("#" + encodeShare(sampleInput())), sampleInput());
  assert.deepEqual(decodeShare("#evil=1&lengthFt=20"), { lengthFt: "20" });
  assert.equal(SHARE_KEYS.length, Object.keys(sampleInput()).length);
});

test("CSV has a row per water condition", () => {
  const r = plan(sampleInput());
  assert.equal(toCsv(r).split("\n").length, r.conditions.length + 1);
});
