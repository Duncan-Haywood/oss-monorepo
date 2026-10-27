import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBooks, importStatement, confirm, journal, reports, closeChecks } from "./engine.mjs";
import { addInventoryMove, addLandedCost, addInventoryWritedown, setInventoryMethod, inventoryRegister } from "./inventory.mjs";
import { trialBalance } from "./ledger.mjs";

const mv = (b, kind, sku, date, qty, amount) => addInventoryMove(b, { kind, sku, date, qty, amount }).books;

test("FIFO takes the oldest cost first and part layers pro-rate", () => {
  let b = mv(newBooks(), "buy", "MUG", "2026-01-05", 10, "100.00"); // 10.00 each
  b = mv(b, "buy", "MUG", "2026-02-05", 10, "150.00"); // 15.00 each
  b = mv(b, "sell", "MUG", "2026-02-10", 12);
  const r = inventoryRegister(b);
  assert.equal(r.rows[0].onHand, 8);
  assert.equal(r.cogs, 10000 + 3000); // 10 at 10.00 + 2 at 15.00
  assert.equal(r.value, 25000 - 13000);
});

test("moving average uses the blended cost", () => {
  let b = setInventoryMethod(newBooks(), "avg");
  b = mv(b, "buy", "MUG", "2026-01-05", 10, "100.00");
  b = mv(b, "buy", "MUG", "2026-02-05", 10, "150.00");
  b = mv(b, "sell", "MUG", "2026-02-10", 12);
  assert.equal(inventoryRegister(b).cogs, 15000); // 12 x 12.50
});

test("cents never leak: cost of goods sold plus stock equals purchases", () => {
  let b = mv(newBooks(), "buy", "CABLE", "2026-01-01", 3, "10.00");
  for (let i = 0; i < 3; i++) b = mv(b, "sell", "CABLE", `2026-01-0${i + 2}`, 1);
  const r = inventoryRegister(b);
  assert.equal(r.cogs, 1000); assert.equal(r.value, 0);
  let c = mv(newBooks(), "buy", "CABLE", "2026-01-01", 2.5, "10.01");
  c = mv(c, "sell", "CABLE", "2026-01-02", 1.1);
  const q = inventoryRegister(c);
  assert.equal(q.cogs + q.value, 1001);
  assert.equal(q.rows[0].onHand, 1.4);
});

test("selling more than is on hand, bad inputs and a locked period are refused", () => {
  const b = mv(newBooks(), "buy", "MUG", "2026-01-05", 2, "20");
  assert.throws(() => addInventoryMove(b, { kind: "sell", sku: "MUG", date: "2026-01-06", qty: 3 }), /only 2 on hand/);
  assert.throws(() => addInventoryMove(b, { kind: "sell", sku: "MUG", date: "2026-01-01", qty: 1 }), /only 0 on hand/);
  assert.throws(() => addInventoryMove(b, { kind: "buy", sku: "MUG", date: "2026-01-06", qty: 1 }), /total amount/);
  assert.throws(() => addInventoryMove(b, { kind: "sell", sku: "MUG", date: "2026-01-06", qty: 1, amount: "5" }), /Only a purchase/);
  assert.throws(() => addInventoryMove(b, { kind: "buy", sku: "", date: "2026-01-06", qty: 1, amount: "5" }), /SKU/);
  assert.throws(() => addInventoryMove({ ...b, lockedThrough: "2026-01-31" }, { kind: "buy", sku: "X", date: "2026-01-06", qty: 1, amount: "5" }), /locked/);
});

test("COGS posts to the ledger, the books balance and the register ties to account 1450", () => {
  const csv = "Date,Description,Amount\n2026-01-05,WHOLESALE MUGS CO,-250.00\n2026-02-10,SHOPIFY PAYOUT,400.00\n";
  let b = importStatement(newBooks(), csv, "1000").books;
  const ids = b.transactions.map((t) => t.id);
  b = confirm(b, { [ids[0]]: "1450", [ids[1]]: "4000" });
  b = mv(b, "buy", "MUG", "2026-01-05", 25, "250");
  b = mv(b, "sell", "MUG", "2026-02-10", 10);
  const tb = trialBalance(journal(b), b.accounts);
  assert.ok(tb.balanced);
  const get = (c) => tb.rows.find((r) => r.code === c);
  assert.equal(get("5000").debit, 10000);
  assert.equal(get("1450").debit - (get("1450").credit ?? 0), 15000);
  assert.ok(!closeChecks(b).some((c) => c.check === "inventory"));
  const pl = reports(b).profitAndLoss;
  assert.ok(JSON.stringify(pl).includes("Cost of goods sold"));
});

