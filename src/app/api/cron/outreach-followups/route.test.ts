import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import type { Lead } from "@/lib/leads/types";

/**
 * GET /api/cron/outreach-followups — the automated trigger for cold-outreach
 * Email 2/3 follow-ups (see outreach-followup-cron-automation in
 * BUSINESS_DECISIONS). Locks: CRON_SECRET bearer-auth gate (shared with the
 * other two cron routes via src/lib/security/cron-secret.ts), per-IP rate
 * limiting after auth, the due-queue computation, and per-lead
 * success/failure aggregation — the actual mark-then-send body is already
 * covered directly by send-follow-up.test.ts.
 */

const sendOutreachFollowUpEmail = vi.fn();
vi.mock("@/lib/leads/send-follow-up", () => ({
  sendOutreachFollowUpEmail: (...args: unknown[]) => sendOutreachFollowUpEmail(...args),
}));

const getLeads = vi.fn();
vi.mock("@/lib/db", () => ({
  getLeads: (...args: unknown[]) => getLeads(...args),
}));

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

function cronRequest(options?: { bearer?: string; ip?: string }) {
  const headers: Record<string, string> = { "x-forwarded-for": options?.ip ?? "203.0.113.9" };
  if (options?.bearer !== undefined) {
    headers.authorization = `Bearer ${options.bearer}`;
  }
  return new Request("http://localhost/api/cron/outreach-followups", { headers });
}

function dueLead(overrides: Partial<Lead> = {}): Lead {
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
    lastOutreachAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    recommendedTier: "growth",
    dataSource: "manual_entry",
    ...overrides,
  };
}

describe("GET /api/cron/outreach-followups", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    resetRateLimiterForTests();
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = "test-cron-secret-value";
    getLeads.mockReset().mockResolvedValue([]);
    sendOutreachFollowUpEmail.mockReset().mockResolvedValue({ success: true, outreachStep: 2, mock: true });
    captureError.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 501 and never reads leads when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "anything" }));
    expect(response.status).toBe(501);
    expect(getLeads).not.toHaveBeenCalled();
  });

  it("returns 401 with no Authorization header", async () => {
    const { GET } = await import("./route");
    const response = await GET(cronRequest());
    expect(response.status).toBe(401);
    expect(getLeads).not.toHaveBeenCalled();
  });

  it("returns 401 for a same-length wrong bearer token", async () => {
    const wrongSameLength = "x".repeat(process.env.CRON_SECRET!.length);
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: wrongSameLength }));
    expect(response.status).toBe(401);
  });

  it("returns 200 with nothing attempted when no lead is due", async () => {
    getLeads.mockResolvedValue([dueLead({ stage: "paid" })]);
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, attempted: 0, sent: 0, failed: 0, failures: [] });
    expect(sendOutreachFollowUpEmail).not.toHaveBeenCalled();
  });

  it("sends a due follow-up via the shared helper", async () => {
    getLeads.mockResolvedValue([dueLead()]);
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, attempted: 1, sent: 1, failed: 0, failures: [] });
    expect(sendOutreachFollowUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "demo-cafe" }),
    );
  });

  it("excludes a snoozed lead from the due queue", async () => {
    getLeads.mockResolvedValue([
      dueLead({ snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }),
    ]);
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    const body = await response.json();
    expect(body).toEqual({ success: true, attempted: 0, sent: 0, failed: 0, failures: [] });
    expect(sendOutreachFollowUpEmail).not.toHaveBeenCalled();
  });

  it("aggregates a per-lead failure without aborting the batch, and captures it", async () => {
    getLeads.mockResolvedValue([dueLead(), dueLead({ slug: "demo-bakery" })]);
    sendOutreachFollowUpEmail
      .mockResolvedValueOnce({ success: false, error: "Email is on the suppression list", outreachStep: 2 })
      .mockResolvedValueOnce({ success: true, outreachStep: 2, mock: true });
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      attempted: 2,
      sent: 1,
      failed: 1,
      failures: [{ slug: "demo-cafe", error: "Email is on the suppression list" }],
    });
    expect(sendOutreachFollowUpEmail).toHaveBeenCalledTimes(2);
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "cron-outreach-followups",
      failures: [{ slug: "demo-cafe", error: "Email is on the suppression list" }],
    });
  });

  it("returns 500 and captures the error when a ledger read throws", async () => {
    getLeads.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: "db unavailable" });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), { component: "cron-outreach-followups" });
  });

  it("rate-limits repeated calls from the same IP after auth succeeds", async () => {
    const { GET } = await import("./route");
    for (let i = 0; i < 5; i++) {
      const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
      expect(response.status).toBe(200);
    }
    getLeads.mockClear();
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(429);
    expect(getLeads).not.toHaveBeenCalled();
  });
});
