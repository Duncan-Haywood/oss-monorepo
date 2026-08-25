import test from "node:test";
import assert from "node:assert/strict";

import { buildReportCsv, csvCell } from "./csv.mjs";

const report = {
  total_hours: 35,
  direct_costs: 480,
  effective_hourly_rate: 54.8571428,
  target_price: 3105,
  gap_to_target: -705,
  cost_coverage: 1920,
};

test("escapes commas, quotes, and line breaks in CSV cells", () => {
  assert.equal(csvCell('USD, "special"\nlabel', { text: true }), '"USD, ""special""\nlabel"');
});

test("neutralizes formula-like currency labels", () => {
  assert.equal(csvCell("=HYPERLINK(\"https://example.test\")", { text: true }), "\"'=HYPERLINK(\"\"https://example.test\"\")\"");
});

test("builds a valid report when the currency label contains a comma", () => {
  const csv = buildReportCsv({ currency: "USD, billed", price: 2400 }, report);
  assert.match(csv, /quoted_price,2400\.00,"USD, billed"/);
  assert.match(csv, /effective_hourly_rate,54\.86,"USD, billed\/hour"/);
  assert.equal(csv.split("\n").length, 8);
});
