import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, typeLine, fixedCosts, modes, breakEven, sampleInput as shippedSample, encodeShare, decodeShare, toCsv, SHARE_KEYS, TYPES } from "./calc.mjs";

// Arithmetic tests are pinned to a fixed reference week so their hand-checked numbers do not move when the page's example changes.
// 10 conventional ($60), 5 synthetic ($100) and 8 fleet vehicles in stops of 4 ($55 each): 17 stops, 23 vehicles, 10% of stops are no-shows and pay nothing.
const sampleInput = () => ({
  ...shippedSample(),
  convQty: "10", convPrice: "60", convMin: "20", convQuarts: "5", convQtCost: "4", convFilter: "6",
  synthQty: "5", synthPrice: "100", synthMin: "30", synthQuarts: "5", synthQtCost: "9", synthFilter: "9",
  fleetQty: "8", fleetBatch: "4", fleetPrice: "55", fleetMin: "20", fleetQuarts: "5", fleetQtCost: "4", fleetFilter: "6",
  disposalPerVehicle: "2", haulWeek: "10", tripFee: "0", failedPct: "10", failedPayPct: "0", failedMin: "10", driveMiles: "10", driveMin: "20", mileCost: "0.5",
  insuranceMonth: "100", toolsYear: "130", otherFixedMonth: "0", labRunHours: "2", ownerRate: "30", hoursAvailable: "40", targetMarginPct: "30",
  franchiseFeePct: "8", franchiseVolumePct: "20", franchiseSupplies: "0", employedWage: "20", employedMileReimb: "0.4",
});
const base = () => readInput(sampleInput()).v;
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("weekly fixed cost spreads insurance and tools over 52 weeks, adds the weekly used-oil haul, and prices restocking time at the owner rate", () => {
  const f = fixedCosts(base());
  // $100 x 12 / 52 = $23.08; $130 / 52 = $2.50; haul $10
  assert.equal(f.insurance, 23.08);
  assert.equal(f.cert, 2.5);
  assert.equal(f.haul, 10);
  assert.equal(f.total, 35.58);
  assert.equal(f.labRun, 60);
  near(f.withLabRun, 95.5769, 0.0001);
});

test("the week counts stops, vehicles, completed vehicles and hours with drive time included", () => {
  const s = plan(sampleInput()).season;
  assert.equal(s.stops, 17);
  assert.equal(s.scheduled, 23);
  assert.equal(s.completed, 20.7);
  assert.equal(s.failedStops, 1.7);
  // revenue: 540 + 450 + 396 = $1386 collected (no-show stops pay nothing)
  assert.equal(s.revenue, 1386);
  // drive 17 x 20 min = 5.7 h; on site 459 + 17 min of curb time = 7.9 h; restock and haul 2 h
  assert.equal(s.driveHours, 5.7);
  assert.equal(s.onsiteHours, 7.9);
  assert.equal(s.workHours, 15.6);
});

test("oil, filter and disposal cost per vehicle come from quarts, price per quart, filter and disposal", () => {
  // conventional: 5 x $4 + $6 + $2 = $28; synthetic: 5 x $9 + $9 + $2 = $56; fleet: 5 x $4 + $6 + $2 = $28 (only on completed vehicles)
  const t = modes(base()).t;
  near(t.supplies, 0.9 * (10 * 28 + 5 * 56 + 8 * 28), 0.0001);
  const dearer = modes(readInput({ ...sampleInput(), convQtCost: "6" }).v).t;
  near(dearer.supplies - t.supplies, 0.9 * 10 * 5 * 2, 0.0001);
  const noDisposal = modes(readInput({ ...sampleInput(), disposalPerVehicle: "0" }).v).t;
  near(t.supplies - noDisposal.supplies, 0.9 * 23 * 2, 0.0001);
});

test("solo net is revenue less oil, mileage and fixed cash; profit per hour includes the drive", () => {
  const s = plan(sampleInput()).season;
  // 1386 - 705.60 supplies - 85 mileage - 35.58 fixed = 559.82
  assert.equal(s.soloNet, 559.82);
  // 559.82 - 15.6 h x $30 = 91.82
  assert.equal(s.soloAfterPay, 91.82);
  assert.equal(s.profitPerHour, 35.89);
  assert.equal(s.profitPerVehicle, 4.44);
  // dropping the drive time would flatter the hour
  assert.ok(s.soloNet / (s.onsiteHours + 2) > s.profitPerHour);
});

