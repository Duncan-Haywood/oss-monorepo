// Reads the text drawn on a PDF's pages, for the offline document converter (FakeDocumentConverter:
// tests, `pnpm demo` and the e2e suite). Production reads PDFs with Workers AI `toMarkdown`; this is
// not a replacement for it, only enough for a drawing's title block and notes to reach the
// rule-based extractor without a network.
//
// What it reads: the page tree in order, each page's content streams (uncompressed or FlateDecode
// without predictors) and the form XObjects they draw, from plain objects and compressed object
// streams. Strings are decoded through the font's ToUnicode CMap when it has one (Chromium and
// LibreOffice embed subset fonts with Identity-H encoding, which is unreadable without it), else as
// single bytes (standard 14 fonts, WinAnsi, read as Latin-1). Lines break where the text moves to a
// new baseline.
//
// What it does not: encryption, other filters (LZW, DCT, JBIG2), fonts with neither ToUnicode nor a
// one-byte encoding, text in images (a scan reads as empty, as it should: nothing was read). Every
// loop is bounded, so a hostile file costs at most a few megabytes of work.
import { inflate, latin1 } from "./pdf-pages";

const MAX_OBJECTS = 20_000;
const MAX_PAGES = 500;
const MAX_FORM_DEPTH = 8;
const MAX_TREE_DEPTH = 32;
const MAX_OUTPUT_CHARS = 200_000;
const MAX_OBJECT_STREAMS = 400;

interface PdfObject {
  /** The object's text with any stream data cut out. */
  body: string;
  /** The stream's raw bytes, when the object is a stream. */
  stream?: Uint8Array;
}

type Value = { ref: number } | { inline: string } | null;

/** The value after `/Key` in a dictionary: an indirect reference, or the inline dict/array/token. */
function dictValue(body: string, key: string): Value {
  const re = new RegExp(`/${key}(?![A-Za-z0-9#])\\s*`, "g");
  // The first match at dictionary depth 1 (a key of this dictionary, not of a nested one).
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (depthAt(body, m.index) !== 1) continue;
    const at = m.index + m[0].length;
    const ref = /^(\d+)\s+\d+\s+R(?![A-Za-z])/.exec(body.slice(at, at + 32));
    if (ref?.[1]) return { ref: Number(ref[1]) };
    if (body.startsWith("<<", at)) return { inline: balanced(body, at, "<<", ">>") };
    if (body[at] === "[") return { inline: balanced(body, at, "[", "]") };
    const tok = /^[^\s/<>[\]()]+|^\/[^\s/<>[\]()]+/.exec(body.slice(at, at + 64));
    return tok ? { inline: tok[0] } : null;
  }
  return null;
}

/** Dictionary depth at `at` (ignoring strings, which rarely hold "<<" in the dictionaries read here). */
function depthAt(body: string, at: number) {
  let d = 0;
  for (let i = 0; i < at; i++) {
    if (body[i] === "<" && body[i + 1] === "<") {
      d++;
      i++;
    } else if (body[i] === ">" && body[i + 1] === ">") {
      d--;
      i++;
    }
  }
  return d;
}

function balanced(s: string, at: number, open: string, close: string) {
  let d = 0;
  for (let i = at; i < s.length; i++) {
    if (s.startsWith(open, i)) {
      d++;
      i += open.length - 1;
    } else if (s.startsWith(close, i)) {
      d--;
      i += close.length - 1;
      if (d === 0) return s.slice(at, i + 1);
    }
  }
  return s.slice(at);
}

const refsIn = (s: string) =>
  [...s.matchAll(/(\d+)\s+\d+\s+R(?![A-Za-z])/g)].map((m) => Number(m[1]));

/** `/Name n 0 R` pairs of a resource dictionary (fonts, XObjects). */
function namedRefs(dict: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of dict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R(?![A-Za-z])/g)) {
    if (m[1] && m[2]) out.set(m[1], Number(m[2]));
  }
  return out;
}

