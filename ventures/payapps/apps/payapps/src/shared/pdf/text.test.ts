// Positioned text from hand-built PDFs: the text operators, fonts and encodings a printed schedule
// of values uses, page rotation, form XObjects and inline images, and files built to cost too much.
import { describe, expect, it } from "vitest";
import { parseToUnicode } from "./fonts";
import { extractText } from "./text";

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
  for (let n = 1; n <= max; n++)
    out += `${String(offsets[n] ?? 0).padStart(10, "0")} ${offsets[n] ? "00000 n" : "65535 f"} \n`;
  out += `trailer\n<< /Size ${max + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}
const stream = (s: string, dict = "") =>
  `<< /Length ${s.length} ${dict} >>\nstream\n${s}\nendstream`;
const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

function page(
  content: string,
  { font = HELVETICA, extra = {} as Record<number, string>, pageDict = "", xobjects = "" } = {},
) {
  return pdf({
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> ${xobjects} >> ${pageDict} >>`,
    4: stream(content),
    5: font,
    ...extra,
  });
}

const runs = async (bytes: Uint8Array) => (await extractText(bytes)).pages[0]?.runs ?? [];

describe("extractText", () => {
  it("reads content streams in ASCIIHex, RunLength and ASCII85 + LZW, as older drivers write them", async () => {
    const c = "BT /F1 12 Tf 72 720 Td (Mobilization) Tj 300 0 Td (4,500.00) Tj ET";
    const hex = `${Array.from(c, (ch) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join(" ")}>`;
    // RunLength: literal runs of up to 128 bytes, then the end byte (128).
    let rl = "";
    for (let i = 0; i < c.length; i += 128) {
      const part = c.slice(i, i + 128);
      rl += String.fromCharCode(part.length - 1) + part;
    }
    rl += String.fromCharCode(128);
    // ASCII85 of the LZW bytes, written by Python's base64.a85encode over an LZW encoder.
    const a85lzw = `J.RTi!I5Mk+;g&j"[atoD[M8Y+_F"?TUKdR)GPsMd=g^t2k,LTZVZ0a0Sr2TO[27Z=>c<NV%PPZP_rFjJ,~>`;
    for (const [content, filter] of [
      [hex, "/ASCIIHexDecode"],
      [rl, "/RunLengthDecode"],
      [a85lzw, "[/ASCII85Decode /LZWDecode]"],
    ] as const) {
      const bytes = page("", { extra: { 4: stream(content, `/Filter ${filter}`) } });
      expect((await runs(bytes)).map((x) => x.text)).toEqual(["Mobilization", "4,500.00"]);
    }
  });

  it("places text from the top-left of the page, with its size and width", async () => {
    const r = await runs(page("BT /F1 12 Tf 72 720 Td (Item) Tj ET"));
    expect(r).toHaveLength(1);
    expect(r[0]?.text).toBe("Item");
    expect(r[0]?.x0).toBeCloseTo(72);
    expect(r[0]?.y).toBeCloseTo(72); // 792 - 720
    expect(r[0]?.size).toBeCloseTo(12);
    // No /Widths: 500 thousandths a glyph.
    expect(r[0]?.x1).toBeCloseTo(72 + 4 * 6);
  });

  it("follows Td, TD, T*, ', Tm and cm", async () => {
    const r = await runs(
      page(
        "q 2 0 0 2 0 0 cm BT /F1 5 Tf 10 300 Td (a) Tj 0 -10 TD (b) Tj T* (c) Tj (d) ' 1 0 0 1 100 50 Tm (e) Tj ET Q",
      ),
    );
    expect(r.map((x) => [x.text, Math.round(x.x0), Math.round(x.y), Math.round(x.size)])).toEqual([
      ["a", 20, 192, 10],
      ["b", 20, 212, 10],
      ["c", 20, 232, 10],
      ["d", 20, 252, 10],
      ["e", 200, 692, 10],
    ]);
  });

  it("joins a kerned TJ into one run, and splits it where an adjustment or a drawn space opens a gap", async () => {
    const r = await runs(
      page("BT /F1 10 Tf 50 700 Td [(W) 80 (ork) -20 ( ) (done) -400 (12,000.00)] TJ ET"),
    );
    expect(r.map((x) => x.text)).toEqual(["Work done", "12,000.00"]);
  });

  it("reads /Widths, /Differences glyph names and WinAnsi punctuation", async () => {
    const font =
      "<< /Type /Font /Subtype /TrueType /BaseFont /Arial /FirstChar 32 /LastChar 150 /Widths [278 " +
      "0 ".repeat(117) +
      "556 ] /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [65 /dollar /one /comma /zero /period] >> >>";
    const r = await runs(page("BT /F1 10 Tf 50 700 Td (ABCDDDEDD \\226 x) Tj ET", { font }));
    expect(r[0]?.text).toBe("$1,000.00 – x");
    // "A" (65) has width 0 from the array; the space (32) 278; 150 (en dash) 556.
    expect((r[0]?.x1 ?? 0) - (r[0]?.x0 ?? 0)).toBeCloseTo((278 * 2 + 556) / 100, 1);
  });

  it("decodes two-byte codes through a ToUnicode map", async () => {
    const cmap =
      "begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfchar <0003> <0020> <0010> <0024> endbfchar 1 beginbfrange <0011> <001A> <0030> endbfrange endcmap";
    const font =
      "<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 6 0 R /DescendantFonts [<< /Type /Font /Subtype /CIDFontType2 /BaseFont /X /DW 1000 /W [16 [556] 17 26 556] >>] >>";
    const r = await runs(
      page("BT /F1 10 Tf 50 700 Td <001000120003001A> Tj ET", { font, extra: { 6: stream(cmap) } }),
    );
    expect(r[0]?.text).toBe("$1 9");
    expect((r[0]?.x1 ?? 0) - (r[0]?.x0 ?? 0)).toBeCloseTo(5.56 * 2 + 10 + 5.56, 1);
  });

  it("parses bfrange arrays and ranges that carry into the next byte", () => {
    const m = parseToUnicode(
      "begincodespacerange <00> <FF> endcodespacerange beginbfrange <01> <03> [<0041> <0042> <00660069>] <FE> <FF> <00FF> endbfrange",
    );
    expect([1, 2, 3, 0xfe, 0xff].map((c) => m.map.get(`1:${c}`))).toEqual([
      "A",
      "B",
      "fi",
      "ÿ",
      "Ā",
    ]);
  });

  it("shows a rotated page as the reader sees it", async () => {
    const r = await runs(
      page("BT /F1 10 Tf 0 1 -1 0 300 100 Tm (Total) Tj ET", { pageDict: "/Rotate 90" }),
    );
    // Text drawn upward on a page turned a quarter clockwise reads left to right.
    expect(r[0]?.text).toBe("Total");
    expect(r[0]?.x0).toBeCloseTo(100);
    expect(r[0]?.y).toBeCloseTo(300);
  });

  it("leaves out vertical text on an unrotated page", async () => {
    const r = await runs(
      page("BT /F1 10 Tf 0 1 -1 0 300 100 Tm (Side label) Tj 1 0 0 1 50 50 Tm (Kept) Tj ET"),
    );
    expect(r.map((x) => x.text)).toEqual(["Kept"]);
  });

  it("reads text inside form XObjects and skips inline images", async () => {
    const form = stream(
      "BT /F1 10 Tf 0 0 Td (in form) Tj ET",
      "/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Matrix [1 0 0 1 100 0]",
    );
    const content =
      "BI /W 2 /H 1 /BPC 8 /CS /G ID \x00\x45\x49 EI q 1 0 0 1 0 200 cm /X1 Do Q BT /F1 10 Tf 10 10 Td (after) Tj ET";
    const r = await runs(
      page(content, { xobjects: "/XObject << /X1 6 0 R >>", extra: { 6: form } }),
    );
    expect(r.map((x) => [x.text, Math.round(x.x0), Math.round(x.y)])).toEqual([
      ["in form", 100, 592],
      ["after", 10, 782],
    ]);
  });

  it("stops a form that draws itself after a fixed depth", async () => {
    const form = stream(
      "BT /F1 10 Tf 0 0 Td (x) Tj ET /X1 Do",
      "/Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /Font << /F1 5 0 R >> /XObject << /X1 6 0 R >> >>",
    );
    const r = await runs(
      page("/X1 Do", { xobjects: "/XObject << /X1 6 0 R >>", extra: { 6: form } }),
    );
    expect(r.length).toBe(8);
  });

  it("keeps what a damaged stream showed before the damage", async () => {
    const r = await runs(page("BT /F1 10 Tf 50 700 Td (kept) Tj (unterminated Tj ET"));
    expect(r.map((x) => x.text)).toEqual(["kept"]);
  });
});

