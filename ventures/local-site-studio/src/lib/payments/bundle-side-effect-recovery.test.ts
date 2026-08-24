import { describe, expect, it } from "vitest";
import {
  bundleDnsHandoffEmailSentNote,
  bundleReceiptEmailSentNote,
  hasBundleDnsHandoffEmailNote,
  hasBundleReceiptEmailNote,
  handoffNoteMentionsStripeSession,
  isBundleHandoffMissingBuyerEmail,
  planBundleWebhookSideEffects,
} from "./bundle-side-effect-recovery";

describe("bundle sent-note helpers", () => {
  const sessionId = "cs_test_bundle_abc";

  it("embeds the session id in stable markers", () => {
    expect(bundleReceiptEmailSentNote(sessionId)).toBe(
      `Buyer receipt email sent — Stripe session ${sessionId}`,
    );
    expect(bundleDnsHandoffEmailSentNote(sessionId)).toBe(
      `DNS handoff email sent — Stripe session ${sessionId}`,
    );
  });

  it("handoffNoteMentionsStripeSession rejects empty ids", () => {
    expect(handoffNoteMentionsStripeSession(`Stripe session ${sessionId}`, "")).toBe(
      false,
    );
  });

  it("detects receipt and DNS notes independently", () => {
    const receipt = bundleReceiptEmailSentNote(sessionId);
    const dns = bundleDnsHandoffEmailSentNote(sessionId);
    expect(hasBundleReceiptEmailNote([receipt], sessionId)).toBe(true);
    expect(hasBundleDnsHandoffEmailNote([receipt], sessionId)).toBe(false);
    expect(hasBundleDnsHandoffEmailNote([dns], sessionId)).toBe(true);
    expect(hasBundleReceiptEmailNote([dns], sessionId)).toBe(false);
    expect(
      hasBundleReceiptEmailNote(
        ["Payment received — production handoff queued."],
        sessionId,
      ),
    ).toBe(false);
  });

  it("does not match a different session's markers", () => {
    expect(
      hasBundleReceiptEmailNote(
        [bundleReceiptEmailSentNote("cs_other")],
        sessionId,
      ),
    ).toBe(false);
  });
});

describe("planBundleWebhookSideEffects", () => {
  const sessionId = "cs_test_recover_bundle";

  it("runs both emails on first delivery when no sent markers", () => {
    expect(
      planBundleWebhookSideEffects({
        alreadyRecorded: false,
        handoffNotes: ["Payment received — production handoff queued."],
        stripeSessionId: sessionId,
        hasCustomerEmail: true,
      }),
    ).toEqual({
      runReceiptEmail: true,
      runDnsHandoffEmail: true,
      reason: "first_delivery",
    });
  });

  it("recovers both on redelivery when markers are missing", () => {
    expect(
      planBundleWebhookSideEffects({
        alreadyRecorded: true,
        handoffNotes: ["Payment received — production handoff queued."],
        stripeSessionId: sessionId,
        hasCustomerEmail: true,
      }),
    ).toEqual({
      runReceiptEmail: true,
      runDnsHandoffEmail: true,
      reason: "redelivery_recovery",
    });
  });

  it("recovers only DNS when receipt marker already exists", () => {
    expect(
      planBundleWebhookSideEffects({
        alreadyRecorded: true,
        handoffNotes: [bundleReceiptEmailSentNote(sessionId)],
        stripeSessionId: sessionId,
        hasCustomerEmail: true,
      }),
    ).toEqual({
      runReceiptEmail: false,
      runDnsHandoffEmail: true,
      reason: "redelivery_recovery",
    });
  });

  it("recovers only receipt when DNS marker already exists", () => {
    expect(
      planBundleWebhookSideEffects({
        alreadyRecorded: true,
        handoffNotes: [bundleDnsHandoffEmailSentNote(sessionId)],
        stripeSessionId: sessionId,
        hasCustomerEmail: true,
      }),
    ).toEqual({
      runReceiptEmail: true,
      runDnsHandoffEmail: false,
      reason: "redelivery_recovery",
    });
  });

  it("skips both when both markers already exist", () => {
    expect(
      planBundleWebhookSideEffects({
        alreadyRecorded: true,
        handoffNotes: [
          bundleReceiptEmailSentNote(sessionId),
          bundleDnsHandoffEmailSentNote(sessionId),
        ],
        stripeSessionId: sessionId,
        hasCustomerEmail: true,
      }),
    ).toEqual({
      runReceiptEmail: false,
      runDnsHandoffEmail: false,
      reason: "already_notified",
    });
  });

  it("skips both when there is no customer email", () => {
    expect(
      planBundleWebhookSideEffects({
        alreadyRecorded: false,
        handoffNotes: [],
        stripeSessionId: sessionId,
        hasCustomerEmail: false,
      }),
    ).toEqual({
      runReceiptEmail: false,
      runDnsHandoffEmail: false,
      reason: "no_customer_email",
    });
  });
});

describe("isBundleHandoffMissingBuyerEmail", () => {
  const sessionId = "cs_test_bundle_missing_buyer_email";

  it("is true when no marker exists and a customer email is on file", () => {
    expect(
      isBundleHandoffMissingBuyerEmail({
        customerEmail: "buyer@example.com",
        stripeSessionId: sessionId,
        notes: [],
      }),
    ).toBe(true);
  });

  it("is true when only the receipt marker exists (DNS still missing)", () => {
    expect(
      isBundleHandoffMissingBuyerEmail({
        customerEmail: "buyer@example.com",
        stripeSessionId: sessionId,
        notes: [bundleReceiptEmailSentNote(sessionId)],
      }),
    ).toBe(true);
  });

  it("is true when only the DNS marker exists (receipt still missing)", () => {
    expect(
      isBundleHandoffMissingBuyerEmail({
        customerEmail: "buyer@example.com",
        stripeSessionId: sessionId,
        notes: [bundleDnsHandoffEmailSentNote(sessionId)],
      }),
    ).toBe(true);
  });

  it("is false once both markers exist", () => {
    expect(
      isBundleHandoffMissingBuyerEmail({
        customerEmail: "buyer@example.com",
        stripeSessionId: sessionId,
        notes: [
          bundleReceiptEmailSentNote(sessionId),
          bundleDnsHandoffEmailSentNote(sessionId),
        ],
      }),
    ).toBe(false);
  });

  it("is false with no customer email on file, even with no markers", () => {
    expect(
      isBundleHandoffMissingBuyerEmail({
        customerEmail: "",
        stripeSessionId: sessionId,
        notes: [],
      }),
    ).toBe(false);
  });

  it("is false with a whitespace-only customer email", () => {
    expect(
      isBundleHandoffMissingBuyerEmail({
        customerEmail: "   ",
        stripeSessionId: sessionId,
        notes: [],
      }),
    ).toBe(false);
  });
});
