import { describe, expect, it } from "vitest";
import {
  STATIC_SAFE_CONTENT_SECURITY_POLICY,
  buildNonceContentSecurityPolicy,
  generateCspNonce,
  isNonceCspPath,
} from "./content-security-policy";

describe("STATIC_SAFE_CONTENT_SECURITY_POLICY", () => {
  it("hardens object-src/base-uri/form-action/frame-ancestors without a nonce", () => {
    expect(STATIC_SAFE_CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(STATIC_SAFE_CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
    expect(STATIC_SAFE_CONTENT_SECURITY_POLICY).toContain("form-action 'self'");
    expect(STATIC_SAFE_CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(STATIC_SAFE_CONTENT_SECURITY_POLICY).toContain("upgrade-insecure-requests");
  });

  it("leaves default-src/script-src/style-src unset so static-page hydration keeps working", () => {
    expect(STATIC_SAFE_CONTENT_SECURITY_POLICY).not.toContain("default-src");
    expect(STATIC_SAFE_CONTENT_SECURITY_POLICY).not.toContain("script-src");
    expect(STATIC_SAFE_CONTENT_SECURITY_POLICY).not.toContain("style-src");
  });
});

describe("buildNonceContentSecurityPolicy", () => {
  it("scopes script-src and style-src to the given nonce", () => {
    const csp = buildNonceContentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("style-src 'self' 'nonce-abc123'");
  });

  it("adds 'unsafe-eval' to script-src only in dev (React's SSR error reconstruction)", () => {
    const dev = buildNonceContentSecurityPolicy("abc123", true);
    const prod = buildNonceContentSecurityPolicy("abc123", false);
    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it("still carries the same object-src/base-uri/form-action/frame-ancestors hardening", () => {
    const csp = buildNonceContentSecurityPolicy("abc123", false);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("locks default-src to 'self' as the fallback for any unlisted fetch directive", () => {
    expect(buildNonceContentSecurityPolicy("abc123", false)).toContain("default-src 'self'");
  });

  it("allows the /preview Google Maps embed's origins via frame-src", () => {
    const csp = buildNonceContentSecurityPolicy("abc123", false);
    expect(csp).toContain("frame-src 'self' https://www.google.com https://maps.google.com");
  });

  it("two calls never produce the same nonce value embedded twice by accident", () => {
    const a = buildNonceContentSecurityPolicy(generateCspNonce(), false);
    const b = buildNonceContentSecurityPolicy(generateCspNonce(), false);
    expect(a).not.toBe(b);
  });
});

describe("generateCspNonce", () => {
  it("returns a non-empty base64 string, unique per call", () => {
    const nonce = generateCspNonce();
    expect(nonce.length).toBeGreaterThan(0);
    expect(/^[A-Za-z0-9+/=]+$/.test(nonce)).toBe(true);
    expect(generateCspNonce()).not.toBe(nonce);
  });
});

describe("isNonceCspPath", () => {
  it("matches /dashboard and its subpaths", () => {
    expect(isNonceCspPath("/dashboard")).toBe(true);
    expect(isNonceCspPath("/dashboard/leads")).toBe(true);
    expect(isNonceCspPath("/dashboard/login")).toBe(true);
  });

  it("matches /checkout and its subpaths", () => {
    expect(isNonceCspPath("/checkout")).toBe(true);
    expect(isNonceCspPath("/checkout/success")).toBe(true);
  });

  it("matches /preview and its subpaths, including the image-convention routes", () => {
    expect(isNonceCspPath("/preview")).toBe(true);
    expect(isNonceCspPath("/preview/joes-plumbing")).toBe(true);
    expect(isNonceCspPath("/preview/-/opengraph-image")).toBe(true);
  });

  it("does not match a path that merely shares a prefix (no false positive on a sibling name)", () => {
    expect(isNonceCspPath("/dashboardish")).toBe(false);
    expect(isNonceCspPath("/checkoutzzz")).toBe(false);
    expect(isNonceCspPath("/previewer")).toBe(false);
  });

  it("does not match static marketing/docs routes", () => {
    expect(isNonceCspPath("/")).toBe(false);
    expect(isNonceCspPath("/docs")).toBe(false);
    expect(isNonceCspPath("/docs/architecture")).toBe(false);
    expect(isNonceCspPath("/privacy")).toBe(false);
    expect(isNonceCspPath("/terms")).toBe(false);
    expect(isNonceCspPath("/opengraph-image")).toBe(false);
  });
});
