import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeployHandoff } from "@/lib/deploy/types";
import { MAX_VERCEL_PROJECT_ID_LENGTH } from "@/lib/deploy/vercel-project-id";

/**
 * Action-level orchestration for assignVercelProjectAction — the operator
 * Assign Vercel project path (DEPLOY_HANDOFF_CONVEX_PRIMARY via
 * assignVercelProjectAndProvision + Domains API provision).
 *
 * handoff-persist / handoff helper suites cover the requireConvex constant
 * and the field writes. This suite locks the dashboard action glue:
 * requireOperatorAuth, empty slug, trim / clear project id, over-long
 * hard-reject (parseVercelProjectId), no-handoff null,
 * ConvexPrimaryWriteError fail-closed (no revalidate), success revalidate,
 * and Error / non-Error throws.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
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

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: vi.fn(),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
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

const assignVercelProjectAndProvision = vi.fn();

vi.mock("@/lib/deploy/handoff", () => ({
  markHandoffLive: vi.fn(),
  assignVercelProjectAndProvision: (...args: unknown[]) =>
    assignVercelProjectAndProvision(...args),
  assignCustomDomainAndProvision: vi.fn(),
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

const assignedHandoff: DeployHandoff = {
  id: "handoff_demo",
  leadSlug: "demo-cafe",
  businessName: "Demo Cafe",
  tier: "starter",
  commerceAddon: false,
  stripeSessionId: "cs_test_demo",
  customerEmail: "owner@demo.cafe",
  previewUrl: "https://example.com/preview/demo-cafe",
  suggestedHost: "demo-cafe.example.com",
  contactFormUrl: "https://example.com/api/contact/demo-cafe",
  dnsInstructions: [],
  status: "provisioned",
  notes: ["Assigned Vercel project"],
  vercelProjectId: "prj_demo_isolated",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T12:00:00.000Z",
};

const clearedHandoff: DeployHandoff = {
  ...assignedHandoff,
  vercelProjectId: undefined,
  notes: ["Cleared dedicated Vercel project"],
};

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("assignVercelProjectAction", () => {
  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    headersMock.mockReset().mockResolvedValue(headerStore());
    assignVercelProjectAndProvision.mockReset().mockResolvedValue(assignedHandoff);
  });

  it("rate-limits repeated calls from the same IP (auth alone is not a throttle)", async () => {
    const { assignVercelProjectAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await assignVercelProjectAction("demo-cafe", "prj_demo_isolated");
      expect(res.success).toBe(true);
    }
    assignVercelProjectAndProvision.mockClear();
    revalidatePath.mockClear();
    const res = await assignVercelProjectAction("demo-cafe", "prj_demo_isolated");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(assignVercelProjectAndProvision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns auth error without assigning a project", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("demo-cafe", "prj_demo");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(assignVercelProjectAndProvision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an empty slug without calling assignVercelProjectAndProvision", async () => {
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("", "prj_demo");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(assignVercelProjectAndProvision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("trims the project id before provisioning", async () => {
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("demo-cafe", "  prj_demo_isolated  ");
    expect(res).toEqual({ success: true, handoff: assignedHandoff });
    expect(assignVercelProjectAndProvision).toHaveBeenCalledWith(
      "demo-cafe",
      "prj_demo_isolated",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).not.toHaveBeenCalledWith("/preview/demo-cafe");
  });

  it("passes null when the project id is blank or whitespace-only (clear)", async () => {
    assignVercelProjectAndProvision.mockResolvedValue(clearedHandoff);
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("demo-cafe", "   ");
    expect(res).toEqual({ success: true, handoff: clearedHandoff });
    expect(assignVercelProjectAndProvision).toHaveBeenCalledWith("demo-cafe", null);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("hard-rejects an over-long project id before provisioning", async () => {
    const { assignVercelProjectAction } = await import("./actions");
    const over = "a".repeat(MAX_VERCEL_PROJECT_ID_LENGTH + 1);
    const res = await assignVercelProjectAction("demo-cafe", over);
    expect(res).toEqual({
      success: false,
      error: "Vercel project ID is too long",
    });
    expect(assignVercelProjectAndProvision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts a project id at the max length", async () => {
    const exact = "a".repeat(MAX_VERCEL_PROJECT_ID_LENGTH);
    assignVercelProjectAndProvision.mockResolvedValue({
      ...assignedHandoff,
      vercelProjectId: exact,
    });
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("demo-cafe", exact);
    expect(res).toEqual({
      success: true,
      handoff: { ...assignedHandoff, vercelProjectId: exact },
    });
    expect(assignVercelProjectAndProvision).toHaveBeenCalledWith("demo-cafe", exact);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("returns not-found when assignVercelProjectAndProvision yields null", async () => {
    assignVercelProjectAndProvision.mockResolvedValue(null);
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("missing-cafe", "prj_demo");
    expect(res).toEqual({
      success: false,
      error: "No deploy handoff found for this lead",
    });
    expect(assignVercelProjectAndProvision).toHaveBeenCalledWith(
      "missing-cafe",
      "prj_demo",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when Convex primary Assign Vercel project rejects", async () => {
    assignVercelProjectAndProvision.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("demo-cafe", "prj_demo");
    expect(res).toEqual({
      success: false,
      error:
        "Could not save the Vercel project in the shared store — deploy may still route to the old project elsewhere. Retry in a moment.",
    });
    expect(assignVercelProjectAndProvision).toHaveBeenCalledWith(
      "demo-cafe",
      "prj_demo",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("assigns the project and revalidates the dashboard", async () => {
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("demo-cafe", "prj_demo_isolated");
    expect(res).toEqual({ success: true, handoff: assignedHandoff });
    expect(assignVercelProjectAndProvision).toHaveBeenCalledOnce();
    expect(assignVercelProjectAndProvision).toHaveBeenCalledWith(
      "demo-cafe",
      "prj_demo_isolated",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("surfaces unexpected Error messages from assignVercelProjectAndProvision", async () => {
    assignVercelProjectAndProvision.mockRejectedValue(
      new Error("Vercel Domains API offline"),
    );
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("demo-cafe", "prj_demo");
    expect(res).toEqual({
      success: false,
      error: "Vercel Domains API offline",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "assignVercelProjectAction",
    });
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    assignVercelProjectAndProvision.mockRejectedValue("boom");
    const { assignVercelProjectAction } = await import("./actions");
    const res = await assignVercelProjectAction("demo-cafe", "prj_demo");
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
