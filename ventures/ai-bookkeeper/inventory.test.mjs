import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBooks, importStatement, confirm, journal, reports, closeChecks } from "./engine.mjs";
import { addInventoryMove, setInventoryMethod, inventoryRegister } from "./inventory.mjs";
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
