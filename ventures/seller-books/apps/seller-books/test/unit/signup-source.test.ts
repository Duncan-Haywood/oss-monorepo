import {
  normalizeSignupSource,
  signupSourceFromSearch,
  signupSourceSite,
} from "@shared/signup-source";
import { describe, expect, it } from "vitest";

describe("normalizeSignupSource", () => {
  it("accepts our page names, lowercased, without .html", () => {
    expect(normalizeSignupSource("ebay-fee-calculator/schedule-c-worksheet-for-resellers")).toBe(
      "ebay-fee-calculator/schedule-c-worksheet-for-resellers",
    );
    expect(normalizeSignupSource(" Seller-Books-Site/Pricing.html ")).toBe(
      "seller-books-site/pricing",
    );
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
    expect(signupSourceFromSearch("?from=seller-books-site%2Fhome")).toBe("seller-books-site/home");
    expect(signupSourceFromSearch("?next=%2Forgs")).toBeNull();
    expect(signupSourceSite("seller-books-site/home")).toBe("seller-books-site");
    expect(signupSourceSite("poshmark-fee-calculator")).toBe("poshmark-fee-calculator");
  });
});
