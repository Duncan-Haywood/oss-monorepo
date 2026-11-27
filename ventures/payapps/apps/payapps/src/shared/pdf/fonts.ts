// Turns the bytes a PDF shows with a font back into text, and measures how wide they are: enough to
// read a bid breakdown or continuation sheet another program printed (ISO 32000-1 §9.6-9.10). A
// ToUnicode CMap wins; otherwise a simple font's encoding (WinAnsi, Standard or MacRoman, with
// /Differences glyph names). A composite font with no ToUnicode map cannot be read: its codes are
// glyph ids, so those characters come back as U+FFFD and the caller counts them.
import { PdfDict, PdfName, type PdfStream, type PdfValue } from "./objects";
import { decodeStream, type PdfReader } from "./reader";

export const UNREADABLE = "�";

interface CodeSpace {
  len: number;
  lo: number;
  hi: number;
}

export interface Glyph {
  /** The text the code stands for ("" for a code with no text, UNREADABLE when unknown). */
  text: string;
  /** Advance width in thousandths of the font size. */
  width: number;
  /** True for the single-byte code 32, which word spacing (Tw) applies to. */
  isSpace: boolean;
}

export interface Font {
  decode(bytes: Uint8Array): Glyph[];
}

// WinAnsiEncoding's 0x80-0x9F (the rest is Latin-1).
const WIN_ANSI_HIGH: Record<number, string> = {
  128: "€",
  130: "‚",
  131: "ƒ",
  132: "„",
  133: "…",
  134: "†",
  135: "‡",
  136: "ˆ",
  137: "‰",
  138: "Š",
  139: "‹",
  140: "Œ",
  142: "Ž",
  145: "‘",
  146: "’",
  147: "“",
  148: "”",
  149: "•",
  150: "–",
  151: "—",
  152: "˜",
  153: "™",
  154: "š",
  155: "›",
  156: "œ",
  158: "ž",
  159: "Ÿ",
};

// Glyph names a /Differences array uses for the characters a schedule of values is made of. Names
// of single letters, "uniXXXX" and "uXXXX" are read by rule below.
const GLYPHS: Record<string, string> = {
  space: " ",
  nbspace: " ",
  exclam: "!",
  quotedbl: '"',
  numbersign: "#",
  dollar: "$",
  percent: "%",
  ampersand: "&",
  quotesingle: "'",
  quoteright: "’",
  quoteleft: "‘",
  quotedblleft: "“",
  quotedblright: "”",
  parenleft: "(",
  parenright: ")",
  asterisk: "*",
  plus: "+",
  comma: ",",
  hyphen: "-",
  minus: "-",
  period: ".",
  slash: "/",
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  colon: ":",
  semicolon: ";",
  less: "<",
  equal: "=",
  greater: ">",
  question: "?",
  at: "@",
  bracketleft: "[",
  backslash: "\\",
  bracketright: "]",
  underscore: "_",
  braceleft: "{",
  bar: "|",
  braceright: "}",
  endash: "–",
  emdash: "—",
  bullet: "•",
  ellipsis: "…",
  degree: "°",
  section: "§",
  paragraph: "¶",
  trademark: "™",
  registered: "®",
  copyright: "©",
  fi: "fi",
  fl: "fl",
  ff: "ff",
  ffi: "ffi",
  ffl: "ffl",
  onehalf: "½",
  onequarter: "¼",
  threequarters: "¾",
  multiply: "×",
  divide: "÷",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  oacute: "ó",
  uacute: "ú",
  iacute: "í",
  ntilde: "ñ",
  ccedilla: "ç",
  udieresis: "ü",
  odieresis: "ö",
  adieresis: "ä",
};

const glyphText = (name: string): string | undefined => {
  if (GLYPHS[name] !== undefined) return GLYPHS[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  const base = name.split(".")[0] ?? name; // "one.oldstyle", "a.sc"
  if (base !== name) return glyphText(base);
  const uni = /^uni([0-9A-Fa-f]{4})+$/.exec(name);
  if (uni) {
    let s = "";
    for (let i = 3; i < name.length; i += 4)
      s += String.fromCharCode(Number.parseInt(name.slice(i, i + 4), 16));
    return s;
  }
  const u = /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (u?.[1]) return String.fromCodePoint(Number.parseInt(u[1], 16));
  return undefined;
};

const MAC_ROMAN_HIGH =
  "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ";

/** The text of a single-byte code in a named base encoding. Standard differs from Latin-1 only in punctuation a schedule rarely uses. */
function baseChar(code: number, encoding: string): string {
  if (encoding === "MacRomanEncoding" && code >= 0x80)
    return MAC_ROMAN_HIGH[code - 0x80] ?? UNREADABLE;
  if (encoding === "StandardEncoding") {
    if (code === 0x27) return "’";
    if (code === 0x60) return "‘";
    if (code >= 0x80) return UNREADABLE;
  }
  if (code >= 0x80 && code <= 0x9f) return WIN_ANSI_HIGH[code] ?? UNREADABLE;
  if (code < 0x20) return code === 9 ? " " : "";
  if (code === 0xa0) return " ";
  return String.fromCharCode(code);
}

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i] as number);
  return s;
};

