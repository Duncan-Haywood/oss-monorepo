// Reads a PDF someone else's program wrote, far enough to copy its pages into a packet: the
// cross-reference table or stream (with incremental updates through /Prev and hybrid /XRefStm),
// compressed object streams, and a recovery scan for files whose cross-reference is broken. A file
// encrypted with an owner password only (opens without asking, as bank and insurer downloads do) is
// decrypted as its objects are read (crypt.ts); one that needs a password to open is reported as such
// so the contractor can attach a plain copy.
import { openEncryption, type PdfDecryptor, PdfEncryptionError } from "./crypt";
import {
  ascii85Decode,
  asciiHexDecode,
  concatBytes,
  FilterDataError,
  InflateLimitError,
  inflate,
  lzwDecode,
  MAX_INFLATED_BYTES,
  runLengthDecode,
  unfilterPngRows,
  untiffPredictor,
} from "./filters";
import {
  ascii,
  indexOf,
  isDigit,
  isWhite,
  Lexer,
  lastIndexOf,
  PdfDict,
  PdfName,
  PdfRef,
  PdfStream,
  PdfString,
  PdfSyntaxError,
  type PdfValue,
} from "./objects";

/** Why a PDF cannot go into the packet, worded for the contractor. */
export class PdfUnreadable extends Error {}

type XrefEntry =
  | { kind: "offset"; offset: number }
  | { kind: "packed"; stream: number; index: number };

export interface PageRecord {
  ref: PdfRef;
  dict: PdfDict;
  /** Inherited attributes resolved from the page tree. */
  resources: PdfValue | undefined;
  mediaBox: number[];
  cropBox: number[] | undefined;
  rotate: number;
}

/** Most pages a single attachment may add; a 2,000-page drawing set does not belong in a packet. */
export const MAX_PAGES_PER_FILE = 500;

const STARTXREF = ascii("startxref");
const TRAILER = ascii("trailer");

const asNumber = (v: PdfValue | undefined): number | undefined =>
  typeof v === "number" ? v : undefined;

export class PdfReader {
  private readonly xref = new Map<number, XrefEntry>();
  private readonly cache = new Map<number, PdfValue>();
  /** Objects decoded out of object streams, by object number. */
  private readonly packed = new Map<number, PdfValue>();
  private trailer = new PdfDict();
  private recovered = false;
  private resolving = new Set<number>();
  /** Bytes all of this file's decompressed xref and object streams may take together. */
  private inflateLeft = MAX_INFLATED_BYTES;
  /** Set for an encrypted file once its key is known; objects are decrypted as they are read. */
  private crypt: PdfDecryptor | undefined;
  /** The encryption dictionary's object number, which is itself never encrypted. */
  private encryptNum = -1;

  private async decode(s: PdfStream) {
    const data = await decodeStream(s, this.inflateLeft);
    this.inflateLeft -= data.length;
    return data;
  }

  private constructor(readonly bytes: Uint8Array) {}

  static async open(bytes: Uint8Array): Promise<PdfReader> {
    const r = new PdfReader(bytes);
    if (indexOf(bytes.subarray(0, 1024), ascii("%PDF-")) < 0) {
      throw new PdfUnreadable("is not a PDF (no PDF header)");
    }
    try {
      await r.readXrefChain();
      if (!(r.trailer.get("Root") instanceof PdfRef)) throw new PdfSyntaxError("no /Root");
      await r.openEncryption();
      await r.loadObjectStreams();
      if (!(r.resolve(r.trailer.get("Root")) instanceof PdfDict))
        throw new PdfSyntaxError("bad /Root");
      // Read every object once: a single wrong offset sends the whole file to the recovery scan,
      // rather than failing halfway through copying a page.
      for (const num of r.xref.keys()) r.resolve(new PdfRef(num, 0));
    } catch (e) {
      if (e instanceof PdfUnreadable) throw e;
      if (e instanceof InflateLimitError) throw new PdfUnreadable("is too large once decompressed");
      await r.recover();
    }
    return r;
  }

  /** True when the file was encrypted (with an owner password only) and has been decrypted. */
  get wasEncrypted() {
    return this.crypt !== undefined;
  }

