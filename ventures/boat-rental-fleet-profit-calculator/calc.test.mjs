import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, serviceLine, fixedCosts, boatModes, breakEven, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, SERVICES } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("the dock, insurance and boat are paid all year but fall on the season weeks only", () => {
  const f = fixedCosts(base());
  // (350 + 180 + 60) x 12 = 7,080; 21,000 / 7 = 3,000; 10,080 / 20 weeks = 504
  assert.equal(f.annualFixed, 7080);
  assert.equal(f.annualBoat, 3000);
  assert.equal(f.annual, 10080);
  assert.equal(f.total, 504);
  const short = fixedCosts({ ...base(), seasonWeeks: 10 });
  assert.equal(short.total, 1008);
});

test("a cancelled rental earns nothing and burns no fuel", () => {
  const t = boatModes(base()).t;
  near(t.booked, 13, 0.0001);
  near(t.completed, 11.05, 0.0001);
  // .85 x (6 x 95 + 5 x 295 + 2 x 495) = .85 x 3035 = 2,579.75
  near(t.serviceRevenue, 2579.75, 0.0001);
  // .85 x (6 x 1 + 5 x 4 + 2 x 8) hours x $25 = .85 x 42 x 25 = 892.50
  near(t.fuelWear, 892.5, 0.0001);
  near(t.bookedHours, 42, 0.0001);
});

test("renting direct nets revenue less fuel, wear, fixed cost and then dock time", () => {
  const r = plan(sampleInput());
  near(r.season.directNet, 2579.75 - 892.5 - 504);
  // dock time: 11.05 completed x 30 min x $25 = $138.125
  near(r.season.directAfterPay, 1183.25 - 138.125);
  near(r.season.seasonDirect, (1183.25 - 138.125) * 20, 0.5);
});

test("cancellation cost is the margin of the empty slots", () => {
  const r = plan(sampleInput());
  // 6 x .15 x (95 - 25 - 12.5) + 5 x .15 x (295 - 100 - 12.5) + 2 x .15 x (495 - 200 - 12.5) = 51.75 + 136.875 + 84.75 = 273.375
  near(r.season.cancelCost, 273.38);
  const none = plan({ ...sampleInput(), cancelPct: "0" });
  assert.equal(none.season.cancelCost, 0);
  assert.ok(none.season.directAfterPay > r.season.directAfterPay);
});

test("a service line costs fuel, dock time and its share of fixed cost, and prices for the target margin", () => {
  const l = serviceLine(base(), SERVICES[0]);
  assert.equal(l.mat, 25);
  assert.equal(l.labor, 12.5);
  near(l.fixedShare, 504 / 11.05);
  near(l.cost, 12.5 + 25 + 504 / 11.05);
  near(l.targetPrice, l.cost / 0.65);
  const priced = serviceLine({ ...base(), hourlyPrice: l.targetPrice }, SERVICES[0]);
  near(priced.marginPct, 35, 0.2);
});

test("a marketplace takes its commission and brings extra bookings; a charter pays a captain per boat hour", () => {
  const m = boatModes(base());
  const direct = 2579.75 - 892.5 - 504;
  assert.ok(m.market.net < direct, "20% commission with a 30% lift loses to direct at the sample numbers");
  const noCommission = boatModes({ ...base(), platformPct: 0 });
  assert.ok(noCommission.market.net > direct, "free listing with extra bookings must win");
  // captain: 11.05 completed rentals x 3.8 average hours... = .85 x 42 = 35.7 boat hours x $35 = 1,249.50
  near(m.captain, 1249.5, 0.01);
  near(m.charter.revenue, 2579.75 * 1.4, 0.001);
});

test("the matching lift and charter premium really make the options equal", () => {
  const r = plan(sampleInput());
  const v = base();
  const scale = 1 + r.season.matchLiftPct / 100;
  const asked = boatModes({ ...v, liftPct: String((scale - 1) * 100) });
  near(asked.market.afterPay, asked.direct.afterPay, 1.5);
  const ch = boatModes({ ...v, charterPremiumPct: r.season.charterBreakEvenPremiumPct });
  near(ch.charter.net, ch.direct.net, 1.5);
});

test("break-even rentals cover the weekly fixed cost exactly", () => {
  const be = breakEven(base());
  assert.ok(be.completed > 0 && be.booked > be.completed);
  near(be.completed * be.contribution, 504, 1.5);
});

test("a boat that loses money on every rental has no break-even", () => {
  assert.equal(breakEven({ ...base(), fuelPerHour: 500 }), null);
});

test("bad input is refused with a reason", () => {
  assert.match(plan({}).error, /Enter how many rentals/);
  assert.match(plan({ ...sampleInput(), hourlyQty: "2.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), cancelPct: "95" }).error, /at or below 90/);
  assert.match(plan({ ...sampleInput(), platformPct: "90" }).error, /below 90/);
  assert.match(plan({ ...sampleInput(), seasonWeeks: "0" }).error, /between 1 and 52/);
  assert.match(plan({ ...sampleInput(), halfHrs: "0" }).error, /more than 0 hours/);
  assert.match(plan({ ...sampleInput(), hourlyPrice: "-5" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), availHours: "0" }).error, /above 0/);
});

test("the volume table scales bookings and keeps the mode order", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.table.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.ok(r.table[4].direct > r.table[0].direct);
  near(r.table[2].direct, r.season.directAfterPay);
  assert.match(toCsv(r), /^volume_pct,booked_per_week/);
  assert.equal(toCsv(r).split("\n").length, 6);
});

test("over-booking the boat is flagged", () => {
  const r = plan({ ...sampleInput(), availHours: "30" });
  assert.ok(r.season.utilizationPct > 100);
  assert.ok(r.advice.some((a) => /cannot take that many/.test(a)));
});

test("share links round-trip known keys only", () => {
  const enc = encodeShare({ ...sampleInput(), evil: "<script>" });
  assert.ok(!enc.includes("evil"));
  const dec = decodeShare("#" + enc);
  assert.deepEqual(Object.keys(dec).sort(), SHARE_KEYS.filter((k) => sampleInput()[k] !== undefined).sort());
  assert.equal(plan(dec).season.directNet, plan(sampleInput()).season.directNet);
});
