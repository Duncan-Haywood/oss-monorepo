import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for archiveOrphanCommerceStripeProductsAction —
 * the operator Archive orphans path that deactivates Stripe Products for SKUs
 * removed from a saved Commerce catalog.
 *
 * stripe-sync.test.ts covers list/archive helpers (active=false, lead-scoped,
 * never delete). This suite locks the dashboard action glue: requireOperatorAuth,
 * STRIPE_SECRET_KEY gate, lead lookup, catalog?.items ?? [] pass-through,
 * success archivedCount/skuIds + revalidate, and Stripe throw surfaces.
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
const getCommerceCatalog = vi.fn();

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

const listOrphanCommerceStripeProducts = vi.fn();
const archiveCommerceStripeProducts = vi.fn();

vi.mock("@/lib/commerce", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/commerce")>();
  return {
    ...actual,
    listOrphanCommerceStripeProducts: (...args: unknown[]) =>
      listOrphanCommerceStripeProducts(...args),
    archiveCommerceStripeProducts: (...args: unknown[]) =>
      archiveCommerceStripeProducts(...args),
  };
});

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

const catalogItems = [
  {
    id: "sku_latte",
    name: "Latte",
    description: "12oz",
    priceCents: 450,
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

const orphanCandidates = [
  {
    productId: "prod_old_muffin",
    skuId: "sku_muffin",
    key: "commerce_sku_demo-cafe_sku_muffin",
  },
];

describe("archiveOrphanCommerceStripeProductsAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce_archive";
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    stripeCtor.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    getCommerceCatalog.mockReset().mockResolvedValue(savedCatalog);
    listOrphanCommerceStripeProducts.mockReset().mockResolvedValue(orphanCandidates);
    archiveCommerceStripeProducts.mockReset().mockResolvedValue({
      archived: orphanCandidates,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error without loading the lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    const res = await archiveOrphanCommerceStripeProductsAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(listOrphanCommerceStripeProducts).not.toHaveBeenCalled();
    expect(archiveCommerceStripeProducts).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    const res = await archiveOrphanCommerceStripeProductsAction("");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    const res = await archiveOrphanCommerceStripeProductsAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Set STRIPE_SECRET_KEY before archiving orphan Stripe Products.",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    const res = await archiveOrphanCommerceStripeProductsAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(listOrphanCommerceStripeProducts).not.toHaveBeenCalled();
  });

  it("archives orphans for the saved catalog and revalidates", async () => {
    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    const res = await archiveOrphanCommerceStripeProductsAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      archivedCount: 1,
      archivedSkuIds: ["sku_muffin"],
    });
    expect(stripeCtor).toHaveBeenCalledWith("sk_test_commerce_archive");
    expect(listOrphanCommerceStripeProducts).toHaveBeenCalledOnce();
    expect(listOrphanCommerceStripeProducts).toHaveBeenCalledWith(
      expect.anything(),
      "demo-cafe",
      catalogItems,
    );
    expect(archiveCommerceStripeProducts).toHaveBeenCalledWith(
      expect.anything(),
      orphanCandidates,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("re-reads the catalog before archiving and drops a candidate whose SKU reappeared (concurrent save)", async () => {
    // Simulate: sku_muffin looked orphaned when the initial catalog was read
    // (and when listOrphanCommerceStripeProducts's account-wide pagination
    // ran), but an operator (or a second tab) re-added it via
    // saveCommerceCatalogAction before this action actually archives
    // anything. Archiving it now would break that SKU's live Buy now
    // checkout with no operator signal.
    getCommerceCatalog
      .mockReset()
      .mockResolvedValueOnce(savedCatalog) // initial read
      .mockResolvedValueOnce({
        ...savedCatalog,
        items: [...catalogItems, { id: "sku_muffin", name: "Muffin", description: "", priceCents: 300 }],
      }); // re-read right before archiving
    archiveCommerceStripeProducts.mockResolvedValue({ archived: [] });

    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    const res = await archiveOrphanCommerceStripeProductsAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      archivedCount: 0,
      archivedSkuIds: [],
    });
    expect(archiveCommerceStripeProducts).toHaveBeenCalledWith(expect.anything(), []);
  });

  it("passes an empty items array when no catalog exists", async () => {
    getCommerceCatalog.mockResolvedValue(null);
    listOrphanCommerceStripeProducts.mockResolvedValue([]);
    archiveCommerceStripeProducts.mockResolvedValue({ archived: [] });
    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    const res = await archiveOrphanCommerceStripeProductsAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      archivedCount: 0,
      archivedSkuIds: [],
    });
    expect(listOrphanCommerceStripeProducts).toHaveBeenCalledWith(
      expect.anything(),
      "demo-cafe",
      [],
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("surfaces Stripe archive throws", async () => {
    archiveCommerceStripeProducts.mockRejectedValue(
      new Error("rate limited"),
    );
    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    const res = await archiveOrphanCommerceStripeProductsAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "rate limited",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Stripe archive throws as Unknown Stripe error for non-Error", async () => {
    archiveCommerceStripeProducts.mockRejectedValue("stripe blew up");
    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    const res = await archiveOrphanCommerceStripeProductsAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unknown Stripe error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("looks up the lead and catalog by the requested leadSlug", async () => {
    const { archiveOrphanCommerceStripeProductsAction } = await import(
      "./actions"
    );
    await archiveOrphanCommerceStripeProductsAction("demo-cafe");
    expect(getLeadBySlug).toHaveBeenCalledWith("demo-cafe");
    expect(getCommerceCatalog).toHaveBeenCalledWith("demo-cafe");
  });
});
