// The packet's PDF reader, image readers and writer on hand-built files: classic and compressed
// cross-references, object streams, incremental updates, damaged offsets, encryption, hostile
// nesting, JPEG orientation and PNG transparency. Real-world files (pdfTeX, Microsoft Print to
// PDF, Adobe PDF Library, Skia, ReportLab, Matplotlib, LibreOffice) were checked by rendering with
// poppler and diffing each page against its original; see the run notes in ROADMAP.md.

import { readFileSync } from "node:fs";
import { concatBytes, deflate, InflateLimitError, inflate } from "@shared/pdf/filters";
import { PdfRef, PdfStream } from "@shared/pdf/objects";
import { decodeStream, PdfReader, PdfUnreadable } from "@shared/pdf/reader";
import { extractText } from "@shared/pdf/text";
import { lzwEncode } from "@test/unit/lzw-encode";
import { describe, expect, it } from "vitest";
import { PdfDocument } from "../pdf";
import { displaySize, readJpeg, readPng } from "./images";
import { assemblePacket, type PacketFile, packetBytes } from "./packet";
import { PacketWriter } from "./writer";

const enc = new TextEncoder();
const latin1 = (b: Uint8Array) => Array.from(b, (x) => String.fromCharCode(x)).join("");

/** Our own writer's output: classic xref table. */
function simplePdf(pages: string[], size: [number, number] = [612, 792]) {
  const doc = new PdfDocument({ title: "t" });
  for (const text of pages) doc.addPage(...size).text(40, 60, text);
  return doc.toBytes();
}

/** Writes objects (number -> body) with a classic xref; returns bytes and offsets. */
function classicPdf(objects: Record<number, string>, trailer: string, extra = "") {
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
  for (let n = 1; n <= max; n++) {
    out +=
      offsets[n] !== undefined
        ? `${String(offsets[n]).padStart(10, "0")} 00000 n \n`
        : "0000000000 65535 f \n";
  }
  out += `trailer\n<< /Size ${max + 1} ${trailer} >>\nstartxref\n${xref}\n%%EOF\n${extra}`;
  return { text: out, offsets };
}

const page = (n: number, contents: number) =>
  `<< /Type /Page /Parent ${n} 0 R /Contents ${contents} 0 R >>`;
const content = (s: string) => `<< /Length ${s.length} >>\nstream\n${s}\nendstream`;

/**
 * A PDF 1.5 file whose page objects live in a compressed object stream, indexed by an xref stream
 * with a PNG predictor; with `lzw`, every stream is LZW-compressed and the xref stream uses the
 * TIFF predictor instead, as some older drivers and scanner exports write.
 */
