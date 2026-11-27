import { describe, expect, it } from "vitest";
import {
  type CompanyDocumentInput,
  documentLine,
  documentName,
  documentStatus,
  documentsNeedingRenewal,
  payAppDocumentWarnings,
  prequalificationSummary,
} from "./company-documents";

const doc = (over: Partial<CompanyDocumentInput>): CompanyDocumentInput => ({
  id: "d1",
  kind: "contractor_license",
  label: null,
  issuer: null,
  jurisdiction: null,
  classification: null,
  number: null,
  effectiveOn: null,
  expiresOn: null,
  archived: false,
  ...over,
});

describe("documentStatus", () => {
  it("has no status from a missing date, and counts the expiry day as expired", () => {
    expect(documentStatus(null, "2027-01-10")).toEqual({ status: "no_expiry", daysLeft: null });
    expect(documentStatus("2027-01-10", "2027-01-10")).toEqual({ status: "expired", daysLeft: 0 });
    expect(documentStatus("2027-02-09", "2027-01-10")).toEqual({
      status: "expiring",
      daysLeft: 30,
    });
    expect(documentStatus("2027-02-10", "2027-01-10")).toEqual({
      status: "current",
      daysLeft: 31,
    });
  });
});

describe("documentName", () => {
  it("adds the label and the jurisdiction", () => {
    expect(documentName(doc({ jurisdiction: "CA" }))).toBe("Contractor's license (CA)");
    expect(documentName(doc({ label: "Electrical", jurisdiction: "NV" }))).toBe(
      "Contractor's license: Electrical (NV)",
    );
    expect(documentName(doc({ kind: "other", label: "Union letter" }))).toBe("Union letter");
    expect(documentName(doc({ kind: "w9" }))).toBe("W-9");
  });
});

describe("payAppDocumentWarnings", () => {
  const docs = [
    doc({ id: "a", jurisdiction: "CA", expiresOn: "2027-03-01" }),
    doc({ id: "b", kind: "emr_letter", expiresOn: "2027-03-20" }),
    doc({ id: "c", kind: "business_license", expiresOn: "2027-05-01" }),
    doc({ id: "d", kind: "w9" }),
    doc({ id: "e", kind: "bonding_letter", expiresOn: "2027-01-01", archived: true }),
  ];
  it("warns about lapsed then expiring documents, skipping undated, far and archived ones", () => {
    const w = payAppDocumentWarnings(docs, "2027-03-01");
    expect(w.map((x) => [x.id, x.kind, x.days])).toEqual([
      ["a", "lapsed", 0],
      ["b", "expiring", 19],
    ]);
    expect(w[0]?.message).toContain("Contractor's license (CA) expired 2027-03-01");
    expect(w[1]?.message).toContain("19 days after");
  });
  it("lists the ones to renew today, soonest first", () => {
    expect(documentsNeedingRenewal(docs, "2027-02-25").map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("prequalificationSummary", () => {
  it("lists active documents licenses first, as typed, with an expired one marked", () => {
    const text = prequalificationSummary(
      [
        doc({ id: "w", kind: "w9", effectiveOn: "2027-01-05" }),
        doc({ id: "e", kind: "emr_letter", number: "0.82", issuer: "Acme Mutual" }),
        doc({
          id: "l",
          jurisdiction: "CA",
          classification: "C-10 Electrical",
          number: "1234567",
          issuer: "CSLB",
          expiresOn: "2027-06-30",
        }),
        doc({ id: "b", kind: "bonding_letter", number: "$2M / $5M", issuer: "Surety Co" }),
        doc({ id: "x", kind: "business_license", jurisdiction: "Reno", expiresOn: "2027-01-01" }),
        doc({ id: "z", kind: "osha_300a", archived: true }),
      ],
      "Sparks Electric",
      "2027-02-01",
    );
    expect(text).toBe(
      [
        "Sparks Electric: licenses and compliance documents (as of 2027-02-01)",
        "- Contractor's license (CA): C-10 Electrical, No. 1234567, CSLB, expires 2027-06-30",
        "- Business license (Reno): EXPIRED 2027-01-01",
        "- W-9: dated 2027-01-05",
        "- Bonding letter: capacity $2M / $5M, Surety Co",
        "- EMR letter: EMR 0.82, Acme Mutual",
      ].join("\n"),
    );
  });
  it("says when nothing is recorded, and a W-9 with no date is on file", () => {
    expect(prequalificationSummary([], "", "2027-02-01")).toBe(
      "Our company: licenses and compliance documents (as of 2027-02-01)\n(none recorded)",
    );
    expect(documentLine(doc({ kind: "w9" }), "2027-02-01")).toBe("W-9: on file");
  });
  it("never prints a number for a kind that keeps none", () => {
    expect(documentLine(doc({ kind: "w9", number: "123-45-6789" }), "2027-02-01")).toBe(
      "W-9: on file",
    );
  });
});
