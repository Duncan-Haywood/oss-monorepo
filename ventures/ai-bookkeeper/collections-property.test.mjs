// Property test for payment reminders: seeded random invoice books (made up, no outside data). Invariants: one
// reminder per customer (case-insensitive), only past-due customers, `overdue` is the sum of the listed invoices'
// open balances and agrees with aging(), the tone matches the oldest invoice, `min` drops small debts only,
// the order is oldest debt first, the text names every listed invoice, and a second run gives the same answer.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addDocuments, aging } from "./accruals.mjs";
import { reminders, toneFor } from "./collections.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const money = (c) => (c / 100).toFixed(2);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

let total = 0;
test("payment reminders hold their invariants on 150 random books", () => {
  const r = rng(20261031), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let t = 0; t < 150; t++) {
    const rows = [], base = Date.UTC(2026, 0, 1), parties = pick(1, 5);
    for (let n = 1, count = pick(1, 12); n <= count; n++) {
      const issued = base + pick(0, 120) * 864e5, due = issued + pick(0, 45) * 864e5;
      rows.push(`invoice,${n},${iso(issued)},${iso(due)},Customer ${pick(1, parties)},${money(pick(10_00, 5000_00))},4000`);
    }
    const tag = `book ${t}`;
    const b = addDocuments(newBooks(), "type,number,date,due,party,amount,account\n" + rows.join("\n") + "\n").books;
    const asOf = iso(base + pick(30, 240) * 864e5);
    const out = reminders(b, { asOf }); total += out.length;
    assert.deepEqual(reminders(b, { asOf }), out, tag);
    const open = aging(b, asOf).open.filter((x) => x.kind === "invoice" && !x.credit && x.daysLate >= 1);
    assert.equal(new Set(out.map((x) => x.party.toLowerCase())).size, out.length, tag);
    assert.equal(out.length, new Set(open.map((x) => x.party.toLowerCase())).size, tag);
    for (const x of out) {
      const mine = open.filter((o) => o.party.toLowerCase() === x.party.toLowerCase());
      assert.equal(x.overdue, mine.reduce((s, o) => s + o.total, 0), tag);
      assert.deepEqual([...x.invoices].sort(), mine.map((o) => o.id).sort(), tag);
      assert.equal(x.daysLate, Math.max(...mine.map((o) => o.daysLate)), tag);
      assert.equal(x.tone, toneFor(x.daysLate), tag);
      for (const o of mine) assert.ok(x.text.includes(`due ${o.due}`), tag);
    }
    for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].daysLate >= out[i].daysLate, tag);
    const min = pick(1, 3000_00);
    const filtered = reminders(b, { asOf, min });
    assert.deepEqual(filtered, out.filter((x) => x.overdue >= min), tag);
  }
  assert.ok(total > 100, `only ${total} reminders drawn`);
});
