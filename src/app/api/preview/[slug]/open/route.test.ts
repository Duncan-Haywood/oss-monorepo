import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_OPEN_CONVEX_PRIMARY } from "@/lib/leads/preview-open-persist";

const getLeadBySlug = vi.fn();
const recordLeadPreviewOpen = vi.fn();
const captureError = vi.fn();

vi.mock("@/lib/db", () => ({
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  recordLeadPreviewOpen: (...args: unknown[]) => recordLeadPreviewOpen(...args),
}));

vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("POST /api/preview/[slug]/open — requireConvex", () => {
  beforeEach(() => {
    getLeadBySlug.mockReset();
    recordLeadPreviewOpen.mockReset();
    captureError.mockReset().mockResolvedValue(undefined);
    getLeadBySlug.mockResolvedValue({
      slug: "demo-cafe",
      stage: "outreach_sent",
      lastPreviewOpenAt: undefined,
    });
    recordLeadPreviewOpen.mockResolvedValue({ recorded: true });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("passes PREVIEW_OPEN_CONVEX_PRIMARY to recordLeadPreviewOpen", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/preview/demo-cafe/open?src=outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, recorded: true });
    expect(recordLeadPreviewOpen).toHaveBeenCalledWith(
      "demo-cafe",
      expect.any(String),
      PREVIEW_OPEN_CONVEX_PRIMARY,
    );
  });

  it("returns 503 when ConvexPrimaryWriteError is thrown, and reports it via captureError (persist_failed)", async () => {
    // Import the same module instance the route will use after resetModules,
    // otherwise instanceof fails across duplicate class identities.
    const { ConvexPrimaryWriteError } = await import(
      "@/lib/payments/convex-primary"
    );
    const persistError = new ConvexPrimaryWriteError("recordLeadPreviewOpen", new Error("boom"));
    recordLeadPreviewOpen.mockRejectedValue(persistError);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/preview/demo-cafe/open?src=outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.recorded).toBe(false);
    expect(json.reason).toBe("persist_failed");
    expect(captureError).toHaveBeenCalledWith(persistError, {
      component: "preview-open",
      failureKind: "persist_failed",
    });
  });

  it("rethrows a non-ConvexPrimaryWriteError after reporting it via captureError", async () => {
    const unexpectedError = new Error("unexpected db outage");
    recordLeadPreviewOpen.mockRejectedValue(unexpectedError);
    const { POST } = await import("./route");

    await expect(
      POST(
        new Request("http://localhost/api/preview/demo-cafe/open?src=outreach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        { params: Promise.resolve({ slug: "demo-cafe" }) },
      ),
    ).rejects.toThrow("unexpected db outage");

    expect(captureError).toHaveBeenCalledWith(unexpectedError, {
      component: "preview-open",
      failureKind: "persist_failed",
    });
  });

  it("returns 429 with Retry-After once a client IP exceeds the rate limit", async () => {
    const { POST } = await import("./route");
    const request = () =>
      new Request("http://localhost/api/preview/demo-cafe/open?src=outreach", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.12",
        },
        body: "{}",
      });

    let lastResponse;
    for (let i = 0; i < 21; i += 1) {
      lastResponse = await POST(request(), {
        params: Promise.resolve({ slug: "demo-cafe" }),
      });
    }

    expect(lastResponse!.status).toBe(429);
    expect(lastResponse!.headers.get("Retry-After")).toBeTruthy();
    const json = await lastResponse!.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("rate_limited");
    // The 21st request never reached the persistence layer.
    expect(recordLeadPreviewOpen).toHaveBeenCalledTimes(20);
  });

  it("falls back over-long body.openedAt to a short server ISO (no 400)", async () => {
    const { POST } = await import("./route");
    const overLong = `${"2".repeat(200)}Z`;
    const response = await POST(
      new Request("http://localhost/api/preview/demo-cafe/open?src=outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ openedAt: overLong }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, recorded: true });
    expect(recordLeadPreviewOpen).toHaveBeenCalledTimes(1);
    const persistedOpenedAt = recordLeadPreviewOpen.mock.calls[0]?.[1] as string;
    // Fall-back uses server now — must stay a short ISO, never the probe body.
    expect(persistedOpenedAt.length).toBeLessThanOrEqual(64);
    expect(persistedOpenedAt).not.toBe(overLong);
    expect(Number.isNaN(Date.parse(persistedOpenedAt))).toBe(false);
  });

  it("clamps an implausibly old spoofed openedAt to server now before persisting", async () => {
    const { POST } = await import("./route");
    const spoofedPast = "2001-01-01T00:00:00.000Z";
    const response = await POST(
      new Request("http://localhost/api/preview/demo-cafe/open?src=outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ openedAt: spoofedPast }),
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, recorded: true });
    expect(recordLeadPreviewOpen).toHaveBeenCalledTimes(1);
    const persistedOpenedAt = recordLeadPreviewOpen.mock.calls[0]?.[1] as string;
    // An unbounded-past checkpoint would let every later call see real "now"
    // minus an ancient lastPreviewOpenAt, permanently clearing the 30-minute
    // debounce — the persisted value must stay close to real server time.
    expect(persistedOpenedAt).not.toBe(spoofedPast);
    expect(Math.abs(Date.now() - Date.parse(persistedOpenedAt))).toBeLessThan(60_000);
  });

  it("returns 400 when the raw JSON body exceeds MAX_PUBLIC_JSON_BODY_BYTES", async () => {
    const { MAX_PUBLIC_JSON_BODY_BYTES } = await import(
      "@/lib/security/json-body"
    );
    const { POST } = await import("./route");
    const huge = JSON.stringify({
      openedAt: new Date().toISOString(),
      pad: "p".repeat(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    const response = await POST(
      new Request("http://localhost/api/preview/demo-cafe/open?src=outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: huge,
      }),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("body_too_large");
    expect(recordLeadPreviewOpen).not.toHaveBeenCalled();
  });

  it("treats over-long src as missing (not_attributed when stage does not qualify)", async () => {
    getLeadBySlug.mockResolvedValue({
      slug: "demo-cafe",
      stage: "discovered",
      lastPreviewOpenAt: undefined,
    });
    const { POST } = await import("./route");
    const overLongSrc = `outreach${"x".repeat(40)}`;
    const response = await POST(
      new Request(
        `http://localhost/api/preview/demo-cafe/open?src=${encodeURIComponent(overLongSrc)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      ),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, recorded: false, reason: "not_attributed" });
    expect(recordLeadPreviewOpen).not.toHaveBeenCalled();
  });

  it("treats over-long utm_source as missing (not_attributed when stage does not qualify)", async () => {
    getLeadBySlug.mockResolvedValue({
      slug: "demo-cafe",
      stage: "discovered",
      lastPreviewOpenAt: undefined,
    });
    const { POST } = await import("./route");
    const overLongUtm = `email${"y".repeat(40)}`;
    const response = await POST(
      new Request(
        `http://localhost/api/preview/demo-cafe/open?utm_source=${encodeURIComponent(overLongUtm)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      ),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, recorded: false, reason: "not_attributed" });
    expect(recordLeadPreviewOpen).not.toHaveBeenCalled();
  });

  it("still records when over-long src but in-pipeline stage qualifies", async () => {
    getLeadBySlug.mockResolvedValue({
      slug: "demo-cafe",
      stage: "outreach_sent",
      lastPreviewOpenAt: undefined,
    });
    const { POST } = await import("./route");
    const overLongSrc = `outreach${"z".repeat(40)}`;
    const response = await POST(
      new Request(
        `http://localhost/api/preview/demo-cafe/open?src=${encodeURIComponent(overLongSrc)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      ),
      { params: Promise.resolve({ slug: "demo-cafe" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, recorded: true });
    expect(recordLeadPreviewOpen).toHaveBeenCalledTimes(1);
  });
});
