import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_RESEND_WEBHOOK_ID_LENGTH,
  MAX_RESEND_WEBHOOK_SIGNATURE_LENGTH,
  RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
  isComplaintEvent,
  isPermanentBounceEvent,
  resendWebhookRecipientEmail,
  verifyResendWebhookSignature,
} from "./resend-webhook";

const SECRET = "whsec_" + Buffer.from("test-signing-key-bytes").toString("base64");
const NOW_SECONDS = 1_800_000_000;

function sign(id: string, timestampSeconds: number, body: string, secret = SECRET): string {
  const withoutPrefix = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const digest = createHmac("sha256", Buffer.from(withoutPrefix, "base64"))
    .update(`${id}.${timestampSeconds}.${body}`)
    .digest("base64");
  return `v1,${digest}`;
}

describe("verifyResendWebhookSignature", () => {
  it("accepts a validly-signed request", () => {
    const body = JSON.stringify({ type: "email.bounced" });
    const timestamp = String(NOW_SECONDS);
    const signature = sign("msg_1", NOW_SECONDS, body);
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp, signature },
        body,
        NOW_SECONDS,
      ),
    ).toBe(true);
  });

  it("accepts when the valid v1 entry is one of several space-separated candidates", () => {
    const body = "{}";
    const timestamp = String(NOW_SECONDS);
    const real = sign("msg_1", NOW_SECONDS, body);
    const signature = `v2,garbage ${real} v1,anothergarbage==`;
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp, signature },
        body,
        NOW_SECONDS,
      ),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ type: "email.bounced" });
    const timestamp = String(NOW_SECONDS);
    const signature = sign("msg_1", NOW_SECONDS, body);
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp, signature },
        JSON.stringify({ type: "email.complained" }),
        NOW_SECONDS,
      ),
    ).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const body = "{}";
    const timestamp = String(NOW_SECONDS);
    const signature = sign("msg_1", NOW_SECONDS, body, "whsec_" + Buffer.from("other-key").toString("base64"));
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp, signature },
        body,
        NOW_SECONDS,
      ),
    ).toBe(false);
  });

  it("rejects a mismatched id (signature bound to a different id)", () => {
    const body = "{}";
    const timestamp = String(NOW_SECONDS);
    const signature = sign("msg_1", NOW_SECONDS, body);
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_2", timestamp, signature },
        body,
        NOW_SECONDS,
      ),
    ).toBe(false);
  });

  it("rejects a timestamp older than the tolerance window", () => {
    const body = "{}";
    const staleTimestamp = NOW_SECONDS - RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS - 1;
    const signature = sign("msg_1", staleTimestamp, body);
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp: String(staleTimestamp), signature },
        body,
        NOW_SECONDS,
      ),
    ).toBe(false);
  });

  it("rejects a timestamp further in the future than the tolerance window", () => {
    const body = "{}";
    const futureTimestamp = NOW_SECONDS + RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS + 1;
    const signature = sign("msg_1", futureTimestamp, body);
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp: String(futureTimestamp), signature },
        body,
        NOW_SECONDS,
      ),
    ).toBe(false);
  });

  it("accepts a timestamp exactly at the tolerance boundary", () => {
    const body = "{}";
    const boundaryTimestamp = NOW_SECONDS - RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
    const signature = sign("msg_1", boundaryTimestamp, body);
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp: String(boundaryTimestamp), signature },
        body,
        NOW_SECONDS,
      ),
    ).toBe(true);
  });

  it("rejects a non-numeric timestamp", () => {
    const body = "{}";
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp: "not-a-number", signature: "v1,garbage" },
        body,
        NOW_SECONDS,
      ),
    ).toBe(false);
  });

  it.each([
    ["missing id", { id: null, timestamp: String(NOW_SECONDS), signature: "v1,x" }],
    ["missing timestamp", { id: "msg_1", timestamp: null, signature: "v1,x" }],
    ["missing signature", { id: "msg_1", timestamp: String(NOW_SECONDS), signature: null }],
  ])("rejects %s", (_label, headers) => {
    expect(verifyResendWebhookSignature(SECRET, headers, "{}", NOW_SECONDS)).toBe(false);
  });

  it("rejects an id longer than MAX_RESEND_WEBHOOK_ID_LENGTH without throwing", () => {
    const body = "{}";
    const longId = "m".repeat(MAX_RESEND_WEBHOOK_ID_LENGTH + 1);
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: longId, timestamp: String(NOW_SECONDS), signature: "v1,x" },
        body,
        NOW_SECONDS,
      ),
    ).toBe(false);
  });

  it("rejects a signature header longer than MAX_RESEND_WEBHOOK_SIGNATURE_LENGTH without throwing", () => {
    const body = "{}";
    const longSignature = "v1," + "x".repeat(MAX_RESEND_WEBHOOK_SIGNATURE_LENGTH + 1);
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp: String(NOW_SECONDS), signature: longSignature },
        body,
        NOW_SECONDS,
      ),
    ).toBe(false);
  });

  it("rejects malformed base64 in the signature entry without throwing", () => {
    const body = "{}";
    expect(
      verifyResendWebhookSignature(
        SECRET,
        { id: "msg_1", timestamp: String(NOW_SECONDS), signature: "v1,not valid base64!!!" },
        body,
        NOW_SECONDS,
      ),
    ).toBe(false);
  });
});

