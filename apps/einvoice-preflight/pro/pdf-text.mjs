// @ts-check
// The text on a PDF invoice's pages, as positioned lines with their table cells, for the PDF to
// ZUGFeRD converter (pdf-draft.mjs). Proprietary (see ../LICENSE).
//
// Started from apps/jobshop-quote/src/shared/pdf-text.ts (same repository, same owner): the object,
// object-stream, ToUnicode and content-stream tokenizer parts are a port of it. What is new here is
// layout: an invoice is a table, so every string shown is kept with its position (text matrix times
// the CTM) and its advance (the font's /Widths or /W), lines are rebuilt by baseline and sorted by
// x, and a horizontal gap of about an em or more between two runs splits them into cells. Without
// that, "Beratung  2  100,00  200,00" reads as "Beratung2100,00200,00".
//
// What it reads: the page tree in order, each page's content streams (uncompressed, or FlateDecode
// without predictors) and the form XObjects they draw, from plain objects and compressed object
// streams; strings through the font's ToUnicode CMap, else as single bytes (WinAnsi read as
// Latin-1). What it does not: encryption, other filters, text in images (a scan reads as empty:
// nothing was read, and the converter says so). Every loop is bounded, so a hostile file costs at
// most a few megabytes of work.

const MAX_OBJECTS = 20_000;
const MAX_PAGES = 50;
const MAX_FORM_DEPTH = 8;
const MAX_TREE_DEPTH = 32;
const MAX_RUNS = 20_000;
const MAX_OBJECT_STREAMS = 400;
const MAX_INFLATED_BYTES = 16 * 1024 * 1024;

const LATIN1 = new TextDecoder("latin1");
/** @param {Uint8Array} b */
const latin1 = (b) => LATIN1.decode(b);

/** @param {Uint8Array} data @returns {Promise<Uint8Array | null>} */
async function inflate(data) {
  for (const format of /** @type {const} */ (["deflate", "deflate-raw"])) {
    try {
      const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream(format));
      const reader = stream.getReader();
      /** @type {Uint8Array[]} */
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_INFLATED_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
      const out = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.byteLength;
      }
      return out;
    } catch {
      // try the raw form, then give up
    }
  }
  return null;
}

/** @typedef {{ body: string, stream?: Uint8Array }} PdfObject */
/** @typedef {{ ref: number } | { inline: string } | null} Value */

/** The value after `/Key` in a dictionary: an indirect reference, or the inline dict/array/token. @returns {Value} */
function dictValue(/** @type {string} */ body, /** @type {string} */ key) {
  const re = new RegExp(`/${key}(?![A-Za-z0-9#])\\s*`, "g");
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

function depthAt(/** @type {string} */ body, /** @type {number} */ at) {
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

function balanced(/** @type {string} */ s, /** @type {number} */ at, /** @type {string} */ open, /** @type {string} */ close) {
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

const refsIn = (/** @type {string} */ s) => [...s.matchAll(/(\d+)\s+\d+\s+R(?![A-Za-z])/g)].map((m) => Number(m[1]));

/** `/Name n 0 R` pairs of a resource dictionary (fonts, XObjects). */
function namedRefs(/** @type {string} */ dict) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const m of dict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R(?![A-Za-z])/g)) out.set(m[1], Number(m[2]));
  return out;
}

