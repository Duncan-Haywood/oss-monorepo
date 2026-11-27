// The notary block on the application summary: off by default, and when on, a jurat with blanks and
// a seal box that fit on page 1 above the footer, even in the tallest case (the own-rate note).
import { applicationPdf, NOTARY_LINES } from "@worker/services/export/application-pdf";
import { textWidth, toPdfText } from "@worker/services/export/pdf";
import { describe, expect, it } from "vitest";
import { sampleDocument } from "./fixtures";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const shown = (line: string) => `(${toPdfText(line).replace(/[()\\]/g, (c) => `\\${c}`)}) Tj`;

/** The content stream ops of page 1 (the summary): everything before the first page break. */
function summaryOps(pdf: string): string {
  const streams = [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => m[1] ?? "");
  const page = streams.find((s) => s.includes("Contractor's Application for Payment"));
  if (!page) throw new Error("no summary page");
  return page;
}

/** Every text baseline and box edge on the page, in PDF units from the bottom. */
function verticals(ops: string) {
  const tds = [...ops.matchAll(/ ([\d.]+) ([\d.]+) Td \((.*?)\) Tj/g)].map((m) => ({
    y: Number(m[2]),
    text: m[3] ?? "",
  }));
  const rects = [...ops.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re S/g)].map((m) => ({
    bottom: Number(m[2]),
    top: Number(m[2]) + Number(m[4]),
  }));
  return { tds, rects };
}

function tallest(notaryBlock: boolean) {
  const data = sampleDocument();
  data.project.notaryBlock = notaryBlock;
  // A line held at its own rate adds the two-line note under line 9 (the tallest page 1).
  data.computed.summary.lineRates = [
    { sovLineId: "L1", itemNumber: "1", retainagePctBps: 500 },
    { sovLineId: "L2", itemNumber: "2", retainagePctBps: 0 },
  ];
  return decode(applicationPdf(data));
}

describe("notary block", () => {
  it("is not printed unless the job asks for it", () => {
    const pdf = decode(applicationPdf(sampleDocument()));
    expect(pdf).not.toContain("Subscribed and sworn");
    expect(pdf).not.toContain("(Seal) Tj");
  });

  it("prints the jurat blanks and a seal box on the summary page", () => {
    const data = sampleDocument();
    data.project.notaryBlock = true;
    const ops = summaryOps(decode(applicationPdf(data)));
    for (const line of [
      NOTARY_LINES.place,
      NOTARY_LINES.sworn,
      NOTARY_LINES.signer,
      NOTARY_LINES.notary,
    ]) {
      expect(ops).toContain(shown(line));
    }
    expect(ops).toContain("(Seal) Tj");
    // Still our own form, and still signed by the contractor above the notary.
    expect(ops).toContain("Not an AIA document");
    expect(ops).toContain("(By: _________________________________) Tj");
  });

  it("fits above the footer in the tallest case, with or without the block", () => {
    for (const on of [false, true]) {
      const { tds, rects } = verticals(summaryOps(tallest(on)));
      // Page is 792 high; the footer rule is 36 up and the footer text sits below it.
      const body = tds.filter((t) => t.y > 36);
      const footer = tds.filter((t) => t.y <= 36);
      expect(
        footer.every((t) => /Not an AIA|Institute of Architects|Application summary/.test(t.text)),
      ).toBe(true);
      expect(Math.min(...body.map((t) => t.y))).toBeGreaterThan(40);
      expect(Math.min(...rects.map((r) => r.bottom))).toBeGreaterThan(38);
      expect(Math.max(...rects.map((r) => r.top))).toBeLessThan(792 - 40);
    }
  });

  it("keeps every jurat line clear of the seal box", () => {
    // Text runs from x = 48 to the seal box at 612 - 40 - 8 - 96 - 8 = 460.
    const room = 612 - 40 - 8 - 96 - 8 - 48;
    for (const line of [
      NOTARY_LINES.place,
      NOTARY_LINES.sworn,
      NOTARY_LINES.signer,
      NOTARY_LINES.notary,
    ]) {
      expect(Math.min(textWidth(line, 8.5), textWidth(line, 8))).toBeLessThanOrEqual(room);
    }
  });

  it("does not move the summary lines when off", () => {
    // Line 8, the tenth row, sits where it always has: 208 + 10 * 20 = 408 from the top.
    expect(tallest(false)).toContain(` ${792 - 408} Td (CURRENT PAYMENT DUE`);
  });
});
