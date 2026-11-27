import { describe, expect, it } from "vitest";
import {
  type CertificateCoverage,
  checkRequirements,
  formatLimit,
  type InsuranceRequirement,
  inForce,
  requirementGapLines,
  requirementText,
} from "./insurance-requirements";

const M = 100_000_000; // $1,000,000 in cents

const cert = (over: Partial<CertificateCoverage> = {}): CertificateCoverage => ({
  id: "ins_gl",
  kind: "general_liability",
  label: null,
  carrier: "Acme Mutual",
  effectiveOn: "2026-01-01",
  expiresOn: "2027-01-01",
  archived: false,
  eachOccurrenceCents: M,
  aggregateCents: 2 * M,
  additionalInsured: true,
  waiverOfSubrogation: true,
  primaryNoncontributory: true,
  ...over,
});

const req = (over: Partial<InsuranceRequirement> = {}): InsuranceRequirement => ({
  kind: "general_liability",
  eachOccurrenceCents: M,
  aggregateCents: 2 * M,
  additionalInsured: true,
  waiverOfSubrogation: false,
  primaryNoncontributory: false,
  umbrellaCounts: false,
  ...over,
});

describe("inForce", () => {
  it("counts from the effective date and stops on the expiry day", () => {
    const c = cert();
    expect(inForce(c, "2025-12-31")).toBe(false);
    expect(inForce(c, "2026-01-01")).toBe(true);
    expect(inForce(c, "2026-12-31")).toBe(true);
    expect(inForce(c, "2027-01-01")).toBe(false);
    expect(inForce(cert({ effectiveOn: null }), "2020-01-01")).toBe(true);
    expect(inForce(cert({ archived: true }), "2026-06-01")).toBe(false);
  });
});

