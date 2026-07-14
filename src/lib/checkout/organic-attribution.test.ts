import { describe, expect, it } from "vitest";
import {
  ORGANIC_CHECKOUT_SLUG_PREFIX,
  isOrganicCheckoutLeadSlug,
  mintOrganicCheckoutLeadSlug,
  resolveBundleCheckoutLeadSlug,
} from "./organic-attribution";

describe("organic checkout attribution", () => {
  it("mints organic-* slugs with the provided hex id", () => {
    expect(mintOrganicCheckoutLeadSlug(() => "a1b2c3d4e5f6")).toBe(
      `${ORGANIC_CHECKOUT_SLUG_PREFIX}a1b2c3d4e5f6`,
    );
  });

  it("rejects an empty mint id", () => {
    expect(() => mintOrganicCheckoutLeadSlug(() => "  ")).toThrow(/empty id/);
  });

  it("keeps an explicit lead slug and does not mint", () => {
    expect(resolveBundleCheckoutLeadSlug("example-bakery")).toEqual({
      leadSlug: "example-bakery",
      mintedOrganic: false,
    });
    expect(resolveBundleCheckoutLeadSlug("  serene-salon  ")).toEqual({
      leadSlug: "serene-salon",
      mintedOrganic: false,
    });
  });

  it("mints when slug is missing or whitespace-only", () => {
    const minted = resolveBundleCheckoutLeadSlug(undefined, () => "organic-fixed");
    expect(minted).toEqual({ leadSlug: "organic-fixed", mintedOrganic: true });

    const blank = resolveBundleCheckoutLeadSlug("   ", () => "organic-blank");
    expect(blank).toEqual({ leadSlug: "organic-blank", mintedOrganic: true });
  });

  it("sanitizes a client-supplied slug to [a-z0-9-]+, matching every other lead-slug-creation path", () => {
    expect(resolveBundleCheckoutLeadSlug("Demo Cafe!!")).toEqual({
      leadSlug: "demo-cafe",
      mintedOrganic: false,
    });
  });

  it("strips dot-segment traversal out of a client-supplied slug instead of persisting it verbatim", () => {
    // Unsanitized, this would be interpolated into suggestedHost/previewUrl
    // (src/lib/deploy/handoff.ts) and proxy.ts's preview-subdomain rewrite —
    // a browser/URL-parser-visible ".." segment there escapes the intended
    // single-path-segment slug, the same traversal class safeNextPath
    // guards against on the login-redirect surface.
    expect(resolveBundleCheckoutLeadSlug("../../dashboard/leads")).toEqual({
      leadSlug: "dashboard-leads",
      mintedOrganic: false,
    });
    expect(resolveBundleCheckoutLeadSlug("/etc/passwd")).toEqual({
      leadSlug: "etc-passwd",
      mintedOrganic: false,
    });
  });

  it("mints when a client-supplied slug sanitizes away to nothing", () => {
    const minted = resolveBundleCheckoutLeadSlug("???", () => "organic-symbols");
    expect(minted).toEqual({ leadSlug: "organic-symbols", mintedOrganic: true });

    const dotsOnly = resolveBundleCheckoutLeadSlug("..", () => "organic-dots");
    expect(dotsOnly).toEqual({ leadSlug: "organic-dots", mintedOrganic: true });
  });

  it("detects organic attribution slugs", () => {
    expect(isOrganicCheckoutLeadSlug("organic-abc123")).toBe(true);
    expect(isOrganicCheckoutLeadSlug("ORGANIC-ABC")).toBe(true);
    expect(isOrganicCheckoutLeadSlug("example-bakery")).toBe(false);
  });
});
