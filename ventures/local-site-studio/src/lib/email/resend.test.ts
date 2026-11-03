import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeployHandoff } from "../deploy/types";

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

function sampleHandoff(overrides: Partial<DeployHandoff> = {}): DeployHandoff {
  return {
    id: "deploy_demo-cafe_1",
    leadSlug: "demo-cafe",
    businessName: "Demo Cafe",
    tier: "growth",
    commerceAddon: false,
    stripeSessionId: "cs_test_1",
    customerEmail: "owner@demo-cafe.test",
    previewUrl: "http://localhost:3000/preview/demo-cafe",
    suggestedHost: "demo-cafe.preview.localsitestudio.com",
    contactFormUrl: "http://localhost:3000/api/contact/demo-cafe",
    dnsInstructions: [{ type: "A", host: "@", value: "76.76.21.21", purpose: "Root domain" }],
    status: "awaiting_dns",
    notes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resend.ts — businessName HTML escaping", () => {
  const originalKey = process.env.RESEND_API_KEY;
  let sentHtml: string;
  let sentSubject: string;
  let sentText: string;
  let sentHeaders: Record<string, string> | undefined;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    sentHtml = "";
    sentSubject = "";
    sentText = "";
    sentHeaders = undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        sentHtml = body.html;
        sentSubject = body.subject;
        sentText = body.text;
        sentHeaders = body.headers;
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

  it("sends a plain-text part alongside html with tags stripped and entities decoded", async () => {
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", UNSAFE_NAME, "demo-cafe");
    expect(sentText).toBeTruthy();
    // No leftover element tags (style attrs, <p>/<div>/<a>, etc) — the
    // decoded business name legitimately contains a literal "<Truck>", so
    // assert no tag-shaped markup instead of a blanket no-angle-bracket check.
    expect(sentText).not.toMatch(/<\/?(p|div|h[1-6]|a|hr|br)\b[^>]*>/i);
    expect(sentText).toContain(UNSAFE_NAME);
    expect(sentText).toContain("View Your Preview Site (");
    expect(sentText).toContain("Unsubscribe (");
  });

  it("normalizes control characters in provider-facing subjects", async () => {
    const { sendEmail, sanitizeEmailSubject } = await import("./resend");
    expect(sanitizeEmailSubject("  Order\r\n\t\u0007 ready  ")).toBe("Order ready");

    await sendEmail({
      to: "owner@example.com",
      subject: "Order\r\nX-Injected: yes",
      html: "<p>Order</p>",
    });

    expect(sentSubject).toBe("Order X-Injected: yes");
    expect(sentSubject).not.toContain("\r");
    expect(sentSubject).not.toContain("\n");
  });

  it("normalizes dynamic business names in an outreach subject", async () => {
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", "Cafe\r\nX-Injected: yes", "demo-cafe");
    expect(sentSubject).toBe("Cafe X-Injected: yes — we built your website (free preview)");
    expect(sentSubject).not.toContain("\r");
    expect(sentSubject).not.toContain("\n");
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

  it("escapes businessName in sendBundleDnsHandoffEmail and includes the DNS instructions", async () => {
    const { sendBundleDnsHandoffEmail } = await import("./resend");
    await sendBundleDnsHandoffEmail({
      to: "owner@example.com",
      businessName: UNSAFE_NAME,
      slug: "demo-cafe",
      handoff: sampleHandoff({ businessName: UNSAFE_NAME }),
    });
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
    expect(sentHtml).toContain("demo-cafe.preview.localsitestudio.com");
    expect(sentSubject).toContain(`Next steps: go live with ${UNSAFE_NAME}`);
  });

  it("escapes free-text tier in sendReceiptEmail and prefers catalog display name", async () => {
    const { sendReceiptEmail } = await import("./resend");
    // Unknown tiers fall back to UPPERCASE then escapeHtmlForEmail.
    await sendReceiptEmail(
      "owner@example.com",
      "Demo Cafe",
      `<img src=x onerror=alert(1)>`,
      500,
    );
    expect(sentHtml).toContain("&lt;IMG SRC=X ONERROR=ALERT(1)&gt;");
    expect(sentHtml).not.toContain("<img");
    expect(sentHtml).not.toContain("<IMG");

    sentHtml = "";
    await sendReceiptEmail("owner@example.com", "Demo Cafe", "growth", 500);
    expect(sentHtml).toContain("<strong>Growth</strong>");
    expect(sentHtml).not.toContain("<strong>GROWTH</strong>");
  });

  it("sends a List-Unsubscribe + List-Unsubscribe-Post header pair matching the footer unsubscribe link", async () => {
    // Gmail/Yahoo bulk-sender requirements (2024-02+) read these headers
    // directly for spam-folder placement and their own native "Unsubscribe"
    // affordance — a footer link alone is not enough. See
    // src/app/api/unsubscribe/route.ts's POST handler for the RFC 8058
    // one-click target this header pair advertises.
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", UNSAFE_NAME, "demo-cafe");

    expect(sentHeaders).toBeDefined();
    expect(sentHeaders!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const listUnsubscribe = sentHeaders!["List-Unsubscribe"];
    expect(listUnsubscribe).toMatch(/^<https:\/\/example\.test\/api\/unsubscribe\?email=.*&token=.*>$/);
    // Same URL the HTML footer's Unsubscribe anchor points at (unescaped
    // here — this is a mail header value, not markup, so no &amp;/&#39; etc).
    expect(sentHtml).toContain(
      listUnsubscribe.slice(1, -1).replace(/&/g, "&amp;"),
    );

    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("sendReceiptEmail does not promise a nonexistent client dashboard/login", async () => {
    // This product has no client-facing dashboard or login (operator inbox
    // only, see /docs/production-deploy) — the receipt must not tell a paying
    // customer to expect "dashboard access credentials" that will never
    // arrive. The real next step (DNS setup) ships as a separate email from
    // the same webhook handler (bundle-receipt-no-dashboard-credentials-copy).
    const { sendReceiptEmail } = await import("./resend");
    await sendReceiptEmail("owner@example.com", "Demo Cafe", "starter", 500);
    expect(sentHtml).not.toContain("dashboard access credentials");
    expect(sentHtml).not.toContain("login credentials");
    expect(sentHtml).toContain("DNS setup instructions");
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

  it("derives sendStarterUpsellEmail's marketing cadence copy from monthlyMarketingSocialPostCount/monthlyMarketingEmailCount, not a hardcoded literal", async () => {
    const { sendStarterUpsellEmail } = await import("./resend");
    const { monthlyMarketingEmailCount, monthlyMarketingSocialPostCount } = await import(
      "../marketing/monthly-pack"
    );
    const cadence = `${monthlyMarketingSocialPostCount()} social/GBP posts + ${monthlyMarketingEmailCount()} emails`;

    await sendStarterUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      targetTier: "growth",
      monthlyPriceUsd: 99,
    });
    expect(sentHtml).toContain(`${cadence} per month`);

    await sendStarterUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      targetTier: "complete",
      monthlyPriceUsd: 199,
    });
    expect(sentHtml).toContain(`${cadence}/month`);
  });

  it("escapes brand.name in sendGrowthUpsellEmail body + signature", async () => {
    const { sendGrowthUpsellEmail } = await import("./resend");
    await sendGrowthUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      monthlyPriceUsd: 199,
    });
    expect(sentHtml).toContain(`running on ${ESCAPED_BRAND} Growth`);
    expect(sentHtml).toContain(`The ${ESCAPED_BRAND} Team`);
    expect(sentHtml).not.toContain(`running on ${UNSAFE_BRAND} Growth`);
  });

  it("escapes businessName in sendPaymentFailedNotice", async () => {
    const { sendPaymentFailedNotice } = await import("./resend");
    await sendPaymentFailedNotice({
      to: "owner@example.com",
      businessName: UNSAFE_NAME,
      slug: "demo-cafe",
      stripeSessionId: "cs_test_dunning",
      billingInterval: "monthly",
    });
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });

  it("escapes businessName in sendPaymentRecoveredNotice", async () => {
    const { sendPaymentRecoveredNotice } = await import("./resend");
    await sendPaymentRecoveredNotice({
      to: "owner@example.com",
      businessName: UNSAFE_NAME,
      slug: "demo-cafe",
      stripeSessionId: "cs_test_recovered",
    });
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });

  it("escapes businessName in sendSubscriptionPausedNotice", async () => {
    const { sendSubscriptionPausedNotice } = await import("./resend");
    await sendSubscriptionPausedNotice({
      to: "owner@example.com",
      businessName: UNSAFE_NAME,
      slug: "demo-cafe",
      stripeSessionId: "cs_test_paused",
    });
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });

  it("escapes businessName in sendSubscriptionResumedNotice", async () => {
    const { sendSubscriptionResumedNotice } = await import("./resend");
    await sendSubscriptionResumedNotice({
      to: "owner@example.com",
      businessName: UNSAFE_NAME,
      slug: "demo-cafe",
      stripeSessionId: "cs_test_resumed",
    });
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });

  it("escapes businessName in sendSubscriptionCanceledNotice", async () => {
    const { sendSubscriptionCanceledNotice } = await import("./resend");
    await sendSubscriptionCanceledNotice({
      to: "owner@example.com",
      businessName: UNSAFE_NAME,
      slug: "demo-cafe",
      tier: "growth",
      commerceAddon: false,
      billingInterval: "monthly",
    });
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });

  it("escapes brand.name in sendReceiptEmail signature", async () => {
    const { sendReceiptEmail } = await import("./resend");
    await sendReceiptEmail("owner@example.com", "Demo Cafe", "starter", 500);
    expect(sentHtml).toContain(`The ${ESCAPED_BRAND} Team`);
    expect(sentHtml).not.toContain(`The ${UNSAFE_BRAND} Team`);
  });

  it("escapes brand.name in sendBundleDnsHandoffEmail signature", async () => {
    const { sendBundleDnsHandoffEmail } = await import("./resend");
    await sendBundleDnsHandoffEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      handoff: sampleHandoff(),
    });
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
  let sentText: string;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    process.env.NEXT_PUBLIC_BRAND_NAME = "Local Site Studio";
    process.env.EMAIL_FROM = "noreply@marisstella.app";
    sentFrom = "";
    sentText = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        sentFrom = body.from;
        sentText = body.text;
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
      "Local Site Studio <noreply@marisstella.app>",
    );
    expect(sentFrom).not.toContain("outreach@updates.localsitestudio.com");
  });

  it("uses brand.emailFrom in sendOperatorDailyDigest From header", async () => {
    const { sendOperatorDailyDigest } = await import("./resend");
    await sendOperatorDailyDigest("ops@example.com", "<p>digest</p>");
    expect(sentFrom).toBe(
      "Local Site Studio <noreply@marisstella.app>",
    );
    expect(sentFrom).not.toContain("outreach@updates.localsitestudio.com");
  });

  it("sends a plain-text part derived from the digest html", async () => {
    const { sendOperatorDailyDigest } = await import("./resend");
    await sendOperatorDailyDigest("ops@example.com", "<p>3 new leads &amp; 1 order</p>");
    expect(sentText).toBe("3 new leads & 1 order");
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

  it("escapes checkout + preview hrefs in sendGrowthUpsellEmail", async () => {
    const { sendGrowthUpsellEmail } = await import("./resend");
    await sendGrowthUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      monthlyPriceUsd: 199,
    });
    expectHrefSafe();
  });

  it("escapes manage-billing href in sendPaymentFailedNotice", async () => {
    const { sendPaymentFailedNotice } = await import("./resend");
    await sendPaymentFailedNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_dunning",
      billingInterval: "monthly",
    });
    expectHrefSafe();
    expect(sentHtml).toMatch(/href="[^"]*\/checkout\/success\?session_id=cs_test_dunning"/);
  });

  it("names the failed cadence correctly for a monthly vs. annual subscriber (payment-failed-notice-annual-billing-copy)", async () => {
    const { sendPaymentFailedNotice } = await import("./resend");
    const { brand } = await import("../brand");
    await sendPaymentFailedNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_dunning_monthly",
      billingInterval: "monthly",
    });
    expect(sentHtml).toContain(`declined for this month's ${brand.name}`);

    await sendPaymentFailedNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_dunning_annual",
      billingInterval: "annual",
    });
    expect(sentHtml).toContain(`declined for your annual ${brand.name}`);
    expect(sentHtml).not.toContain("this month's");
  });

  it("escapes manage-billing href in sendPaymentRecoveredNotice", async () => {
    const { sendPaymentRecoveredNotice } = await import("./resend");
    await sendPaymentRecoveredNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_recovered",
    });
    expectHrefSafe();
    expect(sentHtml).toMatch(/href="[^"]*\/checkout\/success\?session_id=cs_test_recovered"/);
  });

  it("escapes manage-billing href in sendSubscriptionPausedNotice", async () => {
    const { sendSubscriptionPausedNotice } = await import("./resend");
    await sendSubscriptionPausedNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_paused",
    });
    expectHrefSafe();
    expect(sentHtml).toMatch(/href="[^"]*\/checkout\/success\?session_id=cs_test_paused"/);
  });

  it("escapes manage-billing href in sendSubscriptionResumedNotice", async () => {
    const { sendSubscriptionResumedNotice } = await import("./resend");
    await sendSubscriptionResumedNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_resumed",
    });
    expectHrefSafe();
    expect(sentHtml).toMatch(/href="[^"]*\/checkout\/success\?session_id=cs_test_resumed"/);
  });

  it("escapes resubscribe href in sendSubscriptionCanceledNotice", async () => {
    const { sendSubscriptionCanceledNotice } = await import("./resend");
    await sendSubscriptionCanceledNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      tier: "growth",
      commerceAddon: false,
      billingInterval: "monthly",
    });
    expectHrefSafe();
    expect(sentHtml).toMatch(/href="[^"]*\/checkout\?slug=demo-cafe&amp;tier=growth"/);
  });

  it("carries billing=annual onto the resubscribe link and copy for an annual subscription (subscription-canceled-notice-annual-billing-copy)", async () => {
    const { sendSubscriptionCanceledNotice } = await import("./resend");
    const { brand } = await import("../brand");
    await sendSubscriptionCanceledNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      tier: "growth",
      commerceAddon: false,
      billingInterval: "annual",
    });
    expect(sentHtml).toMatch(
      /href="[^"]*\/checkout\?slug=demo-cafe&amp;tier=growth&amp;billing=annual"/,
    );
    expect(sentHtml).toContain(`annual ${brand.name} subscription has ended`);
    expect(sentHtml).not.toContain(`monthly ${brand.name} subscription has ended`);
  });

  it("escapes the onboarding link href in sendStripeConnectOnboardingLinkEmail", async () => {
    const { sendStripeConnectOnboardingLinkEmail } = await import("./resend");
    await sendStripeConnectOnboardingLinkEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      onboardingUrl: `https://connect.stripe.com/setup/e/acct_123/fake${UNSAFE_APP_URL}`,
    });
    expectHrefSafe();
    expect(sentHtml).toMatch(/href="https:\/\/connect\.stripe\.com/);
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

  it("sendBundleDnsHandoffEmail still delivers when the address is marketing-suppressed", async () => {
    const { sendBundleDnsHandoffEmail } = await import("./resend");
    const result = await sendBundleDnsHandoffEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      handoff: sampleHandoff(),
    });
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

  it("sendPaymentFailedNotice still delivers when marketing-suppressed", async () => {
    const { sendPaymentFailedNotice } = await import("./resend");
    const result = await sendPaymentFailedNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_dunning",
      billingInterval: "monthly",
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("sendPaymentRecoveredNotice still delivers when marketing-suppressed", async () => {
    const { sendPaymentRecoveredNotice } = await import("./resend");
    const result = await sendPaymentRecoveredNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_recovered",
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("sendSubscriptionPausedNotice still delivers when marketing-suppressed", async () => {
    const { sendSubscriptionPausedNotice } = await import("./resend");
    const result = await sendSubscriptionPausedNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_paused",
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("sendSubscriptionResumedNotice still delivers when marketing-suppressed", async () => {
    const { sendSubscriptionResumedNotice } = await import("./resend");
    const result = await sendSubscriptionResumedNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      stripeSessionId: "cs_test_resumed",
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("sendSubscriptionCanceledNotice still delivers when marketing-suppressed", async () => {
    const { sendSubscriptionCanceledNotice } = await import("./resend");
    const result = await sendSubscriptionCanceledNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      tier: "growth",
      commerceAddon: false,
      billingInterval: "monthly",
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("sendStripeConnectOnboardingLinkEmail still delivers when marketing-suppressed", async () => {
    const { sendStripeConnectOnboardingLinkEmail } = await import("./resend");
    const result = await sendStripeConnectOnboardingLinkEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      onboardingUrl: "https://connect.stripe.com/setup/e/acct_123/fake",
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("sendMarketingPackToClientEmail still delivers when marketing-suppressed", async () => {
    const { sendMarketingPackToClientEmail } = await import("./resend");
    const result = await sendMarketingPackToClientEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      yearMonth: "2026-07",
      variants: [
        {
          contentType: "facebook_caption",
          title: "Fresh roast",
          body: "Great coffee this week at Demo Cafe!",
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("sendClientVoicePackToClientEmail still delivers when marketing-suppressed", async () => {
    const { sendClientVoicePackToClientEmail } = await import("./resend");
    const result = await sendClientVoicePackToClientEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      variants: [
        {
          scriptType: "inbound_greeting",
          title: "Greeting",
          body: "Welcome to Demo Cafe!",
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
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

describe("resend.ts — Resend delivery failures report via the observability scaffold", () => {
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    vi.resetModules();
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sendEmail calls captureError with component resend-email and the leadSlug on a non-2xx Resend response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "Resend down" }) as Response),
    );
    const captureErrorMock = vi.fn(async () => {});
    vi.doMock("../observability/error-tracking", () => ({ captureError: captureErrorMock }));

    const { sendEmail } = await import("./resend");
    const result = await sendEmail({
      to: "owner@example.com",
      subject: "Test",
      html: "<p>hi</p>",
      leadSlug: "demo-cafe",
    });

    expect(result.success).toBe(false);
    expect(captureErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      { component: "resend-email", leadSlug: "demo-cafe" },
    );
  });

  it("sendEmail does not call captureError on a successful send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ id: "email_1" }) }) as Response),
    );
    const captureErrorMock = vi.fn(async () => {});
    vi.doMock("../observability/error-tracking", () => ({ captureError: captureErrorMock }));

    const { sendEmail } = await import("./resend");
    const result = await sendEmail({
      to: "owner@example.com",
      subject: "Test",
      html: "<p>hi</p>",
      leadSlug: "demo-cafe",
    });

    expect(result.success).toBe(true);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("sendOperatorDailyDigest calls captureError with component resend-operator-digest on a thrown network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const captureErrorMock = vi.fn(async () => {});
    vi.doMock("../observability/error-tracking", () => ({ captureError: captureErrorMock }));

    const { sendOperatorDailyDigest } = await import("./resend");
    const result = await sendOperatorDailyDigest("operator@example.com", "<p>digest</p>");

    expect(result.success).toBe(false);
    expect(captureErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      { component: "resend-operator-digest" },
    );
  });

  it("sendEmail bounds its Resend fetch with an AbortSignal (resend-fetch-timeout)", async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: true, json: async () => ({ id: "email_1" }) }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const { sendEmail } = await import("./resend");
    await sendEmail({ to: "owner@example.com", subject: "Test", html: "<p>hi</p>" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("sendEmail returns a failure (not a hang or uncaught throw) when the Resend fetch aborts on timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    );
    const captureErrorMock = vi.fn(async () => {});
    vi.doMock("../observability/error-tracking", () => ({ captureError: captureErrorMock }));

    const { sendEmail } = await import("./resend");
    const result = await sendEmail({
      to: "owner@example.com",
      subject: "Test",
      html: "<p>hi</p>",
      leadSlug: "demo-cafe",
    });

    expect(result.success).toBe(false);
    expect(captureErrorMock).toHaveBeenCalledWith(
      expect.any(DOMException),
      { component: "resend-email", leadSlug: "demo-cafe" },
    );
  });

  it("sendOperatorDailyDigest bounds its Resend fetch with an AbortSignal (resend-fetch-timeout)", async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: true, json: async () => ({ id: "email_1" }) }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const { sendOperatorDailyDigest } = await import("./resend");
    await sendOperatorDailyDigest("operator@example.com", "<p>digest</p>");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe("resend.ts — sendStarterUpsellEmail checkout URL single source of truth", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  let sentHtml: string;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
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

  // Guards against the two implementations (this email's checkout link, and
  // the dedicated src/lib/billing/starter-upsell.ts path builder — both
  // added in the same original commit but never wired together until
  // starter-upsell-checkout-url-single-source-of-truth) silently drifting
  // apart again in the future, the same bug class as
  // daily-digest-button-item-count-drift / monthly-marketing-pack-cadence-
  // single-source-of-truth (see AGENT_PROTOCOL / prompt_process.tsx).
  it("sendStarterUpsellEmail's checkout href is exactly buildStarterUpsellCheckoutPath's output", async () => {
    const { sendStarterUpsellEmail } = await import("./resend");
    const { buildStarterUpsellCheckoutPath } = await import(
      "../billing/starter-upsell"
    );
    await sendStarterUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      targetTier: "complete",
      monthlyPriceUsd: 199,
    });
    const expectedHref = `https://app.example.com${buildStarterUpsellCheckoutPath("demo-cafe", "complete")}`.replace(
      /&/g,
      "&amp;",
    );
    expect(sentHtml).toContain(`href="${expectedHref}"`);
  });

  it("matches for the growth tier too", async () => {
    const { sendStarterUpsellEmail } = await import("./resend");
    const { buildStarterUpsellCheckoutPath } = await import(
      "../billing/starter-upsell"
    );
    await sendStarterUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      targetTier: "growth",
      monthlyPriceUsd: 99,
    });
    const expectedHref = `https://app.example.com${buildStarterUpsellCheckoutPath("demo-cafe", "growth")}`.replace(
      /&/g,
      "&amp;",
    );
    expect(sentHtml).toContain(`href="${expectedHref}"`);
  });
});

describe("resend.ts — sendGrowthUpsellEmail checkout URL single source of truth", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  let sentHtml: string;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
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

  // Same guard as sendStarterUpsellEmail's twin above — the email's checkout
  // link and the dedicated src/lib/billing/growth-upsell.ts path builder
  // must never drift apart.
  it("sendGrowthUpsellEmail's checkout href is exactly buildGrowthUpsellCheckoutPath's output", async () => {
    const { sendGrowthUpsellEmail } = await import("./resend");
    const { buildGrowthUpsellCheckoutPath } = await import("../billing/growth-upsell");
    await sendGrowthUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      monthlyPriceUsd: 199,
    });
    const expectedHref = `https://app.example.com${buildGrowthUpsellCheckoutPath("demo-cafe")}`.replace(
      /&/g,
      "&amp;",
    );
    expect(sentHtml).toContain(`href="${expectedHref}"`);
  });

  it("quotes the annual price and carries billing=annual onto the checkout link for an annual Growth subscriber (growth-upsell-annual-billing-carry-through)", async () => {
    const { sendGrowthUpsellEmail } = await import("./resend");
    await sendGrowthUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      monthlyPriceUsd: 199,
      annualPriceUsd: 1990,
      billingInterval: "annual",
    });
    expect(sentHtml).toContain("$1990/yr");
    expect(sentHtml).not.toContain("$199/mo");
    expect(sentHtml).toMatch(/href="[^"]*\/checkout\?slug=demo-cafe&amp;tier=complete&amp;billing=annual"/);
  });

  it("still quotes the monthly price when billingInterval is monthly or omitted, even if annualPriceUsd is supplied", async () => {
    const { sendGrowthUpsellEmail } = await import("./resend");
    await sendGrowthUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      monthlyPriceUsd: 199,
      annualPriceUsd: 1990,
      billingInterval: "monthly",
    });
    expect(sentHtml).toContain("$199/mo");
    expect(sentHtml).not.toContain("$1990/yr");
    expect(sentHtml).not.toContain("billing=annual");
  });

  it("falls back to the monthly price when annualPriceUsd is missing even if billingInterval is annual", async () => {
    const { sendGrowthUpsellEmail } = await import("./resend");
    await sendGrowthUpsellEmail({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      monthlyPriceUsd: 199,
      billingInterval: "annual",
    });
    expect(sentHtml).toContain("$199/mo");
    expect(sentHtml).not.toContain("billing=annual");
  });
});

describe("resend.ts — sendSubscriptionCanceledNotice lost-features content (subscription-canceled-win-back-notice)", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  let sentHtml: string;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
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

  it("names Growth's own features (minus the 'Everything in' inherited bullet) and links to a growth resubscribe", async () => {
    const { sendSubscriptionCanceledNotice } = await import("./resend");
    await sendSubscriptionCanceledNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      tier: "growth",
      commerceAddon: false,
      billingInterval: "monthly",
    });
    expect(sentHtml).toContain("Ready-to-post packs for Google, Facebook, Instagram");
    expect(sentHtml).not.toContain("Everything in Starter");
    expect(sentHtml).toContain("/checkout?slug=demo-cafe&amp;tier=growth");
  });

  it("also names the Commerce add-on when commerceAddon is true", async () => {
    const { sendSubscriptionCanceledNotice } = await import("./resend");
    await sendSubscriptionCanceledNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      tier: "complete",
      commerceAddon: true,
      billingInterval: "monthly",
    });
    expect(sentHtml).toContain("Commerce add-on");
  });

  it("names only the Commerce add-on (never bundle features) for a Starter+addon-only cancellation, and omits ?tier from the resubscribe link", async () => {
    const { sendSubscriptionCanceledNotice } = await import("./resend");
    await sendSubscriptionCanceledNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      tier: "starter",
      commerceAddon: true,
      billingInterval: "monthly",
    });
    expect(sentHtml).toContain("Commerce add-on");
    expect(sentHtml).not.toContain("Professional landing page");
    expect(sentHtml).toContain("/checkout?slug=demo-cafe\"");
    expect(sentHtml).not.toContain("tier=starter");
  });

  it("omits ?billing=annual for a Starter+addon cancellation even when billingInterval is annual (Starter has no annual Price of its own)", async () => {
    const { sendSubscriptionCanceledNotice } = await import("./resend");
    await sendSubscriptionCanceledNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      tier: "starter",
      commerceAddon: true,
      billingInterval: "annual",
    });
    expect(sentHtml).toContain("/checkout?slug=demo-cafe\"");
    expect(sentHtml).not.toContain("billing=annual");
  });

  it("omits the lost-features paragraph entirely for a bare Starter cancellation with no addon (should not occur in practice, but must not crash or mislabel)", async () => {
    const { sendSubscriptionCanceledNotice } = await import("./resend");
    await sendSubscriptionCanceledNotice({
      to: "owner@example.com",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      tier: "starter",
      commerceAddon: false,
      billingInterval: "monthly",
    });
    expect(sentHtml).not.toContain("Your subscription included");
  });
});

