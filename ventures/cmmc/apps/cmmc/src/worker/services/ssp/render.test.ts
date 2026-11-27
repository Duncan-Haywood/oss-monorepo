import { describe, expect, it } from "vitest";
import { renderSsp, type SspInput } from "./render";

const base: SspInput = {
  orgName: "Acme Machining",
  level: 2,
  generatedAt: new Date("2026-11-24T00:00:00Z"),
  profile: {
    legalName: "Acme Machining LLC",
    cageCode: "1ABC2",
    systemName: "Shop network",
    systemDescription: "Two CNC cells and an office LAN.",
    boundaryDescription: "## injected heading",
    environmentDescription: "",
    connectionsDescription: "",
    sspUpdateFrequency: "Annually",
    affirmingOfficial: "J. Smith, President",
  },
  records: [
    {
      controlId: "CA.L2-3.12.4",
      status: "implemented",
      partialCredit: null,
      statement: "This document.",
      draftStatement: null,
      ownerName: "J. Smith",
    },
    {
      controlId: "AC.L2-3.1.1",
      status: "partially_implemented",
      partialCredit: null,
      statement: "",
      draftStatement: "AI text",
      ownerName: null,
    },
  ],
  evidenceCount: { "CA.L2-3.12.4": 2 },
  poam: [
    {
      controlId: "AC.L2-3.1.8",
      weakness: "No lockout | yet",
      scheduledCompletion: "2027-01-01",
      status: "open",
    },
  ],
};

