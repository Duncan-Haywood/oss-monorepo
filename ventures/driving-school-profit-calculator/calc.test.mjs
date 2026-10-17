import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, serviceLine, fixedCosts, carModes, breakEven, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, SERVICES } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("weekly fixed cost spreads monthly rent over 52/12 weeks and the car over its years", () => {
  const f = fixedCosts(base());
  // $400 x 12 / 52 = $92.31; $14,000 / 5 years / 52 = $53.85; $450 x 12 / 52 = $103.85
  assert.equal(f.rent, 92.31);
  assert.equal(f.car, 53.85);
  assert.equal(f.other, 103.85);
  assert.equal(f.total, 250);
});

test("a late cancellation empties the slot: only completed lessons earn revenue and burn fuel", () => {
  const t = carModes(base()).t;
  // 27 booked at 10% = 24.3 completed
  near(t.completed, 24.3, 0.0001);
  // .9 x (20 x $65 + 4 x $120 + 3 x $150) = .9 x 2230 = $2,007
  near(t.serviceRevenue, 2007, 0.0001);
  // .9 x (20 x 6 + 4 x 11 + 3 x 9) = .9 x 191 = $171.90
  near(t.fuelWear, 171.9, 0.0001);
  // booked hours include the cancelled slots: (1200 + 480 + 270) / 60 = 32.5
  near(t.bookedHours, 32.5, 0.0001);
});

test("cancellation cost is the margin of the empty slots, road-test hire included", () => {
  const r = plan(sampleInput());
  // 2 x (65 - 6 + 6.7) + .4 x (120 - 11 + 6.7) + .3 x (150 - 9 + 6.7) = 131.4 + 46.28 + 44.31 = $221.99
  near(r.season.noShowCost, 221.99);
  near(r.season.noShowCostYear, 221.99 * 52, 0.6);
  const none = plan({ ...sampleInput(), noShowPct: "0" });
  assert.equal(none.season.noShowCost, 0);
  assert.ok(none.season.ownerNet > r.season.ownerNet);
});

test("a standard lesson costs the owner's car time (loaded for cancellations), fuel and its fixed-cost share", () => {
  const l = serviceLine(base(), SERVICES[0]);
  assert.equal(SERVICES[0].id, "lesson");
  // labour: 1 hour x $30 / .9 = 33.33; fixed share: $250 / 24.3 completed = 10.29; plus $6 fuel
  assert.equal(l.labor, 33.33);
  assert.equal(l.fixedShare, 10.29);
  assert.equal(l.cost, 49.62);
  assert.equal(l.profit, 15.38);
  assert.equal(l.marginPct, 23.7);
});

test("the price for the target margin gives exactly that margin, instructed by the owner and employed", () => {
  const v = base();
  for (const s of SERVICES) {
    const l = serviceLine(v, s);
    near(((l.targetPrice - l.cost) / l.targetPrice) * 100, v.targetMarginPct, 0.05);
    const pay = (v.instructorPayPct * (1 + v.payrollPct / 100)) / 100;
    const empCost = pay * l.employTargetPrice + l.mat + l.fixedShare;
    near(((l.employTargetPrice - empCost) / l.employTargetPrice) * 100, v.targetMarginPct, 0.05);
  }
  assert.equal(serviceLine(base(), SERVICES[0]).targetPrice, 76.34);
});

test("profit per car hour is the expected take of a booked hour, before fixed cost and pay", () => {
  const l = serviceLine(base(), SERVICES[0]);
  // .9 x (65 - 6 + 6.7) per 1 hour = 59.13
  assert.equal(l.perCarHour, 59.13);
  const block = serviceLine(base(), SERVICES[1]);
  // .9 x (120 - 11 + 6.7) / 2 hours = 52.065
  near(block.perCarHour, 52.07, 0.006);
});

test("road-test car hire adds margin per completed lesson, and zero attach adds nothing", () => {
  const without = plan({ ...sampleInput(), addonAttachPct: "0" });
  const withHire = plan(sampleInput());
  // 24.3 completed x 10% x ($75 - $8) = $162.81
  near(withHire.season.addon - without.season.addon, 162.81);
  assert.equal(without.season.addon, 0);
});

