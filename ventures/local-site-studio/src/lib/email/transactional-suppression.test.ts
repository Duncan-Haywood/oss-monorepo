import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The marketing opt-out list must not swallow a paid customer's receipt.
 *
 * This venture sells by cold outreach. `GET /api/unsubscribe` suppresses
 * exactly the address that `/checkout` later prefills from the lead row
 * (`lead.email`), so the buyer's address is *routinely* already on the
 * suppression list at the moment they pay $500. `sendEmail` applied that list
 * to every send, receipts included: the customer paid, the receipt and the
 * go-live DNS instructions were both dropped with a `console.warn`, the Stripe
 * webhook still ACKed 200, and no sent-marker recorded the debt.
 *
 * CAN-SPAM's opt-out obligation (15 U.S.C. §7704(a)(3)-(4)) attaches to a
 * *commercial* electronic mail message — primary purpose advertising or
 * promotion (§7702(2)(A)). It does not attach to a transactional or
 * relationship message (§7702(17)(A)), which expressly covers confirming a
 * commercial transaction the recipient has already entered into (clause (i))
 * and delivering the goods or services they are entitled to under it
 * (clause (v)). Withholding the receipt is therefore not compliance — it is
 * the harm, and the opt-out never asked for it.
 *
 * These assertions are on whether `fetch` reached the Resend API, not only on
 * the returned shape: a version that reported success without transmitting, or
 * that transmitted and then reported a refusal, would satisfy a return-value
 * check and still be the bug.
 *
 * NOTE ON MOCKING: only `../db` (the suppression *store*) is stubbed, and only
 * because it imports `server-only`. `./resend` — the module the fix lives in —
 * is imported for real. `webhook/route.test.ts` mocks `@/lib/email/resend`
 * wholesale, which is why its "suppressed receipt" case passed throughout the
 * entire life of this defect.
 */

// Hoisted so the handle survives `vi.resetModules()` between cases.
const { isEmailSuppressed } = vi.hoisted(() => ({ isEmailSuppressed: vi.fn() }));
vi.mock("../db", () => ({ isEmailSuppressed }));

const COMPLIANT_ORIGIN = "https://studio.marisstella.dev";
const COMPLIANT_BRAND = "Local Site Studio";
const COMPLIANT_ADDRESS = "1600 Pearl St Suite 200, Boulder, CO 80302";
const BUYER = "owner@demo-cafe.test";

