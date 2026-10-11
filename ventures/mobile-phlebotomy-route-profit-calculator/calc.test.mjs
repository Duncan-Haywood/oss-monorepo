import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, typeLine, fixedCosts, modes, breakEven, sampleInput as shippedSample, encodeShare, decodeShare, toCsv, SHARE_KEYS, TYPES } from "./calc.mjs";

// Arithmetic tests are pinned to a fixed reference week so their hand-checked numbers do not move when the page's example changes.
// 10 routine home draws, 2 STAT draws ($40 + $20 premium), one facility visit of 10 draws: 13 stops, 22 draws, 10% of stops fail at the door and pay nothing.
const sampleInput = () => ({
  ...shippedSample(),
  routineQty: "10", routinePrice: "50", routineMin: "20", routineMat: "5", routineBatch: "1",
  statQty: "2", statPrice: "40", statPremium: "20", statMin: "30", statMat: "5",
  facilityVisits: "1", facilityDraws: "10", facilityPrice: "25", facilityMin: "6", facilityMat: "3",
  tripFee: "0", failedPct: "10", failedPayPct: "0", failedMin: "10", driveMiles: "10", driveMin: "20", mileCost: "0.5",
  insuranceMonth: "100", certYear: "130", otherFixedMonth: "0", labRunHours: "2", ownerRate: "30", hoursAvailable: "40", targetMarginPct: "30",
  agencyTakePct: "25", agencyVolumePct: "20", agencySupplies: "0", employedWage: "20", employedMileReimb: "0.4",
});
const base = () => readInput(sampleInput()).v;
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("weekly fixed cost spreads insurance and certification over 52 weeks and prices the lab run at the owner rate", () => {
  const f = fixedCosts(base());
  // $100 x 12 / 52 = $23.08; $130 / 52 = $2.50
  assert.equal(f.insurance, 23.08);
  assert.equal(f.cert, 2.5);
  assert.equal(f.total, 25.58);
  assert.equal(f.labRun, 60);
  near(f.withLabRun, 85.5769, 0.0001);
});

test("the week counts stops, draws, completed draws and hours with drive time included", () => {
  const s = plan(sampleInput()).season;
  assert.equal(s.stops, 13);
  assert.equal(s.scheduled, 22);
  assert.equal(s.completed, 19.8);
  assert.equal(s.failedStops, 1.3);
  // revenue: 450 + 108 + 225 = $783 collected (failed stops pay nothing)
  assert.equal(s.revenue, 783);
  // drive 13 x 20 min = 4.3 h; on site 301 min = 5.0 h; lab run 2 h
  assert.equal(s.driveHours, 4.3);
  assert.equal(s.onsiteHours, 5);
  assert.equal(s.workHours, 11.4);
});

test("solo net is revenue less supplies, mileage and fixed cash; profit per hour includes the drive", () => {
  const s = plan(sampleInput()).season;
  // 783 - 81 supplies - 65 mileage - 25.58 fixed = 611.42
  assert.equal(s.soloNet, 611.42);
  // 611.42 - 11.35 h x $30 = 270.92
  assert.equal(s.soloAfterPay, 270.92);
  assert.equal(s.profitPerHour, 53.87);
  assert.equal(s.profitPerDraw, 13.68);
  // dropping the drive time would flatter the hour: the same net over on-site hours alone is higher
  assert.ok(s.soloNet / (s.onsiteHours + 2) > s.profitPerHour);
});

test("a draw type costs its supplies, mileage, drive and door time (loaded for failures) and a share of fixed cost", () => {
  const l = typeLine(base(), TYPES[0]);
  // per stop: supplies 4.50, mileage 5.00, time (20 + 19 min) x $30/h = 19.50; / 0.9 completed = 32.22; + fixed 85.58 / 19.8 = 4.32
  assert.equal(l.cost, 36.54);
  assert.equal(l.profit, 13.46);
  assert.equal(l.marginPct, 26.9);
  assert.equal(l.perHour, 54.62);
});

