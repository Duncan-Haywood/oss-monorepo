import { test } from "node:test";
import assert from "node:assert/strict";
import { estimate, visitCase, dayPlan, clean, zoneOf, surchargeFor, DEFAULTS, PRESETS } from "./calc.mjs";

// Round numbers so every figure can be checked by hand: 20 miles = 30 minutes each way, no assistant, no opportunity cost, no no-shows.
const simple = {
  driveMinutes: 30, driveMiles: 20, costPerMile: 1, setupMinutes: 0, visitMinutes: 60, chartingMinutes: 0, extraPetMinutes: 30,
  dvmRate: 60, assistantRate: 0, assistantSharePct: 0, opportunityPerHour: 0, noShowPct: 0, noShowFee: 0,
  suppliesPerPet: 20, servicesPerPet: 100, visitFee: 100, multiPetDiscountPct: 0, targetMarginPct: 50,
  zone1MaxMiles: 10, zone2MaxMiles: 20, zone3MaxMiles: 30, farZoneMiles: 40, surcharge2: 0, surcharge3: 0, surcharge4: 0,
};

test("one visit matches the hand computation", () => {
  const { o } = clean(simple);
  const c = visitCase(o, 20, 1);
  // drive 2 x 30 min = 1 h, on site 1 h -> 2 h x $60 = 120; vehicle 2 x 20 x $1 = 40; supplies 20
  assert.equal(c.hours, 2);
  assert.equal(c.parts.vehicle, 40);
  assert.equal(c.parts.labor, 120);
  assert.equal(c.cost, 180);
  assert.equal(c.revenue, 200);
  assert.equal(c.profit, 20);
  // 50% margin: total price 360, minus 100 services = visit fee 260
  assert.equal(c.requiredTotal, 360);
  assert.equal(c.requiredVisitFee, 260);
});

test("drive time and mileage scale with distance", () => {
  const { o } = clean(simple);
  const near = visitCase(o, 10, 1), far = visitCase(o, 40, 1);
  assert.equal(near.driveMin, 15);
  assert.equal(far.driveMin, 60);
  assert.ok(far.cost > near.cost);
  // 40 mi: drive 2 h + 1 h on site = 3 h x 60 = 180; vehicle 80; supplies 20
  assert.equal(far.cost, 280);
});

test("multi-pet visits add time and supplies and discount extra-pet services", () => {
  const { o } = clean({ ...simple, multiPetDiscountPct: 20 });
  const two = visitCase(o, 20, 2);
  // on site 60 + 30 = 90 min; hours 1 + 1.5 = 2.5 -> labor 150; supplies 40; vehicle 40
  assert.equal(two.hours, 2.5);
  assert.equal(two.cost, 230);
  // services 100 + 100 x 0.8 = 180
  assert.equal(two.services, 180);
});

test("assistant and forgone clinic-slot value are charged per hour worked", () => {
  const { o } = clean({ ...simple, assistantRate: 30, assistantSharePct: 50, opportunityPerHour: 10 });
  const c = visitCase(o, 20, 1);
  // crew (60 + 15) x 2 h = 150; opportunity 10 x 2 = 20; vehicle 40; supplies 20
  assert.equal(c.parts.labor, 150);
  assert.equal(c.parts.opportunity, 20);
  assert.equal(c.cost, 230);
});

test("no-shows add the cost of the wasted trip, net of the no-show fee", () => {
  const { o } = clean({ ...simple, noShowPct: 20, noShowFee: 25 });
  const c = visitCase(o, 20, 1);
  // wasted trip: vehicle 40 + drive 1 h x 60 = 100; net of $25 fee = 75; 0.2/0.8 = 0.25 x 75 = 18.75
  assert.equal(c.noShowCost, 100);
  assert.equal(c.noShowDrag, 18.75);
  assert.equal(c.cost, 198.75);
});

