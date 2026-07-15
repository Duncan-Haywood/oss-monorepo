import { describe, expect, it } from "vitest";
import { sanitizeLeadSlug } from "./slug";
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
