// Scanned schedules of values with a text layer: the "searchable PDF" a scanner or scanning app writes,
// an invisible OCR text layer laid word by word over the page picture, the page a little tilted.
// Real files made by Tesseract (test/fixtures/README.md, "Scan fixtures") and hand-built ones.
import { readFileSync } from "node:fs";
import { extractText, type PageText, type TextRun } from "@shared/pdf/text";
import { describe, expect, it } from "vitest";
import { importSovFile } from "./index";
import { deskew, dropOcrBorders, skewOf, tablesFromText } from "./pdf";

const fixture = (n: string) =>
  new Uint8Array(readFileSync(new URL(`../../../test/fixtures/${n}`, import.meta.url)));

const ok = async (name: string, bytes: Uint8Array) => {
  const r = await importSovFile(name, bytes);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("searchable scans made by Tesseract", () => {
  // The same bid breakdown as bid-breakdown-chrome.pdf: 48 lines, $1,120,223.00.
  for (const [name, tilt] of [
    ["bid-breakdown-scan-tilted.pdf", "0.4 degrees at 200 dpi"],
    ["bid-breakdown-scan-tilted-more.pdf", "1.5 degrees the other way at 300 dpi"],
  ] as const) {
    it(`reads every line and amount of a scan tilted ${tilt}`, async () => {
      const r = await ok(name, fixture(name));
      expect(r.lines).toHaveLength(48);
      expect(r.lines[0]).toEqual({
        itemNumber: "01 10 00",
        description: "Mobilization, bonds and insurance",
        originalCents: 1_850_000,
        source: "page 1, line 5",
      });
      expect(r.lines[1]?.originalCents).toBe(920_000);
      // A count inside the description stays in it, not in a column of its own.
      expect(r.lines[2]?.description).toBe("Electrical scope item 1 (branch circuits)");
      expect(r.lines[47]).toMatchObject({
        itemNumber: "26 46 00",
        description: "Electrical scope item 46 (branch circuits)",
        originalCents: 4_625_050,
      });
      expect(r.lines[47]?.source).toMatch(/^page 2, /);
      expect(r.totalCents).toBe(112_022_300);
      expect(r.sheetTotalCents).toBe(112_022_300);
      expect(r.checks).toEqual([]);
      // OCR misreads words ("Temporary power" comes back as noise in both files): the note says to check.
      expect(r.notes[0]).toMatch(/^Read from the scan's text layer \(PDF pages 1-2\).*OCR/);
    });
  }

  it("reads the invisible text layer, and measures each page's tilt", async () => {
    const t = await extractText(fixture("bid-breakdown-scan-tilted.pdf"));
    expect(t.chars).toBeGreaterThan(2000);
    expect(t.invisible).toBe(t.chars);
    // Each page's lines climb about 0.4 degrees (y grows down the page, so a positive slope).
    for (const p of t.pages) expect(skewOf(p.runs)).toBeCloseTo(Math.tan((0.4 * Math.PI) / 180), 2);
  });
});

// ---- hand-built ----

function pdf(objects: Record<number, string>) {
  let out = "%PDF-1.4\n";
  const offsets: Record<number, number> = {};
  const nums = Object.keys(objects)
    .map(Number)
    .sort((a, b) => a - b);
  for (const n of nums) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const max = Math.max(...nums);
  const xref = out.length;
  out += `xref\n0 ${max + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= max; n++) out += `${String(offsets[n] ?? 0).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${max + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}
const onePage = (content: string) =>
  pdf({
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    4: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    5: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  });

const ROWS = [
  ["Item", "Description", "Amount"],
  ["1", "Framing crew 2 walls", "12,000.00"],
  ["2", "Drywall hang and tape", "8,500.00"],
  ["3", "Paint 3 coats", "4,250.50"],
  ["4", "Doors and frames", "6,100.00"],
  ["5", "Ceiling grid", "3,900.00"],
  ["6", "Cleanup", "1,200.00"],
];
/**
 * The table drawn as a scanner's OCR layer draws it: each word on its own with its trailing space, in
 * Courier (6 points a character at 10 points, so where each word ends is known), the amount at the
 * right of its column, every line falling `slope` points per point across, and the text invisible.
 */
function scanContent(slope: number, render = 3, rows = ROWS) {
  let s = `BT /F1 10 Tf ${render} Tr\n`;
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const words = cell.split(" ");
      const width = cell.length * 6;
      let x = c === 0 ? 40 : c === 1 ? 100 : 460 - width;
      for (const w of words) {
        const y = 700 - r * 14 - slope * x;
        s += `1 0 0 1 ${x} ${y.toFixed(3)} Tm (${w} ) Tj\n`;
        x += (w.length + 1) * 6;
      }
    });
  });
  return `${s}ET`;
}

