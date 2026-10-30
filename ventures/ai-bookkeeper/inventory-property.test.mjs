// Property test for perpetual inventory: seeded random buys, sales, write-offs and returns
// (made up, no outside data). Invariants for both methods: cost is conserved (bought cents =
// cost of goods sold + returns' cost + value left), nothing goes negative, quantities balance,
// a move that would oversell is refused, and the journal entries match the replay's costs.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addInventoryMove, setInventoryMethod, inventoryRegister, inventoryEntries, replay } from "./inventory.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("inventory conserves cost under random moves, FIFO and average", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 300; i++) {
    const method = i % 2 ? "avg" : "fifo";
    let books = setInventoryMethod(newBooks(), method);
    let boughtCents = 0;
    const skus = ["A", "B", "C"].slice(0, pick(1, 3));
    for (let n = 0, d = 1; n < pick(5, 40); n++) {
      d = Math.min(28, d + pick(0, 2));
      const date = `2026-03-${String(d).padStart(2, "0")}`, sku = skus[pick(0, skus.length - 1)];
      const kind = ["buy", "buy", "sell", "sell", "adjust", "return"][pick(0, 5)];
      const qty = pick(1, 5000) / 1000;
      const args = { kind, sku, date, qty };
      if (kind === "buy") args.amount = pick(1, 500_000) / 100;
      try {
        books = addInventoryMove(books, args).books;
        if (kind === "buy") boughtCents += Math.round(args.amount * 100);
      } catch (e) {
        // the only refusal a valid move can meet is overselling, and the books stay as they were
        assert.match(e.message, /on hand/, JSON.stringify(args) + " " + e.message);
      }
    }
    const tag = `${method} #${i}`, inv = books.inventory ?? { moves: [] };
    const rep = replay(inv), reg = inventoryRegister(books);
    assert.equal(rep.error, null, tag);
    let returnedCost = 0;
    for (const m of inv.moves) if (m.kind === "return") returnedCost += rep.costs.get(m.id);
    assert.equal(boughtCents, reg.cogs + returnedCost + reg.value, "cost conserved " + tag);
    for (const row of reg.rows) {
      assert.ok(row.onHand >= 0 && row.value >= 0, "no negative stock " + tag + row.sku);
      assert.ok(Math.abs(row.bought - row.sold - row.returned - row.onHand) < 1e-9, "quantities balance " + tag);
      if (row.onHand === 0) assert.equal(row.value, 0, "empty shelf holds no value " + tag);
    }
    const booked = inventoryEntries(books).reduce((t, e) => t + e.lines[0].debit, 0);
    assert.equal(booked, reg.cogs, "journal COGS equals register COGS " + tag);
  }
});
