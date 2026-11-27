// Scans with no text layer (pictures only), read by OCR. The real files are bid-breakdown-scan-tilted-more.pdf's
// page pictures with its text layer left out (test/fixtures/README.md, "Scan fixtures"), read by the same
// Tesseract build the browser runs (tesseract.js, in Node here); the rest use a fake engine.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { linesFromTesseract, type TesseractBlock } from "@client/lib/ocr";
import { ccittTiff, imageForOcr, type OcrImage } from "@shared/pdf/images";
import { PdfDict, PdfName, PdfStream, PdfString } from "@shared/pdf/objects";
import { PdfReader } from "@shared/pdf/reader";
import { extractText, type TextRun } from "@shared/pdf/text";
import { afterAll, describe, expect, it } from "vitest";
import { importSovFile } from "./index";
import {
  fixDottedThousands,
  type Ocr,
  type OcrLine,
  ocrText,
  runsFromOcr,
  unturnHalf,
} from "./ocr";

const fixture = (n: string) =>
  new Uint8Array(readFileSync(new URL(`../../../test/fixtures/${n}`, import.meta.url)));

// The engine in Node: the same WebAssembly build and English model the app serves under /ocr/.
const require = createRequire(import.meta.url);
const langPath = `${dirname(require.resolve("@tesseract.js-data/eng/package.json"))}/4.0.0_best_int`;
let engine: Promise<Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>> | null =
  null;
const tesseract: Ocr = async ({ image, dpi, upsideDown }) => {
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  engine ??= createWorker("eng", OEM.LSTM_ONLY, { langPath, cacheMethod: "none", gzip: true });
  const w = await engine;
  await w.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    user_defined_dpi: String(dpi),
    preserve_interword_spaces: "1",
  });
  const r = await w.recognize(
    Buffer.from(image.bytes),
    upsideDown ? { rotateRadians: Math.PI } : {},
    { blocks: true, text: false },
  );
  return linesFromTesseract(r.data.blocks as unknown as TesseractBlock[]);
};
afterAll(async () => {
  if (engine) await (await engine).terminate();
});