test("price needed for the target margin gives exactly that margin, with and without a trip fee and failed-trip pay", () => {
  for (const extra of [{}, { tripFee: "8" }, { failedPayPct: "50", tripFee: "5" }]) {
    for (const t of TYPES) {
      const l0 = typeLine(readInput({ ...sampleInput(), ...extra }).v, t);
      // re-price at the target fee and read the margin back
      const key = { routine: "routinePrice", stat: "statPrice", facility: "facilityPrice" }[t.id];
      const fee = t.id === "stat" ? l0.targetBaseFee : l0.targetFee;
      const l1 = typeLine(readInput({ ...sampleInput(), ...extra, [key]: String(fee) }).v, t);
      near(l1.marginPct, 30, 0.2);
    }
  }
  assert.equal(typeLine(base(), TYPES[0]).targetFee, 52.21);
  // STAT: the base fee is the all-in target less the premium
  const stat = typeLine(base(), TYPES[1]);
  near(stat.targetFee - stat.targetBaseFee, 20, 0.0001);
});

test("a trip fee and a paid failed trip both raise revenue by the arithmetic", () => {
  const r0 = plan(sampleInput()).season.revenue;
  // $10 on each of 13 stops, 90% completing, no failed-trip pay
  assert.equal(plan({ ...sampleInput(), tripFee: "10" }).season.revenue, r0 + 117);
  // half the fee still collected on the 10% of stops that fail: 25 + 6 + 12.50
  const paid = plan({ ...sampleInput(), failedPayPct: "50" }).season;
  assert.equal(paid.revenue, r0 + 43.5);
  assert.equal(paid.failedPaid, 43.5);
});

test("failed trips cost the drive and door time, plus the margin of the draws that did not happen, and scale with the rate", () => {
  const s = plan(sampleInput()).season;
  // 13 stops x 10% x ((20 + 10) min x $30/h + 10 mi x $0.50) = 26.00; lost margin 45 + 11 + 22 = 78
  assert.equal(s.failedCost, 26);
  assert.equal(s.failedLostMargin, 78);
  assert.equal(s.failedTotalWeek, 104);
  assert.equal(s.failedCostYear, 5408);
  const none = plan({ ...sampleInput(), failedPct: "0" }).season;
  assert.equal(none.failedCost, 0);
  assert.equal(none.failedLostMargin, 0);
  assert.ok(plan({ ...sampleInput(), failedPct: "20" }).season.failedTotalWeek > s.failedTotalWeek * 1.9);
  assert.ok(plan({ ...sampleInput(), failedPayPct: "100" }).season.failedCost < s.failedCost);
});

test("batching home draws into multi-draw stops cuts drive time and raises profit per hour at the same weekly draws", () => {
  const v = base();
  const one = modes(v);
  const two = modes(v, { batch: 2 });
  assert.equal(one.t.scheduled, two.t.scheduled);
  assert.ok(two.t.stops < one.t.stops);
  assert.ok(two.t.driveHours < one.t.driveHours);
  assert.ok(two.solo.net / two.t.workHours > one.solo.net / one.t.workHours);
  const r = plan(sampleInput());
  assert.deepEqual(r.batchTable.map((x) => x.batch), [1, 2, 3, 4, 6]);
  assert.equal(r.batchTable[0].net, r.season.soloNet);
  assert.equal(r.batchTable[0].perHour, r.season.profitPerHour);
  for (let i = 1; i < r.batchTable.length; i++) assert.ok(r.batchTable[i].perHour > r.batchTable[i - 1].perHour);
  // the shipped input field does the same thing
  assert.ok(plan({ ...sampleInput(), routineBatch: "2" }).season.profitPerHour > r.season.profitPerHour);
});

test("solo, agency contractor and employed: each is worked out from its own terms", () => {
  const m = modes(base());
  near(m.solo.net, 611.4231, 0.001);
  // agency: 20% more draws, keeps 75% of 939.60, still buys supplies (97.20) and pays mileage (78) and fixed cash
  near(m.agency.net, 0.75 * 939.6 - 97.2 - 78 - 25.5769, 0.001);
  near(m.agency.hours, 5.2 + 6.02 + 2, 0.001);
  // employed: $20 x 11.35 h + $0.40 x 130 mi, less the $65 mileage actually driven
  near(m.employed.net, 20 * 11.35 + 52 - 65, 0.001);
  near(m.employed.afterPay, m.employed.net - 11.35 * 30, 0.001);
  // supplied by the agency: the contractor stops paying for tubes
  const supplied = modes(readInput({ ...sampleInput(), agencySupplies: "1" }).v);
  near(supplied.agency.net - m.agency.net, 97.2, 0.001);
});

