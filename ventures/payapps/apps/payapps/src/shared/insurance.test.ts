import { describe, expect, it } from "vitest";
import {
  type CertificateInput,
  certificateName,
  certificateStatus,
  certificatesNeedingRenewal,
  daysBetween,
  holdersByGc,
  INSURANCE_EXPIRING_DAYS,
  jobCertificates,
  joinNames,
  payAppInsuranceWarnings,
} from "./insurance";

const cert = (over: Partial<CertificateInput> = {}): CertificateInput => ({
  id: "ins_1",
  kind: "general_liability",
  label: null,
  carrier: null,
  policyNumber: null,
  expiresOn: "2027-01-01",
  archived: false,
  ...over,
});

describe("daysBetween", () => {
  it("counts whole calendar days across month, year and leap-day boundaries", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2027-03-10", "2027-03-01")).toBe(-9);
    // DST changes do not shift the count (UTC days).
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });
});

describe("certificateStatus", () => {
  it("is expired on and after the expiry day, expiring within 30 days, else current", () => {
    expect(certificateStatus("2027-01-01", "2027-01-01")).toEqual({
      status: "expired",
      daysLeft: 0,
    });
    expect(certificateStatus("2027-01-01", "2027-01-05").status).toBe("expired");
    expect(certificateStatus("2027-01-01", "2026-12-31")).toEqual({
      status: "expiring",
      daysLeft: 1,
    });
    expect(certificateStatus("2027-01-31", "2027-01-01")).toEqual({
      status: "expiring",
      daysLeft: INSURANCE_EXPIRING_DAYS,
    });
    expect(certificateStatus("2027-02-01", "2027-01-01").status).toBe("current");
  });
});

describe("certificateName", () => {
  it("uses the kind, then the label or carrier", () => {
    expect(certificateName(cert())).toBe("General liability");
    expect(certificateName(cert({ carrier: "Acme Mutual" }))).toBe(
      "General liability (Acme Mutual)",
    );
    expect(certificateName(cert({ label: "Project policy", carrier: "Acme" }))).toBe(
      "General liability: Project policy",
    );
    expect(certificateName(cert({ kind: "other", label: "Inland marine" }))).toBe("Inland marine");
    expect(certificateName(cert({ kind: "other" }))).toBe("Other");
  });
});

describe("payAppInsuranceWarnings", () => {
  const certs = [
    cert({ id: "gl", expiresOn: "2027-02-15" }),
    cert({ id: "auto", kind: "auto", expiresOn: "2027-01-31" }),
    cert({ id: "wc", kind: "workers_comp", expiresOn: "2027-06-30" }),
    cert({ id: "old", kind: "umbrella", expiresOn: "2026-06-30", archived: true }),
  ];

  it("warns about a lapsed certificate first, then expiring ones by date, never archived ones", () => {
    const w = payAppInsuranceWarnings(certs, "2027-01-31");
    expect(w.map((x) => [x.id, x.kind, x.days])).toEqual([
      ["auto", "lapsed", 0],
      ["gl", "expiring", 15],
    ]);
    expect(w[0]?.message).toContain("Commercial auto certificate expired 2027-01-31");
    expect(w[1]?.message).toContain("15 days after this application's date");
  });

  it("is empty when every certificate runs past the window", () => {
    expect(payAppInsuranceWarnings(certs, "2026-11-01")).toEqual([]);
  });

  it("says one day, not one days", () => {
    const [w] = payAppInsuranceWarnings([cert({ expiresOn: "2027-01-02" })], "2027-01-01");
    expect(w?.message).toContain("1 day after");
  });
});

describe("certificatesNeedingRenewal", () => {
  it("lists active expired and expiring certificates, soonest first", () => {
    const list = certificatesNeedingRenewal(
      [
        cert({ id: "a", expiresOn: "2027-01-20" }),
        cert({ id: "b", expiresOn: "2026-12-01" }),
        cert({ id: "c", expiresOn: "2027-05-01" }),
        cert({ id: "d", expiresOn: "2026-12-02", archived: true }),
      ],
      "2027-01-01",
    );
    expect(list.map((c) => [c.id, c.status, c.daysLeft])).toEqual([
      ["b", "expired", -31],
      ["a", "expiring", 19],
    ]);
  });
});

describe("certificate holders", () => {
  const h = (
    projectId: string,
    projectName: string,
    gcName: string,
    sentOn: string | null = null,
  ) => ({
    projectId,
    projectName,
    gcName,
    sentOn,
  });

  it("lists each GC once with its jobs, by name, ignoring case and spaces in the GC's name", () => {
    expect(
      holdersByGc([
        h("p1", "School", "Sierra Builders"),
        h("p2", "Annex", "sierra builders "),
        h("p3", "Clinic", "Peak GC"),
      ]),
    ).toEqual([
      { gcName: "Peak GC", jobs: ["Clinic"] },
      { gcName: "Sierra Builders", jobs: ["Annex", "School"] },
    ]);
    expect(holdersByGc([])).toEqual([]);
  });

  it("joins names in plain English", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A and B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
  });

  it("says for one job which active certificates its GC holds, held first", () => {
    const certs = [
      { ...cert({ id: "gl" }), holders: [h("p1", "School", "Sierra", "2026-06-01")] },
      { ...cert({ id: "wc", kind: "workers_comp" }), holders: [h("p2", "Annex", "Peak")] },
      { ...cert({ id: "auto", kind: "auto" }), holders: [] },
      { ...cert({ id: "old", archived: true }), holders: [h("p1", "School", "Sierra")] },
    ];
    expect(jobCertificates(certs, "p1")).toEqual([
      { id: "gl", name: "General liability", held: true, sentOn: "2026-06-01" },
      { id: "auto", name: "Commercial auto", held: false, sentOn: null },
      { id: "wc", name: "Workers' compensation", held: false, sentOn: null },
    ]);
  });

  it("says nothing when the company has recorded no holder anywhere", () => {
    expect(jobCertificates([{ ...cert(), holders: [] }], "p1")).toBeNull();
    expect(jobCertificates([], "p1")).toBeNull();
  });
});
