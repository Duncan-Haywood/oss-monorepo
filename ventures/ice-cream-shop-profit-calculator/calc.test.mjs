import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, sweepCsv, monthsCsv, startupCost, payment, balanceAfter, irr, rampAt, seasonFactor, monthModel, yearModel, revenuePerScoop, costPerScoop, averageTicket, WEEKS_PER_MONTH } from "./calc.mjs";

// Open 5 weekdays a year-round (260 days), 200 scoops a day at $4.00: 52,000 scoops and $208,000 a year.
// Mix and cone cost $0.60 + $0.25 = $0.85 a scoop. Staff: 2 staff hours per open hour x 10 hours x $15 = $300 a day.
// Fixed: rent 3,000 + utilities 600 + insurance 200 = 3,800 a month.
const BASE = {
  price: "4", scoopsWeekday: "200", weekdaysOpen: "5", weekendDaysOpen: "0", openHours: "10",
  dairyPerScoop: "0.6", vesselPerScoop: "0.25", cardPct: "3", staffPerOpenHour: "2", wage: "15",
  rent: "3000", utilities: "600", insurance: "200",
  cabinets: "4", cabinetCost: "5000", sqft: "800", buildPerSqft: "50", permits: "3000", signagePos: "5000", inventory: "2000", cashReserve: "15000",
};
// Shakes, toppings and pints added on top of BASE.
const EXTRAS = { shakePct: "10", shakeUplift: "3", shakeCost: "1.2", toppingPct: "40", toppingPrice: "1", toppingCost: "0.3", pintsPerDay: "10", pintPrice: "9", pintCost: "3.5" };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("start-up cost adds cabinets, build-out and every other line", () => {
  const c = startupCost(parse(BASE));
  near(c.equipment, 20000);
  near(c.buildOut, 40000);
  near(c.total, 20000 + 40000 + 3000 + 5000 + 2000 + 15000); // 85,000
  near(startupCost(parse({ ...BASE, otherEquipment: "7000" })).equipment, 27000);
});

test("a year of sales and costs worked by hand", () => {
  const r = compute(BASE);
  assert.deepEqual(r.errors, []);
  const s = r.steady;
  near(s.scoops, 52000);
  near(s.openDays, 260);
  near(s.revenue, 208000);
  near(s.card, 6240);
  near(s.cogs, 44200);
  near(s.labor, 78000); // 300 a day x 260 days
  near(s.staffHours, 5200);
  near(s.fixed, 45600);
  near(s.operating, 208000 - 6240 - 44200 - 78000 - 45600); // 33,960
  near(r.yieldOnCost, 33960 / 85000, 1e-9);
});

test("cost of goods, labor and prime cost are shares of sales", () => {
  const r = compute(BASE);
  near(r.cogsPct, 44200 / 208000, 1e-9); // 21.25%
  near(r.laborPct, 0.375, 1e-9);
  near(r.primePct, 122200 / 208000, 1e-9); // 58.75%
  near(r.scoopsPerStaffHour, 10, 1e-9); // 52,000 scoops / 5,200 staff hours
});

test("shakes, toppings and pints add their own sales, cost and card fees", () => {
  const base = compute(BASE), r = compute({ ...BASE, ...EXTRAS });
  assert.deepEqual(r.errors, []);
  near(r.steady.shakeRev, 52000 * 0.1 * 3); // 15,600
  near(r.steady.toppingRev, 52000 * 0.4 * 1); // 20,800
  near(r.steady.pintRev, 10 * 260 * 9); // 23,400 from 2,600 pints
  near(r.steady.pints, 2600);
  // Added sales 59,800, card 3% = 1,794, added cost: shakes 5,200 x 1.2 + toppings 20,800 x 0.3 + pints 2,600 x 3.5 = 6,240 + 6,240 + 9,100.
  near(r.steady.operating - base.steady.operating, 59800 - 1794 - 21580);
  near(r.steady.operating - base.steady.operating, 36426);
});

test("average ticket is scoops per ticket times sales per scoop", () => {
  const p = parse({ ...BASE, ...EXTRAS, scoopsPerTicket: "2" });
  near(revenuePerScoop(p), 4 + 0.3 + 0.4, 1e-9);
  near(costPerScoop(p), 0.85 + 0.1 * 1.2 + 0.4 * 0.3, 1e-9);
  near(averageTicket(p), 9.4, 1e-9);
  near(averageTicket(parse(BASE)), 4, 1e-9);
  near(compute({ ...BASE, scoopsPerTicket: "2" }).avgTicket, 8, 1e-9);
});

test("break-even scoops per day plug back in to zero operating profit", () => {
  const r = compute(BASE);
  near(r.perScoop, 4 * 0.97 - 0.85, 1e-9); // 3.03
  near(r.beOpDay, (123600 / 3.03) / 260, 1e-9); // 45,600 fixed + 78,000 labor
  const back = compute({ ...BASE, scoopsWeekday: String(r.beOpDay) });
  near(back.steady.operating, 0, 1e-6);
});

