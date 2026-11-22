import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, serviceLine, careLine, fixedCosts, seasonResult, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, SERVICES } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("a service costs its burdened bench minutes plus supplies", () => {
  const flat = serviceLine(base(), SERVICES[0]);
  // 30 min at $22 x 1.12 = $12.32 labor, + $45 parts, + 4% of jobs redone free under warranty
  assert.equal(flat.labor, 12.32);
  assert.equal(flat.cost, 59.61);
  assert.equal(flat.profit, 50.39);
  assert.equal(flat.marginPct, 45.8);
});

test("profit per bench hour ignores technician pay and ranks services", () => {
  const v = base();
  assert.equal(serviceLine(v, SERVICES[0]).perBenchHour, 121.54);
  assert.equal(serviceLine(v, SERVICES[1]).perBenchHour, 97.79);
  assert.equal(serviceLine(v, SERVICES[2]).perBenchHour, 105.38);
});

test("the target price gives exactly the target margin", () => {
  const v = base();
  const s = serviceLine(v, SERVICES[2]);
  assert.ok(Math.abs((s.targetPrice - s.cost) / s.targetPrice - 0.4) < 0.001);
});

test("fixed cost spreads the equipment over their seasons and rent over the months", () => {
  const f = fixedCosts(base());
  assert.equal(f.machine, 600);
  assert.equal(f.rent, 21600);
  assert.equal(f.total, 24700);
});

test("a protection plans loses money past price divided by one visit's cost", () => {
  const v = base();
  const p = careLine(v);
  assert.equal(p.breakEvenVisits, 1.5);
  assert.equal(p.perVisit, 90);
  assert.ok(careLine({ ...v, careScrVisits: 3 }).contribution < 0);
  assert.ok(careLine({ ...v, careScrVisits: 1 }).contribution > 0);
});

test("season profit equals contributions less fixed cost and grows with volume", () => {
  const r = seasonResult(base());
  const sum = r.lines.reduce((a, l) => a + l.contribution, 0) + r.care.contribution;
  assert.ok(Math.abs(r.profit - (sum - r.fixed.total)) < 0.02);
  assert.ok(seasonResult(base(), 1.5).profit > r.profit);
  assert.ok(seasonResult(base(), 0.5).profit < r.profit);
});

test("bench utilization compares hours needed with hours available", () => {
  const r = seasonResult(base());
  assert.equal(r.capacity, 1824.9);
  const crowded = plan({ ...sampleInput(), benchHrsPerWeek: "10" });
  assert.ok(crowded.season.utilizationPct > 100);
  assert.match(crowded.advice.join(" "), /more bench hours or a second technician/);
});

test("a loss-making plan says how many jobs break even", () => {
  const r = plan({ ...sampleInput(), rentPerMonth: "20000" });
  assert.ok(r.season.profit < 0);
  assert.match(r.advice.join(" "), /break even/);
});

test("services that lose money on every job are called out, not hidden behind volume", () => {
  const r = plan({ ...sampleInput(), scrPrice: "3", pcbPrice: "5", fullPrice: "8", careHolders: "0" });
  assert.match(r.advice.join(" "), /do not cover their own labor/);
});

test("a price under the target price is flagged with the needed price", () => {
  const r = plan({ ...sampleInput(), scrPrice: "9" });
  assert.match(r.advice.join(" "), /Screen or battery swap at \$9\.00 earns/);
});

test("the volume table has five rows and 100% matches the headline", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.table.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.equal(r.table[2].profit, r.season.profit);
});

