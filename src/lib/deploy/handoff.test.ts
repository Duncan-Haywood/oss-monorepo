import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeployHandoff } from "./types";
import { DEPLOY_HANDOFF_CONVEX_PRIMARY } from "./handoff-persist";

const getDeployHandoffBySlug = vi.fn();
const insertDeployHandoff = vi.fn();
const listDeployHandoffs = vi.fn();
const updateDeployHandoffCustomDomain = vi.fn();
const updateDeployHandoffStatus = vi.fn();
const updateDeployHandoffVercelProject = vi.fn();
const updateLeadStage = vi.fn();

vi.mock("@/lib/db", () => ({
  getDeployHandoffBySlug: (...args: unknown[]) => getDeployHandoffBySlug(...args),
  insertDeployHandoff: (...args: unknown[]) => insertDeployHandoff(...args),
  listDeployHandoffs: (...args: unknown[]) => listDeployHandoffs(...args),
  updateDeployHandoffCustomDomain: (...args: unknown[]) =>
    updateDeployHandoffCustomDomain(...args),
  updateDeployHandoffStatus: (...args: unknown[]) => updateDeployHandoffStatus(...args),
  updateDeployHandoffVercelProject: (...args: unknown[]) =>
    updateDeployHandoffVercelProject(...args),
  updateLeadStage: (...args: unknown[]) => updateLeadStage(...args),
}));