/** Every object in the file; a later definition (an incremental update) replaces an earlier one. */
function readObjects(bytes: Uint8Array, text: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const re = /(?:^|[\s>\]])(\d+)\s+\d+\s+obj\b/g;
  for (let m = re.exec(text); m && objects.size < MAX_OBJECTS; m = re.exec(text)) {
    const start = m.index + m[0].length;
    const streamKw = /\bstream\r?\n/g;
    streamKw.lastIndex = start;
    const end = text.indexOf("endobj", start);
    const kw = streamKw.exec(text);
    if (kw && (end < 0 || kw.index < end)) {
      const body = text.slice(start, kw.index);
      const dataStart = kw.index + kw[0].length;
      let dataEnd = text.indexOf("endstream", dataStart);
      if (dataEnd < 0) continue;
      const len = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(body);
      if (len?.[1] && dataStart + Number(len[1]) <= dataEnd) dataEnd = dataStart + Number(len[1]);
      else
        while (dataEnd > dataStart && (text[dataEnd - 1] === "\n" || text[dataEnd - 1] === "\r"))
          dataEnd--;
      objects.set(Number(m[1]), { body, stream: bytes.subarray(dataStart, dataEnd) });
      re.lastIndex = dataEnd;
    } else {
      objects.set(Number(m[1]), { body: text.slice(start, end < 0 ? undefined : end) });
      if (end >= 0) re.lastIndex = end;
    }
  }
  return objects;
}

/** The decoded bytes of a stream object, or null for a filter this reader does not handle. */
async function decode(obj: PdfObject | undefined): Promise<Uint8Array | null> {
  if (!obj?.stream) return null;
  const filter = dictValue(obj.body, "Filter");
  if (!filter) return obj.stream;
  if (!("inline" in filter)) return null;
  const names = filter.inline.match(/\/[A-Za-z0-9]+/g) ?? [];
  if (names.length !== 1 || names[0] !== "/FlateDecode") return null;
  const parms = dictValue(obj.body, "DecodeParms");
  const predictor = parms && "inline" in parms ? /\/Predictor\s+(\d+)/.exec(parms.inline) : null;
  if (parms && !("inline" in parms)) return null;
  if (predictor && predictor[1] !== "1") return null;
  return inflate(obj.stream);
}

/** Objects packed in compressed object streams (PDF 1.5+), added where the file has no plain copy. */
async function readObjectStreams(objects: Map<number, PdfObject>) {
  let seen = 0;
  for (const obj of [...objects.values()]) {
    if (seen >= MAX_OBJECT_STREAMS || objects.size >= MAX_OBJECTS) break;
    if (!/\/Type\s*\/ObjStm(?![A-Za-z0-9#])/.test(obj.body)) continue;
    seen++;
    const n = Number(/\/N\s+(\d+)/.exec(obj.body)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(obj.body)?.[1] ?? -1);
    const data = await decode(obj);
    if (!data || first < 0) continue;
    const s = latin1(data);
    const nums = s.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n && 2 * i + 1 < nums.length; i++) {
      const num = nums[2 * i] as number;
      const off = first + (nums[2 * i + 1] as number);
      const next = 2 * i + 3 < nums.length ? first + (nums[2 * i + 3] as number) : s.length;
      if (!objects.has(num)) objects.set(num, { body: s.slice(off, next) });
    }
  }
}

interface Font {
  /** Code to text, from the ToUnicode CMap. */
  map: Map<number, string> | null;
  /** Bytes per character code. */
  width: 1 | 2;
}

const utf16be = (hex: string) => {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4)
    out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
};

/** A ToUnicode CMap: bfchar and bfrange entries, and the code width from its codespace. */
function parseCmap(s: string): Font {
  const map = new Map<number, string>();
  const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(s);
  const width: 1 | 2 = space?.[1] && space[1].length <= 2 ? 1 : 2;
  for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      if (map.size < 65_536) map.set(parseInt(m[1] ?? "0", 16), utf16be(m[2] ?? ""));
    }
  }
  for (const block of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1] ?? "";
    for (const m of body.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g,
    )) {
      const lo = parseInt(m[1] ?? "0", 16);
      const hi = Math.min(parseInt(m[2] ?? "0", 16), lo + 65_535);
      const dst = m[3] ?? "";
      if (dst.startsWith("[")) {
        const list = [...dst.matchAll(/<([0-9A-Fa-f]*)>/g)].map((d) => utf16be(d[1] ?? ""));
        list.forEach((t, i) => {
          if (lo + i <= hi && map.size < 65_536) map.set(lo + i, t);
        });
      } else {
        const base = utf16be(dst.slice(1, -1));
        if (!base) continue;
        const head = base.slice(0, -1);
        const last = base.charCodeAt(base.length - 1);
        for (let c = lo; c <= hi && map.size < 65_536; c++) {
          map.set(c, head + String.fromCharCode(last + (c - lo)));
        }
      }
    }
  }
  return { map, width };
}