  /** Reads the trailer's /Encrypt, if any, and works out the key for the empty user password. */
  private async openEncryption() {
    const enc = this.trailer.get("Encrypt");
    if (enc === undefined || enc === null || this.crypt) return;
    if (enc instanceof PdfRef) this.encryptNum = enc.num;
    const dict = this.resolve(enc);
    if (!(dict instanceof PdfDict))
      throw new PdfUnreadable("is encrypted and its encryption dictionary is missing");
    const ids = this.resolve(this.trailer.get("ID"));
    const id0 =
      Array.isArray(ids) && ids[0] instanceof PdfString ? ids[0].bytes : new Uint8Array(0);
    try {
      this.crypt = await openEncryption(dict, id0);
    } catch (e) {
      if (e instanceof PdfEncryptionError) throw new PdfUnreadable(e.message);
      throw e;
    }
    // Anything read before the key was known (the encryption dictionary aside) was read raw.
    for (const k of [...this.cache.keys()]) if (k !== this.encryptNum) this.cache.delete(k);
  }

  /** Decrypts the strings and stream data of indirect object `num gen`. */
  private decryptObject(v: PdfValue, num: number, gen: number): PdfValue {
    const crypt = this.crypt as PdfDecryptor;
    const walk = (x: PdfValue, depth: number): PdfValue => {
      if (depth > 64) throw new PdfSyntaxError("nesting too deep");
      if (x instanceof PdfString) return new PdfString(crypt.decryptString(x.bytes, num, gen));
      if (Array.isArray(x)) return x.map((y) => walk(y, depth + 1));
      if (x instanceof PdfDict) {
        const d = new PdfDict();
        for (const [k, y] of x.map) d.map.set(k, walk(y, depth + 1));
        return d;
      }
      if (x instanceof PdfStream) {
        const type = x.dict.type();
        const d = walk(x.dict, depth + 1) as PdfDict;
        // Cross-reference streams are never encrypted, nor the metadata under /EncryptMetadata false.
        if (type === "XRef" || (type === "Metadata" && !crypt.encryptMetadata)) {
          return new PdfStream(d, x.data);
        }
        // A /Crypt filter names its own crypt filter; only /Identity (no encryption) is in use.
        const f = d.get("Filter");
        const filters = Array.isArray(f) ? f : f === undefined || f === null ? [] : [f];
        const ci = filters.findIndex((n) => n instanceof PdfName && n.name === "Crypt");
        if (ci >= 0) {
          const parms = d.get("DecodeParms");
          const plist = Array.isArray(parms)
            ? [...parms]
            : filters.length === 1
              ? [parms ?? null]
              : [];
          const p = plist[ci];
          const name = p instanceof PdfDict ? p.get("Name") : undefined;
          if (name instanceof PdfName && name.name !== "Identity") {
            throw new PdfUnreadable("uses an encryption method PayApps cannot read");
          }
          const rest = filters.filter((_, i) => i !== ci);
          const restParms = plist.filter((_, i) => i !== ci);
          if (rest.length) d.set("Filter", rest);
          else d.map.delete("Filter");
          if (restParms.length && rest.length) d.set("DecodeParms", restParms);
          else d.map.delete("DecodeParms");
          return new PdfStream(d, x.data);
        }
        return new PdfStream(d, crypt.decryptStream(x.data, num, gen));
      }
      return x;
    };
    return walk(v, 0);
  }

  /** True when the cross-reference had to be rebuilt by scanning the file. */
  get wasRecovered() {
    return this.recovered;
  }

  // --- cross-reference -------------------------------------------------------------------

  private async readXrefChain() {
    const b = this.bytes;
    const at = lastIndexOf(b, STARTXREF);
    if (at < 0) throw new PdfSyntaxError("no startxref");
    const lx = new Lexer(b, at + STARTXREF.length);
    let offset = Number(lx.word());
    const seen = new Set<number>();
    let first = true;
    while (Number.isInteger(offset) && offset >= 0 && offset < b.length && !seen.has(offset)) {
      seen.add(offset);
      const trailer = await this.readXrefSection(offset);
      if (first) {
        this.trailer = trailer;
        first = false;
      }
      const hybrid = asNumber(trailer.get("XRefStm"));
      if (hybrid !== undefined && !seen.has(hybrid)) {
        seen.add(hybrid);
        await this.readXrefSection(hybrid);
      }
      const prev = asNumber(trailer.get("Prev"));
      if (prev === undefined) break;
      offset = prev;
    }
    if (first) throw new PdfSyntaxError("no cross-reference section");
  }

