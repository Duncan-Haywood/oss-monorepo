import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeployHandoff } from "@/lib/deploy/types";

/**
 * Action-level orchestration for assignCustomDomainAction — the operator
 * Save domain Host→preview path (DEPLOY_HANDOFF_CONVEX_PRIMARY via
 * assignCustomDomainAndProvision).
 *
 * handoff-persist / custom-domain-routing helper suites cover the
 * requireConvex constant and Host→preview routing + host normalize.
 * This suite locks the dashboard action glue: requireOperatorAuth, empty
 * slug, trim-to-null clear, URL→bare-host normalize, invalid reject,
 * no-handoff null, ConvexPrimaryWriteError fail-closed (no revalidate),
 * success revalidate, and Error / non-Error throws.
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

const getLeadSlugByCustomDomain = vi.fn();

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
  getLeadSlugByCustomDomain: (...args: unknown[]) =>
    getLeadSlugByCustomDomain(...args),
}));

const assignCustomDomainAndProvision = vi.fn();

vi.mock("@/lib/deploy/handoff", () => ({
  markHandoffLive: vi.fn(),
  assignVercelProjectAndProvision: vi.fn(),
  assignCustomDomainAndProvision: (...args: unknown[]) =>
    assignCustomDomainAndProvision(...args),
  productionRootDomain: () => "localsitestudio.com",
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
    getLeadSlugByCustomDomain.mockReset().mockResolvedValue(null);
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
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("normalizes scheme/path paste to a bare hostname before assign", async () => {
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction(
      "demo-cafe",
      "https://www.democafe.com/path",
    );
    expect(res).toEqual({ success: true, handoff: domainHandoff });
    expect(assignCustomDomainAndProvision).toHaveBeenCalledWith(
      "demo-cafe",
      "www.democafe.com",
    );
    expect(getLeadSlugByCustomDomain).toHaveBeenCalledWith("www.democafe.com");
  });

  it("rejects invalid domain input without calling provision", async () => {
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("demo-cafe", "not a domain");
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(res.error).toMatch(/hostname|Domain/i);
    expect(assignCustomDomainAndProvision).not.toHaveBeenCalled();
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
  });

  it("rejects a domain already owned by another lead", async () => {
    getLeadSlugByCustomDomain.mockResolvedValue("other-salon");
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("demo-cafe", "www.democafe.com");
    expect(res).toEqual({
      success: false,
      error:
        "Domain www.democafe.com is already saved on lead other-salon — clear it there first, or pick a different host",
    });
    expect(assignCustomDomainAndProvision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("allows the same lead to re-save its own domain", async () => {
    getLeadSlugByCustomDomain.mockResolvedValue("demo-cafe");
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction("demo-cafe", "www.democafe.com");
    expect(res).toEqual({ success: true, handoff: domainHandoff });
    expect(assignCustomDomainAndProvision).toHaveBeenCalledWith(
      "demo-cafe",
      "www.democafe.com",
    );
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

  it("strips scheme/path/port from a URL paste before assign", async () => {
    const { assignCustomDomainAction } = await import("./actions");
    const res = await assignCustomDomainAction(
      "demo-cafe",
      "https://WWW.DemoCafe.com:443/menu?ref=1",
    );
    expect(res).toEqual({ success: true, handoff: domainHandoff });
    expect(assignCustomDomainAndProvision).toHaveBeenCalledWith(
      "demo-cafe",
      "www.democafe.com",
    );
  });

  it("rejects invalid and platform-owned domains without calling assign", async () => {
    const { assignCustomDomainAction } = await import("./actions");
    const invalid = await assignCustomDomainAction("demo-cafe", "not a domain");
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error).toMatch(/domain/i);
    }
    const platform = await assignCustomDomainAction(
      "demo-cafe",
      "localsitestudio.com",
    );
    expect(platform.success).toBe(false);
    expect(assignCustomDomainAndProvision).not.toHaveBeenCalled();
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
