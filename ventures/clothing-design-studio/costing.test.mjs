import test from "node:test";
import assert from "node:assert/strict";
import { economics, unitCost, quantityBreaks, decorationLines } from "./costing.mjs";
import { EXAMPLE_SUPPLIER, supplierToCsv, supplierFromCsv, missingPrices } from "./suppliers.mjs";
import { newDesign, applyOp } from "./design.mjs";

const sheet = { ...EXAMPLE_SUPPLIER, example: false, currency: "EUR", moq: 50, wastagePct: 10, fabrics: { "heavyweight-cotton": 10 }, metresPerGarment: { tee: 1 }, cutAndSew: { tee: 5 },
  methods: { screen: { setup: 20, perUnit: 1 }, dtg: { setup: 99, perUnit: 6 } }, trimsPerUnit: 1, packagingPerUnit: 0.5, freightPerUnit: 2, dutyPct: 10 };

const design = () => {
  let d = newDesign({ quantity: 100, price: 50 });
  d = applyOp(d, { op: "add", kind: "motif", motif: "halo", method: "screen", colours: 2 });
  return d;
};

test("unit cost by hand", () => {
  // fabric 10 x 1 x 1.10 = 11; cut 5; screen 2 colours: setup 40/100 = 0.4 + 2 x 1 = 2.4
  // goods = 11 + 5 + 2.4 + 1 + 0.5 = 19.9; duty 1.99; freight 2 -> 23.89
  assert.equal(unitCost(design(), sheet).landed, 23.89);
});

test("no-setup methods ignore a setup figure in the sheet", () => {
  const d = applyOp(design(), { op: "method", value: "dtg" });
  assert.equal(decorationLines(d, sheet)[0].perUnit, 6);
});

test("economics by hand", () => {
  const e = economics(design(), sheet, { salesTaxPct: 25, channelFeePct: 10, paymentFeePct: 2, paymentFixed: 0.5, unsoldPct: 10, marketingBudget: 600, targetMarginPct: 50 });
  // net 50/1.25 = 40; fees 50 x 12% + 0.5 = 6.5; per sale 33.5; profit 9.61
  assert.equal(e.netOfTax, 40);
  assert.equal(e.feesPerSale, 6.5);
  assert.equal(e.profitPerSale, 9.61);
  assert.equal(e.marginPct, 24);
  // cash = 2389 + 600 = 2989; break-even ceil(2989 / 33.5) = 90
  assert.equal(e.cashUpFront, 2989);
  assert.equal(e.breakEvenUnits, 90);
  assert.equal(e.sellableUnits, 90);
  // target 50%: P = (23.89 + 0.5) / (0.5/1.25 - 0.12) = 24.39 / 0.28 = 87.11
  assert.equal(e.priceForTargetMargin, 87.11);
});

test("warnings: below MOQ, break-even beyond what sells, impossible target", () => {
  const d = applyOp(design(), { op: "quantity", value: 20 });
  const e = economics(d, sheet, { targetMarginPct: 95, salesTaxPct: 20, channelFeePct: 15, marketingBudget: 5000 });
  assert.ok(e.notes.some(n => /minimum order/.test(n)));
  assert.ok(e.notes.some(n => /Break-even needs/.test(n)));
  assert.equal(e.priceForTargetMargin, null);
});

test("larger runs never cost more per piece", () => {
  const rows = quantityBreaks(design(), sheet);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].landed <= rows[i - 1].landed);
  assert.equal(rows[0].belowMoq, true);
});

test("a sheet missing a price names it instead of guessing", () => {
  const d = applyOp(design(), { op: "fabric", value: "linen" });
  assert.deepEqual(missingPrices(sheet, d), ["fabric price per metre for linen"]);
  assert.throws(() => unitCost(d, sheet), /linen/);
});

test("supplier CSV round-trips and rejects bad rows with the row number", () => {
  const back = supplierFromCsv(supplierToCsv(EXAMPLE_SUPPLIER));
  assert.deepEqual({ ...back, id: "example", example: true }, { ...EXAMPLE_SUPPLIER });
  assert.throws(() => supplierFromCsv("kind,key,value\nfabric,linen,abc"), /row 2/);
  assert.throws(() => supplierFromCsv("kind,key,value\nbanana,x,1"), /row 2/);
  const named = supplierFromCsv('kind,key,value\nsupplier,name,"Atelier, Rossi"\nmethod,dtg,0|5.5');
  assert.equal(named.name, "Atelier, Rossi");
  assert.deepEqual(named.methods.dtg, { setup: 0, perUnit: 5.5 });
});

test("the example sheet is marked as an example", () => {
  assert.equal(EXAMPLE_SUPPLIER.example, true);
  assert.match(EXAMPLE_SUPPLIER.name, /placeholder/);
});
