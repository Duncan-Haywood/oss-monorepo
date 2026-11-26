import { describe, expect, it } from "vitest";
import {
  applicantCompatibility,
  classifyApplicantType,
  type DedupeOpportunity,
  findNearDuplicates,
  geographyCompatibility,
  type PrefilterOpportunity,
  type PrefilterProfile,
  prefilter,
  requiresSamRegistration,
} from "./prefilter";

const NOW = new Date("2026-11-19T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const swif: PrefilterProfile = {
  orgType: "nonprofit_501c3",
  state: "NM",
  serviceAreas: ["Gallup, NM", "McKinley County, NM", "Navajo Nation"],
};

const opp = (o: Partial<PrefilterOpportunity> = {}): PrefilterOpportunity => ({
  status: "posted",
  closeDate: days(30),
  applicantTypes: [],
  awardCeilingCents: 5_000_000,
  geographicScope: null,
  ...o,
});

describe("prefilter", () => {
  it("keeps an open, well-funded, compatible opportunity", () => {
    const r = prefilter(
      opp({
        applicantTypes: [
          "Nonprofits having a 501(c)(3) status with the IRS, other than institutions of higher education",
        ],
        geographicScope: "New Mexico",
      }),
      swif,
      NOW,
    );
    expect(r.pass).toBe(true);
    expect(r.eligibility).toBe("likely_eligible");
    expect(r.rejections).toEqual([]);
  });

  it("keeps unknowns (no deadline, no ceiling, no applicant types, no scope)", () => {
    const r = prefilter(
      opp({ closeDate: null, awardCeilingCents: null, applicantTypes: [], geographicScope: null }),
      swif,
      NOW,
    );
    expect(r.pass).toBe(true);
    expect(r.eligibility).toBe("unknown");
  });

  it("drops closed / archived opportunities but keeps forecasted", () => {
    expect(prefilter(opp({ status: "closed" }), swif, NOW).pass).toBe(false);
    expect(prefilter(opp({ status: "archived" }), swif, NOW).pass).toBe(false);
    expect(prefilter(opp({ status: "forecasted" }), swif, NOW).pass).toBe(true);
  });

  it("drops deadlines less than 7 days out", () => {
    expect(prefilter(opp({ closeDate: days(-1) }), swif, NOW).pass).toBe(false);
    expect(prefilter(opp({ closeDate: days(6) }), swif, NOW).pass).toBe(false);
    expect(prefilter(opp({ closeDate: days(7) }), swif, NOW).pass).toBe(true);
  });

  it("drops award ceilings under $2,500", () => {
    expect(prefilter(opp({ awardCeilingCents: 249_999 }), swif, NOW).pass).toBe(false);
    expect(prefilter(opp({ awardCeilingCents: 250_000 }), swif, NOW).pass).toBe(true);
  });

  it("drops opportunities limited to other applicant types", () => {
    const r = prefilter(
      opp({ applicantTypes: ["State governments", "Small businesses", "Individuals"] }),
      swif,
      NOW,
    );
    expect(r.pass).toBe(false);
    expect(r.eligibility).toBe("ineligible");
  });

  it("drops opportunities scoped to another state", () => {
    expect(prefilter(opp({ geographicScope: "Ohio and Kentucky" }), swif, NOW).pass).toBe(false);
    expect(prefilter(opp({ geographicScope: "AZ, UT" }), swif, NOW).pass).toBe(false);
  });

  it("collects every rejection reason", () => {
    const r = prefilter(
      opp({ status: "closed", closeDate: days(2), awardCeilingCents: 1_000 }),
      swif,
      NOW,
    );
    expect(r.rejections.length).toBe(3);
  });
});

describe("applicant types", () => {
  it("classifies grants.gov and Simpler Grants labels", () => {
    expect(
      classifyApplicantType(
        "Nonprofits that do not have a 501(c)(3) status with the IRS, other than institutions of higher education",
      ),
    ).toBe("nonprofit_non501c3");
    expect(classifyApplicantType("nonprofits_non_higher_education_with_501c3")).toBe(
      "nonprofit_501c3",
    );
    expect(classifyApplicantType("Native American tribal governments (Federally recognized)")).toBe(
      "tribal_government",
    );
    expect(
      classifyApplicantType(
        "Native American tribal organizations (other than Federally recognized tribal governments)",
      ),
    ).toBe("tribal_organization");
    expect(
      classifyApplicantType("Unrestricted (i.e., open to any type of entity above), subject to..."),
    ).toBe("open");
    expect(classifyApplicantType("County governments")).toBe("government");
    expect(classifyApplicantType("Others (see text field entitled ...)")).toBeNull();
  });

  it("treats unrestricted as likely eligible and unrecognized labels as unknown", () => {
    expect(applicantCompatibility(["Unrestricted"], "nonprofit_501c3").eligibility).toBe(
      "likely_eligible",
    );
    expect(
      applicantCompatibility(["State governments", "Others (see text)"], "nonprofit_501c3")
        .eligibility,
    ).toBe("unknown");
    expect(
      applicantCompatibility(["Native American tribal organizations"], "tribal_organization")
        .eligibility,
    ).toBe("likely_eligible");
    expect(applicantCompatibility(["Small businesses"], "other").eligibility).toBe("unknown");
  });
});

