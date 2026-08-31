const test = require("node:test");
const assert = require("node:assert/strict");
const { checkRows, buildReport, toMarkdown, toJson, parseCsv } = require("./evidence.js");

test("flags an older-received lot picked after a newer order from the same SKU", () => {
  const rows = [
    { order_id: "old", sku: "A", lot: "1", received_at: "2026-01-01T00:00:00Z", picked_at: "2026-01-03T00:00:00Z" },
    { order_id: "new", sku: "A", lot: "2", received_at: "2026-01-02T00:00:00Z", picked_at: "2026-01-02T12:00:00Z" },
  ];
  const observations = checkRows(rows);
  assert.equal(observations.some((item) => item.kind === "fifo-exception"), true);
});

test("reports missing-data instead of crashing on a blank required field", () => {
  const rows = [{ order_id: "x", sku: "A", lot: "", received_at: "bad", picked_at: "2026-01-01T00:00:00Z" }];
  const kinds = new Set(checkRows(rows).map((item) => item.kind));
  assert.deepEqual(kinds, new Set(["missing-data"]));
});

test("reports a timezone-less timestamp as invalid instead of guessing a zone", () => {
  const rows = [{ order_id: "x", sku: "A", lot: "1", received_at: "2026-01-01T00:00:00", picked_at: "2026-01-01T01:00:00Z" }];
  assert.equal(checkRows(rows)[0].kind, "invalid-timestamp");
});

test("parseCsv handles quoted fields with embedded commas and escaped quotes", () => {
  const table = parseCsv('a,b\n"1,000","say ""hi"""\n');
  assert.deepEqual(table, [["a", "b"], ["1,000", 'say "hi"']]);
});

test("buildReport rejects a CSV missing required columns", () => {
  assert.throws(() => buildReport("order_id,sku\nx,A\n"), /missing required columns/);
});

test("a headers-only CSV is a clean zero-row report, not a missing-column error", () => {
  const report = buildReport("order_id,sku,lot,received_at,picked_at\n");
  assert.equal(report.rowsChecked, 0);
  assert.equal(report.status, "no-observations");
  assert.deepEqual(report.observations, []);
});

test("a completely empty file still reports missing columns", () => {
  assert.throws(() => buildReport(""), /missing required columns/);
});

test("toMarkdown and toJson render the report without throwing on either shape", () => {
  const clean = buildReport("order_id,sku,lot,received_at,picked_at\n");
  const withRows = buildReport(
    "order_id,sku,lot,received_at,picked_at\n" +
      "old,A,1,2026-01-01T00:00:00Z,2026-01-03T00:00:00Z\n" +
      "new,A,2,2026-01-02T00:00:00Z,2026-01-02T12:00:00Z\n",
  );
  assert.match(toMarkdown(clean), /No observations/);
  assert.match(toMarkdown(withRows), /fifo-exception/);
  assert.equal(JSON.parse(toJson(withRows)).rowsChecked, 2);
});
