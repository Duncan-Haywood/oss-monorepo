// A PDF page picture turned into a file an OCR engine reads: the JPEG a scanner stored (DCTDecode)
// as it is, black-and-white fax-coded pictures (CCITTFaxDecode, what office scanners write for a
// black-and-white page) wrapped in a TIFF header, and uncompressed or Flate/LZW samples written out as
// a PNM (P4 black-and-white, P5 grey, P6 colour). Pictures in JPEG 2000 (JPXDecode) or JBIG2 are left
// out: there is no decoder here for them. Nothing here draws or decodes a JPEG; the OCR engine does.
// ISO 32000-1 §8.9 (images), §8.6 (colour spaces), §7.4.6 (CCITTFaxDecode); TIFF 6.0 §3, §11.

import { MAX_INFLATED_BYTES } from "./filters";
import { PdfDict, PdfName, PdfStream, PdfString, type PdfValue } from "./objects";
import { decodeStream, type PdfReader } from "./reader";

/** A picture's file for OCR, and its size in pixels. */
export interface OcrImage {
  width: number;
  height: number;
  /** The file's format: JPEG, TIFF (CCITT G3/G4) or PNM. */
  format: "jpeg" | "tiff" | "pnm";
  bytes: Uint8Array;
}

/** A picture this reader cannot hand to OCR, and why, in a contractor's words. */
export interface ImageUnreadable {
  unreadable: string;
}

/** Pixels in one picture; a 600 dpi letter page is about 34 million. */
export const MAX_IMAGE_PIXELS = 60_000_000;

type ColorSpace =
  | { kind: "gray" | "rgb" | "cmyk" }
  | { kind: "indexed"; base: "gray" | "rgb" | "cmyk"; hival: number; lookup: Uint8Array };

const IMAGE_FILTERS = new Set([
  "DCTDecode",
  "DCT",
  "CCITTFaxDecode",
  "CCF",
  "JPXDecode",
  "JBIG2Decode",
]);

function baseSpace(reader: PdfReader, v: PdfValue | undefined): "gray" | "rgb" | "cmyk" | null {
  const cs = reader.resolve(v ?? null);
  const name = cs instanceof PdfName ? cs.name : null;
  if (name === "DeviceGray" || name === "G" || name === "CalGray") return "gray";
  if (name === "DeviceRGB" || name === "RGB" || name === "CalRGB") return "rgb";
  if (name === "DeviceCMYK" || name === "CMYK") return "cmyk";
  if (Array.isArray(cs) && cs[0] instanceof PdfName) {
    const family = cs[0].name;
    if (family === "CalGray") return "gray";
    if (family === "CalRGB" || family === "Lab") return family === "Lab" ? null : "rgb";
    if (family === "ICCBased") {
      const icc = reader.resolve(cs[1] ?? null);
      const n = icc instanceof PdfStream ? reader.resolve(icc.dict.get("N") ?? null) : null;
      return n === 1 ? "gray" : n === 3 ? "rgb" : n === 4 ? "cmyk" : null;
    }
  }
  return null;
}

async function colorSpace(reader: PdfReader, v: PdfValue | undefined): Promise<ColorSpace | null> {
  const cs = reader.resolve(v ?? null);
  if (
    Array.isArray(cs) &&
    cs[0] instanceof PdfName &&
    (cs[0].name === "Indexed" || cs[0].name === "I")
  ) {
    const base = baseSpace(reader, cs[1]);
    const hival = reader.resolve(cs[2] ?? null);
    const table = reader.resolve(cs[3] ?? null);
    if (!base || typeof hival !== "number") return null;
    let lookup: Uint8Array | null = null;
    if (table instanceof PdfStream) lookup = await decodeStream(table, 4 * 256);
    else if (table instanceof PdfString) lookup = table.bytes;
    return lookup
      ? { kind: "indexed", base, hival: Math.max(0, Math.min(255, hival)), lookup }
      : null;
  }
  const kind = baseSpace(reader, cs);
  return kind ? { kind } : null;
}

