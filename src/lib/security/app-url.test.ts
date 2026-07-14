import { describe, expect, it } from "vitest";
import { resolveStripeRedirectAppUrl, resolveTrustedAppUrl } from "./app-url";

function headerStore(entries: Record<string, string | null> = {}) {
  return {
    get(name: string) {
      return entries[name] ?? null;
    },
  };
}

describe("resolveTrustedAppUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL when set, ignoring headers entirely", () => {
    const result = resolveTrustedAppUrl(
      headerStore({ "x-forwarded-host": "attacker.example" }),
      "https://app.example",
    );
    expect(result).toBe("https://app.example");
  });

  it("derives from x-forwarded-host + x-forwarded-proto when APP_URL is unset", () => {
    const result = resolveTrustedAppUrl(
      headerStore({ "x-forwarded-host": "ops.localsitestudio.test", "x-forwarded-proto": "https" }),
      undefined,
    );
    expect(result).toBe("https://ops.localsitestudio.test");
  });

  it("falls back to the host header and http proto when forwarded headers are absent", () => {
    const result = resolveTrustedAppUrl(headerStore({ host: "localhost:3000" }), undefined);
    expect(result).toBe("http://localhost:3000");
  });

  it("falls back to the localhost default when no APP_URL and no host headers", () => {
    const result = resolveTrustedAppUrl(headerStore(), undefined);
    expect(result).toBe("http://localhost:3000");
  });

  it("falls back to the localhost default on a malformed host header instead of trusting it verbatim", () => {
    const result = resolveTrustedAppUrl(
      headerStore({ "x-forwarded-host": '"><script>alert(1)</script>' }),
      undefined,
    );
    expect(result).toBe("http://localhost:3000");
  });

  it("falls back to the localhost default on a host header containing whitespace", () => {
    const result = resolveTrustedAppUrl(
      headerStore({ "x-forwarded-host": "evil example.com" }),
      undefined,
    );
    expect(result).toBe("http://localhost:3000");
  });
});

describe("resolveStripeRedirectAppUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL and strips a trailing slash", () => {
    expect(
      resolveStripeRedirectAppUrl({
        NEXT_PUBLIC_APP_URL: "https://app.example.com/",
        VERCEL_URL: "ignored.vercel.app",
      }),
    ).toBe("https://app.example.com");
  });

  it("falls back to https://VERCEL_URL when APP_URL is unset", () => {
    expect(
      resolveStripeRedirectAppUrl({
        NEXT_PUBLIC_APP_URL: undefined,
        VERCEL_URL: "preview-abc.vercel.app",
      }),
    ).toBe("https://preview-abc.vercel.app");
  });

  it("strips a scheme prefix already present on VERCEL_URL", () => {
    expect(
      resolveStripeRedirectAppUrl({
        VERCEL_URL: "https://preview-abc.vercel.app/",
      }),
    ).toBe("https://preview-abc.vercel.app");
  });

  it("falls back to localhost when neither APP_URL nor VERCEL_URL is set", () => {
    expect(resolveStripeRedirectAppUrl({})).toBe("http://localhost:3000");
  });

  it("treats whitespace-only APP_URL as unset and falls through to VERCEL_URL", () => {
    expect(
      resolveStripeRedirectAppUrl({
        NEXT_PUBLIC_APP_URL: "   ",
        VERCEL_URL: "preview-abc.vercel.app",
      }),
    ).toBe("https://preview-abc.vercel.app");
  });

  it("never trusts a request Host / origin — money redirects must not use header-derived bases", () => {
    // Regression: the old `NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin`
    // pattern let an attacker mint Stripe success_url / return_url on their
    // origin when APP_URL was unset. This helper has no headerStore parameter
    // by design — the assertion below documents that contract.
    const spoofed = resolveStripeRedirectAppUrl({
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_URL: undefined,
    });
    expect(spoofed).toBe("http://localhost:3000");
    expect(spoofed).not.toContain("attacker");
  });
});
