import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, serviceLine, fixedCosts, chairModes, breakEven, sampleInput as shippedSample, encodeShare, decodeShare, toCsv, SHARE_KEYS, SERVICES } from "./calc.mjs";

// Arithmetic tests are pinned to a fixed reference week (long appointments, $650 rent) so their hand-checked numbers do not move when the page's example changes.
const sampleInput = () => ({
  ...shippedSample(),
  facialQty: "4", facialPrice: "250", facialMin: "300", facialMat: "35", waxQty: "4", waxPrice: "120", waxMin: "150", waxMat: "12", peelQty: "3", peelPrice: "90", peelMin: "120", peelMat: "8",
  ownerRate: "25", boothRentWeek: "300", retailPrice: "18", retailCost: "7",
});
const base = () => readInput(sampleInput()).v;
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("weekly fixed cost spreads monthly rent over 52/12 weeks and equipment over its years", () => {
  const f = fixedCosts(base());
  // $650 x 12 / 52 = $150.00; $1,800 / 6 years / 52 = $5.77; $120 x 12 / 52 = $27.69
  assert.equal(f.rent, 150);
  assert.equal(f.equipment, 5.77);
  assert.equal(f.other, 27.69);
  assert.equal(f.total, 183.46);
});

test("a no-show empties the slot: only completed appointments earn revenue and use supplies", () => {
  const t = chairModes(base()).t;
  // 11 booked at 10% no-show = 9.9 completed
  near(t.completed, 9.9, 0.0001);
  // 4x.9x$250 + 4x.9x$120 + 3x.9x$90 = 900 + 432 + 243 = $1,575
  near(t.serviceRevenue, 1575, 0.0001);
  // supplies: 4x.9x35 + 4x.9x12 + 3x.9x8 = 126 + 43.2 + 21.6 = $190.80
  near(t.supplies, 190.8, 0.0001);
  // booked chair hours include the no-show slots: (1200 + 600 + 360) / 60 = 36
  near(t.bookedHours, 36, 0.001);
});

test("no-show cost is the margin of the empty slots, retail included, and scales with the rate", () => {
  const r = plan(sampleInput());
  // 1.1 empty slots: facial .4 x (250-35+1.65) + wax .4 x (120-12+1.65) + peel .3 x (90-8+1.65) = 86.66 + 43.86 + 25.095 = 155.61
  assert.equal(r.season.noShowCost, 155.61);
  assert.equal(r.season.noShowCostYear, 8091.98);
  assert.equal(r.season.noShowRevenue, 175);
  const zero = plan({ ...sampleInput(), noShowPct: "0" });
  assert.equal(zero.season.noShowCost, 0);
  assert.ok(plan({ ...sampleInput(), noShowPct: "20" }).season.noShowCost > r.season.noShowCost * 1.9);
});

test("a facial or wax appointment costs the owner's chair time (loaded for no-shows), supplies and its fixed-cost share", () => {
  const facial = serviceLine(base(), SERVICES[0]);
  // 300 min at $25 = $125, divided by .9 completed = $138.89; fixed share $183.46 / 9.9 = $18.53
  assert.equal(facial.labor, 138.89);
  assert.equal(facial.fixedShare, 18.53);
  assert.equal(facial.cost, 192.42);
  assert.equal(facial.profit, 57.58);
  assert.equal(facial.marginPct, 23);
});

test("price needed for the target margin gives exactly that margin, owner-operated and employed", () => {
  const v = base();
  for (const s of SERVICES) {
    const l = serviceLine(v, s);
    near((l.targetPrice - l.cost) / l.targetPrice, 0.35, 0.001);
    // employed: price - commission*(1+payroll)*price - supplies - fixed share = margin * price
    const eff = (40 * 1.08) / 100;
    near((l.employTargetPrice * (1 - eff) - l.mat - l.fixedShare) / l.employTargetPrice, 0.35, 0.001);
  }
});

test("profit per chair hour is the expected take of a booked hour, before fixed cost and pay", () => {
  const v = base();
  // facial: .9 x ($250 - $35 + $1.65 retail) / 5 hours = $39.00
  assert.equal(serviceLine(v, SERVICES[0]).perChairHour, 39);
  const r = plan(sampleInput());
  // weekly net before pay $1,217.07 over 40 chair hours
  assert.equal(r.season.profitPerChairHour, 30.43);
  assert.equal(r.season.profitPerChairHourAfterPay, 7.93);
  assert.equal(r.season.profitPerStyle, 32.03);
});

test("retail attach adds margin per completed service, and zero attach adds nothing", () => {
  const v = base();
  // 15% x ($18 - $7) = $1.65
  assert.equal(serviceLine(v, SERVICES[0]).retailPerStyle, 1.65);
  const none = plan({ ...sampleInput(), retailAttachPct: "0" });
  assert.equal(none.season.retail, 0);
  assert.ok(plan(sampleInput()).season.ownerNet > none.season.ownerNet);
});

test("the three chair modes: owner works the chair, employed esthetician on commission, renter pays booth rent", () => {
  const m = chairModes(base());
  const fixed = 183.46153846;
  near(m.owner.net, 1575 - 190.8 + 16.335 - fixed, 0.005);
  near(m.owner.afterPay, m.owner.net - 36 * 25, 0.05);
  // commission 40% + 8% payroll extras on it = 43.2% of service revenue
  near(m.employ.net, 1575 * (1 - 0.432) - 190.8 + 16.335 - fixed, 0.005);
  near(m.rent.net, 300 - fixed, 0.0001);
});

