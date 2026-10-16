import test from "node:test";
import assert from "node:assert/strict";
import { NICHES, FORMATS, USAGE_RIGHTS, EXCLUSIVITY, computeRate } from "./calculator.mjs";
import { SHARE_FIELDS, encodeInputs, decodeInputs, formValues } from "./share.mjs";

test("the shared field set is exactly what computeRate reads", () => {
  assert.deepEqual([...SHARE_FIELDS].sort(), ["exclusivity", "format", "niche", "usage", "views"]);
});

test("round-trips a rate card and drops junk", () => {
  const sent = { views: 42000, niche: "tech", format: "dedicated", usage: "30d", exclusivity: "90d", unknown: 9 };
  const decoded = decodeInputs(`?${encodeInputs(sent)}`);
  assert.deepEqual(decoded, { views: 42000, niche: "tech", format: "dedicated", usage: "30d", exclusivity: "90d" });
});

test("a shared link reproduces the sender's price exactly", () => {
  const sent = { views: 77000, niche: "gaming", format: "mention", usage: "perpetual", exclusivity: "30d" };
  assert.deepEqual(computeRate(decodeInputs(`#${encodeInputs(sent)}`)), computeRate(sent));
});

test("every enum value survives the round trip", () => {
  const lists = { niche: NICHES, format: FORMATS, usage: USAGE_RIGHTS, exclusivity: EXCLUSIVITY };
  for (const [field, values] of Object.entries(lists)) {
    for (const v of values) assert.equal(decodeInputs(encodeInputs({ views: 1, [field]: v }))[field], v);
  }
});

test("crafted enum and numeric values are dropped", () => {
  for (const niche of ["crypto", "", "__proto__", "<script>"]) {
    assert.equal(decodeInputs(`views=1000&niche=${encodeURIComponent(niche)}`).niche, undefined);
  }
  assert.deepEqual(decodeInputs("views=abc&niche=tech"), { niche: "tech" });
  assert.deepEqual(decodeInputs("views=-4"), {});
});

test("a cleared box arrives cleared and enums fall back to page defaults", () => {
  const values = formValues(decodeInputs("views="), { niche: "general" });
  assert.equal(values.views, "");
  assert.equal(values.niche, "general");
  assert.equal(formValues({}).format, FORMATS[0]);
});

test("encodeInputs keeps zero and drops negative, infinite and non-numeric views", () => {
  assert.equal(encodeInputs({ views: 0 }), "views=0");
  for (const views of [-5, Infinity, NaN, "abc"]) assert.equal(encodeInputs({ views }), "");
});

test("decodeInputs keeps a zero and rejects an infinite or negative number", () => {
  assert.deepEqual(decodeInputs("views=0"), { views: 0 });
  assert.deepEqual(decodeInputs("views=Infinity"), {});
  assert.deepEqual(decodeInputs("views=-1"), {});
});

test("formValues stringifies a carried number, including zero", () => {
  assert.equal(formValues({ views: 42000 }).views, "42000");
  assert.equal(formValues({ views: 0 }).views, "0");
  assert.equal(formValues({}).views, "");
});
