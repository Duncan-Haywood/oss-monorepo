import { describe, expect, it } from "vitest";
import { makeJpegHeader, makePng } from "../../../test/fixtures/images";
import { buildPdf } from "./pdf";
import { fitInside, ImageUnreadable, MAX_LOGO_BYTES, readLogo, sniffLogo } from "./pdf-image";

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("readLogo", () => {
  it("reads an RGB PNG as Flate rows with the PNG predictor, kept as they are", async () => {
    const png = await makePng(3, 2, [200, 30, 30]);
    expect(sniffLogo(png)).toBe("image/png");
    const img = await readLogo(png);
    expect(img).toMatchObject({ width: 3, height: 2, orientation: 1 });
    expect(img.entries).toContain("/DeviceRGB");
    expect(img.entries).toContain("/Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 3");
    expect(img.smask).toBeUndefined();
  });

  it("splits a transparent PNG's alpha into a soft mask", async () => {
    const img = await readLogo(await makePng(2, 2, [0, 0, 0, 128]));
    expect(img.entries).toContain("/DeviceRGB");
    expect(img.entries).not.toContain("/Predictor");
    expect(img.smask?.entries).toContain("/DeviceGray");
  });

  it("reads a JPEG's size and colour model and embeds it as DCT", async () => {
    const jpg = makeJpegHeader(640, 160);
    expect(sniffLogo(jpg)).toBe("image/jpeg");
    const img = await readLogo(jpg);
    expect(img).toMatchObject({ width: 640, height: 160 });
    expect(img.entries).toContain("/DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode");
    expect(img.data).toBe(jpg);
  });

  it("refuses what is not a PNG or JPEG, whatever its name would say", async () => {
    for (const bytes of [
      new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      new TextEncoder().encode("GIF89a...."),
      new TextEncoder().encode("%PDF-1.4"),
    ]) {
      expect(sniffLogo(bytes)).toBeNull();
      await expect(readLogo(bytes)).rejects.toThrow("is not a PNG or JPEG image");
    }
  });

  it("refuses files over 1 MB and images over 4 megapixels before unpacking them", async () => {
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    await expect(readLogo(big)).rejects.toThrow("larger than 1 MB");
    // The IHDR says 3000 x 3000 (9 MP); the check reads it before inflating anything.
    const huge = await makePng(1, 1, [0, 0, 0], { declaredWidth: 3000, declaredHeight: 3000 });
    await expect(readLogo(huge)).rejects.toThrow("at most 4 megapixels");
    await expect(readLogo(makeJpegHeader(6000, 100))).rejects.toThrow("at most 4 megapixels");
  });

  it("refuses a 16-bit PNG, which PDF 1.4 cannot carry", async () => {
    const deep = await makePng(1, 1, [0, 0, 0], { depth: 16 });
    await expect(readLogo(deep)).rejects.toBeInstanceOf(ImageUnreadable);
    await expect(readLogo(deep)).rejects.toThrow("8-bit PNG");
  });
});

describe("fitInside", () => {
  it("keeps the shape inside the box", () => {
    expect(fitInside(640, 160, 180, 54)).toEqual({ width: 180, height: 45 });
    expect(fitInside(100, 100, 180, 54)).toEqual({ width: 54, height: 54 });
  });
});

describe("buildPdf with an image", () => {
  it("writes the image XObject, its soft mask, and a Do in the page stream; offsets stay right", async () => {
    const logo = await readLogo(await makePng(4, 2, [10, 20, 30, 255]));
    const pdf = latin1(
      buildPdf(
        [
          [
            { kind: "image", index: 0, x: 54, y: 700, width: 100, height: 50 },
            { kind: "text", x: 54, y: 680, text: "Acme" },
          ],
          [{ kind: "text", x: 54, y: 700, text: "page 2" }],
        ],
        "Quote",
        [logo],
      ),
    );
    expect(pdf).toContain("/Subtype /Image /Width 4 /Height 2");
    expect(pdf).toMatch(/\/SMask \d+ 0 R/);
    expect(pdf).toContain("q 100 0 0 50 54 700 cm /Im0 Do Q");
    expect(pdf.match(/\/XObject << \/Im0 \d+ 0 R >>/g)).toHaveLength(2);
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    const entries = pdf
      .slice(startxref)
      .split("\n")
      .slice(3)
      .filter((l) => / n $/.test(l));
    entries.forEach((e, i) => {
      const off = Number(e.slice(0, 10));
      expect(pdf.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    for (const m of pdf.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const start = (m.index ?? 0) + m[0].length;
      expect(pdf.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
    }
  });

  it("turns a JPEG by its EXIF orientation (6: rotate 90 degrees clockwise)", () => {
    const img = {
      width: 40,
      height: 20,
      orientation: 6,
      entries: "/Filter /DCTDecode",
      data: new Uint8Array([1]),
    };
    const pdf = latin1(
      buildPdf([[{ kind: "image", index: 0, x: 10, y: 100, width: 20, height: 40 }]], "Q", [img]),
    );
    // displayed X = b, displayed Y = 1 - a, scaled to the 20 x 40 box at (10, 100).
    expect(pdf).toContain("q 0 -40 20 0 10 140 cm /Im0 Do Q");
  });

  it("writes no XObject resources without images (quotes from shops with no logo are unchanged)", () => {
    const pdf = latin1(buildPdf([[{ kind: "text", x: 1, y: 1, text: "x" }]]));
    expect(pdf).not.toContain("/XObject");
  });
});
