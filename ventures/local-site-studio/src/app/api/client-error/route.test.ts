import { beforeEach, describe, expect, it, vi } from "vitest";

const captureError = vi.fn();

vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("POST /api/client-error", () => {
  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
  });

  it("forwards a well-formed report to captureError with an Error carrying message/stack", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "boom",
          stack: "Error: boom\n    at Component (app.js:1:1)",
          digest: "abc123",
          boundary: "global-error",
          path: "/dashboard/leads",
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(captureError).toHaveBeenCalledTimes(1);
    const [reportedError, context] = captureError.mock.calls[0]!;
    expect(reportedError).toBeInstanceOf(Error);
    expect((reportedError as Error).message).toBe("boom");
    expect((reportedError as Error).stack).toBe("Error: boom\n    at Component (app.js:1:1)");
    expect(context).toEqual({
      component: "client-error-boundary",
      boundary: "global-error",
      digest: "abc123",
      path: "/dashboard/leads",
    });
  });

  it("falls back to a placeholder message and 'unknown' boundary when fields are missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(captureError).toHaveBeenCalledTimes(1);
    const [reportedError, context] = captureError.mock.calls[0]!;
    expect((reportedError as Error).message).toBe("Unknown client error");
    expect(context).toMatchObject({
      component: "client-error-boundary",
      boundary: "unknown",
    });
  });

  it("ignores non-string fields rather than forwarding them", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: 12345,
          stack: { evil: true },
          digest: ["nope"],
          boundary: 7,
          path: null,
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    const [reportedError, context] = captureError.mock.calls[0]!;
    expect((reportedError as Error).message).toBe("Unknown client error");
    // A non-string stack must never be assigned onto the reconstructed
    // Error — it keeps its own real JS stack trace instead.
    expect(typeof (reportedError as Error).stack).toBe("string");
    expect(context).toEqual({
      component: "client-error-boundary",
      boundary: "unknown",
      digest: undefined,
      path: undefined,
    });
  });

  it("returns 200 with no captureError call on an over-large body (fire-and-forget, no retry contract)", async () => {
    const { MAX_PUBLIC_JSON_BODY_BYTES } = await import("@/lib/security/json-body");
    const { POST } = await import("./route");
    const huge = JSON.stringify({
      message: "boom",
      pad: "p".repeat(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    const response = await POST(
      new Request("http://localhost/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: huge,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(captureError).not.toHaveBeenCalled();
  });

  it("returns 200 with no captureError call on an empty/invalid body", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(captureError).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After once a client IP exceeds the rate limit", async () => {
    const { POST } = await import("./route");
    const request = () =>
      new Request("http://localhost/api/client-error", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.55",
        },
        body: JSON.stringify({ message: "boom" }),
      });

    let lastResponse;
    for (let i = 0; i < 21; i += 1) {
      lastResponse = await POST(request());
    }

    expect(lastResponse!.status).toBe(429);
    expect(lastResponse!.headers.get("Retry-After")).toBeTruthy();
    const json = await lastResponse!.json();
    expect(json).toEqual({ ok: false, reason: "rate_limited" });
    // The 21st request never reached captureError.
    expect(captureError).toHaveBeenCalledTimes(20);
  });
});