describe("resend.ts — sanitizeReplyToEmail", () => {
  it("passes through a plausible single email address", async () => {
    const { sanitizeReplyToEmail } = await import("./resend");
    expect(sanitizeReplyToEmail("visitor@example.com")).toBe("visitor@example.com");
  });

  it("trims surrounding whitespace", async () => {
    const { sanitizeReplyToEmail } = await import("./resend");
    expect(sanitizeReplyToEmail("  visitor@example.com  ")).toBe("visitor@example.com");
  });

  it("returns undefined for empty/undefined input", async () => {
    const { sanitizeReplyToEmail } = await import("./resend");
    expect(sanitizeReplyToEmail(undefined)).toBeUndefined();
    expect(sanitizeReplyToEmail("")).toBeUndefined();
    expect(sanitizeReplyToEmail("   ")).toBeUndefined();
  });

  it("rejects a value with no @ or no dot in the domain part", async () => {
    const { sanitizeReplyToEmail } = await import("./resend");
    expect(sanitizeReplyToEmail("not-an-email")).toBeUndefined();
    expect(sanitizeReplyToEmail("visitor@localhost")).toBeUndefined();
  });

  it("rejects a value containing whitespace (a second address, header-folding attempt)", async () => {
    const { sanitizeReplyToEmail } = await import("./resend");
    expect(
      sanitizeReplyToEmail("visitor@example.com, attacker@evil.example"),
    ).toBeUndefined();
  });

  it("rejects a CRLF header-injection attempt", async () => {
    const { sanitizeReplyToEmail } = await import("./resend");
    expect(
      sanitizeReplyToEmail("visitor@example.com\r\nBcc: attacker@evil.example"),
    ).toBeUndefined();
  });
});

