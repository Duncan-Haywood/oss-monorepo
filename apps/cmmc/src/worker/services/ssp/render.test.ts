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

  it("escapes a backslash before a pipe, so the pipe stays escaped in the POA&M table", () => {
    const poam = [{ ...base.poam[0], weakness: "ends in \\| cell" }] as SspInput["poam"];
    const md = renderSsp({ ...base, poam });
    expect(md).toContain("| ends in \\\\\\| cell |");
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
