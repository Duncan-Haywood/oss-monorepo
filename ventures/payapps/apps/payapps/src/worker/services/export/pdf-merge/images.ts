// Photos as PDF images, with no image library: a JPEG goes in as-is (DCTDecode) after reading its
// size, colour model and EXIF orientation; a PNG's compressed rows go in as-is (FlateDecode with
// the PNG predictor) unless it has an alpha channel, which is split into a soft mask.
import { concatBytes, deflate, inflate, unfilterPngRows } from "@shared/pdf/filters";

export class ImageUnreadable extends Error {}

export interface PdfImage {
  /** Pixel size as stored. */
  width: number;
  height: number;
  /** EXIF orientation 1-8 (1 = as stored). */
  orientation: number;
  /** The image XObject dictionary entries other than Type, Subtype, Width, Height, Length. */
  entries: string;
  data: Uint8Array;
  /** Soft mask (alpha), DeviceGray 8-bit, Flate-compressed. */
  smask?: { entries: string; data: Uint8Array };
}

/** Width and height as shown after the orientation is applied. */
export const displaySize = (img: PdfImage) =>
  img.orientation >= 5
    ? { width: img.height, height: img.width }
    : { width: img.width, height: img.height };

// --- JPEG ------------------------------------------------------------------------------------

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function exifOrientation(seg: Uint8Array): number {
  // "Exif\0\0" then a TIFF header.
  if (seg.length < 14 || String.fromCharCode(...seg.subarray(0, 4)) !== "Exif") return 1;
  const t = seg.subarray(6);
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return 1;
  const u16 = (o: number) =>
    le
      ? (t[o] as number) | ((t[o + 1] as number) << 8)
      : ((t[o] as number) << 8) | (t[o + 1] as number);
  const u32 = (o: number) => (le ? u16(o) + u16(o + 2) * 65536 : u16(o) * 65536 + u16(o + 2));
  const ifd = u32(4);
  if (ifd + 2 > t.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > t.length) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

export function readJpeg(bytes: Uint8Array): PdfImage {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ImageUnreadable("is not a JPEG image");
  let pos = 2;
  let orientation = 1;
  let adobe = false;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = bytes[pos + 1] as number;
    if (marker === 0xff) {
      pos++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    const len = ((bytes[pos + 2] as number) << 8) | (bytes[pos + 3] as number);
    const seg = bytes.subarray(pos + 4, pos + 2 + len);
    if (marker === 0xe1) orientation = exifOrientation(seg);
    if (marker === 0xee && String.fromCharCode(...seg.subarray(0, 5)) === "Adobe") adobe = true;
    if (SOF.has(marker)) {
      const bpc = seg[0] as number;
      const height = ((seg[1] as number) << 8) | (seg[2] as number);
      const width = ((seg[3] as number) << 8) | (seg[4] as number);
      const comps = seg[5] as number;
      if (!width || !height) throw new ImageUnreadable("is a JPEG with no size");
      if (bpc !== 8)
        throw new ImageUnreadable(`is a ${bpc}-bit JPEG; save it again as a standard JPEG`);
      const cs =
        comps === 1 ? "/DeviceGray" : comps === 3 ? "/DeviceRGB" : comps === 4 ? "/DeviceCMYK" : "";
      if (!cs) throw new ImageUnreadable("is a JPEG in an unusual colour format");
      // Adobe CMYK JPEGs store inverted values.
      const decode = comps === 4 && adobe ? " /Decode [1 0 1 0 1 0 1 0]" : "";
      return {
        width,
        height,
        orientation,
        entries: `/ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode${decode}`,
        data: bytes,
      };
    }
    if (marker === 0xda) break;
    pos += 2 + len;
  }
  throw new ImageUnreadable("is a damaged JPEG (no image header)");
}

// --- PNG -------------------------------------------------------------------------------------

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Largest PNG we unpack to split out transparency (pixels); 40 megapixels is a big screenshot. */
const MAX_ALPHA_PIXELS = 40_000_000;

export async function readPng(bytes: Uint8Array): Promise<PdfImage> {
  if (!PNG_SIG.every((b, i) => bytes[i] === b)) throw new ImageUnreadable("is not a PNG image");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | undefined;
  let trns: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const body = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      depth = body[8] as number;
      colorType = body[9] as number;
      interlace = body[12] as number;
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!width || !height || !idat.length) throw new ImageUnreadable("is a damaged PNG");
  if (interlace) {
    throw new ImageUnreadable("is an interlaced PNG; save it again as JPEG or a plain PNG");
  }
  const compressed = concatBytes(idat);
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels) throw new ImageUnreadable("is a PNG in an unknown colour format");

  if (colorType === 0 || colorType === 2 || colorType === 3) {
    let cs = colorType === 2 ? "/DeviceRGB" : "/DeviceGray";
    if (colorType === 3) {
      if (!palette) throw new ImageUnreadable("is a palette PNG without its palette");
      cs = `[/Indexed /DeviceRGB ${palette.length / 3 - 1} <${hex(palette)}>]`;
    }
    const image: PdfImage = {
      width,
      height,
      orientation: 1,
      entries:
        `/ColorSpace ${cs} /BitsPerComponent ${depth} /Filter /FlateDecode ` +
        `/DecodeParms << /Predictor 15 /Colors ${channels} /BitsPerComponent ${depth} /Columns ${width} >>`,
      data: compressed,
    };
    if (trns && colorType !== 3) {
      // One colour is transparent: a colour-key mask, sample values at the image's depth.
      const keys: number[] = [];
      for (let i = 0; i + 1 < trns.length && keys.length < channels * 2; i += 2) {
        const v = (((trns[i] as number) << 8) | (trns[i + 1] as number)) & ((1 << depth) - 1);
        keys.push(v, v);
      }
      if (keys.length === channels * 2) image.entries += ` /Mask [${keys.join(" ")}]`;
    } else if (trns && colorType === 3 && trns.some((a) => a !== 255)) {
      // Palette entries with alpha: unpack the indices to build a soft mask.
      if (width * height > MAX_ALPHA_PIXELS) {
        throw new ImageUnreadable("is a very large transparent PNG; save it as JPEG");
      }
      const rowBytes = Math.ceil((width * depth) / 8);
      let raw: Uint8Array;
      try {
        raw = unfilterPngRows(await inflate(compressed, (rowBytes + 1) * height), rowBytes, 1);
      } catch {
        throw new ImageUnreadable("is a damaged PNG");
      }
      const alpha = new Uint8Array(width * height);
      const perByte = 8 / depth;
      const maskBits = (1 << depth) - 1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const byte = raw[y * rowBytes + Math.floor(x / perByte)] as number;
          const shift = 8 - depth * ((x % perByte) + 1);
          const index = (byte >> shift) & maskBits;
          alpha[y * width + x] = index < trns.length ? (trns[index] as number) : 255;
        }
      }
      image.smask = {
        entries: "/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode",
        data: await deflate(alpha),
      };
    }
    return image;
  }

  // Gray + alpha or RGBA: unpack, split the alpha into a soft mask, pack both again.
  if (width * height > MAX_ALPHA_PIXELS) {
    throw new ImageUnreadable("is a very large transparent PNG; save it as JPEG");
  }
  const sampleBytes = depth / 8; // 8 or 16 bits for these colour types
  if (sampleBytes !== 1 && sampleBytes !== 2)
    throw new ImageUnreadable("is a PNG of unusual depth");
  const bpp = channels * sampleBytes;
  let raw: Uint8Array;
  try {
    raw = unfilterPngRows(await inflate(compressed, (width * bpp + 1) * height), width * bpp, bpp);
  } catch {
    throw new ImageUnreadable("is a damaged PNG");
  }
  const colorCh = channels - 1;
  const color = new Uint8Array(width * height * colorCh * sampleBytes);
  const alpha = new Uint8Array(width * height * sampleBytes);
  for (let px = 0, c = 0, a = 0, s = 0; px < width * height; px++) {
    for (let k = 0; k < colorCh * sampleBytes; k++) color[c++] = raw[s++] as number;
    for (let k = 0; k < sampleBytes; k++) alpha[a++] = raw[s++] as number;
  }
  const cs = colorCh === 3 ? "/DeviceRGB" : "/DeviceGray";
  return {
    width,
    height,
    orientation: 1,
    entries: `/ColorSpace ${cs} /BitsPerComponent ${depth} /Filter /FlateDecode`,
    data: await deflate(color),
    smask: {
      entries: `/ColorSpace /DeviceGray /BitsPerComponent ${depth} /Filter /FlateDecode`,
      data: await deflate(alpha),
    },
  };
}

/**
 * The image-space to display-space mapping for an EXIF orientation, as affine coefficients:
 * displayed X (0..1, left to right) = xa*a + xb*b + xc and displayed Y (0..1, bottom to top)
 * = ya*a + yb*b + yc, where (a, b) is PDF's unit image square.
 */
export function orientationMatrix(o: number) {
  switch (o) {
    case 2:
      return { x: [-1, 0, 1], y: [0, 1, 0] };
    case 3:
      return { x: [-1, 0, 1], y: [0, -1, 1] };
    case 4:
      return { x: [1, 0, 0], y: [0, -1, 1] };
    case 5:
      return { x: [0, -1, 1], y: [-1, 0, 1] };
    case 6:
      return { x: [0, 1, 0], y: [-1, 0, 1] };
    case 7:
      return { x: [0, 1, 0], y: [1, 0, 0] };
    case 8:
      return { x: [0, -1, 1], y: [1, 0, 0] };
    default:
      return { x: [1, 0, 0], y: [0, 1, 0] };
  }
}
