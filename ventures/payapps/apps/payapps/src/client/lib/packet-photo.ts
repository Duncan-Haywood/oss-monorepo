// HEIC and WebP photos converted to JPEG in the browser before upload, so they go in the one-PDF
// backup packet, which takes PDFs, JPEGs and PNGs only (packetTypeProblem). The browser does the
// decoding: Safari reads HEIC (where iPhone photos come from), every current browser reads WebP, and
// Chrome, Edge and Firefox read a HEIC through their HEVC video decoder where they have one
// (heic-webcodecs.ts, Backup packets part 3).
// When the browser cannot decode the file, the original is uploaded unchanged, as before, and the
// packet lists it with its usual "send separately" note. Nothing is sent anywhere to convert.
//
// What is kept: the picture as it looks (the decoder applies the EXIF orientation, so the JPEG is
// upright with no orientation tag), the file name with .jpg, the file's time (lastModified), which is
// what "Take a photo" names a shot by, and (Attachments part 4) the capture time inside the file: EXIF
// DateTimeOriginal, its offset, and DateTime, read from the HEIC's Exif item or the WebP's EXIF chunk
// and written into the JPEG. What is not: the rest of the original's EXIF (camera, GPS). Photos over
// 12 megapixels are scaled to 12 (MAX_CONVERTED_PIXELS).
//
// Shrinking (Attachments part 3, on unless the contractor turns it off): a JPEG over 1 MB is redrawn
// with its long side at 2560 pixels and sent only if that saves a fifth or more. Its capture time
// (EXIF DateTimeOriginal, its offset, and DateTime) is written back into the smaller JPEG; the rest
// of its EXIF (camera, GPS) is not. HEIC and WebP being converted are drawn at the same size.
import {
  convertedSize,
  convertibleToJpeg,
  formatBytes,
  jpegName,
  SHRINK_JPEG_QUALITY,
  SHRINK_MAX_RATIO,
  shrinkable,
  shrunkSize,
} from "@shared/attachments";
import {
  type CaptureTime,
  captureTimeSegment,
  insertSegment,
  photoCaptureTime,
  readCaptureTime,
} from "@shared/photo-exif";
import { webCodecsHeic } from "./heic-webcodecs";

/** JPEG quality for converted photos: close to a phone camera's own. */
export const JPEG_QUALITY = 0.9;

export interface Decoded {
  width: number;
  height: number;
  /** Draws the picture scaled to width x height and returns it as a JPEG, or null if it cannot. */
  toJpeg(width: number, height: number, quality: number): Promise<Blob | null>;
  close(): void;
}

/** Decodes an image file with the browser's own decoder; null when the browser cannot read it. */
export type Decoder = (file: Blob) => Promise<Decoded | null>;

async function canvasJpeg(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  w: number,
  h: number,
  quality: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // JPEG has no transparency: a WebP with an alpha channel goes on white, as it would print.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  draw(ctx, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

/** createImageBitmap first (applies EXIF orientation by default), then an <img> element. */
const nativeDecoder: Decoder = async (file) => {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return {
        width: bmp.width,
        height: bmp.height,
        toJpeg: (w, h, q) => canvasJpeg((ctx) => ctx.drawImage(bmp, 0, 0, w, h), w, h, q),
        close: () => bmp.close(),
      };
    } catch {
      // Safari can show a HEIC in an <img> where createImageBitmap refuses it: try that next.
    }
  }
  if (typeof Image !== "function" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      return null;
    }
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      toJpeg: (w, h, q) => canvasJpeg((ctx) => ctx.drawImage(img, 0, 0, w, h), w, h, q),
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
};

/**
 * The browser's image decoder, then, for a HEIC it cannot open as an image (Chrome, Edge, Firefox),
 * its HEVC video decoder through WebCodecs (heic-webcodecs.ts).
 */
export const browserDecoder: Decoder = async (file) => {
  const decoded = await nativeDecoder(file);
  if (decoded) return decoded;
  try {
    return await webCodecsHeic(file);
  } catch {
    return null;
  }
};

export interface Converted {
  file: File;
  /** Set when the file was converted or shrunk: what to tell the user. */
  note: string | null;
}

export interface PhotoOptions {
  /** Shrink large photos (Attachments part 3): JPEGs over 1 MB, and HEIC or WebP being converted. */
  shrink?: boolean;
  decode?: Decoder;
}

