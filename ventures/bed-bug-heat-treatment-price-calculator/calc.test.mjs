import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, heaterCount, jobCost, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example prices a job from labour, fuel, wear, warranty and margin", () => {
  const c = jobCost(base());
  assert.equal(c.heaters, 3);
  assert.equal(c.onSiteHrs, 11.3);
  assert.equal(c.cost, 1124.2);
  assert.equal(c.price, 1729.54);
  assert.equal(c.actualMarginPct, 35);
  assert.equal(c.expectedCallback, 56);
});

test("heater count rounds up and grows with a tall ceiling", () => {
  assert.equal(heaterCount({ ...base(), sqft: 1000 }), 2);
  assert.equal(heaterCount({ ...base(), sqft: 1001 }), 3);
  assert.equal(heaterCount({ ...base(), sqft: 1000, ceilingFt: 16 }), 4);
  assert.equal(heaterCount({ ...base(), sqft: 50 }), 1);
});

test("clutter lengthens the day and raises the price", () => {
  const s = plan(sampleInput()).sensitivity;
  assert.deepEqual(s.map((x) => x.clutter), ["light", "moderate", "heavy"]);
  assert.ok(s[0].onSiteHrs < s[1].onSiteHrs && s[1].onSiteHrs < s[2].onSiteHrs);
  assert.ok(s[0].price < s[1].price && s[1].price < s[2].price);
  assert.equal(s[1].price, 1729.54);
});

test("minimum charge sets the price when the cost-plus price is lower", () => {
  const r = plan({ ...sampleInput(), sqft: "200", minCharge: "2500" });
  assert.equal(r.job.minApplied, true);
  assert.equal(r.job.price, 2500);
  assert.ok(r.advice.some((a) => /minimum charge sets this price/.test(a)));
});

test("callback rate moves the price and zero callbacks removes the warranty cost", () => {
  const r = plan(sampleInput());
  assert.ok(r.callbacks[0].price < r.callbacks[4].price);
  assert.equal(jobCost(base(), { callbackPct: 0 }).expectedCallback, 0);
});

test("chemical comparison reports the premium or the saving", () => {
  assert.equal(plan(sampleInput()).chem.premium, 904.54);
  const cheap = plan({ ...sampleInput(), chemVisitCost: "900" });
  assert.ok(cheap.chem.premium < 0);
  assert.ok(cheap.advice.some((a) => /cheaper to them/.test(a)));
  assert.equal(plan({ ...sampleInput(), chemVisitCost: "" }).chem, null);
});

test("bad input is explained, not computed", () => {
  assert.match(plan({ ...sampleInput(), sqft: "0" }).error, /floor area/);
  assert.match(plan({ ...sampleInput(), ceilingFt: "30" }).error, /Ceiling/);
  assert.match(plan({ ...sampleInput(), clutter: "huge" }).error, /Clutter/);
  assert.match(plan({ ...sampleInput(), crew: "0" }).error, /Crew/);
  assert.match(plan({ ...sampleInput(), marginPct: "95" }).error, /Margin/);
  assert.match(plan({ ...sampleInput(), laborRate: "-5" }).error, /laborRate/);
  assert.match(plan({ ...sampleInput(), callbackPct: "150" }).error, /Callback/);
});

test("share links carry only known keys and round-trip", () => {
  assert.deepEqual(decodeShare("#" + encodeShare(sampleInput())), sampleInput());
  assert.deepEqual(decodeShare("#evil=1&sqft=800"), { sqft: "800" });
  assert.equal(SHARE_KEYS.length, Object.keys(sampleInput()).length);
});

test("CSV has a row per clutter level", () => {
  const r = plan(sampleInput());
  assert.equal(toCsv(r).split("\n").length, r.sensitivity.length + 1);
});
