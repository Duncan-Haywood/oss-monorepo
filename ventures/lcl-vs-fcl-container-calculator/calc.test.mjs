import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInput, lclCost, fclCost, bestFcl, breakevenCbm, plan, sensitivity, sampleInput, toCsv } from "./calc.mjs";

const base = () => ({ ...sampleInput(), carryPctYear: "0", daysLclExtra: "0" });
const val = (o = {}) => parseInput({ ...base(), ...o }).value;

test("input validation names the missing field", () => {
  assert.match(plan({ ...base(), cbm: "" }).error, /volume/);
  assert.match(plan({ ...base(), lclRate: "0" }).error, /LCL rate/);
  assert.match(plan({ ...base(), rate20GP: "", rate40GP: "", rate40HC: "" }).error, /FCL/);
});

test("LCL is volume times rate plus fixed charges", () => {
  const l = lclCost(val());
  assert.equal(l.chargeable, 12);
  assert.equal(l.total, 12 * 85 + 180);
});

test("LCL minimum applies to a tiny shipment", () => {
  assert.equal(lclCost(val({ cbm: "0.3", weightKg: "50" })).chargeable, 1);
});

test("weight governs LCL when more than 1000 kg per CBM", () => {
  const l = lclCost(val({ cbm: "5", weightKg: "9000" }));
  assert.equal(l.basis, "weight");
  assert.equal(l.chargeable, 9);
});

test("FCL: one container when it fits, two when volume overflows", () => {
  assert.equal(fclCost(val({ cbm: "20", weightKg: "4000" }), "20GP").n, 1);
  const f = fclCost(val({ cbm: "30", weightKg: "4000" }), "20GP");
  assert.equal(f.n, 2);
  assert.equal(f.total, 2 * 2400 + 250);
});

test("FCL: weight can force a second container", () => {
  const f = fclCost(val({ cbm: "20", weightKg: "30000" }), "20GP");
  assert.equal(f.n, 2);
  assert.equal(f.limit, "weight");
});

test("best FCL picks the cheapest container type", () => {
  assert.equal(bestFcl(val({ cbm: "25" })).id, "20GP");
  assert.equal(bestFcl(val({ cbm: "50" })).id, "40GP");
});

test("breakeven is where the cheapest container stops costing more than LCL", () => {
  const v = val();
  const be = breakevenCbm(v);
  assert.equal(be, 40);
  assert.ok(bestFcl(v, be).total <= lclCost(v, be).total);
  assert.ok(bestFcl(v, be - 0.5).total > lclCost(v, be - 0.5).total);
});

test("plan: small cargo recommends LCL, big cargo recommends a container", () => {
  assert.equal(plan(base()).best.id, "LCL");
  const big = plan({ ...base(), cbm: "55", weightKg: "12000" });
  assert.notEqual(big.best.id, "LCL");
  assert.ok(big.advice[0].includes("less than LCL"));
});

test("carrying cost for LCL's extra days can flip a close call", () => {
  const v = base();
  const p = plan({ ...v, cbm: "30", weightKg: "6000", goodsValue: "400000", carryPctYear: "20", daysLclExtra: "21" });
  const lcl = p.options.find((o) => o.id === "LCL");
  assert.ok(lcl.carry > 4000);
  assert.notEqual(p.best.id, "LCL");
});

test("per-unit cost divides the all-in cost by units", () => {
  const p = plan(base());
  const lcl = p.options.find((o) => o.id === "LCL");
  assert.equal(lcl.perUnit, Math.round((lcl.all / 2400) * 100) / 100);
});

test("sensitivity marks a winner at every volume and ends in FCL", () => {
  const s = sensitivity(base());
  assert.equal(s[0].winner, "LCL");
  assert.equal(s.at(-1).winner, "FCL");
});

test("yearly saving only when a container beats LCL and shipments repeat", () => {
  const p = plan({ ...base(), cbm: "55", weightKg: "12000", perWeekShipments: "1" });
  assert.ok(p.yearly > 0);
  assert.ok(p.advice.some((a) => /a year/.test(a)));
});

test("csv has a header and one row per option", () => {
  const rows = toCsv(plan(base())).split("\n");
  assert.equal(rows.length, 5);
});
