// The saved budget appears in DOCX and HTML exports as a line-item table plus the SF-424A category
// summary; funder copies drop $0 placeholders and notes; no budget means no budget page.
import { type BudgetLine, computeLine } from "@shared/budget";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assertWellFormed } from "../../../../test/xml-well-formed";
import { buildApplicationDocx } from "./docx";
import { buildApplicationHtml } from "./html";
import type { ExportInput } from "./model";

const L = (over: Partial<BudgetLine>): BudgetLine =>
  computeLine({
    id: "bln_x0000000001",
    category: "personnel",
    description: "Program coordinator",
    quantity: 1,
    unitCostCents: 3_000_000,
    source: "fact",
    factIds: ["fct_1"],
    fundingSource: "request",
    note: "",
    ...over,
  });

const LINES: BudgetLine[] = [
  L({}),
  L({
    id: "bln_x0000000002",
    category: "equipment",
    description: "Vans <used> & refurbished",
    quantity: 2,
    unitCostCents: 2_500_000,
    fundingSource: "match",
  }),
  L({
    id: "bln_x0000000003",
    category: "contractual",
    description: "Evaluation",
    unitCostCents: 0,
  }),
];

function input(budget: ExportInput["budget"]): ExportInput {
  return {
    generatedAt: new Date("2026-11-19T12:00:00Z"),
    org: { legalName: "Red Mesa Trades Collective", dba: null, ein: "85-1234567", uei: null },
    application: {
      id: "app_1",
      title: "Workforce Pathways",
      requestedAmountCents: 3_000_000,
      deadline: null,
    },
    opportunity: {
      title: "Workforce Pathways Grant",
      funderName: "Gallup Community Foundation",
      opportunityNumber: null,
      closeDate: null,
    },
    requirements: null,
    version: {
      id: "ver_1",
      versionNumber: 1,
      content: {
        sections: [
          {
            key: "need",
            title: "Need",
            gaps: [],
            paragraphs: [
              {
                id: "s1.p1",
                claims: [
                  { id: "s1.p1.c1", text: "We train adults.", kind: "factual", factIds: ["fct_1"] },
                ],
              },
            ],
          },
        ],
      },
      executiveSummary: "",
      keyPoints: [],
    },
    facts: [],
    budget,
  };
}

const documentXml = (bytes: Uint8Array) =>
  strFromU8(unzipSync(bytes)["word/document.xml"] as Uint8Array);
const cellTexts = (xml: string) =>
  [...xml.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((m) =>
    [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(""),
  );

describe("export — budget table", () => {
  it("adds a well-formed budget page with line items and the SF-424A summary to the DOCX", () => {
    const xml = documentXml(
      buildApplicationDocx(input({ lines: LINES, notes: "Rates from FY26 plan." })),
    );
    assertWellFormed(xml);
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
    const cells = cellTexts(xml);
    expect(cells).toEqual(
      expect.arrayContaining(["Category", "Unit cost", "Program coordinator", "$30,000"]),
    );
    expect(cells).toContain("Vans &lt;used&gt; &amp; refurbished");
    expect(cells).toContain("Evaluation (needs your input)");
    expect(cells).toEqual(expect.arrayContaining(["k. Totals", "$80,000", "$50,000"]));
    expect(xml).toContain("Match (cost share): ");
    expect(xml).toContain("Rates from FY26 plan.");
    // Budget comes after the sections.
    expect(xml.indexOf(">Budget<")).toBeGreaterThan(xml.indexOf(">Need<"));
  });

  it("renders the same tables in HTML, escaped", () => {
    const html = buildApplicationHtml(input({ lines: LINES, notes: "" }));
    expect(html).toContain('<section class="page budget-section" id="budget"><h1>Budget</h1>');
    expect(html.match(/<table class="budget">/g)).toHaveLength(2);
    expect(html).toContain("Vans &lt;used&gt; &amp; refurbished");
    expect(html).toContain('<td class="num">$50,000</td>');
    expect(html).toContain("(needs your input)");
    expect(html).toContain("62.5% of total");
  });

  it("funder copies drop placeholders and notes; no saved lines means no budget page", () => {
    const funder = buildApplicationHtml(input({ lines: LINES, notes: "Staff-only note XYZ" }), {
      audience: "funder",
    });
    expect(funder).toContain("Program coordinator");
    expect(funder).not.toContain("Evaluation");
    expect(funder).not.toContain("Staff-only note XYZ");
    expect(buildApplicationHtml(input(null))).not.toContain("budget-section");
    expect(documentXml(buildApplicationDocx(input({ lines: [], notes: "" })))).not.toContain(
      "<w:tbl>",
    );
  });
});