/**
 * The photo as it should be sent: a HEIC or WebP as a JPEG the packet can hold; with `shrink`, a
 * large JPEG redrawn smaller with its capture time kept; anything else, or anything this browser
 * cannot decode or encode, unchanged.
 */
export async function packetReadyPhoto(file: File, options: PhotoOptions = {}): Promise<Converted> {
  const decode = options.decode ?? browserDecoder;
  const shrink = options.shrink ?? false;
  if (convertibleToJpeg(file.name)) return convert(file, decode, shrink);
  if (shrink && shrinkable({ name: file.name, sizeBytes: file.size })) {
    return shrinkJpeg(file, decode);
  }
  return { file, note: null };
}

async function convert(file: File, decode: Decoder, shrink: boolean): Promise<Converted> {
  let decoded: Decoded | null = null;
  try {
    const time = await fileCaptureTime(file);
    decoded = await decode(file);
    if (!decoded) return { file, note: null };
    const full = convertedSize(decoded.width, decoded.height);
    const size = shrink ? shrunkSize(full.width, full.height) : full;
    const jpeg = await decoded.toJpeg(
      size.width,
      size.height,
      shrink ? SHRINK_JPEG_QUALITY : JPEG_QUALITY,
    );
    if (!jpeg || jpeg.size === 0) return { file, note: null };
    const name = jpegName(file.name);
    const scaled = size.width !== decoded.width;
    const kept = await withCaptureTime(jpeg, time);
    return {
      file: new File([kept ?? jpeg], name, { type: "image/jpeg", lastModified: file.lastModified }),
      note:
        `${file.name} was converted to JPEG (${name}) so it goes in the PDF packet` +
        (scaled
          ? `, scaled from ${decoded.width} x ${decoded.height} to ${size.width} x ${size.height}`
          : "") +
        (kept ? ", with the time it was taken kept." : "."),
    };
  } catch {
    return { file, note: null };
  } finally {
    decoded?.close();
  }
}

/** The capture time inside a HEIC or WebP (or JPEG), or null when it has none or cannot be read. */
async function fileCaptureTime(file: File): Promise<CaptureTime | null> {
  try {
    return photoCaptureTime(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
}

/** The JPEG with the capture time written in, or null when there is no time or it is not a JPEG. */
async function withCaptureTime(
  jpeg: Blob,
  time: CaptureTime | null,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const segment = time ? captureTimeSegment(time) : null;
  if (!segment) return null;
  return insertSegment(new Uint8Array(await jpeg.arrayBuffer()), segment);
}

/**
 * A large phone JPEG redrawn with its long side at SHRINK_LONG_EDGE, upright (the decoder applies
 * the EXIF orientation), with the capture time from its EXIF written back in (shared/photo-exif.ts).
 * Kept only when it saves at least a fifth of the bytes; otherwise the original goes up.
 */
async function shrinkJpeg(file: File, decode: Decoder): Promise<Converted> {
  let decoded: Decoded | null = null;
  try {
    const original = new Uint8Array(await file.arrayBuffer());
    const time = readCaptureTime(original);
    decoded = await decode(file);
    if (!decoded) return { file, note: null };
    const size = shrunkSize(decoded.width, decoded.height);
    const jpeg = await decoded.toJpeg(size.width, size.height, SHRINK_JPEG_QUALITY);
    if (!jpeg || jpeg.size === 0) return { file, note: null };
    let bytes: Uint8Array<ArrayBuffer> = new Uint8Array(await jpeg.arrayBuffer());
    let timeKept = false;
    const segment = time ? captureTimeSegment(time) : null;
    if (segment) {
      const withTime = insertSegment(bytes, segment);
      if (withTime) {
        bytes = withTime;
        timeKept = true;
      }
    }
    if (bytes.length > file.size * SHRINK_MAX_RATIO) return { file, note: null };
    const scaled = size.width !== decoded.width || size.height !== decoded.height;
    return {
      file: new File([bytes], file.name, { type: "image/jpeg", lastModified: file.lastModified }),
      note:
        `${file.name} was made smaller to save storage: ${formatBytes(file.size)} to ${formatBytes(bytes.length)}` +
        (scaled
          ? ` (${decoded.width} x ${decoded.height} to ${size.width} x ${size.height} pixels)`
          : "") +
        (timeKept ? ", with the time it was taken kept." : "."),
    };
  } catch {
    return { file, note: null };
  } finally {
    decoded?.close();
  }
}
