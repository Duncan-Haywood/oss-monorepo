import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeployHandoff } from "@/lib/deploy/types";

/**
 * Action-level orchestration for assignCustomDomainAction — the operator
 * Save domain Host→preview path (DEPLOY_HANDOFF_CONVEX_PRIMARY via
 * assignCustomDomainAndProvision).
 *
 * handoff-persist / custom-domain-routing helper suites cover the
 * requireConvex constant and Host→preview routing. This suite locks the
 * dashboard action glue: requireOperatorAuth, empty slug, trim-to-null
 * clear, no-handoff null, ConvexPrimaryWriteError fail-closed (no
 * revalidate), success revalidate, and Error / non-Error throws.
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

const assignCustomDomainAndProvision = vi.fn();

vi.mock("@/lib/deploy/handoff", () => ({
  markHandoffLive: vi.fn(),
  assignVercelProjectAndProvision: vi.fn(),
  assignCustomDomainAndProvision: (...args: unknown[]) =>
    assignCustomDomainAndProvision(...args),
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

const domainHandoff: DeployHandoff = {
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
  status: "awaiting_dns",
  customDomain: "www.democafe.com",
  notes: ["Custom domain assigned"],
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T12:00:00.000Z",
};

describe("assignCustomDomainAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    assignCustomDomainAndProvision.mockReset().mockResolvedValue(domainHandoff);
  });

  it("returns auth error without assigning a domain", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("demo-cafe", "www.democafe.com");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(assignCustomDomainAndProvision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an empty slug without calling assignCustomDomainAndProvision", async () => {
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("", "www.democafe.com");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(assignCustomDomainAndProvision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("trims whitespace-only domains to null (clear domain)", async () => {
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("demo-cafe", "   ");
    expect(res).toEqual({ success: true, handoff: domainHandoff });
    expect(assignCustomDomainAndProvision).toHaveBeenCalledWith("demo-cafe", null);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("returns not-found when assignCustomDomainAndProvision yields null", async () => {
    assignCustomDomainAndProvision.mockResolvedValue(null);
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("missing-cafe", "www.democafe.com");
    expect(res).toEqual({
      success: false,
      error: "No deploy handoff found for this lead",
    });
    expect(assignCustomDomainAndProvision).toHaveBeenCalledWith(
      "missing-cafe",
      "www.democafe.com",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when Convex primary Save domain rejects", async () => {
    assignCustomDomainAndProvision.mockRejectedValue(
      new MockConvexPrimaryWriteError(),
    );
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("demo-cafe", "www.democafe.com");
    expect(res).toEqual({
      success: false,
      error:
        "Could not save the custom domain in the shared store — routing may still miss on other instances. Retry in a moment.",
    });
    expect(assignCustomDomainAndProvision).toHaveBeenCalledWith(
      "demo-cafe",
      "www.democafe.com",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("assigns a trimmed domain and revalidates dashboard", async () => {
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction(
      "demo-cafe",
      "  www.democafe.com  ",
    );
    expect(res).toEqual({ success: true, handoff: domainHandoff });
    expect(assignCustomDomainAndProvision).toHaveBeenCalledOnce();
    expect(assignCustomDomainAndProvision).toHaveBeenCalledWith(
      "demo-cafe",
      "www.democafe.com",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).not.toHaveBeenCalledWith("/preview/demo-cafe");
  });

  it("surfaces unexpected Error messages from assignCustomDomainAndProvision", async () => {
    assignCustomDomainAndProvision.mockRejectedValue(
      new Error("domains API offline"),
    );
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("demo-cafe", "www.democafe.com");
    expect(res).toEqual({
      success: false,
      error: "domains API offline",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    assignCustomDomainAndProvision.mockRejectedValue("boom");
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("demo-cafe", "www.democafe.com");
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
