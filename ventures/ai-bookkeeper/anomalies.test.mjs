import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { findAnomalies } from "./anomalies.mjs";

const books = (lines) => importStatement(newBooks(), "Date,Description,Amount\n" + lines.join("\n") + "\n", "1000").books;
const base = ["01", "02", "03", "04", "05", "06"].map((m) => `2026-${m}-05,CLOUD HOST,-50.00`);
const filler = Array.from({ length: 12 }, (_, i) => `2026-0${1 + (i % 6)}-${10 + i},SHOP ${i},-${20 + i}.00`);

test("a double charge within a week is flagged, a monthly repeat is not", () => {
  const r = findAnomalies(books([...base, "2026-06-06,CLOUD HOST,-50.00", ...filler]));
  const d = r.filter((x) => x.kind === "duplicate");
  assert.equal(d.length, 1);
  assert.equal(d[0].date, "2026-06-06");
});

test("an amount far above a payee's usual is a spike; a small rise is not", () => {
  const r = findAnomalies(books([...base, "2026-07-05,CLOUD HOST,-500.00", "2026-08-05,CLOUD HOST,-55.00", ...filler]));
  const s = r.filter((x) => x.kind === "spike");
  assert.deepEqual(s.map((x) => x.cents), [-50000]);
});

test("a large first line from a new payee is flagged; small new payees are not", () => {
  const r = findAnomalies(books([...base, ...filler, "2026-06-20,UNKNOWN CONSULTING,-4000.00", "2026-06-21,NEW CAFE,-15.00"]));
  const n = r.filter((x) => x.kind === "new-large");
  assert.equal(n.length, 1);
  assert.match(n[0].desc, /UNKNOWN/);
});

test("clean books give nothing, and refunds are not duplicates of charges", () => {
  assert.deepEqual(findAnomalies(books([...base, ...filler])), []);
  const r = findAnomalies(books([...base, "2026-06-06,CLOUD HOST,50.00", ...filler]));
  assert.equal(r.filter((x) => x.kind === "duplicate").length, 0);
});

test("the first two lines of a payee can be a double charge", () => {
  const r = findAnomalies(books(["2026-03-01,GYM CLUB,-30.00", "2026-03-02,GYM CLUB,-30.00", ...filler]));
  const d = r.filter((x) => x.kind === "duplicate");
  assert.equal(d.length, 1);
  assert.equal(d[0].date, "2026-03-02");
  assert.match(d[0].reason, /2026-03-01 \(1 days earlier\)/);
});

test("the new-payee check needs ten outflows exactly, and skips a payee whose first word is shared", () => {
  const ten = Array.from({ length: 9 }, (_, i) => `2026-02-${10 + i},SHOP ${i},-20.00`);
  const big = "2026-03-01,UNKNOWN CONSULTING,-4000.00";
  assert.equal(findAnomalies(books([...ten, big])).filter((x) => x.kind === "new-large").length, 1);
  assert.equal(findAnomalies(books([...ten.slice(1), big])).filter((x) => x.kind === "new-large").length, 0);
  const shared = findAnomalies(books([...base, ...filler, "2026-06-20,STAPLES 4411,-4000.00", "2026-06-21,STAPLES 9022,-15.00"]));
  assert.equal(shared.filter((x) => x.kind === "new-large").length, 0);
});
