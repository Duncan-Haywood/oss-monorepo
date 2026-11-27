import { describe, expect, it } from "vitest";
import { buildPdf, textWidth, wrapText } from "./pdf";

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("buildPdf", () => {
  it("writes a structurally valid PDF with a correct xref table", () => {
    const pdf = latin1(
      buildPdf([
        [{ kind: "text", x: 54, y: 700, text: "Quote Q-1001 (draft) \\ test ±.005", size: 12 }],
        [{ kind: "line", x1: 0, y1: 0, x2: 10, y2: 10 }],
      ]),
    );
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Count 2");
    // Parentheses/backslashes escaped; ± written as a WinAnsi octal escape.
    expect(pdf).toContain("(Quote Q-1001 \\(draft\\) \\\\ test \\261.005) Tj");
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    // Every xref offset points at its "n 0 obj".
    const entries = pdf
      .slice(startxref)
      .split("\n")
      .slice(3)
      .filter((l) => / n $/.test(l));
    entries.forEach((e, i) => {
      const off = Number(e.slice(0, 10));
      expect(pdf.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    // Stream /Length matches its content.
    for (const m of pdf.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const start = (m.index ?? 0) + m[0].length;
      expect(pdf.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
    }
  });
});

describe("text layout", () => {
  it("measures and wraps Helvetica text", () => {
    expect(textWidth("ii", 10)).toBeCloseTo(4.44);
    const lines = wrapText("one two three four five six seven", 60, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l, 10)).toBeLessThanOrEqual(60);
    expect(wrapText("a\nb", 100, 10)).toEqual(["a", "b"]);
  });
});