const names = (reader: PdfReader, v: PdfValue | undefined): string[] => {
  const f = reader.resolve(v ?? null);
  const list = Array.isArray(f) ? f.map((x) => reader.resolve(x)) : f === null ? [] : [f];
  return list.map((x) => (x instanceof PdfName ? x.name : "?"));
};

const int = (reader: PdfReader, v: PdfValue | undefined, fallback: number) => {
  const n = reader.resolve(v ?? null);
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/** The stream with only its filters before `upTo` (to undo them and reach the coded picture). */
function leading(reader: PdfReader, s: PdfStream, upTo: number): PdfStream {
  const d = s.dict.clone();
  const filters = reader.resolve(s.dict.get("Filter") ?? null);
  const parms = reader.resolve(s.dict.get("DecodeParms") ?? s.dict.get("DP") ?? null);
  if (Array.isArray(filters)) {
    d.set("Filter", filters.slice(0, upTo).map((x) => reader.resolve(x)) as PdfValue[]);
    if (Array.isArray(parms))
      d.set("DecodeParms", parms.slice(0, upTo).map((x) => reader.resolve(x)) as PdfValue[]);
    else d.map.delete("DecodeParms");
  } else {
    d.map.delete("Filter");
    d.map.delete("DecodeParms");
  }
  d.map.delete("DP");
  return new PdfStream(d, s.data);
}

function lastParms(reader: PdfReader, s: PdfStream): PdfDict | undefined {
  const p = reader.resolve(s.dict.get("DecodeParms") ?? s.dict.get("DP") ?? null);
  const last = Array.isArray(p) ? reader.resolve(p[p.length - 1] ?? null) : p;
  return last instanceof PdfDict ? last : undefined;
}

/** Turns a page picture into a file for OCR. Never throws. */
export async function imageForOcr(
  reader: PdfReader,
  s: PdfStream,
): Promise<OcrImage | ImageUnreadable> {
  try {
    return await read(reader, s);
  } catch {
    return { unreadable: "the picture's data is damaged or could not be unpacked" };
  }
}

async function read(reader: PdfReader, s: PdfStream): Promise<OcrImage | ImageUnreadable> {
  const width = int(reader, s.dict.get("Width") ?? s.dict.get("W"), 0);
  const height = int(reader, s.dict.get("Height") ?? s.dict.get("H"), 0);
  if (width <= 0 || height <= 0) return { unreadable: "the picture has no size" };
  if (width * height > MAX_IMAGE_PIXELS)
    return { unreadable: "the picture is larger than 60 million pixels (scanned at over 600 dpi)" };
  // (An image XObject's /F names an external file, never a filter.)
  const filters = names(reader, s.dict.get("Filter"));
  const last = filters[filters.length - 1] ?? "";
  for (const [i, f] of filters.entries())
    if (IMAGE_FILTERS.has(f) && i !== filters.length - 1)
      return { unreadable: "the picture is coded in an unusual way" };
  const decode = reader.resolve(s.dict.get("Decode") ?? s.dict.get("D") ?? null);
  const inverted =
    Array.isArray(decode) && decode.length >= 2 && Number(reader.resolve(decode[0] ?? null)) === 1;
  if (last === "JPXDecode") return { unreadable: "the picture is JPEG 2000" };
  if (last === "JBIG2Decode") return { unreadable: "the picture is JBIG2" };
  if (last === "DCTDecode" || last === "DCT") {
    const bytes = await decodeStream(leading(reader, s, filters.length - 1));
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return { unreadable: "the picture is not a JPEG" };
    return { width, height, format: "jpeg", bytes };
  }
  if (last === "CCITTFaxDecode" || last === "CCF") {
    const coded = await decodeStream(leading(reader, s, filters.length - 1));
    const p = lastParms(reader, s);
    const k = int(reader, p?.get("K"), 0);
    const columns = int(reader, p?.get("Columns"), 1728);
    const rows = int(reader, p?.get("Rows"), 0) || height;
    if (columns <= 0 || rows <= 0 || columns * rows > MAX_IMAGE_PIXELS)
      return { unreadable: "the picture's size is out of range" };
    const blackIs1 = reader.resolve(p?.get("BlackIs1") ?? null) === true;
    const byteAlign = reader.resolve(p?.get("EncodedByteAlign") ?? null) === true;
    // The code is of white and black runs. Decoded, a black run is 0 (black in grey) unless BlackIs1,
    // and the image's Decode [1 0] swaps it again: either one alone shows the page in negative.
    const negative = blackIs1 !== inverted;
    return {
      width: columns,
      height: rows,
      format: "tiff",
      bytes: ccittTiff(coded, columns, rows, k, negative, byteAlign),
    };
  }
  // Samples: no image filter, or only general-purpose ones (Flate, LZW, ...) before them.
  const bpc = int(reader, s.dict.get("BitsPerComponent") ?? s.dict.get("BPC"), 8);
  if (![1, 2, 4, 8, 16].includes(bpc))
    return { unreadable: "the picture has an unusual bit depth" };
  const cs = await colorSpace(reader, s.dict.get("ColorSpace") ?? s.dict.get("CS"));
  if (!cs) return { unreadable: "the picture uses a colour space this reader does not know" };
  const comps = cs.kind === "indexed" ? 1 : cs.kind === "gray" ? 1 : cs.kind === "rgb" ? 3 : 4;
  const rowBytes = Math.ceil((width * comps * bpc) / 8);
  // Raw samples are capped like any stream (64 MB: a 300 dpi letter page in colour is about 25 MB).
  if (rowBytes * height > MAX_INFLATED_BYTES)
    return { unreadable: "the picture is too large to unpack (over 64 MB of samples)" };
  const data = await decodeStream(s, rowBytes * height + 1024);
  if (data.length < rowBytes * height) return { unreadable: "the picture's data is cut short" };
  return {
    width,
    height,
    format: "pnm",
    bytes: pnm(data, width, height, bpc, cs, rowBytes, inverted),
  };
}

/** Sample `i` (0-based along the row) of `bpc` bits from a row starting at byte `at`. */
function sample(data: Uint8Array, at: number, i: number, bpc: number): number {
  if (bpc === 8) return data[at + i] ?? 0;
  if (bpc === 16) return data[at + 2 * i] ?? 0;
  const bit = i * bpc;
  const byte = data[at + (bit >> 3)] ?? 0;
  const v = (byte >> (8 - bpc - (bit & 7))) & ((1 << bpc) - 1);
  return v;
}

const scale8 = (v: number, bpc: number) =>
  bpc >= 8 ? v : Math.round((v * 255) / ((1 << bpc) - 1));
const cmykToRgb = (c: number, m: number, y: number, k: number): [number, number, number] => [
  255 - Math.min(255, c + k),
  255 - Math.min(255, m + k),
  255 - Math.min(255, y + k),
];

function header(kind: "P4" | "P5" | "P6", w: number, h: number) {
  return new TextEncoder().encode(kind === "P4" ? `P4\n${w} ${h}\n` : `${kind}\n${w} ${h}\n255\n`);
}

function pnm(
  data: Uint8Array,
  w: number,
  h: number,
  bpc: number,
  cs: ColorSpace,
  rowBytes: number,
  inverted: boolean,
): Uint8Array {
  // One bit, grey: PBM, whose 1 is black (a PDF grey bit 1 is white, unless Decode is [1 0]).
  if (cs.kind === "gray" && bpc === 1) {
    const head = header("P4", w, h);
    const out = new Uint8Array(head.length + rowBytes * h);
    out.set(head);
    const lastMask = w % 8 === 0 ? 0xff : (0xff << (8 - (w % 8))) & 0xff;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < rowBytes; x++) {
        const b = data[y * rowBytes + x] ?? 0;
        const v = inverted ? b : ~b & 0xff;
        out[head.length + y * rowBytes + x] = x === rowBytes - 1 ? v & lastMask : v;
      }
    return out;
  }
  if (cs.kind === "gray") {
    const head = header("P5", w, h);
    const out = new Uint8Array(head.length + w * h);
    out.set(head);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = scale8(sample(data, y * rowBytes, x, bpc), bpc);
        out[head.length + y * w + x] = inverted ? 255 - v : v;
      }
    return out;
  }
  const head = header("P6", w, h);
  const out = new Uint8Array(head.length + 3 * w * h);
  out.set(head);
  let o = head.length;
  const comps = cs.kind === "rgb" ? 3 : cs.kind === "cmyk" ? 4 : 1;
  for (let y = 0; y < h; y++) {
    const at = y * rowBytes;
    for (let x = 0; x < w; x++) {
      let rgb: [number, number, number];
      if (cs.kind === "indexed") {
        const i = Math.min(cs.hival, sample(data, at, x, bpc));
        const n = cs.base === "gray" ? 1 : cs.base === "rgb" ? 3 : 4;
        const e = (j: number) => cs.lookup[i * n + j] ?? 0;
        rgb =
          n === 1
            ? [e(0), e(0), e(0)]
            : n === 3
              ? [e(0), e(1), e(2)]
              : cmykToRgb(e(0), e(1), e(2), e(3));
      } else {
        const c = (j: number) => {
          const v = scale8(sample(data, at, x * comps + j, bpc), bpc);
          return inverted ? 255 - v : v;
        };
        rgb = comps === 3 ? [c(0), c(1), c(2)] : cmykToRgb(c(0), c(1), c(2), c(3));
      }
      out[o++] = rgb[0];
      out[o++] = rgb[1];
      out[o++] = rgb[2];
    }
  }
  return out;
}