describe("a scan whose lines do not add up to its totals row", () => {
  // Drywall is $3,500.00 on the paper and the total is right; the OCR read the 3 as an 8.
  const rows = [...ROWS, ["", "Total", "30,950.50"]];
  it("names the line one look-alike digit would put right, and changes nothing", async () => {
    const r = await ok("scan.pdf", onePage(scanContent(0.012, 3, rows)));
    expect(r.scanned).toBe(true);
    expect(r.lines[1]?.originalCents).toBe(850_000); // as read: never corrected
    const msgs = r.checks.map((c) => c.message);
    expect(msgs.some((m) => /sheet's own total/.test(m))).toBe(true);
    expect(msgs).toContain(
      "The scan probably misread one figure: 2 Drywall hang and tape (page 1, line 3) reads $8,500.00; $3,500.00 if an 8 there is a 3 on the paper, which makes the lines add up to the sheet's total. Check it on the paper and correct it before you import.",
    );
  });
  it("leaves a printed PDF's total check as it was: a printed figure is not a misread", async () => {
    const r = await ok("printed.pdf", onePage(scanContent(0, 0, rows)));
    expect(r.scanned).toBeUndefined();
    expect(r.checks.some((c) => /misread/.test(c.message))).toBe(false);
    expect(r.checks.some((c) => /sheet's own total/.test(c.message))).toBe(true);
  });
});

describe("a tilted scan's text layer, hand-built", () => {
  it("levels the page and reads each line whole: the amount stays with its description", async () => {
    // 0.012 points per point: the amount at x 460 sits 5 points lower than the item number at x 40,
    // more than the 3 points that still count as one line.
    const r = await ok("scan.pdf", onePage(scanContent(0.012)));
    expect(r.lines.map((l) => [l.itemNumber, l.description, l.originalCents])).toEqual([
      ["1", "Framing crew 2 walls", 1_200_000],
      ["2", "Drywall hang and tape", 850_000],
      ["3", "Paint 3 coats", 425_050],
      ["4", "Doors and frames", 610_000],
      ["5", "Ceiling grid", 390_000],
      ["6", "Cleanup", 120_000],
    ]);
    expect(r.notes[0]).toMatch(/^Read from the scan's text layer/);
  });

  it("reads the same table printed level and visible as a printed PDF, with the printed note", async () => {
    const r = await ok("printed.pdf", onePage(scanContent(0, 0)));
    expect(r.lines.map((l) => l.originalCents)).toEqual([
      1_200_000, 850_000, 425_050, 610_000, 390_000, 120_000,
    ]);
    expect(r.notes[0]).toMatch(/^Read from the PDF's text/);
  });

  it("counts invisible text (rendering modes 3 and 7) and only that", async () => {
    const shown = await extractText(onePage(scanContent(0, 0)));
    expect(shown.invisible).toBe(0);
    const hidden = await extractText(onePage(scanContent(0, 7)));
    expect(hidden.invisible).toBe(hidden.chars);
  });

  it("says what to do when a scan cannot be read", async () => {
    // Steeper than 5 degrees is not taken for a tilt, and no line holds together.
    const r = await importSovFile("scan.pdf", onePage(scanContent(0.2)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/This PDF is a scan read through OCR.*300 dpi/);
  });
});

const run = (x0: number, y: number, text: string, size = 10): TextRun => ({
  x0,
  x1: x0 + text.length * 6,
  y,
  size,
  text,
});
const page = (runs: TextRun[]): PageText => ({ page: 1, runs, rules: [] });

describe("skewOf and deskew", () => {
  const tilted = (slope: number) =>
    page(
      [0, 1, 2, 3].flatMap((r) =>
        ["alpha ", "beta ", "gamma ", "delta "].map((w, i) => {
          const x = 40 + i * 60;
          return run(x, 100 + r * 14 + slope * x, w);
        }),
      ),
    );

  it("measures the tilt from neighbouring words and levels every line", () => {
    const p = tilted(0.02);
    expect(skewOf(p.runs)).toBeCloseTo(0.02, 6);
    const level = deskew(p);
    for (let r = 0; r < 4; r++) {
      const ys = level.runs.slice(r * 4, r * 4 + 4).map((x) => x.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-9);
    }
  });

  it("leaves a level page, a steep slant and a page of a few words as they are", () => {
    const level = tilted(0);
    expect(skewOf(level.runs)).toBe(0);
    expect(deskew(level)).toBe(level);
    // Ten words a word apart on one line, falling 0.15 points per point (8.5 degrees): a slant, not a tilt.
    const slant = page(
      Array.from({ length: 10 }, (_, i) => run(40 + i * 36, 100 + 0.15 * i * 36, "word ")),
    );
    expect(skewOf(slant.runs)).toBe(0);
    const few = page([run(40, 100, "a "), run(60, 101, "b ")]);
    expect(skewOf(few.runs)).toBe(0);
    expect(deskew(few)).toBe(few);
  });

  it("moves a page's rules with its text", () => {
    const p = { ...tilted(0.02), rules: [{ x0: 40, x1: 280, y0: 90, y1: 91 }] };
    const [rule] = deskew(p).rules;
    // From x 40 to 280 the tilt is 4.8 points; the rule's box grows to cover both ends, levelled.
    expect((rule?.y1 ?? 0) - (rule?.y0 ?? 0)).toBeCloseTo(1 + 0.02 * 240, 6);
  });
});

describe("dropOcrBorders", () => {
  it("drops a table border OCR read as a character, alone or stuck to a word", () => {
    const p = dropOcrBorders(
      page([
        run(40, 100, "| "),
        run(50, 100, "| Description "),
        run(150, 100, "$33,000.00 | "),
        run(250, 100, ") "),
        run(260, 100, "(lighting) "),
        run(330, 100, "[_] "),
      ]),
    );
    expect(p.runs.map((r) => r.text)).toEqual(["Description ", "$33,000.00 ", "(lighting) "]);
  });
});

describe("a header repeated on page 2 of a scan, with a smudge read beside it", () => {
  it("is left out like an exact repeat", () => {
    const header = (extra: string) => [
      run(40, 50, "Item"),
      run(100, 50, "Description"),
      ...(extra ? [run(340, 50, extra)] : []),
      run(400, 50, "Amount"),
    ];
    const row = (y: number, i: string, d: string, a: string) => [
      run(40, y, i),
      run(100, y, d),
      run(460 - a.length * 6, y, a),
    ];
    const t = tablesFromText({
      pages: [
        { page: 1, runs: [...header(""), ...row(70, "1", "Framing", "12,000.00")], rules: [] },
        { page: 2, runs: [...header("Seyi"), ...row(70, "2", "Paint", "4,000.00")], rules: [] },
      ],
      chars: 1000,
      unreadable: 0,
      invisible: 0,
    });
    expect(t).toHaveLength(1);
    expect(t[0]?.grid.map((r) => r.join("|"))).toEqual([
      "Item|Description|Amount",
      "1|Framing|12,000.00",
      "2|Paint|4,000.00",
    ]);
  });
});
