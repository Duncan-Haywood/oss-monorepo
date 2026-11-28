// Drawing zones: the border's zone labels read from a real Chromium-printed two-sheet drawing
// (test/fixtures/pdf/zoned-drawing-chrome.pdf: sheet 1 zoned ASME-style, letters from the bottom up
// and numbers from the right; sheet 2 ISO-style, letters from the top down and numbers from the
// left), and from small hand-made layouts for the cases a border can get wrong.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { zoneAt, zoneGrid, zoneReader } from "./drawing-zones";
import { balloonDrawing, zonesByNo } from "./fai-balloons";
import { draftCharacteristics } from "./fai-characteristics";
import { extractPdfText, type PdfLayout, readPdfLayout, type TextRun } from "./pdf-text";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../test/fixtures/pdf/${name}`, import.meta.url)));

describe("zoneGrid on a Chromium-printed zoned drawing", () => {
  it("reads both borders' labels in their own direction", async () => {
    const layout = (await readPdfLayout(fixture("zoned-drawing-chrome.pdf"))) as PdfLayout;
    const asme = zoneGrid(layout, 0);
    // Page space runs bottom-up and left to right: ASME letters A at the bottom, numbers 1 at the right.
    expect(asme?.rows.labels).toEqual(["A", "B", "C", "D"]);
    expect(asme?.cols.labels).toEqual(["8", "7", "6", "5", "4", "3", "2", "1"]);
    const iso = zoneGrid(layout, 1);
    expect(iso?.rows.labels).toEqual(["F", "E", "D", "C", "B", "A"]);
    expect(iso?.cols.labels).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    // The title block's "REV A" and "SHEET 1 OF 2" are not labels.
    expect(asme?.rows.labels.filter((l) => l === "A")).toHaveLength(1);
  });

  it("names each characteristic's zone with its sheet, for Form 3's Reference Location", async () => {
    const pdf = fixture("zoned-drawing-chrome.pdf");
    const text = (await extractPdfText(pdf)) ?? "";
    const draft = draftCharacteristics(text);
    const res = await balloonDrawing(pdf, text);
    if (!res) throw new Error("no result");
    const zones = zonesByNo(draft, res);
    const zoneOf = (start: string) => {
      const c = draft.characteristics.find((x) => x.requirement.startsWith(start));
      return c ? zones[c.no] : undefined;
    };
    expect(zoneOf("4.000")).toBe("SH1 D7");
    expect(zoneOf("2X Ø.250")).toBe("SH1 B3");
    expect(zoneOf("1/4-20")).toBe("SH1 C4");
    expect(zoneOf("FLATNESS")).toBe("SH2 A2");
    expect(zoneOf("Ra 63")).toBe("SH2 E7");
    expect(zoneOf("12.00")).toBe("SH2 C4");
    // Both rows of the 2X hole share the callout's zone.
    const holes = draft.characteristics.filter((c) => c.requirement.startsWith("2X Ø.250"));
    expect(holes.length).toBe(2);
    expect(holes.map((c) => zones[c.no])).toEqual(["SH1 B3", "SH1 B3"]);
  });

  it("gives no zone on a drawing without a zoned border", async () => {
    const pdf = fixture("bracket-drawing-chrome.pdf");
    const text = (await extractPdfText(pdf)) ?? "";
    const res = await balloonDrawing(pdf, text);
    expect(res?.placements.length).toBeGreaterThan(0);
    expect(res?.placements.every((p) => p.zone === null)).toBe(true);
    expect(zonesByNo(draftCharacteristics(text), res ?? { placements: [], unplaced: [] })).toEqual(
      {},
    );
  });
});

/** A run of one label centred at (x, y), 10 pt upright text. */
const run = (text: string, x: number, y: number, page = 0): TextRun => ({
  page,
  line: 0,
  text,
  x0: x - 3,
  x1: x + 3,
  y0: y - 5,
  y1: y - 5,
  size: 10,
  upX: 0,
  upY: 1,
});
const layoutOf = (runs: TextRun[], pages = 1): PdfLayout => ({
  objects: new Map(),
  pages: Array.from({ length: pages }, (_, i) => ({
    num: i + 1,
    mediaBox: [0, 0, 792, 612] as [number, number, number, number],
    rotate: 0,
  })),
  runs,
});
/** A border: letters at x = 15 down the left, numbers at y = 600 along the top. */
const border = (letters: string[], numbers: string[], extra: TextRun[] = []) => {
  const runs: TextRun[] = [
    ...letters.map((l, i) => run(l, 15, 60 + i * 100)),
    ...numbers.map((n, i) => run(n, 60 + i * 100, 600)),
  ];
  return layoutOf([...runs, ...extra]);
};

describe("zoneGrid on hand-made borders", () => {
  it("names a point by the nearest label on each axis, letter first", () => {
    const grid = zoneGrid(border(["A", "B", "C", "D"], ["1", "2", "3", "4", "5"]), 0);
    if (!grid) throw new Error("no grid");
    expect(zoneAt(grid, 60, 60)).toBe("A1");
    expect(zoneAt(grid, 255, 215)).toBe("C3");
    // Midway between B and C (y = 210) goes to the nearer; beyond the last label stays in it.
    expect(zoneAt(grid, 700, 211)).toBe("C5");
    expect(zoneAt(grid, 790, 10)).toBe("A5");
  });

  it("reads a border that skips I and O", () => {
    const grid = zoneGrid(border(["G", "H", "J", "K"], ["1", "2", "3"]), 0);
    expect(grid?.rows.labels).toEqual(["G", "H", "J", "K"]);
  });

  it("gives no grid with fewer than three labels, out-of-order labels or uneven spacing", () => {
    expect(zoneGrid(border(["A", "B"], ["1", "2", "3"]), 0)).toBeNull();
    expect(zoneGrid(border(["A", "C", "B", "D"], ["1", "2", "3"]), 0)).toBeNull();
    const uneven = layoutOf([
      run("A", 15, 60),
      run("B", 15, 80),
      run("C", 15, 300),
      ...["1", "2", "3"].map((n, i) => run(n, 60 + i * 100, 600)),
    ]);
    expect(zoneGrid(uneven, 0)).toBeNull();
  });

  it("ignores letters and numbers away from the edges (a callout's datum letters, a note's number)", () => {
    const grid = zoneGrid(
      border(["A", "B", "C"], ["1", "2", "3"], [run("D", 400, 300), run("4", 400, 320)]),
      0,
    );
    expect(grid?.rows.labels).toEqual(["A", "B", "C"]);
    expect(grid?.cols.labels).toEqual(["1", "2", "3"]);
  });

  it("prefixes the sheet only on a file with more than one page", () => {
    const one = zoneReader(border(["A", "B", "C"], ["1", "2", "3"]));
    expect(one(0, 60, 60)).toBe("A1");
    const two = zoneReader({
      ...border(["A", "B", "C"], ["1", "2", "3"]),
      pages: layoutOf([], 2).pages,
    });
    expect(two(0, 60, 60)).toBe("SH1 A1");
    expect(two(1, 60, 60)).toBeNull();
  });
});
