import { describe, expect, it } from "vitest";
import {
  WEBHOOK_FULFILLMENT_FAILURE_STATUS,
  webhookFulfillmentFailureResponse,
} from "./webhook-fulfillment";

describe("webhookFulfillmentFailureResponse", () => {
  it("returns 500 with received:false for bundle fulfillment failures", () => {
    const result = webhookFulfillmentFailureResponse("bundle_payment_or_handoff");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("bundle_payment_or_handoff");
  });

  it("returns 500 with received:false for commerce ledger failures", () => {
    const result = webhookFulfillmentFailureResponse("commerce_order_ledger");
    expect(result.status).toBe(500);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_ledger");
  });
});