async function compressedPdf(declaredN = 3, lzw = false) {
  const head = "%PDF-1.5\n";
  let out = head;
  const off: Record<number, number> = {};
  // Object 3 (content) stays plain; 1 (catalog), 2 (pages), 4 (page) go into object stream 5.
  off[3] = out.length;
  const c = "BT /F1 12 Tf 40 700 Td (packed) Tj ET";
  // In LZW mode the page's content is LZW then hex, so the file text stays ASCII: a filter chain.
  const hex = Array.from(lzwEncode(enc.encode(c)), (b) => b.toString(16).padStart(2, "0")).join("");
  out += lzw
    ? `3 0 obj\n<< /Length ${hex.length + 1} /Filter [/ASCIIHexDecode /LZWDecode] >>\nstream\n${hex}>\nendstream\nendobj\n`
    : `3 0 obj\n${content(c)}\nendobj\n`;
  const packed = [
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, "<< /Type /Pages /Kids [4 0 R] /Count 1 /MediaBox [0 0 300 400] /Rotate 90 >>"],
    [4, "<< /Type /Page /Parent 2 0 R /Contents 3 0 R >>"],
  ] as const;
  let bodies = "";
  const heads: string[] = [];
  for (const [n, body] of packed) {
    heads.push(`${n} ${bodies.length}`);
    bodies += `${body} `;
  }
  const headStr = `${heads.join(" ")} `;
  const objStm = lzw
    ? lzwEncode(enc.encode(headStr + bodies))
    : await deflate(enc.encode(headStr + bodies));
  off[5] = out.length;
  const objHead = `5 0 obj\n<< /Type /ObjStm /N ${declaredN} /First ${headStr.length} /Filter /${lzw ? "LZWDecode" : "FlateDecode"} /Length ${objStm.length} >>\nstream\n`;
  const parts: Uint8Array[] = [
    enc.encode(out),
    enc.encode(objHead),
    objStm,
    enc.encode("\nendstream\nendobj\n"),
  ];
  let length = parts.reduce((s, p) => s + p.length, 0);
  // xref stream rows: type(1) field2(4) field3(2), PNG "Up" predictor (each row: 2 + diffs).
  const rows: number[][] = [];
  const row = (t: number, f2: number, f3: number) => [
    t,
    (f2 >>> 24) & 255,
    (f2 >>> 16) & 255,
    (f2 >>> 8) & 255,
    f2 & 255,
    (f3 >> 8) & 255,
    f3 & 255,
  ];
  rows.push(row(0, 0, 65535));
  rows.push(row(2, 5, 0));
  rows.push(row(2, 5, 1));
  rows.push(row(1, off[3] as number, 0));
  rows.push(row(2, 5, 2));
  rows.push(row(1, off[5] as number, 0));
  rows.push(row(1, length, 0)); // the xref stream itself, object 6
  const filtered: number[] = [];
  rows.forEach((r, i) => {
    if (lzw) {
      // TIFF predictor 2: each byte less the one to its left in the same row.
      r.forEach((v, j) => {
        filtered.push((v - (j ? (r[j - 1] as number) : 0)) & 255);
      });
      return;
    }
    filtered.push(2);
    r.forEach((v, j) => {
      filtered.push((v - (i ? (rows[i - 1]?.[j] as number) : 0)) & 255);
    });
  });
  const xdata = lzw
    ? lzwEncode(Uint8Array.from(filtered))
    : await deflate(Uint8Array.from(filtered));
  const xhead = lzw
    ? `6 0 obj\n<< /Type /XRef /Size 7 /W [1 4 2] /Root 1 0 R /Filter /LZWDecode /DecodeParms << /Predictor 2 /Columns 7 >> /Length ${xdata.length} >>\nstream\n`
    : `6 0 obj\n<< /Type /XRef /Size 7 /W [1 4 2] /Root 1 0 R /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> /Length ${xdata.length} >>\nstream\n`;
  parts.push(
    enc.encode(xhead),
    xdata,
    enc.encode(`\nendstream\nendobj\nstartxref\n${length}\n%%EOF\n`),
  );
  length += 0;
  return concatBytes(parts);
}

describe("filters", () => {
  it("stops inflating past the limit (a zip bomb)", async () => {
    const bomb = await deflate(new Uint8Array(1_000_000));
    expect(bomb.length).toBeLessThan(5_000);
    await expect(inflate(bomb, 100_000)).rejects.toBeInstanceOf(InflateLimitError);
    expect((await inflate(bomb)).length).toBe(1_000_000);
  });
});

