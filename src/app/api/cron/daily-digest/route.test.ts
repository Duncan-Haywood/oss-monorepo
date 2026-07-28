import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";

/**
 * GET /api/cron/daily-digest — the automated trigger for the operator daily
 * digest (see operator-daily-digest-cron-automation in BUSINESS_DECISIONS).
 * Locks: CRON_SECRET bearer-auth gate (constant-time, fails closed when
 * unset), OPERATOR_DIGEST_EMAIL gate, per-IP rate limiting after auth, and
 * delegation to sendOperatorDigestEmail (already covered directly by
 * send-operator-digest.test.ts) for the actual send/failure shaping.
 */

const sendOperatorDigestEmail = vi.fn();
vi.mock("@/lib/digest/send-operator-digest", () => ({
  sendOperatorDigestEmail: (...args: unknown[]) => sendOperatorDigestEmail(...args),
}));

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

const recordCronRunOutcome = vi.fn();
vi.mock("@/lib/db", () => ({
  recordCronRunOutcome: (...args: unknown[]) => recordCronRunOutcome(...args),
}));

function cronRequest(options?: { bearer?: string; ip?: string }) {
  const headers: Record<string, string> = { "x-forwarded-for": options?.ip ?? "203.0.113.9" };
  if (options?.bearer !== undefined) {
    headers.authorization = `Bearer ${options.bearer}`;
  }
  return new Request("http://localhost/api/cron/daily-digest", { headers });
}

describe("GET /api/cron/daily-digest", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    resetRateLimiterForTests();
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = "test-cron-secret-value";
    process.env.OPERATOR_DIGEST_EMAIL = "ops@example.com";
    sendOperatorDigestEmail.mockReset().mockResolvedValue({
      success: true,
      mock: true,
      digest: { isEmpty: true },
    });
    captureError.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 501 and never calls the sender when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "anything" }));
    expect(response.status).toBe(501);
    expect(sendOperatorDigestEmail).not.toHaveBeenCalled();
  });

  it("returns 401 and never calls the sender with no Authorization header", async () => {
    const { GET } = await import("./route");
    const response = await GET(cronRequest());
    expect(response.status).toBe(401);
    expect(sendOperatorDigestEmail).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong bearer token of a different length", async () => {
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "wrong-secret" }));
    expect(response.status).toBe(401);
    expect(sendOperatorDigestEmail).not.toHaveBeenCalled();
  });

  it("returns 401 for a same-length wrong bearer token (exercises the byte compare, not just the length check)", async () => {
    const wrongSameLength = "x".repeat(process.env.CRON_SECRET!.length);
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: wrongSameLength }));
    expect(response.status).toBe(401);
    expect(sendOperatorDigestEmail).not.toHaveBeenCalled();
  });

  it("returns 401 for an over-length bearer token without ever Buffer-allocating it", async () => {
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "a".repeat(300) }));
    expect(response.status).toBe(401);
    expect(sendOperatorDigestEmail).not.toHaveBeenCalled();
  });

  it("returns 501 and never calls the sender when OPERATOR_DIGEST_EMAIL is unset", async () => {
    delete process.env.OPERATOR_DIGEST_EMAIL;
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(501);
    expect(sendOperatorDigestEmail).not.toHaveBeenCalled();
  });

  it("delegates to sendOperatorDigestEmail and returns 200 on success", async () => {
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, mock: true });
    expect(sendOperatorDigestEmail).toHaveBeenCalledWith("ops@example.com", expect.any(String));
    expect(recordCronRunOutcome).toHaveBeenCalledWith(
      "daily-digest",
      expect.objectContaining({ success: true, atIso: expect.any(String) }),
    );
  });

  it("returns 500 and captures the error when the send fails", async () => {
    sendOperatorDigestEmail.mockResolvedValue({ success: false, error: "Resend 429" });
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: "Resend 429" });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), { component: "cron-daily-digest" });
    expect(recordCronRunOutcome).toHaveBeenCalledWith(
      "daily-digest",
      expect.objectContaining({ success: false, error: "Resend 429" }),
    );
  });

  it("returns 500 and captures the error when the helper throws", async () => {
    sendOperatorDigestEmail.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: "db unavailable" });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), { component: "cron-daily-digest" });
    expect(recordCronRunOutcome).toHaveBeenCalledWith(
      "daily-digest",
      expect.objectContaining({ success: false, error: "db unavailable" }),
    );
  });

  it("rate-limits repeated calls from the same IP after auth succeeds", async () => {
    const { GET } = await import("./route");
    for (let i = 0; i < 5; i++) {
      const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
      expect(response.status).toBe(200);
    }
    sendOperatorDigestEmail.mockClear();
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(429);
    expect(sendOperatorDigestEmail).not.toHaveBeenCalled();
  });
});