describe("geography", () => {
  it("accepts national, own-state and service-area scopes", () => {
    expect(geographyCompatibility("National", swif).compatible).toBe(true);
    expect(geographyCompatibility("United States", swif).compatible).toBe(true);
    expect(geographyCompatibility("Arizona, New Mexico, Utah", swif).compatible).toBe(true);
    expect(geographyCompatibility("Navajo Nation (AZ, UT)", swif).compatible).toBe(true);
    expect(geographyCompatibility("McKinley County", swif).compatible).toBe(true);
  });

  it("keeps free text it cannot interpret", () => {
    expect(geographyCompatibility("Rural communities in the Southwest", swif).compatible).toBe(
      true,
    );
  });

  it("does not treat ambiguous two-letter words as states", () => {
    expect(geographyCompatibility("Rural OR tribal communities", swif).compatible).toBe(true);
  });
});

describe("SAM.gov / UEI requirement", () => {
  const sam =
    "Applicants must have an active SAM.gov registration and a Unique Entity Identifier (UEI).";
  const nonprofit = [
    "Nonprofits having a 501(c)(3) status with the IRS, other than institutions of higher education",
  ];

  it("detects a required registration, not a waived one", () => {
    expect(requiresSamRegistration(sam)).toBe(true);
    expect(requiresSamRegistration("Applicants without a UEI will not be considered.")).toBe(true);
    expect(requiresSamRegistration("SAM registration is not required for this mini-grant.")).toBe(
      false,
    );
    expect(requiresSamRegistration("Contact Sam Ortiz with questions.")).toBe(false);
    expect(requiresSamRegistration("")).toBe(false);
    expect(requiresSamRegistration(undefined)).toBe(false);
  });

  it("caps eligibility at unknown when the org has no UEI on file", () => {
    const o = opp({ applicantTypes: nonprofit, eligibilityText: sam });
    const none = prefilter(o, swif, NOW);
    expect(none.pass).toBe(true);
    expect(none.eligibility).toBe("unknown");
    expect(none.notes).toContain("requires SAM.gov registration (UEI); no UEI on file");
    expect(prefilter(o, { ...swif, uei: "  " }, NOW).eligibility).toBe("unknown");
    expect(prefilter(o, { ...swif, uei: "EXMPL1234567" }, NOW).eligibility).toBe("likely_eligible");
    // No eligibility text given: unchanged behavior.
    expect(prefilter(opp({ applicantTypes: nonprofit }), swif, NOW).eligibility).toBe(
      "likely_eligible",
    );
  });
});

describe("findNearDuplicates", () => {
  const base: DedupeOpportunity = {
    id: "opp_gg",
    source: "grants_gov",
    funderName: "Employment and Training Administration",
    title: "Tribal and Rural Construction Pathways Grants",
    opportunityNumber: "DOL-ETA-27-014",
    closeDate: days(40),
    description: "Full federal synopsis text.",
  };

  it("collapses a watchlist copy onto the official listing (same funder, deadline, title)", () => {
    const copy: DedupeOpportunity = {
      ...base,
      id: "opp_watch",
      source: "manual",
      title: "FY 2027 Tribal & Rural Construction Pathways Grant Program",
      opportunityNumber: null,
      description: "Short re-post.",
    };
    expect([...findNearDuplicates([copy, base])]).toEqual([["opp_watch", "opp_gg"]]);
  });

  it("matches on a normalized opportunity number across sources", () => {
    const simpler = { ...base, id: "opp_sg", source: "simpler_grants" as const, title: "Other" };
    expect(findNearDuplicates([base, { ...simpler, opportunityNumber: "dol eta 27 014" }])).toEqual(
      new Map([["opp_sg", "opp_gg"]]),
    );
  });

  it("keeps distinct programs of the same funder", () => {
    const other: DedupeOpportunity = {
      ...base,
      id: "opp_other",
      title: "Youth Apprenticeship Readiness Grants",
      opportunityNumber: "DOL-ETA-27-020",
    };
    const nextRound = { ...base, id: "opp_next", opportunityNumber: null, closeDate: days(400) };
    expect(findNearDuplicates([base, other, nextRound]).size).toBe(0);
  });
});
