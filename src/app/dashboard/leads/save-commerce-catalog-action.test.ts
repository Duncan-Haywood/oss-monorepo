import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for saveCommerceCatalogAction — the operator
 * Save catalog path for sold Commerce add-on fulfillment.
 *
 * catalog.test.ts / catalog-persist.test.ts cover eligibility, normalize,
 * preserveCommerceStripeIds, and requireConvex constants. This suite locks
 * the dashboard action glue: requireOperatorAuth, commerceAddon eligibility,
 * normalize validation, preserveCommerceStripeIds against the DB row (never
 * client-submitted Stripe ids), COMMERCE_CATALOG_CONVEX_PRIMARY persist,
 * ConvexPrimaryWriteError fail-closed, and revalidate on success.
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
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  listOrders: vi.fn(),
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
  id: "ord_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_commerce",
  tier: "growth",
  commerceAddon: true,
  amountPaid: 849,
  status: "paid",
  createdAt: "2026-07-13T10:00:00.000Z",
};

const draftItems = [
  {
    id: "sku_latte",
    name: "Latte",
    description: "12oz",
    priceCents: 450,
  },
];

describe("saveCommerceCatalogAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    listOrdersByLeadSlug.mockReset().mockResolvedValue([commerceOrder]);
    getCommerceCatalog.mockReset().mockResolvedValue(null);
    upsertCommerceCatalog.mockReset().mockImplementation(async (input) => ({
      id: "cat_1",
      ...input,
    }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error without loading the lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", draftItems);
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(upsertCommerceCatalog).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("", draftItems);
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("missing-cafe", draftItems);
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(upsertCommerceCatalog).not.toHaveBeenCalled();
  });

  it("rejects paid leads without a Commerce add-on order", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      { ...commerceOrder, commerceAddon: false, amountPaid: 599 },
    ]);
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", draftItems);
    expect(res).toEqual({
      success: false,
      error:
        "Commerce catalogs require a paid/live lead with a Commerce add-on order",
    });
    expect(upsertCommerceCatalog).not.toHaveBeenCalled();
  });

  it("rejects discovered-stage leads even with a Commerce order", async () => {
    getLeadBySlug.mockResolvedValue({ ...eligibleLead, stage: "discovered" });
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", draftItems);
    expect(res).toEqual({
      success: false,
      error:
        "Commerce catalogs require a paid/live lead with a Commerce add-on order",
    });
    expect(upsertCommerceCatalog).not.toHaveBeenCalled();
  });

  it("rejects invalid SKUs before persist (empty name)", async () => {
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", [
      { id: "sku_bad", name: "   ", priceCents: 100 },
    ]);
    expect(res).toEqual({
      success: false,
      error: "SKU 1 needs a name",
    });
    expect(upsertCommerceCatalog).not.toHaveBeenCalled();
  });

  it("persists with COMMERCE_CATALOG_CONVEX_PRIMARY and revalidates", async () => {
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", draftItems);

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(upsertCommerceCatalog).toHaveBeenCalledOnce();
    const [input, options] = upsertCommerceCatalog.mock.calls[0]!;
    expect(options).toEqual({ requireConvex: true });
    expect(input).toMatchObject({
      leadSlug: "demo-cafe",
      items: [
        {
          id: "sku_latte",
          name: "Latte",
          description: "12oz",
          priceCents: 450,
        },
      ],
    });
    expect(typeof input.updatedAt).toBe("string");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/demo-cafe");
    expect(res.catalog.items[0]).toMatchObject({
      id: "sku_latte",
      name: "Latte",
      priceCents: 450,
    });
  });

  it("preserves Stripe ids from the existing catalog when price is unchanged", async () => {
    getCommerceCatalog.mockResolvedValue({
      id: "cat_1",
      leadSlug: "demo-cafe",
      updatedAt: "2026-07-12T10:00:00.000Z",
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
    });

    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", [
      {
        id: "sku_latte",
        name: "Latte (edited)",
        description: "12oz",
        priceCents: 450,
        // Client-submitted Stripe ids must be ignored — normalize drops them.
        stripeProductId: "prod_from_client",
        stripePriceId: "price_from_client",
      } as { id: string; name: string; description: string; priceCents: number },
    ]);

    expect(res.success).toBe(true);
    const [input] = upsertCommerceCatalog.mock.calls[0]!;
    expect(input.items[0]).toMatchObject({
      id: "sku_latte",
      name: "Latte (edited)",
      priceCents: 450,
      stripeProductId: "prod_existing",
      stripePriceId: "price_existing",
    });
    expect(input.items[0].stripeProductId).not.toBe("prod_from_client");
  });

  it("keeps Product id but clears Price id when priceCents changes", async () => {
    getCommerceCatalog.mockResolvedValue({
      id: "cat_1",
      leadSlug: "demo-cafe",
      updatedAt: "2026-07-12T10:00:00.000Z",
      items: [
        {
          id: "sku_latte",
          name: "Latte",
          priceCents: 450,
          stripeProductId: "prod_existing",
          stripePriceId: "price_existing",
        },
      ],
    });

    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", [
      { id: "sku_latte", name: "Latte", priceCents: 500 },
    ]);

    expect(res.success).toBe(true);
    const [input] = upsertCommerceCatalog.mock.calls[0]!;
    expect(input.items[0]).toMatchObject({
      id: "sku_latte",
      priceCents: 500,
      stripeProductId: "prod_existing",
    });
    expect(input.items[0].stripePriceId).toBeUndefined();
  });

  it("fails closed on ConvexPrimaryWriteError without revalidate", async () => {
    upsertCommerceCatalog.mockRejectedValue(
      new MockConvexPrimaryWriteError("mutation failed"),
    );
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", draftItems);

    expect(res).toEqual({
      success: false,
      error:
        "Could not save the catalog in the shared store — Buy now may still miss stripePriceId elsewhere. Retry in a moment.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected persist errors as action failures", async () => {
    upsertCommerceCatalog.mockRejectedValue(new Error("disk full"));
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", draftItems);

    expect(res).toEqual({
      success: false,
      error: "disk full",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("loads orders via listOrdersByLeadSlug (no commerceAddon does not pass)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      {
        ...commerceOrder,
        leadSlug: "demo-cafe",
        commerceAddon: false,
        amountPaid: 599,
      },
    ]);
    const { saveCommerceCatalogAction } = await import("./actions");
    const res = await saveCommerceCatalogAction("demo-cafe", draftItems);
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Commerce catalogs require a paid/live lead with a Commerce add-on order",
    });
    expect(upsertCommerceCatalog).not.toHaveBeenCalled();
  });
});