test("a service type costs its oil, mileage, drive and curb time (loaded for no-shows) and a share of fixed cost", () => {
  const l = typeLine(base(), TYPES[0]);
  // per stop: supplies 25.20, mileage 5.00, time (20 + 19) min x $30/h = 19.50; / 0.9 = 55.22; + fixed 95.58 / 20.7 = 4.62
  assert.equal(l.cost, 59.84);
  assert.equal(l.profit, 0.16);
  assert.equal(l.marginPct, 0.3);
  assert.equal(l.perHour, 36.62);
});

test("price needed for the target margin gives exactly that margin, with and without a trip fee and no-show pay", () => {
  for (const extra of [{}, { tripFee: "8" }, { failedPayPct: "50", tripFee: "5" }]) {
    for (const t of TYPES) {
      const l0 = typeLine(readInput({ ...sampleInput(), ...extra }).v, t);
      const key = { conv: "convPrice", synth: "synthPrice", fleet: "fleetPrice" }[t.id];
      const l1 = typeLine(readInput({ ...sampleInput(), ...extra, [key]: String(l0.targetFee) }).v, t);
      near(l1.marginPct, 30, 0.2);
    }
  }
  assert.equal(typeLine(base(), TYPES[0]).targetFee, 85.48);
});

test("a trip fee and a paid no-show both raise revenue by the arithmetic", () => {
  const r0 = plan(sampleInput()).season.revenue;
  // $10 on each of 17 stops, 90% completing
  assert.equal(plan({ ...sampleInput(), tripFee: "10" }).season.revenue, r0 + 153);
  // half the fee collected on the 10% of stops that no-show: 0.05 x (600 + 500 + 440)
  const paid = plan({ ...sampleInput(), failedPayPct: "50" }).season;
  assert.equal(paid.revenue, r0 + 77);
  assert.equal(paid.failedPaid, 77);
});

test("no-shows cost the drive and curb time, plus the margin of the work that did not happen, and scale with the rate", () => {
  const s = plan(sampleInput()).season;
  // 17 stops x 10% x ((20 + 10) min x $30/h + 10 mi x $0.50) = 34; lost margin 32 + 22 + 21.60
  assert.equal(s.failedCost, 34);
  assert.equal(s.failedLostMargin, 75.6);
  assert.equal(s.failedTotalWeek, 109.6);
  assert.equal(s.failedCostYear, 5699.2);
  const none = plan({ ...sampleInput(), failedPct: "0" }).season;
  assert.equal(none.failedCost, 0);
  assert.equal(none.failedLostMargin, 0);
  assert.ok(plan({ ...sampleInput(), failedPct: "20" }).season.failedTotalWeek > s.failedTotalWeek * 1.9);
  assert.ok(plan({ ...sampleInput(), failedPayPct: "100" }).season.failedCost < s.failedCost);
});

test("batching fleet vehicles into bigger stops cuts drive time and raises profit per hour at the same weekly vehicles", () => {
  const v = base();
  const four = modes(v);
  const eight = modes(v, { batch: 8 });
  assert.equal(four.t.scheduled, eight.t.scheduled);
  assert.ok(eight.t.stops < four.t.stops);
  assert.ok(eight.t.driveHours < four.t.driveHours);
  assert.ok(eight.solo.net / eight.t.workHours > four.solo.net / four.t.workHours);
  const r = plan(sampleInput());
  assert.deepEqual(r.batchTable.map((x) => x.batch), [1, 2, 3, 4, 6]);
  const atInput = r.batchTable.find((x) => x.batch === 4);
  assert.equal(atInput.net, r.season.soloNet);
  assert.equal(atInput.perHour, r.season.profitPerHour);
  for (let i = 1; i < r.batchTable.length; i++) assert.ok(r.batchTable[i].perHour > r.batchTable[i - 1].perHour);
  assert.ok(plan({ ...sampleInput(), fleetBatch: "8" }).season.profitPerHour > r.season.profitPerHour);
  // with no fleet work batching changes nothing
  const noFleet = plan({ ...sampleInput(), fleetQty: "0" });
  assert.equal(noFleet.batchTable[0].perHour, noFleet.batchTable[4].perHour);
});

test("solo, franchise and employed: each is worked out from its own terms", () => {
  const m = modes(base());
  near(m.solo.net, 559.8231, 0.001);
  // franchise: 20% more volume, pays 8% of 1663.20 revenue, still buys oil (846.72) and pays mileage (102) and fixed cash
  near(m.franchise.net, 0.92 * 1663.2 - 846.72 - 102 - 35.5769, 0.001);
  // employed: $20 x 15.6 h (rounded hours are 5.667 + 7.933 + 2) + $0.40 x 170 mi, less the $85 mileage actually driven
  near(m.employed.net, 20 * (340 / 60 + 476 / 60 + 2) + 68 - 85, 0.001);
  near(m.employed.afterPay, m.employed.net - m.employed.hours * 30, 0.001);
  const supplied = modes(readInput({ ...sampleInput(), franchiseSupplies: "1" }).v);
  near(supplied.franchise.net - m.franchise.net, 846.72, 0.001);
});

