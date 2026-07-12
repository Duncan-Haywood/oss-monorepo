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
});
