import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { reconcile } from "./reconcile.mjs";

const pick = { SALE: "4000", HOST: "6130", FEE: "6010", CAFE: "6060" };
const load = (rows, { file = true } = {}) => {
  const b = importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;
  return file ? confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, pick[t.desc.split(" ")[0]]]))) : b;
};
const rows = [["2026-03-02", "SALE ONE", "1000.00"], ["2026-03-09", "HOST A", "-250.00"], ["2026-03-15", "FEE X", "-40.00"], ["2026-03-20", "CAFE Y", "-18.50"]];
// opening balance is zero: closing is 691.50

test("agrees when the typed balance matches", () => {
  const r = reconcile(load(rows), { account: "1000", date: "2026-03-31", balance: 69150 });
  assert.equal(r.agrees, true);
  assert.deepEqual(r.hints, []);
});

test("lines still in review explain the whole difference", () => {
  const r = reconcile(load(rows, { file: false }), { account: "1000", date: "2026-03-31", balance: 69150 });
  assert.equal(r.difference, -69150);
  assert.equal(r.hints[0].kind, "unfiled");
});

test("a sign slip is half the difference", () => {
  const b = load([...rows.slice(0, 3), ["2026-03-20", "CAFE Y", "18.50"]]); // booked as +18.50
  const r = reconcile(b, { account: "1000", date: "2026-03-31", balance: 69150 });
  assert.equal(r.difference, 3700);
  assert.ok(r.hints.some((h) => h.kind === "flipped-sign"));
});

test("a line the statement does not show is named", () => {
  const b = load([...rows, ["2026-03-28", "FEE Z", "-75.25"]]);
  const r = reconcile(b, { account: "1000", date: "2026-03-31", balance: 69150 });
  assert.equal(r.difference, -7525);
  assert.ok(r.hints.some((h) => h.kind === "on-books-only" && h.message.includes("FEE Z")));
});

test("two lines that add up to the gap are found; a swapped-digit gap is flagged", () => {
  const b = load([...rows, ["2026-03-26", "FEE P", "-10.00"], ["2026-03-27", "FEE Q", "-5.00"]]);
  const r = reconcile(b, { account: "1000", date: "2026-03-31", balance: 69150 });
  assert.ok(r.hints.some((h) => h.kind === "pair" && h.ids.length === 2));
  const t = reconcile(load(rows), { account: "1000", date: "2026-03-31", balance: 69150 - 540 + 450 }); // a 90-cent gap, divisible by 9
  assert.equal(t.difference, 90);
  assert.ok(t.hints.some((h) => h.kind === "transposition"));
});

test("lines just after the date are mentioned; bad input throws", () => {
  const b = load([...rows, ["2026-04-02", "FEE Z", "-30.00"]]);
  const r = reconcile(b, { account: "1000", date: "2026-03-31", balance: 69150 - 3000 });
  assert.equal(r.agrees, false);
  assert.ok(r.hints.some((h) => h.kind === "just-after"));
  assert.throws(() => reconcile(b, { account: "6130", date: "2026-03-31", balance: 0 }));
  assert.throws(() => reconcile(b, { account: "1000", date: "March", balance: 0 }));
});
