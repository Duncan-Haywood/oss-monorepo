// Property test for statement reconciliation: seeded random statements (made up, no outside data).
// Invariants: the true closing balance agrees; a balance that leaves out one booked line is
// off by exactly that line and the hint names it; lines still in review explain the gap
// exactly; the difference is always book minus statement; reconcile never edits the books.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { reconcile } from "./reconcile.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const fixed = (c) => (c < 0 ? "-" : "") + (Math.abs(c) / 100).toFixed(2);

test("reconcile holds its invariants on 300 random statements", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 300; i++) {
    const n = pick(3, 25), rows = [];
    for (let k = 0; k < n; k++) {
      let c = pick(100, 400_000) * (r() < 0.5 ? -1 : 1);
      rows.push({ c, d: `2026-03-${String(pick(1, 28)).padStart(2, "0")}`, name: `${c < 0 ? "FEE" : "SALE"} ${k}` });
    }
    const csv = "Date,Description,Amount\n" + rows.map((x) => `${x.d},${x.name},${fixed(x.c)}`).join("\n") + "\n";
    const imported = importStatement(newBooks(), csv, "1000").books;
    const tag = JSON.stringify({ i, n });
    const acct = (t) => (t.desc.startsWith("SALE") ? "4000" : "6010");
    const filed = confirm(imported, Object.fromEntries(imported.transactions.map((t) => [t.id, acct(t)])));
    const total = rows.reduce((s, x) => s + x.c, 0);
    const before = JSON.stringify(filed);
    const q = { account: "1000", date: "2026-03-31" };

    assert.equal(reconcile(filed, { ...q, balance: total }).agrees, true, "true closing balance " + tag);

    // a statement that leaves out one booked line is off by exactly that line
    const t = filed.transactions[pick(0, filed.transactions.length - 1)];
    const rep = reconcile(filed, { ...q, balance: total - t.cents });
    assert.equal(rep.difference, t.cents, "difference is book minus statement " + tag);
    assert.equal(rep.book, total, tag);
    if (t.cents !== 0) assert.ok(rep.hints.some((h) => h.kind === "on-books-only" && h.ids.includes(t.id)), "names the line " + tag);

    // lines still in review: the books leave them out, so their sum explains the gap exactly
    const keep = pick(1, n - 1);
    const partial = confirm(imported, Object.fromEntries(imported.transactions.slice(0, keep).map((x) => [x.id, acct(x)])));
    const pend = reconcile(partial, { ...q, balance: total });
    // (the categorizer may file some of the rest itself; pending is whatever is left in review or new)
    const left = partial.transactions.filter((x) => !x.posted || x.status === "review" || x.status === "new").map((x) => x.id);
    assert.deepEqual([...pend.pending].sort(), left.sort(), "pending ids " + tag);
    assert.equal(pend.difference + pend.pendingSum, 0, "pending sum explains the gap " + tag);
    assert.equal(pend.book + pend.pendingSum, total, tag);
    if (pend.pendingSum !== 0) assert.equal(pend.hints[0].kind, "unfiled", tag);

    assert.equal(JSON.stringify(filed), before, "books untouched " + tag);
  }
});
