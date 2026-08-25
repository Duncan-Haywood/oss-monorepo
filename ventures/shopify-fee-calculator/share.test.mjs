import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeShareState, encodeShareState } from "./share.mjs";

const input = {
  price: "48", shippingCharged: "6", paymentsRate: "2.9", paymentsFixed: "0.3", shopifyTxnRate: "2",
  processorRate: "3.49", processorFixed: "0.49", costOfGoods: "14", shippingCost: "5", packagingCost: "1",
  otherCost: "0", monthlyPlan: "39", monthlyOrders: "100", targetMargin: "40", paymentMethod: "third_party",
};

test("share state round-trips as validated numeric inputs", () => {
  const restored = decodeShareState(encodeShareState(input));
  assert.equal(restored.price, 48);
  assert.equal(restored.paymentMethod, "third_party");
  assert.equal(restored.targetMargin, 40);
});

test("rejects malformed, extra-field, and invalid share states", () => {
  assert.throws(() => decodeShareState("not-a-link"), /Invalid shared/);
  const payload = encodeShareState(input);
  const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((payload.length + 3) % 4)));
  decoded.extra = "unexpected";
  const tampered = btoa(JSON.stringify(decoded)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.throws(() => decodeShareState(tampered), /Invalid shared/);
  assert.throws(() => encodeShareState({ ...input, targetMargin: 100 }), /invalid calculator inputs/);
});
