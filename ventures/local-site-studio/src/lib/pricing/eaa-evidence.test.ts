import { describe, expect, it } from "vitest";
import {
  assertsNoComplianceWarranty,
  buildEaaInquiryMailto,
  EAA_EVIDENCE_ACCURACY,
  EAA_EVIDENCE_DOCS_PATH,
  EAA_EVIDENCE_JOB,
  EAA_EVIDENCE_PATH,
  EAA_EVIDENCE_RETEST,
  eaaJobPriceRangeLabel,
  eaaPrecisionLabel,
  eaaRecallLabel,
  eaaRetestPriceRangeLabel,
  qualifyEaaBuyer,
} from "./eaa-evidence";

describe("EAA_EVIDENCE catalog", () => {
  it("keeps the scored candidate's EUR ranges and does not invent Stripe Price IDs", () => {
    expect(EAA_EVIDENCE_JOB).toMatchObject({
      minPriceEur: 900,
      maxPriceEur: 1800,
      currency: "EUR",
      checkoutLive: false,
    });
    expect(EAA_EVIDENCE_RETEST).toMatchObject({
      minPriceEur: 49,
      maxPriceEur: 99,
      currency: "EUR",
      interval: "month",
      checkoutLive: false,
    });
    expect(EAA_EVIDENCE_JOB).not.toHaveProperty("setupPriceIdEnv");
    expect(EAA_EVIDENCE_RETEST).not.toHaveProperty("monthlyPriceIdEnv");
  });

  it("pins the probe's disclosed error rates so they cannot be quietly raised", () => {
    expect(EAA_EVIDENCE_ACCURACY.precisionMin).toBe(0.821);
    expect(EAA_EVIDENCE_ACCURACY.precisionMax).toBe(0.881);
    expect(EAA_EVIDENCE_ACCURACY.recall).toBe(0.976);
    expect(EAA_EVIDENCE_ACCURACY.corpusPages).toBe(118);
    expect(EAA_EVIDENCE_ACCURACY.measuredDate).toBe("2026-08-22");
    expect(EAA_EVIDENCE_ACCURACY.measuredOn).toMatch(/not a customer's shop/i);
    expect(EAA_EVIDENCE_ACCURACY.operatorConflict).toMatch(/over-reporting is the error that would pay us/);
    expect(eaaPrecisionLabel()).toBe("0.821–0.881");
    expect(eaaRecallLabel()).toBe("0.976");
  });

  it("exposes stable public paths the sitemap and docs index share", () => {
    expect(EAA_EVIDENCE_PATH).toBe("/accessibility-evidence");
    expect(EAA_EVIDENCE_DOCS_PATH).toBe("/docs/eaa-evidence");
    expect(eaaJobPriceRangeLabel()).toBe("€900–€1800");
    expect(eaaRetestPriceRangeLabel()).toBe("€49–€99/mo");
  });

  it("refuses warranty language in every catalog string a customer can read", () => {
    const customerFacing = [
      EAA_EVIDENCE_JOB.name,
      EAA_EVIDENCE_JOB.tagline,
      EAA_EVIDENCE_RETEST.name,
      EAA_EVIDENCE_ACCURACY.operatorConflict,
      eaaJobPriceRangeLabel(),
    ].join("\n");
    expect(assertsNoComplianceWarranty(customerFacing)).toBe(true);
    expect(assertsNoComplianceWarranty("This makes you EAA compliant")).toBe(false);
    expect(assertsNoComplianceWarranty("You are now compliant")).toBe(false);
  });
});

describe("qualifyEaaBuyer", () => {
  it("treats ≥10 employees as obligated even with unknown turnover", () => {
    expect(qualifyEaaBuyer({ employees: 10, turnoverEur: null })).toBe("obligated");
    expect(qualifyEaaBuyer({ employees: 25, turnoverEur: 500_000 })).toBe("obligated");
  });

  it("treats >€2M turnover as obligated even with unknown or small headcount", () => {
    expect(qualifyEaaBuyer({ employees: null, turnoverEur: 2_000_001 })).toBe("obligated");
    expect(qualifyEaaBuyer({ employees: 3, turnoverEur: 3_000_000 })).toBe("obligated");
  });

  it("requires both small headcount and small turnover before calling a shop exempt", () => {
    expect(qualifyEaaBuyer({ employees: 4, turnoverEur: 1_500_000 })).toBe(
      "exempt-microenterprise",
    );
    expect(qualifyEaaBuyer({ employees: 9, turnoverEur: 2_000_000 })).toBe(
      "exempt-microenterprise",
    );
  });

  it("does not guess when either half of the exemption test is missing", () => {
    expect(qualifyEaaBuyer({ employees: 4, turnoverEur: null })).toBe("unknown");
    expect(qualifyEaaBuyer({ employees: null, turnoverEur: 800_000 })).toBe("unknown");
    expect(qualifyEaaBuyer({ employees: null, turnoverEur: null })).toBe("unknown");
  });

  it("rejects negative or non-finite inputs rather than treating them as known", () => {
    expect(() => qualifyEaaBuyer({ employees: -1, turnoverEur: null })).toThrow(
      /non-negative finite/,
    );
    expect(() => qualifyEaaBuyer({ employees: null, turnoverEur: -1 })).toThrow(
      /non-negative finite/,
    );
    expect(() => qualifyEaaBuyer({ employees: Number.POSITIVE_INFINITY, turnoverEur: null })).toThrow(
      /non-negative finite/,
    );
    expect(() => qualifyEaaBuyer({ employees: null, turnoverEur: Number.NaN })).toThrow(
      /non-negative finite/,
    );
  });
});

describe("buildEaaInquiryMailto", () => {
  const draft = {
    shopUrl: "https://example-shop.de",
    employees: 14,
    turnoverEur: 2_500_000,
    contactEmail: "owner@example-shop.de",
    notes: "Warning letter dated 2026-08-01",
  };

  it("builds a mailto only for an obligated buyer with a usable contact", () => {
    const result = buildEaaInquiryMailto("support@example.com", draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.obligation).toBe("obligated");
    expect(result.href.startsWith("mailto:support@example.com?")).toBe(true);
    const decoded = decodeURIComponent(result.href);
    expect(decoded).toContain("https://example-shop.de");
    expect(decoded).toContain("owner@example-shop.de");
    expect(decoded).toMatch(/record, not a compliance certificate/);
    expect(decoded).toMatch(/Checkout: not live/);
    expect(assertsNoComplianceWarranty(decoded)).toBe(true);
  });

  it("renders a missing size field as (unknown), not the literal null", () => {
    const employeesOnly = buildEaaInquiryMailto("support@example.com", {
      ...draft,
      turnoverEur: null,
    });
    expect(employeesOnly.ok).toBe(true);
    if (!employeesOnly.ok) return;
    const employeesDecoded = decodeURIComponent(employeesOnly.href);
    expect(employeesDecoded).toContain("Employees: 14");
    expect(employeesDecoded).toContain("Turnover EUR: (unknown)");
    expect(employeesDecoded).not.toMatch(/Turnover EUR: null/);

    const turnoverOnly = buildEaaInquiryMailto("support@example.com", {
      ...draft,
      employees: null,
    });
    expect(turnoverOnly.ok).toBe(true);
    if (!turnoverOnly.ok) return;
    const turnoverDecoded = decodeURIComponent(turnoverOnly.href);
    expect(turnoverDecoded).toContain("Employees: (unknown)");
    expect(turnoverDecoded).toContain("Turnover EUR: 2500000");
    expect(turnoverDecoded).not.toMatch(/Employees: null/);
  });

  it("refuses to produce a sendable message for an exempt microenterprise", () => {
    const result = buildEaaInquiryMailto("support@example.com", {
      ...draft,
      employees: 3,
      turnoverEur: 400_000,
    });
    expect(result).toEqual({
      ok: false,
      reason: "exempt-microenterprise",
      obligation: "exempt-microenterprise",
    });
  });

  it("refuses when obligation is unknown, rather than assuming the buyer is in scope", () => {
    const result = buildEaaInquiryMailto("support@example.com", {
      ...draft,
      employees: 3,
      turnoverEur: null,
    });
    expect(result).toEqual({
      ok: false,
      reason: "unknown",
      obligation: "unknown",
    });
  });

  it("refuses a missing or unusable contact even when the shop is obligated", () => {
    expect(
      buildEaaInquiryMailto("support@example.com", { ...draft, contactEmail: "" }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      buildEaaInquiryMailto("support@example.com", { ...draft, shopUrl: "   " }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      buildEaaInquiryMailto("support@example.com", {
        ...draft,
        contactEmail: "not-an-email",
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });
  });
});
