import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeRows, decodeRows } from "./share.mjs";
import { reconcileAll, sampleRows } from "./calc.mjs";

test("round-trips the worked example unchanged", () => {
  const rows = sampleRows();
  const fragment = encodeRows(rows);
  assert.ok(fragment.length > 0);
  const decoded = decodeRows(fragment);
  assert.deepEqual(decoded, [
    { platform: "Etsy", box1a: 9200, refunds: 180, salesTax: 410, fees: 540, cogs: 3100, shipping: 620 },
    { platform: "Poshmark", box1a: 5400, refunds: 0, salesTax: 0, fees: 1080, cogs: 2200, shipping: 0 },
  ]);
});

test("a decoded link reconciles to the same totals as the original rows", () => {
  const rows = sampleRows();
  const before = reconcileAll(rows);
  const after = reconcileAll(decodeRows(encodeRows(rows)));
  assert.deepEqual(after.totals, before.totals);
});

test("strips the leading # or ? a location.hash or location.search would carry", () => {
  const fragment = encodeRows([{ platform: "Etsy", box1a: "100" }]);
  assert.deepEqual(decodeRows(`#${fragment}`), decodeRows(fragment));
  assert.deepEqual(decodeRows(`?${fragment}`), decodeRows(fragment));
});

test("an empty, absent, or blank-rows worksheet encodes to nothing shareable", () => {
  assert.equal(encodeRows([]), "");
  assert.equal(encodeRows(undefined), "");
  assert.equal(encodeRows([{ platform: "" }, { box1a: "500" }]), ""); // no usable platform name on either row
});

test("decodeRows never throws on garbage input", () => {
  for (const input of [undefined, null, "", "not json", "%", "[1,2,3", '"a string, not an array"', "42", '{"platform":"Etsy"}']) {
    assert.deepEqual(decodeRows(input), []);
  }
});

test("a row missing a field reconciles that field as zero, never as a dropped platform", () => {
  const fragment = encodeURIComponent(JSON.stringify([{ platform: "Etsy", box1a: "500" }]));
  assert.deepEqual(decodeRows(fragment), [
    { platform: "Etsy", box1a: 500, refunds: 0, salesTax: 0, fees: 0, cogs: 0, shipping: 0 },
  ]);
});

test("negative and non-finite numbers are treated as zero, matching calc.mjs's own coercion", () => {
  const fragment = encodeURIComponent(JSON.stringify([
    { platform: "Etsy", box1a: -50, refunds: "not a number", fees: Infinity, cogs: NaN },
  ]));
  assert.deepEqual(decodeRows(fragment), [
    { platform: "Etsy", box1a: 0, refunds: 0, salesTax: 0, fees: 0, cogs: 0, shipping: 0 },
  ]);
});

test("a platform name is trimmed, control characters collapsed, and long names capped at 60 characters", () => {
  const fragment = encodeURIComponent(JSON.stringify([{ platform: `  Etsy\n\tShop  ${"x".repeat(80)}`, box1a: "10" }]));
  const [row] = decodeRows(fragment);
  assert.equal(row.platform.length, 60);
  assert.equal(row.platform.startsWith("Etsy Shop"), true);
});

test("a row with no usable platform name is dropped, not kept with a placeholder", () => {
  const fragment = encodeURIComponent(JSON.stringify([{ platform: "   ", box1a: "500" }, { platform: "Etsy", box1a: "10" }]));
  assert.deepEqual(decodeRows(fragment), [
    { platform: "Etsy", box1a: 10, refunds: 0, salesTax: 0, fees: 0, cogs: 0, shipping: 0 },
  ]);
});

test("caps at 25 rows even when the link claims more", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ platform: `Platform ${i}`, box1a: "10" }));
  assert.equal(decodeRows(encodeRows(many)).length, 25);
  // A crafted fragment (not one this module ever produces) can still claim more than 25 -- cap that too.
  const crafted = encodeURIComponent(JSON.stringify(many));
  assert.equal(decodeRows(crafted).length, 25);
});

test("a non-array top-level payload decodes to no rows, even when it is a valid object", () => {
  assert.deepEqual(decodeRows(encodeURIComponent(JSON.stringify({ platform: "Etsy", box1a: "10" }))), []);
});