describe("resend.ts — sendEmail Reply-To", () => {
  const originalKey = process.env.RESEND_API_KEY;
  let sentBody: Record<string, unknown>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    sentBody = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(String(init.body));
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

  it("passes a valid replyTo through to Resend as reply_to", async () => {
    const { sendEmail } = await import("./resend");
    await sendEmail({
      to: "owner@example.com",
      subject: "New inquiry",
      html: "<p>hi</p>",
      replyTo: "visitor@example.com",
    });
    expect(sentBody.reply_to).toBe("visitor@example.com");
  });

  it("omits reply_to entirely when replyTo is not passed", async () => {
    const { sendEmail } = await import("./resend");
    await sendEmail({
      to: "owner@example.com",
      subject: "New inquiry",
      html: "<p>hi</p>",
    });
    expect(sentBody.reply_to).toBeUndefined();
    expect("reply_to" in sentBody).toBe(false);
  });

  it("drops a malformed/CRLF-injected replyTo instead of sending it to Resend", async () => {
    const { sendEmail } = await import("./resend");
    await sendEmail({
      to: "owner@example.com",
      subject: "New inquiry",
      html: "<p>hi</p>",
      replyTo: "visitor@example.com\r\nBcc: attacker@evil.example",
    });
    expect(sentBody.reply_to).toBeUndefined();
    expect("reply_to" in sentBody).toBe(false);
  });

  it("sendInquiryReply forwards replyTo to Resend as reply_to (visitor's follow-up routes to the business owner)", async () => {
    const { sendInquiryReply } = await import("./resend");
    await sendInquiryReply({
      to: "visitor@example.com",
      businessName: "Demo Cafe",
      leadSlug: "demo-cafe",
      replyBody: "Thanks for writing in.",
      originalMessage: "Do you take walk-ins?",
      replyTo: "owner@democafe.example",
    });
    expect(sentBody.reply_to).toBe("owner@democafe.example");
  });

  it("sendInquiryReply omits reply_to when no lead email is on file", async () => {
    const { sendInquiryReply } = await import("./resend");
    await sendInquiryReply({
      to: "visitor@example.com",
      businessName: "Demo Cafe",
      leadSlug: "demo-cafe",
      replyBody: "Thanks for writing in.",
      originalMessage: "Do you take walk-ins?",
    });
    expect("reply_to" in sentBody).toBe(false);
  });

  it("sendCommerceBuyNowClientReceipt forwards customerEmail to Resend as reply_to (its own copy promises 'reply to this email')", async () => {
    const { sendCommerceBuyNowClientReceipt } = await import("./resend");
    await sendCommerceBuyNowClientReceipt({
      to: "owner@democafe.example",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      skuName: "Latte",
      amountTotalUsd: 4.5,
      stripeSessionId: "cs_test_commerce",
      customerEmail: "shopper@example.com",
    });
    expect(sentBody.reply_to).toBe("shopper@example.com");
  });

  it("sendCommerceBuyNowClientReceipt omits reply_to when no customer email was collected at checkout", async () => {
    const { sendCommerceBuyNowClientReceipt } = await import("./resend");
    await sendCommerceBuyNowClientReceipt({
      to: "owner@democafe.example",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      skuName: "Latte",
      amountTotalUsd: 4.5,
      stripeSessionId: "cs_test_commerce",
    });
    expect("reply_to" in sentBody).toBe(false);
  });
});

