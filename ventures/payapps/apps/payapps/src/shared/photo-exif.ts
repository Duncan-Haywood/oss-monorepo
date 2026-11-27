// A photo's capture time, carried from a phone's JPEG, HEIC or WebP to the JPEG the browser writes
// when it shrinks or converts the photo before upload (client/lib/packet-photo.ts). A canvas writes no
// EXIF at all, so without this the new JPEG would lose when it was taken, which is what a job photo
// proves. The EXIF is found where each format keeps it: a JPEG's APP1 segment, a WebP's RIFF "EXIF"
// chunk, and a HEIC's 'Exif' item, located through the meta box's iinf and iloc boxes (ISO/IEC
// 14496-12 and 23008-12), which is how an iPhone stores it.
//
// Only the time travels: DateTimeOriginal and OffsetTimeOriginal (the Exif sub-IFD) and DateTime
// (IFD 0). Nothing else is copied: not the orientation (the browser has already turned the picture
// upright), not the camera, not GPS. No image library: the EXIF block is a small TIFF structure
// read and written by hand (Exif 2.32, CIPA DC-008, sections 4.6.2 to 4.6.5).

/** EXIF date-time text, "YYYY:MM:DD HH:MM:SS", and an offset "+HH:MM" when the camera wrote one. */
export interface CaptureTime {
  dateTimeOriginal: string | null;
  offsetTimeOriginal: string | null;
  dateTime: string | null;
}

const TAG_DATE_TIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const ASCII = 2;
const LONG = 4;

const DATE_TIME = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/;
const OFFSET = /^[+-]\d{2}:\d{2}$/;

/** The APP1 "Exif\0\0" segment body of a JPEG, or null (not a JPEG, or no EXIF before the image). */
export function exifBody(jpeg: Uint8Array): Uint8Array | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 4 <= jpeg.length) {
    if (jpeg[pos] !== 0xff) return null;
    const marker = jpeg[pos + 1] as number;
    if (marker === 0xff) {
      pos++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null;
    const len = ((jpeg[pos + 2] as number) << 8) | (jpeg[pos + 3] as number);
    if (len < 2) return null;
    const seg = jpeg.subarray(pos + 4, Math.min(jpeg.length, pos + 2 + len));
    if (
      marker === 0xe1 &&
      seg.length >= 14 &&
      seg[0] === 0x45 &&
      seg[1] === 0x78 &&
      seg[2] === 0x69 &&
      seg[3] === 0x66 &&
      seg[4] === 0 &&
      seg[5] === 0
    ) {
      return seg;
    }
    pos += 2 + len;
  }
  return null;
}

/** The capture time in a JPEG's EXIF, or null when it has none worth keeping. */
export function readCaptureTime(jpeg: Uint8Array): CaptureTime | null {
  const body = exifBody(jpeg);
  return body ? tiffCaptureTime(body.subarray(6)) : null;
}

/**
 * The capture time in a JPEG, HEIC (or HEIF) or WebP photo, told apart by their first bytes, not by
 * the name; null for any other file, or one with no time worth keeping.
 */
export function photoCaptureTime(bytes: Uint8Array): CaptureTime | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readCaptureTime(bytes);
  const tiff = webpExif(bytes) ?? heifExif(bytes);
  return tiff ? tiffCaptureTime(tiff) : null;
}

const fourcc = (b: Uint8Array, at: number) =>
  at + 4 <= b.length
    ? String.fromCharCode(
        b[at] as number,
        b[at + 1] as number,
        b[at + 2] as number,
        b[at + 3] as number,
      )
    : "";

/** The TIFF block, with an "Exif\0\0" prefix some writers add taken off. */
function stripExifPrefix(b: Uint8Array): Uint8Array {
  return fourcc(b, 0) === "Exif" && b[4] === 0 && b[5] === 0 ? b.subarray(6) : b;
}

/** A WebP's "EXIF" chunk (RIFF, little-endian sizes, chunks padded to an even length), or null. */
export function webpExif(b: Uint8Array): Uint8Array | null {
  if (fourcc(b, 0) !== "RIFF" || fourcc(b, 8) !== "WEBP") return null;
  const le32 = (o: number) =>
    ((b[o] as number) | ((b[o + 1] as number) << 8) | ((b[o + 2] as number) << 16)) +
    (b[o + 3] as number) * 0x1000000;
  let pos = 12;
  while (pos + 8 <= b.length) {
    const size = le32(pos + 4);
    const start = pos + 8;
    if (start + size > b.length) return null;
    if (fourcc(b, pos) === "EXIF") return stripExifPrefix(b.subarray(start, start + size));
    pos = start + size + (size & 1);
  }
  return null;
}