  /** Reads one xref table or stream at `offset`; entries already known (newer) win. */
  private async readXrefSection(offset: number): Promise<PdfDict> {
    const b = this.bytes;
    const lx = new Lexer(b, offset);
    lx.skipWhite();
    if (lx.peekWord() === "xref") {
      lx.word();
      for (;;) {
        const w = lx.peekWord();
        if (w === "trailer") break;
        if (!/^\d+$/.test(w)) throw new PdfSyntaxError("bad xref subsection");
        const start = Number(lx.word());
        const count = Number(lx.word());
        for (let i = 0; i < count; i++) {
          const off = Number(lx.word());
          lx.word(); // generation
          const kind = lx.word();
          const num = start + i;
          if (kind === "n" && !this.xref.has(num) && off > 0) {
            this.xref.set(num, { kind: "offset", offset: off });
          } else if (kind === "f" && !this.xref.has(num)) {
            this.xref.set(num, { kind: "offset", offset: 0 });
          } else if (kind !== "n" && kind !== "f") throw new PdfSyntaxError("bad xref entry");
        }
      }
      lx.word(); // trailer
      const trailer = lx.value();
      if (!(trailer instanceof PdfDict)) throw new PdfSyntaxError("bad trailer");
      return trailer;
    }
    // A cross-reference stream: "n g obj << /Type /XRef ... >> stream".
    lx.word();
    lx.word();
    if (lx.word() !== "obj") throw new PdfSyntaxError("startxref points nowhere");
    const stream = lx.value();
    if (!(stream instanceof PdfStream) || stream.dict.type() !== "XRef") {
      throw new PdfSyntaxError("not an xref stream");
    }
    const data = await this.decode(stream);
    const w = stream.dict.get("W");
    if (!Array.isArray(w) || w.length < 3) throw new PdfSyntaxError("xref stream without /W");
    const widths = w.map((x) => (typeof x === "number" ? x : 0));
    const rowLen = widths.reduce((s, x) => s + x, 0);
    const size = asNumber(stream.dict.get("Size")) ?? 0;
    const idx = stream.dict.get("Index");
    const ranges = Array.isArray(idx) ? idx.map((x) => (typeof x === "number" ? x : 0)) : [0, size];
    let row = 0;
    const field = (pos: number, width: number) => {
      let v = 0;
      for (let i = 0; i < width; i++) v = v * 256 + (data[pos + i] as number);
      return v;
    };
    for (let r = 0; r + 1 < ranges.length; r += 2) {
      const start = ranges[r] as number;
      const count = ranges[r + 1] as number;
      for (let i = 0; i < count; i++, row++) {
        const p = row * rowLen;
        if (p + rowLen > data.length) break;
        const type = widths[0] === 0 ? 1 : field(p, widths[0] as number);
        const f2 = field(p + (widths[0] as number), widths[1] as number);
        const f3 = field(p + (widths[0] as number) + (widths[1] as number), widths[2] as number);
        const num = start + i;
        if (this.xref.has(num)) continue;
        if (type === 1) this.xref.set(num, { kind: "offset", offset: f2 });
        else if (type === 2) this.xref.set(num, { kind: "packed", stream: f2, index: f3 });
        else this.xref.set(num, { kind: "offset", offset: 0 });
      }
    }
    return stream.dict;
  }

  /** Decodes every object stream the xref points into, so later lookups stay synchronous. */
  private async loadObjectStreams() {
    const streams = new Set<number>();
    for (const e of this.xref.values()) if (e.kind === "packed") streams.add(e.stream);
    for (const num of streams) {
      const s = this.resolve(new PdfRef(num, 0));
      if (s instanceof PdfStream) await this.unpackObjectStream(num, s, false);
    }
  }