/** Resolves an indirect reference or keeps an inline value as an object body. */
function resolve(objects: Map<number, PdfObject>, v: Value): string | null {
  if (!v) return null;
  if ("ref" in v) return objects.get(v.ref)?.body ?? null;
  return v.inline;
}

class Reader {
  private fonts = new Map<number, Font>();
  private out: string[] = [];
  private chars = 0;

  constructor(private objects: Map<number, PdfObject>) {}

  private async font(num: number): Promise<Font> {
    const cached = this.fonts.get(num);
    if (cached) return cached;
    const body = this.objects.get(num)?.body ?? "";
    const type0 = /\/Subtype\s*\/Type0/.test(body);
    const tu = dictValue(body, "ToUnicode");
    let font: Font = { map: null, width: type0 ? 2 : 1 };
    if (tu && "ref" in tu) {
      const data = await decode(this.objects.get(tu.ref));
      if (data) {
        const cmap = parseCmap(latin1(data));
        font = { map: cmap.map, width: type0 ? 2 : cmap.width };
      }
    }
    this.fonts.set(num, font);
    return font;
  }

  /** The page tree's leaves in reading order, or every page object when there is no catalog. */
  pages(): number[] {
    const catalog = [...this.objects.entries()]
      .filter(([, o]) => /\/Type\s*\/Catalog(?![A-Za-z0-9#])/.test(o.body))
      .at(-1);
    const root = catalog ? dictValue(catalog[1].body, "Pages") : null;
    const out: number[] = [];
    const seen = new Set<number>();
    const walk = (num: number, depth: number) => {
      if (seen.has(num) || depth > MAX_TREE_DEPTH || out.length >= MAX_PAGES) return;
      seen.add(num);
      const body = this.objects.get(num)?.body ?? "";
      if (/\/Type\s*\/Page(?![A-Za-z0-9#])/.test(body)) {
        out.push(num);
        return;
      }
      const kids = resolve(this.objects, dictValue(body, "Kids"));
      for (const k of kids ? refsIn(kids) : []) walk(k, depth + 1);
    };
    if (root && "ref" in root) walk(root.ref, 0);
    if (out.length > 0) return out;
    return [...this.objects.entries()]
      .filter(([, o]) => /\/Type\s*\/Page(?![A-Za-z0-9#])/.test(o.body))
      .map(([n]) => n)
      .sort((a, b) => a - b)
      .slice(0, MAX_PAGES);
  }

  /** A page's resources, inherited from its ancestors when it has none of its own. */
  private resources(num: number): string {
    let body = this.objects.get(num)?.body ?? "";
    for (let i = 0; i < MAX_TREE_DEPTH; i++) {
      const res = resolve(this.objects, dictValue(body, "Resources"));
      if (res) return res;
      const parent = dictValue(body, "Parent");
      if (!parent || !("ref" in parent)) break;
      body = this.objects.get(parent.ref)?.body ?? "";
    }
    return "";
  }

  async page(num: number) {
    const body = this.objects.get(num)?.body ?? "";
    const contents = dictValue(body, "Contents");
    const nums = !contents
      ? []
      : "ref" in contents
        ? // A reference to an array of streams, or to the one stream.
          this.objects.get(contents.ref)?.stream
          ? [contents.ref]
          : refsIn(this.objects.get(contents.ref)?.body ?? "")
        : refsIn(contents.inline);
    const parts: string[] = [];
    for (const n of nums) {
      const data = await decode(this.objects.get(n));
      if (data) parts.push(latin1(data));
    }
    await this.run(parts.join("\n"), this.resources(num), 0);
    this.newline();
    this.newline();
  }

  private emit(s: string) {
    if (this.chars >= MAX_OUTPUT_CHARS) return;
    this.out.push(s);
    this.chars += s.length;
  }

  private newline() {
    if (this.out.length > 0 && !this.out.at(-1)?.endsWith("\n\n")) this.emit("\n");
  }

  private async run(content: string, resources: string, depth: number) {
    const fontDict = resolve(this.objects, dictValue(resources, "Font"));
    const fonts = fontDict ? namedRefs(fontDict) : new Map<string, number>();
    const xDict = resolve(this.objects, dictValue(resources, "XObject"));
    const xobjects = xDict ? namedRefs(xDict) : new Map<string, number>();
    let font: Font = { map: null, width: 1 };
    // The baseline in text space (a line's y; a Tm sets it, Td/TD/T* move it, BT resets it). A string
    // shown on a different baseline from the last one starts a new line. Moves along the same baseline
    // add nothing: writers split runs mid-word for kerning (Chromium writes "11" as two runs), and
    // word spaces are glyphs in the strings.
    let y = 0;
    let leading = 0;
    let shownY: number | null = null;
    const ops: (string | number | { str: Uint8Array; hex: boolean } | unknown[])[] = [];

    const show = (s: unknown) => {
      if (!s || typeof s !== "object" || !("str" in s)) return;
      if (shownY !== null && Math.abs(y - shownY) > 0.01) this.newline();
      shownY = y;
      this.emit(this.decodeString((s as { str: Uint8Array }).str, font));
    };
    // T* (and ' and ") start the next line even when no leading is set.
    const nextLine = () => {
      y -= leading;
      this.newline();
      shownY = y;
    };
    for (const tok of tokens(content)) {
      if (typeof tok !== "object" || tok === null || !("op" in tok)) {
        ops.push(tok as never);
        if (ops.length > 64) ops.shift();
        continue;
      }
      const op = tok.op;
      const args = ops.splice(0);
      const num = (i: number) => {
        const v = args[i];
        return typeof v === "number" ? v : 0;
      };
      if (op === "Tf") {
        const name = args.find((a) => typeof a === "string" && a.startsWith("/")) as
          | string
          | undefined;
        const n = name ? fonts.get(name.slice(1)) : undefined;
        font = n !== undefined ? await this.font(n) : { map: null, width: 1 };
      } else if (op === "Tj") {
        show(args.at(-1));
      } else if (op === "'" || op === '"') {
        nextLine();
        show(args.at(-1));
      } else if (op === "TJ") {
        const arr = args.at(-1);
        if (Array.isArray(arr)) {
          for (const el of arr) {
            if (typeof el === "number") {
              // A gap wider than about a quarter of an em reads as a word space.
              if (el < -250 && !this.out.at(-1)?.endsWith(" ")) this.emit(" ");
            } else show(el);
          }
        }
      } else if (op === "Td" || op === "TD") {
        y += num(1);
        if (op === "TD") leading = -num(1);
      } else if (op === "TL") {
        leading = num(0);
      } else if (op === "T*") {
        nextLine();
      } else if (op === "Tm") {
        y = num(5);
      } else if (op === "BT") {
        y = 0;
      } else if (op === "Do" && depth < MAX_FORM_DEPTH) {
        const name = args.at(-1);
        const n = typeof name === "string" ? xobjects.get(name.slice(1)) : undefined;
        const form = n !== undefined ? this.objects.get(n) : undefined;
        if (form && /\/Subtype\s*\/Form/.test(form.body)) {
          const data = await decode(form);
          if (data) {
            const own = resolve(this.objects, dictValue(form.body, "Resources"));
            this.newline();
            await this.run(latin1(data), own ?? resources, depth + 1);
            this.newline();
          }
        }
      }
    }
  }

  private decodeString(bytes: Uint8Array, font: Font): string {
    let s = "";
    if (font.width === 2) {
      if (!font.map) return ""; // Identity-H without ToUnicode: glyph ids, not text.
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        s += font.map.get(((bytes[i] as number) << 8) | (bytes[i + 1] as number)) ?? "";
      }
      return s;
    }
    for (const b of bytes) s += font.map?.get(b) ?? String.fromCharCode(b);
    return s;
  }

  text() {
    return this.out
      .join("")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}

type Token = number | string | { str: Uint8Array; hex: boolean } | Token[] | { op: string };

const DELIM = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);
const isSpace = (c: string | undefined) =>
  c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";

/** Tokens of a content stream: operands (numbers, names, strings, arrays) and operators. */
function* tokens(s: string): Generator<Token> {
  const stack: Token[][] = [];
  let i = 0;
  const push = function* (t: Token): Generator<Token> {
    const top = stack.at(-1);
    if (top) top.push(t);
    else yield t;
  };
  while (i < s.length) {
    const c = s[i];
    if (isSpace(c)) {
      i++;
    } else if (c === "%") {
      while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++;
    } else if (c === "(") {
      const bytes: number[] = [];
      let depth = 1;
      i++;
      while (i < s.length && depth > 0) {
        const ch = s[i] as string;
        if (ch === "\\") {
          const n = s[i + 1] ?? "";
          const esc: Record<string, number> = {
            n: 10,
            r: 13,
            t: 9,
            b: 8,
            f: 12,
            "(": 40,
            ")": 41,
            "\\": 92,
          };
          if (n in esc) {
            bytes.push(esc[n] as number);
            i += 2;
          } else if (/[0-7]/.test(n)) {
            const oct = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4))?.[0] ?? "0";
            bytes.push(parseInt(oct, 8) & 0xff);
            i += 1 + oct.length;
          } else if (n === "\r" || n === "\n") {
            i += n === "\r" && s[i + 2] === "\n" ? 3 : 2;
          } else {
            i += 1;
          }
          continue;
        }
        if (ch === "(") depth++;
        if (ch === ")" && --depth === 0) {
          i++;
          break;
        }
        bytes.push(ch.charCodeAt(0) & 0xff);
        i++;
      }
      yield* push({ str: new Uint8Array(bytes), hex: false });
    } else if (c === "<" && s[i + 1] === "<") {
      // An inline dictionary (marked-content properties): skipped whole.
      const d = balanced(s, i, "<<", ">>");
      i += d.length;
    } else if (c === "<") {
      const end = s.indexOf(">", i);
      const hex = s.slice(i + 1, end < 0 ? s.length : end).replace(/[^0-9A-Fa-f]/g, "");
      const padded = hex.length % 2 ? `${hex}0` : hex;
      const bytes = new Uint8Array(padded.length / 2);
      for (let k = 0; k < bytes.length; k++)
        bytes[k] = parseInt(padded.slice(2 * k, 2 * k + 2), 16);
      i = end < 0 ? s.length : end + 1;
      yield* push({ str: bytes, hex: true });
    } else if (c === "[") {
      stack.push([]);
      i++;
    } else if (c === "]") {
      const arr = stack.pop() ?? [];
      i++;
      yield* push(arr);
    } else if (c === "/") {
      let j = i + 1;
      while (j < s.length && !isSpace(s[j]) && !DELIM.has(s[j] as string)) j++;
      yield* push(s.slice(i, j));
      i = j;
    } else if (c === ">" || c === ")" || c === "{" || c === "}") {
      i++;
    } else {
      let j = i;
      while (j < s.length && !isSpace(s[j]) && !DELIM.has(s[j] as string)) j++;
      const word = s.slice(i, j);
      i = j;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
        yield* push(Number(word));
      } else if (word === "ID") {
        // Inline image data runs to "EI" after white space; it is binary and never text.
        const ei = /\sEI(?=[\s]|$)/g;
        ei.lastIndex = i;
        const m = ei.exec(s);
        i = m ? m.index + m[0].length : s.length;
      } else if (word === "true" || word === "false" || word === "null") {
        yield* push(word);
      } else if (word) {
        stack.length = 0;
        yield { op: word };
      }
    }
  }
}

/**
 * The text on a PDF's pages, pages separated by a blank line; "" when the file has no readable text
 * (a scan, encryption, an unsupported filter), and null when the bytes are not a PDF at all.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  const text = latin1(bytes);
  const head = text.indexOf("%PDF-");
  if (head < 0 || head > 1024) return null;
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(text)) return "";
  const objects = readObjects(bytes, text);
  await readObjectStreams(objects);
  const reader = new Reader(objects);
  for (const p of reader.pages()) await reader.page(p);
  return reader.text();
}
