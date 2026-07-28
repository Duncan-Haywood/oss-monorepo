import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sendOperatorDigestEmail (src/lib/digest/send-operator-digest.ts) is the
 * digest-build-and-send body shared by both triggers: the operator's manual
 * "Send daily digest" dashboard button (sendDailyDigestAction, already
 * covered end to end by send-daily-digest-action.test.ts) and the automated
 * GET /api/cron/daily-digest route (route.test.ts). This suite locks the
 * shared helper's own contract directly — ledger-read wiring, digest
 * building, and success/failure/mock result shaping — independent of either
 * caller's own auth/rate-limit/env gating.
 */

const getLeads = vi.fn();
const listUnrepliedInquiries = vi.fn();
const listOpenCheckoutSessions = vi.fn();
const listOrders = vi.fn();
const listMarketingPacksForMonth = vi.fn();
const listCommerceCatalogs = vi.fn();
const listClientVoicePacks = vi.fn();
const listUnpaidCommerceOrders = vi.fn();
const listCommerceOrdersRefunded = vi.fn();
const listCommerceOrdersDisputed = vi.fn();
const listCommerceOrdersMissingClientReceipt = vi.fn();
const listDeployHandoffs = vi.fn();
const getSuppressedEmails = vi.fn();
const listCronRuns = vi.fn();

vi.mock("@/lib/db", () => ({
  getLeads: (...args: unknown[]) => getLeads(...args),
  listUnrepliedInquiries: (...args: unknown[]) => listUnrepliedInquiries(...args),
  listOpenCheckoutSessions: (...args: unknown[]) => listOpenCheckoutSessions(...args),
  listOrders: (...args: unknown[]) => listOrders(...args),
  listMarketingPacksForMonth: (...args: unknown[]) => listMarketingPacksForMonth(...args),
  listCommerceCatalogs: (...args: unknown[]) => listCommerceCatalogs(...args),
  listClientVoicePacks: (...args: unknown[]) => listClientVoicePacks(...args),
  listUnpaidCommerceOrders: (...args: unknown[]) => listUnpaidCommerceOrders(...args),
  listCommerceOrdersRefunded: (...args: unknown[]) => listCommerceOrdersRefunded(...args),
  listCommerceOrdersDisputed: (...args: unknown[]) => listCommerceOrdersDisputed(...args),
  listCommerceOrdersMissingClientReceipt: (...args: unknown[]) =>
    listCommerceOrdersMissingClientReceipt(...args),
  listDeployHandoffs: (...args: unknown[]) => listDeployHandoffs(...args),
  getSuppressedEmails: (...args: unknown[]) => getSuppressedEmails(...args),
  listCronRuns: (...args: unknown[]) => listCronRuns(...args),
}));

const sendOperatorDailyDigest = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendOperatorDailyDigest: (...args: unknown[]) => sendOperatorDailyDigest(...args),
}));

