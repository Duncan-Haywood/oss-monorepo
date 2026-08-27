import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIELD_IDS, decodeInputs, decodeShareState, encodeInputs, encodeShareState } from "./share.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

const input = {
  price: "48", shippingCharged: "6", paymentsRate: "2.9", paymentsFixed: "0.3", shopifyTxnRate: "2",
  processorRate: "3.49", processorFixed: "0.49", costOfGoods: "14", shippingCost: "5", packagingCost: "1",
  otherCost: "0", monthlyPlan: "39", monthlyOrders: "100", targetMargin: "40",
  percentOff: "10", amountOff: "10", paymentMethod: "third_party",
};

test("share state round-trips as validated numeric inputs", () => {
  const restored = decodeShareState(encodeShareState(input));
  assert.equal(restored.price, 48);
  assert.equal(restored.paymentMethod, "third_party");
  assert.equal(restored.targetMargin, 40);
  assert.equal(restored.percentOff, 10);
  assert.equal(restored.amountOff, 10);
});

test("rejects malformed, extra-field, and invalid share states", () => {
  assert.throws(() => decodeShareState("not-a-link"), /Invalid shared/);
  const payload = encodeShareState(input);
  const padding = "=".repeat((4 - (payload.length % 4)) % 4);
  const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/") + padding));
  decoded.extra = "unexpected";
  const tampered = btoa(JSON.stringify(decoded)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.throws(() => decodeShareState(tampered), /Invalid shared/);
  assert.throws(() => encodeShareState({ ...input, targetMargin: 100 }), /invalid calculator inputs/);
});

test("the order page wires share and summary copy", () => {
  assert.match(html, /Copy share link/);
  assert.match(html, /Copy order summary/);
  assert.match(html, /encodeShareState/);
  assert.match(html, /decodeShareState/);
});

// ---------------------------------------------------------------------------
// Partial links: the handoff from where-to-sell-calculator
// ---------------------------------------------------------------------------
//
// The whole-state token above must fail closed — a recipient sees exactly what
// the sender saw or is told the link is unreadable. A handoff cannot work that
// way: the cross-channel comparison knows the item and nothing about this
// page's plan, promo, installment or POS assumptions, so refusing a partial
// link is what left the "own store" row of that comparison with no way through.
// These two decoders are deliberately separate, and both behaviours are pinned.

test("a handoff link carries the item and claims nothing else", () => {
  const restored = decodeInputs("#price=40&costOfGoods=12&monthlyOrders=120");
  assert.deepEqual(restored, { price: 40, costOfGoods: 12, monthlyOrders: 120 });
});

test("round-trips every field the page has, so none is silently dropped", () => {
  const all = Object.fromEntries(FIELD_IDS.map((field, index) => [field, index + 1]));
  assert.deepEqual(decodeInputs(encodeInputs(all)), all);
});

test("carries the payment path, which is the decision this page exists for", () => {
  for (const method of ["shopify_payments", "third_party"]) {
    assert.equal(decodeInputs(encodeInputs({ paymentMethod: method })).paymentMethod, method);
  }
  assert.equal(decodeInputs("#paymentMethod=bitcoin").paymentMethod, undefined);
});

test("a blank field is omitted rather than pinned to zero", () => {
  const query = encodeInputs({ price: 40, packagingCost: "", otherCost: null });
  assert.deepEqual(decodeInputs(query), { price: 40 });
});

test("junk and negatives are dropped, so the page shows its own numbers", () => {
  assert.deepEqual(decodeInputs("#price=abc&costOfGoods=-3&unknown=9&monthlyOrders=120"), { monthlyOrders: 120 });
  for (const value of ["", "#", "?", null, undefined, "%%%"]) {
    assert.deepEqual(decodeInputs(value), {});
  }
});

test("a full share token is not readable as a partial link, and vice versa", () => {
  // The two shapes must stay distinguishable: the page tries the strict decoder
  // first and only falls back when it refuses.
  const token = encodeShareState(input);
  assert.deepEqual(decodeInputs(token), {}, "a base64 token carries no query pairs");
  assert.throws(() => decodeShareState("price=40&costOfGoods=12"));
});

test("adding a partial decoder did not widen the strict one", () => {
  // The strict decoder compares key sets exactly, so adding any name to its
  // list would reject every link already sent. FIELD_IDS is a superset — it
  // covers the installment, label and POS inputs the token never carried — and
  // has to stay separate from it. Re-encoding a token with one extra key is the
  // check: the decoder must refuse it.
  const partialOnly = FIELD_IDS.filter((field) => !(field in input));
  assert.ok(partialOnly.length > 0, "FIELD_IDS should cover inputs the strict token does not");

  const token = encodeShareState(input);
  const widened = JSON.parse(Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  widened[partialOnly[0]] = 1;
  const retoken = Buffer.from(JSON.stringify(widened)).toString("base64url");
  assert.throws(() => decodeShareState(retoken), /Invalid|Unsupported/);

  // And the token this page actually writes still decodes, unchanged.
  assert.equal(decodeShareState(token).price, 48);
});

test("FIELD_IDS matches the number inputs the page actually has", () => {
  const notScenario = new Set(["usageOptOut"]);
  const missing = [];
  for (const match of html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const [tag, id] = match;
    if (notScenario.has(id) || FIELD_IDS.includes(id)) continue;
    if (/type="number"/.test(tag)) missing.push(id);
  }
  assert.deepEqual(missing, [], `these inputs cannot travel in a link: ${missing.join(", ")}`);
  const absent = FIELD_IDS.filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(absent, [], `FIELD_IDS names inputs the page does not have: ${absent.join(", ")}`);
});

test("the page reads a partial link and says which values came from it", () => {
  assert.match(html, /applyPartial\(decodeInputs\(hash\)\)/);
  assert.match(html, /Loaded \$\{applied\} value/);
  assert.match(html, /handoff_opened/);
});

test("the page imports its field lists rather than keeping a second copy", () => {
  assert.match(html, /ORDER_FIELDS as ids/);
  assert.doesNotMatch(html, /const ids = \[/);
});
