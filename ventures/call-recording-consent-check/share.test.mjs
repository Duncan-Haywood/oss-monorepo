import test from "node:test";
import assert from "node:assert/strict";
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from "./share.mjs";
import { assessCall, disclosureScript } from "./engine.mjs";

test("round-trips all four fields and reproduces the same assessment", () => {
  const encoded = encodeInputs({
    "caller-state": "Texas",
    "recipient-state": "California",
    "script-company": "Acme Inc.",
    "script-purpose": "training purposes",
  });
  const decoded = decodeInputs(`#${encoded}`);
  assert.equal(decoded["caller-state"], "Texas");
  assert.equal(decoded["recipient-state"], "California");
  assert.equal(decoded["script-company"], "Acme Inc.");
  assert.equal(decoded["script-purpose"], "training purposes");

  const before = assessCall("Texas", "California");
  const after = assessCall(decoded["caller-state"], decoded["recipient-state"]);
  assert.equal(after.requirement, before.requirement);
  assert.equal(
    disclosureScript(after.requirement, { company: decoded["script-company"], purpose: decoded["script-purpose"] }),
    disclosureScript(before.requirement, { company: "Acme Inc.", purpose: "training purposes" }),
  );
});

test("an unknown key in the link is ignored, not smuggled through", () => {
  const decoded = decodeInputs("caller-state=Texas&admin=true");
  assert.deepEqual(Object.keys(decoded), ["caller-state"]);
});

test("a non-string source decodes to nothing rather than throwing", () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test("a leading ? or # is accepted so location.hash needs no trimming", () => {
  assert.deepEqual(decodeInputs("?caller-state=Ohio"), { "caller-state": "Ohio" });
  assert.deepEqual(decodeInputs("#caller-state=Ohio"), { "caller-state": "Ohio" });
});

test("blank or whitespace-only fields are omitted from the encoded link", () => {
  const encoded = encodeInputs({ "caller-state": "  ", "recipient-state": "Ohio", "script-company": "" });
  assert.equal(encoded.includes("caller-state"), false);
  assert.equal(encoded.includes("script-company"), false);
  assert.equal(encoded.includes("recipient-state=Ohio"), true);
});

test("formValues falls back to this venture's own shipped default for an omitted state, not a blank select", () => {
  const values = formValues({ "recipient-state": "Nevada" });
  assert.equal(values["caller-state"], "Texas");
  assert.equal(values["recipient-state"], "Nevada");
});

test("formValues clears an omitted free-text field to '' rather than leaving it unwritten", () => {
  const values = formValues({ "caller-state": "Texas", "recipient-state": "Texas" });
  assert.equal(values["script-company"], "");
  assert.equal(values["script-purpose"], "");
});

test("formValues on an empty decode still returns every field the form owns", () => {
  const values = formValues({});
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test("formValues on a missing argument does not throw and returns the shipped defaults", () => {
  const values = formValues();
  assert.equal(values["caller-state"], "Texas");
  assert.equal(values["recipient-state"], "Texas");
});
