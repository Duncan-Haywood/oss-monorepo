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
    expect(stub.tagline).toBe("Your neighborhood business, online");
    expect(stub.description).toContain("New Bakery");
    expect(stub.hours.weekday).toContain("Mon");
  });

  it("uses a real checkout-time businessName/phone override when supplied", () => {
    const stub = buildPaymentStubLeadFields("organic-a1b2c3", {
      businessName: "Riverside Plumbing",
      phone: "555-867-5309",
    });
    expect(stub.businessName).toBe("Riverside Plumbing");
    expect(stub.phone).toBe("555-867-5309");
    expect(stub.description).toContain("Riverside Plumbing");
    expect(stub.description).not.toContain("Organic");
  });

  it("falls back to derived defaults when overrides are blank/absent", () => {
    const blank = buildPaymentStubLeadFields("organic-a1b2c3", { businessName: "", phone: "" });
    expect(blank.businessName).toBe("Organic A1b2c3");
    expect(blank.phone).toBe("(555) 000-0000");

    const noOverrides = buildPaymentStubLeadFields("organic-a1b2c3");
    expect(noOverrides.businessName).toBe("Organic A1b2c3");
    expect(noOverrides.phone).toBe("(555) 000-0000");
  });
});