interface Box {
  type: string;
  /** Where the box's content starts (after its header). */
  start: number;
  end: number;
}

/** The boxes laid end to end in b[from, to): ISO/IEC 14496-12 section 4.2, 64-bit sizes included. */
function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let pos = from;
  while (pos + 8 <= to && out.length < 1000) {
    let size = readUint(b, pos, 4);
    const type = fourcc(b, pos + 4);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > to) break;
      size = readUint(b, pos + 8, 8);
      header = 16;
    } else if (size === 0) {
      size = to - pos;
    }
    if (size < header || pos + size > to) break;
    out.push({ type, start: pos + header, end: pos + size });
    pos += size;
  }
  return out;
}

/** A big-endian unsigned integer of n bytes (0, 4 or 8 in iloc; up to 8 here), or -1 past the end. */
function readUint(b: Uint8Array, at: number, n: number): number {
  if (at + n > b.length) return -1;
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + (b[at + i] as number);
  return v;
}

/**
 * A HEIC's (or any HEIF's) 'Exif' item: found by type in iinf, its bytes gathered from iloc's extents
 * (in the file, construction method 0, or in the meta box's idat, method 1). The item starts with a
 * 4-byte offset to the TIFF header (ISO/IEC 23008-12, annex A.2.1), which libheif and iPhones follow
 * with "Exif\0\0". Null for anything else.
 */
export function heifExif(b: Uint8Array): Uint8Array | null {
  const top = boxes(b, 0, b.length);
  if (top[0]?.type !== "ftyp") return null;
  const meta = top.find((x) => x.type === "meta");
  if (!meta) return null;
  const inner = boxes(b, meta.start + 4, meta.end);
  const iinf = inner.find((x) => x.type === "iinf");
  const iloc = inner.find((x) => x.type === "iloc");
  if (!iinf || !iloc) return null;

  // iinf: a full box, an entry count (16 bits in version 0, else 32), then infe boxes.
  const iinfVersion = b[iinf.start] as number;
  const entriesAt = iinf.start + 4 + (iinfVersion === 0 ? 2 : 4);
  let itemId = -1;
  for (const infe of boxes(b, entriesAt, iinf.end)) {
    if (infe.type !== "infe") continue;
    const v = b[infe.start] as number;
    if (v < 2) continue; // versions 0 and 1 carry no item type
    const idSize = v === 2 ? 2 : 4;
    const id = readUint(b, infe.start + 4, idSize);
    if (fourcc(b, infe.start + 4 + idSize + 2) === "Exif") {
      itemId = id;
      break;
    }
  }
  if (itemId < 0) return null;

  // iloc: section 8.11.3 of ISO/IEC 14496-12.
  const v = b[iloc.start] as number;
  if (v > 2) return null;
  let p = iloc.start + 4;
  const sizes = readUint(b, p, 2);
  if (sizes < 0) return null;
  const offsetSize = sizes >> 12;
  const lengthSize = (sizes >> 8) & 15;
  const baseOffsetSize = (sizes >> 4) & 15;
  const indexSize = v === 1 || v === 2 ? sizes & 15 : 0;
  p += 2;
  const countSize = v < 2 ? 2 : 4;
  const count = readUint(b, p, countSize);
  p += countSize;
  for (let i = 0; i < count && p < iloc.end; i++) {
    const id = readUint(b, p, countSize);
    p += countSize;
    let method = 0;
    if (v === 1 || v === 2) {
      method = readUint(b, p, 2) & 15;
      p += 2;
    }
    p += 2; // data_reference_index
    const base = readUint(b, p, baseOffsetSize);
    p += baseOffsetSize;
    const extents = readUint(b, p, 2);
    p += 2;
    if (id < 0 || base < 0 || extents < 0 || p > iloc.end) return null;
    const parts: [number, number][] = [];
    for (let e = 0; e < extents; e++) {
      p += indexSize;
      const off = readUint(b, p, offsetSize);
      p += offsetSize;
      const len = readUint(b, p, lengthSize);
      p += lengthSize;
      if (off < 0 || len < 0 || p > iloc.end) return null;
      parts.push([base + off, len]);
    }
    if (id !== itemId) continue;
    let origin = 0;
    let limit = b.length;
    if (method === 1) {
      const idat = inner.find((x) => x.type === "idat");
      if (!idat) return null;
      origin = idat.start;
      limit = idat.end;
    } else if (method !== 0) {
      return null;
    }
    let total = 0;
    for (const [off, len] of parts) {
      // A length of 0 means "to the end" (of the file, or of idat).
      const n = len === 0 ? limit - origin - off : len;
      if (n < 0 || origin + off + n > limit) return null;
      total += n;
    }
    if (total > 1 << 20) return null;
    const item = new Uint8Array(total);
    let w = 0;
    for (const [off, len] of parts) {
      const n = len === 0 ? limit - origin - off : len;
      item.set(b.subarray(origin + off, origin + off + n), w);
      w += n;
    }
    const skip = readUint(item, 0, 4);
    if (skip < 0 || 4 + skip > item.length) return null;
    return stripExifPrefix(item.subarray(4 + skip));
  }
  return null;
}