describe("scans with no text layer, read by Tesseract", () => {
  // The same bid breakdown as bid-breakdown-chrome.pdf: 48 lines, $1,120,223.00, tilted 1.5 degrees.
  for (const [name, kind] of [
    ["sov-scan-pictures-jpeg.pdf", "grey JPEG pages"],
    ["sov-scan-pictures-g4.pdf", "black-and-white CCITT Group 4 pages"],
  ] as const) {
    it(`reads every line and the sheet's total from ${kind}`, { timeout: 120_000 }, async () => {
      const pages: number[] = [];
      const r = await importSovFile(name, fixture(name), {
        ocr: tesseract,
        onOcrProgress: (page, of) => pages.push(page, of),
      });
      if (!r.ok) throw new Error(r.error);
      expect(pages).toEqual([1, 2, 2, 2]);
      expect(r.scanned).toBe(true);
      expect(r.notes[0]).toMatch(/^Read from the scan's pictures by OCR in your browser/);
      // Every line and the sheet's own total, through whatever this Tesseract build misreads.
      expect(r.lines).toHaveLength(48);
      expect(r.totalCents).toBe(112_022_300);
      expect(r.lines[0]).toMatchObject({
        description: "Mobilization, bonds and insurance",
        originalCents: 1_850_000,
      });
      expect(r.lines[47]?.originalCents).toBe(4_625_050);
      expect(r.checks).toEqual([]);
      if (kind === "grey JPEG pages") {
        // Item numbers come through, with an OCR slip: the first one's spaces are lost.
        expect(r.lines[0]?.itemNumber).toBe("011000");
        expect(r.lines[2]?.itemNumber).toBe("26 01 00");
      } else {
        // The comma in $9,200.00 read as a full stop, put right and said so; the cost-code column
        // reads too unevenly to be a column ("011000", "26 0100", "26 02 00"), so lines are numbered.
        expect(r.lines[1]?.originalCents).toBe(920_000);
        expect(r.notes).toContain(
          "One amount was read as 9.200.00, the comma before the thousands read as a full stop: no amount is written that way, so it was read with the comma. Check it on the paper.",
        );
        expect(r.notes).toContain("48 lines had no item number and were numbered in order.");
      }
    });
  }
});

describe("a scan on its side, read by Tesseract", () => {
  it("reads a page on its side and a picture stored on its side", {
    timeout: 180_000,
  }, async () => {
    // sov-scan-pictures-g4.pdf's pages turned: page 1 shows the sheet on its side (text running
    // down, which Tesseract reads as it is); page 2's picture holds it the other way (text running
    // up, read half turned) and is placed upright on the page.
    const turns: boolean[] = [];
    const engine: Ocr = (r) => {
      turns.push(r.upsideDown === true);
      return tesseract(r);
    };
    const r = await importSovFile(
      "sov-scan-pictures-sideways.pdf",
      fixture("sov-scan-pictures-sideways.pdf"),
      { ocr: engine },
    );
    if (!r.ok) throw new Error(r.error);
    expect(turns).toEqual([false, false, true]);
    expect(r.lines).toHaveLength(48);
    expect(r.totalCents).toBe(112_022_300);
    expect(r.lines[0]).toMatchObject({
      description: "Mobilization, bonds and insurance",
      originalCents: 1_850_000,
    });
    expect(r.lines[47]?.originalCents).toBe(4_625_050);
    expect(r.checks).toEqual([]);
    expect(r.notes).toContain(
      "Page 1 of the scan lies on its side or upside down, so it was read turned the right way up.",
    );
  });
});

describe("a read the engine is unsure of", () => {
  // A one-line sheet the fake engine reads only when asked to turn the picture.
  const sheet: OcrLine[] = [
    {
      baseline: { x0: 100, y0: 400, x1: 2000, y1: 400 },
      rowHeight: 40,
      words: [
        { text: "Total", x0: 100, y0: 370, x1: 300, y1: 410, confidence: 95 },
        { text: "$1,120,223.00", x0: 1500, y0: 370, x1: 2000, y1: 410, confidence: 95 },
      ],
    },
  ];
  const garbage: OcrLine[] = [
    {
      baseline: { x0: 0, y0: 100, x1: 900, y1: 100 },
      rowHeight: 40,
      words: [{ text: "00'€2Z'0Z1'T$", x0: 0, y0: 70, x1: 900, y1: 110, confidence: 30 }],
    },
  ];

  it("reads it again half turned, keeps the surer read, and puts its boxes back", async () => {
    const asked: boolean[] = [];
    let size: [number, number] = [0, 0];
    const text = await extractText(fixture("sov-scan-pictures-jpeg.pdf"));
    const r = await ocrText({ ...text, pages: text.pages.slice(0, 1) }, async (q) => {
      asked.push(q.upsideDown === true);
      size = [q.image.width, q.image.height];
      return q.upsideDown ? sheet : garbage;
    });
    expect(asked).toEqual([false, true]);
    if (!r.ok) throw new Error(r.error);
    // Half turned back, the line runs right to left in the picture: the page is upside down.
    expect(r.turnedPages).toEqual([1]);
    expect(r.text.pages[0]?.runs.map((x) => x.text)).toEqual(["Total ", "$1,120,223.00 "]);
    expect(unturnHalf(sheet, ...size)[0]?.words[0]).toMatchObject({
      x0: size[0] - 300,
      x1: size[0] - 100,
      y0: size[1] - 410,
    });
  });

  it("asks once when the engine is sure, or says nothing of how sure it is", async () => {
    const text = await extractText(fixture("sov-scan-pictures-jpeg.pdf"));
    for (const lines of [
      sheet,
      sheet.map((l) => ({ ...l, words: l.words.map(({ confidence: _, ...w }) => w) })),
    ]) {
      let asked = 0;
      await ocrText({ ...text, pages: text.pages.slice(0, 1) }, async () => {
        asked++;
        return lines;
      });
      expect(asked).toBe(1);
    }
  });
});

describe("scans with no text layer, without an engine", () => {
  it("still says to save a searchable PDF (the worker and tests pass no engine)", async () => {
    const r = await importSovFile("s.pdf", fixture("sov-scan-pictures-jpeg.pdf"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no text layer/);
  });
});

describe("page pictures as files for OCR", () => {
  it("finds each page's picture and where it is placed", async () => {
    const text = await extractText(fixture("sov-scan-pictures-g4.pdf"));
    expect(text.chars).toBe(0);
    expect(text.pages.map((p) => p.images?.length)).toEqual([1, 1]);
    const img = await text.pages[0]?.images?.[0]?.read();
    expect(img).toMatchObject({ format: "tiff", width: 2638, height: 3368 });
    // Little-endian TIFF, Group 4, shown as coded (WhiteIsZero).
    const t = img as OcrImage;
    expect([...t.bytes.subarray(0, 4)]).toEqual([0x49, 0x49, 42, 0]);
    const jpeg = await (
      await extractText(fixture("sov-scan-pictures-jpeg.pdf"))
    ).pages[1]?.images?.[0]?.read();
    expect(jpeg).toMatchObject({ format: "jpeg", width: 2638, height: 3368 });
    expect([...(jpeg as OcrImage).bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });

  const reader = PdfReader.open(fixture("sov-scan-pictures-jpeg.pdf"));
  const image = (entries: Record<string, unknown>, data: number[]) => {
    const d = new PdfDict();
    for (const [k, v] of Object.entries(entries))
      d.set(k, typeof v === "string" ? new PdfName(v) : (v as never));
    return new PdfStream(d, Uint8Array.from(data));
  };
  const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

  it("writes grey samples as a PGM and one-bit samples as a PBM (1 is black there)", async () => {
    const r = await reader;
    const grey = await imageForOcr(
      r,
      image({ Width: 2, Height: 1, ColorSpace: "DeviceGray", BitsPerComponent: 8 }, [0, 255]),
    );
    expect(grey).toMatchObject({ format: "pnm", width: 2, height: 1 });
    expect(text((grey as OcrImage).bytes)).toBe("P5\n2 1\n255\n\x00\xff");
    // PDF grey: bit 0 black. Two rows of 3 pixels: black white black, then white white white.
    const bits = await imageForOcr(
      r,
      image(
        { Width: 3, Height: 2, ColorSpace: "DeviceGray", BitsPerComponent: 1 },
        [0b01000000, 0b11100000],
      ),
    );
    expect([...(bits as OcrImage).bytes.subarray(-2)]).toEqual([0b10100000, 0b00000000]);
  });

  it("looks colours up in an indexed palette, and turns CMYK into RGB", async () => {
    const r = await reader;
    const idx = await imageForOcr(
      r,
      image(
        {
          Width: 2,
          Height: 1,
          ColorSpace: [
            new PdfName("Indexed"),
            new PdfName("DeviceRGB"),
            1,
            new PdfString(Uint8Array.from([255, 0, 0, 0, 0, 255])),
          ],
          BitsPerComponent: 8,
        },
        [1, 0],
      ),
    );
    expect(text((idx as OcrImage).bytes)).toBe("P6\n2 1\n255\n\x00\x00\xff\xff\x00\x00");
    const cmyk = await imageForOcr(
      r,
      image({ Width: 1, Height: 1, ColorSpace: "DeviceCMYK", BitsPerComponent: 8 }, [0, 0, 0, 255]),
    );
    expect(text((cmyk as OcrImage).bytes)).toBe("P6\n1 1\n255\n\x00\x00\x00");
  });

  it("says which pictures it cannot read, and never throws", async () => {
    const r = await reader;
    expect(
      await imageForOcr(r, image({ Width: 9, Height: 9, Filter: "JBIG2Decode" }, [1, 2, 3])),
    ).toEqual({ unreadable: "the picture is JBIG2" });
    expect(
      await imageForOcr(r, image({ Width: 9, Height: 9, Filter: "JPXDecode" }, [1, 2, 3])),
    ).toEqual({ unreadable: "the picture is JPEG 2000" });
    expect(
      await imageForOcr(
        r,
        image({ Width: 9, Height: 9, Filter: "FlateDecode", ColorSpace: "DeviceGray" }, [1, 2]),
      ),
    ).toHaveProperty("unreadable");
    expect(await imageForOcr(r, image({ Width: 100_000, Height: 100_000 }, []))).toHaveProperty(
      "unreadable",
    );
  });

  it("wraps CCITT data in a TIFF whose photometric shows black as black", () => {
    const photometric = (t: Uint8Array) => {
      const v = new DataView(t.buffer);
      for (let i = 0; i < v.getUint16(8, true); i++)
        if (v.getUint16(10 + i * 12, true) === 262) return v.getUint16(18 + i * 12, true);
    };
    expect(photometric(ccittTiff(Uint8Array.of(0), 8, 8, -1, false, false))).toBe(0);
    expect(photometric(ccittTiff(Uint8Array.of(0), 8, 8, -1, true, false))).toBe(1);
  });
});

describe("amounts OCR wrote with full stops for commas", () => {
  it("puts right only the form no locale writes", () => {
    expect(fixDottedThousands("9.200.00")).toBe("9,200.00");
    expect(fixDottedThousands("$1.120.223.00")).toBe("$1,120,223.00");
    for (const w of ["9.200,00", "9,200.00", "9.20", "1.5", "26.01.00", "9.2000.00", "item"])
      expect(fixDottedThousands(w)).toBeNull();
  });
});

describe("words placed on the page", () => {
  const line = (words: [string, number, number][], y: number): OcrLine => ({
    baseline: { x0: 0, y0: y, x1: 1000, y1: y },
    rowHeight: 40,
    words: words.map(([text, x0, x1]) => ({ text, x0, x1, y0: y - 30, y1: y + 10 })),
  });

  it("maps pixels to points through the picture's placement", () => {
    // A 1000 x 2000 pixel picture drawn 500 x 1000 points, its top-left at (50, 20) on the page as displayed.
    const m: [number, number, number, number, number, number] = [500, 0, 0, -1000, 50, 1020];
    const runs = runsFromOcr(
      [
        line(
          [
            ["Drywall", 100, 300],
            ["", 310, 320],
            ["$8,500.00", 600, 900],
          ],
          400,
        ),
      ],
      m,
      1000,
      2000,
    );
    expect(runs).toEqual([
      { x0: 100, x1: 200, y: 220, size: 20, text: "Drywall " },
      { x0: 350, x1: 500, y: 220, size: 20, text: "$8,500.00 " },
    ]);
  });

  it("leaves out a word that runs another way than the rest of the page (a stamp on its side)", () => {
    const m: [number, number, number, number, number, number] = [500, 0, 0, -1000, 50, 1020];
    const stamp: OcrLine = {
      baseline: { x0: 900, y0: 100, x1: 900, y1: 300 },
      rowHeight: 40,
      words: [{ text: "PAID", x0: 870, y0: 100, x1: 910, y1: 300 }],
    };
    const runs = runsFromOcr([line([["Drywall", 100, 300]], 400), stamp], m, 1000, 2000);
    expect(runs.map((r) => r.text)).toEqual(["Drywall "]);
  });

  // The level page above, as each of the ways a scan comes: its words must land where they do there
  // (to a thousandth of a point: turning a page adds floating-point noise).
  const rounded = (runs: TextRun[]) =>
    runs.map((r) => ({ ...r, x0: +r.x0.toFixed(3), x1: +r.x1.toFixed(3), y: +r.y.toFixed(3) }));
  const level = runsFromOcr(
    [
      line(
        [
          ["Drywall", 100, 300],
          ["$8,500.00", 600, 900],
        ],
        400,
      ),
    ],
    [500, 0, 0, -1000, 0, 1000],
    1000,
    2000,
  );

  it("reads a picture stored on its side and placed upright as the level page", () => {
    // The picture is 2000 x 1000 pixels, the sheet turned a quarter anticlockwise in it (its lines
    // run up the picture), and placed turned a quarter clockwise, so the page shows it upright.
    const words: OcrLine = {
      baseline: { x0: 400, y0: 1000, x1: 400, y1: 0 },
      rowHeight: 40,
      words: [
        { text: "Drywall", x0: 370, y0: 700, x1: 410, y1: 900 },
        { text: "$8,500.00", x0: 370, y0: 100, x1: 410, y1: 400 },
      ],
    };
    const fixed = { dottedThousands: [], turnedPages: [] as number[] };
    const runs = runsFromOcr([words], [0, 1000, 500, 0, 0, 0], 2000, 1000, fixed, 1);
    expect(rounded(runs)).toEqual(level);
    expect(fixed.turnedPages).toEqual([]);
  });

  it("turns a page whose sheet lies on its side, as a person turns the paper", () => {
    // The picture is 2000 x 1000 pixels, placed as it is: the sheet's lines run down the page.
    const words: OcrLine = {
      baseline: { x0: 1600, y0: 0, x1: 1600, y1: 1000 },
      rowHeight: 40,
      words: [
        { text: "Drywall", x0: 1590, y0: 100, x1: 1630, y1: 300 },
        { text: "$8,500.00", x0: 1590, y0: 600, x1: 1630, y1: 900 },
      ],
    };
    const fixed = { dottedThousands: [], turnedPages: [] as number[] };
    const runs = runsFromOcr([words], [1000, 0, 0, -500, 0, 500], 2000, 1000, fixed, 3);
    expect(rounded(runs)).toEqual(level);
    expect(fixed.turnedPages).toEqual([3]);
  });

  it("turns an upside-down page", () => {
    const words: OcrLine = {
      baseline: { x0: 1000, y0: 1600, x1: 0, y1: 1600 },
      rowHeight: 40,
      words: [
        { text: "Drywall", x0: 700, y0: 1590, x1: 900, y1: 1630 },
        { text: "$8,500.00", x0: 100, y0: 1590, x1: 400, y1: 1630 },
      ],
    };
    const fixed = { dottedThousands: [], turnedPages: [] as number[] };
    expect(
      rounded(runsFromOcr([words], [500, 0, 0, -1000, 0, 1000], 1000, 2000, fixed, 2)),
    ).toEqual(level);
    expect(fixed.turnedPages).toEqual([2]);
  });

  it("follows a tilted baseline, so the reader can level the page as it does a searchable scan", () => {
    const m: [number, number, number, number, number, number] = [1000, 0, 0, -1000, 0, 1000];
    const tilted: OcrLine = {
      ...line(
        [
          ["A", 0, 100],
          ["B", 900, 1000],
        ],
        0,
      ),
      baseline: { x0: 0, y0: 500, x1: 1000, y1: 520 },
    };
    const [a, b] = runsFromOcr([tilted], m, 1000, 1000);
    expect(a?.y).toBe(500);
    expect(b?.y).toBe(518);
  });
});

describe("the engine's failures", () => {
  it("an engine that does not load says to check the connection", async () => {
    const r = await importSovFile("s.pdf", fixture("sov-scan-pictures-jpeg.pdf"), {
      ocr: async () => {
        throw new Error("offline");
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/did not load/);
  });

  it("a page the engine reads nothing from says to rescan", async () => {
    const r = await importSovFile("s.pdf", fixture("sov-scan-pictures-jpeg.pdf"), {
      ocr: async () => [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No text could be read from this scan/);
  });
});
