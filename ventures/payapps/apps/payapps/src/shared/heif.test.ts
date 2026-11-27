// The HEIF reader on HEICs written by libheif's x265 encoder (test/fixtures/pdf-sources/heic-grid.py):
// a 3 x 2 grid of 256 x 256 tiles cropped to 600 x 400, the same turned (irot) and turned and
// mirrored (imir), one single-image HEIC, and the 64 x 48 EXIF fixture (a clap crop). The decode of
// what this returns is checked in Chromium against libheif by pdf-sources/heic-webcodecs-check.cjs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hevcCodecString, isHeic, orientTransform, parseHeic, tileRect } from "./heif";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url)));

describe("parseHeic", () => {
  it("reads a grid's six tiles in row order, with the grid's output size", () => {
    const img = parseHeic(fixture("heic-grid-libheif.heic"));
    expect(img).not.toBeNull();
    expect(img).toMatchObject({
      codec: "hvc1.3.E.L60.90",
      tileWidth: 256,
      tileHeight: 256,
      width: 600,
      height: 400,
      crop: null,
      rotation: 0,
      mirror: null,
      displayWidth: 600,
      displayHeight: 400,
    });
    expect(img?.tiles.map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [256, 0],
      [512, 0],
      [0, 256],
      [256, 256],
      [512, 256],
    ]);
    // Each tile is length-prefixed NAL units: the first length covers a NAL inside the data.
    for (const t of img?.tiles ?? []) {
      const len = ((t.data[0]! << 24) | (t.data[1]! << 16) | (t.data[2]! << 8) | t.data[3]!) >>> 0;
      expect(len + 4).toBeLessThanOrEqual(t.data.length);
    }
    expect(img?.description[0]).toBe(1);
  });
  it("reads irot and imir as libheif writes EXIF orientations 6 and 5", () => {
    const rot = parseHeic(fixture("heic-grid-rot-libheif.heic"));
    expect(rot).toMatchObject({ rotation: 3, mirror: null, displayWidth: 400, displayHeight: 600 });
    const transposed = parseHeic(fixture("heic-grid-transpose-libheif.heic"));
    expect(transposed).toMatchObject({ rotation: 3, mirror: "left-right" });
  });
  it("reads a single-image HEIC as one tile", () => {
    const img = parseHeic(fixture("heic-single-libheif.heic"));
    expect(img).toMatchObject({ tileWidth: 600, tileHeight: 400, width: 600, height: 400 });
    expect(img?.tiles).toHaveLength(1);
  });
  it("reads a clean-aperture crop", () => {
    // libheif codes 64 x 48 as a 64 x 64 picture with a clap down to 64 x 48.
    const img = parseHeic(fixture("exif-photo-libheif.heic"));
    expect(img).toMatchObject({
      width: 64,
      height: 64,
      crop: { x: 0, y: 0, width: 64, height: 48 },
      displayWidth: 64,
      displayHeight: 48,
    });
  });
  it("returns null for a JPEG, a WebP, an empty file and every truncation of a HEIC", () => {
    expect(parseHeic(fixture("exif-photo-pillow.jpg"))).toBeNull();
    expect(parseHeic(fixture("exif-photo-pillow.webp"))).toBeNull();
    expect(parseHeic(new Uint8Array(0))).toBeNull();
    const b = fixture("heic-grid-libheif.heic");
    for (let n = 0; n < b.length; n += 97) expect(() => parseHeic(b.subarray(0, n))).not.toThrow();
    // Cut inside the tiles' data: the reader says no rather than hand back a short tile.
    expect(parseHeic(b.subarray(0, b.length - 10))).toBeNull();
  });
  it("never throws on a corrupted HEIC", () => {
    const b = fixture("heic-grid-rot-libheif.heic");
    let seed = 7;
    for (let k = 0; k < 400; k++) {
      const c = b.slice();
      for (let j = 0; j < 4; j++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        // Only the header and meta box: flipping bits in tile data is the decoder's problem.
        c[seed % 900] = seed & 255;
      }
      expect(() => parseHeic(c)).not.toThrow();
    }
  });
});

