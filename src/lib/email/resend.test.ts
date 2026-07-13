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
