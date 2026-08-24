import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for unsuppressEmailAction — the operator
 * dashboard's SuppressedEmailsPanel Remove control
 * (OPERATOR_UNSUPPRESS_CONVEX_PRIMARY fail-closed on the shared suppression
 * list).
 *
 * suppression-persist.test.ts covers the requireConvex constant itself.
 * This suite locks the dashboard action glue: requireOperatorAuth, rate
 * limiting, empty/over-length email hard-reject before any DB call, the
 * isEmailSuppressed not-found-style existence check (mirrors
 * update-lead-stage-action-existence-check for a non-slug-keyed record),
 * ConvexPrimaryWriteError fail-closed, a race where unsuppressEmail itself
 * resolves false, success + revalidate, and Error / non-Error throws.
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

const isEmailSuppressed = vi.fn();
const unsuppressEmail = vi.fn();

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
  isEmailSuppressed: (...args: unknown[]) => isEmailSuppressed(...args),
  unsuppressEmail: (...args: unknown[]) => unsuppressEmail(...args),
}));

vi.mock("@/lib/email/suppression-persist", () => ({
  OPERATOR_UNSUPPRESS_CONVEX_PRIMARY: { requireConvex: true },
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

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("unsuppressEmailAction", () => {
  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    isEmailSuppressed.mockReset().mockResolvedValue(true);
    unsuppressEmail.mockReset().mockResolvedValue(true);
  });

  it("returns auth error without checking or removing the address", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { unsuppressEmailAction } = await import("./actions");
    const res = await unsuppressEmailAction("buyer@example.com");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(isEmailSuppressed).not.toHaveBeenCalled();
    expect(unsuppressEmail).not.toHaveBeenCalled();
  });

  it("rate-limits repeated removals from the same IP (auth alone is not a throttle)", async () => {
    const { unsuppressEmailAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await unsuppressEmailAction("buyer@example.com");
      expect(res.success).toBe(true);
    }
    unsuppressEmail.mockClear();
    const res = await unsuppressEmailAction("buyer@example.com");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(unsuppressEmail).not.toHaveBeenCalled();
  });

  it("rejects an empty email before any DB call", async () => {
    const { unsuppressEmailAction } = await import("./actions");
    const res = await unsuppressEmailAction("   ");
    expect(res).toEqual({ success: false, error: "Email is required" });
    expect(isEmailSuppressed).not.toHaveBeenCalled();
    expect(unsuppressEmail).not.toHaveBeenCalled();
  });

  it("hard-rejects an over-length email before any DB call (opaque lookup key, not free text)", async () => {
    const { MAX_CONTACT_EMAIL_LENGTH } = await import("@/lib/inquiries/contact-fields");
    const { unsuppressEmailAction } = await import("./actions");
    const over = `${"a".repeat(MAX_CONTACT_EMAIL_LENGTH)}@example.com`;
    const res = await unsuppressEmailAction(over);
    expect(res).toEqual({ success: false, error: "Email is too long" });
    expect(isEmailSuppressed).not.toHaveBeenCalled();
    expect(unsuppressEmail).not.toHaveBeenCalled();
  });

  it("returns not-on-list and never writes when the address is not currently suppressed", async () => {
    isEmailSuppressed.mockResolvedValue(false);
    const { unsuppressEmailAction } = await import("./actions");
    const res = await unsuppressEmailAction("buyer@example.com");
    expect(res).toEqual({
      success: false,
      error: "Address is not on the suppression list",
    });
    expect(unsuppressEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("removes a suppressed address with OPERATOR_UNSUPPRESS_CONVEX_PRIMARY and revalidates", async () => {
    const { unsuppressEmailAction } = await import("./actions");
    const res = await unsuppressEmailAction("  Buyer@Example.com  ");
    expect(res).toEqual({ success: true });
    expect(isEmailSuppressed).toHaveBeenCalledWith("Buyer@Example.com");
    expect(unsuppressEmail).toHaveBeenCalledWith("Buyer@Example.com", {
      requireConvex: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("fails closed when the Convex primary unsuppress write rejects", async () => {
    unsuppressEmail.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { unsuppressEmailAction } = await import("./actions");
    const res = await unsuppressEmailAction("buyer@example.com");
    expect(res).toEqual({
      success: false,
      error:
        "Could not remove the address in the shared store — other instances may still treat it as suppressed. Retry in a moment.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns not-on-list when unsuppressEmail itself resolves false (concurrent removal race)", async () => {
    unsuppressEmail.mockResolvedValue(false);
    const { unsuppressEmailAction } = await import("./actions");
    const res = await unsuppressEmailAction("buyer@example.com");
    expect(res).toEqual({
      success: false,
      error: "Address is not on the suppression list",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages from the unsuppress write", async () => {
    unsuppressEmail.mockRejectedValue(new Error("db offline"));
    const { unsuppressEmailAction } = await import("./actions");
    const res = await unsuppressEmailAction("buyer@example.com");
    expect(res).toEqual({ success: false, error: "db offline" });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "unsuppressEmailAction",
    });
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    unsuppressEmail.mockRejectedValue("boom");
    const { unsuppressEmailAction } = await import("./actions");
    const res = await unsuppressEmailAction("buyer@example.com");
    expect(res).toEqual({ success: false, error: "Unknown error" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
