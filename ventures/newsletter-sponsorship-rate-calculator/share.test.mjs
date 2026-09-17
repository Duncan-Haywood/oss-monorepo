import test from "node:test";
import assert from "node:assert/strict";
import { NICHES, computeRates } from "./calculator.mjs";
import { SHARE_FIELDS, encodeInputs, decodeInputs, formValues } from "./share.mjs";

test("the shared field set is exactly what computeRates reads", () => {
  assert.deepEqual([...SHARE_FIELDS].sort(), ["niche", "openRate", "subscribers"]);
});

test("round-trips a real rate card and drops junk", () => {
  const sent = { subscribers: 12000, openRate: 38, niche: "tech", unknown: 9 };
  const decoded = decodeInputs(`?${encodeInputs(sent)}`);
  assert.deepEqual(decoded, { subscribers: 12000, openRate: 38, niche: "tech" });
  assert.equal(decoded.unknown, undefined);
});

test("a shared link reproduces the sender's rates exactly", () => {
  const sent = { subscribers: 4200, openRate: 51.5, niche: "b2b" };
  assert.deepEqual(computeRates(decodeInputs(`#${encodeInputs(sent)}`)), computeRates(sent));
});

test("every niche survives the round trip", () => {
  for (const niche of NICHES) {
    assert.equal(decodeInputs(encodeInputs({ subscribers: 1000, openRate: 40, niche })).niche, niche);
  }
});

test("an unknown or crafted niche is dropped rather than written into the select", () => {
  for (const niche of ["crypto", "", "__proto__", "<script>"]) {
    assert.equal(decodeInputs(`subscribers=1000&niche=${encodeURIComponent(niche)}`).niche, undefined);
  }
  assert.equal(encodeInputs({ subscribers: 1000, niche: "crypto" }).includes("niche="), false);
});

test("ignores a crafted non-numeric or negative value", () => {
  assert.deepEqual(decodeInputs("subscribers=abc&openRate=38"), { openRate: 38 });
  assert.equal(encodeInputs({ subscribers: -1, openRate: 38 }).includes("subscribers="), false);
});

test("a blank box travels as blank rather than as absent", () => {
  const decoded = decodeInputs(encodeInputs({ subscribers: "", openRate: 38, niche: "tech" }));
  assert.equal(decoded.subscribers, "");
  assert.equal(formValues(decoded).subscribers, "");
});

test("formValues writes every field, clearing one the link did not carry", () => {
  const values = formValues(decodeInputs(encodeInputs({ subscribers: 8000, niche: "finance" })));
  assert.deepEqual(Object.keys(values).sort(), [...SHARE_FIELDS].sort());
  assert.equal(values.openRate, "", "a field the link omitted must be cleared, not left standing");
  assert.equal(values.subscribers, "8000");
  assert.equal(values.niche, "finance");
});

test("formValues falls back to the page default niche, since a select has no blank option", () => {
  assert.equal(formValues({}).niche, NICHES[0]);
  assert.equal(formValues(undefined, "tech").niche, "tech");
  assert.equal(formValues({ niche: "not-a-niche" }, "tech").niche, "tech");
});