describe("PdfReader", () => {
  it("reads our own writer's pages", async () => {
    const r = await PdfReader.open(simplePdf(["one", "two", "three"]));
    expect(r.pages()).toHaveLength(3);
    expect(r.wasRecovered).toBe(false);
  });

  it("reads an xref stream with a PNG predictor and objects packed in an object stream", async () => {
    const r = await PdfReader.open(await compressedPdf());
    expect(r.wasRecovered).toBe(false);
    const pages = r.pages();
    expect(pages).toHaveLength(1);
    // MediaBox and Rotate inherited from the page tree.
    expect(pages[0]?.mediaBox).toEqual([0, 0, 300, 400]);
    expect(pages[0]?.rotate).toBe(90);
  });

  it("reads LZW object and xref streams (TIFF predictor) and an ASCIIHex + LZW page", async () => {
    const bytes = await compressedPdf(3, true);
    const r = await PdfReader.open(bytes);
    expect(r.wasRecovered).toBe(false);
    expect(r.pages()).toHaveLength(1);
    expect(r.pages()[0]?.rotate).toBe(90);
    const stream = r.resolve(new PdfRef(3, 0));
    expect(stream).toBeInstanceOf(PdfStream);
    expect(latin1(await decodeStream(stream as PdfStream))).toBe(
      "BT /F1 12 Tf 40 700 Td (packed) Tj ET",
    );
  });

  it("follows an incremental update: the newer page tree wins", async () => {
    const base = classicPdf(
      {
        1: "<< /Type /Catalog /Pages 2 0 R >>",
        2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        3: page(2, 4),
        4: content("(old) Tj"),
      },
      "/Root 1 0 R",
    );
    const firstXref = base.text.lastIndexOf("xref\n0 ");
    let upd = base.text;
    const o5 = upd.length;
    upd += `5 0 obj\n${page(2, 6)}\nendobj\n`;
    const o6 = upd.length;
    upd += `6 0 obj\n${content("(new) Tj")}\nendobj\n`;
    const o2 = upd.length;
    upd += "2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj\n";
    const x = upd.length;
    const e = (o: number) => `${String(o).padStart(10, "0")} 00000 n \n`;
    upd += `xref\n2 1\n${e(o2)}5 2\n${e(o5)}${e(o6)}trailer\n<< /Size 7 /Root 1 0 R /Prev ${firstXref} >>\nstartxref\n${x}\n%%EOF\n`;
    const r = await PdfReader.open(enc.encode(upd));
    expect(r.wasRecovered).toBe(false);
    expect(r.pages()).toHaveLength(2);
  });

  it("rebuilds a damaged cross-reference by scanning for objects", async () => {
    const good = latin1(simplePdf(["a", "b"]));
    // Bytes inserted after the header shift every offset.
    const broken = good.replace("%PDF-1.4\n", "%PDF-1.4\n% inserted by a careless tool\n");
    const r = await PdfReader.open(Uint8Array.from(broken, (c) => c.charCodeAt(0)));
    expect(r.wasRecovered).toBe(true);
    expect(r.pages()).toHaveLength(2);
  });

  it("recovers a file with no xref or startxref at all", async () => {
    const good = latin1(simplePdf(["only"]));
    const cut = good.slice(0, good.indexOf("xref\n0 "));
    const withTrailer = `${cut}trailer\n<< /Root 1 0 R >>\n`;
    const r = await PdfReader.open(Uint8Array.from(withTrailer, (c) => c.charCodeAt(0)));
    expect(r.pages()).toHaveLength(1);
  });

  it("finds a stream whose /Length is wrong", async () => {
    const f = classicPdf(
      {
        1: "<< /Type /Catalog /Pages 2 0 R >>",
        2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        3: page(2, 4),
        4: "<< /Length 999 >>\nstream\nBT ET\nendstream",
      },
      "/Root 1 0 R",
    );
    const r = await PdfReader.open(enc.encode(f.text));
    const s = r.resolve(r.pages()[0]?.dict.get("Contents"));
    expect(s && typeof s === "object" && "data" in s ? latin1(s.data) : "").toBe("BT ET");
  });

  it("refuses a damaged encryption dictionary, and a file that is not a PDF", async () => {
    const f = classicPdf(
      {
        1: "<< /Type /Catalog /Pages 2 0 R >>",
        2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        3: page(2, 4),
        4: content(""),
        5: "<< /Filter /Standard /V 2 /R 3 >>",
      },
      "/Root 1 0 R /Encrypt 5 0 R",
    );
    await expect(PdfReader.open(enc.encode(f.text))).rejects.toThrow(
      /damaged encryption dictionary/,
    );
    await expect(PdfReader.open(enc.encode("PK\u0003\u0004 a zip file"))).rejects.toBeInstanceOf(
      PdfUnreadable,
    );
  });

  it("ends on an object stream that declares more objects than it holds (a huge /N)", async () => {
    const t0 = Date.now();
    const r = await PdfReader.open(await compressedPdf(2_000_000_000));
    expect(r.pages()).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(2000);
  }, 10_000);

  it("survives hostile input: deep nesting, a page tree that loops, garbage", async () => {
    const deep = classicPdf(
      {
        1: "<< /Type /Catalog /Pages 2 0 R >>",
        2: "<< /Type /Pages /Kids [3 0 R 2 0 R] /Count 1 >>",
        3: `<< /Type /Page /Parent 2 0 R /Contents 4 0 R /X ${"[".repeat(5000)} >>`,
        4: content(""),
      },
      "/Root 1 0 R",
    );
    // Either readable without the hostile object or refused cleanly; never a crash or a hang.
    const outcome = await PdfReader.open(enc.encode(deep.text))
      .then((r) => r.pages().length)
      .catch((e: unknown) => (e instanceof PdfUnreadable ? "refused" : `crash: ${String(e)}`));
    expect(["refused", 1, 0]).toContain(outcome);
    const junk = new Uint8Array(4096).map((_, i) => (i * 7919) % 256);
    junk.set(enc.encode("%PDF-1.7\n"), 0);
    await expect(PdfReader.open(junk)).rejects.toBeInstanceOf(PdfUnreadable);
  });
});