test("break-even with a loan covers the payment, and the target price plugs back in", () => {
  const input = { ...BASE, ...EXTRAS, ltcPct: "50", loanRate: "6", termYears: "5", targetYield: "30" };
  const r = compute(input);
  assert.ok(r.annualDebt > 0 && r.beDebtDay > r.beOpDay);
  const back = compute({ ...input, scoopsWeekday: String(r.beDebtDay) });
  near(back.cashAfterDebt, 0, 1e-6);
  const priced = compute({ ...input, price: String(r.priceForTarget) });
  near(priced.yieldOnCost, 0.3, 1e-9);
});

test("hot and off seasons move sales and wrap around the year end", () => {
  const p = parse({ ...BASE, peakFirstMonth: "11", peakMonths: "4", peakPct: "150", offPct: "50" });
  assert.deepEqual([11, 12, 1, 2, 3, 6].map((m) => seasonFactor(p, m)), [1.5, 1.5, 1.5, 1.5, 0.5, 0.5]);
  assert.equal(seasonFactor(parse(BASE), 7), 1);
  const y = yearModel(p);
  near(y.scoops, 52000 * (4 * 1.5 + 8 * 0.5) / 12); // 43,333.33
  near(y.pints, 0);
});

test("an off season of zero closes the shop: no staff paid, rent still runs", () => {
  // Open May to September at 120%: 52,000 x (5 x 1.2) / 12 = 26,000 scoops; labor is 5 of 12 months of 78,000.
  const input = { ...BASE, peakFirstMonth: "5", peakMonths: "5", peakPct: "120", offPct: "0" };
  const r = compute(input);
  assert.deepEqual(r.errors, []);
  const s = r.steady;
  near(s.scoops, 26000);
  near(s.revenue, 104000);
  near(s.labor, 32500);
  near(s.openDays, 260 * 5 / 12);
  near(s.fixed, 45600);
  near(s.operating, 104000 - 3120 - 22100 - 32500 - 45600); // 680
  assert.equal(s.closedMonths, 7);
  assert.equal(s.lossMonths, 7); // each closed month loses its 3,800 of fixed costs
  near(monthModel(parse(input), 1).operating, -3800);
  assert.ok(r.findings.some((f) => /7 month\(s\) lose money/.test(f.title)));
  // Break-even per open day uses the open days only.
  near(r.beOpDay, ((45600 + 32500) / 3.03) / (260 * 5 / 12), 1e-9);
});

test("weekends count separately from weekdays", () => {
  const r = compute({ ...BASE, weekendDaysOpen: "2", scoopsWeekend: "300" });
  near(r.steady.scoops, (200 * 5 + 300 * 2) * 52);
  near(r.steady.openDays, 7 * 52);
  assert.equal(compute({ ...BASE, weekdaysOpen: "0", weekendDaysOpen: "1", scoopsWeekend: "250" }).errors.length, 0);
});

test("the ramp climbs linearly from the month-1 share to full sales", () => {
  const p = parse({ ...BASE, startUtilPct: "20", rampMonths: "5" });
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((m) => rampAt(p, m)), [0.2, 0.4, 0.6, 0.8, 1, 1]);
  assert.equal(rampAt(parse(BASE), 1), 1);
});

test("month-by-month cash, trough and payback agree with a hand calculation", () => {
  // Flat year-round, no ramp, no loan: every month is a twelfth of 33,960.
  const r = compute({ ...BASE, horizonMonths: "12" });
  near(r.months[0].operating, 33960 / 12, 0.01);
  near(r.months[11].cumulative, -85000 + 33960, 0.05);
  assert.equal(r.paybackMonth, null);
  // At $8 a scoop: (416,000 x 0.97 - 44,200 - 78,000 - 45,600) / 12 = 19,643.33 a month; 85,000 / 19,643.33 = 4.33, so month 5.
  const rich = compute({ ...BASE, price: "8", horizonMonths: "24", ltcPct: "0" });
  near(rich.months[0].operating, 235720 / 12, 0.01);
  assert.equal(rich.paybackMonth, 5);
  assert.ok(rich.months[4].cumulative >= 0 && rich.months[3].cumulative < 0);
});

test("a slow ramp and a closed winter dig a cash hole that the trough reports", () => {
  const r = compute({ ...BASE, price: "8", startUtilPct: "0", rampMonths: "6", horizonMonths: "36" });
  assert.ok(r.trough < -r.equity);
  assert.ok(r.troughMonth >= 1);
  assert.ok(r.findings.some((f) => /ramp-up/.test(f.title)));
  assert.ok(r.firstProfitMonth > 1);
});

test("loan maths: known payment, zero-rate payment and balance", () => {
  near(payment(100000, 6, 30), 599.55, 0.01);
  near(payment(100000, 0, 10), 100000 / 120, 1e-9);
  near(balanceAfter(50000, 0, 10, 60), 25000, 1e-9);
  assert.equal(balanceAfter(50000, 6, 10, 120), 0);
  const r = compute({ ...BASE, ltcPct: "50", loanRate: "0", termYears: "10" });
  near(r.loan, 42500);
  near(r.annualDebt, 4250, 1e-9);
  near(r.equity, 42500);
  near(r.cashAfterDebt, 33960 - 4250);
});