describe("resend.ts — abandoned-checkout recovery escalating cadence (recovery-email-escalating-cadence)", () => {
  const originalKey = process.env.RESEND_API_KEY;
  let sentSubject: string;
  let sentHtml: string;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    sentSubject = "";
    sentHtml = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        sentSubject = body.subject;
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

  it("sendCheckoutAbandonedRecovery defaults to the tier-1 (first-nudge) subject/copy when nudgeNumber is omitted", async () => {
    const { sendCheckoutAbandonedRecovery } = await import("./resend");
    await sendCheckoutAbandonedRecovery("owner@example.com", "Demo Cafe", "demo-cafe", "starter");
    expect(sentSubject).toBe("Still want to launch Demo Cafe?");
    expect(sentHtml).toContain("Your checkout is still open");
  });

  it("sendCheckoutAbandonedRecovery escalates subject/copy across nudge 1, 2, and 3+", async () => {
    const { sendCheckoutAbandonedRecovery } = await import("./resend");

    await sendCheckoutAbandonedRecovery("owner@example.com", "Demo Cafe", "demo-cafe", "starter", 1);
    expect(sentSubject).toBe("Still want to launch Demo Cafe?");

    await sendCheckoutAbandonedRecovery("owner@example.com", "Demo Cafe", "demo-cafe", "starter", 2);
    expect(sentSubject).toBe("Any questions about launching Demo Cafe?");
    expect(sentHtml).toContain("no sales call");

    await sendCheckoutAbandonedRecovery("owner@example.com", "Demo Cafe", "demo-cafe", "starter", 3);
    expect(sentSubject).toBe("Last reminder: your Demo Cafe checkout is still open");
    expect(sentHtml).toContain("Closing the loop");

    // Nudge 4+ stays on the tier-3 copy rather than growing new variants.
    await sendCheckoutAbandonedRecovery("owner@example.com", "Demo Cafe", "demo-cafe", "starter", 5);
    expect(sentSubject).toBe("Last reminder: your Demo Cafe checkout is still open");
  });

  it("sendCommerceAbandonedRecovery escalates subject/copy across nudge 1, 2, and 3+", async () => {
    const { sendCommerceAbandonedRecovery } = await import("./resend");

    await sendCommerceAbandonedRecovery("shopper@example.com", "Demo Cafe", "demo-cafe", "Latte", 1);
    expect(sentSubject).toBe("Still interested in Latte from Demo Cafe?");

    await sendCommerceAbandonedRecovery("shopper@example.com", "Demo Cafe", "demo-cafe", "Latte", 2);
    expect(sentSubject).toBe("Quick question about your Latte order");

    await sendCommerceAbandonedRecovery("shopper@example.com", "Demo Cafe", "demo-cafe", "Latte", 3);
    expect(sentSubject).toBe("Last reminder: your Latte order is still open");
    expect(sentHtml).toContain("Closing the loop");
  });

  it("escapes businessName in the tier-2 and tier-3 recovery copy, not just tier 1", async () => {
    const { sendCheckoutAbandonedRecovery } = await import("./resend");
    await sendCheckoutAbandonedRecovery("owner@example.com", UNSAFE_NAME, "demo-cafe", "starter", 2);
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");

    await sendCheckoutAbandonedRecovery("owner@example.com", UNSAFE_NAME, "demo-cafe", "starter", 3);
    expect(sentHtml).toContain(ESCAPED_NAME);
    expect(sentHtml).not.toContain("<Truck>");
  });
});

