import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, serviceLine, tradeLine, fixedCosts, seasonResult, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, SERVICES } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("a service costs its burdened bench minutes plus supplies", () => {
  const flat = serviceLine(base(), SERVICES[0]);
  // 40 min at $28 x 1.14 = $21.28 labor, + $14.00 materials
  assert.equal(flat.labor, 21.28);
  assert.equal(flat.cost, 35.28);
  assert.equal(flat.profit, 49.72);
  assert.equal(flat.marginPct, 58.5);
});

test("profit per bench hour ignores upholsterer pay and ranks services", () => {
  const v = base();
  assert.equal(serviceLine(v, SERVICES[0]).perBenchHour, 106.5);
  assert.equal(serviceLine(v, SERVICES[1]).perBenchHour, 93.33);
  assert.equal(serviceLine(v, SERVICES[2]).perBenchHour, 98.33);
});

test("the target price gives exactly the target margin", () => {
  const v = base();
  const s = serviceLine(v, SERVICES[2]);
  assert.ok(Math.abs((s.targetPrice - s.cost) / s.targetPrice - 0.4) < 0.001);
});

test("fixed cost spreads the machines over their seasons and rent over the months", () => {
  const f = fixedCosts(base());
  assert.equal(f.machine, 600);
  assert.equal(f.rent, 26400);
  assert.equal(f.total, 30000);
});

test("a trade block loses money past block price divided by one seat job's cost", () => {
  const v = base();
  const p = tradeLine(v);
  assert.equal(p.breakEvenJobs, 22.7);
  assert.equal(p.perJob, 80);
  assert.ok(tradeLine({ ...v, tradeSeatJobs: 30 }).contribution < 0);
  assert.ok(tradeLine({ ...v, tradeSeatJobs: 6 }).contribution > 0);
});

test("season profit equals contributions less fixed cost and grows with volume", () => {
  const r = seasonResult(base());
  const sum = r.lines.reduce((a, l) => a + l.contribution, 0) + r.trade.contribution;
  assert.ok(Math.abs(r.profit - (sum - r.fixed.total)) < 0.02);
  assert.ok(seasonResult(base(), 1.5).profit > r.profit);
  assert.ok(seasonResult(base(), 0.5).profit < r.profit);
});

test("bench utilization compares hours needed with hours available", () => {
  const r = seasonResult(base());
  assert.equal(r.capacity, 1668.5);
  const crowded = plan({ ...sampleInput(), benchHrsPerWeek: "10" });
  assert.ok(crowded.season.utilizationPct > 100);
  assert.match(crowded.advice.join(" "), /more bench hours or a second upholsterer/);
});

test("a loss-making plan says how many jobs break even", () => {
  const r = plan({ ...sampleInput(), rentPerMonth: "20000" });
  assert.ok(r.season.profit < 0);
  assert.match(r.advice.join(" "), /break even/);
});

test("services that lose money on every job are called out, not hidden behind volume", () => {
  const r = plan({ ...sampleInput(), seatPrice: "3", chairPrice: "5", sofaPrice: "8", tradeAccounts: "0" });
  assert.match(r.advice.join(" "), /do not cover their own labor/);
});

test("a price under the target price is flagged with the needed price", () => {
  const r = plan({ ...sampleInput(), seatPrice: "50" });
  assert.match(r.advice.join(" "), /Dining chair seat at \$50\.00 earns/);
});

test("the volume table has five rows and 100% matches the headline", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.table.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.equal(r.table[2].profit, r.season.profit);
});

test("bad input is rejected with a plain message", () => {
  assert.match(plan({ ...sampleInput(), seatQty: "1.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), benchRate: "-1" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Target margin/);
  assert.match(plan({ ...sampleInput(), seatQty: "0", chairQty: "0", sofaQty: "0", tradeAccounts: "0" }).error, /how many jobs/);
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

// Red team 2026-11-22: a shop selling only trade accounts was told its services "do not cover their own labor" and that
// break-even was "0 paid jobs", because break-even counted jobs and left the trade accounts out.
test("break-even counts trade accounts as paid sales, and a trade accounts-only shop is not told it loses money per job", () => {
  const only = { ...sampleInput(), seatQty: "0", chairQty: "0", sofaQty: "0", tradeAccounts: "400", tradeBlockPrice: "2000", tradeSeatJobs: "1" };
  const loss = plan({ ...only, rentPerMonth: "999999" });
  assert.ok(loss.season.contribution > 0 && loss.season.profit < 0);
  assert.doesNotMatch(loss.advice.join(" "), /do not cover their own labor/);
  assert.match(loss.advice.join(" "), /need about \d+ paid jobs and trade accounts at this mix to break even, against the 400 you entered/);
  const free = plan({ ...only, machineCost: "0", rentPerMonth: "0", otherFixed: "0" });
  assert.match(free.advice.join(" "), /Break-even is about 0 paid jobs and trade accounts at this mix; you plan 400, a cushion of 400\./);
  const r = plan(sampleInput());
  const sales = r.season.jobs + r.season.trade.customers;
  const be = Math.ceil((r.season.fixed.total / r.season.contribution) * sales);
  assert.ok(r.advice.includes(`Break-even is about ${be} paid jobs and trade accounts at this mix; you plan ${sales}, a cushion of ${Math.max(0, sales - be)}.`));
  assert.match(plan({ ...sampleInput(), tradeAccounts: "0" }).advice.join(" "), /Break-even is about \d+ paid jobs at this mix/);
});