const hexBytes = (h: string) => {
  const out: number[] = [];
  const t = h.length % 2 ? `${h}0` : h;
  for (let i = 0; i < t.length; i += 2) out.push(Number.parseInt(t.slice(i, i + 2), 16));
  return out;
};
const hexNum = (h: string) => hexBytes(h).reduce((a, b) => a * 256 + b, 0);
const utf16 = (h: string) => {
  const b = hexBytes(h);
  let s = "";
  for (let i = 0; i + 1 < b.length; i += 2)
    s += String.fromCharCode(((b[i] as number) << 8) | (b[i + 1] as number));
  return s;
};

/** Most entries one ToUnicode map may define, so a hostile range cannot fill memory. */
const MAX_CMAP_ENTRIES = 65_536;

export interface ToUnicode {
  spaces: CodeSpace[];
  map: Map<string, string>;
}

/** Parses a ToUnicode CMap's codespace ranges, bfchar and bfrange sections. Keys are `${len}:${code}`. */
export function parseToUnicode(text: string): ToUnicode {
  const spaces: CodeSpace[] = [];
  const map = new Map<string, string>();
  const section = (name: string, fn: (body: string) => void) => {
    const re = new RegExp(`begin${name}([\\s\\S]*?)end${name}`, "g");
    for (let m = re.exec(text); m; m = re.exec(text)) fn(m[1] ?? "");
  };
  section("codespacerange", (body) => {
    for (const m of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = m[1] ?? "";
      spaces.push({ len: Math.ceil(lo.length / 2), lo: hexNum(lo), hi: hexNum(m[2] ?? "") });
    }
  });
  const put = (len: number, code: number, s: string) => {
    if (map.size < MAX_CMAP_ENTRIES) map.set(`${len}:${code}`, s);
  };
  section("bfchar", (body) => {
    for (const m of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      const src = m[1] ?? "";
      put(Math.ceil(src.length / 2), hexNum(src), utf16(m[2] ?? ""));
    }
  });
  section("bfrange", (body) => {
    for (const m of body.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g,
    )) {
      const src = m[1] ?? "";
      const len = Math.ceil(src.length / 2);
      const lo = hexNum(src);
      const hi = Math.min(hexNum(m[2] ?? ""), lo + MAX_CMAP_ENTRIES);
      const dst = m[3] ?? "";
      if (dst.startsWith("[")) {
        const items = [...dst.matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => utf16(x[1] ?? ""));
        for (let c = lo; c <= hi && c - lo < items.length; c++) put(len, c, items[c - lo] ?? "");
      } else {
        const start = hexBytes(dst.slice(1, -1));
        for (let c = lo; c <= hi; c++) {
          // The last byte increments across the range (§9.10.3).
          const bytes = [...start];
          const last = (bytes[bytes.length - 1] ?? 0) + (c - lo);
          bytes[bytes.length - 1] = last & 0xff;
          if (bytes.length >= 2)
            bytes[bytes.length - 2] = ((bytes[bytes.length - 2] ?? 0) + (last >> 8)) & 0xff;
          let s = "";
          for (let i = 0; i + 1 < bytes.length; i += 2)
            s += String.fromCharCode(((bytes[i] as number) << 8) | (bytes[i + 1] as number));
          put(len, c, s);
        }
      }
    }
  });
  return { spaces, map };
}

const num = (v: PdfValue | undefined) => (typeof v === "number" ? v : undefined);

/** Reads the font a page's resources name, for decoding its strings. Never throws: an unreadable font decodes to UNREADABLE. */
export async function loadFont(reader: PdfReader, ref: PdfValue | undefined): Promise<Font> {
  const dict = reader.dict(ref);
  if (!dict) return unknownFont;
  let toUnicode: ToUnicode | null = null;
  const tu = reader.resolve(dict.get("ToUnicode"));
  if (tu && typeof tu === "object" && "data" in tu) {
    try {
      toUnicode = parseToUnicode(latin1(await decodeStream(tu as PdfStream, 4 * 1024 * 1024)));
    } catch {
      toUnicode = null;
    }
  }
  const subtype = dict.get("Subtype");
  if (subtype instanceof PdfName && subtype.name === "Type0")
    return compositeFont(reader, dict, toUnicode);
  return simpleFont(reader, dict, toUnicode);
}