/** A one-strip TIFF around CCITT-coded data (TIFF 6.0 §11: compression 3 is T.4, 4 is T.6). */
export function ccittTiff(
  coded: Uint8Array,
  width: number,
  height: number,
  k: number,
  negative: boolean,
  byteAlign: boolean,
): Uint8Array {
  const g4 = k < 0;
  const entries: [number, 3 | 4, number][] = [
    [256, 4, width],
    [257, 4, height],
    [258, 3, 1],
    [259, 3, g4 ? 4 : 3],
    // Photometric 0 (WhiteIsZero) shows the runs as coded; 1 (BlackIsZero) shows them in negative.
    [262, 3, negative ? 1 : 0],
    [273, 4, 0], // strip offset, set below
    [277, 3, 1],
    [278, 4, height],
    [279, 4, coded.length],
  ];
  // T4Options: bit 0 two-dimensional coding (K > 0), bit 2 rows padded to a byte boundary.
  if (!g4) entries.push([292, 4, (k > 0 ? 1 : 0) | (byteAlign ? 4 : 0)]);
  const ifdSize = 2 + entries.length * 12 + 4;
  const dataAt = 8 + ifdSize;
  const out = new Uint8Array(dataAt + coded.length);
  const v = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0]);
  v.setUint32(4, 8, true);
  v.setUint16(8, entries.length, true);
  for (const [i, [tag, type, value]] of entries.entries()) {
    const at = 10 + i * 12;
    v.setUint16(at, tag, true);
    v.setUint16(at + 2, type, true);
    v.setUint32(at + 4, 1, true);
    const val = tag === 273 ? dataAt : value;
    if (type === 3) v.setUint16(at + 8, val, true);
    else v.setUint32(at + 8, val, true);
  }
  v.setUint32(10 + entries.length * 12, 0, true);
  out.set(coded, dataAt);
  return out;
}
