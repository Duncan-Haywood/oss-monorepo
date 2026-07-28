import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildErrorTrackingPayload,
  captureError,
  isErrorTrackingConfigured,
} from "./error-tracking";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("isErrorTrackingConfigured", () => {
  it("is false when ERROR_TRACKING_WEBHOOK_URL is unset", () => {
    expect(isErrorTrackingConfigured({})).toBe(false);
  });

  it("is false for a whitespace-only value", () => {
    expect(isErrorTrackingConfigured({ ERROR_TRACKING_WEBHOOK_URL: "   " })).toBe(false);
  });

  it("is true once a non-empty URL is set", () => {
    expect(
      isErrorTrackingConfigured({ ERROR_TRACKING_WEBHOOK_URL: "https://example.com/hook" }),
    ).toBe(true);
  });
});

describe("buildErrorTrackingPayload", () => {
  it("captures message and stack from a real Error", () => {
    const error = new Error("boom");
    const payload = buildErrorTrackingPayload(
      error,
      { component: "stripe-webhook", eventType: "checkout.session.completed" },
      "2026-07-28T00:00:00.000Z",
    );
    expect(payload.message).toBe("boom");
    expect(payload.stack).toContain("boom");
    expect(payload.component).toBe("stripe-webhook");
    expect(payload.severity).toBe("error");
    expect(payload.timestamp).toBe("2026-07-28T00:00:00.000Z");
    expect(payload.context).toEqual({ eventType: "checkout.session.completed" });
  });

  it("stringifies a non-Error thrown value and omits stack", () => {
    const payload = buildErrorTrackingPayload(
      "a string throw",
      { component: "convex-fallback" },
      "2026-07-28T00:00:00.000Z",
    );
    expect(payload.message).toBe("a string throw");
    expect(payload.stack).toBeUndefined();
  });

  it("respects an explicit severity", () => {
    const payload = buildErrorTrackingPayload(
      new Error("degraded"),
      { component: "db", severity: "warning" },
      "2026-07-28T00:00:00.000Z",
    );
    expect(payload.severity).toBe("warning");
  });

  it("truncates an oversized context string value rather than dropping it", () => {
    const longValue = "x".repeat(1000);
    const payload = buildErrorTrackingPayload(
      new Error("boom"),
      { component: "test", note: longValue },
      "2026-07-28T00:00:00.000Z",
    );
    expect((payload.context.note as string).length).toBeLessThan(600);
    expect((payload.context.note as string).endsWith("…")).toBe(true);
  });

  it("caps the number of context keys forwarded", () => {
    const extraKeys: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      extraKeys[`key${i}`] = i;
    }
    const payload = buildErrorTrackingPayload(
      new Error("boom"),
      { component: "test", ...extraKeys },
      "2026-07-28T00:00:00.000Z",
    );
    expect(Object.keys(payload.context).length).toBeLessThanOrEqual(20);
  });

  it("serializes a nested object context value instead of recursing", () => {
    const payload = buildErrorTrackingPayload(
      new Error("boom"),
      { component: "test", nested: { a: 1, b: "two" } },
      "2026-07-28T00:00:00.000Z",
    );
    expect(typeof payload.context.nested).toBe("string");
    expect(payload.context.nested).toContain('"a":1');
  });
});

describe("captureError", () => {
  it("no-ops (never calls fetch) when not configured", async () => {
    global.fetch = vi.fn();
    await captureError(new Error("boom"), { component: "test" }, {});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("POSTs the built payload to ERROR_TRACKING_WEBHOOK_URL with a bearer secret", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await captureError(
      new Error("boom"),
      { component: "stripe-webhook" },
      {
        ERROR_TRACKING_WEBHOOK_URL: "https://tracking.example.com/ingest",
        ERROR_TRACKING_WEBHOOK_SECRET: "shh",
      },
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toBe("https://tracking.example.com/ingest");
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers.authorization).toBe("Bearer shh");
    expect(calledInit.headers["content-type"]).toBe("application/json");
    // The secret must never be smuggled into the URL itself (buffer-token-header-not-query precedent).
    expect(calledUrl).not.toContain("shh");
    const body = JSON.parse(calledInit.body);
    expect(body.message).toBe("boom");
    expect(body.component).toBe("stripe-webhook");
  });

  it("omits the authorization header when no secret is configured", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await captureError(new Error("boom"), { component: "test" }, {
      ERROR_TRACKING_WEBHOOK_URL: "https://tracking.example.com/ingest",
    });
    const [, calledInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledInit.headers.authorization).toBeUndefined();
  });

  it("never throws when the URL is malformed", async () => {
    global.fetch = vi.fn();
    await expect(
      captureError(new Error("boom"), { component: "test" }, {
        ERROR_TRACKING_WEBHOOK_URL: "not a url",
      }),
    ).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("never throws when the URL is not http(s)", async () => {
    global.fetch = vi.fn();
    await expect(
      captureError(new Error("boom"), { component: "test" }, {
        ERROR_TRACKING_WEBHOOK_URL: "javascript://evil",
      }),
    ).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("never throws when fetch itself rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(
      captureError(new Error("boom"), { component: "test" }, {
        ERROR_TRACKING_WEBHOOK_URL: "https://tracking.example.com/ingest",
      }),
    ).resolves.toBeUndefined();
  });

  it("never throws on a non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(
      captureError(new Error("boom"), { component: "test" }, {
        ERROR_TRACKING_WEBHOOK_URL: "https://tracking.example.com/ingest",
      }),
    ).resolves.toBeUndefined();
  });
});
