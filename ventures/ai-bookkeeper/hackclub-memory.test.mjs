// The online learning reading in eval/hackclub-memory.mjs, on a tiny ledger
// written here (the real one is fetched at run time, never copied).
import test from "node:test";
import assert from "node:assert/strict";
import { parseDated, run } from "./eval/hackclub-memory.mjs";

const ledger = `
2016/02/01 Zorblax Hosting
    Expenses:Operating:Hosting          $10.00
    Assets:Checking

2016/01/01 Zorblax Hosting
    Expenses:Operating:Hosting          $10.00
    Assets:Checking

2016/03/01 Zorblax Hosting
    Expenses:Operating:Hosting          $10.00
    Assets:Checking
`;

test("lines are sorted by date and an unseen payee is blank until it has been filed once", () => {
  const rows = parseDated(ledger);
  assert.deepEqual(rows.map((r) => r.date), ["2016/01/01", "2016/02/01", "2016/03/01"]);
  const keywords = run(rows, { learn: false });
  assert.equal(keywords.total.blank, 3);
  const online = run(rows);
  assert.equal(online.total.blank, 1, "only the first line has no history");
  assert.equal(online.total.right, 2);
  assert.equal(online.total.bySource.memory, 2);
});

test("seeded: the first share is history, only the rest is scored", () => {
  const o = run(parseDated(ledger), { seedShare: 1 / 3 });
  assert.equal(o.total.n, 2);
  assert.equal(o.total.right, 2);
});