function baseHandoff(overrides: Partial<DeployHandoff> = {}): DeployHandoff {
  return {
    id: "deploy_demo-cafe_1",
    leadSlug: "demo-cafe",
    businessName: "Demo Cafe",
    tier: "growth",
    commerceAddon: false,
    stripeSessionId: "cs_1",
    customerEmail: "owner@demo-cafe.test",
    previewUrl: "http://localhost:3000/preview/demo-cafe",
    suggestedHost: "demo-cafe.localsitestudio.com",
    contactFormUrl: "http://localhost:3000/api/contact/demo-cafe",
    dnsInstructions: [],
    status: "awaiting_dns",
    notes: ["Payment received — production handoff queued."],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deploy/handoff", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    getDeployHandoffBySlug.mockReset();
    insertDeployHandoff.mockReset();
    listDeployHandoffs.mockReset();
    updateDeployHandoffCustomDomain.mockReset();
    updateDeployHandoffStatus.mockReset();
    updateDeployHandoffVercelProject.mockReset();
    updateLeadStage.mockReset();
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
    delete process.env.VERCEL_TEAM_ID;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  describe("enqueueProductionHandoff", () => {
    it("returns the existing handoff unchanged when the same stripeSessionId already has a non-failed record (idempotent)", async () => {
      const existing = baseHandoff({ status: "provisioned" });
      getDeployHandoffBySlug.mockResolvedValue(existing);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "growth",
        commerceAddon: false,
        stripeSessionId: "cs_1",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(result).toBe(existing);
      expect(insertDeployHandoff).not.toHaveBeenCalled();
    });

    it("rebuilds when the existing record has status 'failed', even for the same stripeSessionId", async () => {
      const existing = baseHandoff({ status: "failed", stripeSessionId: "cs_1" });
      getDeployHandoffBySlug.mockResolvedValue(existing);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "growth",
        commerceAddon: false,
        stripeSessionId: "cs_1",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(result).not.toBe(existing);
      expect(result.status).toBe("awaiting_dns");
      expect(insertDeployHandoff).toHaveBeenCalledTimes(1);
    });

    it("rebuilds when a new stripeSessionId arrives (upsell), preserving operator-set fields via preserveDeployHandoffOperatorFields", async () => {
      const existing = baseHandoff({
        status: "live",
        stripeSessionId: "cs_old",
        customDomain: "www.democafe.com",
        vercelProjectId: "prj_demo",
      });
      getDeployHandoffBySlug.mockResolvedValue(existing);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "complete",
        commerceAddon: true,
        stripeSessionId: "cs_new",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(result.status).toBe("live");
      expect(result.customDomain).toBe("www.democafe.com");
      expect(result.vercelProjectId).toBe("prj_demo");
      expect(insertDeployHandoff).toHaveBeenCalledWith(result, undefined);
    });

    it("passes options through to insertDeployHandoff on a fresh handoff", async () => {
      getDeployHandoffBySlug.mockResolvedValue(null);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      await enqueueProductionHandoff(
        {
          leadSlug: "new-lead",
          businessName: "New Lead",
          tier: "starter",
          commerceAddon: false,
          stripeSessionId: "cs_fresh",
          customerEmail: "owner@new-lead.test",
        },
        DEPLOY_HANDOFF_CONVEX_PRIMARY,
      );

      expect(insertDeployHandoff).toHaveBeenCalledWith(
        expect.any(Object),
        DEPLOY_HANDOFF_CONVEX_PRIMARY,
      );
    });
  });

  describe("tryProvisionVercelDomain (via enqueueProductionHandoff)", () => {
    it("marks skipped_unconfigured with a note when VERCEL_TOKEN/VERCEL_PROJECT_ID are unset", async () => {
      getDeployHandoffBySlug.mockResolvedValue(null);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "growth",
        commerceAddon: false,
        stripeSessionId: "cs_1",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(result.vercelDomainStatus).toBe("skipped_unconfigured");
      expect(
        result.notes.filter((n) => n.includes("Skipped Vercel domain API")),
      ).toHaveLength(1);
    });

    it("does not duplicate the skip note when re-provisioning an already-skipped handoff", async () => {
      const existing = baseHandoff({
        status: "provisioned",
        vercelDomainStatus: "already_exists",
        stripeSessionId: "cs_old",
        notes: [
          "Payment received — production handoff queued.",
          "Skipped Vercel domain API (set VERCEL_TOKEN + VERCEL_PROJECT_ID, or assign a per-client Vercel project, to enable).",
        ],
      });
      getDeployHandoffBySlug.mockResolvedValue(existing);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "growth",
        commerceAddon: false,
        stripeSessionId: "cs_new",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(
        result.notes.filter((n) => n.includes("Skipped Vercel domain API")),
      ).toHaveLength(1);
      // Progressed status is preserved, so the existing vercelDomainStatus wins
      // over the skip path's ?? default.
      expect(result.vercelDomainStatus).toBe("already_exists");
    });

    it("sets status provisioned and vercelDomainStatus created on a 200 response", async () => {
      process.env.VERCEL_TOKEN = "tok";
      process.env.VERCEL_PROJECT_ID = "prj";
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
      getDeployHandoffBySlug.mockResolvedValue(null);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "growth",
        commerceAddon: false,
        stripeSessionId: "cs_1",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(result.status).toBe("provisioned");
      expect(result.vercelDomainStatus).toBe("created");
    });

    it("never downgrades an already-live handoff to provisioned on a 200 re-provision", async () => {
      process.env.VERCEL_TOKEN = "tok";
      process.env.VERCEL_PROJECT_ID = "prj";
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
      const existing = baseHandoff({ status: "live", stripeSessionId: "cs_old" });
      getDeployHandoffBySlug.mockResolvedValue(existing);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "growth",
        commerceAddon: false,
        stripeSessionId: "cs_new",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(result.status).toBe("live");
    });

    it("treats a 409 response as already_exists and provisions (never downgrading live)", async () => {
      process.env.VERCEL_TOKEN = "tok";
      process.env.VERCEL_PROJECT_ID = "prj";
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 409, text: async () => "domain taken" });
      getDeployHandoffBySlug.mockResolvedValue(null);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "growth",
        commerceAddon: false,
        stripeSessionId: "cs_1",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(result.status).toBe("provisioned");
      expect(result.vercelDomainStatus).toBe("already_exists");
    });

    it("records error_<status> and a truncated body note on a non-2xx, non-409 response", async () => {
      process.env.VERCEL_TOKEN = "tok";
      process.env.VERCEL_PROJECT_ID = "prj";
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
      getDeployHandoffBySlug.mockResolvedValue(null);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "growth",
        commerceAddon: false,
        stripeSessionId: "cs_1",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(result.vercelDomainStatus).toBe("error_500");
      expect(result.notes.some((n) => n.includes("Vercel domain API failed (500)"))).toBe(
        true,
      );
    });

    it("records error_network and never throws when fetch rejects", async () => {
      process.env.VERCEL_TOKEN = "tok";
      process.env.VERCEL_PROJECT_ID = "prj";
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
      getDeployHandoffBySlug.mockResolvedValue(null);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { enqueueProductionHandoff } = await import("./handoff");

      const result = await enqueueProductionHandoff({
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        tier: "growth",
        commerceAddon: false,
        stripeSessionId: "cs_1",
        customerEmail: "owner@demo-cafe.test",
      });

      expect(result.vercelDomainStatus).toBe("error_network");
      expect(result.notes.some((n) => n.includes("ECONNRESET"))).toBe(true);
    });
  });

  describe("assignVercelProjectAndProvision", () => {
    it("returns null when the handoff does not exist", async () => {
      updateDeployHandoffVercelProject.mockResolvedValue(null);
      const { assignVercelProjectAndProvision } = await import("./handoff");

      const result = await assignVercelProjectAndProvision("missing-lead", "prj_1");

      expect(result).toBeNull();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
    });

    it("re-provisions against the newly assigned project and persists the result", async () => {
      const updated = baseHandoff({ vercelProjectId: "prj_1" });
      updateDeployHandoffVercelProject.mockResolvedValue(updated);
      getDeployHandoffBySlug.mockResolvedValue(updated);
      insertDeployHandoff.mockResolvedValue(undefined);
      const { assignVercelProjectAndProvision } = await import("./handoff");

      const result = await assignVercelProjectAndProvision("demo-cafe", "prj_1");

      expect(updateDeployHandoffVercelProject).toHaveBeenCalledWith(
        "demo-cafe",
        "prj_1",
        DEPLOY_HANDOFF_CONVEX_PRIMARY,
      );
      expect(result?.vercelDomainStatus).toBe("skipped_unconfigured");
      expect(insertDeployHandoff).toHaveBeenCalledWith(result, DEPLOY_HANDOFF_CONVEX_PRIMARY);
    });

    it("re-reads before the final upsert so a concurrent Mark live survives the Vercel window", async () => {
      process.env.VERCEL_TOKEN = "tok";
      process.env.VERCEL_PROJECT_ID = "prj";
      const updated = baseHandoff({
        status: "awaiting_dns",
        vercelProjectId: "prj_1",
        notes: ["Payment received — production handoff queued."],
      });
      const markedLiveDuringProvision = baseHandoff({
        status: "live",
        vercelProjectId: "prj_1",
        notes: [
          "Payment received — production handoff queued.",
          "Operator confirmed DNS / publish — lead marked live.",
        ],
      });
      updateDeployHandoffVercelProject.mockResolvedValue(updated);
      getDeployHandoffBySlug.mockResolvedValue(markedLiveDuringProvision);
      insertDeployHandoff.mockResolvedValue(undefined);
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, text: async () => "" });
      const { assignVercelProjectAndProvision } = await import("./handoff");

      const result = await assignVercelProjectAndProvision("demo-cafe", "prj_1");

      expect(result?.status).toBe("live");
      expect(result?.vercelDomainStatus).toBe("created");
      expect(result?.notes).toContain(
        "Operator confirmed DNS / publish — lead marked live.",
      );
      expect(result?.notes.some((n) => n.includes("Vercel domain registered"))).toBe(
        true,
      );
      expect(insertDeployHandoff).toHaveBeenCalledWith(result, DEPLOY_HANDOFF_CONVEX_PRIMARY);
    });
  });

  describe("assignCustomDomainAndProvision", () => {
    it("returns null when the handoff does not exist", async () => {
      updateDeployHandoffCustomDomain.mockResolvedValue(null);
      const { assignCustomDomainAndProvision } = await import("./handoff");

      const result = await assignCustomDomainAndProvision("missing-lead", "www.demo.com");

      expect(result).toBeNull();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
    });

    it("re-provisions against the newly assigned custom domain and persists the result", async () => {
      process.env.VERCEL_TOKEN = "tok";
      process.env.VERCEL_PROJECT_ID = "prj";
      const updated = baseHandoff({ customDomain: "www.demo.com" });
      updateDeployHandoffCustomDomain.mockResolvedValue(updated);
      getDeployHandoffBySlug.mockResolvedValue(updated);
      insertDeployHandoff.mockResolvedValue(undefined);
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, text: async () => "" });
      const { assignCustomDomainAndProvision } = await import("./handoff");

      const result = await assignCustomDomainAndProvision("demo-cafe", "www.demo.com");

      expect(updateDeployHandoffCustomDomain).toHaveBeenCalledWith(
        "demo-cafe",
        "www.demo.com",
        DEPLOY_HANDOFF_CONVEX_PRIMARY,
      );
      expect(result?.customDomain).toBe("www.demo.com");
      // www↔apex: register both aliases on the Vercel project
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const bodies = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => JSON.parse(String(call[1]?.body)),
      );
      expect(bodies).toEqual([
        { name: "www.demo.com" },
        { name: "demo.com" },
      ]);
      expect(insertDeployHandoff).toHaveBeenCalledWith(result, DEPLOY_HANDOFF_CONVEX_PRIMARY);
    });

    it("re-reads before the final upsert so a concurrent Mark live survives the Vercel window", async () => {
      process.env.VERCEL_TOKEN = "tok";
      process.env.VERCEL_PROJECT_ID = "prj";
      const updated = baseHandoff({
        status: "awaiting_dns",
        customDomain: "www.demo.com",
        notes: ["Payment received — production handoff queued."],
      });
      const markedLiveDuringProvision = baseHandoff({
        status: "live",
        customDomain: "www.demo.com",
        notes: [
          "Payment received — production handoff queued.",
          "Operator confirmed DNS / publish — lead marked live.",
        ],
      });
      updateDeployHandoffCustomDomain.mockResolvedValue(updated);
      getDeployHandoffBySlug.mockResolvedValue(markedLiveDuringProvision);
      insertDeployHandoff.mockResolvedValue(undefined);
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, text: async () => "" });
      const { assignCustomDomainAndProvision } = await import("./handoff");

      const result = await assignCustomDomainAndProvision("demo-cafe", "www.demo.com");

      expect(result?.status).toBe("live");
      expect(result?.customDomain).toBe("www.demo.com");
      expect(result?.vercelDomainStatus).toBe("created");
      expect(result?.notes).toContain(
        "Operator confirmed DNS / publish — lead marked live.",
      );
      expect(insertDeployHandoff).toHaveBeenCalledWith(result, DEPLOY_HANDOFF_CONVEX_PRIMARY);
    });
  });

  describe("markHandoffLive", () => {
    it("returns null when no handoff exists for the slug", async () => {
      getDeployHandoffBySlug.mockResolvedValue(null);
      const { markHandoffLive } = await import("./handoff");

      const result = await markHandoffLive("missing-lead");

      expect(result).toBeNull();
      expect(updateDeployHandoffStatus).not.toHaveBeenCalled();
      expect(updateLeadStage).not.toHaveBeenCalled();
    });

    it("updates both the handoff status and the lead's pipeline stage to live", async () => {
      const existing = baseHandoff({ status: "provisioned" });
      const updated = baseHandoff({ status: "live" });
      getDeployHandoffBySlug.mockResolvedValue(existing);
      updateDeployHandoffStatus.mockResolvedValue(updated);
      updateLeadStage.mockResolvedValue(undefined);
      const { markHandoffLive } = await import("./handoff");

      const result = await markHandoffLive("demo-cafe");

      expect(updateDeployHandoffStatus).toHaveBeenCalledWith(
        "demo-cafe",
        "live",
        ["Operator confirmed DNS / publish — lead marked live."],
        DEPLOY_HANDOFF_CONVEX_PRIMARY,
      );
      expect(updateLeadStage).toHaveBeenCalledWith(
        "demo-cafe",
        "live",
        DEPLOY_HANDOFF_CONVEX_PRIMARY,
      );
      expect(result).toBe(updated);
    });

    it("does not advance lead stage when handoff status update returns null", async () => {
      // Race: handoff existed on the initial get, then vanished before the
      // status write (or the write backend has no row). Marking the lead live
      // would leave stage=live with no handoff — operator sees failure UI
      // while paid-not-live / open-handoff metrics diverge.
      getDeployHandoffBySlug.mockResolvedValue(baseHandoff({ status: "provisioned" }));
      updateDeployHandoffStatus.mockResolvedValue(null);
      const { markHandoffLive } = await import("./handoff");

      const result = await markHandoffLive("demo-cafe");

      expect(result).toBeNull();
      expect(updateDeployHandoffStatus).toHaveBeenCalledOnce();
      expect(updateLeadStage).not.toHaveBeenCalled();
    });
  });

  describe("getHandoffsForOperator", () => {
    it("delegates to listDeployHandoffs", async () => {
      const handoffs = [baseHandoff()];
      listDeployHandoffs.mockResolvedValue(handoffs);
      const { getHandoffsForOperator } = await import("./handoff");

      const result = await getHandoffsForOperator();

      expect(result).toBe(handoffs);
    });
  });
});
