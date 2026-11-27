// The capture time carried into a shrunk photo (shared/photo-exif.ts). The fixture's EXIF was written
// by Pillow, not by us (test/fixtures/pdf-sources/exif-photo-pillow.py), little-endian as Android
// phones write it; our own segment is big-endian, as iPhones write it, so both byte orders are read.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readJpeg } from "../worker/services/export/pdf-merge/images";
import {
  captureTimeSegment,
  exifBody,
  heifExif,
  insertSegment,
  photoCaptureTime,
  readCaptureTime,
  webpExif,
} from "./photo-exif";

const fixture = () =>
  new Uint8Array(
    readFileSync(new URL("../../test/fixtures/exif-photo-pillow.jpg", import.meta.url)),
  );

/** A canvas-style JPEG: SOI, JFIF APP0, SOF0 (width x height, 3 components), SOS, EOI. */
function canvasJpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof = [0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3];
  for (let c = 1; c <= 3; c++) sof.push(c, 0x11, 0);
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

const text = (b: Uint8Array) => String.fromCharCode(...b);

describe("readCaptureTime", () => {
  it("reads the times a phone writes, in Pillow's little-endian EXIF", () => {
    expect(readCaptureTime(fixture())).toEqual({
      dateTimeOriginal: "2026:11:25 14:05:09",
      offsetTimeOriginal: "-05:00",
      dateTime: "2026:11:25 14:05:12",
    });
  });
  it("is null for a JPEG with no EXIF, for other bytes, and for a blank camera clock", () => {
    expect(readCaptureTime(canvasJpeg(10, 10))).toBeNull();
    expect(readCaptureTime(new Uint8Array([1, 2, 3]))).toBeNull();
    const blank = captureTimeSegment({
      dateTimeOriginal: "0000:00:00 00:00:00",
      offsetTimeOriginal: null,
      dateTime: null,
    });
    expect(
      readCaptureTime(insertSegment(canvasJpeg(4, 4), blank as Uint8Array) as Uint8Array),
    ).toBeNull();
  });
  it("survives a truncated or self-pointing EXIF block without throwing", () => {
    const f = fixture();
    for (let cut = 4; cut < 300; cut += 7) {
      expect(() => readCaptureTime(f.subarray(0, cut))).not.toThrow();
    }
    const body = exifBody(f) as Uint8Array;
    const broken = f.slice();
    // Point IFD 0 past the end of the block.
    const at = f.indexOf(body[0] as number, 2) + 6 + 4;
    broken.set([0xff, 0xff, 0xff, 0x7f], at);
    expect(() => readCaptureTime(broken)).not.toThrow();
  });
});

describe("captureTimeSegment and insertSegment", () => {
  it("writes only the time into a canvas JPEG, readable by us and by the packet's JPEG reader", () => {
    const time = readCaptureTime(fixture());
    const seg = captureTimeSegment(time as NonNullable<typeof time>) as Uint8Array;
    const out = insertSegment(canvasJpeg(2560, 1920), seg) as Uint8Array;
    expect(readCaptureTime(out)).toEqual(time);
    // After the JFIF APP0, before the frame header.
    expect(out[20]).toBe(0xff);
    expect(out[21]).toBe(0xe1);
    // Upright as drawn: no orientation tag, so the packet places it as stored.
    const img = readJpeg(out);
    expect(img).toMatchObject({ width: 2560, height: 1920, orientation: 1 });
    // Nothing but the time: no camera name, no GPS pointer.
    const body = text(exifBody(out) as Uint8Array);
    expect(body).not.toContain("Example");
    expect(body.includes(String.fromCharCode(0x88, 0x25))).toBe(false);
  });
  it("writes DateTime alone when a camera wrote no DateTimeOriginal", () => {
    const seg = captureTimeSegment({
      dateTimeOriginal: null,
      offsetTimeOriginal: null,
      dateTime: "2026:01:02 03:04:05",
    }) as Uint8Array;
    const out = insertSegment(canvasJpeg(8, 8), seg) as Uint8Array;
    expect(readCaptureTime(out)).toEqual({
      dateTimeOriginal: null,
      offsetTimeOriginal: null,
      dateTime: "2026:01:02 03:04:05",
    });
  });
  it("writes nothing without a time, and refuses bytes that are not a JPEG", () => {
    expect(
      captureTimeSegment({ dateTimeOriginal: null, offsetTimeOriginal: null, dateTime: null }),
    ).toBeNull();
    expect(
      insertSegment(new Uint8Array([0x89, 0x50]), new Uint8Array([0xff, 0xe1, 0, 2])),
    ).toBeNull();
  });
  it("replaces EXIF already in the JPEG rather than adding a second block", () => {
    const seg = captureTimeSegment({
      dateTimeOriginal: "2025:05:06 07:08:09",
      offsetTimeOriginal: "+01:00",
      dateTime: null,
    }) as Uint8Array;
    const out = insertSegment(fixture(), seg) as Uint8Array;
    expect(readCaptureTime(out)?.dateTimeOriginal).toBe("2025:05:06 07:08:09");
    let count = 0;
    for (let i = 0; i + 1 < 400 && i < out.length; i++)
      if (out[i] === 0xff && out[i + 1] === 0xe1) count++;
    expect(count).toBe(1);
    expect(readJpeg(out).orientation).toBe(1);
  });
});