test("zones pick the surcharge by distance and the needed surcharge is the cost gap over zone 1", () => {
  const { o } = clean({ ...simple, surcharge2: 15, surcharge3: 30, surcharge4: 60 });
  assert.equal(zoneOf(o, 10), 1);
  assert.equal(zoneOf(o, 10.5), 2);
  assert.equal(zoneOf(o, 31), 4);
  assert.equal(surchargeFor(o, 3), 30);
  const e = estimate({ ...simple, surcharge2: 15, surcharge3: 30, surcharge4: 60 });
  assert.equal(e.zones[0].surchargeNeeded, 0);
  const z = e.zones[3];
  assert.equal(z.surchargeNeeded, Math.round(((z.cost - e.zones[0].cost) / 0.5) * 100) / 100);
  // A fee that adds exactly the needed surcharge restores the zone-1 margin.
  const base = e.zones[0];
  assert.ok(Math.abs((z.requiredVisitFee - base.requiredVisitFee) - z.surchargeNeeded) < 0.02);
});

test("a day of N visits uses N + 1 chained legs and agrees with a single visit at N = 1", () => {
  const { o } = clean(simple);
  const d1 = dayPlan(o, 1), v = visitCase(o, 20, 1);
  assert.equal(d1.legs, 2);
  assert.equal(d1.cost, v.cost);
  assert.equal(d1.profit, v.profit);
  const d4 = dayPlan(o, 4);
  // 5 legs x 30 min = 2.5 h driving + 4 h on site = 6.5 h x 60 = 390; vehicle 5 x 20 = 100; supplies 80; revenue 4 x 200
  assert.equal(d4.driveHours, 2.5);
  assert.equal(d4.hours, 6.5);
  assert.equal(d4.cost, 570);
  assert.equal(d4.revenue, 800);
  assert.equal(d4.profit, 230);
  assert.equal(d4.profitPerHour, 35.38);
});

test("no-shows lower the day: fewer completed visits, same road", () => {
  const { o } = clean({ ...simple, noShowPct: 25, noShowFee: 0 });
  const d = dayPlan(o, 4);
  assert.equal(d.completed, 3);
  assert.equal(d.noShows, 1);
  assert.equal(d.revenue, 600);
  assert.ok(d.profit < dayPlan(clean(simple).o, 4).profit);
});

test("findings call out a losing visit and losing far zones", () => {
  const e = estimate({ ...simple, visitFee: 0, servicesPerPet: 50 });
  assert.ok(e.here.profit < 0);
  assert.ok(e.findings.some((f) => f.severity === "high" && /loses/.test(f.title)));
  const ok = estimate({});
  assert.ok(ok.findings.some((f) => /Zone/.test(f.title)) || ok.zones.every((z) => z.profit >= 0));
});

test("defaults produce a coherent report with eight day rows", () => {
  const e = estimate({});
  assert.equal(e.days.length, 8);
  assert.equal(e.zones.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(e.zones[i].cost > e.zones[i - 1].cost);
  assert.equal(e.day.visits, DEFAULTS.visitsPerDay);
});

test("presets only touch visit-shaped fields", () => {
  for (const p of Object.values(PRESETS)) for (const k of Object.keys(p)) assert.ok(k === "label" || k in DEFAULTS);
  assert.ok(PRESETS.euthanasia.visitMinutes > PRESETS.recheck.visitMinutes);
});

test("rejects negative and impossible input", () => {
  assert.ok(estimate({ costPerMile: -1 }).error);
  assert.ok(estimate({ targetMarginPct: 100 }).error);
  assert.ok(estimate({ noShowPct: 100 }).error);
  assert.ok(estimate({ driveMiles: 0 }).error);
  assert.ok(estimate({ pets: 0 }).error);
  assert.ok(estimate({ pets: 1.5 }).error);
  assert.ok(estimate({ zone2MaxMiles: 5 }).error);
});

test("blank fields fall back to defaults", () => {
  assert.equal(estimate({ visitFee: "" }).o.visitFee, DEFAULTS.visitFee);
});