const unknownFont: Font = {
  decode: (bytes) => [...bytes].map((b) => ({ text: UNREADABLE, width: 500, isSpace: b === 32 })),
};

function simpleFont(reader: PdfReader, dict: PdfDict, toUnicode: ToUnicode | null): Font {
  const first = num(reader.resolve(dict.get("FirstChar"))) ?? 0;
  const widthsRaw = reader.resolve(dict.get("Widths"));
  const widths = Array.isArray(widthsRaw) ? widthsRaw.map((w) => num(reader.resolve(w)) ?? 0) : [];
  const desc = reader.dict(dict.get("FontDescriptor"));
  const missing = num(desc ? reader.resolve(desc.get("MissingWidth")) : undefined);
  // Type 3 glyphs are in their own units: scale by the font matrix.
  const fm = reader.resolve(dict.get("FontMatrix"));
  const scale = Array.isArray(fm) && typeof fm[0] === "number" ? Math.abs(fm[0]) * 1000 : 1;
  let base = "WinAnsiEncoding";
  const differences = new Map<number, string>();
  const enc = reader.resolve(dict.get("Encoding"));
  if (enc instanceof PdfName) base = enc.name;
  else if (enc instanceof PdfDict) {
    const b = enc.get("BaseEncoding");
    if (b instanceof PdfName) base = b.name;
    const diffs = reader.resolve(enc.get("Differences"));
    if (Array.isArray(diffs)) {
      let code = 0;
      for (const d of diffs) {
        const v = reader.resolve(d);
        if (typeof v === "number") code = v;
        else if (v instanceof PdfName) differences.set(code++, v.name);
      }
    }
  }
  return {
    decode(bytes) {
      const out: Glyph[] = [];
      for (const code of bytes) {
        let text = toUnicode?.map.get(`1:${code}`);
        if (text === undefined) {
          const name = differences.get(code);
          text = name !== undefined ? (glyphText(name) ?? UNREADABLE) : baseChar(code, base);
        }
        const w = widths[code - first];
        out.push({ text, width: (w ?? missing ?? 500) * scale, isSpace: code === 32 });
      }
      return out;
    },
  };
}

function compositeFont(reader: PdfReader, dict: PdfDict, toUnicode: ToUnicode | null): Font {
  const kids = reader.resolve(dict.get("DescendantFonts"));
  const cid = reader.dict(Array.isArray(kids) ? kids[0] : undefined);
  const dw = num(cid ? reader.resolve(cid.get("DW")) : undefined) ?? 1000;
  const widths = new Map<number, number>();
  const w = cid ? reader.resolve(cid.get("W")) : undefined;
  if (Array.isArray(w)) {
    // [c [w1 w2 ...]] or [cFirst cLast w].
    for (let i = 0; i < w.length && widths.size < MAX_CMAP_ENTRIES; ) {
      const c = num(reader.resolve(w[i]));
      const next = reader.resolve(w[i + 1]);
      if (c === undefined) break;
      if (Array.isArray(next)) {
        next.forEach((x, k) => {
          const v = num(reader.resolve(x));
          if (v !== undefined) widths.set(c + k, v);
        });
        i += 2;
      } else {
        const last = num(next);
        const v = num(reader.resolve(w[i + 2]));
        if (last === undefined || v === undefined) break;
        for (let k = c; k <= last && widths.size < MAX_CMAP_ENTRIES; k++) widths.set(k, v);
        i += 3;
      }
    }
  }
  // Identity-H (and most CMaps a writer embeds) use two-byte codes; the ToUnicode codespace says otherwise when it does.
  const spaces = toUnicode?.spaces.length ? toUnicode.spaces : [{ len: 2, lo: 0, hi: 0xffff }];
  return {
    decode(bytes) {
      const out: Glyph[] = [];
      for (let i = 0; i < bytes.length; ) {
        let len = 0;
        let code = 0;
        for (const s of spaces) {
          if (i + s.len > bytes.length) continue;
          let c = 0;
          for (let k = 0; k < s.len; k++) c = c * 256 + (bytes[i + k] as number);
          if (c >= s.lo && c <= s.hi) {
            len = s.len;
            code = c;
            break;
          }
        }
        if (!len) {
          len = Math.min(2, bytes.length - i);
          for (let k = 0; k < len; k++) code = code * 256 + (bytes[i + k] as number);
        }
        const text = toUnicode?.map.get(`${len}:${code}`) ?? UNREADABLE;
        out.push({ text, width: widths.get(code) ?? dw, isSpace: len === 1 && code === 32 });
        i += len;
      }
      return out;
    },
  };
}
