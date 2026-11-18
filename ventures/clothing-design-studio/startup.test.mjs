import test from "node:test";
import assert from "node:assert/strict";
import { launchBudget, budgetCsv, exampleItems } from "./startup.mjs";

const plan = { salesTaxPct: 0, channelFeePct: 0, paymentFeePct: 0, paymentFixed: 0, unsoldPct: 0, marketingBudget: 0 };
const items = [{ name: "Pattern", amount: 300 }, { name: "Sample", amount: 50, qty: 2 }, { name: "Photos", amount: 200 }];

test("hand-worked: 600 of one-offs on a 100-piece run at 10 landed, 30 price", () => {
  const b = launchBudget({ items, landed: 10, quantity: 100, price: 30, depositPct: 30 }, plan);
  assert.equal(b.oneOff, 600);
  assert.equal(b.runCost, 1000);
  assert.equal(b.cashAtOrder, 900);            // 600 + 30% of 1000
  assert.equal(b.cashBeforeFirstSale, 1600);
  assert.equal(b.oneOffPerGarment, 6);
  assert.equal(b.breakEvenUnits, 54);          // ceil(1600 / 30)
  assert.equal(b.profitIfSellable, 1400);      // 100 x 30 - 1600
  assert.equal(b.profitPerSaleBeforeOneOffs, 20);
  assert.equal(b.lines[0].name, "Pattern");    // ranked by size
  assert.equal(b.lines[0].sharePct, 50);
});

test("unsold stock and a marketing budget move break-even the way sellingSide does", () => {
  const b = launchBudget({ items, landed: 10, quantity: 100, price: 30 }, { ...plan, unsoldPct: 10, marketingBudget: 400 });
  assert.equal(b.sellableUnits, 90);
  assert.equal(b.cashBeforeFirstSale, 2000);   // 600 + 1000 + 400
  assert.equal(b.breakEvenUnits, 67);          // ceil(2000 / 30)
  assert.equal(b.oneOffPerSellable, 6.67);
});

test("flags a run that cannot pay back its one-offs and a heavy set-up", () => {
  const b = launchBudget({ items: [{ name: "Pattern", amount: 900 }], landed: 10, quantity: 20, price: 14 }, plan);
  assert.ok(b.notes.some(n => /does not pay back/.test(n)));
  assert.ok(b.notes.some(n => /450% of the run/.test(n)));
});

test("a price under cost has no break-even; bad input throws", () => {
  assert.equal(launchBudget({ items: [], landed: 10, quantity: 10, price: 0 }, plan).breakEvenUnits, null);
  assert.throws(() => launchBudget({ items: [{ name: "x", amount: -1 }], landed: 1, quantity: 1, price: 1 }), /0 to 1,000,000,000/);
  assert.throws(() => launchBudget({ items: [], landed: 1, quantity: 1.5, price: 1 }), /whole number/);
  assert.throws(() => launchBudget({ items: [], landed: 1, quantity: 1, price: 1, depositPct: 120 }), /Deposit/);
  assert.throws(() => launchBudget({ items: "x", landed: 1, quantity: 1, price: 1 }), /list/);
});

test("CSV neutralises formula cells; example lines total", () => {
  const b = launchBudget({ items: [{ name: "=HYPERLINK(1)", amount: 5 }], landed: 1, quantity: 1, price: 5 }, plan);
  assert.match(budgetCsv(b), /"'=HYPERLINK\(1\)",5,1,5,100/);
  assert.equal(launchBudget({ items: exampleItems(), landed: 1, quantity: 1, price: 5 }, plan).oneOff, 1810);
});
