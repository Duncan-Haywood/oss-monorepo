import { applicationPdf } from "@worker/services/export/application-pdf";
import { continuationCsv, csvCell, summaryCsv } from "@worker/services/export/csv";
import { attentionLine, exportFileName, fmtAmount } from "@worker/services/export/model";
import { fitText, textWidth, toPdfText, wrapText } from "@worker/services/export/pdf";
import { describe, expect, it } from "vitest";
import { sampleDocument } from "./fixtures";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

describe("csv", () => {
  it("quotes and neutralizes formula-like text", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(null)).toBe("");
  });

  it("continuation sheet has a header, a row per line and totals", () => {
    const csv = continuationCsv(sampleDocument());
    const rows = csv.trim().split("\r\n");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain("Scheduled value");
    expect(rows[1]).toBe(
      '1,"Rough-in, ""phase 1"" (levels 1-2)",10000,0,2500,100,2600,26,7400,260,0',
    );
    expect(rows[2]?.startsWith("2,'=Line 2")).toBe(true);
    expect(rows[3]).toBe(",TOTALS,20000,0,2500,100,2600,13,17400,260,");
  });

  it("summary lists the numbered lines and the not-AIA notice", () => {
    const csv = summaryCsv(sampleDocument());
    expect(csv).toContain("8. Current payment due,2340");
    expect(csv).toContain('9. Balance to finish, including retainage",17660');
    expect(csv).toContain("Not an AIA document");
  });
});

describe("pdf", () => {
  it("measures, fits and wraps text", () => {
    expect(textWidth("0000", 10)).toBeCloseTo(22.24);
    expect(toPdfText("café – “x”")).toBe('caf? - "x"');
    expect(toPdfText("Civ. Code §§ 8102, 8202; § 8118(b)")).toBe(
      "Civ. Code Secs. 8102, 8202; Sec. 8118(b)",
    );
    const fitted = fitText("a very long description of work that will not fit", 60, 8);
    expect(fitted.endsWith("...")).toBe(true);
    expect(textWidth(fitted, 8)).toBeLessThanOrEqual(60);
    expect(wrapText("one two three four five", 40, 10).length).toBeGreaterThan(1);
  });

  it("renders a structurally valid PDF with summary and continuation pages", () => {
    const bytes = applicationPdf(sampleDocument({ lines: 60 }));
    const text = decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // 1 summary page + 60 lines over landscape continuation pages.
    const count = Number(/\/Count (\d+)/.exec(text)?.[1]);
    expect(count).toBeGreaterThanOrEqual(3);
    expect(text).toContain("(CURRENT PAYMENT DUE \\(line 6 - 7\\)) Tj");
    expect(text).toContain("($2,340.00) Tj");
    expect(text).toContain("Not an AIA document");
    expect(text).toContain("DRAFT - NOT SUBMITTED");
    // Every xref offset points at the start of its object.
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    const entries = text
      .slice(xrefAt)
      .split("\n")
      .slice(3)
      .filter((l) => / n $/.test(l));
    entries.forEach((e, i) => {
      const off = Number(e.slice(0, 10));
      expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
  });

  it("prints the GC billing contact under To only when the job has one", () => {
    const data = sampleDocument();
    expect(decode(applicationPdf(data))).not.toContain("Attn:");
    const withContact = {
      ...data,
      project: { ...data.project, gcBillingName: "Pat Lee", gcBillingEmail: "ap@example.com" },
    };
    expect(decode(applicationPdf(withContact))).toContain("(Attn: Pat Lee, ap@example.com) Tj");
    expect(attentionLine({ gcBillingEmail: " ap@example.com " })).toBe("Attn: ap@example.com");
    expect(attentionLine({ gcBillingName: "Pat Lee", gcBillingEmail: null })).toBe("Attn: Pat Lee");
    expect(attentionLine({ gcBillingName: "  ", gcBillingEmail: "" })).toBeNull();
  });

  it("omits the draft banner once submitted", () => {
    expect(decode(applicationPdf(sampleDocument({ status: "submitted" })))).not.toContain("DRAFT");
  });
});

describe("model helpers", () => {
  it("formats amounts and file names", () => {
    expect(fmtAmount(-123_456)).toBe("(1,234.56)");
    expect(fmtAmount(5)).toBe("0.05");
    expect(exportFileName(sampleDocument(), "pdf")).toBe("p-101-payapp-1.pdf");
  });
});