test("the equal franchise fee and equal hourly wage really make the other modes net the same as solo", () => {
  const r = plan(sampleInput());
  assert.equal(r.season.equalTake, 7.2);
  assert.equal(r.season.equalWage, 36.98);
  const take = plan({ ...sampleInput(), franchiseFeePct: String(r.season.equalTake) }).season;
  near(take.franchiseNet, take.soloNet, 2);
  const wage = plan({ ...sampleInput(), employedWage: String(r.season.equalWage) }).season;
  near(wage.employedNet, wage.soloNet, 0.2);
  assert.match(r.advice.join(" "), /solo pays more/);
  assert.match(plan({ ...sampleInput(), franchiseFeePct: "3" }).advice.join(" "), /the franchise pays more/);
});

test("break-even vehicles cover fixed cost and your own time exactly at the mix", () => {
  const v = base();
  const be = breakEven(v);
  assert.ok(be);
  assert.equal(be.scheduled, 11.7);
  near(modes(v, { scale: be.scale }).solo.afterPay, 0, 0.5);
  assert.ok(breakEven({ ...v, insuranceMonth: 400 }).scheduled > be.scheduled);
});

test("break-even is null, with advice, when a stop earns less than the drive, oil and your time", () => {
  const r = plan({ ...sampleInput(), convPrice: "5", synthPrice: "5", fleetPrice: "1" });
  assert.equal(r.season.breakEven, null);
  assert.match(r.advice.join(" "), /earns? less than the drive/);
});

test("a price under the target price is flagged with the needed price", () => {
  const r = plan(sampleInput());
  assert.match(r.advice.join(" "), /Conventional oil changes at \$60\.00 a vehicle earn/);
  assert.match(r.advice.join(" "), /price would need to be \$85\.48 a vehicle/);
});

test("working hours are compared with hours available and overbooking is flagged", () => {
  assert.equal(plan(sampleInput()).season.utilizationPct, 39);
  const crowded = plan({ ...sampleInput(), hoursAvailable: "8" });
  assert.ok(crowded.season.utilizationPct > 100);
  assert.match(crowded.advice.join(" "), /not possible as planned/);
});

test("the volume table has five rows, 100% matches the headline, and more volume earns more", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.table.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.equal(r.table[2].solo, r.season.soloAfterPay);
  assert.equal(r.table[2].franchise, r.season.franchiseAfterPay);
  assert.equal(r.table[2].employed, r.season.employedAfterPay);
  assert.ok(r.table[4].solo > r.table[0].solo);
});

test("bad input is rejected with a plain message", () => {
  assert.match(plan({ ...sampleInput(), convQty: "1.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), convPrice: "-1" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Target margin/);
  assert.match(plan({ ...sampleInput(), convQty: "0", synthQty: "0", fleetQty: "0" }).error, /how many vehicles/);
  assert.match(plan({ ...sampleInput(), hoursAvailable: "200" }).error, /at most 168/);
  assert.match(plan({ ...sampleInput(), failedPct: "95" }).error, /No-shows/);
  assert.match(plan({ ...sampleInput(), failedPayPct: "120" }).error, /percent/);
  assert.match(plan({ ...sampleInput(), franchiseFeePct: "100" }).error, /franchise fee/);
  assert.match(plan({ ...sampleInput(), franchiseSupplies: "2" }).error, /0 \(you buy/);
  assert.match(plan({ ...sampleInput(), fleetBatch: "0" }).error, /at least 1/);
  assert.match(plan({ ...sampleInput(), convQty: "abc" }).error, /not negative/);
});

test("the tool prices arithmetic only: there is no regulatory, EPA or permit field", () => {
  assert.ok(!SHARE_KEYS.some((k) => /epa|permit|licen|regulat|tip/i.test(k)));
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

test("the example shipped on the page is a valid week and the solo route profits", () => {
  const r = plan(shippedSample());
  assert.equal(r.error, null);
  assert.equal(r.season.scheduled, 38);
  assert.ok(r.season.utilizationPct > 0 && r.season.utilizationPct <= 100);
  assert.ok(r.season.soloNet > 0);
});