test("close check names a purchase that was never recorded in the register", () => {
  const csv = "Date,Description,Amount\n2026-01-05,WHOLESALE MUGS CO,-250.00\n";
  let b = importStatement(newBooks(), csv, "1000").books;
  b = confirm(b, { [b.transactions[0].id]: "1450" });
  b = mv(b, "buy", "MUG", "2026-01-05", 10, "100"); // register says 100, bank says 250
  const c = closeChecks(b).find((x) => x.check === "inventory");
  assert.ok(c && /no register row/.test(c.message));
});

test("CLI: buy, sell, list, method", () => {
  const dir = mkdtempSync(join(tmpdir(), "inv-")), f = join(dir, "books.json");
  writeFileSync(f, JSON.stringify(newBooks()));
  const run = (...a) => execFileSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "--books", f, ...a], { encoding: "utf8" });
  run("inventory", "buy", "MUG", "--qty", "10", "--amount", "100", "--date", "2026-01-05");
  run("inventory", "sell", "MUG", "--qty", "4", "--date", "2026-01-09");
  const out = run("inventory");
  assert.match(out, /MUG\s+on hand\s+6/);
  assert.match(out, /cost of goods sold \$?40\.00/);
  assert.match(run("inventory", "method", "avg"), /avg/);
});

test("a purchase return leaves the newest layer, books no cost, and the refund ties 1450 to the register", () => {
  const csv = "Date,Description,Amount\n2026-01-05,WHOLESALE MUGS CO,-100.00\n2026-01-20,WHOLESALE MUGS CO,-200.00\n2026-02-03,WHOLESALE MUGS CO REFUND,60.00\n";
  let b = importStatement(newBooks(), csv, "1000").books;
  b = confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, "1450"])));
  b = mv(b, "buy", "MUG", "2026-01-05", 10, "100"); // 10.00 each
  b = mv(b, "buy", "MUG", "2026-01-20", 10, "200"); // 20.00 each
  b = mv(b, "return", "MUG", "2026-02-03", 3);       // from the 20.00 layer: 60.00
  let r = inventoryRegister(b);
  assert.equal(r.rows[0].onHand, 17);
  assert.equal(r.rows[0].returned, 3);
  assert.equal(r.value, 24000);
  assert.equal(r.cogs, 0);
  assert.ok(!closeChecks(b).some((c) => c.check === "inventory"));
  b = mv(b, "sell", "MUG", "2026-02-10", 10); // oldest layer first: the whole 10.00 layer
  r = inventoryRegister(b);
  assert.equal(r.cogs, 10000);
  assert.equal(r.value, 14000);
  assert.throws(() => mv(b, "return", "MUG", "2026-02-11", 8), /returned to the supplier/);
});

test("landed cost joins the stock still on hand; the share for units already sold is expensed", () => {
  let b = mv(newBooks(), "buy", "MUG", "2026-01-05", 10, "100"); // INV-1, 10.00 each
  b = mv(b, "buy", "CUP", "2026-01-05", 10, "300");              // INV-2, 30.00 each
  b = mv(b, "sell", "MUG", "2026-01-10", 4);
  b = addLandedCost(b, { amount: "40", date: "2026-01-12", to: "INV-1,INV-2" }).books; // by value: 10 and 30
  const r = inventoryRegister(b), mug = r.rows.find((x) => x.sku === "MUG"), cup = r.rows.find((x) => x.sku === "CUP");
  assert.equal(cup.value, 33000);                 // all 10 cups on hand take their 30.00
  assert.equal(mug.value, 6000 + 600);            // 6 of 10 on hand take 6.00 of the 10.00
  assert.equal(mug.cogs, 4000 + 400);             // 4 sold: their 4.00 is cost now
  assert.equal(r.value + r.cogs, 10000 + 30000 + 4000); // nothing leaks: bought plus freight
  assert.ok(trialBalance(journal(b), b.accounts).balanced);
});

