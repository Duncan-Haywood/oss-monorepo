import { describe, expect, it } from "vitest";
import { buildManualGuide, selectChannel } from "./channel";
import {
  buildSubmissionPackage,
  countWords,
  type PackageInput,
  renderPackageMarkdown,
  serializePackage,
} from "./package";

function samplePackageInput(over: Partial<PackageInput> = {}): PackageInput {
  return {
    submissionId: "sub_test",
    generatedAt: new Date("2026-11-19T12:00:00Z"),
    application: {
      id: "app_1",
      title: "Trades Academy Expansion",
      requestedAmountCents: 2_500_000,
      deadline: null,
      reviewTier: "one_click",
    },
    version: {
      id: "ver_1",
      versionNumber: 2,
      executiveSummary: "SWIF trains Navajo youth in construction trades.",
      keyPoints: ["Trades training"],
      groundingReport: {
        totalClaims: 3,
        factualClaims: 2,
        supported: 2,
        partiallySupported: 0,
        unsupported: 0,
        numericMismatches: 0,
        unconfirmedFactCitations: 0,
        gaps: 0,
        passed: true,
        verdicts: [],
        checkedAt: 1,
        model: "claude-opus-5-5",
      },
      content: {
        sections: [
          {
            key: "need",
            title: "Statement of Need",
            gaps: [],
            paragraphs: [
              {
                id: "p1",
                claims: [
                  { id: "c1", kind: "framing", text: "We welcome this opportunity.", factIds: [] },
                  {
                    id: "c2",
                    kind: "factual",
                    text: "The program trained 42 students in 2025.",
                    factIds: ["fct_a"],
                  },
                ],
              },
              {
                id: "p2",
                claims: [
                  {
                    id: "c3",
                    kind: "factual",
                    text: "SWIF is based in Gallup.",
                    factIds: ["fct_b"],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    opportunity: {
      id: "opp_1",
      title: "Workforce Pathways",
      funderName: "Example Foundation",
      opportunityNumber: "WP-2027",
      closeDate: new Date("2026-12-31T00:00:00Z"),
      sourceUrl: "https://example.org/wp",
      submissionMethod: "email",
      submissionEmail: "grants@example.org",
      submissionUrl: null,
      requirements: {
        sections: [
          {
            key: "need",
            title: "Need",
            prompt: "Describe the need.",
            kind: "narrative",
            required: true,
            wordLimit: 5,
            charLimit: null,
            guidance: "",
          },
          {
            key: "budget_file",
            title: "Budget spreadsheet",
            prompt: "Upload a budget.",
            kind: "attachment",
            required: true,
            wordLimit: null,
            charLimit: null,
            guidance: "",
          },
        ],
        attachments: [{ name: "IRS determination letter", required: true, description: "" }],
        eligibilityCriteria: [],
        submissionInstructions: "Email a single document.",
        complete: true,
      },
    },
    profile: {
      legalName: "Southwest Indian Foundation",
      dba: null,
      orgType: "nonprofit_501c3",
      ein: "85-0000000",
      uei: "ABC123DEF456",
      websiteUrl: null,
      addressLine1: "100 Main St",
      addressLine2: null,
      city: "Gallup",
      state: "NM",
      postalCode: "87301",
      country: "US",
      contactName: "Pat Doe",
      contactEmail: "pat@swif.example",
      contactPhone: null,
    },
    approval: { submittedByType: "user", submittedBy: "usr_1", approvedBy: "usr_1" },
    ...over,
  };
}

describe("buildSubmissionPackage", () => {
  it("renders plain text per section with word counts, limits and citations", () => {
    const pkg = buildSubmissionPackage(samplePackageInput());
    expect(pkg.sections).toHaveLength(1);
    const s = pkg.sections[0];
    expect(s?.text).toBe(
      "We welcome this opportunity. The program trained 42 students in 2025.\n\nSWIF is based in Gallup.",
    );
    expect(s?.wordCount).toBe(16);
    expect(s?.wordLimit).toBe(5);
    expect(s?.overLimit).toBe(true);
    expect(s?.prompt).toBe("Describe the need.");
    expect(pkg.citations.map((c) => [c.claimId, c.factIds])).toEqual([
      ["c2", ["fct_a"]],
      ["c3", ["fct_b"]],
    ]);
    expect(pkg.attachmentsChecklist.map((a) => a.name)).toEqual([
      "IRS determination letter",
      "Budget spreadsheet",
    ]);
    expect(pkg.grounding?.passed).toBe(true);
    expect(pkg.grounding).not.toHaveProperty("verdicts");
    expect(pkg.applicant.uei).toBe("ABC123DEF456");
    expect(pkg.opportunity.submissionInstructions).toBe("Email a single document.");
    expect(pkg.application.deadline).toBe("2026-12-31T00:00:00.000Z");
  });

  it("serializes deterministically", () => {
    const a = serializePackage(buildSubmissionPackage(samplePackageInput()));
    const b = serializePackage(buildSubmissionPackage(samplePackageInput()));
    expect(a).toBe(b);
  });

  it("markdown includes sections, checklist, appendix and hash", () => {
    const pkg = buildSubmissionPackage(samplePackageInput());
    const md = renderPackageMarkdown(pkg, { sha256: "abc123" });
    expect(md).toContain("# Trades Academy Expansion");
    expect(md).toContain("## Statement of Need");
    expect(md).toContain("16 words (limit 5 words) — OVER LIMIT");
    expect(md).toContain("- [ ] IRS determination letter (required)");
    expect(md).toContain("**c2** The program trained 42 students in 2025. → fct_a");
    expect(md).toContain("SHA-256 of package.json: `abc123`");
    expect(md).toContain("EIN: 85-0000000");
  });

  it("countWords handles empty text", () => {
    expect(countWords("   ")).toBe(0);
    expect(countWords("one  two\nthree")).toBe(3);
  });
});

describe("selectChannel", () => {
  const opp = {
    submissionMethod: "email" as const,
    submissionEmail: "g@f.org",
    submissionUrl: null,
    source: "grants_gov",
    privateToOrgId: null,
    submissionEmailVerified: false,
  };
  it("never emails an unconfirmed address from an imported (org-private) opportunity", () => {
    const imported = { ...opp, source: "url_import", privateToOrgId: "org_1" };
    const c = selectChannel(imported, { emailAllowed: true });
    expect(c).toMatchObject({ channel: "manual", method: "email", recipient: "g@f.org" });
    expect(c.fallbackReason).toMatch(/not been confirmed/);
    // Missing provenance fails closed.
    expect(
      selectChannel(
        { submissionMethod: "email", submissionEmail: "g@f.org", submissionUrl: null },
        { emailAllowed: true },
      ).channel,
    ).toBe("manual");
    expect(
      selectChannel({ ...imported, submissionEmailVerified: true }, { emailAllowed: true }).channel,
    ).toBe("email");
  });
  it("uses email when the funder accepts email and the gate allows it", () => {
    expect(selectChannel(opp, { emailAllowed: true }).channel).toBe("email");
  });
  it("falls back to manual when the gate blocks email", () => {
    const c = selectChannel(opp, { emailAllowed: false, reason: "no contact" });
    expect(c).toMatchObject({ channel: "manual", method: "email", fallbackReason: "no contact" });
  });
  it("is manual for grants_gov / portal / mail / unknown", () => {
    for (const m of ["grants_gov", "portal", "mail", "unknown"] as const) {
      const c = selectChannel(
        { submissionMethod: m, submissionEmail: null, submissionUrl: "https://x.test" },
        { emailAllowed: true },
      );
      expect(c.channel).toBe("manual");
      expect(c.method).toBe(m);
    }
  });
  it("grants.gov guide explains Workspace submission and why S2S is unsupported", () => {
    const pkg = buildSubmissionPackage(samplePackageInput());
    const g = buildManualGuide(pkg, {
      channel: "manual",
      method: "grants_gov",
      recipient: null,
    });
    expect(g.title).toContain("Grants.gov Workspace");
    expect(g.steps.join(" ")).toContain("AOR");
    expect(g.notes.join(" ")).toContain("SAM.gov");
    expect(g.url).toContain("WP-2027");
  });
});
