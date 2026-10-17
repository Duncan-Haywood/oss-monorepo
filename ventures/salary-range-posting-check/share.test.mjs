import test from "node:test";
import assert from "node:assert/strict";
import { FIELD_IDS, encodeInputs, decodeInputs, formValues } from "./share.mjs";
import { getRule } from "./engine.mjs";

test("round-trips the states field", () => {
  const encoded = encodeInputs({ states: "Colorado,New York" });
  const decoded = decodeInputs(`#${encoded}`);
  assert.equal(decoded.states, "Colorado,New York");
  const states = decoded.states.split(",");
  assert.equal(getRule(states[0]).type, "range-required");
});

test("an unknown key in the link is ignored, not smuggled through", () => {
  const decoded = decodeInputs("states=Texas&admin=true");
  assert.deepEqual(Object.keys(decoded), ["states"]);
});

test("a non-string source decodes to nothing rather than throwing", () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test("a leading ? or # is accepted so location.hash needs no trimming", () => {
  assert.deepEqual(decodeInputs("?states=Ohio"), { states: "Ohio" });
  assert.deepEqual(decodeInputs("#states=Ohio"), { states: "Ohio" });
});

test("a blank or whitespace-only states field is omitted from the encoded link", () => {
  const encoded = encodeInputs({ states: "   " });
  assert.equal(encoded.includes("states"), false);
});

test("the posting text is never part of the encodable fields", () => {
  assert.deepEqual(FIELD_IDS, ["states"]);
  const encoded = encodeInputs({ states: "Texas", text: "some posting body" });
  assert.equal(decodeInputs(`#${encoded}`).text, undefined);
});

test("formValues falls back to this venture's own shipped default when the link omits states", () => {
  assert.equal(formValues({}).states, "Colorado");
  assert.equal(formValues().states, "Colorado");
});

test("formValues on a real decode keeps the decoded value", () => {
  assert.equal(formValues({ states: "Hawaii" }).states, "Hawaii");
});