test("landed cost by quantity, remainder cents, and refusals", () => {
  let b = mv(newBooks(), "buy", "A", "2026-01-05", 1, "10");
  b = mv(b, "buy", "B", "2026-01-05", 2, "10");
  const r = addLandedCost(b, { amount: "1.00", date: "2026-01-06", to: ["INV-1", "INV-2"], by: "qty" });
  assert.deepEqual(r.move.alloc.map((a) => a.cents), [33, 67]);
  assert.equal(inventoryRegister(r.books).value, 2100);
  assert.throws(() => addLandedCost(b, { amount: "1", date: "2026-01-06", to: "INV-9" }), /not a recorded purchase/);
  assert.throws(() => addLandedCost(b, { amount: "1", date: "2026-01-01", to: "INV-1" }), /after/);
  assert.throws(() => addLandedCost(b, { amount: "0", date: "2026-01-06", to: "INV-1" }), /above zero/);
});

test("CLI: landed cost ties account 1450 to the register after the freight bill is filed", () => {
  const dir = mkdtempSync(join(tmpdir(), "inv-")), f = join(dir, "books.json");
  writeFileSync(f, JSON.stringify(newBooks()));
  const run = (...a) => execFileSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "--books", f, ...a], { encoding: "utf8" });
  run("inventory", "buy", "MUG", "--qty", "10", "--amount", "100", "--date", "2026-01-05");
  assert.match(run("inventory", "landed", "--amount", "25", "--date", "2026-01-08", "--on", "INV-1"), /INV-2 landed cost \$?25\.00/);
  assert.match(run("inventory"), /value\s+\$?125\.00/);
});

test("write-down to net realizable value: FIFO layers, average, never back up, books balance", () => {
  let b = mv(newBooks(), "buy", "MUG", "2026-01-05", 10, "100"); // 10.00 each
  b = mv(b, "buy", "MUG", "2026-02-05", 10, "150");              // 15.00 each
  const w = addInventoryWritedown(b, { sku: "MUG", date: "2026-03-01", nrv: "12.00" });
  assert.equal(w.loss, 3000);                                    // only the 15.00 layer is above 12.00
  const r = inventoryRegister(w.books);
  assert.equal(r.value, 10000 + 12000);
  assert.equal(r.value + r.cogs, 25000);                         // nothing leaks
  const again = addInventoryWritedown(w.books, { sku: "MUG", date: "2026-03-02", nrv: "20" });
  assert.equal(again.loss, 0);                                   // a higher value never writes it back up
  assert.equal(inventoryRegister(again.books).value, 22000);
  const sold = mv(w.books, "sell", "MUG", "2026-03-05", 12);     // 10 at 10.00 + 2 at the new 12.00
  assert.equal(inventoryRegister(sold).cogs, 3000 + 10000 + 2400);
  const tb = trialBalance(journal(w.books), w.books.accounts);
  assert.ok(tb.balanced);
  assert.equal(tb.rows.find((x) => x.code === "5000").debit, 3000);
  let a = setInventoryMethod(newBooks(), "avg");
  a = mv(a, "buy", "MUG", "2026-01-05", 10, "100"); a = mv(a, "buy", "MUG", "2026-02-05", 10, "150"); // 12.50 average
  assert.equal(addInventoryWritedown(a, { sku: "MUG", date: "2026-03-01", nrv: "10" }).loss, 5000);
});

test("write-down refusals and a sale before it keeps its own cost", () => {
  const b = mv(newBooks(), "buy", "MUG", "2026-01-05", 4, "40");
  assert.throws(() => addInventoryWritedown(b, { sku: "NOPE", date: "2026-02-01", nrv: "1" }), /No stock/);
  assert.throws(() => addInventoryWritedown(b, { sku: "MUG", date: "2026-02-01", nrv: "-1" }), /zero or more/);
  assert.throws(() => addInventoryWritedown({ ...b, lockedThrough: "2026-03-31" }, { sku: "MUG", date: "2026-02-01", nrv: "1" }), /locked/);
  const w = addInventoryWritedown(mv(b, "sell", "MUG", "2026-01-10", 1), { sku: "MUG", date: "2026-02-01", nrv: "0" });
  assert.equal(w.loss, 3000);                                    // 3 left at 10.00, worth nothing
  assert.equal(inventoryRegister(w.books).value, 0);
});
