import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sending actually hits ../db (isEmailSuppressed) which imports "server-only" —
// stub it so this stays a pure unit test of the HTML templates.
vi.mock("../db", () => ({
  isEmailSuppressed: vi.fn(async () => false),
}));

const UNSAFE_NAME = `O'Brien's Auto & <Truck> Repair`;
const ESCAPED_NAME = "O&#39;Brien&#39;s Auto &amp; &lt;Truck&gt; Repair";

const UNSAFE_BRAND = `Local & <Site> Studio's`;
const ESCAPED_BRAND = "Local &amp; &lt;Site&gt; Studio&#39;s";
const UNSAFE_LEGAL = `Maris & Stella <Labs>`;
const ESCAPED_LEGAL = "Maris &amp; Stella &lt;Labs&gt;";
const UNSAFE_ADDRESS = `123 Main St & <Apt> 4`;
const ESCAPED_ADDRESS = "123 Main St &amp; &lt;Apt&gt; 4";

describe("resend.ts — businessName HTML escaping", () => {
  const originalKey = process.env.RESEND_API_KEY;
  let sentHtml: string;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    sentHtml = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        sentHtml = body.html;
        return {
          ok: true,
          json: async () => ({ id: "email_test" }),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("escapes businessName in sendOutreachEmail", async () => {
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", UNSAFE_NAME, "demo-cafe");
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });

  it("escapes businessName in sendOutreachFollowUp2", async () => {
    const { sendOutreachFollowUp2 } = await import("./resend");
    await sendOutreachFollowUp2("owner@example.com", UNSAFE_NAME, "demo-cafe");
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });

  it("escapes businessName in sendOutreachFollowUp3", async () => {
    const { sendOutreachFollowUp3 } = await import("./resend");
    await sendOutreachFollowUp3("owner@example.com", UNSAFE_NAME, "demo-cafe");
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });

  it("escapes businessName in sendCheckoutAbandonedRecovery", async () => {
    const { sendCheckoutAbandonedRecovery } = await import("./resend");
    await sendCheckoutAbandonedRecovery("owner@example.com", UNSAFE_NAME, "demo-cafe", "starter");
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });

  it("escapes businessName in sendReceiptEmail", async () => {
    const { sendReceiptEmail } = await import("./resend");
    await sendReceiptEmail("owner@example.com", UNSAFE_NAME, "starter", 500);
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });
});

describe("resend.ts — brand.* HTML escaping", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalBrand = process.env.NEXT_PUBLIC_BRAND_NAME;
  const originalLegal = process.env.NEXT_PUBLIC_LEGAL_ENTITY;
  const originalCompany = process.env.NEXT_PUBLIC_COMPANY_NAME;
  const originalAddress = process.env.NEXT_PUBLIC_COMPANY_ADDRESS;
  let sentHtml: string;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    process.env.NEXT_PUBLIC_BRAND_NAME = UNSAFE_BRAND;
    process.env.NEXT_PUBLIC_LEGAL_ENTITY = UNSAFE_LEGAL;
    delete process.env.NEXT_PUBLIC_COMPANY_NAME;
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS = UNSAFE_ADDRESS;
    sentHtml = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        sentHtml = body.html;
        return {
          ok: true,
          json: async () => ({ id: "email_test" }),
        } as Response;
      }),
    );
    vi.resetModules();
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    if (originalBrand === undefined) delete process.env.NEXT_PUBLIC_BRAND_NAME;
    else process.env.NEXT_PUBLIC_BRAND_NAME = originalBrand;
    if (originalLegal === undefined) delete process.env.NEXT_PUBLIC_LEGAL_ENTITY;
    else process.env.NEXT_PUBLIC_LEGAL_ENTITY = originalLegal;
    if (originalCompany === undefined) delete process.env.NEXT_PUBLIC_COMPANY_NAME;
    else process.env.NEXT_PUBLIC_COMPANY_NAME = originalCompany;
    if (originalAddress === undefined) delete process.env.NEXT_PUBLIC_COMPANY_ADDRESS;
    else process.env.NEXT_PUBLIC_COMPANY_ADDRESS = originalAddress;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("escapes brand.name / legalEntity / postalAddress in the shared CAN-SPAM footer", async () => {
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", "Demo Cafe", "demo-cafe");
    expect(sentHtml).toContain(`sent by ${ESCAPED_BRAND}`);
    expect(sentHtml).toContain(`${ESCAPED_LEGAL} · ${ESCAPED_ADDRESS}`);
    expect(sentHtml).not.toContain("<Site>");
    expect(sentHtml).not.toContain("<Labs>");
    expect(sentHtml).not.toContain("<Apt>");
  });

  it("escapes brand.name in sendOutreachEmail signature", async () => {
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", "Demo Cafe", "demo-cafe");
    expect(sentHtml).toContain(`The ${ESCAPED_BRAND} Team`);
    expect(sentHtml).not.toContain(`The ${UNSAFE_BRAND} Team`);
  });

  it("escapes brand.name in sendStarterUpsellEmail body + signature", async () => {
    const { sendStarterUpsellEmail } = await import("./resend");
    await sendStarterUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      targetTier: "growth",
      monthlyPriceUsd: 99,
    });
    expect(sentHtml).toContain(`live on ${ESCAPED_BRAND} Starter`);
    expect(sentHtml).toContain(`The ${ESCAPED_BRAND} Team`);
    expect(sentHtml).not.toContain(`live on ${UNSAFE_BRAND} Starter`);
  });

  it("escapes brand.name in sendReceiptEmail signature", async () => {
    const { sendReceiptEmail } = await import("./resend");
    await sendReceiptEmail("owner@example.com", "Demo Cafe", "starter", 500);
    expect(sentHtml).toContain(`The ${ESCAPED_BRAND} Team`);
    expect(sentHtml).not.toContain(`The ${UNSAFE_BRAND} Team`);
  });

  it("escapes brand.name in sendInquiryReply signature", async () => {
    const { sendInquiryReply } = await import("./resend");
    await sendInquiryReply({
      to: "visitor@example.com",
      businessName: "Demo Cafe",
      leadSlug: "demo-cafe",
      replyBody: "Thanks for writing in.",
      originalMessage: "Do you take walk-ins?",
    });
    expect(sentHtml).toContain(`The ${ESCAPED_BRAND} Team`);
    expect(sentHtml).not.toContain(`The ${UNSAFE_BRAND} Team`);
  });
});