/** The capture time in a TIFF-structured EXIF block, or null when it has none worth keeping. */
function tiffCaptureTime(t: Uint8Array): CaptureTime | null {
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return null;
  const u16 = (o: number) =>
    o + 2 > t.length
      ? -1
      : le
        ? (t[o] as number) | ((t[o + 1] as number) << 8)
        : ((t[o] as number) << 8) | (t[o + 1] as number);
  const u32 = (o: number) => {
    const a = u16(o);
    const b = u16(o + 2);
    if (a < 0 || b < 0) return -1;
    return le ? a + b * 65536 : a * 65536 + b;
  };
  const ascii = (e: number): string | null => {
    if (u16(e + 2) !== ASCII) return null;
    const count = u32(e + 4);
    if (count < 1 || count > 64) return null;
    const at = count <= 4 ? e + 8 : u32(e + 8);
    if (at < 0 || at + count > t.length) return null;
    let s = "";
    for (let i = 0; i < count; i++) {
      const c = t[at + i] as number;
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };
  // Reads one IFD's entries: the tags wanted, as text, and the Exif sub-IFD pointer.
  const readIfd = (ifd: number) => {
    const out = new Map<number, string>();
    let sub = -1;
    const count = u16(ifd);
    if (count < 0 || count > 1000) return { out, sub };
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > t.length) break;
      const tag = u16(e);
      if (tag === TAG_EXIF_IFD && u16(e + 2) === LONG) sub = u32(e + 8);
      else if (
        tag === TAG_DATE_TIME ||
        tag === TAG_DATE_TIME_ORIGINAL ||
        tag === TAG_OFFSET_TIME_ORIGINAL
      ) {
        const v = ascii(e);
        if (v !== null) out.set(tag, v);
      }
    }
    return { out, sub };
  };
  const ifd0 = u32(4);
  if (ifd0 < 8 || ifd0 >= t.length) return null;
  const first = readIfd(ifd0);
  const exif = first.sub >= 8 && first.sub < t.length ? readIfd(first.sub).out : new Map();
  const valid = (v: string | undefined, re: RegExp) =>
    v && re.test(v) && !v.startsWith("0000") ? v : null;
  const result: CaptureTime = {
    dateTimeOriginal: valid(exif.get(TAG_DATE_TIME_ORIGINAL), DATE_TIME),
    offsetTimeOriginal: valid(exif.get(TAG_OFFSET_TIME_ORIGINAL), OFFSET),
    dateTime: valid(first.out.get(TAG_DATE_TIME), DATE_TIME),
  };
  if (!result.dateTimeOriginal && !result.dateTime) return null;
  if (!result.dateTimeOriginal) result.offsetTimeOriginal = null;
  return result;
}

/**
 * An APP1 segment (marker included) holding only the capture time, big-endian TIFF: IFD 0 with
 * DateTime (when known) and the Exif pointer, then the Exif IFD with DateTimeOriginal and
 * OffsetTimeOriginal (when known). Null when there is no time to write.
 */
