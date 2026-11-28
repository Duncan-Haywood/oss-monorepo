import {
  normalizeSignupSource,
  signupSourceFromSearch,
  signupSourceSite,
} from "@shared/signup-source";
import { describe, expect, it } from "vitest";

describe("normalizeSignupSource", () => {
  it("accepts our page names, lowercased, without .html", () => {
    expect(normalizeSignupSource("machine-shop-guides/cnc-cycle-time")).toBe(
      "machine-shop-guides/cnc-cycle-time",
    );
    expect(normalizeSignupSource(" Jobshop-Site/Pricing.html ")).toBe("jobshop-site/pricing");
    expect(normalizeSignupSource("site")).toBe("site");
  });

  it("refuses URLs, paths, odd characters and over-long values", () => {
    for (const bad of [
      "",
      "https://example.com",
      "/leading",
      "trailing/",
      "a//b",
      "a/../b",
      "name with space",
      "email@example.com",
      "<script>",
      "x".repeat(81),
    ]) {
      expect(normalizeSignupSource(bad), bad).toBeNull();
    }
    expect(normalizeSignupSource(null)).toBeNull();
    expect(normalizeSignupSource(undefined)).toBeNull();
  });

  it("reads from= out of a search string and names its site", () => {
    expect(signupSourceFromSearch("?from=jobshop-site%2Fhome")).toBe("jobshop-site/home");
    expect(signupSourceFromSearch("?next=%2Forgs")).toBeNull();
    expect(signupSourceSite("jobshop-site/home")).toBe("jobshop-site");
    expect(signupSourceSite("poshmark-fee-calculator")).toBe("poshmark-fee-calculator");
  });
});
