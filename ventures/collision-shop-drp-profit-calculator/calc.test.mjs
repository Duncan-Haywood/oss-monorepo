import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, roEconomics, model, drpValue, breakEvenNewRos, volumeTable, lowestDrpRate, termsCost } from "./calc.mjs";

// One easy-to-check job: 10 body + 0 paint hours, $100/hr retail and $80/hr DRP, $1,000 parts at 0% markup.
const simple = {
  ...DEFAULTS, retailRos: 0, repricedRos: 0, newDrpRos: 0,
  bodyHrs: 10, refinishHrs: 0, partsCost: 1000, partsMarkupPct: 0, otherCostPerRo: 0,
  bodyRate: 100, refinishRate: 100, materialsRate: 0, drpBodyRate: 80, drpRefinishRate: 80, drpMaterialsRate: 0,
  drpPartsDiscountPct: 0, drpAdminPerRo: 0, drpFeePct: 0, techPayPerHr: 30, payrollBurdenPct: 0,
  flagHrsPerTech: 100, techFixedMonthly: 0, fixedMonthly: 0, ownerPayMonthly: 0,
};

test("num parses money and percents, NaN otherwise", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("12%"), 12);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("a retail job: labor + parts revenue, tech pay + parts cost", () => {
  const r = roEconomics(simple, "retail");
  assert.equal(r.revenue, 2000);
  assert.equal(r.cost, 1300);
  assert.equal(r.contribution, 700);
  assert.equal(r.contributionPerHour, 70);
});

test("a DRP job takes the lower labor rate, the parts discount, the admin cost and the program fee", () => {
  const d = roEconomics({ ...simple, drpPartsDiscountPct: 10, partsMarkupPct: 20, drpAdminPerRo: 50, drpFeePct: 1 }, "drp");
  assert.equal(d.labor, 800);
  assert.equal(d.parts, 1080); // 1,000 cost + 20% markup = 1,200 list, less 10%
  assert.equal(d.revenue, 1880);
  assert.equal(d.cost, 300 + 1000 + 50 + 18.8);
});

test("materials are bought at the retail charge's cost share even when the DRP caps what is billed", () => {
  const o = { ...simple, bodyHrs: 0, refinishHrs: 10, materialsRate: 40, drpMaterialsRate: 30, materialsCostPct: 50, partsCost: 0 };
  assert.equal(roEconomics(o, "retail").materials, 400);
  assert.equal(roEconomics(o, "drp").materials, 300);
  assert.equal(roEconomics(o, "drp").materialsCost, 200);
});

test("without the program the insurer's existing jobs are paid at retail; with it, at DRP terms", () => {
  const o = { ...simple, repricedRos: 10 };
  assert.equal(model(o, false).revenue, 20000);
  assert.equal(model(o, true).revenue, 18000);
  assert.equal(drpValue(o).gain, -2000);
});

test("new promised volume only exists with the program", () => {
  const o = { ...simple, newDrpRos: 5 };
  assert.equal(model(o, false).ros, 0);
  assert.equal(model(o, true).ros, 5);
});

test("technicians come in whole steps and each carries a fixed monthly cost", () => {
  const o = { ...simple, newDrpRos: 10, techFixedMonthly: 1000 }; // 100 hours = exactly 1 tech
  assert.equal(model(o).techs, 1);
  assert.equal(model({ ...o, newDrpRos: 11 }).techs, 2);
  assert.equal(model({ ...o, newDrpRos: 0 }).techs, 0);
});

test("profit subtracts fixed overhead and owner pay", () => {
  const o = { ...simple, repricedRos: 10, fixedMonthly: 5000, ownerPayMonthly: 3000 };
  assert.equal(model(o, false).profit, 20000 - 13000 - 8000);
});

test("break-even new volume finds where the discount is earned back", () => {
  // each repriced job loses $200; each new job earns $500 (80*10 + 1000 - 300 - 1000)
  const o = { ...simple, repricedRos: 10 };
  const be = breakEvenNewRos(o);
  assert.equal(be.possible, true);
  assert.equal(be.ros, 4);
  assert.equal(model({ ...o, newDrpRos: 4 }).profit >= model(o, false).profit, true);
  assert.equal(model({ ...o, newDrpRos: 3 }).profit >= model(o, false).profit, false);
});

test("break-even is impossible when a DRP job loses money", () => {
  const o = { ...simple, repricedRos: 10, drpBodyRate: 10, drpAdminPerRo: 200 };
  assert.equal(breakEvenNewRos(o).possible, false);
});

test("break-even does not accept a lucky technician step as the answer", () => {
  const o = { ...simple, repricedRos: 10, newDrpRos: 0, techFixedMonthly: 4000 };
  const be = breakEvenNewRos(o);
  for (let n = be.ros; n < be.ros + 60; n++) {
    assert.equal(model({ ...o, newDrpRos: n }).profit >= model(o, false).profit - 1e-9, true, `n=${n}`);
  }
});

test("lowest DRP rate holds the program to at least the no-program profit", () => {
  const o = { ...simple, repricedRos: 10, newDrpRos: 20, techFixedMonthly: 0 };
  const lo = lowestDrpRate(o);
  assert.ok(lo.rate < 80);
  assert.ok(lo.gain >= 0);
  const below = model({ ...o, drpBodyRate: lo.rate - 1, drpRefinishRate: lo.rate - 1 }).profit - model(o, false).profit;
  assert.ok(below < 0);
});

test("lowest DRP rate asks for a margin of safety when told to", () => {
  const o = { ...simple, repricedRos: 10, newDrpRos: 20 };
  assert.ok(lowestDrpRate(o, 3000).rate > lowestDrpRate(o, 0).rate);
});

test("terms cost splits what one DRP job gives up", () => {
  const t = termsCost({ ...simple, partsMarkupPct: 20, drpPartsDiscountPct: 10, drpAdminPerRo: 50 });
  assert.equal(t.laborGiveUp, 200);
  assert.equal(t.partsGiveUp, 120);
  assert.equal(t.admin, 50);
  assert.equal(t.perRo, 370);
  assert.ok(t.drpPerHour < t.retailPerHour);
});

test("volume table includes today's promised volume and rises with gain once past break-even", () => {
  const rows = volumeTable({ ...DEFAULTS, newDrpRos: 33 });
  assert.ok(rows.some((r) => r.newDrpRos === 33));
  assert.ok(rows[0].gain < 0);
});

test("defaults produce finite numbers everywhere", () => {
  const v = drpValue(DEFAULTS);
  assert.ok(Number.isFinite(v.gain) && Number.isFinite(v.withDrp.profit) && Number.isFinite(v.without.profit));
});

test("garbage or negative inputs never produce NaN", () => {
  const m = model({ ...DEFAULTS, retailRos: -5, bodyHrs: NaN, flagHrsPerTech: 0, drpPartsDiscountPct: 500 });
  for (const k of ["revenue", "cost", "profit", "techs"]) assert.ok(Number.isFinite(m[k]), k);
});
