import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for syncCommerceCatalogToStripeAction — the
 * operator Sync to Stripe path that unlocks Commerce Buy now.
 *
 * stripe-sync.test.ts covers Product/Price idempotency. This suite locks the
 * dashboard action glue: requireOperatorAuth, STRIPE_SECRET_KEY gate, empty
 * catalog gate, COMMERCE_CATALOG_CONVEX_PRIMARY persist, ConvexPrimaryWriteError
 * fail-closed (no revalidate), and success revalidate.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

const getLeadBySlug = vi.fn();
const listOrdersByLeadSlug = vi.fn();
const getCommerceCatalog = vi.fn();
const upsertCommerceCatalog = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: (...args: unknown[]) => getCommerceCatalog(...args),
  updateLeadStage: vi.fn(),
  upsertLead: vi.fn(),
  updateClientInquiryStatus: vi.fn(),
  getClientInquiryById: vi.fn(),
  recordClientInquiryReply: vi.fn(),
  getLeads: vi.fn(),
  listOrders: vi.fn(),
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  recordLeadOutreach: vi.fn(),
  listUnrepliedInquiries: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: vi.fn(),
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: vi.fn(),
  getMarketingPack: vi.fn(),
  upsertCommerceCatalog: (...args: unknown[]) => upsertCommerceCatalog(...args),
  listCommerceCatalogs: vi.fn(),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
}));

const syncCommerceCatalogToStripe = vi.fn();

vi.mock("@/lib/commerce", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/commerce")>();
  return {
    ...actual,
    syncCommerceCatalogToStripe: (...args: unknown[]) =>
      syncCommerceCatalogToStripe(...args),
  };
});

vi.mock("@/lib/commerce/catalog-persist", () => ({
  COMMERCE_CATALOG_CONVEX_PRIMARY: { requireConvex: true },
}));

class MockConvexPrimaryWriteError extends Error {
  constructor(message = "Convex primary write failed") {
    super(message);
    this.name = "ConvexPrimaryWriteError";
  }
}

vi.mock("@/lib/payments/convex-primary", () => ({
  ConvexPrimaryWriteError: MockConvexPrimaryWriteError,
}));

const stripeCtor = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(secretKey: string) {
      stripeCtor(secretKey);
    }
  },
}));

const eligibleLead = {
  slug: "demo-cafe",
  businessName: "Demo Cafe",
  category: "restaurant" as const,
  city: "Boulder",
  state: "CO",
  tagline: "Coffee and pastry",
  description: "Neighborhood cafe",
  phone: "(303) 555-0100",
  email: "hello@demo-cafe.example",
  services: ["Coffee", "Pastries"],
  hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat 8am–2pm" },
  stage: "paid" as const,
  recommendedTier: "growth" as const,
  dataSource: "manual_entry" as const,
};

const commerceOrder = {
  id: "ord_commerce_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_commerce",
  tier: "growth" as const,
  amountPaid: 899,
  currency: "usd",
  customerEmail: "owner@demo-cafe.example",
  commerceAddon: true,
  createdAt: "2026-07-13T11:00:00.000Z",
};

const catalogItems = [
  {
    id: "sku_latte",
    name: "Latte",
    description: "12oz",
    priceCents: 450,
  },
];

const syncedItems = [
  {
    ...catalogItems[0],
    stripeProductId: "prod_latte",
    stripePriceId: "price_latte",
  },
];

const savedCatalog = {
  id: "cat_1",
  leadSlug: "demo-cafe",
  items: catalogItems,
  updatedAt: "2026-07-13T12:00:00.000Z",
};

const updatedCatalog = {
  ...savedCatalog,
  items: syncedItems,
  updatedAt: "2026-07-13T12:05:00.000Z",
};

describe("syncCommerceCatalogToStripeAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce_sync";
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    stripeCtor.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    listOrdersByLeadSlug.mockReset().mockResolvedValue([commerceOrder]);
    getCommerceCatalog.mockReset().mockResolvedValue(savedCatalog);
    upsertCommerceCatalog.mockReset().mockResolvedValue(updatedCatalog);
    syncCommerceCatalogToStripe.mockReset().mockResolvedValue(syncedItems);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error without loading the lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(syncCommerceCatalogToStripe).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Set STRIPE_SECRET_KEY before syncing the catalog to Stripe.",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(syncCommerceCatalogToStripe).not.toHaveBeenCalled();
  });

  it("rejects when commerceAddon recurring entitlement is paused", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      { ...commerceOrder, recurringCanceledAt: 1_720_000_000_000 },
    ]);
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Commerce catalogs require a paid/live lead with a Commerce add-on order",
    });
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(getCommerceCatalog).not.toHaveBeenCalled();
    expect(syncCommerceCatalogToStripe).not.toHaveBeenCalled();
  });

  it("rejects paid leads without a Commerce add-on order", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      { ...commerceOrder, commerceAddon: false, amountPaid: 599 },
    ]);
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Commerce catalogs require a paid/live lead with a Commerce add-on order",
    });
    expect(syncCommerceCatalogToStripe).not.toHaveBeenCalled();
  });

  it("rejects when no catalog exists", async () => {
    getCommerceCatalog.mockResolvedValue(null);
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Save the catalog with at least one SKU before syncing to Stripe",
    });
    expect(getCommerceCatalog).toHaveBeenCalledWith("demo-cafe");
    expect(syncCommerceCatalogToStripe).not.toHaveBeenCalled();
  });

  it("rejects when the catalog has zero SKUs", async () => {
    getCommerceCatalog.mockResolvedValue({
      ...savedCatalog,
      items: [],
    });
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Save the catalog with at least one SKU before syncing to Stripe",
    });
    expect(syncCommerceCatalogToStripe).not.toHaveBeenCalled();
  });

  it("syncs to Stripe, persists with requireConvex, and revalidates", async () => {
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      catalog: updatedCatalog,
    });
    expect(stripeCtor).toHaveBeenCalledWith("sk_test_commerce_sync");
    expect(syncCommerceCatalogToStripe).toHaveBeenCalledOnce();
    expect(syncCommerceCatalogToStripe).toHaveBeenCalledWith(
      expect.anything(),
      "demo-cafe",
      "Demo Cafe",
      catalogItems,
    );
    expect(upsertCommerceCatalog).toHaveBeenCalledWith(
      {
        leadSlug: "demo-cafe",
        items: syncedItems,
        updatedAt: expect.any(String),
      },
      { requireConvex: true },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/demo-cafe");
  });

  it("fails closed on ConvexPrimaryWriteError without revalidating", async () => {
    upsertCommerceCatalog.mockRejectedValue(
      new MockConvexPrimaryWriteError("convex down"),
    );
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");

    expect(res).toEqual({
      success: false,
      error:
        "Stripe Products/Prices may already exist, but the catalog could not be saved in the shared store — Buy now may still miss stripePriceId elsewhere. Retry Sync to Stripe (idempotent).",
    });
    expect(syncCommerceCatalogToStripe).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected persist errors", async () => {
    upsertCommerceCatalog.mockRejectedValue(new Error("disk full"));
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "disk full",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Stripe sync throws as Unknown Stripe error for non-Error", async () => {
    syncCommerceCatalogToStripe.mockRejectedValue("stripe blew up");
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unknown Stripe error",
    });
    expect(upsertCommerceCatalog).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("looks up the catalog by the requested leadSlug", async () => {
    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    await syncCommerceCatalogToStripeAction("demo-cafe");
    expect(getLeadBySlug).toHaveBeenCalledWith("demo-cafe");
    expect(getCommerceCatalog).toHaveBeenCalledWith("demo-cafe");
  });

  it("re-reads the catalog before the final write so a concurrent saveCommerceCatalogAction survives the sync", async () => {
    // Simulate: the catalog read at the top of the action (used to build the
    // Stripe sync request) is stale by the time the sequential per-SKU sync
    // loop finishes — an operator (or a second tab) saved a newer catalog
    // (edited price on sku_latte, added sku_muffin) while the sync was in
    // flight. Writing `synced` (derived from the stale first read) verbatim
    // would silently discard that concurrent edit.
    const concurrentlyEditedCatalog = {
      ...savedCatalog,
      items: [
        { id: "sku_latte", name: "Latte", description: "12oz", priceCents: 500 }, // price changed mid-sync
        { id: "sku_muffin", name: "Muffin", description: "Blueberry", priceCents: 350 }, // added mid-sync
      ],
    };
    getCommerceCatalog
      .mockReset()
      .mockResolvedValueOnce(savedCatalog) // initial read, before the Stripe loop
      .mockResolvedValueOnce(concurrentlyEditedCatalog); // re-read, right before the write

    const { syncCommerceCatalogToStripeAction } = await import("./actions");
    const res = await syncCommerceCatalogToStripeAction("demo-cafe");

    expect(res.success).toBe(true);
    const written = upsertCommerceCatalog.mock.calls[0]![0].items;
    // sku_latte: Stripe product id carries over, but the just-created price
    // was for the OLD ($4.50) amount — it must NOT be attached to the now
    // $5.00 item (a stale stripePriceId would charge the wrong amount).
    expect(written.find((i: { id: string }) => i.id === "sku_latte")).toEqual({
      id: "sku_latte",
      name: "Latte",
      description: "12oz",
      priceCents: 500,
      stripeProductId: "prod_latte",
    });
    // sku_muffin: added after the sync loop started — not yet synced, so no
    // Stripe ids, but the concurrent edit itself is preserved (not dropped).
    expect(written.find((i: { id: string }) => i.id === "sku_muffin")).toEqual({
      id: "sku_muffin",
      name: "Muffin",
      description: "Blueberry",
      priceCents: 350,
    });
    expect(written).toHaveLength(2);
  });
});
