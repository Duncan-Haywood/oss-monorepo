// HEIC and WebP photos made JPEG in the browser before upload (client/lib/packet-photo.ts), with a
// fake decoder: the real one is the browser's (checked once in Chromium with a real WebP: ROADMAP, "HEIC and WebP photos in the packet").
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { type Decoded, JPEG_QUALITY, packetReadyPhoto } from "../../src/client/lib/packet-photo";
import { SHRINK_JPEG_QUALITY } from "../../src/shared/attachments";
import { readCaptureTime } from "../../src/shared/photo-exif";

const at = new Date(2026, 10, 25, 9, 14, 0).getTime();
const heic = () =>
  new File([new Uint8Array(4096)], "IMG_0412.HEIC", { type: "image/heic", lastModified: at });

function fake(width: number, height: number, jpeg: Blob | null = new Blob([new Uint8Array(900)])) {
  const calls: { w: number; h: number; q: number }[] = [];
  const close = vi.fn();
  const decoded: Decoded = {
    width,
    height,
    toJpeg: async (w, h, q) => {
      calls.push({ w, h, q });
      return jpeg;
    },
    close,
  };
  return { decode: async () => decoded, calls, close };
}

describe("packetReadyPhoto", () => {
  it("turns a HEIC the browser can read into a JPEG with the same name and time", async () => {
    const f = fake(4032, 3024);
    const r = await packetReadyPhoto(heic(), { decode: f.decode });
    expect(r.file.name).toBe("IMG_0412.jpg");
    expect(r.file.type).toBe("image/jpeg");
    expect(r.file.lastModified).toBe(at);
    expect(r.file.size).toBe(900);
    expect(f.calls).toEqual([{ w: 4032, h: 3024, q: JPEG_QUALITY }]);
    expect(r.note).toBe(
      "IMG_0412.HEIC was converted to JPEG (IMG_0412.jpg) so it goes in the PDF packet.",
    );
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("scales a 48-megapixel photo to 12 and says so", async () => {
    const f = fake(8064, 6048);
    const r = await packetReadyPhoto(heic(), { decode: f.decode });
    expect(f.calls[0]).toMatchObject({ w: 4032, h: 3024 });
    expect(r.note).toContain("scaled from 8064 x 6048 to 4032 x 3024");
  });
  it("converts a WebP too", async () => {
    const webp = new File([new Uint8Array(10)], "site walk.webp", { type: "image/webp" });
    const r = await packetReadyPhoto(webp, { decode: fake(640, 480).decode });
    expect(r.file.name).toBe("site walk.jpg");
  });
  it("uploads the original when the browser cannot read it, or cannot write the JPEG", async () => {
    const original = heic();
    expect((await packetReadyPhoto(original, { decode: async () => null })).file).toBe(original);
    const failing = fake(100, 100, null);
    const r = await packetReadyPhoto(original, { decode: failing.decode });
    expect(r).toEqual({ file: original, note: null });
    expect(failing.close).toHaveBeenCalledOnce();
    const empty = await packetReadyPhoto(original, { decode: fake(100, 100, new Blob([])).decode });
    expect(empty.file).toBe(original);
    const thrown = await packetReadyPhoto(original, {
      decode: async () => {
        throw new Error("decode");
      },
    });
    expect(thrown.file).toBe(original);
  });
  it("leaves every other file alone without decoding it", async () => {
    const decode = vi.fn();
    for (const name of ["a.jpg", "b.png", "c.pdf", "d.xlsx"]) {
      const f = new File([new Uint8Array(3)], name);
      expect((await packetReadyPhoto(f, { decode })).file).toBe(f);
    }
    expect(decode).not.toHaveBeenCalled();
  });
});

describe("packetReadyPhoto with shrink (Attachments part 3)", () => {
  const MB = 1024 * 1024;
  /** A "phone JPEG": the Pillow fixture's bytes (with its EXIF time) padded to `size`. */
  function phoneJpeg(size: number, name = "IMG_2201.JPG") {
    const head = new Uint8Array(
      readFileSync(new URL("../fixtures/exif-photo-pillow.jpg", import.meta.url)),
    );
    const bytes = new Uint8Array(size);
    bytes.set(head);
    return new File([bytes], name, { type: "image/jpeg", lastModified: at });
  }
  /** What a canvas returns: a JPEG with JFIF and no EXIF. */
  const canvasOut = (pad: number) =>
    new Blob([
      new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
      ]),
      new Uint8Array(pad),
      new Uint8Array([0xff, 0xd9]),
    ]);

  it("redraws a 4 MB 12-megapixel JPEG at 2560 pixels and keeps its capture time", async () => {
    const f = fake(4032, 3024, canvasOut(800_000));
    const r = await packetReadyPhoto(phoneJpeg(4 * MB), { shrink: true, decode: f.decode });
    expect(f.calls).toEqual([{ w: 2560, h: 1920, q: SHRINK_JPEG_QUALITY }]);
    expect(r.file.name).toBe("IMG_2201.JPG");
    expect(r.file.type).toBe("image/jpeg");
    expect(r.file.lastModified).toBe(at);
    expect(r.file.size).toBeLessThan(820_000);
    const time = readCaptureTime(new Uint8Array(await r.file.arrayBuffer()));
    expect(time?.dateTimeOriginal).toBe("2026:11:25 14:05:09");
    expect(time?.offsetTimeOriginal).toBe("-05:00");
    expect(r.note).toBe(
      "IMG_2201.JPG was made smaller to save storage: 4 MB to 781 KB (4032 x 3024 to 2560 x 1920 pixels), with the time it was taken kept.",
    );
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("brings a 48-megapixel photo over the 15 MB limit under it", async () => {
    const f = fake(8064, 6048, canvasOut(900_000));
    const r = await packetReadyPhoto(phoneJpeg(18 * MB), { shrink: true, decode: f.decode });
    expect(f.calls[0]).toMatchObject({ w: 2560, h: 1920 });
    expect(r.file.size).toBeLessThan(MB);
  });
  it("keeps a portrait photo's shape", async () => {
    const f = fake(3024, 4032, canvasOut(700_000));
    await packetReadyPhoto(phoneJpeg(3 * MB), { shrink: true, decode: f.decode });
    expect(f.calls[0]).toMatchObject({ w: 1920, h: 2560 });
  });
  it("sends the original when shrinking saves less than a fifth", async () => {
    const original = phoneJpeg(2 * MB);
    const r = await packetReadyPhoto(original, {
      shrink: true,
      decode: fake(2000, 1500, canvasOut(1_800_000)).decode,
    });
    expect(r).toEqual({ file: original, note: null });
  });
  it("leaves small JPEGs, PNGs, and everything when shrink is off, undecoded", async () => {
    const decode = vi.fn();
    for (const f of [
      phoneJpeg(MB),
      new File([new Uint8Array(5 * MB)], "screenshot.png", { type: "image/png" }),
      new File([new Uint8Array(5 * MB)], "scan.pdf"),
    ]) {
      expect((await packetReadyPhoto(f, { shrink: true, decode })).file).toBe(f);
    }
    const big = phoneJpeg(4 * MB);
    expect((await packetReadyPhoto(big, { decode })).file).toBe(big);
    expect(decode).not.toHaveBeenCalled();
  });
  it("sends the original when the browser cannot decode or encode it", async () => {
    const original = phoneJpeg(4 * MB);
    expect(
      (await packetReadyPhoto(original, { shrink: true, decode: async () => null })).file,
    ).toBe(original);
    expect(
      (await packetReadyPhoto(original, { shrink: true, decode: fake(4032, 3024, null).decode }))
        .file,
    ).toBe(original);
  });
  it("draws a HEIC being converted at the shrunk size too", async () => {
    const f = fake(4032, 3024);
    const r = await packetReadyPhoto(heic(), { shrink: true, decode: f.decode });
    expect(f.calls).toEqual([{ w: 2560, h: 1920, q: SHRINK_JPEG_QUALITY }]);
    expect(r.note).toContain("scaled from 4032 x 3024 to 2560 x 1920");
  });
  it("sends a photo with no EXIF time shrunk, and says nothing about a time", async () => {
    const plain = new File([new Uint8Array(3 * MB)], "photo.jpg", { type: "image/jpeg" });
    const r = await packetReadyPhoto(plain, {
      shrink: true,
      decode: fake(4000, 3000, canvasOut(600_000)).decode,
    });
    expect(r.file.size).toBe(600_000 + 22);
    expect(r.note).not.toContain("time");
  });
});

describe("packetReadyPhoto keeps a HEIC's or WebP's capture time (Attachments part 4)", () => {
  /** A canvas-style JPEG, as the fake decoder's toJpeg returns. */
  const canvasJpeg = () => {
    const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const sof = [0xff, 0xc0, 0, 17, 8, 0, 48, 0, 64, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0];
    return new Blob([new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xda, 0, 2, 0xff, 0xd9])]);
  };
  const fixtureFile = (name: string, as: string) =>
    new File([readFileSync(new URL(`../fixtures/${name}`, import.meta.url))], as, {
      lastModified: at,
    });
  const expected = {
    dateTimeOriginal: "2026:11:24 16:42:30",
    offsetTimeOriginal: "-08:00",
    dateTime: "2026:11:24 16:42:31",
  };

  it("writes the HEIC's capture time into the JPEG and says so", async () => {
    const r = await packetReadyPhoto(fixtureFile("exif-photo-libheif.heic", "IMG_0500.HEIC"), {
      decode: fake(64, 48, canvasJpeg()).decode,
    });
    expect(r.file.name).toBe("IMG_0500.jpg");
    expect(readCaptureTime(new Uint8Array(await r.file.arrayBuffer()))).toEqual(expected);
    expect(r.note).toBe(
      "IMG_0500.HEIC was converted to JPEG (IMG_0500.jpg) so it goes in the PDF packet, with the time it was taken kept.",
    );
  });
  it("does the same for a WebP, shrinking or not", async () => {
    for (const shrink of [false, true]) {
      const r = await packetReadyPhoto(fixtureFile("exif-photo-pillow.webp", "walk.webp"), {
        decode: fake(64, 48, canvasJpeg()).decode,
        shrink,
      });
      expect(readCaptureTime(new Uint8Array(await r.file.arrayBuffer()))).toEqual(expected);
      expect(r.note).toContain("with the time it was taken kept.");
    }
  });
  it("converts as before when the photo has no capture time", async () => {
    const r = await packetReadyPhoto(heic(), { decode: fake(64, 48, canvasJpeg()).decode });
    expect(r.note).toBe(
      "IMG_0412.HEIC was converted to JPEG (IMG_0412.jpg) so it goes in the PDF packet.",
    );
    expect(readCaptureTime(new Uint8Array(await r.file.arrayBuffer()))).toBeNull();
  });
});
