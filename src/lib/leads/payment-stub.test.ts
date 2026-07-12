import { describe, expect, it } from "vitest";
import {
  buildPaymentStubLeadFields,
  businessNameFromPaymentSlug,
} from "./payment-stub";

describe("businessNameFromPaymentSlug", () => {
  it("title-cases hyphenated slugs", () => {
    expect(businessNameFromPaymentSlug("demo-cafe")).toBe("Demo Cafe");
  });

  it("falls back to Unknown for empty slug pieces", () => {
    expect(businessNameFromPaymentSlug("---")).toBe("Unknown");
  });
});

describe("buildPaymentStubLeadFields", () => {
  it("returns a paid generic stub matching mapSqliteRowToLead defaults", () => {
    const stub = buildPaymentStubLeadFields("new-bakery");
    expect(stub).toMatchObject({
      slug: "new-bakery",
      businessName: "New Bakery",
      category: "generic",
      city: "Colorado",
      state: "CO",
      stage: "paid",
      recommendedTier: "growth",
      dataSource: "payment_stub",
      phone: "(555) 000-0000",
      services: [],
    });
    expect(stub.tagline).toContain("Local favorites");
    expect(stub.description).toContain("New Bakery");
    expect(stub.hours.weekday).toContain("Mon");
  });
});
