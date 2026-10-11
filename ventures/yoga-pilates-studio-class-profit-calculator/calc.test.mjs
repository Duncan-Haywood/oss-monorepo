import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, week, classRevenue, teacherCost, fixedCosts, breakEvenBooked, priceForTarget, maxFlatPay, sampleInput, encodeShare, decodeShare, toCsv } from "./calc.mjs";

// A deliberately plain studio so every figure can be checked by hand: 10 classes, 10 reservations each, all drop-ins at $20, no cancels, no fees.
const plain = (o = {}) => ({
  classesPerWeek: "10", capacity: "20", bookedPerClass: "10", lateCancelPct: "0", classMin: "60", turnoverMin: "0", roomHoursAvailable: "40",
  dropInPct: "100", packPct: "0", dropInPrice: "20", processingPct: "0", lateFee: "0", payrollPct: "0",
  flatPay: "50", ownerRate: "0", adminHours: "0", rentedAdminHours: "0", ownerMaxTeachHours: "40",
  rentMonth: "0", utilitiesMonth: "0", softwareMonth: "0", insuranceMonth: "0", otherMonth: "0", roomRentHour: "30", rentedFillPct: "100", targetMarginPct: "25", ...o,
});
const v = (o) => readInput(plain(o)).v;
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("plain studio: revenue, owner and hire results are hand-checkable", () => {
  const w = week(v(), "owner");
  assert.equal(w.revenue, 2000); // 10 classes x 10 people x $20
  assert.equal(w.net, 2000);
  assert.equal(week(v(), "hire").net, 1500); // 10 classes x $50 flat
  assert.equal(week(v(), "rent").net, 2000 - 10 * 1 * 30); // ten room hours at $30
});

test("unit conversion: monthly costs become weekly at 12/52", () => {
  const f = fixedCosts(v({ rentMonth: "1300", utilitiesMonth: "260", softwareMonth: "52", insuranceMonth: "104", otherMonth: "0" }));
  near(f.rent, 300); near(f.utilities, 60); near(f.software, 12); near(f.insurance, 24); near(f.total, 396);
  near(f.kept, 36);
});

test("renting a room drops premises costs but keeps software and insurance, and pays for changeover time", () => {
  const o = { rentMonth: "1300", softwareMonth: "52", insuranceMonth: "104", turnoverMin: "30" };
  const w = week(v(o), "rent");
  assert.equal(w.premises, fixedCosts(v(o)).keptRaw);
  assert.equal(w.roomRent, 10 * 1.5 * 30); // 90 minutes of room per class
  assert.equal(w.roomHours, 15);
});

test("a rented room draws a different share of the studio's crowd and is capped at capacity", () => {
  assert.equal(week(v({ rentedFillPct: "50" }), "rent").booked, 5);
  assert.equal(week(v({ rentedFillPct: "200", bookedPerClass: "15" }), "rent").booked, 20);
  assert.equal(week(v({ rentedFillPct: "200", bookedPerClass: "15" }), "owner").booked, 15);
});

test("late cancels: non-members pay nothing, members pay anyway, fees add revenue", () => {
  // 10 reservations, 20% late. 50% drop-in at $20, no packs, 50% members at $80 for 8 bookings = $10 per reservation.
  const c = classRevenue(v({ dropInPct: "50", membershipPrice: "80", memberBookingsPerMonth: "8", lateCancelPct: "20", lateFee: "10", lateFeeEnforcePct: "50" }), 10, 20);
  near(c.attended, 8);
  near(c.dropIn, 10 * 0.5 * 0.8 * 20); // 80
  near(c.member, 10 * 0.5 * 10); // 50, unaffected by the cancels
  near(c.fees, 10 * 0.2 * 10 * 0.5); // 10
  near(c.revenue, 140);
});

