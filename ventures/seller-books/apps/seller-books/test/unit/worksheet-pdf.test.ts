// The Schedule C worksheet PDF: a well-formed file (every xref offset lands on its object), the worksheet's
// lines and warnings in it, a loss in parentheses, pages added as the warnings grow, and no timestamp.
import { SCHEDULE_C_DISCLAIMER, type ScWorksheet } from "@worker/services/books/schedule-c";
import { mileageNote, pdfAmount, scheduleCPdf } from "@worker/services/books/worksheet-pdf";
import { describe, expect, it } from "vitest";

const ws = (over: Partial<ScWorksheet> = {}): ScWorksheet & { businessMiles: number } => ({
  year: 2026,
  disclaimer: SCHEDULE_C_DISCLAIMER,
  lines: [
    { line: "1", label: "Gross receipts or sales", amountCents: 123_456 },
    { line: "4", label: "Cost of goods sold (from line 42)", amountCents: 40_000 },
    { line: "9", label: "Car and truck expenses", amountCents: 1750, note: "25.0 business miles" },
    { line: "10", label: "Commissions and fees", amountCents: 15_000 },
    { line: "31", label: "Net profit or (loss)", amountCents: -2_500 },
  ],
  partIII: [{ line: "41", label: "Inventory at end of year", amountCents: 1500 }],
  otherExpenses: [{ line: "27a", label: "Postage and shipping labels", amountCents: 900 }],
  warnings: ["3 orders have no item linked."],
  openingInventory: { booksCents: 0, filedCents: null },
  unlinkedSales: null,
  mileagePricing: null,
  equipment: null,
  businessMiles: 25,
  ...over,
});

const text = (b: Uint8Array) => new TextDecoder().decode(b);

function checkXref(pdf: string) {
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)?.[1]);
  expect(pdf.slice(start, start + 4)).toBe("xref");
  const [, count] = /^xref\n0 (\d+)\n/.exec(pdf.slice(start)) ?? [];
  const entries = pdf
    .slice(start)
    .split("\n")
    .slice(3, 2 + Number(count));
  entries.forEach((e, i) => {
    const off = Number(e.slice(0, 10));
    expect(pdf.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
  });
}

describe("Schedule C worksheet PDF", () => {
  it("is a well-formed PDF with every part, the shop name and the disclaimer", () => {
    const pdf = text(scheduleCPdf({ worksheet: ws(), shopName: "Attic Finds", mileageRate: null }));
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    checkXref(pdf);
    for (const s of [
      "Schedule C worksheet, tax year 2026",
      "Attic Finds",
      "Part I  Income",
      "Part II  Expenses",
      "Part III  Cost of goods sold",
      "Part IV  Information on your vehicle",
      "Part V  Other expenses",
      "Check these before you file",
      "Gross receipts or sales",
      "$1,234.56",
      "($25.00)",
      "25.0 business miles",
      "3 orders have no item linked.",
      "not tax advice",
      "IRS form",
      "Line 9 at the IRS rate in force on each trip's date",
      "Page 1 of 1",
    ]) {
      expect(pdf, s).toContain(s.replace(/[()]/g, (c) => `\\${c}`));
    }
    // Line 10 sits in Part II, after the Part II heading; line 4 in Part I, before it.
    expect(pdf.indexOf("Commissions and fees")).toBeGreaterThan(pdf.indexOf("Part II  Expenses"));
    expect(pdf.indexOf("Cost of goods sold \\(from line 42\\)")).toBeLessThan(
      pdf.indexOf("Part II  Expenses"),
    );
  });

  it("the same books give the same bytes, and a chosen rate is named", () => {
    const a = scheduleCPdf({ worksheet: ws(), shopName: "Shop", mileageRate: 70 });
    const b = scheduleCPdf({ worksheet: ws(), shopName: "Shop", mileageRate: 70 });
    expect(text(a)).toBe(text(b));
    expect(text(a)).toContain(mileageNote(70));
  });

  it("long warning lists flow onto more pages, each numbered", () => {
    const warnings = Array.from(
      { length: 60 },
      (_, i) =>
        `Warning ${i + 1}: a long explanation of something the seller should check with their preparer before filing, wrapped over lines.`,
    );
    const pdf = text(
      scheduleCPdf({ worksheet: ws({ warnings }), shopName: "S", mileageRate: null }),
    );
    checkXref(pdf);
    const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(pdf)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(pdf).toContain(`Page ${pages} of ${pages}`);
    expect(pdf).toContain("Warning 60:");
  });

  it("formats amounts like a tax form", () => {
    expect(pdfAmount(null)).toBe("");
    expect(pdfAmount(0)).toBe("$0.00");
    expect(pdfAmount(5)).toBe("$0.05");
    expect(pdfAmount(123_456_789)).toBe("$1,234,567.89");
    expect(pdfAmount(-1999)).toBe("($19.99)");
  });
});