describe("sendOperatorDigestEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    getLeads.mockReset().mockResolvedValue([]);
    listUnrepliedInquiries.mockReset().mockResolvedValue([]);
    listOpenCheckoutSessions.mockReset().mockResolvedValue([]);
    listOrders.mockReset().mockResolvedValue([]);
    listMarketingPacksForMonth.mockReset().mockResolvedValue([]);
    listCommerceCatalogs.mockReset().mockResolvedValue([]);
    listClientVoicePacks.mockReset().mockResolvedValue([]);
    listUnpaidCommerceOrders.mockReset().mockResolvedValue([]);
    listCommerceOrdersRefunded.mockReset().mockResolvedValue([]);
    listCommerceOrdersDisputed.mockReset().mockResolvedValue([]);
    listCommerceOrdersMissingClientReceipt.mockReset().mockResolvedValue([]);
    listDeployHandoffs.mockReset().mockResolvedValue([]);
    getSuppressedEmails.mockReset().mockResolvedValue([]);
    listCronRuns.mockReset().mockResolvedValue([]);
    sendOperatorDailyDigest.mockReset().mockResolvedValue({ success: true, mock: true });
  });

  it("reads every uncapped ledger feed and sends the built digest", async () => {
    const { sendOperatorDigestEmail } = await import("./send-operator-digest");
    const result = await sendOperatorDigestEmail("ops@example.com", "http://localhost:3000");

    expect(getLeads).toHaveBeenCalledOnce();
    expect(listUnrepliedInquiries).toHaveBeenCalledOnce();
    expect(listOpenCheckoutSessions).toHaveBeenCalledOnce();
    expect(listOrders).toHaveBeenCalledOnce();
    expect(listMarketingPacksForMonth).toHaveBeenCalledOnce();
    const [yearMonth] = listMarketingPacksForMonth.mock.calls[0]!;
    expect(yearMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(listCommerceCatalogs).toHaveBeenCalledOnce();
    expect(listClientVoicePacks).toHaveBeenCalledOnce();
    expect(listUnpaidCommerceOrders).toHaveBeenCalledOnce();
    expect(listCommerceOrdersRefunded).toHaveBeenCalledOnce();
    expect(listCommerceOrdersDisputed).toHaveBeenCalledOnce();
    expect(listCommerceOrdersMissingClientReceipt).toHaveBeenCalledOnce();
    expect(listDeployHandoffs).toHaveBeenCalledOnce();
    expect(getSuppressedEmails).toHaveBeenCalledOnce();
    expect(listCronRuns).toHaveBeenCalledOnce();

    expect(sendOperatorDailyDigest).toHaveBeenCalledOnce();
    const [to, html] = sendOperatorDailyDigest.mock.calls[0]!;
    expect(to).toBe("ops@example.com");
    expect(typeof html).toBe("string");
    expect(html).toContain("Nothing urgent today");

    expect(result).toEqual({
      success: true,
      mock: true,
      digest: expect.objectContaining({ isEmpty: true }),
    });
  });

  it("threads the resolved appUrl into digest hrefs", async () => {
    listUnrepliedInquiries.mockResolvedValue([
      {
        id: "inq_1",
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        name: "Alex",
        email: "alex@example.com",
        message: "Need a site by Friday",
        status: "new",
        source: "contact_form",
        createdAt: "2026-07-13T10:00:00.000Z",
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
    ]);
    const { sendOperatorDigestEmail } = await import("./send-operator-digest");
    const result = await sendOperatorDigestEmail("ops@example.com", "https://app.example.com");
    expect(result.success).toBe(true);
    const html = sendOperatorDailyDigest.mock.calls[0]![1] as string;
    expect(html).toContain("https://app.example.com/dashboard/leads");
  });

  it("surfaces sendOperatorDailyDigest failures", async () => {
    sendOperatorDailyDigest.mockResolvedValue({ success: false, error: "Resend 429" });
    const { sendOperatorDigestEmail } = await import("./send-operator-digest");
    const result = await sendOperatorDigestEmail("ops@example.com", "http://localhost:3000");
    expect(result).toEqual({ success: false, error: "Resend 429" });
  });

  it("uses a generic send failure message when the sender omits error", async () => {
    sendOperatorDailyDigest.mockResolvedValue({ success: false });
    const { sendOperatorDigestEmail } = await import("./send-operator-digest");
    const result = await sendOperatorDigestEmail("ops@example.com", "http://localhost:3000");
    expect(result).toEqual({ success: false, error: "Failed to send daily digest" });
  });

  it("reports mock:false when Resend actually sends", async () => {
    sendOperatorDailyDigest.mockResolvedValue({ success: true, mock: false });
    const { sendOperatorDigestEmail } = await import("./send-operator-digest");
    const result = await sendOperatorDigestEmail("ops@example.com", "http://localhost:3000");
    expect(result).toMatchObject({ success: true, mock: false });
  });
});