test("class packs: breakage makes each used class worth more than price over count", () => {
  const c = classRevenue(v({ dropInPct: "0", packPct: "100", packPrice: "180", packClasses: "10", packBreakagePct: "10" }), 10, 0);
  near(c.packPerClass, 180 / (10 * 0.9));
  near(c.pack, 10 * 20);
});

test("processing fees come off revenue including late fees", () => {
  const c = classRevenue(v({ processingPct: "3", lateCancelPct: "50", lateFee: "10", lateFeeEnforcePct: "100" }), 10, 50);
  near(c.processing, c.revenue * 0.03);
  near(c.fees, 50);
});

test("three teacher pay models", () => {
  const o = v({ flatPay: "50", perHeadPay: "4", perHeadMin: "30", sharePct: "25", payrollPct: "10" });
  near(teacherCost(o, "flat", 6, 120), 55);
  near(teacherCost(o, "perHead", 6, 120), 30 * 1.1); // 24 < minimum 30
  near(teacherCost(o, "perHead", 12, 240), 48 * 1.1);
  near(teacherCost(o, "share", 6, 120), 30 * 1.1);
  near(teacherCost(o, "share", 0, 0), 0);
});

test("per-head pay follows attendance but a flat fee does not", () => {
  const o = { perHeadPay: "5", perHeadMin: "0" };
  const thin = (m) => week(v({ ...o, payModel: m }), "hire", { booked: 4 }).teacher;
  const full = (m) => week(v({ ...o, payModel: m }), "hire", { booked: 16 }).teacher;
  assert.equal(thin("flat"), full("flat"));
  assert.equal(thin("perHead"), 200);
  assert.equal(full("perHead"), 800);
});

test("owner and admin hours are priced at the owner rate", () => {
  const o = { ownerRate: "40", adminHours: "5", rentedAdminHours: "2" };
  assert.equal(week(v(o), "owner").ownerPay, (10 + 5) * 40);
  assert.equal(week(v(o), "hire").ownerPay, 5 * 40);
  assert.equal(week(v(o), "rent").ownerPay, (10 + 2) * 40);
});

test("break-even booked per class matches the closed form", () => {
  // Fixed $600/wk, revenue per head $20 x 10 classes = $200 per average head per week: 3.0 heads.
  const o = v({ rentMonth: String((600 * 52) / 12) });
  assert.equal(breakEvenBooked(o, "owner"), 3);
  // Hire: 10 x $50 flat adds $500/wk: (600+500)/200 = 5.5.
  assert.equal(breakEvenBooked(o, "hire"), 5.5);
});

test("break-even is null when a full room still loses", () => {
  assert.equal(breakEvenBooked(v({ rentMonth: "100000" }), "owner"), null);
});

test("price for target margin hits the target and is monotone", () => {
  const o = v({ rentMonth: String((500 * 52) / 12) });
  const p = priceForTarget(o, "owner");
  const w = week(o, "owner", { dropInPrice: p });
  near(w.afterPay / w.revenue, 0.25, 0.0005);
  assert.ok(priceForTarget(v({ rentMonth: String((900 * 52) / 12) }), "owner") > p);
  assert.equal(priceForTarget(v({ dropInPct: "0", packPct: "100", packPrice: "100", packClasses: "5" }), "owner"), null);
});

test("max flat teacher pay leaves exactly the target margin", () => {
  const o = v({ rentMonth: String((400 * 52) / 12), payrollPct: "10" });
  const pay = maxFlatPay(o);
  const w = week({ ...o, flatPay: pay }, "hire", { model: "flat" });
  near(w.afterPay / w.revenue, 0.25, 0.002);
});

test("plan: owner, hire and rent results line up with week()", () => {
  const r = plan(plain({ rentMonth: "1300", ownerRate: "30", adminHours: "4" }));
  assert.equal(r.error, null);
  assert.equal(r.season.setups.owner.afterPay, week(r.input, "owner").afterPay.toFixed(2) * 1);
  assert.equal(r.season.setups.hire.ownerHours, 4);
  assert.equal(r.season.setups.owner.ownerHours, 14);
  near(r.season.setups.owner.perClass * 10, r.season.setups.owner.afterPay, 0.06);
  near(r.season.setups.owner.perRoomHour, r.season.setups.owner.afterPay / 10, 0.011);
});

