import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/leads/types";
import type { MarketingPack } from "@/lib/marketing/pack";
import { MAX_BUFFER_PROFILES_PER_LEAD } from "@/lib/marketing/buffer";

class MockConvexPrimaryWriteError extends Error {
  constructor(message = "Convex primary write failed") {
    super(message);
    this.name = "ConvexPrimaryWriteError";
  }
}

vi.mock("@/lib/payments/convex-primary", () => ({
  ConvexPrimaryWriteError: MockConvexPrimaryWriteError,
}));

/**
 * Action-level coverage for the Buffer auto-posting scaffold
 * (marketing-content-scheduling tier-6 empty-backlog scaffold):
 * listBufferProfilesAction, saveLeadBufferProfilesAction,
 * scheduleMarketingPackToBufferAction.
 *
 * buffer-gate.test.ts + buffer.test.ts already cover the shared gate and pure
 * Buffer-calling/formatting helpers. This suite locks the server-action glue:
 * requireOperatorAuth rejection, per-IP rate limit, gate 403/501,
 * lead-not-found, opaque-id length rejection, ConvexPrimaryWriteError
 * fail-closed, and the schedule action's per-profile scheduled/skipped/failed
 * partition.
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
const updateLeadBufferProfileIds = vi.fn();
const updateLeadBufferPostedVariantKeys = vi.fn();
const getMarketingPack = vi.fn();
const listOrdersByLeadSlug = vi.fn();
vi.mock("@/lib/db", () => ({
  updateLeadStage: vi.fn(),
  upsertLead: vi.fn(),
  updateClientInquiryStatus: vi.fn(),
  getClientInquiryById: vi.fn(),
  recordClientInquiryReply: vi.fn(),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  getLeads: vi.fn(),
  listOrders: vi.fn(),
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  recordLeadOutreach: vi.fn(),
  listOpenCheckoutSessions: vi.fn(),
  listUnrepliedInquiries: vi.fn(),
  recordCheckoutRecoverySent: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: vi.fn(),
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: vi.fn(),
  getMarketingPack: (...args: unknown[]) => getMarketingPack(...args),
  upsertCommerceCatalog: vi.fn(),
  getCommerceCatalog: vi.fn(),
  listCommerceCatalogs: vi.fn(),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  markCommerceOrderClientReceiptSent: vi.fn(),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
  listCommerceOrdersRefunded: vi.fn(),
  listCommerceOrdersDisputed: vi.fn(),
  listCommerceOrdersMissingClientReceipt: vi.fn(),
  listDeployHandoffs: vi.fn(),
  getLeadSlugByCustomDomain: vi.fn(),
  getDeployHandoffBySlug: vi.fn(),
  updateLeadStripeConnectAccountId: vi.fn(),
  updateLeadBufferProfileIds: (...args: unknown[]) => updateLeadBufferProfileIds(...args),
  updateLeadBufferPostedVariantKeys: (...args: unknown[]) =>
    updateLeadBufferPostedVariantKeys(...args),
}));

const listBufferProfiles = vi.fn();
const createBufferUpdate = vi.fn();
vi.mock("@/lib/marketing/buffer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/marketing/buffer")>();
  return {
    ...actual,
    listBufferProfiles: (...args: unknown[]) => listBufferProfiles(...args),
    createBufferUpdate: (...args: unknown[]) => createBufferUpdate(...args),
  };
});

function fakeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "demo-cafe",
    businessName: "Demo Cafe",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    tagline: "Fresh daily",
    description: "A cozy neighborhood cafe.",
    phone: "(555) 000-0000",
    email: "owner@demo-cafe.example",
    services: ["coffee"],
    hours: { weekday: "Mon-Fri 7am-5pm", weekend: "Sat-Sun 8am-2pm" },
    stage: "paid",
    recommendedTier: "growth",
    ...overrides,
  };
}

function fakePack(overrides: Partial<MarketingPack> = {}): MarketingPack {
  return {
    id: "pack_1",
    leadSlug: "demo-cafe",
    yearMonth: "2026-07",
    variants: [
      { contentType: "facebook_caption", body: "Come visit us!" },
      { contentType: "instagram_caption", body: "New menu items!" },
    ],
    generatedAt: "2026-07-01T00:00:00.000Z",
    generator: "stub",
    ...overrides,
  };
}

describe("Buffer scheduling dashboard actions", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headerGet.mockReset().mockReturnValue("203.0.113.5");
    getLeadBySlug.mockReset();
    updateLeadBufferProfileIds.mockReset().mockResolvedValue(undefined);
    updateLeadBufferPostedVariantKeys.mockReset().mockResolvedValue(undefined);
    getMarketingPack.mockReset();
    listOrdersByLeadSlug.mockReset().mockResolvedValue([{ tier: "growth" }]);
    listBufferProfiles.mockReset();
    createBufferUpdate.mockReset();
    revalidatePath.mockReset();
    process.env = { ...originalEnv };
    process.env.ALLOW_MARKETING_SCHEDULING = "1";
    process.env.BUFFER_ACCESS_TOKEN = "tok_test";
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("listBufferProfilesAction", () => {
    it("returns auth error when requireOperatorAuth fails", async () => {
      requireOperatorAuth.mockResolvedValue({ ok: false, error: "Unauthorized" });
      const { listBufferProfilesAction } = await import("./actions");
      const result = await listBufferProfilesAction();
      expect(result).toEqual({ success: false, error: "Unauthorized" });
      expect(listBufferProfiles).not.toHaveBeenCalled();
    });

    it("rate-limits repeated calls from the same IP", async () => {
      listBufferProfiles.mockResolvedValue([]);
      const { listBufferProfilesAction } = await import("./actions");

      for (let i = 0; i < 20; i++) {
        const res = await listBufferProfilesAction();
        expect(res.success).toBe(true);
      }
      listBufferProfiles.mockClear();
      const rateLimited = await listBufferProfilesAction();
      expect(rateLimited).toEqual({
        success: false,
        error: "Too many requests — please try again shortly.",
      });
      expect(listBufferProfiles).not.toHaveBeenCalled();
    });

    it("returns the gate message when ALLOW_MARKETING_SCHEDULING is unset", async () => {
      delete process.env.ALLOW_MARKETING_SCHEDULING;
      const { listBufferProfilesAction } = await import("./actions");
      const result = await listBufferProfilesAction();
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/ALLOW_MARKETING_SCHEDULING/);
      expect(listBufferProfiles).not.toHaveBeenCalled();
    });

    it("returns the connected profiles on success", async () => {
      listBufferProfiles.mockResolvedValue([{ id: "p1", service: "facebook" }]);
      const { listBufferProfilesAction } = await import("./actions");
      const result = await listBufferProfilesAction();
      expect(result).toEqual({ success: true, profiles: [{ id: "p1", service: "facebook" }] });
      expect(listBufferProfiles).toHaveBeenCalledWith("tok_test");
    });
  });

  describe("saveLeadBufferProfilesAction", () => {
    it("returns lead-not-found for an unknown slug", async () => {
      getLeadBySlug.mockResolvedValue(null);
      const { saveLeadBufferProfilesAction } = await import("./actions");
      const result = await saveLeadBufferProfilesAction("no-such-lead", ["p1"]);
      expect(result).toEqual({ success: false, error: "Lead not found" });
      expect(updateLeadBufferProfileIds).not.toHaveBeenCalled();
    });

    it("rejects an over-length opaque profile id rather than truncating it", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      const { saveLeadBufferProfilesAction } = await import("./actions");
      const result = await saveLeadBufferProfilesAction("demo-cafe", ["p".repeat(200)]);
      expect(result).toEqual({ success: false, error: "Invalid Buffer profile id" });
      expect(updateLeadBufferProfileIds).not.toHaveBeenCalled();
    });

    it("rejects too many profiles for one lead", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      const { saveLeadBufferProfilesAction } = await import("./actions");
      const many = Array.from({ length: 21 }, (_, i) => `p${i}`);
      const result = await saveLeadBufferProfilesAction("demo-cafe", many);
      expect(result).toEqual({ success: false, error: "Too many Buffer profiles selected" });
      expect(updateLeadBufferProfileIds).not.toHaveBeenCalled();
    });

    it("saves the profile ids and revalidates on success", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      const { saveLeadBufferProfilesAction } = await import("./actions");
      const result = await saveLeadBufferProfilesAction("demo-cafe", ["p1", "p2"]);

      expect(updateLeadBufferProfileIds).toHaveBeenCalledWith(
        "demo-cafe",
        ["p1", "p2"],
        expect.objectContaining({ requireConvex: true }),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
      expect(result).toEqual({ success: true, bufferProfileIds: ["p1", "p2"] });
    });

    it("fails closed with a retry message when the Convex persist throws", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      updateLeadBufferProfileIds.mockRejectedValue(new MockConvexPrimaryWriteError());
      const { saveLeadBufferProfilesAction } = await import("./actions");
      const result = await saveLeadBufferProfilesAction("demo-cafe", ["p1"]);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/retry/i);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("dedupes a repeated profile id before persisting (buffer-profile-ids-dedupe-on-save)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      const { saveLeadBufferProfilesAction } = await import("./actions");
      const result = await saveLeadBufferProfilesAction("demo-cafe", ["p1", "p2", "p1"]);

      expect(updateLeadBufferProfileIds).toHaveBeenCalledWith(
        "demo-cafe",
        ["p1", "p2"],
        expect.objectContaining({ requireConvex: true }),
      );
      expect(result).toEqual({ success: true, bufferProfileIds: ["p1", "p2"] });
    });

    it("dedupes before enforcing the max-profiles cap, so duplicates alone don't reject a within-cap selection", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      const { saveLeadBufferProfilesAction } = await import("./actions");
      const withDuplicates = [
        ...Array.from({ length: MAX_BUFFER_PROFILES_PER_LEAD }, (_, i) => `p${i}`),
        "p0",
        "p1",
      ];
      const result = await saveLeadBufferProfilesAction("demo-cafe", withDuplicates);

      expect(result.success).toBe(true);
      expect(updateLeadBufferProfileIds).toHaveBeenCalledWith(
        "demo-cafe",
        Array.from({ length: MAX_BUFFER_PROFILES_PER_LEAD }, (_, i) => `p${i}`),
        expect.objectContaining({ requireConvex: true }),
      );
    });
  });

  describe("scheduleMarketingPackToBufferAction", () => {
    it("errors when the lead's recurring marketing entitlement has been canceled", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ bufferProfileIds: ["p1"] }));
      listOrdersByLeadSlug.mockResolvedValue([
        { tier: "growth", recurringCanceledAt: Date.now() },
      ]);
      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");
      expect(result).toEqual({
        success: false,
        error: "Marketing packs require a paid/live lead with a Growth or Complete order",
      });
      expect(getMarketingPack).not.toHaveBeenCalled();
      expect(listBufferProfiles).not.toHaveBeenCalled();
    });

    it("errors when the lead has no Growth/Complete order at all", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ bufferProfileIds: ["p1"] }));
      listOrdersByLeadSlug.mockResolvedValue([]);
      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");
      expect(result).toEqual({
        success: false,
        error: "Marketing packs require a paid/live lead with a Growth or Complete order",
      });
      expect(getMarketingPack).not.toHaveBeenCalled();
    });

    it("errors when the lead has no Buffer profiles selected", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");
      expect(result).toEqual({
        success: false,
        error: "Select Buffer profiles for this lead first",
      });
      expect(getMarketingPack).not.toHaveBeenCalled();
    });

    it("errors when no pack exists for the current month", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ bufferProfileIds: ["p1"] }));
      getMarketingPack.mockResolvedValue(null);
      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/generate one first/);
      expect(listBufferProfiles).not.toHaveBeenCalled();
    });

    it("schedules matching variants, skips unmatched profiles, and reports failures", async () => {
      getLeadBySlug.mockResolvedValue(
        fakeLead({ bufferProfileIds: ["p-fb", "p-ig", "p-gone", "p-tw"] }),
      );
      getMarketingPack.mockResolvedValue(fakePack());
      listBufferProfiles.mockResolvedValue([
        { id: "p-fb", service: "facebook" },
        { id: "p-ig", service: "instagram" },
        { id: "p-tw", service: "twitter" },
      ]);
      createBufferUpdate.mockImplementation(async (_token: string, params: { profileIds: string[] }) =>
        params.profileIds[0] === "p-ig"
          ? { success: false, error: "rate limited" }
          : { success: true, updateIds: ["u1"] },
      );

      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.scheduled).toEqual(["p-fb"]);
      expect(result.failed).toEqual(["p-ig: rate limited"]);
      expect(result.skipped).toEqual([
        "p-gone: no longer connected to Buffer",
        "p-tw: twitter has no matching pack content type",
      ]);
      expect(createBufferUpdate).toHaveBeenCalledWith("tok_test", {
        profileIds: ["p-fb"],
        text: "Come visit us!",
      });
    });

    it("queues every matching variant for a content type, not just the first (buffer-schedule-all-matching-variants)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ bufferProfileIds: ["p-fb", "p-ig"] }));
      getMarketingPack.mockResolvedValue(
        fakePack({
          variants: [
            { contentType: "facebook_caption", body: "FB post 1" },
            { contentType: "facebook_caption", body: "FB post 2" },
            { contentType: "facebook_caption", body: "FB post 3" },
            { contentType: "instagram_caption", body: "IG post 1" },
            { contentType: "instagram_caption", body: "IG post 2" },
            { contentType: "instagram_caption", body: "IG post 3" },
          ],
        }),
      );
      listBufferProfiles.mockResolvedValue([
        { id: "p-fb", service: "facebook" },
        { id: "p-ig", service: "instagram" },
      ]);
      createBufferUpdate.mockResolvedValue({ success: true, updateIds: ["u1"] });

      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.scheduled).toEqual([
        "p-fb (1/3)",
        "p-fb (2/3)",
        "p-fb (3/3)",
        "p-ig (1/3)",
        "p-ig (2/3)",
        "p-ig (3/3)",
      ]);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(createBufferUpdate).toHaveBeenCalledTimes(6);
      expect(createBufferUpdate).toHaveBeenNthCalledWith(1, "tok_test", {
        profileIds: ["p-fb"],
        text: "FB post 1",
      });
      expect(createBufferUpdate).toHaveBeenNthCalledWith(3, "tok_test", {
        profileIds: ["p-fb"],
        text: "FB post 3",
      });
      expect(createBufferUpdate).toHaveBeenNthCalledWith(4, "tok_test", {
        profileIds: ["p-ig"],
        text: "IG post 1",
      });
    });

    it("does not double-post when bufferProfileIds contains a duplicate profile id (buffer-profile-ids-dedupe-on-save defense-in-depth)", async () => {
      // Simulates a lead row saved before saveLeadBufferProfilesAction started
      // deduping — the schedule loop must still only post each variant once
      // per profile, even though nothing upstream prevented the duplicate.
      getLeadBySlug.mockResolvedValue(fakeLead({ bufferProfileIds: ["p-fb", "p-fb"] }));
      getMarketingPack.mockResolvedValue(
        fakePack({ variants: [{ contentType: "facebook_caption", body: "FB post 1" }] }),
      );
      listBufferProfiles.mockResolvedValue([{ id: "p-fb", service: "facebook" }]);
      createBufferUpdate.mockResolvedValue({ success: true, updateIds: ["u1"] });

      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.scheduled).toEqual(["p-fb"]);
      expect(result.skipped).toEqual(["p-fb: already posted this month"]);
      expect(createBufferUpdate).toHaveBeenCalledTimes(1);
    });

    it("labels only the failed variant when one of several fails for the same profile", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ bufferProfileIds: ["p-fb"] }));
      getMarketingPack.mockResolvedValue(
        fakePack({
          variants: [
            { contentType: "facebook_caption", body: "FB post 1" },
            { contentType: "facebook_caption", body: "FB post 2" },
          ],
        }),
      );
      listBufferProfiles.mockResolvedValue([{ id: "p-fb", service: "facebook" }]);
      createBufferUpdate
        .mockResolvedValueOnce({ success: true, updateIds: ["u1"] })
        .mockResolvedValueOnce({ success: false, error: "rate limited" });

      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.scheduled).toEqual(["p-fb (1/2)"]);
      expect(result.failed).toEqual(["p-fb (2/2): rate limited"]);
    });

    it("persists posted-variant markers after a successful schedule (buffer-schedule-duplicate-post-guard)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ bufferProfileIds: ["p-fb"] }));
      getMarketingPack.mockResolvedValue(
        fakePack({
          variants: [
            { contentType: "facebook_caption", body: "FB post 1" },
            { contentType: "facebook_caption", body: "FB post 2" },
          ],
        }),
      );
      listBufferProfiles.mockResolvedValue([{ id: "p-fb", service: "facebook" }]);
      createBufferUpdate.mockResolvedValue({ success: true, updateIds: ["u1"] });

      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.scheduled).toEqual(["p-fb (1/2)", "p-fb (2/2)"]);
      expect(updateLeadBufferPostedVariantKeys).toHaveBeenCalledWith("demo-cafe", [
        "2026-07-01T00:00:00.000Z|p-fb|facebook_caption|0",
        "2026-07-01T00:00:00.000Z|p-fb|facebook_caption|1",
      ]);
    });

    it("skips a variant already posted this pack instead of re-posting it", async () => {
      getLeadBySlug.mockResolvedValue(
        fakeLead({
          bufferProfileIds: ["p-fb"],
          bufferPostedVariantKeys: ["2026-07-01T00:00:00.000Z|p-fb|facebook_caption|0"],
        }),
      );
      getMarketingPack.mockResolvedValue(
        fakePack({
          variants: [
            { contentType: "facebook_caption", body: "FB post 1" },
            { contentType: "facebook_caption", body: "FB post 2" },
          ],
        }),
      );
      listBufferProfiles.mockResolvedValue([{ id: "p-fb", service: "facebook" }]);
      createBufferUpdate.mockResolvedValue({ success: true, updateIds: ["u1"] });

      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");

      expect(result.success).toBe(true);
      if (!result.success) return;
      // Only the second variant is new — the first is already posted.
      expect(createBufferUpdate).toHaveBeenCalledTimes(1);
      expect(createBufferUpdate).toHaveBeenCalledWith("tok_test", {
        profileIds: ["p-fb"],
        text: "FB post 2",
      });
      expect(result.scheduled).toEqual(["p-fb (2/2)"]);
      expect(result.skipped).toEqual(["p-fb (1/2): already posted this month"]);
      expect(updateLeadBufferPostedVariantKeys).toHaveBeenCalledWith("demo-cafe", [
        "2026-07-01T00:00:00.000Z|p-fb|facebook_caption|0",
        "2026-07-01T00:00:00.000Z|p-fb|facebook_caption|1",
      ]);
    });

    it("does not persist markers when every variant was already posted (nothing new to mark)", async () => {
      getLeadBySlug.mockResolvedValue(
        fakeLead({
          bufferProfileIds: ["p-fb"],
          bufferPostedVariantKeys: ["2026-07-01T00:00:00.000Z|p-fb|facebook_caption|0"],
        }),
      );
      getMarketingPack.mockResolvedValue(
        fakePack({ variants: [{ contentType: "facebook_caption", body: "FB post 1" }] }),
      );
      listBufferProfiles.mockResolvedValue([{ id: "p-fb", service: "facebook" }]);

      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(createBufferUpdate).not.toHaveBeenCalled();
      expect(result.skipped).toEqual(["p-fb: already posted this month"]);
      expect(updateLeadBufferPostedVariantKeys).not.toHaveBeenCalled();
    });

    it("prunes stale posted-variant keys from a prior pack (mid-month regenerate) so new content is postable again", async () => {
      getLeadBySlug.mockResolvedValue(
        fakeLead({
          bufferProfileIds: ["p-fb"],
          // Stale key from a previous pack generation — different generatedAt.
          bufferPostedVariantKeys: ["2026-06-01T00:00:00.000Z|p-fb|facebook_caption|0"],
        }),
      );
      getMarketingPack.mockResolvedValue(
        fakePack({
          generatedAt: "2026-07-05T00:00:00.000Z",
          variants: [{ contentType: "facebook_caption", body: "Regenerated FB post" }],
        }),
      );
      listBufferProfiles.mockResolvedValue([{ id: "p-fb", service: "facebook" }]);
      createBufferUpdate.mockResolvedValue({ success: true, updateIds: ["u1"] });

      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(createBufferUpdate).toHaveBeenCalledTimes(1);
      expect(result.scheduled).toEqual(["p-fb"]);
      expect(result.skipped).toEqual([]);
      // The stale prior-pack key is dropped, not carried forward.
      expect(updateLeadBufferPostedVariantKeys).toHaveBeenCalledWith("demo-cafe", [
        "2026-07-05T00:00:00.000Z|p-fb|facebook_caption|0",
      ]);
    });

    it("still reports success when persisting the posted-variant marker fails — the Buffer post already happened", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ bufferProfileIds: ["p-fb"] }));
      getMarketingPack.mockResolvedValue(fakePack());
      listBufferProfiles.mockResolvedValue([{ id: "p-fb", service: "facebook" }]);
      createBufferUpdate.mockResolvedValue({ success: true, updateIds: ["u1"] });
      updateLeadBufferPostedVariantKeys.mockRejectedValue(new Error("Convex down"));

      const { scheduleMarketingPackToBufferAction } = await import("./actions");
      const result = await scheduleMarketingPackToBufferAction("demo-cafe");

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.scheduled).toEqual(["p-fb"]);
      expect(updateLeadBufferPostedVariantKeys).toHaveBeenCalled();
    });
  });
});