test("bad input is rejected with a plain message", () => {
  assert.match(plan({ ...sampleInput(), scrQty: "1.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), techRate: "-1" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Target margin/);
  assert.match(plan({ ...sampleInput(), scrQty: "0", pcbQty: "0", fullQty: "0", careHolders: "0" }).error, /how many jobs/);
  assert.match(plan({ ...sampleInput(), machineSeasons: "0" }).error, /at least 1 season/);
  assert.match(plan({ ...sampleInput(), seasonMonths: "20" }).error, /Season length/);
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

test("warranty redo rate raises cost and bench hours, and zero redo removes it", () => {
  const v = base();
  const none = serviceLine({ ...v, redoPct: 0 }, SERVICES[0]);
  assert.equal(none.cost, 57.32);
  assert.ok(serviceLine({ ...v, redoPct: 10 }, SERVICES[0]).cost > none.cost);
  assert.ok(serviceLine({ ...v, redoPct: 10 }, SERVICES[0]).hours > none.hours);
  assert.ok(readInput({ ...sampleInput(), redoPct: "150" }).error);
});

// Red team 2026-11-22: a shop selling only plan customers was told its services "do not cover their own labor" and that
// break-even was "0 paid jobs", because break-even counted jobs and left the plan customers out.
test("break-even counts plan customers as paid sales, and a plan customers-only shop is not told it loses money per job", () => {
  const only = { ...sampleInput(), scrQty: "0", pcbQty: "0", fullQty: "0", careHolders: "400", carePrice: "2000", careScrVisits: "1" };
  const loss = plan({ ...only, rentPerMonth: "999999" });
  assert.ok(loss.season.contribution > 0 && loss.season.profit < 0);
  assert.doesNotMatch(loss.advice.join(" "), /do not cover their own labor/);
  assert.match(loss.advice.join(" "), /need about \d+ paid jobs and plan customers at this mix to break even, against the 400 you entered/);
  const free = plan({ ...only, machineCost: "0", rentPerMonth: "0", otherFixed: "0" });
  assert.match(free.advice.join(" "), /Break-even is about 0 paid jobs and plan customers at this mix; you plan 400, a cushion of 400\./);
  const r = plan(sampleInput());
  const sales = r.season.jobs + r.season.care.customers;
  const be = Math.ceil((r.season.fixed.total / r.season.contribution) * sales);
  assert.ok(r.advice.includes(`Break-even is about ${be} paid jobs and plan customers at this mix; you plan ${sales}, a cushion of ${Math.max(0, sales - be)}.`));
  assert.match(plan({ ...sampleInput(), careHolders: "0" }).advice.join(" "), /Break-even is about \d+ paid jobs at this mix/);
});

// Red team 2026-11-22: tests for mutants that escaped the suite.
test("a plan-only shop and a half-month season are valid input", () => {
  assert.equal(readInput({ ...sampleInput(), scrQty: "0", pcbQty: "0", fullQty: "0", careHolders: "1" }).error, undefined);
  assert.equal(readInput({ ...sampleInput(), seasonMonths: "0.5" }).error, undefined);
});

test("season revenue is the services' revenue plus the protection plans'", () => {
  const r = seasonResult(base());
  assert.equal(r.revenue, Math.round((r.lines.reduce((a, l) => a + l.revenue, 0) + r.care.revenue) * 100) / 100);
  assert.ok(r.care.revenue > 0);
});

test("a plan's warranty redos take bench hours, as they take parts", () => {
  const v = { ...base(), careHolders: 100, careScrVisits: 2 };
  assert.equal(careLine({ ...v, redoPct: 0 }).hours, 100);
  assert.ok(Math.abs(careLine({ ...v, redoPct: 10 }).hours - 110) < 1e-9);
});

test("a bench at exactly 100% is full, not over", () => {
  const r = plan({ ...sampleInput(), scrQty: "1043", pcbQty: "0", fullQty: "0", careHolders: "0", scrMin: "60", redoPct: "0", benchHrsPerWeek: "20" });
  assert.equal(r.season.utilizationPct, 100);
  assert.doesNotMatch(r.advice.join(" "), /second technician/);
});

test("a share link leaves out fields that were never set", () => {
  assert.equal(encodeShare({ scrQty: "5" }), "scrQty=5");
});
