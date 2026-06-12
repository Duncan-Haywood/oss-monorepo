import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFulfillmentSubmissionSummary } from "../src/lib/fulfillment-submissions.ts";
import {
  clearPrintfulFulfillmentForTests,
  recordPrintfulFulfillmentSubmission,
} from "../src/lib/printful-orders.ts";

test("buildFulfillmentSubmissionSummary aggregates submission statuses", () => {
  clearPrintfulFulfillmentForTests();

  recordPrintfulFulfillmentSubmission({
    orderId: "ord_test_1",
    partner: "printful",
    mode: "api_submit",
    status: "submitted",
    apiEndpoint: "https://api.printful.com/orders",
    payload: {
      externalId: "ord_test_1",
      recipient: {
        name: "Buyer",
        address1: "123 St",
        city: "SF",
        stateCode: "CA",
        countryCode: "US",
        zip: "94105",
      },
      items: [{ variantId: "4011", quantity: 1, retailPrice: "85.00", name: "Print" }],
      retailCosts: { currency: "USD", subtotal: "85.00", shipping: "0.00", tax: "0.00" },
    },
    message: "Submitted",
    httpStatus: 200,
    httpOk: true,
  });

  const summary = buildFulfillmentSubmissionSummary();
  assert.equal(summary.totalSubmissions, 1);
  assert.equal(summary.submittedCount, 1);
  assert.equal(summary.fulfillmentReady, true);

  clearPrintfulFulfillmentForTests();
});
