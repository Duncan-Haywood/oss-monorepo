import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const csv = (dates) => "Date,Description,Amount\n" + dates.map((d, i) => `${d},ITEM ${i},-${i + 1}.00`).join("\n") + "\n";

test("all-ambiguous dates that only pack into a short span day first are read day first", () => {
  const r = readStatement(csv(["05/03/2026", "06/03/2026", "08/03/2026", "09/03/2026"]));
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-05", "2026-03-06", "2026-03-08", "2026-03-09"]);
  assert.match(r.inferred ?? "", /day first/);
});

test("the same shape month first stays month first", () => {
  const r = readStatement(csv(["03/05/2026", "03/06/2026", "03/08/2026", "03/09/2026"]));
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-05", "2026-03-06", "2026-03-08", "2026-03-09"]);
});

test("a given dayFirst wins", () => {
  const r = readStatement(csv(["05/03/2026", "06/03/2026", "08/03/2026", "09/03/2026"]), { dayFirst: false });
  assert.equal(r.rows[0].date, "2026-05-03");
});

test("two rows are too few to override the month-first default", () => {
  assert.equal(readStatement(csv(["05/01/2026", "09/01/2026"])).rows[0].date, "2026-05-01");
});
