import { appLink } from "@worker/services/billing/service";
import { describe, expect, it } from "vitest";

// Checkout and portal return URLs: new URL("/o/x/billing", APP_URL) would drop APP_URL's base path.
describe("appLink", () => {
  it("keeps the base path in APP_URL", () => {
    expect(appLink("https://marisstella.app/seller-books/app", "/o/org_1/billing")).toBe(
      "https://marisstella.app/seller-books/app/o/org_1/billing",
    );
    expect(appLink("https://marisstella.app/seller-books/app/", "/o/org_1/billing")).toBe(
      "https://marisstella.app/seller-books/app/o/org_1/billing",
    );
  });

  it("works at a host root", () => {
    expect(appLink("http://localhost:5173", "/o/org_1/billing")).toBe(
      "http://localhost:5173/o/org_1/billing",
    );
  });
});
