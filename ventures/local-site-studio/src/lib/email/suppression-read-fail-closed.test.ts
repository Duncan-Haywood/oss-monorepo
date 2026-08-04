import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An unanswerable suppression check must never be read as consent.
 *
 * `UNSUBSCRIBE_CONVEX_PRIMARY` made the suppression *write* fail closed: with
 * Convex configured, GET /api/unsubscribe returns 500 rather than writing only
 * to instance-local SQLite. The read did not follow. `isEmailSuppressed`
 * caught a Convex query failure, logged "falling back to SQLite database", and
 * queried a `suppression_list` table that — precisely because the write is
 * Convex-primary — is provably always empty on such a deploy. It returned
 * `false`, `sendEmail` read that as "not suppressed", and the send proceeded.
 *
 * So the harder the write was hardened, the more certainly a Convex outage
 * turned into permission to email people who had just opted out. That is the
 * CAN-SPAM split-brain the write policy exists to prevent, arriving through the
 * other door.
 *
 * Every assertion below is on whether `fetch` reached the Resend API, not only
 * on the returned shape: a version that delivered the email and *then* reported
 * failure would satisfy the return value and still be the bug.
 */

// Hoisted so the handle survives `vi.resetModules()`. Importing `../db` from
// the test body instead would pull in `server-only`, which throws outside a
// Server Component — the same reason `resend.test.ts` stubs this module.
const { isEmailSuppressed } = vi.hoisted(() => ({ isEmailSuppressed: vi.fn() }));

vi.mock("../db", () => ({ isEmailSuppressed }));

describe("suppression read is fail-closed", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const originalBrandName = process.env.NEXT_PUBLIC_BRAND_NAME;
  const originalPostal = process.env.NEXT_PUBLIC_COMPANY_ADDRESS;
  let sendCalls: number;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_live_not_a_placeholder";
    // This file is about the suppression branch, so the CAN-SPAM footer gate
    // (canspam-footer.ts) must not be the thing stopping a send — otherwise the
    // "still sends" case would pass for the wrong reason.
    process.env.NEXT_PUBLIC_APP_URL = "https://studio.marisstella.dev";
    process.env.NEXT_PUBLIC_BRAND_NAME = "Local Site Studio";
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS =
      "1600 Pearl St Suite 200, Boulder, CO 80302";
    sendCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        sendCalls += 1;
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
   * The error class must come from the same module instance `resend.ts` will
   * import, or `instanceof` compares two structurally identical classes from
   * different module registries and the fail-closed branch is never entered.
   * `vi.resetModules()` in afterEach is what makes that a real hazard here.
   */
  async function load() {
    isEmailSuppressed.mockReset();
    const [{ sendEmail }, { ConvexPrimaryReadError }] = await Promise.all([
      import("./resend"),
      import("../payments/convex-primary"),
    ]);
    return { sendEmail, ConvexPrimaryReadError, isEmailSuppressed };
  }

  it("does not send when the suppression store cannot be read", async () => {
    const { sendEmail, ConvexPrimaryReadError, isEmailSuppressed } = await load();
    isEmailSuppressed.mockRejectedValue(
      new ConvexPrimaryReadError("isEmailSuppressed", new Error("connection reset")),
    );

    const result = await sendEmail({
      to: "someone@example.com",
      subject: "Ready for more customers?",
      html: "<p>upsell</p>",
    });

    expect(sendCalls).toBe(0);
    expect(result.success).toBe(false);
    expect("error" in result && String(result.error)).toContain("not sent");
  });

  it("still sends when the store answers that the address is not suppressed", async () => {
    // The failing direction above is only meaningful if the passing one works;
    // a blanket refusal to send would otherwise satisfy it.
    const { sendEmail, isEmailSuppressed } = await load();
    isEmailSuppressed.mockResolvedValue(false);

    const result = await sendEmail({
      to: "someone@example.com",
      subject: "Ready for more customers?",
      html: "<p>upsell</p>",
    });

    expect(sendCalls).toBe(1);
    expect(result.success).toBe(true);
  });

  it("still declines when the store answers that the address is suppressed", async () => {
    const { sendEmail, isEmailSuppressed } = await load();
    isEmailSuppressed.mockResolvedValue(true);

    const result = await sendEmail({
      to: "someone@example.com",
      subject: "Ready for more customers?",
      html: "<p>upsell</p>",
    });

    expect(sendCalls).toBe(0);
    expect(result.success).toBe(false);
    expect("reason" in result && result.reason).toBe("suppressed");
  });

  it("rethrows errors that are not a Convex read failure", async () => {
    // A fail-closed branch that swallowed every error would hide real bugs.
    const { sendEmail, isEmailSuppressed } = await load();
    isEmailSuppressed.mockRejectedValue(new TypeError("email.toLowerCase is not a function"));

    await expect(
      sendEmail({ to: "someone@example.com", subject: "s", html: "<p>h</p>" }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(sendCalls).toBe(0);
  });
});