describe("checkRequirements", () => {
  it("meets a requirement the certificate covers", () => {
    const [r] = checkRequirements([req()], [cert()], "2026-06-01");
    expect(r).toMatchObject({ met: true, certificateId: "ins_gl", gaps: [], usedUmbrella: false });
    expect(r?.certificateName).toBe("General liability (Acme Mutual)");
  });

  it("names a limit below the requirement with both figures", () => {
    const [r] = checkRequirements(
      [req({ eachOccurrenceCents: 2 * M, aggregateCents: 4 * M })],
      [cert()],
      "2026-06-01",
    );
    expect(r?.met).toBe(false);
    expect(r?.gaps.map((g) => g.message)).toEqual([
      "Each occurrence $1,000,000; the job asks for $2,000,000.",
      "General aggregate $2,000,000; the job asks for $4,000,000.",
    ]);
  });

  it("treats a limit not typed on the certificate as a gap, never as met", () => {
    const [r] = checkRequirements(
      [req({ aggregateCents: null })],
      [cert({ eachOccurrenceCents: null })],
      "2026-06-01",
    );
    expect(r?.gaps).toEqual([
      {
        kind: "limit_unknown",
        message:
          "Each occurrence limit is not recorded on the certificate on file; the job asks for $1,000,000.",
      },
    ]);
  });

  it("lets an umbrella make up a shortfall only when the requirement allows it", () => {
    const umbrella = cert({
      id: "ins_umb",
      kind: "umbrella",
      eachOccurrenceCents: 4 * M,
      aggregateCents: 4 * M,
      additionalInsured: false,
    });
    const asks = req({ eachOccurrenceCents: 5 * M, aggregateCents: null });
    const [no] = checkRequirements([asks], [cert(), umbrella], "2026-06-01");
    expect(no?.met).toBe(false);
    expect(no?.gaps[0]?.message).toBe("Each occurrence $1,000,000; the job asks for $5,000,000.");

    const [yes] = checkRequirements(
      [{ ...asks, umbrellaCounts: true }],
      [cert(), umbrella],
      "2026-06-01",
    );
    expect(yes).toMatchObject({ met: true, usedUmbrella: true });

    const [short] = checkRequirements(
      [{ ...asks, eachOccurrenceCents: 6 * M, umbrellaCounts: true }],
      [cert(), umbrella],
      "2026-06-01",
    );
    expect(short?.gaps[0]?.message).toBe(
      "Each occurrence $1,000,000 plus the umbrella's $4,000,000 is $5,000,000; the job asks for $6,000,000.",
    );

    // An umbrella that has expired does not count.
    const [lapsedUmb] = checkRequirements(
      [{ ...asks, umbrellaCounts: true }],
      [cert(), { ...umbrella, expiresOn: "2026-05-01" }],
      "2026-06-01",
    );
    expect(lapsedUmb?.met).toBe(false);
  });

  it("lists each endorsement the certificate does not show", () => {
    const [r] = checkRequirements(
      [req({ waiverOfSubrogation: true, primaryNoncontributory: true })],
      [cert({ additionalInsured: false, primaryNoncontributory: false })],
      "2026-06-01",
    );
    expect(r?.gaps.map((g) => g.kind)).toEqual(["endorsement", "endorsement"]);
    expect(r?.gaps.map((g) => g.message)).toEqual([
      "Additional insured is not shown on the certificate on file; the job asks for it.",
      "Primary and non-contributory is not shown on the certificate on file; the job asks for it.",
    ]);
  });

  it("says missing, lapsed or not started when no certificate of the coverage is in force", () => {
    const wc = req({
      kind: "workers_comp",
      eachOccurrenceCents: null,
      aggregateCents: null,
      additionalInsured: false,
    });
    expect(checkRequirements([wc], [cert()], "2026-06-01")[0]?.gaps).toEqual([
      {
        kind: "missing",
        message: "Workers' compensation: no certificate on file, and the job asks for it.",
      },
    ]);
    const old = cert({ id: "w1", kind: "workers_comp", expiresOn: "2026-03-01" });
    expect(checkRequirements([wc], [old], "2026-06-01")[0]?.gaps[0]).toEqual({
      kind: "lapsed",
      message:
        "Workers' compensation: the certificate on file expired 2026-03-01. Ask the broker for the renewal certificate.",
    });
    const next = cert({
      id: "w2",
      kind: "workers_comp",
      effectiveOn: "2026-07-01",
      expiresOn: "2027-07-01",
    });
    expect(checkRequirements([wc], [old, next], "2026-06-01")[0]?.gaps[0]?.kind).toBe(
      "not_started",
    );
    // Archived certificates are never offered.
    expect(
      checkRequirements([wc], [{ ...next, archived: true, effectiveOn: null }], "2026-06-01")[0]
        ?.gaps[0]?.kind,
    ).toBe("missing");
  });

  it("reports the certificate with the fewest gaps, then the latest expiry", () => {
    const thin = cert({ id: "a", eachOccurrenceCents: M / 2, expiresOn: "2027-03-01" });
    const full = cert({ id: "b", expiresOn: "2026-12-01" });
    expect(checkRequirements([req()], [thin, full], "2026-06-01")[0]?.certificateId).toBe("b");
    const full2 = cert({ id: "c", expiresOn: "2027-02-01" });
    expect(checkRequirements([req()], [full, full2], "2026-06-01")[0]?.certificateId).toBe("c");
  });
});

describe("words", () => {
  it("formats limits in whole dollars and writes the requirement out", () => {
    expect(formatLimit(M)).toBe("$1,000,000");
    expect(formatLimit(12_345)).toBe("$123.45");
    expect(requirementText(req({ umbrellaCounts: true }))).toBe(
      "General liability: each occurrence $1,000,000, general aggregate $2,000,000, additional insured (umbrella may count)",
    );
    expect(
      requirementText(
        req({
          kind: "workers_comp",
          eachOccurrenceCents: null,
          aggregateCents: null,
          additionalInsured: false,
        }),
      ),
    ).toBe("Workers' compensation");
  });

  it("prefixes each gap with its coverage once", () => {
    const checks = checkRequirements(
      [
        req({ eachOccurrenceCents: 2 * M }),
        req({
          kind: "auto",
          eachOccurrenceCents: null,
          aggregateCents: null,
          additionalInsured: false,
        }),
      ],
      [cert()],
      "2026-06-01",
    );
    expect(requirementGapLines(checks)).toEqual([
      "General liability: Each occurrence $1,000,000; the job asks for $2,000,000.",
      "Commercial auto: no certificate on file, and the job asks for it.",
    ]);
  });
});