describe("isPermanentBounceEvent", () => {
  it("treats email.bounced with no bounce.type as permanent (conservative default)", () => {
    expect(isPermanentBounceEvent({ type: "email.bounced" })).toBe(true);
  });

  it("treats email.bounced with bounce.type Permanent as permanent", () => {
    expect(
      isPermanentBounceEvent({ type: "email.bounced", data: { bounce: { type: "Permanent" } } }),
    ).toBe(true);
  });

  it("is case-insensitive on bounce.type", () => {
    expect(
      isPermanentBounceEvent({ type: "email.bounced", data: { bounce: { type: "permanent" } } }),
    ).toBe(true);
  });

  it("does not treat an explicit Transient bounce as permanent", () => {
    expect(
      isPermanentBounceEvent({ type: "email.bounced", data: { bounce: { type: "Transient" } } }),
    ).toBe(false);
  });

  it("does not treat an explicit Undetermined bounce as permanent", () => {
    expect(
      isPermanentBounceEvent({
        type: "email.bounced",
        data: { bounce: { type: "Undetermined" } },
      }),
    ).toBe(false);
  });

  it("is false for an unrelated event type", () => {
    expect(isPermanentBounceEvent({ type: "email.delivered" })).toBe(false);
  });
});

describe("isComplaintEvent", () => {
  it("is true for email.complained", () => {
    expect(isComplaintEvent({ type: "email.complained" })).toBe(true);
  });

  it("is false for an unrelated event type", () => {
    expect(isComplaintEvent({ type: "email.bounced" })).toBe(false);
  });
});

describe("resendWebhookRecipientEmail", () => {
  it("returns the first entry when `to` is an array", () => {
    expect(
      resendWebhookRecipientEmail({
        type: "email.bounced",
        data: { to: ["recipient@example.com", "cc@example.com"] },
      }),
    ).toBe("recipient@example.com");
  });

  it("returns the value when `to` is a bare string", () => {
    expect(
      resendWebhookRecipientEmail({ type: "email.bounced", data: { to: "recipient@example.com" } }),
    ).toBe("recipient@example.com");
  });

  it("trims whitespace", () => {
    expect(
      resendWebhookRecipientEmail({ type: "email.bounced", data: { to: "  recipient@example.com  " } }),
    ).toBe("recipient@example.com");
  });

  it("returns null when `to` is missing", () => {
    expect(resendWebhookRecipientEmail({ type: "email.bounced" })).toBeNull();
  });

  it("returns null when `to` is an empty array", () => {
    expect(resendWebhookRecipientEmail({ type: "email.bounced", data: { to: [] } })).toBeNull();
  });

  it("returns null when `to` is a blank string", () => {
    expect(resendWebhookRecipientEmail({ type: "email.bounced", data: { to: "   " } })).toBeNull();
  });
});