describe("isHeic", () => {
  it("knows a HEIC by its brands", () => {
    expect(isHeic(fixture("heic-single-libheif.heic"))).toBe(true);
    expect(isHeic(fixture("exif-photo-pillow.jpg"))).toBe(false);
  });
});

describe("hevcCodecString", () => {
  it("writes the Main profile string WebCodecs examples use", () => {
    const hvcc = new Uint8Array(23);
    hvcc[0] = 1;
    hvcc[1] = 0x01; // profile space 0, Main tier, profile 1
    hvcc.set([0x60, 0, 0, 0], 2); // compatible with profiles 1 and 2
    hvcc[6] = 0xb0;
    hvcc[12] = 93;
    expect(hevcCodecString(hvcc)).toBe("hvc1.1.6.L93.B0");
    hvcc[1] = 0x22; // High tier, Main 10
    hvcc.set([0x20, 0, 0, 0], 2);
    hvcc[12] = 120;
    expect(hevcCodecString(hvcc)).toBe("hvc1.2.4.H120.B0");
  });
  it("refuses a record that is too short or of another version", () => {
    expect(hevcCodecString(new Uint8Array(10))).toBeNull();
    expect(hevcCodecString(new Uint8Array(23))).toBeNull();
  });
});

describe("tileRect", () => {
  it("lays scaled tiles edge to edge with no gap, and leaves out tiles past the crop", () => {
    const img = parseHeic(fixture("heic-grid-libheif.heic"))!;
    const s = 0.37;
    const rects = img.tiles.map((t) => tileRect(img, t, s, s));
    const row = rects.slice(0, 3);
    expect(row[0]!.x).toBe(0);
    expect(row[1]!.x).toBe(row[0]!.x + row[0]!.width);
    expect(row[2]!.x).toBe(row[1]!.x + row[1]!.width);
    expect(rects[3]!.y).toBe(rects[0]!.y + rects[0]!.height);
    const outside = tileRect(img, { x: 512, y: 0 }, 1, 1);
    expect(outside).not.toBeNull(); // 512..768 overlaps 0..600
    expect(
      tileRect({ ...img, crop: { x: 0, y: 0, width: 500, height: 400 } }, { x: 512, y: 0 }, 1, 1),
    ).toBeNull();
  });
});

describe("orientTransform", () => {
  const apply = (m: number[], x: number, y: number) => [
    m[0]! * x + m[2]! * y + m[4]!,
    m[1]! * x + m[3]! * y + m[5]!,
  ];
  it("turns anticlockwise a quarter at a time", () => {
    // 60 x 40 picture; one quarter turn anticlockwise: the top-right corner goes to the top left.
    const m = orientTransform(60, 40, 1, null);
    expect(apply(m, 60, 0)).toEqual([0, 0]);
    expect(apply(m, 0, 0)).toEqual([0, 60]);
    // Three quarter turns (EXIF 6, 90 degrees clockwise): the top-left corner goes to the top right.
    const r3 = orientTransform(60, 40, 3, null);
    expect(apply(r3, 0, 0)).toEqual([40, 0]);
    expect(apply(r3, 0, 40)).toEqual([0, 0]);
    const r2 = orientTransform(60, 40, 2, null);
    expect(apply(r2, 0, 0)).toEqual([60, 40]);
  });
  it("mirrors after turning: irot 3 then imir left-right is a transpose (EXIF 5)", () => {
    const m = orientTransform(60, 40, 3, "left-right");
    expect(apply(m, 0, 0)).toEqual([0, 0]);
    expect(apply(m, 60, 0)).toEqual([0, 60]);
    expect(apply(m, 0, 40)).toEqual([40, 0]);
    expect(apply(orientTransform(60, 40, 0, "top-bottom"), 0, 0)).toEqual([0, 40]);
  });
});
