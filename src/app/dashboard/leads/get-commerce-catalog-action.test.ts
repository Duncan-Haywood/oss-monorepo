import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for getCommerceCatalogAction — the operator
 * Commerce catalog read path that seeds the Save/Sync panel.
 *
 * catalog.test.ts / catalog-persist.test.ts / save + sync action suites cover
 * eligibility, normalize, preserve Stripe ids, and requireConvex writes. This
 * suite locks the thin dashboard read glue: requireOperatorAuth, the per-IP
 * rate limit (see dashboard-action-rate-limit-gaps; auth alone is not a
 * throttle), empty slug, getCommerceCatalog pass-through (row or null), and
 * Error / non-Error throws.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const headersMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => headersMock(...args),
}));

function headerStore(entries: Record<string, string | null> = {}) {
  return {
    get(name: string) {
      return entries[name] ?? null;
    },
  };
}

const getCommerceCatalog = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: vi.fn(),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: (...args: unknown[]) => getCommerceCatalog(...args),
  updateLeadStage: vi.fn(),
  upsertLead: vi.fn(),
  updateClientInquiryStatus: vi.fn(),
  getClientInquiryById: vi.fn(),
  recordClientInquiryReply: vi.fn(),
  getLeads: vi.fn(),
  listOrders: vi.fn(),
  listOrdersByLeadSlug: vi.fn(),
  recordLeadOutreach: vi.fn(),
  listUnrepliedInquiries: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: vi.fn(),
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: vi.fn(),
  getMarketingPack: vi.fn(),
  upsertCommerceCatalog: vi.fn(),
  listCommerceCatalogs: vi.fn(),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
}));

const sampleCatalog = {
  id: "cat_1",
  leadSlug: "demo-cafe",
  updatedAt: "2026-07-14T10:00:00.000Z",
  items: [
    {
      id: "sku_latte",
      name: "Latte",
      description: "12oz",
      priceCents: 450,
      stripeProductId: "prod_existing",
      stripePriceId: "price_existing",
    },
  ],
};

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("getCommerceCatalogAction", () => {
  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    getCommerceCatalog.mockReset().mockResolvedValue(sampleCatalog);
  });

  it("returns auth error without loading the catalog", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { getCommerceCatalogAction } = await import("./actions");
    const res = await getCommerceCatalogAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getCommerceCatalog).not.toHaveBeenCalled();
  });

  it("rate-limits repeated catalog reads from the same IP (auth alone is not a throttle)", async () => {
    const { getCommerceCatalogAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await getCommerceCatalogAction("demo-cafe");
      expect(res.success).toBe(true);
    }
    getCommerceCatalog.mockClear();
    const res = await getCommerceCatalogAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getCommerceCatalog).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { getCommerceCatalogAction } = await import("./actions");
    const res = await getCommerceCatalogAction("");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getCommerceCatalog).not.toHaveBeenCalled();
  });

  it("returns success with null when no catalog row exists", async () => {
    getCommerceCatalog.mockResolvedValue(null);
    const { getCommerceCatalogAction } = await import("./actions");
    const res = await getCommerceCatalogAction("demo-cafe");
    expect(res).toEqual({ success: true, catalog: null });
    expect(getCommerceCatalog).toHaveBeenCalledWith("demo-cafe");
  });

  it("returns the catalog row for the requested slug", async () => {
    const { getCommerceCatalogAction } = await import("./actions");
    const res = await getCommerceCatalogAction("demo-cafe");
    expect(res).toEqual({ success: true, catalog: sampleCatalog });
    expect(getCommerceCatalog).toHaveBeenCalledOnce();
    expect(getCommerceCatalog).toHaveBeenCalledWith("demo-cafe");
  });

  it("surfaces unexpected read errors as action failures", async () => {
    getCommerceCatalog.mockRejectedValue(new Error("convex timeout"));
    const { getCommerceCatalogAction } = await import("./actions");
    const res = await getCommerceCatalogAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "convex timeout",
    });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "getCommerceCatalogAction",
    });
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    getCommerceCatalog.mockRejectedValue("boom");
    const { getCommerceCatalogAction } = await import("./actions");
    const res = await getCommerceCatalogAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
  });
});