test("renting beats employing only below the equal-booth-rent point, and the equal commission round-trips", () => {
  const r = plan(sampleInput());
  // equal booth rent = what the shop keeps from an employed esthetician before fixed cost
  near(r.season.equalRent, r.season.employNet + r.season.fixed.total, 0.02);
  // set the booth rent to that figure: renting and employing now net the same
  const same = plan({ ...sampleInput(), boothRentWeek: String(r.season.equalRent) });
  near(same.season.rentNet, same.season.employNet, 0.02);
  // and the equal commission, fed back as the commission, gives the employed net equal to renting at $300
  const c = plan({ ...sampleInput(), commissionPct: String(r.season.equalCommission), targetMarginPct: "5" });
  near(c.season.employNet, c.season.rentNet, 4);
  assert.match(plan(sampleInput()).advice.join(" "), /Employing is the better deal/);
  assert.match(plan({ ...sampleInput(), boothRentWeek: "1500" }).advice.join(" "), /Renting is the better deal/);
});

test("break-even completed services per week covers the fixed cost exactly at the mix", () => {
  const v = base();
  const be = breakEven(v);
  assert.ok(be.owner && be.employ);
  // rebuild the week 1000x larger (fixed cost too) so rounding of whole appointments is negligible, scale to the break-even volume, and the chair nets zero after the owner's pay
  const big = { ...v, facialQty: 4000, waxQty: 4000, peelQty: 3000, rentPerMonth: v.rentPerMonth * 1000, equipmentCost: v.equipmentCost * 1000, otherFixedMonth: v.otherFixedMonth * 1000 };
  const scale = breakEven(big).owner.completed / chairModes(big).t.completed;
  near(chairModes(big, scale).owner.afterPay, 0, 5);
  // an employed esthetician costs commission on every sale, so the contribution is lower than owner's own at the same mix when owner pay is small
  const cheap = breakEven({ ...v, ownerRate: 0 });
  assert.ok(cheap.owner.completed < be.owner.completed);
});

test("break-even is null, with advice to raise prices, when a service earns less than the owner's time", () => {
  const r = plan({ ...sampleInput(), facialPrice: "5", waxPrice: "3", peelPrice: "8", retailAttachPct: "0" });
  assert.equal(r.season.breakEven.owner, null);
  assert.match(r.advice.join(" "), /less than your own hourly pay/);
});

test("a price under the target price is flagged with the needed price", () => {
  const r = plan({ ...sampleInput(), facialPrice: "200" });
  assert.match(r.advice.join(" "), /Facials at \$200\.00 earns/);
  assert.match(r.advice.join(" "), /would need \$2\d\d\.\d\d/);
});

test("chair utilization compares booked hours with chair hours and flags overbooking", () => {
  const ok = plan(sampleInput());
  assert.equal(ok.season.utilizationPct, 90);
  const crowded = plan({ ...sampleInput(), chairHoursPerWeek: "20" });
  assert.ok(crowded.season.utilizationPct > 100);
  assert.match(crowded.advice.join(" "), /One chair cannot take that many/);
});

test("the volume table has five rows, 100% matches the headline, and more volume earns more", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.table.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.equal(r.table[2].owner, r.season.ownerAfterPay);
  assert.equal(r.table[2].employ, r.season.employNet);
  assert.equal(r.table[2].rent, r.season.rentNet);
  assert.ok(r.table[4].owner > r.table[0].owner);
});

test("bad input is rejected with a plain message", () => {
  assert.match(plan({ ...sampleInput(), facialQty: "1.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), facialPrice: "-1" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Target margin/);
  assert.match(plan({ ...sampleInput(), facialQty: "0", waxQty: "0", peelQty: "0" }).error, /appointments you book/);
  assert.match(plan({ ...sampleInput(), equipmentYears: "0" }).error, /half a year/);
  assert.match(plan({ ...sampleInput(), chairHoursPerWeek: "200" }).error, /at most 168/);
  assert.match(plan({ ...sampleInput(), noShowPct: "95" }).error, /No-show rate/);
  assert.match(plan({ ...sampleInput(), commissionPct: "100" }).error, /commission/i);
  assert.match(plan({ ...sampleInput(), commissionPct: "60", targetMarginPct: "40" }).error, /together/);
  assert.match(plan({ ...sampleInput(), retailAttachPct: "120" }).error, /Retail attach/);
  assert.match(plan({ ...sampleInput(), facialQty: "abc" }).error, /not negative/);
});

test("tips are not an input: there is no tip field to inflate revenue", () => {
  assert.ok(!SHARE_KEYS.some((k) => /tip/i.test(k)));
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

test("the example shipped on the page is a valid week and the owner profits from the chair", () => {
  const r = plan(shippedSample());
  assert.equal(r.error, null);
  assert.equal(r.season.booked, 26);
  assert.ok(r.season.utilizationPct > 0 && r.season.utilizationPct <= 100);
  assert.ok(r.season.ownerNet > 0);
});
