import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sending actually hits ../db (isEmailSuppressed) which imports "server-only" —
// stub it so this stays a pure unit test of the HTML templates.
vi.mock("../db", () => ({
  isEmailSuppressed: vi.fn(async () => false),
}));

const UNSAFE_NAME = `O'Brien's Auto & <Truck> Repair`;
const ESCAPED_NAME = "O&#39;Brien&#39;s Auto &amp; &lt;Truck&gt; Repair";

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