test("the three car modes: owner instructs, employed instructor on a share, independent instructor leases", () => {
  const r = plan(sampleInput());
  // owner: 2007 - 171.9 + 162.81 - 250 = 1,747.91; own pay 32.5 h x $30 = 975
  near(r.season.ownerNet, 1747.91);
  near(r.season.ownerAfterPay, 772.91);
  // employ: 2007 x (1 - .44) - 171.9 + 162.81 - 250 = 864.83
  near(r.season.employNet, 864.83);
  // lease: $450 - $250 fixed
  near(r.season.rentNet, 200);
});

test("leasing beats employing only below the equal-lease point, and the equal instructor pay round-trips", () => {
  const r = plan(sampleInput());
  near(r.season.equalRent, 1114.83);
  const at = plan({ ...sampleInput(), carLeaseWeek: String(r.season.equalRent) });
  near(at.season.rentNet, at.season.employNet, 0.02);
  const m = carModes({ ...base(), instructorPayPct: r.season.equalPay });
  near(m.employ.net, m.rent.net, 1.5);
  assert.ok(r.season.equalPay > 0 && r.season.equalPay < 100);
});

test("break-even completed lessons per week covers the fixed cost exactly at the mix", () => {
  const v = base();
  const be = breakEven(v);
  assert.ok(be.owner && be.employ);
  near(be.owner.completed * be.owner.contribution, fixedCosts(v).totalRaw, 3); // completed is rounded to one decimal
  assert.ok(be.owner.booked > be.owner.completed);
});

test("break-even is null, with advice to raise prices, when a lesson earns less than the owner's time", () => {
  const r = plan({ ...sampleInput(), lessonPrice: "20", blockPrice: "30", testPrice: "30", addonAttachPct: "0" });
  assert.equal(r.season.breakEven.owner, null);
  assert.ok(r.advice.some((a) => /Raise a price first/.test(a)));
});

test("a price under the target price is flagged with the needed price", () => {
  const r = plan(sampleInput());
  assert.ok(r.advice.some((a) => /Standard in-car lesson at \$65\.00 earns 23\.7%/.test(a) && /\$76\.34/.test(a)));
});

test("car utilization compares booked hours with car hours and flags overbooking", () => {
  const ok = plan(sampleInput());
  assert.equal(ok.season.utilizationPct, 90.3);
  const over = plan({ ...sampleInput(), carHoursPerWeek: "20" });
  assert.equal(over.season.utilizationPct, 162.5);
  assert.ok(over.advice.some((a) => /cannot take that many/.test(a)));
});

test("the volume table has five rows, 100% matches the headline, and more volume earns more when lessons beat their costs", () => {
  const r = plan(sampleInput());
  assert.equal(r.table.length, 5);
  const full = r.table.find((x) => x.pct === 100);
  near(full.owner, r.season.ownerAfterPay);
  near(full.employ, r.season.employNet);
  for (let i = 1; i < r.table.length; i++) assert.ok(r.table[i].employ >= r.table[i - 1].employ);
});

test("bad input is rejected with a plain message", () => {
  for (const bad of [
    { lessonQty: "-1" }, { lessonQty: "2.5" }, { lessonQty: "0", blockQty: "0", testQty: "0" }, { noShowPct: "95" }, { instructorPayPct: "100" },
    { addonAttachPct: "120" }, { carYears: "0" }, { targetMarginPct: "95" }, { carHoursPerWeek: "0" }, { lessonPrice: "abc" }, { instructorPayPct: "70", payrollPct: "20", targetMarginPct: "30" },
  ]) {
    const r = plan({ ...sampleInput(), ...bad });
    assert.ok(r.error, JSON.stringify(bad));
  }
});

test("tips are not an input: there is no tip field to inflate revenue", () => {
  assert.ok(!SHARE_KEYS.some((k) => /tip/i.test(k)));
});

test("share links round-trip known keys and drop everything else", () => {
  const q = encodeShare({ ...sampleInput(), evil: "<script>" });
  assert.ok(!/evil|script/.test(q));
  const back = decodeShare("#" + q + "&x=1");
  assert.deepEqual(back, Object.fromEntries(SHARE_KEYS.map((k) => [k, sampleInput()[k]])));
});

test("csv has a header and one row per volume", () => {
  const lines = toCsv(plan(sampleInput())).split("\n");
  assert.equal(lines.length, 6);
  assert.match(lines[0], /^volume_pct,booked_per_week,car_hours,utilization_pct,owner_instructs_after_pay,employ_instructor,lease_car$/);
});
