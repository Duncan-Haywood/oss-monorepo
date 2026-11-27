// The PDF schedule-of-values import on real printed files (test/fixtures/README.md, "PDF fixtures")
// and on hand-built ones for what a printer rarely produces: a scan, encryption, fonts with no
// character map, a header repeated on page 2.
import { readFileSync } from "node:fs";
import type { PdfText, Rule, TextRun } from "@shared/pdf/text";
import { describe, expect, it } from "vitest";
import { importSovFile } from "./index";
import { tablesFromText } from "./pdf";

const fixture = (n: string) =>
  new Uint8Array(readFileSync(new URL(`../../../test/fixtures/${n}`, import.meta.url)));

const ok = async (name: string) => {
  const r = await importSovFile(name, fixture(name));
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("printed PDFs from other programs", () => {
  it("reads a Chrome-printed bid breakdown: CSI codes, $ at the cell edge, a wrapped description, two pages", async () => {
    const r = await ok("bid-breakdown-chrome.pdf");
    expect(r.lines).toHaveLength(48);
    expect(r.lines[0]).toEqual({
      itemNumber: "01 10 00",
      description: "Mobilization, bonds and insurance",
      originalCents: 1_850_000,
      source: "page 1, line 5",
    });
    // The description wraps onto two lines around its amount: one row, the whole text.
    expect(r.lines[1]?.description).toBe(
      "Temporary power and lighting for the duration of the project, including removal",
    );
    expect(r.lines[1]?.originalCents).toBe(920_000);
    // Page 2 repeats the column header and ends with "Page 2 of 2": neither is a line.
    const last = r.lines[r.lines.length - 1];
    expect(last?.itemNumber).toBe("26 46 00");
    expect(last?.source).toMatch(/^page 2, /);
    expect(r.totalCents).toBe(112_022_300);
    expect(r.sheetTotalCents).toBe(112_022_300);
    expect(r.checks).toEqual([]);
    expect(r.header).toBe("PDF page 1, line 3");
    // Its cells are bordered: the columns come from the borders, and read the same as from the text.
    expect(r.notes[0]).toMatch(
      /^Read from the PDF's text \(PDF pages 1-2, rows and columns from its cell borders\)/,
    );
  });

  it("reads the free template printed by LibreOffice: a five-line wrapped header, billing columns, the title block", async () => {
    const r = await ok("schedule-of-values-example.pdf");
    expect(r.lines.map((l) => [l.itemNumber, l.description, l.originalCents])).toEqual([
      ["1", "Mobilization and general conditions", 1_200_000],
      ["2", "Underground conduit", 4_000_000],
      ["3", "Switchgear (stored on site)", 6_000_000],
      ["4", "Branch wiring and devices", 3_800_000],
    ]);
    expect(r.skipped).toEqual([
      { source: "page 1, line 18", label: "Added EV charger circuits", reason: "change_order" },
    ]);
    expect(r.billingColumns).toEqual(["D", "E", "F", "G", "retainage"]);
    expect(r.lines[2]?.billing).toMatchObject({
      previousCents: 900_000,
      thisPeriodCents: 600_000,
      storedCents: 1_500_000,
      toDateCents: 3_000_000,
      retainageCents: 300_000,
    });
    expect(r.changeOrderLines[0]?.originalCents).toBe(850_000);
    expect(r.applicationNumber).toBe(3);
    expect(r.periodTo).toBe("2026-10-31");
    expect(r.retainageWorkBps).toBe(1000);
    expect(r.sheetTotalCents).toBe(15_850_000);
  });

  it("reads a CSV printed by LibreOffice: item numbers at the right of their cell, CO-1 at the left, two pages", async () => {
    const r = await ok("sov-libreoffice-csv.pdf");
    expect(r.lines).toHaveLength(90);
    expect(r.lines[0]).toMatchObject({
      itemNumber: "1",
      description: "Drywall scope line 1",
      originalCents: 153_725,
    });
    expect(r.lines[89]).toMatchObject({ itemNumber: "90", description: "Drywall scope line 90" });
    expect(r.skipped.map((s) => s.label)).toEqual(["Added soffits"]);
    expect(r.totalCents).toBe(28_753_875);
    expect(r.sheetTotalCents).toBe(28_993_875);
  });
});

describe("ruled tables: columns from the cell borders", () => {
  // Both sheets failed before 2026-11-25: the text was read as where it sits, and a description cut
  // off at its border ran into the amount beside it.
  it("reads a dense bordered sheet printed by Chromium: text clipped at the border, amounts filling their cells", async () => {
    const r = await ok("sov-ruled-chrome.pdf");
    expect(r.lines).toHaveLength(24);
    // As the page shows it: the clipped glyphs ("ywall") are not read.
    expect(r.lines[0]).toMatchObject({
      itemNumber: "1",
      description: "Scope 1 framing and dr",
      originalCents: 103_731_150,
      billing: { previousCents: 41_492_460, thisPeriodCents: 10_373_115, toDateCents: 51_865_575 },
    });
    expect(r.lines[3]?.billing).toMatchObject({ previousCents: 0, thisPeriodCents: 11_492_460 });
    expect(r.lines[23]?.itemNumber).toBe("24");
    expect(r.totalCents).toBe(3_519_345_000);
    expect(r.billingColumns).toEqual(["D", "E", "G"]);
    expect(r.checks).toEqual([]);
    expect(r.notes[0]).toMatch(/columns from its cell borders/);
  });

  it("reads a sheet ruled under each row only: top-aligned descriptions wrapped a full line down stay with their item", async () => {
    const r = await ok("sov-hrules-chrome.pdf");
    expect(r.lines).toHaveLength(30);
    expect(r.totalCents).toBe(75_949_125);
    // The second and third lines of a wrapped description sit as far below the first as the next item
    // does; before the rules were read they were dropped and the description cut short.
    expect(r.lines[1]).toMatchObject({
      itemNumber: "2",
      description:
        "Temporary power, lighting and distribution for the duration of the project, including removal at closeout",
      originalCents: 675_050,
    });
    expect(r.lines[5]?.description).toBe(
      "Lighting fixtures, controls and emergency battery units for levels 1 through 3, per the revised fixture schedule",
    );
    expect(r.lines[29]?.itemNumber).toBe("30");
    expect(r.lines.every((l) => /^[A-Z]/.test(l.description))).toBe(true);
    expect(r.notes[0]).toMatch(
      /^Read from the PDF's text \(PDF page 1, rows from the rules between them\)/,
    );
  });

  it("reads a bordered sheet printed by LibreOffice: stroked borders, a cut-off header touching the next one", async () => {
    const r = await ok("sov-ruled-libreoffice.pdf");
    expect(r.lines).toHaveLength(30);
    expect(r.lines[0]).toMatchObject({
      itemNumber: "1",
      description: "Line 1 interior partitions and ceil",
      originalCents: 4_973_125,
      billing: { previousCents: 1_740_594, thisPeriodCents: 745_969, toDateCents: 2_486_563 },
    });
    expect(r.lines[29]).toMatchObject({ itemNumber: "30", originalCents: 9_993_750 });
    expect(r.totalCents).toBe(224_503_125);
    expect(r.checks).toEqual([]);
    expect(r.notes[0]).toMatch(/columns from its cell borders/);
  });
});

// ---- hand-built PDFs ----

function pdf(objects: Record<number, string>, trailer = "/Root 1 0 R") {
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
  for (let n = 1; n <= max; n++)
    out += `${String(offsets[n] ?? 0).padStart(10, "0")} ${offsets[n] ? "00000 n" : "65535 f"} \n`;
  out += `trailer\n<< /Size ${max + 1} ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}
const stream = (s: string, dict = "") =>
  `<< /Length ${s.length} ${dict} >>\nstream\n${s}\nendstream`;
const onePage = (
  content: string,
  font = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
) =>
  pdf({
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    4: stream(content),
    5: font,
  });

/** A table drawn one cell at a time with Td, the way most report writers print. */
function tableContent(rows: string[][], xs: number[], top = 700) {
  let s = "BT /F1 10 Tf\n";
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell) return;
      s += `1 0 0 1 ${xs[c]} ${top - r * 14} Tm (${cell}) Tj\n`;
    });
  });
  return `${s}ET`;
}

describe("PDFs a contractor might pick", () => {
  it("says a scan has no text instead of importing nothing", async () => {
    const r = await importSovFile("scan.pdf", onePage("q 612 0 0 792 0 0 cm Q"));
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.error).toMatch(/no text to read: it is a scan.*save it as a searchable PDF/);
  });

  it("says a PDF that needs a password cannot be read", async () => {
    const bytes = pdf(
      {
        1: "<< /Type /Catalog /Pages 2 0 R >>",
        2: "<< /Type /Pages /Kids [] /Count 0 >>",
        3: "<< /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>",
      },
      "/Root 1 0 R /Encrypt 3 0 R",
    );
    const r = await importSovFile("locked.pdf", bytes);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^This PDF needs a password to open\./);
  });

  it("refuses text in fonts with no character map rather than guessing at it", async () => {
    const font =
      "<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType2 /BaseFont /X /DW 500 >>] >>";
    const r = await importSovFile(
      "glyphs.pdf",
      onePage(
        "BT /F1 10 Tf 50 700 Td <0011002200330044005500660077008800990011002200330044005500660077> Tj ET",
        font,
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cannot be read back \(16 of 16 characters/);
  });

  it("reads a file whose name says nothing, by its %PDF header", async () => {
    const content = tableContent(
      [
        ["Item", "Description", "Amount"],
        ["1", "Framing", "12,000.00"],
        ["2", "Drywall", "8,500.00"],
      ],
      [50, 100, 400],
    );
    const r = await importSovFile("download", onePage(content));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines.map((l) => l.originalCents)).toEqual([1_200_000, 850_000]);
  });

  it("names the page and line of an amount it cannot read", async () => {
    const content = tableContent(
      [
        ["Item", "Description", "Amount"],
        ["1", "Framing", "12,000.00"],
        ["2", "Drywall", "TBD"],
        ["3", "Paint", "1,000.00"],
      ],
      [50, 100, 400],
    );
    const r = await importSovFile("x.pdf", onePage(content));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Drywall (page 1, line 3) is not a dollar amount ("TBD").');
  });
});

describe("tablesFromText", () => {
  const run = (x0: number, y: number, text: string, size = 10): TextRun => ({
    x0,
    x1: x0 + text.length * size * 0.5,
    y,
    size,
    text,
  });
  const page = (n: number, runs: TextRun[]) => ({ page: n, runs, rules: [] as Rule[] });
  const text = (pages: ReturnType<typeof page>[]): PdfText => ({
    pages,
    chars: 1000,
    unreadable: 0,
    invisible: 0,
  });

  it("drops a header repeated on the next page and page-number lines, and keeps page 2's lines", () => {
    const header = [run(40, 50, "Item"), run(100, 50, "Description"), run(400, 50, "Amount")];
    const row = (y: number, i: string, d: string, a: string) => [
      run(40, y, i),
      run(100, y, d),
      run(460 - a.length * 5, y, a),
    ];
    const t = tablesFromText(
      text([
        page(1, [
          ...header,
          ...row(70, "1", "Framing", "12,000.00"),
          ...row(84, "2", "Drywall", "8,500.00"),
          run(280, 760, "Page 1 of 2"),
        ]),
        page(2, [...header, ...row(70, "3", "Paint", "4,000.00"), run(280, 760, "Page 2 of 2")]),
      ]),
    );
    expect(t).toHaveLength(1);
    expect(t[0]?.name).toBe("PDF pages 1-2");
    expect(t[0]?.grid).toEqual([
      ["Item", "Description", "Amount"],
      ["1", "Framing", "12,000.00"],
      ["2", "Drywall", "8,500.00"],
      ["3", "Paint", "4,000.00"],
    ]);
    expect(t[0]?.labels).toEqual([
      "page 1, line 1",
      "page 1, line 2",
      "page 1, line 3",
      "page 2, line 2",
    ]);
  });

  const vrule = (x: number, y0: number, y1: number) => ({ x0: x - 0.25, x1: x + 0.25, y0, y1 });
  const ruledPage = (rules: ReturnType<typeof vrule>[]) => ({
    page: 1,
    rules,
    // A description long enough to reach the amount column, and an amount that starts at its border.
    runs: [
      run(42, 50, "Item"),
      run(72, 50, "Description"),
      run(252, 50, "Amount"),
      run(42, 64, "1"),
      run(72, 64, "Framing, level 1 and level 2 corridors"),
      run(252, 64, "12,000.00"),
      run(42, 78, "2"),
      run(72, 78, "Drywall"),
      run(260, 78, "8,500.00"),
    ],
  });

  it("takes the columns from vertical rules that cross the data lines", () => {
    const rules = [40, 70, 250, 320].map((x) => vrule(x, 40, 82));
    const [t] = tablesFromText(text([ruledPage(rules)]));
    expect(t?.ruled).toBe(true);
    expect(t?.grid).toEqual([
      ["Item", "Description", "Amount"],
      ["1", "Framing, level 1 and level 2 corridors", "12,000.00"],
      ["2", "Drywall", "8,500.00"],
    ]);
  });

  it("joins a border Chromium paints a row at a time into one edge", () => {
    const rules = [40, 70, 250, 320].flatMap((x) => [
      vrule(x, 40, 54),
      vrule(x, 54, 68),
      vrule(x, 68, 82),
    ]);
    expect(tablesFromText(text([ruledPage(rules)]))[0]?.ruled).toBe(true);
  });

  it("falls back to the text when the borders leave columns out", () => {
    // Only the outer box: both amounts of a line would fall in one cell.
    const outer = [40, 320].map((x) => vrule(x, 40, 82));
    const page2 = ruledPage(outer);
    page2.runs.push(run(200, 64, "1,000.00"), run(200, 78, "2,000.00"));
    expect(tablesFromText(text([page2]))[0]?.ruled).toBe(false);
    // Rules that stop above the data lines (a title box) are no column edges either.
    const title = [40, 70, 250, 320].map((x) => vrule(x, 10, 30));
    expect(tablesFromText(text([ruledPage(title)]))[0]?.ruled).toBe(false);
  });

  const hrule = (y: number, x0 = 40, x1 = 320) => ({ x0, x1, y0: y - 0.375, y1: y + 0.375 });
  // Top-aligned cells: a description's second line is a full line (14 pt) below its first, as far
  // as the next item is.
  const wrappedRuns = () => [
    run(42, 50, "Item"),
    run(72, 50, "Description"),
    run(252, 50, "Amount"),
    run(42, 66, "1"),
    run(72, 66, "Framing, level 1"),
    run(252, 66, "12,000.00"),
    run(72, 80, "and level 2 corridors"),
    run(42, 96, "2"),
    run(72, 96, "Drywall"),
    run(260, 96, "8,500.00"),
    run(42, 110, "3"),
    run(72, 110, "Paint"),
    run(260, 110, "4,000.00"),
  ];

  it("takes the rows from horizontal rules that divide the data lines", () => {
    // A rule under each row, the first painted a cell at a time, and a short underline under one amount.
    const rules = [
      hrule(54, 40, 70),
      hrule(54, 70, 250),
      hrule(54, 250, 320),
      hrule(84),
      hrule(100),
      hrule(114),
      hrule(102, 250, 300),
    ];
    const [t] = tablesFromText(text([{ page: 1, runs: wrappedRuns(), rules }]));
    expect(t?.rowsRuled).toBe(true);
    expect(t?.ruled).toBe(false);
    expect(t?.grid).toEqual([
      ["Item", "Description", "Amount"],
      ["1", "Framing, level 1 and level 2 corridors", "12,000.00"],
      ["2", "Drywall", "8,500.00"],
      ["3", "Paint", "4,000.00"],
    ]);
    expect(t?.labels).toEqual([
      "page 1, line 1",
      "page 1, line 2",
      "page 1, line 4",
      "page 1, line 5",
    ]);
  });

  it("reads rows by spacing when the rules do not divide the data lines", () => {
    // A rule under the header and one under the last line: no rule between items.
    const [t] = tablesFromText(
      text([{ page: 1, runs: wrappedRuns(), rules: [hrule(54), hrule(114)] }]),
    );
    expect(t?.rowsRuled).toBe(false);
    expect(t?.grid.map((r) => r[1])).toEqual([
      "Description",
      "Framing, level 1",
      "and level 2 corridors",
      "Drywall",
      "Paint",
    ]);
    // Rules too short to cross the table (underlines under amounts) are no row rules either.
    const short = [54, 84, 100, 114].map((y) => hrule(y, 250, 300));
    expect(
      tablesFromText(text([{ page: 1, runs: wrappedRuns(), rules: short }]))[0]?.rowsRuled,
    ).toBe(false);
  });

  it("splits a ruled band holding two items by spacing, so a rule left out never joins them", () => {
    // No rule between items 2 and 3.
    const runs = [
      ...wrappedRuns(),
      run(42, 124, "4"),
      run(72, 124, "Trim"),
      run(260, 124, "2,500.00"),
    ];
    const rules = [hrule(54), hrule(84), hrule(114), hrule(128)];
    const [t] = tablesFromText(text([{ page: 1, runs, rules }]));
    expect(t?.rowsRuled).toBe(true);
    expect(t?.grid.slice(1)).toEqual([
      ["1", "Framing, level 1 and level 2 corridors", "12,000.00"],
      ["2", "Drywall", "8,500.00"],
      ["3", "Paint", "4,000.00"],
      ["4", "Trim", "2,500.00"],
    ]);
  });

  it("keeps a comma kerned under the word before it in that word", () => {
    const runs = [
      run(42, 66, "1"),
      { x0: 72, x1: 100, y: 66, size: 10, text: "Framing" },
      { x0: 99.5, x1: 140, y: 66, size: 10, text: ", level 1" },
      run(252, 66, "12,000.00"),
      run(42, 80, "2"),
      run(72, 80, "Drywall"),
      run(252, 80, "8,500.00"),
    ];
    const [t] = tablesFromText(text([{ page: 1, runs, rules: [] }]));
    expect(t?.grid[0]).toEqual(["1", "Framing, level 1", "12,000.00"]);
  });

  it("keeps pages whose columns do not line up as separate tables", () => {
    const t = tablesFromText(
      text([
        page(1, [run(40, 70, "1"), run(100, 70, "Framing"), run(400, 70, "12,000.00")]),
        page(2, [run(40, 70, "Summary"), run(150, 70, "100.00"), run(250, 70, "200.00")]),
      ]),
    );
    expect(t.map((x) => x.name)).toEqual(["PDF page 1", "PDF page 2"]);
  });
});
