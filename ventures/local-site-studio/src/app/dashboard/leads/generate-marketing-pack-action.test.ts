import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for generateMarketingPackAction — the operator
 * Generate pack path for sold Growth/Complete fulfillment.
 *
 * generators.test.ts / monthly-pack.test.ts / marketing/generate/route.test.ts
 * cover LLM fallbacks, request shape, and the ad-hoc API route. This suite
 * locks the dashboard action glue: requireOperatorAuth, eligibility gates,
 * MARKETING_PACK_CONVEX_PRIMARY persist, ConvexPrimaryWriteError fail-closed,
 * and stub-vs-anthropic generator labeling.
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
const listOrders = vi.fn();
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
  listOrders: (...args: unknown[]) => listOrders(...args),
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

// Named, not inline: semgrep's TS grammar rejects a dynamic `import(...)` type
// inside a type argument list and stops parsing the file there. See the note in
// `generate-client-voice-pack-action.test.ts`.
type MarketingModule = typeof import("@/lib/marketing");

vi.mock("@/lib/marketing", async (importOriginal) => {
  const actual = await importOriginal<MarketingModule>();
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

const growthOrder = {
  id: "ord_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_growth",
  tier: "growth",
  commerceAddon: false,
  amountPaid: 599,
  status: "paid",
  createdAt: "2026-07-13T10:00:00.000Z",
};

const stubVariants = [
  {
    contentType: "gbp_post" as const,
    title: "Stub post",
    body: "[Stub] Come visit Demo Cafe this week.",
  },
];

describe("generateMarketingPackAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    listOrders.mockReset().mockResolvedValue([growthOrder]);
    upsertMarketingPack.mockReset().mockImplementation(async (input) => ({
      id: "pack_1",
      ...input,
    }));
    generate.mockReset().mockResolvedValue({
      leadId: "demo-cafe",
      variants: stubVariants,
      generatedAt: "2026-07-13T12:00:00.000Z",
      packageTier: "social_email",
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
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(upsertMarketingPack).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(upsertMarketingPack).not.toHaveBeenCalled();
  });

  it("rejects Starter-only / unpaid leads (eligibility)", async () => {
    listOrders.mockResolvedValue([
      { ...growthOrder, tier: "starter", amountPaid: 500 },
    ]);
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Marketing packs require a paid/live lead with a Growth or Complete order",
    });
    expect(generate).not.toHaveBeenCalled();
    expect(upsertMarketingPack).not.toHaveBeenCalled();
  });

  it("rejects discovered-stage leads even with a Growth order", async () => {
    getLeadBySlug.mockResolvedValue({ ...eligibleLead, stage: "discovered" });
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Marketing packs require a paid/live lead with a Growth or Complete order",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("persists a stub pack with MARKETING_PACK_CONVEX_PRIMARY when Anthropic is unset", async () => {
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("demo-cafe");

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(generate).toHaveBeenCalledOnce();
    expect(upsertMarketingPack).toHaveBeenCalledOnce();
    const [input, options] = upsertMarketingPack.mock.calls[0]!;
    expect(options).toEqual({ requireConvex: true });
    expect(input).toMatchObject({
      leadSlug: "demo-cafe",
      generator: "stub",
      packageTier: "social_email",
      variants: stubVariants,
    });
    expect(typeof input.yearMonth).toBe("string");
    expect(input.yearMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(res.pack.generator).toBe("stub");
  });

  it("labels generator anthropic when ANTHROPIC_API_KEY is set and bodies are not stub", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    generate.mockResolvedValue({
      leadId: "demo-cafe",
      variants: [
        {
          contentType: "gbp_post",
          title: "Real post",
          body: "Visit Demo Cafe for fresh espresso this week.",
        },
      ],
      generatedAt: "2026-07-13T12:00:00.000Z",
      packageTier: "social_email",
    });

    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("demo-cafe");

    expect(res.success).toBe(true);
    const [input] = upsertMarketingPack.mock.calls[0]!;
    expect(input.generator).toBe("anthropic");
  });

  it("still labels stub when Anthropic key is set but bodies start with [Stub", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("demo-cafe");

    expect(res.success).toBe(true);
    const [input] = upsertMarketingPack.mock.calls[0]!;
    expect(input.generator).toBe("stub");
  });

  it("fails closed on ConvexPrimaryWriteError without revalidate", async () => {
    upsertMarketingPack.mockRejectedValue(
      new MockConvexPrimaryWriteError("mutation failed"),
    );
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("demo-cafe");

    expect(res).toEqual({
      success: false,
      error:
        "Could not save the marketing pack in the shared store — other instances may still show packs due. Retry in a moment.",
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected persist errors as action failures", async () => {
    upsertMarketingPack.mockRejectedValue(new Error("disk full"));
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("demo-cafe");

    expect(res).toEqual({
      success: false,
      error: "disk full",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("filters orders to the requested lead slug before eligibility", async () => {
    listOrders.mockResolvedValue([
      { ...growthOrder, leadSlug: "other-cafe", tier: "complete" },
      { ...growthOrder, leadSlug: "demo-cafe", tier: "starter" },
    ]);
    const { generateMarketingPackAction } = await import("./actions");
    const res = await generateMarketingPackAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Marketing packs require a paid/live lead with a Growth or Complete order",
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