// --- images ---------------------------------------------------------------------------------

/** A minimal JPEG header: SOI, optional EXIF orientation, SOF0, SOS. Enough for readJpeg. */
function jpegHeader(w: number, h: number, comps: number, orientation?: number) {
  const parts: number[] = [0xff, 0xd8];
  if (orientation) {
    const tiff = [
      0x4d,
      0x4d,
      0,
      42,
      0,
      0,
      0,
      8,
      0,
      1,
      0x01,
      0x12,
      0,
      3,
      0,
      0,
      0,
      1,
      0,
      orientation,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    const seg = [...enc.encode("Exif"), 0, 0, ...tiff];
    parts.push(0xff, 0xe1, (seg.length + 2) >> 8, (seg.length + 2) & 255, ...seg);
  }
  const sof = [8, h >> 8, h & 255, w >> 8, w & 255, comps];
  for (let i = 0; i < comps; i++) sof.push(i + 1, 0x11, 0);
  parts.push(0xff, 0xc0, 0, sof.length + 2, ...sof);
  parts.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return Uint8Array.from(parts);
}

function crc32(bytes: Uint8Array) {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, body.length);
  out.set(enc.encode(type), 4);
  out.set(body, 8);
  v.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

async function png(
  w: number,
  h: number,
  colorType: number,
  pixels: number[],
  extra: Uint8Array[] = [],
) {
  const ch = ({ 2: 3, 3: 1, 6: 4 } as Record<number, number>)[colorType] as number;
  const raw: number[] = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w * ch; x++) raw.push(pixels[(y * w * ch + x) % pixels.length] as number);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, colorType, 0, 0, 0], 8);
  return concatBytes([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extra,
    chunk("IDAT", await deflate(Uint8Array.from(raw))),
    chunk("IEND", new Uint8Array()),
  ]);
}

describe("images", () => {
  it("reads a JPEG's size, colour model and EXIF orientation", () => {
    const img = readJpeg(jpegHeader(4032, 3024, 3, 6));
    expect(img).toMatchObject({ width: 4032, height: 3024, orientation: 6 });
    expect(img.entries).toContain("/DeviceRGB");
    // A phone photo taken upright: stored landscape, shown portrait.
    expect(displaySize(img)).toEqual({ width: 3024, height: 4032 });
    expect(readJpeg(jpegHeader(10, 10, 4)).entries).toContain("/DeviceCMYK");
    expect(() => readJpeg(enc.encode("not a jpeg"))).toThrow(/not a JPEG/);
  });

  it("passes an opaque PNG through and splits RGBA into a soft mask", async () => {
    const rgb = await readPng(await png(3, 2, 2, [255, 0, 0]));
    expect(rgb.entries).toContain("/Predictor 15");
    expect(rgb.smask).toBeUndefined();
    const rgba = await readPng(await png(2, 2, 6, [0, 128, 0, 0, 0, 128, 0, 255]));
    expect(rgba.smask).toBeDefined();
    expect([...(await inflate(rgba.smask?.data ?? new Uint8Array()))]).toEqual([0, 255, 0, 255]);
    expect([...(await inflate(rgba.data))].slice(0, 6)).toEqual([0, 128, 0, 0, 128, 0]);
  });

  it("turns palette transparency (tRNS) into a soft mask", async () => {
    const palette = chunk("PLTE", Uint8Array.from([255, 255, 255, 0, 0, 255]));
    const trns = chunk("tRNS", Uint8Array.from([0]));
    const img = await readPng(await png(2, 1, 3, [0, 1], [palette, trns]));
    expect(img.entries).toContain("/Indexed");
    expect([...(await inflate(img.smask?.data ?? new Uint8Array()))]).toEqual([0, 255]);
  });
});

// --- writer ---------------------------------------------------------------------------------