/** Every object in the file; a later definition (an incremental update) replaces an earlier one. */
function readObjects(/** @type {Uint8Array} */ bytes, /** @type {string} */ text) {
  /** @type {Map<number, PdfObject>} */
  const objects = new Map();
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
      else while (dataEnd > dataStart && (text[dataEnd - 1] === "\n" || text[dataEnd - 1] === "\r")) dataEnd--;
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
async function decode(/** @type {PdfObject | undefined} */ obj) {
  if (!obj?.stream) return null;
  const filter = dictValue(obj.body, "Filter");
  if (!filter) return obj.stream;
  if (!("inline" in filter)) return null;
  const names = filter.inline.match(/\/[A-Za-z0-9]+/g) ?? [];
  if (names.length !== 1 || names[0] !== "/FlateDecode") return null;
  const parms = dictValue(obj.body, "DecodeParms");
  if (parms && !("inline" in parms)) return null;
  const predictor = parms && "inline" in parms ? /\/Predictor\s+(\d+)/.exec(parms.inline) : null;
  if (predictor && predictor[1] !== "1") return null;
  return inflate(obj.stream);
}

/** Objects packed in compressed object streams (PDF 1.5+), added where the file has no plain copy. */
async function readObjectStreams(/** @type {Map<number, PdfObject>} */ objects) {
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
      const num = nums[2 * i];
      const off = first + nums[2 * i + 1];
      const next = 2 * i + 3 < nums.length ? first + nums[2 * i + 3] : s.length;
      if (!objects.has(num)) objects.set(num, { body: s.slice(off, next) });
    }
  }
}

/**
 * @typedef {{ map: Map<number, string> | null, width: 1 | 2, widths: Map<number, number>, missingWidth: number }} Font
 */

const utf16be = (/** @type {string} */ hex) => {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
};

/** A ToUnicode CMap: bfchar and bfrange entries, and the code width from its codespace. */
function parseCmap(/** @type {string} */ s) {
  /** @type {Map<number, string>} */
  const map = new Map();
  const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(s);
  const width = space?.[1] && space[1].length <= 2 ? 1 : 2;
  for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      if (map.size < 65_536) map.set(parseInt(m[1], 16), utf16be(m[2]));
    }
  }
  for (const block of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = Math.min(parseInt(m[2], 16), lo + 65_535);
      const dst = m[3];
      if (dst.startsWith("[")) {
        [...dst.matchAll(/<([0-9A-Fa-f]*)>/g)].forEach((d, i) => {
          if (lo + i <= hi && map.size < 65_536) map.set(lo + i, utf16be(d[1]));
        });
      } else {
        const base = utf16be(dst.slice(1, -1));
        if (!base) continue;
        const head = base.slice(0, -1);
        const last = base.charCodeAt(base.length - 1);
        for (let c = lo; c <= hi && map.size < 65_536; c++) map.set(c, head + String.fromCharCode(last + (c - lo)));
      }
    }
  }
  return { map, width: /** @type {1 | 2} */ (width) };
}

/** Resolves an indirect reference or keeps an inline value as an object body. */
function resolve(/** @type {Map<number, PdfObject>} */ objects, /** @type {Value} */ v) {
  if (!v) return null;
  if ("ref" in v) return objects.get(v.ref)?.body ?? null;
  return v.inline;
}

/** A simple font's /FirstChar + /Widths, or a CID font's /W array, in thousandths of an em. */
function readWidths(/** @type {Map<number, PdfObject>} */ objects, /** @type {string} */ body, /** @type {boolean} */ type0) {
  /** @type {Map<number, number>} */
  const widths = new Map();
  let missingWidth = 500;
  if (type0) {
    const desc = resolve(objects, dictValue(body, "DescendantFonts"));
    const cid = desc ? (refsIn(desc)[0] !== undefined ? objects.get(refsIn(desc)[0])?.body ?? "" : desc.replace(/^\[|\]$/g, "")) : "";
    const dw = /\/DW\s+(\d+(?:\.\d+)?)/.exec(cid);
    missingWidth = dw ? Number(dw[1]) : 1000;
    const w = resolve(objects, dictValue(cid, "W"));
    if (w) {
      // [c [w1 w2 ...]  c1 c2 w ...]
      const toks = [...w.slice(1, -1).matchAll(/\[|\]|-?\d+(?:\.\d+)?/g)].map((m) => m[0]);
      for (let i = 0; i < toks.length && widths.size < 65_536; ) {
        const c = Number(toks[i]);
        if (toks[i + 1] === "[") {
          let j = i + 2;
          let k = 0;
          while (j < toks.length && toks[j] !== "]") widths.set(c + k++, Number(toks[j++]));
          i = j + 1;
        } else {
          const c2 = Number(toks[i + 1]);
          const wv = Number(toks[i + 2]);
          for (let k = c; k <= c2 && k - c < 65_536; k++) widths.set(k, wv);
          i += 3;
        }
      }
    }
  } else {
    const first = Number(/\/FirstChar\s+(\d+)/.exec(body)?.[1] ?? 0);
    const list = resolve(objects, dictValue(body, "Widths"));
    if (list) [...list.matchAll(/-?\d+(?:\.\d+)?/g)].forEach((m, i) => widths.set(first + i, Number(m[0])));
    const fd = resolve(objects, dictValue(body, "FontDescriptor"));
    const mw = fd ? /\/MissingWidth\s+(\d+(?:\.\d+)?)/.exec(fd) : null;
    if (mw) missingWidth = Number(mw[1]);
    else if (widths.size) missingWidth = [...widths.values()].reduce((a, b) => a + b, 0) / widths.size;
  }
  return { widths, missingWidth };
}

