import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import { RESEND_WEBHOOK_SUPPRESSION_CONVEX_PRIMARY } from "@/lib/email/suppression-persist";

const suppressEmail = vi.fn();

vi.mock("@/lib/db", () => ({
  suppressEmail: (...args: unknown[]) => suppressEmail(...args),
}));

const SECRET = "whsec_" + Buffer.from("test-signing-key-bytes").toString("base64");
const NOW_SECONDS = Math.floor(Date.now() / 1000);

function sign(id: string, timestampSeconds: number, body: string): string {
  const digest = createHmac("sha256", Buffer.from(SECRET.slice("whsec_".length), "base64"))
    .update(`${id}.${timestampSeconds}.${body}`)
    .digest("base64");
  return `v1,${digest}`;
}

function signedRequest(body: string, overrides?: { id?: string; timestamp?: number; signature?: string }) {
  const id = overrides?.id ?? "msg_1";
  const timestamp = overrides?.timestamp ?? NOW_SECONDS;
  const signature = overrides?.signature ?? sign(id, timestamp, body);
  return new Request("http://localhost/api/resend/webhook", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": signature,
      "x-forwarded-for": "203.0.113.9",
    },
  });
}

describe("POST /api/resend/webhook", () => {
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

  beforeEach(() => {
    suppressEmail.mockReset();
    suppressEmail.mockResolvedValue(undefined);
    resetRateLimiterForTests();
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.RESEND_WEBHOOK_SECRET;
    } else {
      process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
    vi.resetModules();
  });

  it("returns 501 and never verifies/suppresses when RESEND_WEBHOOK_SECRET is unset", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { POST } = await import("./route");
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@example.com"] } });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(501);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("returns 400 and never suppresses on an invalid signature", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@example.com"] } });
    const response = await POST(signedRequest(body, { signature: "v1,not-the-real-signature" }));

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("returns 400 and never suppresses when the signed body is not valid JSON", async () => {
    const { POST } = await import("./route");
    const body = "not json";
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(400);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("suppresses the recipient on a permanent email.bounced event", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({
      type: "email.bounced",
      data: { to: ["bounced@example.com"], bounce: { type: "Permanent" } },
    });
    const response = await POST(signedRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });
    expect(suppressEmail).toHaveBeenCalledWith(
      "bounced@example.com",
      RESEND_WEBHOOK_SUPPRESSION_CONVEX_PRIMARY,
    );
  });

  it("suppresses the recipient on email.bounced with no bounce.type (conservative default)", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["bounced@example.com"] } });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(suppressEmail).toHaveBeenCalledWith(
      "bounced@example.com",
      RESEND_WEBHOOK_SUPPRESSION_CONVEX_PRIMARY,
    );
  });

  it("does not suppress on a Transient bounce", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({
      type: "email.bounced",
      data: { to: ["temp@example.com"], bounce: { type: "Transient" } },
    });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("suppresses the recipient on email.complained", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({ type: "email.complained", data: { to: ["angry@example.com"] } });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(suppressEmail).toHaveBeenCalledWith(
      "angry@example.com",
      RESEND_WEBHOOK_SUPPRESSION_CONVEX_PRIMARY,
    );
  });

  it("acknowledges 200 without suppressing on an unrelated event type", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({ type: "email.delivered", data: { to: ["ok@example.com"] } });
    const response = await POST(signedRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("acknowledges 200 without suppressing when a bounced event has no recipient address", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({ type: "email.bounced", data: {} });
    const response = await POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(suppressEmail).not.toHaveBeenCalled();
  });

  it("returns 500 (so Resend retries) when the suppression write fails", async () => {
    suppressEmail.mockRejectedValueOnce(new Error("db unavailable"));
    const { POST } = await import("./route");
    const body = JSON.stringify({ type: "email.complained", data: { to: ["angry@example.com"] } });
    const response = await POST(signedRequest(body));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.received).toBe(false);
  });

  it("rate-limits after DEFAULT-exceeding volume from one IP, without ever un-verifying a real signature", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({ type: "email.delivered", data: { to: ["ok@example.com"] } });

    for (let i = 0; i < 120; i++) {
      const response = await POST(signedRequest(body, { id: `msg_${i}` }));
      expect(response.status).toBe(200);
    }

    const limited = await POST(signedRequest(body, { id: "msg_120" }));
    expect(limited.status).toBe(429);
  });
});
