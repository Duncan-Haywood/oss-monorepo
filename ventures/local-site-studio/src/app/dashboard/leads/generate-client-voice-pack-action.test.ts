import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for generateClientVoicePackAction — the operator
 * Generate voice path for sold Complete phone-script fulfillment.
 *
 * generators.test.ts / faq-pack.test.ts / build-request.test.ts cover LLM
 * fallbacks, eligibility helpers, and request shape. This suite locks the
 * dashboard action glue: requireOperatorAuth, eligibility gates,
 * CLIENT_VOICE_PACK_CONVEX_PRIMARY persist, ConvexPrimaryWriteError fail-closed,
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
const upsertClientVoicePack = vi.fn();

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
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: vi.fn(),
  getMarketingPack: vi.fn(),
  upsertCommerceCatalog: vi.fn(),
  listCommerceCatalogs: vi.fn(),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  upsertClientVoicePack: (...args: unknown[]) => upsertClientVoicePack(...args),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
}));

const generate = vi.fn();

// Named rather than written inline as `importOriginal<typeof import("@/lib/voice")>()`.
// Semgrep's TypeScript grammar rejects a dynamic `import(...)` type inside a type
// argument list and stops parsing the file there, so everything below this line
// left SAST coverage while the job stayed green. Naming the type keeps the
// inference exactly — an `as` cast would parse too, and would silence real type
// errors to do it. See `coverage.semgrep_unparsed` in `platform/sast-baseline.yaml`.
type VoiceModule = typeof import("@/lib/voice");

vi.mock("@/lib/voice", async (importOriginal) => {
  const actual = await importOriginal<VoiceModule>();
  return {
    ...actual,
    getClientVoiceGenerator: () => ({
      generate: (...args: unknown[]) => generate(...args),
    }),
  };
});

vi.mock("@/lib/voice/pack-persist", () => ({
  CLIENT_VOICE_PACK_CONVEX_PRIMARY: { requireConvex: true },
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
  recommendedTier: "complete" as const,
  dataSource: "manual_entry" as const,
};

const completeOrder = {
  id: "ord_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_complete",
  tier: "complete",
  commerceAddon: false,
  amountPaid: 699,
  status: "paid",
  createdAt: "2026-07-13T10:00:00.000Z",
};

const stubVariants = [
  {
    scriptType: "inbound_greeting" as const,
    title: "Greeting",
    body: "[Stub] Thanks for calling Demo Cafe.",
  },
];

describe("generateClientVoicePackAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    listOrders.mockReset().mockResolvedValue([completeOrder]);
    upsertClientVoicePack.mockReset().mockImplementation(async (input) => ({
      id: "voice_pack_1",
      ...input,
    }));
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
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(upsertClientVoicePack).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(upsertClientVoicePack).not.toHaveBeenCalled();
  });

  it("rejects Growth-only / unpaid leads (eligibility)", async () => {
    listOrders.mockResolvedValue([
      { ...completeOrder, tier: "growth", amountPaid: 599 },
    ]);
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Client voice FAQ packs require a paid/live lead with a Complete order",
    });
    expect(generate).not.toHaveBeenCalled();
    expect(upsertClientVoicePack).not.toHaveBeenCalled();
  });

  it("rejects discovered-stage leads even with a Complete order", async () => {
    getLeadBySlug.mockResolvedValue({ ...eligibleLead, stage: "discovered" });
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Client voice FAQ packs require a paid/live lead with a Complete order",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("persists a stub pack with CLIENT_VOICE_PACK_CONVEX_PRIMARY when Anthropic is unset", async () => {
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("demo-cafe");

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(generate).toHaveBeenCalledOnce();
    expect(upsertClientVoicePack).toHaveBeenCalledOnce();
    const [input, options] = upsertClientVoicePack.mock.calls[0]!;
    expect(options).toEqual({ requireConvex: true });
    expect(input).toMatchObject({
      leadSlug: "demo-cafe",
      generator: "stub",
      variants: stubVariants,
    });
    expect(typeof input.generatedAt).toBe("string");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(res.pack.generator).toBe("stub");
  });

  it("labels generator anthropic when ANTHROPIC_API_KEY is set and bodies are not stub", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    generate.mockResolvedValue({
      leadId: "demo-cafe",
      variants: [
        {
          scriptType: "inbound_greeting",
          title: "Greeting",
          body: "Thanks for calling Demo Cafe — how can I help you today?",
        },
      ],
      generatedAt: "2026-07-13T12:00:00.000Z",
    });

    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("demo-cafe");

    expect(res.success).toBe(true);
    const [input] = upsertClientVoicePack.mock.calls[0]!;
    expect(input.generator).toBe("anthropic");
  });

  it("still labels stub when Anthropic key is set but bodies start with [Stub", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("demo-cafe");

    expect(res.success).toBe(true);
    const [input] = upsertClientVoicePack.mock.calls[0]!;
    expect(input.generator).toBe("stub");
  });

  it("fails closed on ConvexPrimaryWriteError without revalidate", async () => {
    upsertClientVoicePack.mockRejectedValue(
      new MockConvexPrimaryWriteError("mutation failed"),
    );
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("demo-cafe");

    expect(res).toEqual({
      success: false,
      error:
        "Could not save the voice pack in the shared store — other instances may still show voice packs due. Retry in a moment.",
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected persist errors as action failures", async () => {
    upsertClientVoicePack.mockRejectedValue(new Error("disk full"));
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("demo-cafe");

    expect(res).toEqual({
      success: false,
      error: "disk full",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("filters orders to the requested lead slug before eligibility", async () => {
    listOrders.mockResolvedValue([
      { ...completeOrder, leadSlug: "other-cafe", tier: "complete" },
      { ...completeOrder, leadSlug: "demo-cafe", tier: "growth" },
    ]);
    const { generateClientVoicePackAction } = await import("./actions");
    const res = await generateClientVoicePackAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Client voice FAQ packs require a paid/live lead with a Complete order",
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