describe("resend.ts — EMAIL_FROM From header", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalBrand = process.env.NEXT_PUBLIC_BRAND_NAME;
  const originalFrom = process.env.EMAIL_FROM;
  let sentFrom: string;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    process.env.NEXT_PUBLIC_BRAND_NAME = "Local Site Studio";
    process.env.EMAIL_FROM = "noreply@marisstellalabs.com";
    sentFrom = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        sentFrom = body.from;
        return {
          ok: true,
          json: async () => ({ id: "email_test" }),
        } as Response;
      }),
    );
    vi.resetModules();
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    if (originalBrand === undefined) delete process.env.NEXT_PUBLIC_BRAND_NAME;
    else process.env.NEXT_PUBLIC_BRAND_NAME = originalBrand;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses brand.emailFrom in sendOutreachEmail From header", async () => {
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", "Demo Cafe", "demo-cafe");
    expect(sentFrom).toBe(
      "Local Site Studio <noreply@marisstellalabs.com>",
    );
    expect(sentFrom).not.toContain("outreach@updates.localsitestudio.com");
  });

  it("uses brand.emailFrom in sendOperatorDailyDigest From header", async () => {
    const { sendOperatorDailyDigest } = await import("./resend");
    await sendOperatorDailyDigest("ops@example.com", "<p>digest</p>");
    expect(sentFrom).toBe(
      "Local Site Studio <noreply@marisstellalabs.com>",
    );
    expect(sentFrom).not.toContain("outreach@updates.localsitestudio.com");
  });

  it("picks up a trimmed EMAIL_FROM override", async () => {
    process.env.EMAIL_FROM = "  hello@acme.cafe  ";
    vi.resetModules();
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", "Demo Cafe", "demo-cafe");
    expect(sentFrom).toBe("Local Site Studio <hello@acme.cafe>");
  });
});

