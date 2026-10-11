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
