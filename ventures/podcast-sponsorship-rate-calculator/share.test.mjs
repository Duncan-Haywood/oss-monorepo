import test from "node:test";
import assert from "node:assert/strict";
import { NICHES, READ_TYPES, computeRates } from "./calculator.mjs";
import { SHARE_FIELDS, encodeInputs, decodeInputs, formValues } from "./share.mjs";

test("the shared field set is exactly what computeRates reads", () => {
  assert.deepEqual([...SHARE_FIELDS].sort(), ["downloads", "niche", "readType"]);
});

test("round-trips a real rate card and drops junk", () => {
  const sent = { downloads: 12000, niche: "tech", readType: "host-read", unknown: 9 };
  const decoded = decodeInputs(`?${encodeInputs(sent)}`);
  assert.deepEqual(decoded, { downloads: 12000, niche: "tech", readType: "host-read" });
  assert.equal(decoded.unknown, undefined);
});

test("a shared link reproduces the sender's rates exactly", () => {
  const sent = { downloads: 4200, niche: "business", readType: "produced" };
  assert.deepEqual(computeRates(decodeInputs(`#${encodeInputs(sent)}`)), computeRates(sent));
});

test("every niche and read type survives the round trip", () => {
  for (const niche of NICHES) {
    assert.equal(decodeInputs(encodeInputs({ downloads: 1000, niche, readType: "host-read" })).niche, niche);
  }
  for (const readType of READ_TYPES) {
    assert.equal(decodeInputs(encodeInputs({ downloads: 1000, niche: "general", readType })).readType, readType);
  }
});

test("an unknown or crafted enum value is dropped rather than written into the select", () => {
  for (const niche of ["crypto", "", "__proto__", "<script>"]) {
    assert.equal(decodeInputs(`downloads=1000&niche=${encodeURIComponent(niche)}`).niche, undefined);
  }
  assert.equal(encodeInputs({ downloads: 1000, niche: "crypto" }).includes("niche="), false);
  assert.equal(decodeInputs("downloads=1000&readType=bogus").readType, undefined);
});

test("ignores a crafted non-numeric or negative value", () => {
  assert.deepEqual(decodeInputs("downloads=abc&niche=tech"), { niche: "tech" });
  assert.equal(encodeInputs({ downloads: -1, niche: "tech" }).includes("downloads="), false);
});

test("a blank box travels as blank rather than as absent", () => {
  const decoded = decodeInputs(encodeInputs({ downloads: "", niche: "tech", readType: "host-read" }));
  assert.equal(decoded.downloads, "");
  assert.equal(formValues(decoded).downloads, "");
});

test("formValues writes every field, clearing one the link did not carry", () => {
  const values = formValues(decodeInputs(encodeInputs({ downloads: 8000, niche: "business" })));
  assert.deepEqual(Object.keys(values).sort(), [...SHARE_FIELDS].sort());
  assert.equal(values.downloads, "8000");
  assert.equal(values.niche, "business");
  assert.equal(values.readType, "host-read", "a field the link omitted must fall back to the default, not be left standing");
});

test("formValues falls back to the page default niche and read type, since a select has no blank option", () => {
  assert.equal(formValues({}).niche, NICHES[0]);
  assert.equal(formValues({}).readType, READ_TYPES[0]);
  assert.equal(formValues(undefined, { niche: "tech" }).niche, "tech");
  assert.equal(formValues({ niche: "not-a-niche" }, { niche: "tech" }).niche, "tech");
});
