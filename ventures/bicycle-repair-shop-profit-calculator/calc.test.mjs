import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, serviceLine, passLine, fixedCosts, seasonResult, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, SERVICES } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("a service costs its burdened bench minutes plus parts", () => {
  const flat = serviceLine(base(), SERVICES[0]);
  // 10 min at $22 x 1.12 = $4.11 labor, + $4.00 parts
  assert.equal(flat.labor, 4.11);
  assert.equal(flat.cost, 8.11);
  assert.equal(flat.profit, 16.89);
  assert.equal(flat.marginPct, 67.6);
});

test("profit per bench hour ignores mechanic pay and ranks services", () => {
  const v = base();
  assert.equal(serviceLine(v, SERVICES[0]).perBenchHour, 126);
  assert.equal(serviceLine(v, SERVICES[1]).perBenchHour, 108);
  assert.equal(serviceLine(v, SERVICES[2]).perBenchHour, 98);
});

test("the target price gives exactly the target margin", () => {
  const v = base();
  const s = serviceLine(v, SERVICES[2]);
  assert.ok(Math.abs((s.targetPrice - s.cost) / s.targetPrice - 0.4) < 0.001);
});

test("fixed cost spreads the tools over their seasons and rent over the months", () => {
  const f = fixedCosts(base());
  assert.equal(f.machine, 750);
  assert.equal(f.rent, 17600);
  assert.equal(f.total, 21350);
});

test("a service plan loses money past price divided by one visit's cost", () => {
  const v = base();
  const p = passLine(v);
  assert.equal(p.breakEvenVisits, 12.2);
  assert.equal(p.perVisit, 12.38);
  assert.ok(passLine({ ...v, passWaxVisits: 30 }).contribution < 0);
  assert.ok(passLine({ ...v, passWaxVisits: 6 }).contribution > 0);
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
  assert.match(crowded.advice.join(" "), /more bench hours or a second mechanic/);
});

test("a loss-making plan says how many jobs break even", () => {
  const r = plan({ ...sampleInput(), rentPerMonth: "20000" });
  assert.ok(r.season.profit < 0);
  assert.match(r.advice.join(" "), /break even/);
});

test("services that lose money on every tune are called out, not hidden behind volume", () => {
  const r = plan({ ...sampleInput(), waxPrice: "3", stdPrice: "5", fullPrice: "8", passHolders: "0" });
  assert.match(r.advice.join(" "), /do not cover their own labor/);
});

test("a price under the target price is flagged with the needed price", () => {
  const r = plan({ ...sampleInput(), waxPrice: "9" });
  assert.match(r.advice.join(" "), /Flat repair \/ safety check at \$9\.00 earns/);
});

test("the volume table has five rows and 100% matches the headline", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.table.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.equal(r.table[2].profit, r.season.profit);
});

test("bad input is rejected with a plain message", () => {
  assert.match(plan({ ...sampleInput(), waxQty: "1.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), techRate: "-1" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Target margin/);
  assert.match(plan({ ...sampleInput(), waxQty: "0", stdQty: "0", fullQty: "0", passHolders: "0" }).error, /how many jobs/);
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
