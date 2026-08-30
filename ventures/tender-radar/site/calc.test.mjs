import test from "node:test";
import assert from "node:assert/strict";
import { parseTenders, filterTenders, escapeHtml, safeUrl, toCsv, isUrgent } from "./calc.mjs";

const SAMPLE = `title,buyer,deadline,category,value,url
School roof repairs,City Council,2026-09-18,roofing,85000,https://example.test/tender
Hall painting,City Council,2026-10-02,painting,12000,https://example.test/paint
Unsafe javascript,Buyer,2026-08-27,roofing,90000,javascript:alert(1)`;

test("parses a portal CSV and filters by trade and minimum", () => {
  const rows = parseTenders(SAMPLE);
  const shortlist = filterTenders(rows, { category: "roof", minimum: 20000 });
  assert.equal(shortlist.length, 2);
  assert.equal(shortlist[0].title, "Unsafe javascript");
  assert.equal(shortlist[1].title, "School roof repairs");
});

test("rejects a header-only paste", () => {
  assert.throws(() => parseTenders("title,deadline\n"), /header and at least one/);
});

test("escapes HTML and drops non-http URLs", () => {
  assert.equal(escapeHtml(`<script>x</script>`), "&lt;script&gt;x&lt;/script&gt;");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("https://example.test/tender"), "https://example.test/tender");
});

test("flags a deadline closing soon as urgent, not one that already passed", () => {
  // The bug this guards: the table used to mark `deadline < today` as
  // "urgent", which flags exactly the rows nobody can act on any more (the
  // deadline already closed) while a deadline closing tomorrow -- the one
  // that actually needs attention -- got no emphasis at all.
  assert.equal(isUrgent("2026-08-29", "2026-08-30"), false, "a passed deadline is not urgent");
  assert.equal(isUrgent("2026-09-02", "2026-08-30"), true, "3 days out is inside the window");
  assert.equal(isUrgent("2026-08-30", "2026-08-30"), true, "due today is urgent");
  assert.equal(isUrgent("2026-09-06", "2026-08-30"), true, "7 days out is the edge of the window");
  assert.equal(isUrgent("2026-09-07", "2026-08-30"), false, "8 days out is outside the window");
});

test("CSV export quotes embedded quotes", () => {
  const csv = toCsv([{ deadline: "2026-09-18", title: 'Roof "A"', buyer: "City", category: "roofing", value: "85000", url: "" }]);
  assert.match(csv, /"Roof ""A"""/);
});
