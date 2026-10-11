import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, serviceLine, fixedCosts, chairModes, breakEven, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, SERVICES } from "./calc.mjs";

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
  // 48 booked at 8% no-show = 44.16 completed
  near(t.completed, 44.16, 0.0001);
  // 30x.92x$40 + 8x.92x$20 + 10x.92x$65 = 1104 + 147.2 + 598 = $1,849.20
  near(t.serviceRevenue, 1849.2, 0.0001);
  // supplies: 69 + 11.04 + 41.4 = $121.44
  near(t.supplies, 121.44, 0.0001);
  // booked chair hours include the no-show slots: (1200 + 160 + 600) / 60 = 32.67
  near(t.bookedHours, 32.6667, 0.001);
});

test("no-show cost is the margin of the empty slots, retail included, and scales with the rate", () => {
  const r = plan(sampleInput());
  // 3.84 empty slots: cut 2.4 x (40-2.5+1.8) + beard .64 x (20-1.5+1.8) + combo .8 x (65-4.5+1.8) = 94.32 + 12.992 + 49.84 = 157.15
  assert.equal(r.season.noShowCost, 157.15);
  assert.equal(r.season.noShowCostYear, 8171.9);
  assert.equal(r.season.noShowRevenue, 160.8);
  const zero = plan({ ...sampleInput(), noShowPct: "0" });
  assert.equal(zero.season.noShowCost, 0);
  assert.ok(plan({ ...sampleInput(), noShowPct: "16" }).season.noShowCost > r.season.noShowCost * 1.9);
});

test("a haircut costs the owner's chair time (loaded for no-shows), supplies and its fixed-cost share", () => {
  const cut = serviceLine(base(), SERVICES[0]);
  // 40 min at $25 = $16.67, divided by .92 completed = $18.12; fixed share $183.46 / 44.16 = $4.15
  assert.equal(cut.labor, 18.12);
  assert.equal(cut.fixedShare, 4.15);
  assert.equal(cut.cost, 24.77);
  assert.equal(cut.profit, 15.23);
  assert.equal(cut.marginPct, 38.1);
});

test("price needed for the target margin gives exactly that margin, owner-operated and employed", () => {
  const v = base();
  for (const s of SERVICES) {
    const l = serviceLine(v, s);
    near((l.targetPrice - l.cost) / l.targetPrice, 0.35, 0.001);
    // employed: price - commission*(1+payroll)*price - supplies - fixed share = margin * price
    const eff = (45 * 1.08) / 100;
    near((l.employTargetPrice * (1 - eff) - l.mat - l.fixedShare) / l.employTargetPrice, 0.35, 0.001);
  }
});

test("profit per chair hour is the expected take of a booked hour, before fixed cost and pay", () => {
  const v = base();
  // cut: .92 x ($40 - $2.50 + $1.80 retail) / (40/60) = .92 x 39.3 / .6667 = $54.23
  assert.equal(serviceLine(v, SERVICES[0]).perChairHour, 54.23);
  const r = plan(sampleInput());
  // weekly net before pay $1,623.79 over 40 chair hours
  assert.equal(r.season.profitPerChairHour, 40.59);
  assert.equal(r.season.profitPerChairHourAfterPay, 20.18);
  assert.equal(r.season.profitPerCut, 18.28);
});

test("retail attach adds margin per completed service, and zero attach adds nothing", () => {
  const v = base();
  // 15% x ($22 - $10) = $1.80
  assert.equal(serviceLine(v, SERVICES[0]).retailPerCut, 1.8);
  const none = plan({ ...sampleInput(), retailAttachPct: "0" });
  assert.equal(none.season.retail, 0);
  assert.ok(plan(sampleInput()).season.ownerNet > none.season.ownerNet);
});

test("the three chair modes: owner cuts, employed barber on commission, renter pays booth rent", () => {
  const m = chairModes(base());
  const fixed = 183.46153846;
  near(m.owner.net, 1849.2 - 121.44 + 79.488 - fixed, 0.005);
  near(m.owner.afterPay, m.owner.net - 32.6667 * 25, 0.05);
  // commission 45% + 8% payroll extras on it = 48.6% of service revenue
  near(m.employ.net, 1849.2 * (1 - 0.486) - 121.44 + 79.488 - fixed, 0.005);
  near(m.rent.net, 275 - fixed, 0.0001);
});

test("renting beats employing only below the equal-booth-rent point, and the equal commission round-trips", () => {
  const r = plan(sampleInput());
  // equal booth rent = what the shop keeps from an employed barber before fixed cost
  near(r.season.equalRent, r.season.employNet + r.season.fixed.total, 0.02);
  // set the booth rent to that figure: renting and employing now net the same
  const same = plan({ ...sampleInput(), boothRentWeek: String(r.season.equalRent) });
  near(same.season.rentNet, same.season.employNet, 0.02);
  // and the equal commission, fed back as the commission, gives the employed net equal to renting at $275
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
  const big = { ...v, cutQty: 30000, beardQty: 8000, comboQty: 10000, rentPerMonth: v.rentPerMonth * 1000, equipmentCost: v.equipmentCost * 1000, otherFixedMonth: v.otherFixedMonth * 1000 };
  const scale = breakEven(big).owner.completed / chairModes(big).t.completed;
  near(chairModes(big, scale).owner.afterPay, 0, 5);
  // an employed barber costs commission on every sale, so the contribution is lower than owner's own at the same mix when owner pay is small
  const cheap = breakEven({ ...v, ownerRate: 0 });
  assert.ok(cheap.owner.completed < be.owner.completed);
});

test("break-even is null, with advice to raise prices, when a service earns less than the owner's time", () => {
  const r = plan({ ...sampleInput(), cutPrice: "5", beardPrice: "3", comboPrice: "8", retailAttachPct: "0" });
  assert.equal(r.season.breakEven.owner, null);
  assert.match(r.advice.join(" "), /less than your own hourly pay/);
});

test("a price under the target price is flagged with the needed price", () => {
  const r = plan({ ...sampleInput(), cutPrice: "30" });
  assert.match(r.advice.join(" "), /Haircut or fade at \$30\.00 earns/);
  assert.match(r.advice.join(" "), /would need \$3\d\.\d\d/);
});

test("chair utilization compares booked hours with chair hours and flags overbooking", () => {
  const ok = plan(sampleInput());
  assert.equal(ok.season.utilizationPct, 81.7);
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
  assert.match(plan({ ...sampleInput(), cutQty: "1.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), cutPrice: "-1" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Target margin/);
  assert.match(plan({ ...sampleInput(), cutQty: "0", beardQty: "0", comboQty: "0" }).error, /appointments you book/);
  assert.match(plan({ ...sampleInput(), equipmentYears: "0" }).error, /half a year/);
  assert.match(plan({ ...sampleInput(), chairHoursPerWeek: "200" }).error, /at most 168/);
  assert.match(plan({ ...sampleInput(), noShowPct: "95" }).error, /No-show rate/);
  assert.match(plan({ ...sampleInput(), commissionPct: "100" }).error, /commission/i);
  assert.match(plan({ ...sampleInput(), commissionPct: "60", targetMarginPct: "40" }).error, /together/);
  assert.match(plan({ ...sampleInput(), retailAttachPct: "120" }).error, /Retail attach/);
  assert.match(plan({ ...sampleInput(), cutQty: "abc" }).error, /not negative/);
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