/** @typedef {[number, number, number, number, number, number]} Matrix */
/** @returns {Matrix} */
const mul = (/** @type {Matrix} */ a, /** @type {Matrix} */ b) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
/** @type {Matrix} */
const IDENTITY = [1, 0, 0, 1, 0, 0];

/** @typedef {{ page: number, x: number, y: number, end: number, size: number, text: string }} Run */

class Reader {
  /** @param {Map<number, PdfObject>} objects */
  constructor(objects) {
    this.objects = objects;
    /** @type {Map<number, Font>} */
    this.fonts = new Map();
    /** @type {Run[]} */
    this.runs = [];
  }

  /** @param {number} num @returns {Promise<Font>} */
  async font(num) {
    const cached = this.fonts.get(num);
    if (cached) return cached;
    const body = this.objects.get(num)?.body ?? "";
    const type0 = /\/Subtype\s*\/Type0/.test(body);
    const tu = dictValue(body, "ToUnicode");
    /** @type {Font} */
    let font = { map: null, width: type0 ? 2 : 1, ...readWidths(this.objects, body, type0) };
    if (tu && "ref" in tu) {
      const data = await decode(this.objects.get(tu.ref));
      if (data) {
        const cmap = parseCmap(latin1(data));
        font = { ...font, map: cmap.map, width: type0 ? 2 : cmap.width };
      }
    }
    this.fonts.set(num, font);
    return font;
  }

