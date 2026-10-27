// Property test for perpetual inventory with landed costs and write-downs added to the mix:
// seeded random books under FIFO and moving average (made up, no outside data). Complements
// inventory-property.test.mjs. Invariants: nothing leaks, no negatives, the journal balances.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, journal } from "./engine.mjs";
import { addInventoryMove, addLandedCost, addInventoryWritedown, setInventoryMethod, inventoryRegister } from "./inventory.mjs";
import { replay } from "./inventory.mjs";
import { trialBalance } from "./ledger.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("inventory conserves cost on 300 random books, both methods", () => {
  const r = rng(20261028), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  let applied = 0;
  for (let i = 0; i < 300; i++) {
    const method = i % 2 ? "avg" : "fifo";
    let b = setInventoryMethod(newBooks(), method);
    let day = 1, paid = 0;
    const skus = ["A", "B", "C"].slice(0, pick(1, 3)), buys = [];
    const date = () => `2026-${String(1 + Math.floor(day / 28)).padStart(2, "0")}-${String(1 + (day % 28)).padStart(2, "0")}`;
    for (const s of skus) { // every sku starts with a purchase
      const amt = pick(100, 900_000), res = addInventoryMove(b, { kind: "buy", sku: s, date: date(), qty: pick(1, 500) / 4, amount: amt / 100 });
      b = res.books; buys.push(res.move.id); paid += amt; day++;
    }
    for (let k = pick(3, 25); k > 0; k--, day += pick(0, 3)) {
      const op = pick(0, 9), sku = skus[pick(0, skus.length - 1)];
      try {
        if (op <= 2) {
          const amt = pick(1, 500_000), res = addInventoryMove(b, { kind: "buy", sku, date: date(), qty: pick(1, 800) / 8, amount: amt / 100 });
          b = res.books; buys.push(res.move.id); paid += amt;
        } else if (op <= 6) b = addInventoryMove(b, { kind: op === 6 ? "adjust" : "sell", sku, date: date(), qty: pick(1, 600) / 8 }).books;
        else if (op === 7) b = addInventoryMove(b, { kind: "return", sku, date: date(), qty: pick(1, 200) / 8 }).books;
        else if (op === 8) {
          const to = buys.slice(0, pick(1, buys.length)), amt = pick(1, 100_000);
          b = addLandedCost(b, { amount: amt / 100, date: date(), to, by: r() < 0.5 ? "value" : "qty" }).books; paid += amt;
        } else b = addInventoryWritedown(b, { sku, date: date(), nrv: pick(0, 5000) / 100 }).books;
        applied++;
      } catch (e) { assert.match(e.message, /on hand|after|before/, `unexpected refusal ${e.message}`); }
    }
    const inv = b.inventory, rep = replay(inv), reg = inventoryRegister(b), tag = `book ${i} ${method}`;
    assert.equal(rep.error, null, tag);
    const returned = inv.moves.filter((m) => m.kind === "return").reduce((t, m) => t + rep.costs.get(m.id), 0);
    assert.equal(reg.value + reg.cogs + returned, paid, "nothing leaks " + tag);
    for (const row of reg.rows) {
      assert.ok(row.onHand >= 0 && row.value >= 0 && row.cogs >= 0, `no negatives ${row.sku} ${tag}`);
      if (row.onHand === 0) assert.equal(row.value, 0, `empty shelf holds no cost ${row.sku} ${tag}`);
    }
    assert.ok(trialBalance(journal(b), b.accounts).balanced, "journal balances " + tag);
    assert.deepEqual(replay(JSON.parse(JSON.stringify(inv))).rows, rep.rows, "deterministic " + tag);
  }
  assert.ok(applied > 1500, `exercised ${applied} moves`);
});
