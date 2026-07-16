import { describe, expect, it } from "vitest";
import {
  MAX_BILLING_PORTAL_RETURN_URL_LENGTH,
  isAcceptableBillingPortalReturnUrl,
} from "./return-url";

describe("isAcceptableBillingPortalReturnUrl", () => {
  const appUrl = "https://app.example.com";

  it("accepts a same-origin absolute URL under the length ceiling", () => {
    expect(
      isAcceptableBillingPortalReturnUrl(
        "https://app.example.com/dashboard/leads",
        appUrl,
      ),
    ).toBe(true);
  });

  it("rejects a cross-origin URL", () => {
    expect(
      isAcceptableBillingPortalReturnUrl(
        "https://attacker.example.net/phish",
        appUrl,
      ),
    ).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(isAcceptableBillingPortalReturnUrl("not a url", appUrl)).toBe(false);
  });

  it("rejects a same-origin URL over MAX_BILLING_PORTAL_RETURN_URL_LENGTH", () => {
    const over = `https://app.example.com/${"a".repeat(MAX_BILLING_PORTAL_RETURN_URL_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_BILLING_PORTAL_RETURN_URL_LENGTH);
    expect(isAcceptableBillingPortalReturnUrl(over, appUrl)).toBe(false);
  });

  it("accepts a same-origin URL at exactly MAX length", () => {
    const prefix = "https://app.example.com/";
    const exact = `${prefix}${"b".repeat(MAX_BILLING_PORTAL_RETURN_URL_LENGTH - prefix.length)}`;
    expect(exact.length).toBe(MAX_BILLING_PORTAL_RETURN_URL_LENGTH);
    expect(isAcceptableBillingPortalReturnUrl(exact, appUrl)).toBe(true);
  });
});