  private async unpackObjectStream(streamNum: number, s: PdfStream, overwrite: boolean) {
    const n = asNumber(s.dict.get("N")) ?? 0;
    const first = asNumber(s.dict.get("First")) ?? 0;
    const data = await this.decode(s);
    const lx = new Lexer(data, 0);
    const heads: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = lx.word();
      const b = lx.word();
      // Digits only: at the end of the data word() returns "", and Number("") is 0, so a hostile
      // /N of two billion would otherwise loop to its count on empty tokens.
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) break;
      heads.push([Number(a), Number(b)]);
    }
    for (const [num, off] of heads) {
      const entry = this.xref.get(num);
      // Only take the object if the xref says it lives here (or we are rebuilding the xref).
      if (!overwrite && !(entry?.kind === "packed" && entry.stream === streamNum)) continue;
      if (overwrite && this.packed.has(num)) continue;
      try {
        this.packed.set(num, new Lexer(data, first + off).value());
      } catch {
        // One bad object in a stream need not sink the page that does not use it.
      }
    }
  }

  /** Rebuilds the object table by scanning for "n g obj" headers (later ones win). */
  private async recover() {
    this.recovered = true;
    this.xref.clear();
    this.cache.clear();
    this.packed.clear();
    const b = this.bytes;
    const objStreams: number[] = [];
    for (let i = 0; i < b.length - 4; i++) {
      // "obj" preceded by whitespace and two integers.
      if (b[i] !== 0x6f || b[i + 1] !== 0x62 || b[i + 2] !== 0x6a) continue;
      const next = b[i + 3];
      if (
        next !== undefined &&
        !isWhite(next) &&
        next !== 0x3c &&
        next !== 0x5b &&
        next !== 0x2f &&
        next !== 0x28
      )
        continue;
      let j = i - 1;
      if (!isWhite(b[j])) continue;
      while (isWhite(b[j])) j--;
      while (isDigit(b[j])) j--;
      if (!isWhite(b[j])) continue;
      while (isWhite(b[j])) j--;
      const end = j + 1;
      while (isDigit(b[j])) j--;
      if (end === j + 1) continue;
      if (j >= 0 && !isWhite(b[j]) && b[j] !== 0x3e && b[j] !== 0x29 && b[j] !== 0x5d) continue;
      const lx = new Lexer(b, j + 1);
      const num = Number(lx.word());
      if (!Number.isInteger(num)) continue;
      this.xref.set(num, { kind: "offset", offset: j + 1 });
    }
    // The trailer: the last "trailer" dictionary with a /Root, else what the cross-reference
    // streams carry, else (below) the catalog we can find. Found before the objects are read, so an
    // encrypted file's key is known first.
    let trailer: PdfDict | undefined;
    for (let at = lastIndexOf(b, TRAILER); at >= 0; at = lastIndexOf(b, TRAILER, at - 1)) {
      try {
        const t = new Lexer(b, at + TRAILER.length).value();
        if (t instanceof PdfDict && t.get("Root") instanceof PdfRef) {
          trailer = t;
          break;
        }
      } catch {
        // keep looking
      }
    }
    if (!trailer) {
      trailer = new PdfDict();
      for (const num of [...this.xref.keys()].sort((x, y) => x - y)) {
        let v: PdfValue;
        try {
          v = this.resolve(new PdfRef(num, 0));
        } catch {
          continue;
        }
        if (v instanceof PdfStream && v.dict.type() === "XRef") {
          for (const k of ["Root", "Encrypt", "Info", "ID"]) {
            const x = v.dict.get(k);
            if (x !== undefined) trailer.set(k, x);
          }
        }
      }
    }
    this.trailer = trailer;
    await this.openEncryption();
    for (const [num, e] of this.xref) {
      if (e.kind !== "offset") continue;
      let v: PdfValue;
      try {
        v = this.resolve(new PdfRef(num, 0));
      } catch (err) {
        if (err instanceof PdfUnreadable) throw err;
        // Unparseable: drop it, so references to it read as null (as for a missing object).
        this.xref.delete(num);
        continue;
      }
      if (v instanceof PdfStream && v.dict.type() === "ObjStm") objStreams.push(num);
    }
    for (const num of objStreams) {
      const s = this.cache.get(num);
      if (s instanceof PdfStream) {
        try {
          await this.unpackObjectStream(num, s, true);
        } catch {
          // unreadable object stream: its objects stay missing
        }
      }
    }
    for (const num of this.packed.keys()) {
      if (!this.xref.has(num)) this.xref.set(num, { kind: "packed", stream: -1, index: 0 });
    }
    if (!(trailer.get("Root") instanceof PdfRef)) {
      for (const num of [...this.xref.keys()].sort((x, y) => x - y)) {
        let v: PdfValue;
        try {
          v = this.resolve(new PdfRef(num, 0));
        } catch {
          continue;
        }
        if (v instanceof PdfDict && v.type() === "Catalog") {
          trailer.set("Root", new PdfRef(num, 0));
          break;
        }
      }
    }
    this.trailer = trailer;
    if (!(this.resolve(trailer.get("Root")) instanceof PdfDict)) {
      throw new PdfUnreadable("is damaged: its page list could not be found");
    }
  }

  // --- objects ----------------------------------------------------------------------------

  /** Follows a reference (or returns a direct value). Missing objects are null, as the spec says. */
  resolve(v: PdfValue | undefined): PdfValue {
    if (v === undefined) return null;
    if (!(v instanceof PdfRef)) return v;
    const num = v.num;
    if (this.cache.has(num)) return this.cache.get(num) as PdfValue;
    if (this.packed.has(num)) return this.packed.get(num) as PdfValue;
    const entry = this.xref.get(num);
    if (entry?.kind !== "offset" || entry.offset <= 0) return null;
    if (this.resolving.has(num)) throw new PdfSyntaxError("circular /Length");
    this.resolving.add(num);
    try {
      const lx = new Lexer(this.bytes, entry.offset, (ref) => {
        const len = this.resolve(ref);
        return typeof len === "number" ? len : undefined;
      });
      const n = Number(lx.word());
      const gen = Number(lx.word());
      if (n !== num || lx.word() !== "obj")
        throw new PdfSyntaxError(`object ${num} is not where the xref says`);
      let value = lx.value();
      if (this.crypt && num !== this.encryptNum) {
        value = this.decryptObject(value, num, Number.isInteger(gen) ? gen : 0);
      }
      this.cache.set(num, value);
      return value;
    } finally {
      this.resolving.delete(num);
    }
  }

  dict(v: PdfValue | undefined): PdfDict | undefined {
    const r = this.resolve(v);
    if (r instanceof PdfDict) return r;
    if (r instanceof PdfStream) return r.dict;
    return undefined;
  }

  private numbers(v: PdfValue | undefined): number[] | undefined {
    const r = this.resolve(v);
    if (!Array.isArray(r) || r.length !== 4) return undefined;
    const out = r.map((x) => this.resolve(x));
    return out.every((x) => typeof x === "number") ? (out as number[]) : undefined;
  }

  /** The pages in reading order, with inherited Resources, MediaBox, CropBox and Rotate. */
  pages(): PageRecord[] {
    const catalog = this.dict(this.trailer.get("Root"));
    const root = catalog?.get("Pages");
    if (!catalog || !(root instanceof PdfRef)) throw new PdfUnreadable("has no page list");
    const out: PageRecord[] = [];
    const seen = new Set<number>();
    type Inherited = {
      resources?: PdfValue;
      mediaBox?: PdfValue;
      cropBox?: PdfValue;
      rotate?: PdfValue;
    };
    const walk = (ref: PdfRef, inh: Inherited, depth: number) => {
      if (depth > 64 || seen.has(ref.num)) return;
      seen.add(ref.num);
      const node = this.dict(ref);
      if (!node) return;
      const here: Inherited = {
        resources: node.get("Resources") ?? inh.resources,
        mediaBox: node.get("MediaBox") ?? inh.mediaBox,
        cropBox: node.get("CropBox") ?? inh.cropBox,
        rotate: node.get("Rotate") ?? inh.rotate,
      };
      const kids = this.resolve(node.get("Kids"));
      if (node.type() === "Pages" || (node.type() !== "Page" && Array.isArray(kids))) {
        if (!Array.isArray(kids)) return;
        for (const k of kids) if (k instanceof PdfRef) walk(k, here, depth + 1);
        return;
      }
      if (out.length >= MAX_PAGES_PER_FILE) {
        throw new PdfUnreadable(`has more than ${MAX_PAGES_PER_FILE} pages`);
      }
      const rot = this.resolve(here.rotate);
      out.push({
        ref,
        dict: node,
        resources: here.resources,
        mediaBox: this.numbers(here.mediaBox) ?? [0, 0, 612, 792],
        cropBox: this.numbers(here.cropBox),
        rotate: typeof rot === "number" ? (((Math.round(rot / 90) * 90) % 360) + 360) % 360 : 0,
      });
    };
    walk(root, {}, 0);
    if (!out.length) throw new PdfUnreadable("has no pages");
    return out;
  }
}

