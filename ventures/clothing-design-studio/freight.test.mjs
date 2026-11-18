import test from "node:test";
import assert from "node:assert/strict";
import { packCarton, cartons, quoteModes, airVsSea } from "./freight.mjs";

test("pack: 30x25x3 tees in a 60x40x30 carton: best orientation 2*1*... hand count", () => {
  // piece sides 30,25,3 into 60,40,30: (30,25,3)->2*1*10=20; (30,3,25)->2*13*1=26; (3,30,25)->20*1*1=20;
  // (25,30,3)->2*1*10=20; (25,3,30)->2*13*1=26; (3,25,30)->20*1*1=20. Best 26.
  assert.equal(packCarton([30, 25, 3], [60, 40, 30]).perCarton, 26);
});
test("pack: piece larger than carton gives 0", () => {
  assert.equal(packCarton([70, 10, 10], [60, 40, 30]).perCarton, 0);
});
test("cartons: 1000 pcs at 40 per carton = 25; weight 1000*0.25 + 25*1.2 = 280 kg; cbm 25*0.072", () => {
  const c = cartons({ qty: 1000, perCarton: 40, pieceKg: 0.25, carton: [60, 40, 30], cartonTareKg: 1.2 });
  assert.equal(c.cartons, 25); assert.ok(Math.abs(c.grossKg - 280) < 1e-9); assert.ok(Math.abs(c.cbm - 1.8) < 1e-9);
});
test("cartons: part-full last carton still counts", () => {
  const c = cartons({ qty: 1010, perCarton: 40, pieceKg: 0.25, carton: [60, 40, 30] });
  assert.equal(c.cartons, 26); assert.equal(c.lastCarton, 10);
});
test("air bills volume weight when bulkier than it weighs: 1.8 cbm at 6000 = 300 kg > 280 kg", () => {
  const m = quoteModes({ qty: 1000, grossKg: 280, cbm: 1.8, rates: { air: { perKg: 5, days: 6 } } })[0];
  assert.equal(m.cost, 1500); assert.equal(m.perPiece, 1.5); assert.match(m.basis, /volume/);
});
test("air bills actual weight when heavier: 0.5 cbm = 83.3 kg < 120 kg", () => {
  const m = quoteModes({ qty: 100, grossKg: 120, cbm: 0.5, rates: { air: { perKg: 4, perShipment: 50 } } })[0];
  assert.equal(m.cost, 530);
});
test("LCL minimum 1 cbm applies to a small load", () => {
  const m = quoteModes({ qty: 100, grossKg: 40, cbm: 0.4, rates: { sea: { perCbm: 100, days: 35 } } })[0];
  assert.equal(m.cost, 100);
});
test("LCL W/M: 1.0 cbm but 2.5 tonnes charges 2.5 tonnes", () => {
  const m = quoteModes({ qty: 100, grossKg: 2500, cbm: 1, rates: { sea: { perCbm: 100, perTonne: 120 } } })[0];
  assert.equal(m.cost, 300);
});
test("FCL: 70 cbm in 40ft at 85% usable (56.95) needs 2 containers", () => {
  const m = quoteModes({ qty: 10000, grossKg: 9000, cbm: 70, rates: { fcl: { container: "40", perContainer: 3000, days: 30 } } })[0];
  assert.equal(m.cost, 6000); assert.match(m.mode, /2 x 40/);
});
test("modes sorted cheapest per piece first", () => {
  const r = quoteModes({ qty: 1000, grossKg: 280, cbm: 1.8, rates: { air: { perKg: 5, days: 6 }, sea: { perCbm: 120, days: 35 }, express: { perKg: 9, days: 3 } } });
  assert.deepEqual(r.map(x => x.mode), ["sea LCL", "air", "express courier"]);
});
test("airVsSea: premium 1284 over 29 days = 4.14 weeks; worth it above 310.1/week of profit", () => {
  const sea = { cost: 216, days: 35 }, air = { cost: 1500, days: 6 };
  const a = airVsSea(sea, air, 500);
  assert.equal(a.premium, 1284); assert.equal(a.daysSaved, 29); assert.equal(a.breakEvenProfitPerWeek, 309.93);
  assert.equal(a.worthIt, true);
  assert.equal(airVsSea(sea, air, 200).worthIt, false);
});
test("rejects bad numbers", () => {
  assert.throws(() => packCarton([0, 1, 1], [1, 1, 1]));
  assert.throws(() => quoteModes({ qty: 0, grossKg: 1, cbm: 1, rates: {} }));
  assert.throws(() => airVsSea({ cost: 1 }, { cost: 2, days: 3 }));
});
