import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_OPEN_CONVEX_PRIMARY } from "@/lib/leads/preview-open-persist";

const getLeadBySlug = vi.fn();
const recordLeadPreviewOpen = vi.fn();

vi.mock("@/lib/db", () => ({
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  recordLeadPreviewOpen: (...args: unknown[]) => recordLeadPreviewOpen(...args),
}));

describe("POST /api/preview/[slug]/open — requireConvex", () => {
  beforeEach(() => {
    getLeadBySlug.mockReset();
    recordLeadPreviewOpen.mockReset();
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

  it("returns 503 when ConvexPrimaryWriteError is thrown", async () => {
    // Import the same module instance the route will use after resetModules,
    // otherwise instanceof fails across duplicate class identities.
    const { ConvexPrimaryWriteError } = await import(
      "@/lib/payments/convex-primary"
    );
    recordLeadPreviewOpen.mockRejectedValue(
      new ConvexPrimaryWriteError("recordLeadPreviewOpen", new Error("boom")),
    );
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
});
