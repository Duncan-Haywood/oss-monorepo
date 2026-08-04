import { describe, expect, it } from "vitest";
import {
  PENDING_BUSINESS_NAME,
  buildPaymentStubLeadFields,
  businessNameFromPaymentSlug,
} from "./payment-stub";
import { mintOrganicCheckoutLeadSlug } from "@/lib/checkout/organic-attribution";

describe("businessNameFromPaymentSlug", () => {
  it("title-cases a human-named CRM slug", () => {
    expect(businessNameFromPaymentSlug("demo-cafe")).toBe("Demo Cafe");
  });

  it("prefers the name the buyer typed at checkout over anything slug-derived", () => {
    expect(businessNameFromPaymentSlug("demo-cafe", "Demo Coffee Roasters")).toBe(
      "Demo Coffee Roasters",
    );
  });

  it("trims the buyer's name and ignores a whitespace-only one", () => {
    expect(businessNameFromPaymentSlug("demo-cafe", "  Demo Cafe  ")).toBe("Demo Cafe");
    expect(businessNameFromPaymentSlug("demo-cafe", "   ")).toBe("Demo Cafe");
  });

  /**
   * The defect this replaces: a homepage CTA mints organic-<hex>, and
   * title-casing it produced a paying customer named "Organic 8f3a2b1c9d4e"
   * on their receipt, their dashboard row, and their own preview page.
   */
  it("does not title-case a minted organic slug into a business name", () => {
    const slug = mintOrganicCheckoutLeadSlug(() => "8f3a2b1c9d4e");
    const name = businessNameFromPaymentSlug(slug);
    expect(name).toBe(PENDING_BUSINESS_NAME);
    expect(name).not.toContain("Organic");
    expect(name).not.toContain("8f3a2b1c9d4e");
  });

  it("still uses the buyer's name on an organic slug when checkout collected one", () => {
    const slug = mintOrganicCheckoutLeadSlug(() => "8f3a2b1c9d4e");
    expect(businessNameFromPaymentSlug(slug, "Rivera Plumbing")).toBe("Rivera Plumbing");
  });

  it("falls back to the pending label when the slug has no usable pieces", () => {
    expect(businessNameFromPaymentSlug("---")).toBe(PENDING_BUSINESS_NAME);
  });
});

describe("buildPaymentStubLeadFields", () => {
  it("returns a paid generic stub with no invented trading identity", () => {
    const stub = buildPaymentStubLeadFields("new-bakery");
    expect(stub).toMatchObject({
      slug: "new-bakery",
      businessName: "New Bakery",
      category: "generic",
      stage: "paid",
      recommendedTier: "growth",
      dataSource: "payment_stub",
      services: [],
    });
    // Every one of these used to carry a fabricated value about a real,
    // paying customer. Absent is the honest answer and renders as nothing.
    expect(stub.city).toBe("");
    expect(stub.state).toBe("");
    expect(stub.tagline).toBe("");
    expect(stub.phone).toBe("");
    expect(stub.hours.weekday).toBe("");
    expect(stub.hours.weekend).toBe("");
  });

  it("names the record after the buyer when checkout collected a business name", () => {
    const slug = mintOrganicCheckoutLeadSlug(() => "8f3a2b1c9d4e");
    const stub = buildPaymentStubLeadFields(slug, "Rivera Plumbing");
    expect(stub.businessName).toBe("Rivera Plumbing");
  });

  it("describes the record as pending rather than describing a business", () => {
    const stub = buildPaymentStubLeadFields(
      mintOrganicCheckoutLeadSlug(() => "8f3a2b1c9d4e"),
    );
    expect(stub.description).toContain("before any business details were collected");
    expect(stub.description).not.toContain("8f3a2b1c9d4e");
  });
});
