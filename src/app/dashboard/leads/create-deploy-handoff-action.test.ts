import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/leads/types";
import type { DeployHandoff } from "@/lib/deploy/types";

/**
 * Action-level orchestration for createDeployHandoffForLeadAction — the
 * manual remedy for a lead promoted to stage="paid" (stage dropdown or CSV
 * import) with no deploy_handoffs row, since enqueueProductionHandoff is
 * otherwise only ever invoked from the Stripe webhook (see
 * paid-not-live-dashboard-panel-and-remedy).
 *
 * Locks: requireOperatorAuth, empty/over-long slug, lead-not-found,
 * non-paid-stage rejection, existing-handoff rejection (the manual
 * idempotency pre-check, since a synthetic stripeSessionId can never match
 * enqueueProductionHandoff's own dedup key), ConvexPrimaryWriteError fail
 * closed, success revalidate, and Error / non-Error throws.
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

const getLeadBySlug = vi.fn();
const getDeployHandoffBySlug = vi.fn();
vi.mock("@/lib/db", () => ({
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  getDeployHandoffBySlug: (...args: unknown[]) => getDeployHandoffBySlug(...args),
}));

const enqueueProductionHandoff = vi.fn();
vi.mock("@/lib/deploy/handoff", () => ({
  markHandoffLive: vi.fn(),
  assignVercelProjectAndProvision: vi.fn(),
  assignCustomDomainAndProvision: vi.fn(),
  enqueueProductionHandoff: (...args: unknown[]) => enqueueProductionHandoff(...args),
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

const paidLead: Lead = {
  slug: "demo-cafe",
  businessName: "Demo Cafe",
  category: "restaurant",
  city: "Denver",
  state: "CO",
  tagline: "Local favorites",
  description: "A cafe",
  phone: "(555) 000-0000",
  email: "owner@demo.cafe",
  services: [],
  hours: { weekday: "Mon-Fri 9-5", weekend: "Closed" },
  stage: "paid",
  recommendedTier: "growth",
};

const createdHandoff: DeployHandoff = {
  id: "handoff_demo",
  leadSlug: "demo-cafe",
  businessName: "Demo Cafe",
  tier: "growth",
  commerceAddon: false,
  stripeSessionId: "manual_demo-cafe_1234",
  customerEmail: "owner@demo.cafe",
  previewUrl: "https://example.com/preview/demo-cafe",
  suggestedHost: "demo-cafe.example.com",
  contactFormUrl: "https://example.com/api/contact/demo-cafe",
  dnsInstructions: [],
  status: "awaiting_dns",
  notes: [],
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("createDeployHandoffForLeadAction", () => {
  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    headersMock.mockReset().mockResolvedValue(headerStore());
    getLeadBySlug.mockReset().mockResolvedValue(paidLead);
    getDeployHandoffBySlug.mockReset().mockResolvedValue(null);
    enqueueProductionHandoff.mockReset().mockResolvedValue(createdHandoff);
  });

  it("returns auth error without touching the lead or handoff store", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const res = await createDeployHandoffForLeadAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(enqueueProductionHandoff).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rate-limits repeated calls from the same IP (auth alone is not a throttle)", async () => {
    const { createDeployHandoffForLeadAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await createDeployHandoffForLeadAction("demo-cafe");
      expect(res.success).toBe(true);
    }
    getLeadBySlug.mockClear();
    enqueueProductionHandoff.mockClear();
    const res = await createDeployHandoffForLeadAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(enqueueProductionHandoff).not.toHaveBeenCalled();
  });

  it("rejects an empty slug without calling getLeadBySlug", async () => {
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const res = await createDeployHandoffForLeadAction("");
    expect(res).toEqual({ success: false, error: "Slug is required" });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long slug before any lookup", async () => {
    const { MAX_LEAD_SLUG_LENGTH } = await import("@/lib/leads/slug");
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const over = "a".repeat(MAX_LEAD_SLUG_LENGTH + 1);
    const res = await createDeployHandoffForLeadAction(over);
    expect(res).toEqual({ success: false, error: "Slug is too long" });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("returns not-found when the lead does not exist", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const res = await createDeployHandoffForLeadAction("missing-cafe");
    expect(res).toEqual({ success: false, error: "Lead not found" });
    expect(enqueueProductionHandoff).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a lead that is not at the paid stage", async () => {
    getLeadBySlug.mockResolvedValue({ ...paidLead, stage: "live" });
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const res = await createDeployHandoffForLeadAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead is not at the Paid stage",
    });
    expect(enqueueProductionHandoff).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when a deploy handoff already exists for this lead", async () => {
    getDeployHandoffBySlug.mockResolvedValue(createdHandoff);
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const res = await createDeployHandoffForLeadAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "A deploy handoff already exists for this lead",
    });
    expect(enqueueProductionHandoff).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("creates the handoff from the lead's own recommendedTier/email and revalidates", async () => {
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const res = await createDeployHandoffForLeadAction("demo-cafe");
    expect(res).toEqual({ success: true, handoff: createdHandoff });
    expect(enqueueProductionHandoff).toHaveBeenCalledOnce();
    const [input, options] = enqueueProductionHandoff.mock.calls[0];
    expect(input.leadSlug).toBe("demo-cafe");
    expect(input.businessName).toBe("Demo Cafe");
    expect(input.tier).toBe("growth");
    expect(input.commerceAddon).toBe(false);
    expect(input.customerEmail).toBe("owner@demo.cafe");
    expect(input.stripeSessionId).toMatch(/^manual_demo-cafe_\d+$/);
    expect(options).toEqual({ requireConvex: true });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("falls back to an empty customerEmail when the lead has none on file", async () => {
    getLeadBySlug.mockResolvedValue({ ...paidLead, email: undefined });
    const { createDeployHandoffForLeadAction } = await import("./actions");
    await createDeployHandoffForLeadAction("demo-cafe");
    const [input] = enqueueProductionHandoff.mock.calls[0];
    expect(input.customerEmail).toBe("");
  });

  it("fails closed when Convex primary write rejects", async () => {
    enqueueProductionHandoff.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const res = await createDeployHandoffForLeadAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Could not record the new handoff in the shared store. Retry in a moment.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages", async () => {
    enqueueProductionHandoff.mockRejectedValue(new Error("handoff store offline"));
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const res = await createDeployHandoffForLeadAction("demo-cafe");
    expect(res).toEqual({ success: false, error: "handoff store offline" });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "createDeployHandoffForLeadAction",
    });
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    enqueueProductionHandoff.mockRejectedValue("boom");
    const { createDeployHandoffForLeadAction } = await import("./actions");
    const res = await createDeployHandoffForLeadAction("demo-cafe");
    expect(res).toEqual({ success: false, error: "Unknown error" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
