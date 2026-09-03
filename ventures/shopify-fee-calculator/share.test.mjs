import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIELD_IDS, decodeInputs, decodeShareState, encodeInputs, encodeShareState } from "./share.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// A whole scenario, which is what the strict token carries: every one of the
// page's five panels, not the order form alone.
const input = {
  price: "48", shippingCharged: "6", paymentsRate: "2.9", paymentsFixed: "0.3", shopifyTxnRate: "2",
  processorRate: "3.49", processorFixed: "0.49", costOfGoods: "14", shippingCost: "5", packagingCost: "1",
  otherCost: "0", monthlyPlan: "39", monthlyOrders: "100", targetMargin: "40", targetProfit: "12",
  percentOff: "10", amountOff: "10",
  installmentRate: "5.9", installmentFixed: "0.3", installmentSharePct: "25", extraOrdersFromInstallments: "4",
  shopifyLabelCost: "7.2", ownLabelCost: "8.4",
  posPaymentsRate: "2.6", posPaymentsFixed: "0.1", posHardwareCost: "349",
  paymentMethod: "third_party", planId: "advanced",
};

// The v1 payload shape: the sixteen CORE_FIELDS and nothing else. A link sent
// before the other panels were carried still has to open.
const legacy = {
  price: "48", shippingCharged: "6", paymentsRate: "2.9", paymentsFixed: "0.3", shopifyTxnRate: "2",
  processorRate: "3.49", processorFixed: "0.49", costOfGoods: "14", shippingCost: "5", packagingCost: "1",
  otherCost: "0", monthlyPlan: "39", monthlyOrders: "100", targetMargin: "40",
  percentOff: "10", amountOff: "10", paymentMethod: "third_party",
};

const toToken = (state) => Buffer.from(JSON.stringify(state)).toString("base64url");
const fromToken = (token) => JSON.parse(Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());

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

// ---------------------------------------------------------------------------
// The whole scenario, and only the whole scenario
// ---------------------------------------------------------------------------
//
// The regression these pin: the token carried a hand-kept sixteen-name list
// while the form had twenty-six inputs across five panels, and `applyShare`
// wrote back two of them. The recipient's Installments, label and POS panels
// showed this page's example figures under a headline profit that matched the
// sender's exactly — three verdicts about real money, silently different, with
// nothing to notice.

test("carries every panel, so a recipient reads the sender's own figures", () => {
  const restored = decodeShareState(encodeShareState(input));
  for (const field of FIELD_IDS) {
    assert.equal(restored[field], Number(input[field]), `${field} did not survive the link`);
  }
});

test("carries the plan, which decides the row comparePlans marks as current", () => {
  assert.equal(decodeShareState(encodeShareState(input)).planId, "advanced");
  assert.throws(() => decodeShareState(toToken({ ...fromToken(encodeShareState(input)), planId: "enterprise" })), /Invalid shared/);
});

test("a link sent before the extra panels were carried still opens", () => {
  // Backward compatibility is what lets the carried list grow at all: the v1
  // sixteen are required, everything past them optional. The fields the old
  // link says nothing about keep this page's own starting figures rather than
  // being zeroed into something that reads like an answer.
  const restored = decodeShareState(toToken({ v: 1, ...Object.fromEntries(Object.entries(legacy).map(([k, v]) => [k, k === "paymentMethod" ? v : Number(v)])) }));
  assert.equal(restored.price, 48);
  assert.equal(restored.targetMargin, 40);
  assert.equal("posHardwareCost" in restored, false);
  assert.equal("planId" in restored, false);
});

test("a name this build does not know is refused rather than ignored", () => {
  assert.throws(() => decodeShareState(toToken({ ...fromToken(encodeShareState(input)), surcharge: 3 })), /Invalid shared/);
});

test("a core field cannot go missing from a token", () => {
  const state = fromToken(encodeShareState(input));
  delete state.price;
  assert.throws(() => decodeShareState(toToken(state)), /Invalid shared/);
});

test("the page writes back every field the token carries", () => {
  // The other half of the same defect lived in index.html, and a decoder test
  // cannot see it: the token was only ever as good as what applyShare put back.
  assert.match(html, /function applyShare\(state\) \{\s*FIELD_IDS\.forEach/);
  assert.match(html, /document\.getElementById\("plan"\)\.value = state\.planId/);
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