// Guards against the exact gap acquisition-source-preview-and-outreach-
// attribution closed: the outreach-email checkout links (Email 1/2/3 +
// abandoned-checkout recovery nudges) previously carried no ?source= token at
// all, so every outreach-driven conversion bucketed under "Unknown / direct"
// in the dashboard's acquisitionSourceBreakdown panel even though this
// cold-outbound business's outreach sequence is its dominant conversion
// path. Each checkout link must now carry &source=outreach-email (escaped to
// &amp;source=outreach-email in the sent HTML, same as every other query
// param already asserted elsewhere in this file).
describe("resend.ts — outreach checkout links carry acquisition-source attribution (acquisition-source-preview-and-outreach-attribution)", () => {
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

  it("tags sendOutreachEmail's (Email 1) checkout link", async () => {
    const { sendOutreachEmail } = await import("./resend");
    await sendOutreachEmail("owner@example.com", "Demo Cafe", "demo-cafe");
    expect(sentHtml).toContain("&amp;source=outreach-email");
  });

  it("tags sendOutreachFollowUp2's (Email 2) checkout link", async () => {
    const { sendOutreachFollowUp2 } = await import("./resend");
    await sendOutreachFollowUp2("owner@example.com", "Demo Cafe", "demo-cafe");
    expect(sentHtml).toContain("&amp;source=outreach-email");
  });

  it("tags sendOutreachFollowUp3's (Email 3) checkout link", async () => {
    const { sendOutreachFollowUp3 } = await import("./resend");
    await sendOutreachFollowUp3("owner@example.com", "Demo Cafe", "demo-cafe");
    expect(sentHtml).toContain("&amp;source=outreach-email");
  });

  it("tags sendCheckoutAbandonedRecovery's checkout link, alongside its existing &tier= param", async () => {
    const { sendCheckoutAbandonedRecovery } = await import("./resend");
    await sendCheckoutAbandonedRecovery("owner@example.com", "Demo Cafe", "demo-cafe", "starter");
    expect(sentHtml).toContain("&amp;tier=starter&amp;source=outreach-email");
  });

  it("adds &billing=annual to sendCheckoutAbandonedRecovery's checkout link when billingInterval is annual (checkout-recovery-billing-interval-carry-through)", async () => {
    const { sendCheckoutAbandonedRecovery } = await import("./resend");
    await sendCheckoutAbandonedRecovery(
      "owner@example.com",
      "Demo Cafe",
      "demo-cafe",
      "growth",
      1,
      "annual",
    );
    expect(sentHtml).toContain("&amp;tier=growth&amp;billing=annual&amp;source=outreach-email");
  });

  it("omits &billing= entirely when billingInterval is monthly or omitted", async () => {
    const { sendCheckoutAbandonedRecovery } = await import("./resend");
    await sendCheckoutAbandonedRecovery("owner@example.com", "Demo Cafe", "demo-cafe", "growth", 1, "monthly");
    expect(sentHtml).not.toContain("billing=");
    await sendCheckoutAbandonedRecovery("owner@example.com", "Demo Cafe", "demo-cafe", "growth");
    expect(sentHtml).not.toContain("billing=");
  });

  it("does NOT tag sendCommerceAbandonedRecovery's checkout link — that flow links to the client's own preview/catalog, not /checkout, and has no bundle acquisition to attribute", async () => {
    const { sendCommerceAbandonedRecovery } = await import("./resend");
    await sendCommerceAbandonedRecovery("shopper@example.com", "Demo Cafe", "demo-cafe", "Latte");
    expect(sentHtml).not.toContain("source=outreach-email");
  });
});