describe("renderSsp", () => {
  it("prints all 110 requirements, the disclaimer, and accepted statements only", () => {
    const md = renderSsp(base);
    expect(md.match(/^#### /gm)).toHaveLength(110);
    expect(md).toContain("not a CMMC certification");
    expect(md).toContain("This document.");
    expect(md).not.toContain("AI text");
    expect(md).toContain("1 requirement(s) have an AI draft awaiting review");
    expect(md).toContain("Evidence files on record: 2");
  });

  it("escapes user text that would forge headings or table cells", () => {
    const md = renderSsp(base);
    expect(md).toContain("\\## injected heading");
    expect(md).toContain("No lockout \\| yet");
  });

  it("says no score can be produced without an SSP", () => {
    const md = renderSsp({ ...base, records: [] });
    expect(md).toContain("not computable");
  });

  it("renders Level 1 with 15 requirements and no point values", () => {
    const md = renderSsp({ ...base, level: 1, records: [] });
    expect(md.match(/^#### /gm)).toHaveLength(15);
    expect(md).not.toContain("point value");
    expect(md).toContain("Requirements met: 0 of 15");
  });
});

describe("renderSsp asset inventory", () => {
  const assets: NonNullable<SspInput["assets"]> = [
    {
      name: "Office laptop",
      category: "cui",
      specializedType: null,
      assetType: "Laptop",
      location: "Front office",
      provider: "",
      notes: "",
    },
    {
      name: "Haas VF-2 | cell 1",
      category: "specialized",
      specializedType: "ot",
      assetType: "CNC controller",
      location: "Shop floor",
      provider: "",
      notes: "Isolated VLAN;\nprograms loaded by USB from the CAM PC",
    },
    {
      name: "Break-room TV",
      category: "out_of_scope",
      specializedType: null,
      assetType: "",
      location: "",
      provider: "",
      notes: "",
    },
  ];

  it("prints the inventory by category under the boundary, Level 2 only", () => {
    const md = renderSsp({ ...base, assets });
    const boundary = md.indexOf("## 2. System boundary");
    const inv = md.indexOf("### Asset inventory (32 CFR 170.19(c))");
    expect(inv).toBeGreaterThan(boundary);
    expect(inv).toBeLessThan(md.indexOf("## 3. Environment of operation"));
    expect(md).toContain('**CUI Assets (1)**: "Assets that process, store, or transmit CUI"');
    expect(md).toContain('**Specialized Assets (1)**: "Assets that can process');
    expect(md).not.toContain("Security Protection Assets (");
    // Pipes and newlines in user text cannot break the table.
    expect(md).toContain(
      "| Haas VF-2 \\| cell 1 | Operational Technology (OT): CNC controller | Shop floor |  | Isolated VLAN; programs loaded by USB from the CAM PC |",
    );
    // A missing out-of-scope reason is called out, not left blank.
    expect(md).toContain("| Break-room TV |  |  |  | _Not yet provided._ |");
    // Still one #### per requirement.
    expect(md.match(/^#### /gm)).toHaveLength(110);
    expect(renderSsp({ ...base, level: 1, assets })).not.toContain("Asset inventory");
  });

  it("says when nothing is recorded", () => {
    expect(renderSsp(base)).toContain("_No assets recorded yet (Assets tab)._");
    expect(renderSsp(base)).not.toContain("Network diagram");
  });

  it("names the linked network diagram, or quotes the rule when none is linked", () => {
    const linked = renderSsp({
      ...base,
      assets,
      networkDiagram: 'evidence file "Scope | v2" (scope.pdf, sha256 0123456789ab)',
    });
    expect(linked).toContain(
      'Network diagram of the assessment scope: evidence file "Scope \\| v2" (scope.pdf, sha256 0123456789ab).',
    );
    // Before the first category table, under the inventory heading.
    expect(linked.indexOf("Network diagram of the assessment scope")).toBeLessThan(
      linked.indexOf("**CUI Assets (1)**"),
    );
    const missing = renderSsp({ ...base, assets });
    expect(missing).toContain(
      'Network diagram of the assessment scope: _Not yet linked (Assets tab)._ Table 3 to 32 CFR 170.19(c)(1) asks, for every in-scope asset category: "Document in the network diagram of the CMMC Assessment Scope."',
    );
    expect(renderSsp({ ...base, level: 1, assets })).not.toContain("Network diagram");
  });

  describe("personnel counts (People tab)", () => {
    const personnel = {
      asOf: "2026-11-24",
      recorded: 3,
      refreshMonths: 12,
      requirements: [
        {
          controlId: "AT.L2-3.2.1",
          applies: 3,
          covered: 2,
          reading: "2 of 3 current people have up-to-date security awareness training.",
        },
        {
          controlId: "AT.L2-3.2.2",
          applies: 1,
          covered: 1,
          reading: "1 of 1 people with security duties have up-to-date role-based training.",
        },
        {
          controlId: "AT.L2-3.2.3",
          applies: 3,
          covered: 3,
          reading: "3 of 3 current people have up-to-date insider threat training.",
        },
        {
          controlId: "PS.L2-3.9.1",
          applies: 2,
          covered: 2,
          reading: "2 of 2 people with CUI access were screened before access.",
        },
        { controlId: "PS.L2-3.9.2", applies: 0, covered: 0, reading: "Nobody to count yet." },
      ],
      gaps: { "AT.L2-3.2.1": 1 },
    };
    const section = (md: string, id: string) => {
      const start = md.indexOf(`#### ${id} `);
      return md.slice(start, md.indexOf("\n#### ", start + 1));
    };

    it("prints the count, its date, the interval and the open gaps under each requirement", () => {
      const md = renderSsp({ ...base, personnel });
      expect(section(md, "AT.L2-3.2.1")).toContain(
        "- Personnel records (People tab, as of 2026-11-24): 2 of 3 current people have up-to-date security awareness training. Refresher interval: every 12 months (the organization's choice; NIST SP 800-171 Rev. 2 sets none). 1 open gap(s) listed on the People tab.",
      );
      expect(section(md, "PS.L2-3.9.1")).toContain(
        "2 of 2 people with CUI access were screened before access.",
      );
      expect(section(md, "PS.L2-3.9.1")).not.toContain("Refresher interval");
      expect(section(md, "PS.L2-3.9.2")).toContain("No departures or transfers recorded.");
      expect(md.match(/Personnel records \(People tab/g)).toHaveLength(5);
      expect(section(md, "AC.L2-3.1.1")).not.toContain("Personnel records");
    });

    it("says so when nobody is recorded, and prints nothing without the records or on Level 1", () => {
      const none = renderSsp({ ...base, personnel: { ...personnel, recorded: 0 } });
      expect(section(none, "AT.L2-3.2.1")).toContain(
        "- Personnel records (People tab, as of 2026-11-24): _No people recorded yet._",
      );
      expect(renderSsp(base)).not.toContain("Personnel records");
      expect(renderSsp({ ...base, level: 1, personnel })).not.toContain("Personnel records");
    });
  });
});