describe("PacketWriter", () => {
  it("copies pages from several files, re-readable, with every page stamped", async () => {
    const w = new PacketWriter();
    w.addPdf(await PdfReader.open(simplePdf(["first"])));
    w.addPdf(await PdfReader.open(await compressedPdf()));
    w.addPdf(await PdfReader.open(simplePdf(["x", "y"], [842, 595])));
    w.addImagePage(readJpeg(jpegHeader(400, 300, 3, 6)), "Job photo: north wall.jpg");
    const out = w.finish({ title: "Packet", label: "Application #7" });
    const bytes = concatBytes(out.chunks);
    expect(bytes.length).toBe(out.length);
    const back = await PdfReader.open(bytes);
    expect(back.wasRecovered).toBe(false);
    const pages = back.pages();
    expect(pages).toHaveLength(5);
    expect(pages[1]?.rotate).toBe(90);
    expect(pages[1]?.mediaBox).toEqual([0, 0, 300, 400]);
    const text = latin1(bytes);
    for (let i = 1; i <= 5; i++) expect(text).toContain(`(Application #7 - page ${i} of 5)`);
    expect(text).toContain("(packed) Tj");
    expect(text).toContain("/Filter /DCTDecode");
    // The photo shown upright on a portrait page.
    expect(pages[4]?.mediaBox).toEqual([0, 0, 612, 792]);
    // Nothing from the source catalogs or page trees is copied.
    expect(text.match(/\/Type \/Catalog/g)).toHaveLength(1);
    expect(text.match(/\/Type \/Pages/g)).toHaveLength(1);
  });

  it("copies an owner-password PDF (a restricted bank or insurer download) decrypted, page for page", async () => {
    const fixture = (n: string) =>
      new Uint8Array(readFileSync(new URL(`../../../../../test/fixtures/${n}`, import.meta.url)));
    for (const name of ["encrypted-aes-256.pdf", "encrypted-libreoffice-rc4-128.pdf"]) {
      const w = new PacketWriter();
      w.addPdf(await PdfReader.open(fixture(name)));
      const bytes = concatBytes(w.finish({ title: "Packet", label: "Application #3" }).chunks);
      const back = await PdfReader.open(bytes);
      expect(back.wasEncrypted).toBe(false);
      expect(latin1(bytes)).not.toContain("/Encrypt");
      // The source's own text, read through decryption (crypt.test.ts checks it against the
      // unencrypted originals).
      const original = await extractText(fixture(name));
      const copied = await extractText(bytes);
      expect(copied.pages.length).toBe(original.pages.length);
      // Same words on every page, plus the packet's own stamp.
      for (const [i, page] of original.pages.entries()) {
        const words = (p: typeof page) => p.runs.map((r) => r.text).join(" ");
        expect(words(copied.pages[i] as typeof page)).toContain(words(page).slice(0, 200));
      }
    }
  });

  it("puts a restricted PDF in the packet and lists one that needs a password", async () => {
    const fixture = (n: string) =>
      new Uint8Array(readFileSync(new URL(`../../../../../test/fixtures/${n}`, import.meta.url)));
    const file = (id: string, name: string): PacketFile => {
      const bytes = fixture(name);
      return {
        id,
        name,
        kind: "Backup",
        contentType: "application/pdf",
        sizeBytes: bytes.length,
        load: async () => bytes,
      };
    };
    const r = await assemblePacket({
      lead: simplePdf(["application"]),
      files: [file("a", "encrypted-aes-128.pdf"), file("b", "locked-user-password.pdf")],
      label: "Application #3",
      title: "Packet",
      leadName: "the application",
      heading: "Backup for Application #3",
      details: [],
    });
    expect(r.included.map((e) => e.name)).toEqual(["encrypted-aes-128.pdf"]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]?.reason).toMatch(
      /^This PDF needs a password to open\. Open it \(with its password/,
    );
    // Application, index, and both pages of the restricted file.
    expect(r.pages).toBe(4);
    expect((await PdfReader.open(packetBytes(r))).wasEncrypted).toBe(false);
  });

  it("drops script and launch actions and automatic triggers from copied pages", async () => {
    const f = classicPdf(
      {
        1: "<< /Type /Catalog /Pages 2 0 R /OpenAction 6 0 R >>",
        2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        3: "<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Annots [5 0 R] /AA << /O 6 0 R >> >>",
        4: content("BT ET"),
        5: "<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /Launch /F (calc.exe) >> >>",
        6: "<< /S /JavaScript /JS (app.alert(1)) >>",
      },
      "/Root 1 0 R",
    );
    const w = new PacketWriter();
    w.addPdf(await PdfReader.open(enc.encode(f.text)));
    const text = latin1(concatBytes(w.finish({ title: "t", label: "x" }).chunks));
    expect(text).not.toMatch(/JavaScript|Launch|\/AA|calc/);
    expect(text).toContain("/Subtype /Link");
  });
});
