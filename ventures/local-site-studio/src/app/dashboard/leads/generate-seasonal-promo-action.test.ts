import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for generateSeasonalPromoAction — the operator
 * fulfillment path for the Complete tier's sold "Full marketing — seasonal
 * promos, A/B variants" bullet (src/lib/pricing/bundles.ts), which had no
 * dashboard action at all until this shipped.
 *
 * generators.test.ts / seasonal-promo.test.ts / marketing/generate/route.test.ts
 * cover LLM fallbacks and request shape. This suite locks the dashboard
 * action glue: requireOperatorAuth, rate limit, eligibility gates
 * (Complete-only, unlike generateMarketingPackAction's Growth-or-Complete),
 * and stub-vs-anthropic generator labeling. Unlike generateMarketingPackAction,
 * this action never persists — no upsertMarketingPack / revalidatePath call.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const headerGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (...args: unknown[]) => headerGet(...(args as [string])),
  })),
}));

const getLeadBySlug = vi.fn();
const listOrdersByLeadSlug = vi.fn();
const upsertMarketingPack = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
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
  upsertMarketingPack: (...args: unknown[]) => upsertMarketingPack(...args),
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

const generate = vi.fn();

vi.mock("@/lib/marketing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/marketing")>();
  return {
    ...actual,
    getMarketingGenerator: () => ({
      generate: (...args: unknown[]) => generate(...args),
    }),
  };
});

vi.mock("@/lib/marketing/pack-persist", () => ({
  MARKETING_PACK_CONVEX_PRIMARY: { requireConvex: true },
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

const completeOrder = {
  id: "ord_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_complete",
  tier: "complete",
  commerceAddon: false,
  amountPaid: 1099,
  createdAt: "2026-07-13T10:00:00.000Z",
};

const stubVariants = [
  { contentType: "seasonal_promo" as const, body: "[Stub 1] Sale copy A" },
  { contentType: "seasonal_promo" as const, body: "[Stub 2] Sale copy B" },
  { contentType: "ad_copy" as const, body: "[Stub 3] Ad copy" },
];

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("generateSeasonalPromoAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headerGet.mockReset().mockReturnValue("203.0.113.5");
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    listOrdersByLeadSlug.mockReset().mockResolvedValue([completeOrder]);
    generate.mockReset().mockResolvedValue({
      leadId: "demo-cafe",
      variants: stubVariants,
      generatedAt: "2026-07-13T12:00:00.000Z",
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
    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("rate-limits repeated generation from the same IP", async () => {
    const { generateSeasonalPromoAction } = await import("./actions");
    for (let i = 0; i < 20; i++) {
      const res = await generateSeasonalPromoAction("demo-cafe");
      expect(res.success).toBe(true);
    }
    generate.mockClear();
    const res = await generateSeasonalPromoAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("");
    expect(res).toEqual({ success: false, error: "Slug is required" });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("missing-cafe");
    expect(res).toEqual({ success: false, error: "Lead not found" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects Growth-tier leads — Complete-only differentiator", async () => {
    listOrdersByLeadSlug.mockResolvedValue([{ ...completeOrder, tier: "growth" }]);
    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Seasonal promo generation requires a paid/live lead with an active Complete order",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects discovered-stage leads even with a Complete order", async () => {
    getLeadBySlug.mockResolvedValue({ ...eligibleLead, stage: "discovered" });
    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("demo-cafe");
    expect(res.success).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects Complete orders after recurringCanceledAt (paused/canceled MRR)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      { ...completeOrder, recurringCanceledAt: 1_720_000_000_000 },
    ]);
    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("demo-cafe");
    expect(res.success).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it("generates without persisting — no upsertMarketingPack or revalidatePath call", async () => {
    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("demo-cafe", "Labor Day weekend");

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(res.variants).toEqual(stubVariants);
    expect(res.generator).toBe("stub");
    expect(upsertMarketingPack).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes the operator-supplied occasion through as campaignContext", async () => {
    const { generateSeasonalPromoAction } = await import("./actions");
    await generateSeasonalPromoAction("demo-cafe", "Labor Day weekend");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentTypes: ["seasonal_promo", "seasonal_promo", "ad_copy"],
        business: expect.objectContaining({ campaignContext: "Labor Day weekend" }),
      }),
    );
  });

  it("defaults campaignContext to the current month when occasion is omitted", async () => {
    const { generateSeasonalPromoAction } = await import("./actions");
    await generateSeasonalPromoAction("demo-cafe");
    const [request] = generate.mock.calls[0]!;
    expect(request.business.campaignContext).toMatch(/^[A-Z][a-z]+ promotion$/);
  });

  it("labels generator anthropic when ANTHROPIC_API_KEY is set and bodies are not stub", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    generate.mockResolvedValue({
      leadId: "demo-cafe",
      variants: [
        { contentType: "seasonal_promo", body: "Real sale copy for Demo Cafe." },
        { contentType: "seasonal_promo", body: "Alternate sale copy for Demo Cafe." },
        { contentType: "ad_copy", body: "Ad copy for Demo Cafe." },
      ],
      generatedAt: "2026-07-13T12:00:00.000Z",
    });

    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("demo-cafe");
    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(res.generator).toBe("anthropic");
  });

  it("still labels stub when Anthropic key is set but bodies start with [Stub", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("demo-cafe");
    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(res.generator).toBe("stub");
  });

  it("surfaces unexpected generator errors as action failures", async () => {
    generate.mockRejectedValue(new Error("Anthropic outage"));
    const { generateSeasonalPromoAction } = await import("./actions");
    const res = await generateSeasonalPromoAction("demo-cafe");
    expect(res).toEqual({ success: false, error: "Anthropic outage" });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "generateSeasonalPromoAction",
    });
  });
});
