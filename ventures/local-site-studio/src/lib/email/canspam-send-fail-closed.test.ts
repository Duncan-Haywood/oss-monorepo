/**
 * The send path itself, not a stand-in for it.
 *
 * `./resend` — the module the fix lives in — is imported for real. Only
 * `../db` is stubbed, and only because `isEmailSuppressed` drags in
 * "server-only"; the suppression answer it returns (false) is the one that
 * *permits* a send, so it cannot be what blocks these cases. `fetch` is stubbed
 * to observe whether a message would have left the process, which is the whole
 * question.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  isEmailSuppressed: vi.fn(async () => false),
}));

const REAL_KEY = "re_live_not_a_placeholder";
const REAL_ADDRESS = "1600 Pearl St Suite 200, Boulder, CO 80302";
const REAL_BRAND = "Harbor Site Studio";
const REAL_ORIGIN = "https://studio.marisstella.dev";

const MANAGED_ENV = [
  "RESEND_API_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BRAND_NAME",
  "NEXT_PUBLIC_APP_NAME",
  "NEXT_PUBLIC_COMPANY_ADDRESS",
] as const;

const originalEnv: Record<string, string | undefined> = {};
let fetchMock: ReturnType<typeof vi.fn>;

function setEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

/** The environment the Kubernetes Deployment actually provides: none of it. */
function unconfiguredEnv() {
  setEnv({
    RESEND_API_KEY: REAL_KEY,
    NEXT_PUBLIC_APP_URL: undefined,
    NEXT_PUBLIC_BRAND_NAME: undefined,
    NEXT_PUBLIC_APP_NAME: undefined,
    NEXT_PUBLIC_COMPANY_ADDRESS: undefined,
  });
}

function configuredEnv() {
  setEnv({
    RESEND_API_KEY: REAL_KEY,
    NEXT_PUBLIC_APP_URL: REAL_ORIGIN,
    NEXT_PUBLIC_BRAND_NAME: REAL_BRAND,
    NEXT_PUBLIC_APP_NAME: undefined,
    NEXT_PUBLIC_COMPANY_ADDRESS: REAL_ADDRESS,
  });
}

/** Body of the single Resend request, or null when nothing was transmitted. */
function transmittedHtml(): string | null {
  const call = fetchMock.mock.calls[0];
  if (!call) return null;
  return JSON.parse(String((call[1] as RequestInit).body)).html as string;
}

beforeEach(() => {
  for (const name of MANAGED_ENV) originalEnv[name] = process.env[name];
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ id: "email_test" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setEnv(originalEnv);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("sendEmail — CAN-SPAM footer fail-closed", () => {
  it("refuses to transmit when NEXT_PUBLIC_COMPANY_ADDRESS is unset", async () => {
    configuredEnv();
    setEnv({ NEXT_PUBLIC_COMPANY_ADDRESS: undefined });
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: "owner@example.com",
      subject: "hello",
      html: "<p>hi</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("NEXT_PUBLIC_COMPANY_ADDRESS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when the address is still the documented bracket placeholder", async () => {
    configuredEnv();
    setEnv({
      NEXT_PUBLIC_COMPANY_ADDRESS: "[Registered business address — Colorado, USA]",
    });
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: "owner@example.com",
      subject: "hello",
      html: "<p>hi</p>",
    });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when the brand name is still 'Your Brand'", async () => {
    configuredEnv();
    setEnv({ NEXT_PUBLIC_BRAND_NAME: "Your Brand" });
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: "owner@example.com",
      subject: "hello",
      html: "<p>hi</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("NEXT_PUBLIC_BRAND_NAME");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when the unsubscribe origin would be localhost", async () => {
    configuredEnv();
    setEnv({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: "owner@example.com",
      subject: "hello",
      html: "<p>hi</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("NEXT_PUBLIC_APP_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names all three variables when the environment is the one production runs", async () => {
    unconfiguredEnv();
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: "owner@example.com",
      subject: "hello",
      html: "<p>hi</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("NEXT_PUBLIC_BRAND_NAME");
    expect(result.error).toContain("NEXT_PUBLIC_COMPANY_ADDRESS");
    expect(result.error).toContain("NEXT_PUBLIC_APP_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("transmits, with the configured address and a reachable opt-out, once set", async () => {
    configuredEnv();
    const { sendEmail } = await import("./resend");

    const result = await sendEmail({
      to: "owner@example.com",
      subject: "hello",
      html: "<p>hi</p>",
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const html = transmittedHtml();
    expect(html).toContain(REAL_ADDRESS);
    expect(html).toContain(`${REAL_ORIGIN}/api/unsubscribe`);
    expect(html).toContain(REAL_BRAND);
  });
});

describe("no transmitted message carries a placeholder", () => {
  // Every helper funnels through sendEmail, so the gate has to hold for all of
  // them — the recurring failure in this class is a fix that covers only the
  // one field it was written for.
  const senders: Array<[string, (m: typeof import("./resend")) => Promise<unknown>]> = [
    ["sendOutreachEmail", (m) => m.sendOutreachEmail("o@example.com", "Joe's Auto", "joes-auto")],
    ["sendOutreachFollowUp2", (m) => m.sendOutreachFollowUp2("o@example.com", "Joe's Auto", "joes-auto")],
    ["sendOutreachFollowUp3", (m) => m.sendOutreachFollowUp3("o@example.com", "Joe's Auto", "joes-auto")],
    [
      "sendCheckoutAbandonedRecovery",
      (m) => m.sendCheckoutAbandonedRecovery("o@example.com", "Joe's Auto", "joes-auto", "starter"),
    ],
    [
      "sendCommerceAbandonedRecovery",
      (m) => m.sendCommerceAbandonedRecovery("o@example.com", "Joe's Auto", "joes-auto", "Oil change"),
    ],
    [
      "sendStarterUpsellEmail",
      (m) =>
        m.sendStarterUpsellEmail({
          to: "o@example.com",
          businessName: "Joe's Auto",
          slug: "joes-auto",
          targetTier: "growth",
          monthlyPriceUsd: 99,
        }),
    ],
    [
      "sendInquiryReply",
      (m) =>
        m.sendInquiryReply({
          to: "o@example.com",
          businessName: "Joe's Auto",
          leadSlug: "joes-auto",
          replyBody: "Thanks for reaching out.",
          originalMessage: "Do you do brakes?",
        }),
    ],
    ["sendReceiptEmail", (m) => m.sendReceiptEmail("o@example.com", "Joe's Auto", "starter", 500)],
  ];

  it.each(senders)("%s refuses to transmit in the unconfigured environment", async (_name, send) => {
    unconfiguredEnv();
    const resend = await import("./resend");

    const result = (await send(resend)) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(senders)("%s transmits no localhost link or placeholder once configured", async (_name, send) => {
    configuredEnv();
    const resend = await import("./resend");

    await send(resend);

    const html = transmittedHtml();
    expect(html).not.toBeNull();
    expect(html).not.toContain("localhost");
    expect(html).not.toContain("Your Brand");
    expect(html).not.toContain("[Registered business address");
    expect(html).not.toContain("localsitestudio.com");
  });
});
