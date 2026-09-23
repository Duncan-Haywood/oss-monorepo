import test from "node:test";
import assert from "node:assert/strict";
import { encodeInputs, decodeInputs, NUMBER_FIELD_IDS } from "./share.mjs";

test("round-trips every numeric field", () => {
  const inputs = Object.fromEntries(NUMBER_FIELD_IDS.map((id, i) => [id, i + 1]));
  const encoded = encodeInputs(inputs);
  const decoded = decodeInputs(`#${encoded}`);
  for (const id of NUMBER_FIELD_IDS) {
    assert.equal(decoded[id], inputs[id]);
  }
});

test("round-trips the target platform choice", () => {
  const encoded = encodeInputs({ jobPrice: 100, targetPlatform: "fiverr" });
  const decoded = decodeInputs(`#${encoded}`);
  assert.equal(decoded.targetPlatform, "fiverr");
});

test("omits blank and unusable fields rather than encoding zero", () => {
  const encoded = encodeInputs({ jobPrice: 100, upworkFeePercent: "", fiverrFeePercent: "not a number" });
  const decoded = decodeInputs(`#${encoded}`);
  assert.equal(decoded.jobPrice, 100);
  assert.ok(!("upworkFeePercent" in decoded));
  assert.ok(!("fiverrFeePercent" in decoded));
});

test("drops a negative value rather than accepting it", () => {
  const decoded = decodeInputs("#jobPrice=-5");
  assert.ok(!("jobPrice" in decoded));
});

test("drops an unrecognised targetPlatform value", () => {
  const decoded = decodeInputs("#targetPlatform=carbonite");
  assert.ok(!("targetPlatform" in decoded));
});

test("accepts a query string as well as a fragment", () => {
  const decoded = decodeInputs("?jobPrice=250");
  assert.equal(decoded.jobPrice, 250);
});

test("non-string input decodes to an empty object rather than throwing", () => {
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(null), {});
});

test("a link with nothing useful decodes to an empty object", () => {
  assert.deepEqual(decodeInputs("#"), {});
});
