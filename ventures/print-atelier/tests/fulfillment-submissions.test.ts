import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFulfillmentSubmissionSummary } from "../src/lib/fulfillment-submissions.ts";
import {
  clearGelatoFulfillmentForTests,
  recordGelatoFulfillmentSubmission,
} from "../src/lib/gelato-orders.ts";
import {
  clearPrintfulFulfillmentForTests,
  recordPrintfulFulfillmentSubmission,
} from "../src/lib/printful-orders.ts";

test("buildFulfillmentSubmissionSummary aggregates submission statuses", () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();

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
  clearGelatoFulfillmentForTests();
});

test("buildFulfillmentSubmissionSummary merges Printful and Gelato submissions", () => {
  clearPrintfulFulfillmentForTests();
  clearGelatoFulfillmentForTests();

  recordGelatoFulfillmentSubmission({
    orderId: "ord_gelato_1",
    partner: "gelato",
    mode: "dry_run",
    status: "queued",
    apiEndpoint: "https://order.gelatoapis.com/v4/orders",
    payload: {
      orderType: "order",
      orderReferenceId: "ord_gelato_1",
      customerReferenceId: "pi_1",
      currency: "EUR",
      items: [
        {
          itemReferenceId: "ord_gelato_1_0",
          productUid: "gel_poster_18x24_matte",
          quantity: 1,
          fileUrl: "https://cdn.printatelier.com/midnight-coast.jpg",
        },
      ],
      shippingAddress: {
        firstName: "Elena",
        lastName: "Buyer",
        addressLine1: "10 Market St",
        city: "London",
        state: "",
        postCode: "EC1A 1BB",
        country: "GB",
        email: "buyer@example.com",
      },
    },
    message: "Queued",
  });

  const summary = buildFulfillmentSubmissionSummary();
  assert.equal(summary.totalSubmissions, 1);
  assert.equal(summary.gelatoCount, 1);
  assert.equal(summary.printfulCount, 0);

  clearGelatoFulfillmentForTests();
});
