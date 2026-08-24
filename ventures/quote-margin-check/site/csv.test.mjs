import test from "node:test";
import assert from "node:assert/strict";
import { csvCell } from "./csv.mjs";

test("leaves ordinary CSV cells unchanged", () => {
  assert.equal(csvCell("USD/hour"), "USD/hour");
});

test("quotes cells containing separators and doubles embedded quotes", () => {
  assert.equal(csvCell('CAD, "tax"'), '"CAD, ""tax"""');
});

test("quotes cells containing line breaks", () => {
  assert.equal(csvCell("USD\n/hour"), '"USD\n/hour"');
});
