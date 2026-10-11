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

// The result panel (net, the item breakdown, the walk-away price, and the
// two-offer table) rewrites its own text on every keystroke via `update()`,
// but the section itself carried no aria-live region. A screen-reader user
// who tabs away after typing a number is never told the net changed, or
// that a bad input flipped the panel into an error message -- every other
// finished venture's `.result` section in this repo marks itself
// aria-live="polite" for exactly this reason (see painting-bid-calculator,
// roofing-bid-calculator). This pins the same convention here.
test("the result panel is an aria-live region so screen readers hear updates and errors", () => {
  assert.match(index, /<section class="result" aria-live="polite">/);
});

test("the copy-status message is announced, matching the role=\"status\" convention used elsewhere", () => {
  assert.match(index, /id="copyStatus"[^>]*role="status"[^>]*aria-live="polite"/);
});

test("links to the STR host payout calculator", () => {
  assert.match(index, /href="\.\.\/str-host-payout-calculator\/"/, "the sibling-tool link is missing");
});

test("footer links the home sale net proceeds calculator sibling", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/home-sale-net-proceeds-calculator\/"/);
});
