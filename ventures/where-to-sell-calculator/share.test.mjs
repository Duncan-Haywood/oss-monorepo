import assert from "node:assert/strict";
import { test } from "node:test";
import { addStateToUrl, decodeComparisonState, encodeComparisonState, stateFromUrl } from "./share.mjs";

const state = {
  shared: { price: "48", itemCost: "14", includeSubscription: true },
  channels: [{ id: "ebay", price: "52", enabled: true }],
};

test("share state round-trips through a URL", () => {
  const url = addStateToUrl("https://example.test/where-to-sell/", state);
  assert.deepEqual(stateFromUrl(url), state);
  assert.match(url, /[?&]compare=/);
});

test("encoding does not expose raw JSON delimiters in the URL", () => {
  const encoded = encodeComparisonState(state);
  assert.ok(!encoded.includes("{"));
  assert.ok(!encoded.includes("\"shared\""));
});

test("malformed or incompatible state is ignored", () => {
  assert.equal(decodeComparisonState("not-json"), null);
  assert.equal(decodeComparisonState(encodeURIComponent(JSON.stringify({ v: 2 }))), null);
  assert.equal(stateFromUrl("https://example.test/?compare=bad"), null);
});
