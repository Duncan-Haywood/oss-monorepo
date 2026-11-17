import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, serviceLine, passLine, fixedCosts, seasonResult, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, SERVICES } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("a service costs its burdened bench minutes plus materials", () => {
  const flat = serviceLine(base(), SERVICES[0]);
  // 15 min at $22 x 1.12 = $6.16 labor, + $6 parts
  assert.equal(flat.labor, 6.16);
  assert.equal(flat.cost, 12.16);
  assert.equal(flat.profit, 17.84);
  assert.equal(flat.marginPct, 59.5);
});

test("profit per bench hour ignores tech pay and ranks services", () => {
  const v = base();
  assert.equal(serviceLine(v, SERVICES[0]).perBenchHour, 96);
  assert.equal(serviceLine(v, SERVICES[1]).perBenchHour, 83);
});

test("the target price gives exactly the target margin", () => {
  const v = base();
  const s = serviceLine(v, SERVICES[2]);
  assert.ok(Math.abs((s.targetPrice - s.cost) / s.targetPrice - 0.4) < 0.001);
});

test("fixed cost spreads the tools over its seasons and rent over the months", () => {
  const f = fixedCosts(base());
  assert.equal(f.machine, 750);
  assert.equal(f.rent, 21000);
  assert.equal(f.total, 25750);
});

test("a care plan loses money past price divided by flat cost", () => {
  const v = base();
  const p = passLine(v);
  assert.equal(p.breakEvenVisits, 12.3);
  assert.equal(p.perVisit, 49.67);
  assert.ok(passLine({ ...v, passFlatVisits: 30 }).contribution < 0);
  assert.ok(passLine({ ...v, passFlatVisits: 3 }).contribution > 0);
});

test("season profit equals contributions less fixed cost and grows with volume", () => {
  const r = seasonResult(base());
  const sum = r.lines.reduce((a, l) => a + l.contribution, 0) + r.pass.contribution;
  assert.ok(Math.abs(r.profit - (sum - r.fixed.total)) < 0.02);
  assert.ok(seasonResult(base(), 1.5).profit > r.profit);
  assert.ok(seasonResult(base(), 0.5).profit < r.profit);
});

test("bench utilization compares hours needed with hours available", () => {
  const r = seasonResult(base());
  assert.equal(r.capacity, 1564.2);
  const crowded = plan({ ...sampleInput(), benchHrsPerWeek: "10" });
  assert.ok(crowded.season.utilizationPct > 100);
  assert.match(crowded.advice.join(" "), /more bench hours or a second tech/);
});

test("a loss-making plan says how many jobs break even", () => {
  const r = plan({ ...sampleInput(), rentPerMonth: "9000" });
  assert.ok(r.season.profit < 0);
  assert.match(r.advice.join(" "), /break even/);
});

test("services that lose money on every job are called out, not hidden behind volume", () => {
  const r = plan({ ...sampleInput(), flatPrice: "3", tunePrice: "5", ovhPrice: "8", passHolders: "0" });
  assert.match(r.advice.join(" "), /do not cover their own labor/);
});

test("a price under the target price is flagged with the needed price", () => {
  const r = plan({ ...sampleInput(), flatPrice: "9" });
  assert.match(r.advice.join(" "), /Flat fix at \$9\.00 earns/);
});

test("the volume table has five rows and 100% matches the headline", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.table.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.equal(r.table[2].profit, r.season.profit);
});

test("bad input is rejected with a plain message", () => {
  assert.match(plan({ ...sampleInput(), flatQty: "1.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), techRate: "-1" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Target margin/);
  assert.match(plan({ ...sampleInput(), flatQty: "0", tuneQty: "0", ovhQty: "0", passHolders: "0" }).error, /how many jobs/);
  assert.match(plan({ ...sampleInput(), toolYears: "0" }).error, /at least 1 season/);
  assert.match(plan({ ...sampleInput(), busyMonths: "20" }).error, /Season length/);
  assert.match(plan({ ...sampleInput(), benchHrsPerWeek: "200" }).error, /168/);
});

test("share links round-trip known keys and drop everything else", () => {
  const enc = encodeShare(sampleInput());
  const back = decodeShare("#" + enc + "&evil=1&__proto__=x");
  assert.deepEqual(back, sampleInput());
  assert.equal(back.evil, undefined);
  assert.equal(SHARE_KEYS.length, new Set(SHARE_KEYS).size);
});

test("csv has a header and one row per volume", () => {
  const lines = toCsv(plan(sampleInput())).split("\n");
  assert.equal(lines.length, 6);
  assert.match(lines[0], /^volume_pct,/);
});

test("break-even counts prepaid care plans as presold, not as more jobs (audit 2026-11-17)", () => {
  // (25,750 fixed - 4,500.80 care-plan contribution) / (47,118.40 / 1,180 jobs) = 532.15 -> 533
  assert.match(plan(sampleInput()).advice.join(" "), /Break-even is about 533 paid jobs/);
  const loss = plan({ ...sampleInput(), rentPerMonth: "9000" });
  // (750 + 54,000 + 4,000 - 4,500.80) / 39.9308 = 1,358.6 -> 1,359
  assert.match(loss.advice.join(" "), /about 1359 paid jobs/);
  const plansOnly = plan({ ...sampleInput(), flatQty: "0", tuneQty: "0", ovhQty: "0" });
  assert.doesNotMatch(plansOnly.advice.join(" "), /do not cover their own labor/);
  assert.match(plansOnly.advice.join(" "), /care plans alone leave \$21,249\.20/);
  const covered = plan({ ...sampleInput(), flatQty: "0", tuneQty: "0", ovhQty: "0", rentPerMonth: "0", otherFixed: "0", toolCost: "0" });
  assert.doesNotMatch(covered.advice.join(" "), /about 0 paid jobs/);
  assert.match(covered.advice.join(" "), /care plans alone cover/);
});

test("a blank price, minutes or pay field is an error, not a hidden default (audit 2026-11-17)", () => {
  for (const k of ["flatPrice", "tunePrice", "tuneMin", "ovhMat", "techRate", "burdenPct", "benchHrsPerWeek", "busyMonths", "toolYears", "targetMarginPct"]) {
    assert.match(plan({ ...sampleInput(), [k]: "" }).error ?? "", /Enter/, k);
  }
  // blank counts and optional costs still mean zero
  assert.equal(plan({ ...sampleInput(), flatQty: "", toolCost: "", otherFixed: "" }).error, null);
  // visits per member only matter when there are members
  assert.equal(plan({ ...sampleInput(), passHolders: "0", passFlatVisits: "" }).error, null);
  assert.match(plan({ ...sampleInput(), passFlatVisits: "" }).error ?? "", /Enter/);
});