  /** The page tree's leaves in reading order, or every page object when there is no catalog. */
  pages() {
    const catalog = [...this.objects.entries()].filter(([, o]) => /\/Type\s*\/Catalog(?![A-Za-z0-9#])/.test(o.body)).at(-1);
    const root = catalog ? dictValue(catalog[1].body, "Pages") : null;
    /** @type {number[]} */
    const out = [];
    const seen = new Set();
    const walk = (/** @type {number} */ num, /** @type {number} */ depth) => {
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
  resources(/** @type {number} */ num) {
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

  async page(/** @type {number} */ num, /** @type {number} */ index) {
    const body = this.objects.get(num)?.body ?? "";
    const contents = dictValue(body, "Contents");
    const nums = !contents
      ? []
      : "ref" in contents
        ? this.objects.get(contents.ref)?.stream
          ? [contents.ref]
          : refsIn(this.objects.get(contents.ref)?.body ?? "")
        : refsIn(contents.inline);
    const parts = [];
    for (const n of nums) {
      const data = await decode(this.objects.get(n));
      if (data) parts.push(latin1(data));
    }
    await this.run(parts.join("\n"), this.resources(num), 0, IDENTITY, index);
  }

  /** @param {string} content @param {string} resources @param {number} depth @param {Matrix} baseCtm @param {number} page */
  async run(content, resources, depth, baseCtm, page) {
    const fontDict = resolve(this.objects, dictValue(resources, "Font"));
    const fonts = fontDict ? namedRefs(fontDict) : new Map();
    const xDict = resolve(this.objects, dictValue(resources, "XObject"));
    const xobjects = xDict ? namedRefs(xDict) : new Map();
    /** @type {Font} */
    let font = { map: null, width: 1, widths: new Map(), missingWidth: 500 };
    let size = 0;
    let charSpace = 0;
    let wordSpace = 0;
    let hScale = 1;
    let leading = 0;
    /** @type {Matrix} */
    let ctm = baseCtm;
    /** @type {Matrix[]} */
    const stack = [];
    /** @type {Matrix} */
    let tm = IDENTITY;
    /** @type {Matrix} */
    let tlm = IDENTITY;
    /** @type {any[]} */
    const ops = [];

    const show = (/** @type {any} */ s) => {
      if (!s || typeof s !== "object" || !("str" in s)) return;
      const { text, advance } = this.decodeString(s.str, font, size, charSpace, wordSpace, hScale);
      const m = mul(tm, ctm);
      const x = m[4];
      const y = m[5];
      const scaleX = Math.hypot(m[0], m[1]);
      const scaleY = Math.hypot(m[2], m[3]);
      tm = mul([1, 0, 0, 1, advance, 0], tm);
      if (!text || this.runs.length >= MAX_RUNS) return;
      this.runs.push({ page, x, y, end: x + advance * scaleX, size: Math.abs(size * scaleY) || 1, text });
    };
    const nextLine = () => {
      tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
      tm = tlm;
    };
    for (const tok of tokens(content)) {
      if (typeof tok !== "object" || tok === null || !("op" in tok)) {
        ops.push(tok);
        if (ops.length > 64) ops.shift();
        continue;
      }
      const op = tok.op;
      const args = ops.splice(0);
      const num = (/** @type {number} */ i) => (typeof args[i] === "number" ? args[i] : 0);
      if (op === "q") {
        if (stack.length < 64) stack.push(ctm);
      } else if (op === "Q") {
        ctm = stack.pop() ?? baseCtm;
      } else if (op === "cm" && args.length >= 6) {
        ctm = mul([num(0), num(1), num(2), num(3), num(4), num(5)], ctm);
      } else if (op === "Tf") {
        const name = args.find((a) => typeof a === "string" && a.startsWith("/"));
        const n = name ? fonts.get(name.slice(1)) : undefined;
        font = n !== undefined ? await this.font(n) : { map: null, width: 1, widths: new Map(), missingWidth: 500 };
        size = num(args.length - 1);
      } else if (op === "Tc") charSpace = num(0);
      else if (op === "Tw") wordSpace = num(0);
      else if (op === "Tz") hScale = num(0) / 100;
      else if (op === "TL") leading = num(0);
      else if (op === "Tj") show(args.at(-1));
      else if (op === "'") {
        nextLine();
        show(args.at(-1));
      } else if (op === '"') {
        wordSpace = num(0);
        charSpace = num(1);
        nextLine();
        show(args.at(-1));
      } else if (op === "TJ") {
        const arr = args.at(-1);
        if (Array.isArray(arr)) {
          for (const el of arr) {
            if (typeof el === "number") tm = mul([1, 0, 0, 1, (-el / 1000) * size * hScale, 0], tm);
            else show(el);
          }
        }
      } else if (op === "Td" || op === "TD") {
        tlm = mul([1, 0, 0, 1, num(0), num(1)], tlm);
        tm = tlm;
        if (op === "TD") leading = -num(1);
      } else if (op === "T*") nextLine();
      else if (op === "Tm" && args.length >= 6) {
        tlm = [num(0), num(1), num(2), num(3), num(4), num(5)];
        tm = tlm;
      } else if (op === "BT") {
        tm = IDENTITY;
        tlm = IDENTITY;
      } else if (op === "Do" && depth < MAX_FORM_DEPTH) {
        const name = args.at(-1);
        const n = typeof name === "string" ? xobjects.get(name.slice(1)) : undefined;
        const form = n !== undefined ? this.objects.get(n) : undefined;
        if (form && /\/Subtype\s*\/Form/.test(form.body)) {
          const data = await decode(form);
          if (data) {
            const own = resolve(this.objects, dictValue(form.body, "Resources"));
            const fm = /\/Matrix\s*\[([^\]]*)\]/.exec(form.body)?.[1]?.trim().split(/\s+/).map(Number);
            /** @type {Matrix} */
            const formMatrix = fm && fm.length === 6 && fm.every(Number.isFinite) ? /** @type {Matrix} */ (fm) : IDENTITY;
            await this.run(latin1(data), own ?? resources, depth + 1, mul(formMatrix, ctm), page);
          }
        }
      }
    }
  }

  /** @param {Uint8Array} bytes @param {Font} font @param {number} size @param {number} tc @param {number} tw @param {number} th */
  decodeString(bytes, font, size, tc, tw, th) {
    let text = "";
    let advance = 0;
    const step = font.width;
    for (let i = 0; i + step - 1 < bytes.length; i += step) {
      const code = step === 2 ? (bytes[i] << 8) | bytes[i + 1] : bytes[i];
      const ch = step === 2 ? (font.map?.get(code) ?? "") : (font.map?.get(code) ?? String.fromCharCode(code));
      text += ch;
      const w = font.widths.get(code) ?? font.missingWidth;
      advance += ((w / 1000) * size + tc + (step === 1 && code === 32 ? tw : 0)) * th;
    }
    return { text, advance };
  }
}

/** @typedef {number | string | { str: Uint8Array, hex: boolean } | any[] | { op: string }} Token */

const DELIM = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);
const isSpace = (/** @type {string | undefined} */ c) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
/** @type {Record<string, number>} */
const ESC = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };

/** Tokens of a content stream: operands (numbers, names, strings, arrays) and operators. @returns {Generator<Token>} */
function* tokens(/** @type {string} */ s) {
  /** @type {any[][]} */
  const stack = [];
  let i = 0;
  /** @returns {Generator<Token>} */
  const push = function* (/** @type {Token} */ t) {
    const top = stack.at(-1);
    if (top) top.push(t);
    else yield t;
  };
  while (i < s.length) {
    const c = s[i];
    if (isSpace(c)) i++;
    else if (c === "%") {
      while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++;
    } else if (c === "(") {
      const bytes = [];
      let depth = 1;
      i++;
      while (i < s.length && depth > 0) {
        const ch = s[i];
        if (ch === "\\") {
          const n = s[i + 1] ?? "";
          if (n in ESC) {
            bytes.push(ESC[n]);
            i += 2;
          } else if (/[0-7]/.test(n)) {
            const oct = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4))?.[0] ?? "0";
            bytes.push(parseInt(oct, 8) & 0xff);
            i += 1 + oct.length;
          } else if (n === "\r" || n === "\n") i += n === "\r" && s[i + 2] === "\n" ? 3 : 2;
          else i += 1;
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
      i += balanced(s, i, "<<", ">>").length;
    } else if (c === "<") {
      const end = s.indexOf(">", i);
      const hex = s.slice(i + 1, end < 0 ? s.length : end).replace(/[^0-9A-Fa-f]/g, "");
      const padded = hex.length % 2 ? `${hex}0` : hex;
      const bytes = new Uint8Array(padded.length / 2);
      for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(padded.slice(2 * k, 2 * k + 2), 16);
      i = end < 0 ? s.length : end + 1;
      yield* push({ str: bytes, hex: true });
    } else if (c === "[") {
      if (stack.length < 32) stack.push([]);
      i++;
    } else if (c === "]") {
      const arr = stack.pop() ?? [];
      i++;
      yield* push(arr);
    } else if (c === "/") {
      let j = i + 1;
      while (j < s.length && !isSpace(s[j]) && !DELIM.has(s[j])) j++;
      yield* push(s.slice(i, j));
      i = j;
    } else if (c === ">" || c === ")" || c === "{" || c === "}") i++;
    else {
      let j = i;
      while (j < s.length && !isSpace(s[j]) && !DELIM.has(s[j])) j++;
      const word = s.slice(i, j);
      i = j;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) yield* push(Number(word));
      else if (word === "ID") {
        const ei = /\sEI(?=[\s]|$)/g;
        ei.lastIndex = i;
        const m = ei.exec(s);
        i = m ? m.index + m[0].length : s.length;
      } else if (word === "true" || word === "false" || word === "null") yield* push(word);
      else if (word) {
        stack.length = 0;
        yield { op: word };
      }
    }
  }
}

/**
 * @typedef {{ page: number, y: number, text: string, cells: string[], xs: number[] }} Line
 */

/**
 * Runs to lines: same page and a baseline within a third of the font size, top to bottom (larger y
 * first, as PDF user space grows upward), each line left to right. A gap of about an em or more
 * between two runs starts a new cell; a smaller visible gap is a word space.
 * @param {Run[]} runs @returns {Line[]}
 */
export function layoutLines(runs) {
  /** @type {{ page: number, y: number, size: number, runs: Run[] }[]} */
  const groups = [];
  const sorted = [...runs].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  for (const r of sorted) {
    const g = groups.at(-1);
    if (g && g.page === r.page && Math.abs(g.y - r.y) <= Math.max(g.size, r.size) * 0.35) g.runs.push(r);
    else groups.push({ page: r.page, y: r.y, size: r.size, runs: [r] });
  }
  return groups.map((g) => {
    const rs = g.runs.sort((a, b) => a.x - b.x);
    /** @type {string[]} */
    const cells = [];
    /** @type {number[]} */
    const xs = [];
    let cell = "";
    let cellX = 0;
    let end = -Infinity;
    for (const r of rs) {
      const gap = r.x - end;
      const em = r.size;
      if (!cell) cellX = r.x;
      if (cell && gap >= em * 0.9) {
        cells.push(cell);
        xs.push(cellX);
        cell = r.text;
        cellX = r.x;
      } else if (cell && gap > em * 0.15 && !cell.endsWith(" ") && !r.text.startsWith(" ")) cell += ` ${r.text}`;
      else cell += r.text;
      end = Math.max(end, r.end);
    }
    if (cell) {
      cells.push(cell);
      xs.push(cellX);
    }
    // Typographic ligatures (\ufb01, \ufb02, \ufb00 ...) that a font's ToUnicode map gives as one code point, back to letters.
    const kept = cells
      .map((c, k) => ({ c: c.replace(/[\ufb00-\ufb06]/g, (ch) => ch.normalize("NFKC")).replace(/[ \t\u00a0]+/g, " ").trim(), x: xs[k] }))
      .filter((k) => k.c);
    const clean = kept.map((k) => k.c);
    return { page: g.page, y: g.y, text: clean.join("  "), cells: clean, xs: kept.map((k) => Math.round(k.x * 10) / 10) };
  }).filter((l) => l.cells.length > 0);
}

/**
 * The lines of a PDF's pages. `null` when the bytes are not a PDF; `{ lines: [], reason }` when it
 * has no readable text (a scan, encryption, an unsupported filter).
 * @param {Uint8Array} bytes
 * @returns {Promise<{ lines: Line[], pages: number, reason: string | null } | null>}
 */
export async function extractPdfLines(bytes) {
  const text = latin1(bytes);
  const head = text.indexOf("%PDF-");
  if (head < 0 || head > 1024) return null;
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(text)) return { lines: [], pages: 0, reason: "encrypted" };
  const objects = readObjects(bytes, text);
  await readObjectStreams(objects);
  const reader = new Reader(objects);
  const pages = reader.pages();
  for (let i = 0; i < pages.length; i++) await reader.page(pages[i], i + 1);
  const lines = layoutLines(reader.runs);
  return { lines, pages: pages.length, reason: lines.length ? null : "no_text" };
}