describe("transactional email bypasses the marketing suppression list", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const originalBrandName = process.env.NEXT_PUBLIC_BRAND_NAME;
  const originalPostal = process.env.NEXT_PUBLIC_COMPANY_ADDRESS;
  let sentBodies: Array<Record<string, unknown>>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    // The CAN-SPAM footer gate must not be what stops (or allows) a send here,
    // or every case below would pass for the wrong reason.
    process.env.NEXT_PUBLIC_APP_URL = COMPLIANT_ORIGIN;
    process.env.NEXT_PUBLIC_BRAND_NAME = COMPLIANT_BRAND;
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS = COMPLIANT_ADDRESS;
    sentBodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBodies.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({ id: "email_test" }) } as Response;
      }),
    );
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    if (originalOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalOrigin;
    if (originalBrandName === undefined) delete process.env.NEXT_PUBLIC_BRAND_NAME;
    else process.env.NEXT_PUBLIC_BRAND_NAME = originalBrandName;
    if (originalPostal === undefined) delete process.env.NEXT_PUBLIC_COMPANY_ADDRESS;
    else process.env.NEXT_PUBLIC_COMPANY_ADDRESS = originalPostal;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /**
   * `ConvexPrimaryReadError` must come from the same module instance
   * `resend.ts` imports, or `instanceof` compares two structurally identical
   * classes from different registries — `vi.resetModules()` makes that real.
   */
  async function load() {
    isEmailSuppressed.mockReset();
    const [resend, { ConvexPrimaryReadError }] = await Promise.all([
      import("./resend"),
      import("../payments/convex-primary"),
    ]);
    return { ...resend, ConvexPrimaryReadError };
  }

  describe("the paid $500 bundle", () => {
    it("delivers the receipt to a buyer who is on the suppression list", async () => {
      const { sendReceiptEmail } = await load();
      isEmailSuppressed.mockResolvedValue(true);

      const result = await sendReceiptEmail(BUYER, "Demo Cafe", "growth", 500);

      expect(sentBodies).toHaveLength(1);
      expect(sentBodies[0].to).toEqual([BUYER]);
      expect(String(sentBodies[0].html)).toContain("$500.00");
      expect(result.success).toBe(true);
      expect("reason" in result && result.reason).not.toBe("suppressed");
    });

    it("delivers the go-live instructions to a buyer who is on the suppression list", async () => {
      // The webhook's DNS-handoff message is a raw sendEmail call, not a helper.
      const { sendEmail } = await load();
      isEmailSuppressed.mockResolvedValue(true);

      const result = await sendEmail({
        to: BUYER,
        subject: "Next steps: go live with Demo Cafe",
        html: "<p>Point your A record at ...</p>",
        kind: "transactional",
        leadSlug: "demo-cafe",
      });

      expect(sentBodies).toHaveLength(1);
      expect(result.success).toBe(true);
    });

    it("does not consult the suppression store at all for a transactional send", async () => {
      // Reading and ignoring would leave the send hostage to the store's
      // availability for no benefit — see the outage case below.
      const { sendReceiptEmail } = await load();
      isEmailSuppressed.mockResolvedValue(true);

      await sendReceiptEmail(BUYER, "Demo Cafe", "growth", 500);

      expect(isEmailSuppressed).not.toHaveBeenCalled();
    });

    it("still delivers the receipt when the suppression store is unreachable", async () => {
      const { sendReceiptEmail, ConvexPrimaryReadError } = await load();
      isEmailSuppressed.mockRejectedValue(
        new ConvexPrimaryReadError("isEmailSuppressed", new Error("connection reset")),
      );

      const result = await sendReceiptEmail(BUYER, "Demo Cafe", "growth", 500);

      expect(sentBodies).toHaveLength(1);
      expect(result.success).toBe(true);
    });

    it("does not tell a receipt recipient they were mailed as a business contact of interest", async () => {
      // The footer sentence is a statement about why the message was sent. On a
      // transactional message the marketing wording is simply untrue.
      const { sendReceiptEmail } = await load();
      isEmailSuppressed.mockResolvedValue(true);

      await sendReceiptEmail(BUYER, "Demo Cafe", "growth", 500);

      const html = String(sentBodies[0].html);
      expect(html).not.toContain("to business contacts of interest");
      // Sender identification and the physical postal address are unconditional.
      expect(html).toContain(COMPLIANT_ADDRESS);
      expect(html).toContain(COMPLIANT_BRAND);
    });
  });

  describe("marketing is still fully suppressed", () => {
    it("refuses a raw marketing send to a suppressed address", async () => {
      const { sendEmail } = await load();
      isEmailSuppressed.mockResolvedValue(true);

      const result = await sendEmail({
        to: BUYER,
        subject: "Ready for more customers?",
        html: "<p>upsell</p>",
        kind: "marketing",
      });

      expect(sentBodies).toHaveLength(0);
      expect(result.success).toBe(false);
      expect("reason" in result && result.reason).toBe("suppressed");
    });

    /**
     * The exhaustive roster. A transactional bypass is only as narrow as the
     * set of messages allowed to use it, so that set is pinned here rather than
     * left to a reviewer to re-derive: flipping any helper below to
     * `kind: "transactional"` fails this test by name.
     *
     * `sendOperatorDailyDigest` is absent deliberately — it never routes
     * through `sendEmail` (internal operator mail, documented in resend.ts).
     */
    const marketingHelpers: Array<[string, (m: Awaited<ReturnType<typeof load>>) => Promise<unknown>]> = [
      ["sendOutreachEmail", (m) => m.sendOutreachEmail(BUYER, "Demo Cafe", "demo-cafe")],
      ["sendOutreachFollowUp2", (m) => m.sendOutreachFollowUp2(BUYER, "Demo Cafe", "demo-cafe")],
      ["sendOutreachFollowUp3", (m) => m.sendOutreachFollowUp3(BUYER, "Demo Cafe", "demo-cafe")],
      [
        "sendCheckoutAbandonedRecovery",
        (m) => m.sendCheckoutAbandonedRecovery(BUYER, "Demo Cafe", "demo-cafe", "growth"),
      ],
      [
        "sendCommerceAbandonedRecovery",
        (m) => m.sendCommerceAbandonedRecovery(BUYER, "Demo Cafe", "demo-cafe", "Latte"),
      ],
      [
        "sendInquiryReply",
        (m) =>
          m.sendInquiryReply({
            to: BUYER,
            businessName: "Demo Cafe",
            leadSlug: "demo-cafe",
            replyBody: "hello",
            originalMessage: "hi",
          }),
      ],
      [
        "sendStarterUpsellEmail",
        (m) =>
          m.sendStarterUpsellEmail({
            to: BUYER,
            businessName: "Demo Cafe",
            slug: "demo-cafe",
            targetTier: "growth",
            monthlyPriceUsd: 99,
          }),
      ],
      [
        "sendMarketingPackToClientEmail",
        (m) =>
          m.sendMarketingPackToClientEmail({
            to: BUYER,
            businessName: "Demo Cafe",
            slug: "demo-cafe",
            yearMonth: "2026-08",
            variants: [],
          }),
      ],
      [
        "sendClientVoicePackToClientEmail",
        (m) =>
          m.sendClientVoicePackToClientEmail({
            to: BUYER,
            businessName: "Demo Cafe",
            slug: "demo-cafe",
            variants: [],
          }),
      ],
      [
        "sendCommerceBuyNowClientReceipt",
        (m) =>
          m.sendCommerceBuyNowClientReceipt({
            to: BUYER,
            businessName: "Demo Cafe",
            slug: "demo-cafe",
            skuName: "Latte",
            amountTotalUsd: 5,
            stripeSessionId: "cs_test_1",
          }),
      ],
    ];

    for (const [name, call] of marketingHelpers) {
      it(`${name} stays suppressed`, async () => {
        const mod = await load();
        isEmailSuppressed.mockResolvedValue(true);

        const result = (await call(mod)) as { success: boolean; reason?: string };

        expect(sentBodies).toHaveLength(0);
        expect(result.success).toBe(false);
        expect(result.reason).toBe("suppressed");
      });
    }

    it("sendReceiptEmail is the only helper that bypasses suppression", async () => {
      // Guards the roster above against a helper being added to resend.ts and
      // quietly classified transactional without appearing in this file.
      const mod = await load();
      const exported = Object.keys(mod).filter(
        (k) => k.startsWith("send") && typeof (mod as Record<string, unknown>)[k] === "function",
      );
      const accountedFor = new Set([
        ...marketingHelpers.map(([n]) => n),
        "sendReceiptEmail",
        "sendEmail",
        "sendOperatorDailyDigest",
      ]);
      expect(exported.filter((k) => !accountedFor.has(k))).toEqual([]);
    });
  });

  describe("the fail-closed configuration guard is untouched", () => {
    it("still refuses a transactional send when the CAN-SPAM env is unconfigured", async () => {
      // The bypass is of the suppression list only. An unset postal address is
      // a §7704(a)(5) defect in the artifact itself, and no classification
      // makes an unbuildable footer safe to transmit.
      delete process.env.NEXT_PUBLIC_COMPANY_ADDRESS;
      const { sendReceiptEmail } = await load();
      isEmailSuppressed.mockResolvedValue(false);

      const result = await sendReceiptEmail(BUYER, "Demo Cafe", "growth", 500);

      expect(sentBodies).toHaveLength(0);
      expect(result.success).toBe(false);
      expect("error" in result && String(result.error)).toContain(
        "NEXT_PUBLIC_COMPANY_ADDRESS",
      );
    });
  });
});
