import { describe, expect, it } from "vitest";
import { MAX_LEAD_SLUG_LENGTH, sanitizeLeadSlug } from "./slug";
import { leadSlugAsDnsLabel } from "./slug-path";

describe("sanitizeLeadSlug", () => {
  it("lowercases, replaces non-token chars with dashes, and collapses runs", () => {
    expect(sanitizeLeadSlug("Blue River Salon & Spa!")).toBe("blue-river-salon-spa");
    expect(sanitizeLeadSlug("Demo Cafe!")).toBe("demo-cafe");
  });

  it("strips leading and trailing dashes so the CRM slug matches DNS labels", () => {
    // Regression: addLead/CSV previously kept edge dashes (demo-cafe- from
    // "Demo Cafe!") while leadSlugAsDnsLabel stripped them — preview subdomain
    // Host lookup then missed the lead (create-path-slug-edge-dash-normalize).
    expect(sanitizeLeadSlug("Demo Cafe!")).toBe("demo-cafe");
    expect(sanitizeLeadSlug("---foo---")).toBe("foo");
    expect(sanitizeLeadSlug("-already-clean-")).toBe("already-clean");
    expect(sanitizeLeadSlug("Demo Cafe!")).toBe(
      leadSlugAsDnsLabel("Demo Cafe!"),
    );
  });

  it("caps at MAX_LEAD_SLUG_LENGTH (DNS label max) and re-strips edge dashes", () => {
    // Regression: create-path-slug-dns-label-max-length — a 200-char
    // businessName or long operator slug produced suggestedHost labels that
    // exceed RFC 1035's 63-char DNS label max, so Vercel/Host→preview fail.
    const long = `a-very-long-local-business-name-that-exceeds-dns-label-max-${"x".repeat(40)}`;
    const slug = sanitizeLeadSlug(long);
    expect(slug.length).toBeLessThanOrEqual(MAX_LEAD_SLUG_LENGTH);
    expect(slug).not.toMatch(/^-|-$/);
    expect(slug).toBe(leadSlugAsDnsLabel(long));
    expect(MAX_LEAD_SLUG_LENGTH).toBe(63);
  });

  it("truncation that lands on a dash does not leave a trailing dash", () => {
    // 63 chars ending mid-token after a dash run
    const raw = `${"a".repeat(60)}---bbb`;
    const slug = sanitizeLeadSlug(raw);
    expect(slug.length).toBeLessThanOrEqual(MAX_LEAD_SLUG_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe(leadSlugAsDnsLabel(raw));
  });

  it("returns empty string when nothing alphanumeric remains", () => {
    expect(sanitizeLeadSlug("!!!")).toBe("");
    expect(sanitizeLeadSlug("---")).toBe("");
    expect(sanitizeLeadSlug("   ")).toBe("");
    expect(sanitizeLeadSlug("")).toBe("");
  });

  it("preserves an already-normalized slug", () => {
    expect(sanitizeLeadSlug("blue-river-salon")).toBe("blue-river-salon");
    expect(sanitizeLeadSlug("organic-abc123")).toBe("organic-abc123");
  });
});
