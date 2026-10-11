import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, jobCost, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, PACKAGES } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example prices film, labour, bay days and redos with margin", () => {
  const c = jobCost(base());
  assert.equal(c.filmFt, 27.6);
  assert.equal(c.filmBought, 31.7);
  assert.equal(c.film, 761.76);
  assert.equal(c.techHrs, 24.1);
  assert.equal(c.workDays, 4);
  assert.equal(c.bayDays, 5);
  assert.equal(c.expectedRedo, 27);
  assert.equal(c.cost, 2364.01);
  assert.equal(c.price, 3940.02);
  assert.equal(c.actualMarginPct, 40);
});

test("vehicle size scales film and hours", () => {
  const sedan = jobCost(base());
  const truck = jobCost({ ...base(), size: "truck" });
  assert.ok(truck.filmFt > sedan.filmFt && truck.techHrs > sedan.techHrs && truck.price > sedan.price);
});

test("a cure day blocks the bay only when a coating is applied", () => {
  const withCoat = jobCost(base());
  const without = jobCost(base(), { coating: "no" });
  assert.equal(withCoat.bayDays, without.bayDays + 1 + (withCoat.workDays - without.workDays));
  assert.equal(without.coatingMaterial, 0);
});

test("more techs shorten the work days but not the film", () => {
  const two = jobCost({ ...base(), techs: 2 });
  assert.ok(two.workDays < jobCost(base()).workDays);
  assert.equal(two.film, jobCost(base()).film);
});

test("package table covers every coverage and ranks by profit per bay day", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.packages.map((p) => p.pkg), Object.keys(PACKAGES));
  assert.ok(r.packages[0].price < r.packages[4].price);
  assert.ok(r.advice.some((a) => /earns the most/.test(a)));
});

test("coating-only drops the film and a no-film no-coating job is rejected", () => {
  const r = plan({ ...sampleInput(), pkg: "none" });
  assert.equal(r.job.film, 0);
  assert.match(plan({ ...sampleInput(), pkg: "none", coating: "no" }).error, /nothing is being sold/);
  assert.equal(plan({ ...sampleInput(), coating: "no" }).packages.some((p) => p.pkg === "none"), false);
});

test("minimum charge sets the price when the cost-plus price is lower", () => {
  const r = plan({ ...sampleInput(), pkg: "none", coating: "yes", correction: "0", minCharge: "5000" });
  assert.equal(r.job.minApplied, true);
  assert.equal(r.job.price, 5000);
});

test("redo rate moves the price and zero redos removes the allowance", () => {
  const r = plan(sampleInput());
  assert.ok(r.redos[0].price < r.redos[4].price);
  assert.equal(jobCost(base(), { redoPct: 0 }).expectedRedo, 0);
});

test("bad input is explained, not computed", () => {
  assert.match(plan({ ...sampleInput(), pkg: "x" }).error, /Package/);
  assert.match(plan({ ...sampleInput(), size: "bus" }).error, /size/);
  assert.match(plan({ ...sampleInput(), correction: "3" }).error, /correction/);
  assert.match(plan({ ...sampleInput(), techs: "0" }).error, /Techs/);
  assert.match(plan({ ...sampleInput(), marginPct: "95" }).error, /Margin/);
  assert.match(plan({ ...sampleInput(), laborRate: "-5" }).error, /laborRate/);
  assert.match(plan({ ...sampleInput(), redoPct: "150" }).error, /Redo/);
  assert.match(plan({ ...sampleInput(), hoursPerDay: "0" }).error, /hours per day/);
});

test("share links carry only known keys and round-trip", () => {
  assert.deepEqual(decodeShare("#" + encodeShare(sampleInput())), sampleInput());
  assert.deepEqual(decodeShare("#evil=1&size=suv"), { size: "suv" });
  assert.equal(SHARE_KEYS.length, Object.keys(sampleInput()).length);
});

test("CSV has a row per package", () => {
  const r = plan(sampleInput());
  assert.equal(toCsv(r).split("\n").length, r.packages.length + 1);
});
