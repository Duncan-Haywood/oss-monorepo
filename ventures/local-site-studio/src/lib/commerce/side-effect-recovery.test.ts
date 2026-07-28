import { describe, expect, it } from "vitest";
import {
  hasCommerceCheckoutInquiryForSession,
  hasCommerceClientReceiptSentMarker,
  inquiryMentionsStripeSession,
  planCommerceWebhookSideEffects,
} from "./side-effect-recovery";

describe("inquiryMentionsStripeSession", () => {
  it("matches the session id embedded in commerceOrderPaidInquiryMessage", () => {
    const message =
      "Paid order via Buy now: Latte ($5.00) — Stripe session cs_test_abc, SKU sku_1.";
    expect(inquiryMentionsStripeSession(message, "cs_test_abc")).toBe(true);
  });

  it("rejects empty session ids", () => {
    expect(inquiryMentionsStripeSession("Stripe session cs_x", "")).toBe(false);
  });

  it("does not match unrelated messages", () => {
    expect(
      inquiryMentionsStripeSession("Request order: Latte", "cs_test_abc"),
    ).toBe(false);
  });
});

describe("hasCommerceCheckoutInquiryForSession", () => {
  it("requires source commerce_checkout and matching session", () => {
    expect(
      hasCommerceCheckoutInquiryForSession(
        [
          {
            source: "contact_form",
            message: "Stripe session cs_test_abc",
          },
          {
            source: "commerce_checkout",
            message: "Paid order via Buy now: X — Stripe session cs_other",
          },
        ],
        "cs_test_abc",
      ),
    ).toBe(false);

    expect(
      hasCommerceCheckoutInquiryForSession(
        [
          {
            source: "commerce_checkout",
            message: "Paid order via Buy now: X — Stripe session cs_test_abc",
          },
        ],
        "cs_test_abc",
      ),
    ).toBe(true);
  });
});

describe("hasCommerceClientReceiptSentMarker", () => {
  it("is false for missing/empty markers", () => {
    expect(hasCommerceClientReceiptSentMarker(null)).toBe(false);
    expect(hasCommerceClientReceiptSentMarker(undefined)).toBe(false);
    expect(hasCommerceClientReceiptSentMarker({})).toBe(false);
    expect(hasCommerceClientReceiptSentMarker({ clientReceiptEmailSentAt: "" })).toBe(
      false,
    );
    expect(
      hasCommerceClientReceiptSentMarker({ clientReceiptEmailSentAt: "   " }),
    ).toBe(false);
  });

  it("is true when clientReceiptEmailSentAt is set", () => {
    expect(
      hasCommerceClientReceiptSentMarker({
        clientReceiptEmailSentAt: "2026-07-14T12:00:00.000Z",
      }),
    ).toBe(true);
  });
});

describe("planCommerceWebhookSideEffects", () => {
  const sessionId = "cs_test_recover";

  it("runs inquiry + receipt on first delivery when no prior inquiry and no receipt marker", () => {
    expect(
      planCommerceWebhookSideEffects({
        alreadyRecorded: false,
        inquiriesForLead: [],
        stripeSessionId: sessionId,
      }),
    ).toEqual({
      runInquiry: true,
      runClientReceipt: true,
      reason: "first_delivery",
    });
  });

  it("recovers inquiry + receipt on redelivery when inquiry is missing and receipt unmarked", () => {
    expect(
      planCommerceWebhookSideEffects({
        alreadyRecorded: true,
        inquiriesForLead: [
          { source: "contact_form", message: "Unrelated" },
        ],
        stripeSessionId: sessionId,
      }),
    ).toEqual({
      runInquiry: true,
      runClientReceipt: true,
      reason: "redelivery_recovery",
    });
  });

  it("recovers only the client receipt when inquiry exists but receipt marker is missing", () => {
    expect(
      planCommerceWebhookSideEffects({
        alreadyRecorded: true,
        inquiriesForLead: [
          {
            source: "commerce_checkout",
            message: `Paid order via Buy now: Latte ($5.00) — Stripe session ${sessionId}, SKU sku_1.`,
          },
        ],
        stripeSessionId: sessionId,
        clientReceiptAlreadySent: false,
      }),
    ).toEqual({
      runInquiry: false,
      runClientReceipt: true,
      reason: "redelivery_recovery",
    });
  });

  it("recovers only the inquiry when receipt marker exists but inquiry is missing", () => {
    expect(
      planCommerceWebhookSideEffects({
        alreadyRecorded: true,
        inquiriesForLead: [],
        stripeSessionId: sessionId,
        clientReceiptAlreadySent: true,
      }),
    ).toEqual({
      runInquiry: true,
      runClientReceipt: false,
      reason: "redelivery_recovery",
    });
  });

  it("skips both when inquiry exists and receipt marker is set", () => {
    expect(
      planCommerceWebhookSideEffects({
        alreadyRecorded: true,
        inquiriesForLead: [
          {
            source: "commerce_checkout",
            message: `Paid order via Buy now: Latte ($5.00) — Stripe session ${sessionId}, SKU sku_1.`,
          },
        ],
        stripeSessionId: sessionId,
        clientReceiptAlreadySent: true,
      }),
    ).toEqual({
      runInquiry: false,
      runClientReceipt: false,
      reason: "already_notified",
    });
  });

  it("skips receipt (but not inquiry) on first delivery if receipt somehow already marked", () => {
    expect(
      planCommerceWebhookSideEffects({
        alreadyRecorded: false,
        inquiriesForLead: [],
        stripeSessionId: sessionId,
        clientReceiptAlreadySent: true,
      }),
    ).toEqual({
      runInquiry: true,
      runClientReceipt: false,
      reason: "first_delivery",
    });
  });

  it("truncation regression: newest-50 page can miss an older commerce_checkout notify", () => {
    // Simulate listClientInquiriesBySlug(50)'s newest-first page: 50 fresh
    // contact_form rows hide the older commerce_checkout that embeds the
    // session id. Feeding that page into planCommerceWebhookSideEffects
    // falsely recovers the inquiry. The uncapped commerce_checkout-only list
    // still sees the notify; receipt recovery stays independent via the marker.
    const olderSessionId = "cs_test_older_buy_now";
    const olderCommerceCheckout = {
      source: "commerce_checkout" as const,
      message: `Paid order via Buy now: Latte ($5.00) — Stripe session ${olderSessionId}, SKU sku_1.`,
    };
    const newestFiftyPage = Array.from({ length: 50 }, (_, i) => ({
      source: "contact_form" as const,
      message: `Contact form message ${i}`,
    }));
    const commerceCheckoutOnly = [olderCommerceCheckout];

    expect(
      hasCommerceCheckoutInquiryForSession(newestFiftyPage, olderSessionId),
    ).toBe(false);
    expect(
      planCommerceWebhookSideEffects({
        alreadyRecorded: true,
        inquiriesForLead: newestFiftyPage,
        stripeSessionId: olderSessionId,
        clientReceiptAlreadySent: true,
      }),
    ).toEqual({
      runInquiry: true,
      runClientReceipt: false,
      reason: "redelivery_recovery",
    });

    expect(
      hasCommerceCheckoutInquiryForSession(commerceCheckoutOnly, olderSessionId),
    ).toBe(true);
    expect(
      planCommerceWebhookSideEffects({
        alreadyRecorded: true,
        inquiriesForLead: commerceCheckoutOnly,
        stripeSessionId: olderSessionId,
        clientReceiptAlreadySent: true,
      }),
    ).toEqual({
      runInquiry: false,
      runClientReceipt: false,
      reason: "already_notified",
    });
  });
});
