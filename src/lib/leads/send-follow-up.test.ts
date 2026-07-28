import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/leads/types";

/**
 * sendOutreachFollowUpEmail (src/lib/leads/send-follow-up.ts) is the
 * mark-then-send body shared by BOTH triggers: the operator's manual "Send
 * Email 2/3" dashboard button (already covered end to end by
 * send-follow-up-action.test.ts) and the automated
 * GET /api/cron/outreach-followups route (route.test.ts). This suite locks
 * the shared helper's own contract directly — next-step derivation, the CAS
 * mark-then-send race guard, and email delegation — independent of either
 * caller's own auth/rate-limit/lead-lookup gating.
 */

const recordLeadOutreach = vi.fn();
vi.mock("@/lib/db", () => ({
  recordLeadOutreach: (...args: unknown[]) => recordLeadOutreach(...args),
}));

vi.mock("@/lib/leads/outreach-persist", () => ({
  OUTREACH_CADENCE_CONVEX_PRIMARY: { requireConvex: true },
}));

const sendOutreachFollowUp2 = vi.fn();
const sendOutreachFollowUp3 = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendOutreachFollowUp2: (...args: unknown[]) => sendOutreachFollowUp2(...args),
  sendOutreachFollowUp3: (...args: unknown[]) => sendOutreachFollowUp3(...args),
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

function outreachLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "demo-cafe",
    businessName: "Demo Cafe",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    tagline: "Coffee and pastry",
    description: "Neighborhood cafe",
    phone: "(303) 555-0100",
    email: "hello@demo-cafe.example",
    services: ["Coffee", "Pastries"],
    hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat 8am–2pm" },
    stage: "outreach_sent",
    outreachStep: 1,
    recommendedTier: "growth",
    dataSource: "manual_entry",
    ...overrides,
  };
}

describe("sendOutreachFollowUpEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    recordLeadOutreach.mockReset().mockResolvedValue(true);
    sendOutreachFollowUp2.mockReset().mockResolvedValue({ success: true, mock: true });
    sendOutreachFollowUp3.mockReset().mockResolvedValue({ success: true, mock: true });
  });

  it("fails without recording when the lead has no email", async () => {
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead({ email: undefined }));
    expect(result).toEqual({ success: false, error: "Lead has no email address" });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
  });

  it("sends Email 2 when outreachStep is 1", async () => {
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead({ outreachStep: 1 }));
    expect(result).toEqual({ success: true, outreachStep: 2, mock: true });
    expect(recordLeadOutreach).toHaveBeenCalledWith("demo-cafe", 2, undefined, { requireConvex: true });
    expect(sendOutreachFollowUp2).toHaveBeenCalledWith("hello@demo-cafe.example", "Demo Cafe", "demo-cafe");
    expect(sendOutreachFollowUp3).not.toHaveBeenCalled();
  });

  it("sends Email 3 when outreachStep is 2", async () => {
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead({ outreachStep: 2 }));
    expect(result).toEqual({ success: true, outreachStep: 3, mock: true });
    expect(recordLeadOutreach).toHaveBeenCalledWith("demo-cafe", 3, undefined, { requireConvex: true });
    expect(sendOutreachFollowUp3).toHaveBeenCalledWith("hello@demo-cafe.example", "Demo Cafe", "demo-cafe");
  });

  it("fails when the sequence is already complete", async () => {
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead({ outreachStep: 3 }));
    expect(result).toEqual({ success: false, error: "Outreach sequence already complete (Email 3 sent)" });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
  });

  it("fails when Email 1 hasn't been sent yet", async () => {
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead({ outreachStep: 0 }));
    expect(result).toEqual({ success: false, error: "Send Email 1 first by setting stage to Outreach Sent" });
  });

  it("fails closed on a ConvexPrimaryWriteError without sending", async () => {
    recordLeadOutreach.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead());
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("Could not record the outreach mark");
    expect(sendOutreachFollowUp2).not.toHaveBeenCalled();
  });

  it("reports the race-guard message when recordLeadOutreach resolves false", async () => {
    recordLeadOutreach.mockResolvedValue(false);
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead());
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("was already sent by another request");
    expect(sendOutreachFollowUp2).not.toHaveBeenCalled();
  });

  it("surfaces a suppressed send outcome after the mark already applied", async () => {
    sendOutreachFollowUp2.mockResolvedValue({ success: false, reason: "suppressed" });
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead());
    expect(result).toEqual({ success: false, error: "Email is on the suppression list", outreachStep: 2 });
  });

  it("surfaces a Resend failure after the mark already applied", async () => {
    sendOutreachFollowUp2.mockResolvedValue({ success: false, error: "Resend 429" });
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead());
    expect(result).toEqual({ success: false, error: "Resend 429", outreachStep: 2 });
  });

  it("reports mock:false when Resend actually sends", async () => {
    sendOutreachFollowUp2.mockResolvedValue({ success: true, mock: false });
    const { sendOutreachFollowUpEmail } = await import("./send-follow-up");
    const result = await sendOutreachFollowUpEmail(outreachLead());
    expect(result).toEqual({ success: true, outreachStep: 2, mock: false });
  });
});