/**
 * Decodes a stream's data through its filter chain: FlateDecode and LZWDecode (each with PNG or
 * TIFF predictors), ASCIIHexDecode, ASCII85Decode and RunLengthDecode, under their full or
 * abbreviated names. Image-only filters (DCT, JPX, JBIG2, CCITT fax) are not decoded: nothing here
 * reads image samples, and pages are copied with their images as they are.
 */
export async function decodeStream(
  s: PdfStream,
  maxBytes = MAX_INFLATED_BYTES,
): Promise<Uint8Array> {
  const f = s.dict.get("Filter");
  const filters = Array.isArray(f) ? f : f === undefined || f === null ? [] : [f];
  const p = s.dict.get("DecodeParms") ?? s.dict.get("DP");
  const parmsList = Array.isArray(p) ? p : [p];
  let data: Uint8Array = s.data;
  try {
    for (let i = 0; i < filters.length; i++) {
      const name = filters[i];
      if (!(name instanceof PdfName)) throw new PdfSyntaxError("bad /Filter");
      const parms = parmsList[i] instanceof PdfDict ? (parmsList[i] as PdfDict) : undefined;
      switch (name.name) {
        case "FlateDecode":
        case "Fl":
          data = predict(await inflate(data, maxBytes), parms);
          break;
        case "LZWDecode":
        case "LZW":
          data = predict(
            lzwDecode(data, asNumber(parms?.get("EarlyChange")) === 0 ? 0 : 1, maxBytes),
            parms,
          );
          break;
        case "ASCIIHexDecode":
        case "AHx":
          data = asciiHexDecode(data, maxBytes);
          break;
        case "ASCII85Decode":
        case "A85":
          data = ascii85Decode(data, maxBytes);
          break;
        case "RunLengthDecode":
        case "RL":
          data = runLengthDecode(data, maxBytes);
          break;
        default:
          throw new PdfSyntaxError(`unsupported filter ${name.name}`);
      }
    }
  } catch (e) {
    if (e instanceof FilterDataError) throw new PdfSyntaxError(e.message);
    throw e;
  }
  return data;
}

/** Reverses a /Predictor from a stream's decode parameters (PNG 10-15 or TIFF 2; 1 is none). */
function predict(data: Uint8Array, parms: PdfDict | undefined) {
  if (!parms) return data;
  const predictor = asNumber(parms.get("Predictor")) ?? 1;
  if (predictor === 1) return data;
  const colors = asNumber(parms.get("Colors")) ?? 1;
  const bpc = asNumber(parms.get("BitsPerComponent")) ?? 8;
  const columns = asNumber(parms.get("Columns")) ?? 1;
  if (colors < 1 || colors > 32 || columns < 1 || ![1, 2, 4, 8, 16].includes(bpc)) {
    throw new PdfSyntaxError("bad predictor parameters");
  }
  if (predictor >= 10) {
    const rowBytes = Math.ceil((colors * bpc * columns) / 8);
    return unfilterPngRows(data, rowBytes, Math.max(1, Math.ceil((colors * bpc) / 8)));
  }
  if (predictor === 2) return untiffPredictor(data, colors, bpc, columns);
  throw new PdfSyntaxError(`unsupported predictor ${predictor}`);
}

export { concatBytes };
