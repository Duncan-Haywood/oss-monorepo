import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The page previously told the tax-proration formula to the visitor in the
// FAQ but never called `estimateTaxProration`, which already existed in
// calc.mjs and was already unit tested. This pins the wiring so the estimator
// box cannot regress back into a paragraph of arithmetic the visitor has to
// do by hand.
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("the page imports and calls estimateTaxProration rather than only describing it in the FAQ", () => {
  assert.match(index, /import\s*\{[^}]*estimateTaxProration[^}]*\}\s*from\s*"\.\/calc\.mjs"/);
  assert.match(index, /estimateTaxProration\(\{\s*annualTax/);
});

test("the tax-proration estimator has an annual-tax input, a days-charged input, and an apply button", () => {
  assert.match(index, /id="prorationAnnualTax"/);
  assert.match(index, /id="prorationDays"/);
  assert.match(index, /id="prorationApply"/);
  assert.match(index, /id="prorationPreview"/);
});

test("applying the estimate writes into the same field the net sheet reads", () => {
  assert.match(index, /id="taxProration"/);
  // The apply handler must set the visible taxProration field, not a
  // shadow value the net-sheet calculation never sees.
  assert.match(index, /el\("taxProration"\)\.value\s*=/);
});

test("the FAQ still explains the arithmetic and now also points at the estimator box", () => {
  assert.match(index, /divide by 365 for a daily rate/i);
  assert.match(index, /Estimate it<\/strong> box/i);
});

test("applying the estimate is counted as its own usage event, separate from a manual edit", () => {
  assert.match(index, /count\("tax_proration_estimated"\)/);
});