test("the equal agency take and equal hourly wage really make the other modes net the same as solo", () => {
  const r = plan(sampleInput());
  assert.equal(r.season.equalTake, 13.6);
  assert.equal(r.season.equalWage, 55.02);
  const take = plan({ ...sampleInput(), agencyTakePct: String(r.season.equalTake) }).season;
  near(take.agencyNet, take.soloNet, 1);
  const wage = plan({ ...sampleInput(), employedWage: String(r.season.equalWage) }).season;
  near(wage.employedNet, wage.soloNet, 0.2);
  assert.match(r.advice.join(" "), /solo pays more/);
  assert.match(plan({ ...sampleInput(), agencyTakePct: "5" }).advice.join(" "), /the agency work pays more/);
});

test("break-even scheduled draws cover fixed cost and your own time exactly at the mix", () => {
  const v = base();
  const be = breakEven(v);
  assert.ok(be);
  assert.equal(be.scheduled, 5.3);
  near(modes(v, { scale: be.scale }).solo.afterPay, 0, 0.5);
  // more fixed cost needs more draws
  assert.ok(breakEven({ ...v, insuranceMonth: 400 }).scheduled > be.scheduled);
});

test("break-even is null, with advice, when a stop earns less than the drive, supplies and your time", () => {
  const r = plan({ ...sampleInput(), routinePrice: "5", statPrice: "5", statPremium: "0", facilityPrice: "1" });
  assert.equal(r.season.breakEven, null);
  assert.match(r.advice.join(" "), /earns? less than the drive/);
});

test("a fee under the target fee is flagged with the needed fee", () => {
  const r = plan({ ...sampleInput(), routinePrice: "40" });
  assert.match(r.advice.join(" "), /Routine home or office draws at \$40\.00 a draw earn/);
  assert.match(r.advice.join(" "), /would need to be \$\d\d\.\d\d a draw/);
});

test("working hours are compared with hours available and overbooking is flagged", () => {
  assert.equal(plan(sampleInput()).season.utilizationPct, 28.4);
  const crowded = plan({ ...sampleInput(), hoursAvailable: "8" });
  assert.ok(crowded.season.utilizationPct > 100);
  assert.match(crowded.advice.join(" "), /not possible as planned/);
});

test("the volume table has five rows, 100% matches the headline, and more volume earns more", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.table.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.equal(r.table[2].solo, r.season.soloAfterPay);
  assert.equal(r.table[2].agency, r.season.agencyAfterPay);
  assert.equal(r.table[2].employed, r.season.employedAfterPay);
  assert.ok(r.table[4].solo > r.table[0].solo);
});

test("bad input is rejected with a plain message", () => {
  assert.match(plan({ ...sampleInput(), routineQty: "1.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), routinePrice: "-1" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Target margin/);
  assert.match(plan({ ...sampleInput(), routineQty: "0", statQty: "0", facilityVisits: "0" }).error, /how many draws/);
  assert.match(plan({ ...sampleInput(), hoursAvailable: "200" }).error, /at most 168/);
  assert.match(plan({ ...sampleInput(), failedPct: "95" }).error, /Failed trips/);
  assert.match(plan({ ...sampleInput(), failedPayPct: "120" }).error, /percent/);
  assert.match(plan({ ...sampleInput(), agencyTakePct: "100" }).error, /take/);
  assert.match(plan({ ...sampleInput(), agencySupplies: "2" }).error, /0 \(you buy/);
  assert.match(plan({ ...sampleInput(), routineBatch: "0" }).error, /at least 1/);
  assert.match(plan({ ...sampleInput(), facilityDraws: "0" }).error, /at least 1 draw/);
  assert.match(plan({ ...sampleInput(), routineQty: "abc" }).error, /not negative/);
});

test("the tool prices arithmetic only: there is no clinical, licensure or payer field", () => {
  assert.ok(!SHARE_KEYS.some((k) => /clia|licen|diagnos|test|tip/i.test(k)));
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
  assert.equal(r.season.scheduled, 43);
  assert.ok(r.season.utilizationPct > 0 && r.season.utilizationPct <= 100);
  assert.ok(r.season.soloNet > 0);
});