// HEIC and WebP photos being converted to JPEG (Attachments part 4). Their EXIF was written by
// libheif (pillow-heif) and Pillow's WebP writer: test/fixtures/pdf-sources/exif-photo-heic-webp.py.
const bytesOf = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url)));
const heicTime = {
  dateTimeOriginal: "2026:11:24 16:42:30",
  offsetTimeOriginal: "-08:00",
  dateTime: "2026:11:24 16:42:31",
};

/** An ISO BMFF box: 32-bit size, type, content. */
function box(type: string, ...content: (number[] | Uint8Array)[]): number[] {
  const body = content.flatMap((c) => Array.from(c));
  const size = 8 + body.length;
  return [size >>> 24, (size >> 16) & 255, (size >> 8) & 255, size & 255, ...ascii(type), ...body];
}
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const be32 = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];

describe("photoCaptureTime", () => {
  it("reads the time from a HEIC's Exif item, as libheif writes it", () => {
    expect(photoCaptureTime(bytesOf("exif-photo-libheif.heic"))).toEqual(heicTime);
  });
  it("reads the time from a WebP's EXIF chunk", () => {
    expect(photoCaptureTime(bytesOf("exif-photo-pillow.webp"))).toEqual(heicTime);
  });
  it("still reads a JPEG, and is null for files that are none of the three", () => {
    expect(photoCaptureTime(fixture())?.dateTimeOriginal).toBe("2026:11:25 14:05:09");
    expect(photoCaptureTime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull();
    expect(photoCaptureTime(new Uint8Array(0))).toBeNull();
    expect(webpExif(fixture())).toBeNull();
    expect(heifExif(fixture())).toBeNull();
  });
  it("reads an Exif item kept in the meta box's idat (iloc version 1, construction method 1)", () => {
    const tiff = exifBody(fixture())?.subarray(6) as Uint8Array;
    const item = [...be32(0), ...tiff];
    const infe = box("infe", [2, 0, 0, 0], [0, 7, 0, 0], ascii("Exif"), [0]);
    const iinf = box("iinf", [0, 0, 0, 0], [0, 1], infe);
    // version 1; offset 4, length 4, base 0, index 0; one item: id 7, method 1, ref 0, one extent.
    const iloc = box(
      "iloc",
      [1, 0, 0, 0],
      [0x44, 0x00],
      [0, 1],
      [0, 7, 0, 1, 0, 0],
      [0, 1],
      be32(0),
      be32(item.length),
    );
    const meta = box(
      "meta",
      [0, 0, 0, 0],
      box("hdlr", new Array(24).fill(0)),
      iinf,
      iloc,
      box("idat", item),
    );
    const file = new Uint8Array([
      ...box("ftyp", ascii("heic"), [0, 0, 0, 0], ascii("mif1")),
      ...meta,
    ]);
    expect(photoCaptureTime(file)).toEqual(readCaptureTime(fixture()));
  });
  it("is null for a HEIC with no Exif item", () => {
    const iinf = box(
      "iinf",
      [0, 0, 0, 0],
      [0, 1],
      box("infe", [2, 0, 0, 0], [0, 1, 0, 0], ascii("hvc1"), [0]),
    );
    const iloc = box("iloc", [0, 0, 0, 0], [0x44, 0x00], [0, 0]);
    const file = new Uint8Array([
      ...box("ftyp", ascii("heic"), [0, 0, 0, 0]),
      ...box("meta", [0, 0, 0, 0], iinf, iloc),
    ]);
    expect(photoCaptureTime(file)).toBeNull();
  });
  it("survives truncated or corrupted HEIC and WebP files without throwing", () => {
    for (const name of ["exif-photo-libheif.heic", "exif-photo-pillow.webp"]) {
      const f = bytesOf(name);
      for (let cut = 0; cut < f.length; cut += 5) {
        expect(() => photoCaptureTime(f.subarray(0, cut))).not.toThrow();
      }
      for (let at = 0; at < f.length; at += 3) {
        const broken = f.slice();
        broken[at] = 0xff;
        expect(() => photoCaptureTime(broken)).not.toThrow();
      }
    }
  });
});
