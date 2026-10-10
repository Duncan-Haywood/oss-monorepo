import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, droughtTable, money, sampleInput, toCsv } from "./calc.mjs";

const base = { acres: 100, forageLbsPerAcre: 3000, usePct: 50, auLbsPerDay: 25, seasonDays: 100, auPerHead: 1, rentPerAum: 20, cashRentAlt: 10, ownerCostPerAcre: 2, hayPerTon: 200, hayDmPct: 100, hayWastePct: 0, extraCostPerAum: 5 };

test("hand-computed carrying capacity", () => {
  const r = analyze(base);
  // usable 100*3000*.5 = 150000 lb; AU-days 150000/25 = 6000; AUMs 6000/30.4; animal units 6000/100 = 60
  assert.equal(r.animalUnits, 60);
  assert.equal(r.head, 60);
  assert.equal(r.acresPerAu, 1.67);
  assert.equal(r.aums, 197.37);
});

test("hay cost per AUM and rancher break-even", () => {
  const r = analyze(base);
  // 25 lb * 30.4 = 760 lb dry hay = .38 ton * $200 = $76
  assert.equal(r.hayCostPerAum, 76);
  assert.equal(r.rancherBreakEvenRent, 71);
  assert.equal(r.rancherCostPerAum, 25);
  assert.equal(r.rancherSavingPerAum, 51);
});

test("hay moisture and waste raise the hay cost", () => {
  const dry = analyze(base).hayCostPerAum;
  const wet = analyze({ ...base, hayDmPct: 80, hayWastePct: 20 }).hayCostPerAum;
  assert.ok(Math.abs(wet - dry / 0.8 / 0.8) < 0.02);
});

test("owner break-even rent matches the alternative", () => {
  const r = analyze(base);
  const at = analyze({ ...base, rentPerAum: r.ownerBreakEvenRent });
  assert.ok(Math.abs(at.ownerNetPerAcre - base.cashRentAlt) < 0.05, String(at.ownerNetPerAcre));
});

test("a deal exists only when owner floor is under rancher ceiling", () => {
  assert.equal(analyze(base).dealExists, true);
  assert.equal(analyze({ ...base, cashRentAlt: 200 }).dealExists, false);
});

test("drought table scales head with forage", () => {
  const t = droughtTable(base);
  assert.equal(t[0].head, 60);
  assert.equal(t[2].head, 30);
  assert.ok(t[1].rentTotal < t[0].rentTotal);
});

test("validation", () => {
  assert.match(analyze({ ...base, acres: 0 }).error, /acres/i);
  assert.match(analyze({ ...base, usePct: 120 }).error, /Utilisation/);
  assert.match(analyze({ ...base, hayWastePct: 100 }).error, /waste/i);
  assert.match(analyze({ ...base, seasonDays: 0 }).error, /Season/);
  assert.match(analyze({ ...base, hayPerTon: -1 }).error, /negative/);
});

test("high utilisation warns, csv and sample work, money formats", () => {
  assert.ok(analyze({ ...base, usePct: 70 }).advice.some((a) => /above 50%/.test(a)));
  const r = analyze(sampleInput());
  assert.ok(!r.error);
  assert.match(toCsv(r), /rancher break-even rent per AUM/);
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money(null), "—");
});
