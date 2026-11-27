import { describe, expect, it } from "vitest";
import { normalizeSignupSource, signupSourceFromSearch, signupSourceSite } from "./signup-source";

describe("normalizeSignupSource", () => {
  it("accepts our page names, lowercased, without .html", () => {
    expect(normalizeSignupSource("pay-app-guides/punch-list")).toBe("pay-app-guides/punch-list");
    expect(normalizeSignupSource(" Certified-Payroll-Calculator/WH347-report.html ")).toBe(
      "certified-payroll-calculator/wh347-report",
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
    expect(signupSourceFromSearch("?signup&from=pay-app-guides%2Fpaid-short")).toBe(
      "pay-app-guides/paid-short",
    );
    expect(signupSourceFromSearch("?signup")).toBeNull();
    expect(signupSourceSite("pay-app-guides/paid-short")).toBe("pay-app-guides");
    expect(signupSourceSite("lien-waiver-checker")).toBe("lien-waiver-checker");
  });
});