describe("extractText: rules and clipping", () => {
  const rules = async (bytes: Uint8Array) => (await extractText(bytes)).pages[0]?.rules ?? [];
  const round = (r: { x0: number; x1: number; y0: number; y1: number }) =>
    [r.x0, r.x1, r.y0, r.y1].map((v) => Math.round(v * 100) / 100);

  it("keeps stroked straight lines and thin filled rectangles, in page coordinates as displayed", async () => {
    const r = await rules(
      page(
        // LibreOffice: a stroked line per border. Chromium: a thin rectangle per cell edge, under a scale.
        "0.5 w 100 700 m 100 600 l S 100 700 m 300 700 l S q 0.5 0 0 0.5 0 0 cm 400 1200 2 200 re f Q",
      ),
    );
    expect(r.map(round)).toEqual([
      [99.75, 100.25, 91.75, 192.25],
      [99.75, 300.25, 91.75, 92.25],
      [200, 201, 92, 192],
    ]);
  });

  it("leaves out white rules, cell backgrounds, curves and paths that are only clipped", async () => {
    const r = await rules(
      page(
        [
          "1 g 300 600 1 100 re f", // white
          "0 g 1 1 1 RG 310 700 m 310 600 l S", // white stroke
          "0 0 0 RG 0 0 612 792 re f", // a background, not thin
          "320 700 m 330 650 340 650 350 600 c S", // a curve
          "360 600 1 100 re W n", // a clip, never painted
        ].join("\n"),
      ),
    );
    expect(r).toEqual([]);
  });

  it("drops the glyphs a rectangular clip hides, and stops clipping at Q", async () => {
    // Helvetica without /Widths: each glyph 6 points wide at 12 points. The clip shows x 72 to 102:
    // the middles of "Descr" (75 to 99) are inside, "iption" outside.
    const r = await runs(
      page(
        "q 72 700 30 20 re W n BT /F1 12 Tf 72 705 Td (Description) Tj ET Q BT /F1 12 Tf 72 680 Td (After) Tj ET",
      ),
    );
    expect(r.map((x) => x.text)).toEqual(["Descr", "After"]);
    expect(r[0]?.x0).toBeCloseTo(72);
    expect(r[0]?.x1).toBeCloseTo(102);
  });

  it("drops text a clip hides entirely, and intersects nested clips", async () => {
    const r = await runs(
      page(
        "q 0 0 612 792 re W n q 72 700 30 20 re W n 100 0 300 792 re W n BT /F1 12 Tf 72 705 Td (Item) Tj ET BT /F1 12 Tf 72 600 Td (Below) Tj ET Q Q",
      ),
    );
    // The second clip leaves x 100 to 102 and y 700 to 720: "Item" ends at 96, "Below" is under it.
    expect(r).toEqual([]);
  });

  it("carries a clip into a form XObject", async () => {
    // Form text at x 100 (Matrix), 6 points a glyph at 12 points; the page's clip ends at x 118.
    const form = stream(
      "BT /F1 12 Tf 0 705 Td (Cut off) Tj ET",
      "/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Matrix [1 0 0 1 100 0]",
    );
    const r = await runs(
      page("q 0 0 118 792 re W n /X1 Do Q", {
        xobjects: "/XObject << /X1 6 0 R >>",
        extra: { 6: form },
      }),
    );
    expect(r.map((x) => x.text)).toEqual(["Cut"]);
  });

  it("bounds a curved clip by its control points, so no text inside it is lost", async () => {
    const r = await runs(
      page("q 60 690 m 60 730 140 730 140 690 c h W n BT /F1 12 Tf 72 705 Td (Shown) Tj ET Q"),
    );
    expect(r.map((x) => x.text)).toEqual(["Shown"]);
  });
});
