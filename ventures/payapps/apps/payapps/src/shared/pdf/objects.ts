// PDF object model and parser (ISO 32000-1 §7.2-7.3): the subset needed to read another program's
// PDF and copy its pages. Strings and names keep their raw bytes, so nothing is re-encoded.

export class PdfName {
  /** The name's bytes after #xx decoding, as a Latin-1 string, without the slash. */
  constructor(readonly name: string) {}
}

export class PdfString {
  constructor(readonly bytes: Uint8Array) {}
}

/** An indirect reference inside the document being read. */
export class PdfRef {
  constructor(
    readonly num: number,
    readonly gen: number,
  ) {}
}

export class PdfDict {
  readonly map = new Map<string, PdfValue>();
  get(key: string): PdfValue | undefined {
    return this.map.get(key);
  }
  set(key: string, value: PdfValue): this {
    this.map.set(key, value);
    return this;
  }
  /** The value of /Type, if it is a name. */
  type(): string | undefined {
    const t = this.map.get("Type");
    return t instanceof PdfName ? t.name : undefined;
  }
  clone(): PdfDict {
    const d = new PdfDict();
    for (const [k, v] of this.map) d.map.set(k, v);
    return d;
  }
}

export class PdfStream {
  /** `data` is the stream's raw (still encoded) bytes. */
  constructor(
    readonly dict: PdfDict,
    readonly data: Uint8Array,
  ) {}
}

export type PdfValue =
  | null
  | boolean
  | number
  | PdfName
  | PdfString
  | PdfRef
  | PdfDict
  | PdfStream
  | PdfValue[];

export class PdfSyntaxError extends Error {}