test("a sale at a multiple of last year's profit pays off the loan and feeds the IRR", () => {
  const input = { ...BASE, price: "8", horizonMonths: "12", exitMultiple: "3" };
  const r = compute(input);
  near(r.salePrice, 3 * r.steady.operating, 0.05);
  near(r.saleProceeds, r.salePrice - r.payoff);
  const m = Math.pow(1 + r.equityIrr, 1 / 12) - 1;
  let npv = -r.equity;
  for (let i = 1; i <= 12; i++) npv += (r.months[i - 1].cash + (i === 12 ? r.saleProceeds : 0)) / Math.pow(1 + m, i);
  near(npv, 0, 0.05);
  assert.equal(compute({ ...BASE, price: "8" }).saleProceeds, 0); // no multiple, no sale
});

test("irr finds a known rate and refuses flows with no sign change", () => {
  near(irr([-100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 112]), 0.12, 1e-6);
  assert.equal(irr([100, 10, 10]), null);
});

test("sensitivity tables recompute from the inputs", () => {
  const r = compute(BASE);
  near(r.sweep.find((x) => x.scale === 1).operating, 33960);
  // 80% of scoops: sales 166,400, card 4,992, cost 35,360, labor 78,000, fixed 45,600.
  near(r.sweep.find((x) => x.scale === 0.8).operating, 166400 - 4992 - 35360 - 78000 - 45600, 0.02); // 2,448
  near(r.sweep.find((x) => x.scale === 0.8).scoopsPerDay, 160, 1e-9);
  // Price +10% = $4.40: sales 228,800, card 6,864.
  near(r.priceSweep.find((x) => x.pct === 10).operating, 228800 - 6864 - 44200 - 78000 - 45600, 0.02); // 54,136
  assert.match(sweepCsv(r), /^sales_vs_plan_pct,/);
  assert.equal(monthsCsv(r).split("\n").length, 61);
});

test("a shop that loses money is flagged and the sample runs clean", () => {
  const r = compute({ ...BASE, price: "2" });
  assert.ok(r.findings.some((f) => f.severity === "high"));
  const s = compute(SAMPLE);
  assert.deepEqual(s.errors, []);
  assert.match(summaryText(s), /Debt coverage/);
  assert.match(summaryText(s), /prime cost/);
  assert.ok(s.findings.some((f) => /zoning/i.test(f.title)));
  assert.ok(s.months.length === 60 && s.steady.revenue > 0);
});

test("a price that cannot cover per-scoop cost cannot break even", () => {
  const r = compute({ ...BASE, price: "0.5" });
  assert.equal(r.beDebtDay, null);
  assert.ok(r.findings.some((f) => /earns/.test(f.title)));
});

test("bad input is rejected instead of clamped", () => {
  const bad = [{ price: "0" }, { price: "" }, { price: "abc" }, { scoopsWeekday: "" }, { scoopsWeekday: "-1" }, { scoopsWeekday: "6000" }, { scoopsWeekend: "-5" },
    { scoopsPerTicket: "0.5" }, { scoopsPerTicket: "25" }, { shakePct: "101" }, { shakeUplift: "-1" }, { toppingPct: "301" }, { toppingPrice: "-1" },
    { pintsPerDay: "5" }, { pintsPerDay: "-1" }, { pintsPerDay: "5", pintPrice: "-2" },
    { weekdaysOpen: "6" }, { weekdaysOpen: "0", weekendDaysOpen: "0" }, { weekendDaysOpen: "3" }, { weekdaysOpen: "2.5" },
    { openHours: "0" }, { openHours: "25" }, { peakMonths: "13" }, { peakFirstMonth: "0" }, { peakPct: "400" }, { offPct: "-5" },
    { peakMonths: "6", peakPct: "0", offPct: "0" }, { peakMonths: "12", peakPct: "0" },
    { dairyPerScoop: "-0.1" }, { cardPct: "25" }, { burdenPct: "70" }, { staffPerOpenHour: "60" }, { wage: "-1" }, { rent: "-1" }, { cabinetCost: "-5" }, { cabinets: "2.5" }, { cabinets: "51" },
    { startMonth: "13" }, { startUtilPct: "120" }, { rampMonths: "2.5" }, { ltcPct: "95" }, { loanRate: "40" },
    { termYears: "0" }, { horizonMonths: "6" }, { exitMultiple: "20" }, { targetYield: "0" }, { targetPayback: "0" }];
  for (const b of bad) assert.ok(compute({ ...BASE, ...b }).errors.length > 0, JSON.stringify(b));
  assert.equal(compute({ ...BASE, price: "$4.00" }).errors.length, 0);
  assert.equal(compute({ ...BASE, peakMonths: "12", peakPct: "100", offPct: "0" }).errors.length, 0); // never off: off share is unused
});

test("payback later than the target is noted", () => {
  const r = compute({ ...BASE, price: "8", horizonMonths: "60", targetPayback: "1" });
  assert.ok(r.paybackMonth > 1);
  assert.ok(r.findings.some((f) => /later than your 1-month target/.test(f.title)));
});