test("late-cancel cost counts only the revenue non-members would have paid, net of fees", () => {
  const r = plan(plain({ lateCancelPct: "10" }));
  // 10 classes x 10 reservations x 10% x $20, all drop-ins, no fee: $200 a week.
  assert.equal(r.season.lateCost.owner, 200);
  assert.equal(r.season.lateCostYear.owner, 200 * 52);
  assert.equal(r.season.lateHalfGainYear, 100 * 52);
  // An all-member studio loses nothing to cancels.
  const m = plan(plain({ dropInPct: "0", packPct: "0", membershipPrice: "100", memberBookingsPerMonth: "8", lateCancelPct: "10" }));
  assert.equal(m.season.lateCost.owner, 0);
});

test("pay-model table covers all three and names the best", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.season.models.map((m) => m.id), ["flat", "perHead", "share"]);
  assert.ok(r.advice.some((a) => a.startsWith("Teacher pay models")));
});

test("volume table is capped at capacity and rises with attendance", () => {
  const r = plan(plain({ bookedPerClass: "18" }));
  assert.equal(r.table.at(-1).booked, 20);
  for (let i = 1; i < r.table.length; i++) assert.ok(r.table[i].owner >= r.table[i - 1].owner);
});

test("edge: zero reservations gives no NaN and a pure cost result", () => {
  const r = plan(plain({ bookedPerClass: "0", rentMonth: "520" }));
  assert.equal(r.error, null);
  assert.equal(r.season.yieldPerVisit, 0);
  assert.ok(r.season.setups.owner.afterPay < 0);
  assert.ok(!JSON.stringify(r).includes("null,\"NaN") && !/NaN|Infinity/.test(JSON.stringify(r.season)));
});

test("edge: all members and all packs mixes work, and the owner-hours warning fires", () => {
  assert.equal(plan(plain({ dropInPct: "0", packPct: "100", packPrice: "100", packClasses: "5" })).error, null);
  const r = plan(plain({ ownerMaxTeachHours: "5" }));
  assert.equal(r.season.ownerOverHours, true);
  assert.ok(r.advice.some((a) => /more than one teacher can deliver/.test(a)));
});

test("input validation", () => {
  for (const bad of [
    { classesPerWeek: "0" }, { classesPerWeek: "2.5" }, { classesPerWeek: "301" }, { classesPerWeek: "-3" }, { bookedPerClass: "21" }, { lateCancelPct: "95" },
    { dropInPct: "70", packPct: "40" }, { packClasses: "0" }, { packBreakagePct: "90" }, { sharePct: "100" }, { payrollPct: "60" }, { processingPct: "30" },
    { targetMarginPct: "90" }, { classMin: "0" }, { roomHoursAvailable: "0" }, { roomHoursAvailable: "200" }, { capacity: "0" }, { payModel: "tips" }, { dropInPrice: "abc" },
    { dropInPct: "0", packPct: "0", memberBookingsPerMonth: "0" }, { lateFeeEnforcePct: "120" },
  ]) assert.ok(plan(plain(bad)).error, JSON.stringify(bad));
  assert.equal(plan(plain({ dropInPrice: "$20.00", rentMonth: "1,300" })).error, null);
});

test("the shipped example runs and share links round-trip only known keys", () => {
  const s = sampleInput();
  const r = plan(s);
  assert.equal(r.error, null);
  const back = decodeShare("#" + encodeShare(s) + "&evil=1&__proto__=x");
  assert.deepEqual(back, s);
  assert.equal(back.evil, undefined);
  assert.equal(toCsv(r).split("\n").length, 6);
});