export function captureTimeSegment(time: CaptureTime): Uint8Array | null {
  const ifd0: [number, number, string | null][] = [];
  if (time.dateTime) ifd0.push([TAG_DATE_TIME, ASCII, time.dateTime]);
  const exif: [number, string][] = [];
  if (time.dateTimeOriginal) exif.push([TAG_DATE_TIME_ORIGINAL, time.dateTimeOriginal]);
  if (time.dateTimeOriginal && time.offsetTimeOriginal)
    exif.push([TAG_OFFSET_TIME_ORIGINAL, time.offsetTimeOriginal]);
  if (exif.length > 0) ifd0.push([TAG_EXIF_IFD, LONG, null]);
  if (ifd0.length === 0) return null;

  // Layout: header (8), IFD 0, IFD 0's strings, Exif IFD, its strings. Every string here is 20
  // bytes ("YYYY:MM:DD HH:MM:SS\0") or 7 ("+HH:MM\0"), so each is stored out of line (over 4 bytes).
  const ifdSize = (n: number) => 2 + n * 12 + 4;
  const strBytes = (s: string) => s.length + 1;
  const ifd0At = 8;
  let next = ifd0At + ifdSize(ifd0.length);
  const ifd0Strings = ifd0.map(([, , s]) => {
    if (s === null) return -1;
    const at = next;
    next += strBytes(s);
    return at;
  });
  const exifAt = exif.length > 0 ? next : -1;
  if (exif.length > 0) next += ifdSize(exif.length);
  const exifStrings = exif.map(([, s]) => {
    const at = next;
    next += strBytes(s);
    return at;
  });
  const tiff = new Uint8Array(next);
  const view = new DataView(tiff.buffer);
  tiff.set([0x4d, 0x4d, 0x00, 0x2a]);
  view.setUint32(4, ifd0At);
  const writeStr = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) tiff[at + i] = s.charCodeAt(i) & 0x7f;
    tiff[at + s.length] = 0;
  };
  view.setUint16(ifd0At, ifd0.length);
  ifd0.forEach(([tag, type, s], i) => {
    const e = ifd0At + 2 + i * 12;
    view.setUint16(e, tag);
    view.setUint16(e + 2, type);
    if (s === null) {
      view.setUint32(e + 4, 1);
      view.setUint32(e + 8, exifAt);
    } else {
      view.setUint32(e + 4, strBytes(s));
      view.setUint32(e + 8, ifd0Strings[i] as number);
      writeStr(ifd0Strings[i] as number, s);
    }
  });
  view.setUint32(ifd0At + 2 + ifd0.length * 12, 0);
  if (exif.length > 0) {
    view.setUint16(exifAt, exif.length);
    exif.forEach(([tag, s], i) => {
      const e = exifAt + 2 + i * 12;
      view.setUint16(e, tag);
      view.setUint16(e + 2, ASCII);
      view.setUint32(e + 4, strBytes(s));
      view.setUint32(e + 8, exifStrings[i] as number);
      writeStr(exifStrings[i] as number, s);
    });
    view.setUint32(exifAt + 2 + exif.length * 12, 0);
  }
  const len = 2 + 6 + tiff.length;
  const seg = new Uint8Array(2 + len);
  seg.set([0xff, 0xe1, len >> 8, len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  seg.set(tiff, 10);
  return seg;
}

/**
 * The JPEG with the segment added after its JFIF APP0 (where a canvas JPEG has one) or straight
 * after SOI, and any EXIF segment it already had left out. Null when the bytes are not a JPEG.
 */
export function insertSegment(
  jpeg: Uint8Array,
  segment: Uint8Array,
): Uint8Array<ArrayBuffer> | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0 && jpeg.length >= 6) {
    at = 4 + (((jpeg[4] as number) << 8) | (jpeg[5] as number));
    if (at > jpeg.length) return null;
  }
  // A canvas writes no EXIF; if a browser ever does, drop it rather than send two.
  let rest = jpeg.subarray(at);
  if (rest[0] === 0xff && rest[1] === 0xe1 && rest.length >= 4) {
    const len = ((rest[2] as number) << 8) | (rest[3] as number);
    rest = rest.subarray(2 + len);
  }
  const out = new Uint8Array(at + segment.length + rest.length);
  out.set(jpeg.subarray(0, at));
  out.set(segment, at);
  out.set(rest, at + segment.length);
  return out;
}
