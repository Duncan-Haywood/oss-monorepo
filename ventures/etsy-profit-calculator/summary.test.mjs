import test from "node:test";
import assert from "node:assert/strict";
import { calculateOrder, priceForMargin } from "./calc.mjs";
import { formatOrderSummary } from "./summary.mjs";

test("formats a complete copyable order summary without raw input names", () => {
  const input = {
    price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, shippingCost: 6, materialCost: 4,
  };
  const result = calculateOrder(input);
  const summary = formatOrderSummary(input, result, 50, priceForMargin(input, 50));
  assert.match(summary, /Estimated net contribution: \$21\.23/);
  assert.match(summary, /Cash invested: \$10\.00/);
  assert.match(summary, /Return on cash: 212\.3%/);
  assert.match(summary, /Price for 50% target margin:/);
  assert.doesNotMatch(summary, /transactionRate|shippingCost/);
});