describe("resend.ts — href URL HTML escaping", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  let sentHtml: string;

  // Quote + ampersand break out of href="..." or inject extra attributes unless
  // escapeHtmlForEmail runs before interpolation (sibling: client-receipt /
  // deliver-pack / dns-email / daily-digest already escape URLs).
  const UNSAFE_APP_URL = `https://evil.example/"onclick="alert(1)&x=1`;
  const ESCAPED_QUOTE_FRAGMENT = "&quot;onclick=&quot;";
  const ESCAPED_AMP_FRAGMENT = "&amp;x=1";

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    process.env.NEXT_PUBLIC_APP_URL = UNSAFE_APP_URL;
    sentHtml = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        sentHtml = body.html;
        return {
          ok: true,
          json: async () => ({ id: "email_test" }),
        } as Response;
      }),
    );
    vi.resetModules();
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function expectHrefSafe() {
    // Raw quote-breakout must not survive into the HTML body.
    expect(sentHtml).not.toContain('"onclick="');
    expect(sentHtml).toContain(ESCAPED_QUOTE_FRAGMENT);
    // Query-string & in APP_URL / checkout URLs becomes &amp; inside attributes.
    expect(sentHtml).toContain(ESCAPED_AMP_FRAGMENT);
    // CAN-SPAM privacy + unsubscribe hrefs also escape the base URL.
    expect(sentHtml).toMatch(/href="[^"]*\/privacy"/);
    expect(sentHtml).toMatch(/href="[^"]*\/api\/unsubscribe[^"]*"/);
  }

  it("escapes baseUrl-derived hrefs in sendOutreachEmail + CAN-SPAM footer", async () => {
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", "Demo Cafe", "demo-cafe");
    expectHrefSafe();
    expect(sentHtml).toContain("href=");
  });

  it("escapes checkout href in sendCheckoutAbandonedRecovery", async () => {
    const { sendCheckoutAbandonedRecovery } = await import("./resend");
    await sendCheckoutAbandonedRecovery(
      "owner@example.com",
      "Demo Cafe",
      "demo-cafe",
      "starter",
    );
    expectHrefSafe();
  });

  it("escapes catalog href in sendCommerceAbandonedRecovery", async () => {
    const { sendCommerceAbandonedRecovery } = await import("./resend");
    await sendCommerceAbandonedRecovery(
      "shopper@example.com",
      "Demo Cafe",
      "demo-cafe",
      "Latte",
    );
    expectHrefSafe();
  });

  it("escapes checkout + preview hrefs in sendStarterUpsellEmail", async () => {
    const { sendStarterUpsellEmail } = await import("./resend");
    await sendStarterUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      targetTier: "growth",
      monthlyPriceUsd: 99,
    });
    expectHrefSafe();
  });
});

describe("resend.ts — transactional skipSuppression", () => {
  const originalKey = process.env.RESEND_API_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    const { isEmailSuppressed } = await import("../db");
    vi.mocked(isEmailSuppressed).mockResolvedValue(true);
    fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ id: "email_test" }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    process.env.RESEND_API_KEY = originalKey;
    const { isEmailSuppressed } = await import("../db");
    vi.mocked(isEmailSuppressed).mockResolvedValue(false);
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sendReceiptEmail still delivers when the address is marketing-suppressed", async () => {
    const { sendReceiptEmail } = await import("./resend");
    const result = await sendReceiptEmail("owner@example.com", "Demo Cafe", "starter", 500);
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("sendCommerceBuyNowClientReceipt still delivers when marketing-suppressed", async () => {
    const { sendCommerceBuyNowClientReceipt } = await import("./resend");
    const result = await sendCommerceBuyNowClientReceipt({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      skuName: "Latte",
      amountTotalUsd: 4.5,
      stripeSessionId: "cs_test_commerce",
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("sendOutreachEmail still blocks when marketing-suppressed", async () => {
    const { sendOutreachEmail } = await import("./resend");
    const result = await sendOutreachEmail("owner@example.com", "Demo Cafe", "demo-cafe");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("suppressed");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sendInquiryReply still delivers when the visitor is marketing-suppressed", async () => {
    const { sendInquiryReply } = await import("./resend");
    const result = await sendInquiryReply({
      to: "visitor@example.com",
      businessName: "Demo Cafe",
      leadSlug: "demo-cafe",
      replyBody: "Thanks for writing — we can book you Tuesday.",
      originalMessage: "Do you take walk-ins?",
      inquirerName: "Alex",
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});