const WHITESPACE = new Set([0, 9, 10, 12, 13, 32]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

export const isWhite = (b: number | undefined) => b !== undefined && WHITESPACE.has(b);
const isRegular = (b: number | undefined) =>
  b !== undefined && !WHITESPACE.has(b) && !DELIMITERS.has(b);
const isDigit = (b: number | undefined) => b !== undefined && b >= 0x30 && b <= 0x39;

const hexValue = (b: number) => {
  if (b >= 0x30 && b <= 0x39) return b - 0x30;
  if (b >= 0x41 && b <= 0x46) return b - 0x37;
  if (b >= 0x61 && b <= 0x66) return b - 0x57;
  return -1;
};

/** Resolves a stream's /Length when it is an indirect reference. */
export type LengthResolver = (ref: PdfRef) => number | undefined;

/** Hard limit on nesting, so a hostile file cannot exhaust the stack. */
const MAX_DEPTH = 200;

export class Lexer {
  pos: number;
  constructor(
    readonly bytes: Uint8Array,
    start = 0,
    private readonly resolveLength?: LengthResolver,
  ) {
    this.pos = start;
  }

  skipWhite() {
    const b = this.bytes;
    while (this.pos < b.length) {
      const c = b[this.pos];
      if (isWhite(c)) this.pos++;
      else if (c === 0x25) {
        while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  /** Reads a bare keyword or number token (regular characters), or "" at a delimiter. */
  word(): string {
    this.skipWhite();
    const start = this.pos;
    while (isRegular(this.bytes[this.pos])) this.pos++;
    let s = "";
    for (let i = start; i < this.pos; i++) s += String.fromCharCode(this.bytes[i] as number);
    return s;
  }

  peekWord(): string {
    const at = this.pos;
    const w = this.word();
    this.pos = at;
    return w;
  }

  /** Parses one object. Integers followed by `gen R` become references. */
  value(depth = 0): PdfValue {
    if (depth > MAX_DEPTH) throw new PdfSyntaxError("objects nested too deeply");
    this.skipWhite();
    const b = this.bytes;
    const c = b[this.pos];
    if (c === undefined) throw new PdfSyntaxError("unexpected end of file");
    if (c === 0x2f) return this.name();
    if (c === 0x28) return this.literalString();
    if (c === 0x3c) {
      if (b[this.pos + 1] === 0x3c) return this.dictOrStream(depth);
      return this.hexString();
    }
    if (c === 0x5b) {
      this.pos++;
      const arr: PdfValue[] = [];
      for (;;) {
        this.skipWhite();
        if (this.pos >= b.length) throw new PdfSyntaxError("unterminated array");
        if (b[this.pos] === 0x5d) {
          this.pos++;
          return arr;
        }
        arr.push(this.value(depth + 1));
      }
    }
    if (c === 0x7b || c === 0x7d) {
      // PostScript calculator braces only appear inside function streams; skip them.
      this.pos++;
      return null;
    }
    const w = this.word();
    if (w === "") {
      this.pos++;
      throw new PdfSyntaxError(`unexpected byte ${c}`);
    }
    if (w === "true") return true;
    if (w === "false") return false;
    if (w === "null") return null;
    const n = Number(w);
    if (Number.isNaN(n)) {
      // Some writers emit numbers like "--5" or "1.2.3"; read what parses, else zero.
      const m = /^[+-]*(\d*\.?\d*)/.exec(w);
      const lenient = m?.[1] ? Number(m[1]) : 0;
      return Number.isNaN(lenient) ? 0 : lenient;
    }
    if (/^\d+$/.test(w)) {
      // Possible "num gen R".
      const save = this.pos;
      const gen = this.word();
      if (/^\d+$/.test(gen)) {
        const r = this.word();
        if (r === "R") return new PdfRef(n, Number(gen));
      }
      this.pos = save;
    }
    return n;
  }

  private name(): PdfName {
    const b = this.bytes;
    this.pos++; // slash
    let s = "";
    while (isRegular(b[this.pos])) {
      const ch = b[this.pos] as number;
      if (ch === 0x23 && this.pos + 2 < b.length) {
        const hi = hexValue(b[this.pos + 1] as number);
        const lo = hexValue(b[this.pos + 2] as number);
        if (hi >= 0 && lo >= 0) {
          s += String.fromCharCode(hi * 16 + lo);
          this.pos += 3;
          continue;
        }
      }
      s += String.fromCharCode(ch);
      this.pos++;
    }
    return new PdfName(s);
  }

  private literalString(): PdfString {
    const b = this.bytes;
    this.pos++;
    const out: number[] = [];
    let depth = 1;
    while (this.pos < b.length) {
      const ch = b[this.pos++] as number;
      if (ch === 0x5c) {
        const e = b[this.pos++];
        if (e === undefined) break;
        if (e === 0x6e) out.push(10);
        else if (e === 0x72) out.push(13);
        else if (e === 0x74) out.push(9);
        else if (e === 0x62) out.push(8);
        else if (e === 0x66) out.push(12);
        else if (e === 13) {
          if (b[this.pos] === 10) this.pos++;
        } else if (e === 10) {
          // line continuation
        } else if (e >= 0x30 && e <= 0x37) {
          let v = e - 0x30;
          for (let k = 0; k < 2; k++) {
            const d = b[this.pos];
            if (d === undefined || d < 0x30 || d > 0x37) break;
            v = v * 8 + (d - 0x30);
            this.pos++;
          }
          out.push(v & 0xff);
        } else out.push(e);
      } else if (ch === 0x28) {
        depth++;
        out.push(ch);
      } else if (ch === 0x29) {
        depth--;
        if (depth === 0) return new PdfString(Uint8Array.from(out));
        out.push(ch);
      } else out.push(ch);
    }
    throw new PdfSyntaxError("unterminated string");
  }

  private hexString(): PdfString {
    const b = this.bytes;
    this.pos++;
    const out: number[] = [];
    let hi = -1;
    while (this.pos < b.length) {
      const ch = b[this.pos++] as number;
      if (ch === 0x3e) {
        if (hi >= 0) out.push(hi * 16);
        return new PdfString(Uint8Array.from(out));
      }
      const v = hexValue(ch);
      if (v < 0) continue;
      if (hi < 0) hi = v;
      else {
        out.push(hi * 16 + v);
        hi = -1;
      }
    }
    throw new PdfSyntaxError("unterminated hex string");
  }

  private dictOrStream(depth: number): PdfDict | PdfStream {
    const b = this.bytes;
    this.pos += 2;
    const dict = new PdfDict();
    for (;;) {
      this.skipWhite();
      if (this.pos >= b.length) throw new PdfSyntaxError("unterminated dictionary");
      if (b[this.pos] === 0x3e && b[this.pos + 1] === 0x3e) {
        this.pos += 2;
        break;
      }
      if (b[this.pos] !== 0x2f) {
        // A stray token where a key belongs: skip it rather than give up on the file.
        this.value(depth + 1);
        continue;
      }
      const key = this.name().name;
      this.skipWhite();
      if (b[this.pos] === 0x3e && b[this.pos + 1] === 0x3e) {
        dict.set(key, null);
        continue;
      }
      dict.set(key, this.value(depth + 1));
    }
    const save = this.pos;
    if (this.word() !== "stream") {
      this.pos = save;
      return dict;
    }
    // The keyword is followed by CRLF or LF (a lone CR is tolerated).
    if (b[this.pos] === 13) this.pos++;
    if (b[this.pos] === 10) this.pos++;
    const start = this.pos;
    let length: number | undefined;
    const raw = dict.get("Length");
    if (typeof raw === "number") length = raw;
    else if (raw instanceof PdfRef) length = this.resolveLength?.(raw);
    let end = -1;
    if (length !== undefined && length >= 0 && start + length <= b.length) {
      const after = new Lexer(b, start + length);
      after.skipWhite();
      if (after.word() === "endstream") {
        end = start + length;
        this.pos = after.pos;
      }
    }
    if (end < 0) {
      // Wrong or missing /Length: find the endstream keyword instead.
      const at = indexOf(b, ENDSTREAM, start);
      if (at < 0) throw new PdfSyntaxError("stream without endstream");
      end = at;
      if (b[end - 1] === 10) end--;
      if (b[end - 1] === 13) end--;
      this.pos = at + ENDSTREAM.length;
    }
    return new PdfStream(dict, b.subarray(start, end));
  }
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const ENDSTREAM = ascii("endstream");

/** First index of `needle` in `hay` at or after `from`, or -1. */
export function indexOf(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  const first = needle[0];
  const last = hay.length - needle.length;
  outer: for (let i = Math.max(0, from); i <= last; i++) {
    if (hay[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Last index of `needle` in `hay` that starts at or before `before`, or -1. */
export function lastIndexOf(hay: Uint8Array, needle: Uint8Array, before = hay.length): number {
  for (let i = Math.min(before, hay.length - needle.length); i >= 0; i--) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

export { ascii, isDigit };
