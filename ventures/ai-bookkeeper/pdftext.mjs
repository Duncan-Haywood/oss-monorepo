// Text out of a PDF's text layer, in the browser or in node, with no library and
// no server: the statement never leaves the machine. Bank statements are
// almost all generated PDFs with a text layer, so reading the page content
// streams (Flate-compressed text-showing operators, fonts' ToUnicode maps)
// is enough for them. It is not a general PDF reader:
//   - scans (images) have no text and come back empty; the caller says so;
//   - encrypted files are refused, not decrypted;
//   - only Flate streams are decoded (LZW, ASCII85 and JBIG are skipped);
//   - fonts with no ToUnicode map and a two-byte encoding are unreadable.
// Lines are rebuilt from where each text run sits on the page (full
// transformation matrix, so the y-flip most generators add is handled), top
// to bottom, left to right, with a space where the gap is wider than a
// quarter of the font size. The output goes to readStatementText.

const dec = new TextDecoder("latin1");

// ---- a small PDF object parser (also used for content streams) -------------
const WS = " \t\r\n\f\0";
const DELIM = "()<>[]{}/%";
class Op { constructor(name) { this.op = name; } }
class Ref { constructor(n) { this.ref = n; } }
class Name { constructor(n) { this.name = n; } }

function skipWs(s, i) {
  for (;;) {
    while (i < s.length && WS.includes(s[i])) i++;
    if (s[i] === "%") { while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++; } else return i;
  }
}

// One value from s at i: [value, next]. Keywords come back as Op.
function parseValue(s, i) {
  i = skipWs(s, i);
  if (i >= s.length) return [undefined, i];
  const c = s[i];
  if (c === "/") {
    let j = i + 1, out = "";
    while (j < s.length && !WS.includes(s[j]) && !DELIM.includes(s[j])) {
      if (s[j] === "#" && /^[0-9a-fA-F]{2}$/.test(s.slice(j + 1, j + 3))) { out += String.fromCharCode(parseInt(s.slice(j + 1, j + 3), 16)); j += 3; } else out += s[j++];
    }
    return [new Name(out), j];
  }
  if (c === "(") {
    let depth = 1, j = i + 1, out = "";
    while (j < s.length && depth) {
      const ch = s[j];
      if (ch === "\\") {
        const n = s[j + 1];
        if (n === "n") out += "\n"; else if (n === "r") out += "\r"; else if (n === "t") out += "\t"; else if (n === "b") out += "\b"; else if (n === "f") out += "\f";
        else if (/[0-7]/.test(n)) { const m = /^[0-7]{1,3}/.exec(s.slice(j + 1, j + 4))[0]; out += String.fromCharCode(parseInt(m, 8) & 255); j += m.length - 1; }
        else if (n === "\n") { /* line continuation */ } else if (n === "\r") { if (s[j + 2] === "\n") j++; } else out += n;
        j += 2; continue;
      }
      if (ch === "(") depth++; else if (ch === ")") { depth--; if (!depth) break; }
      out += ch; j++;
    }
    return [{ str: out }, j + 1];
  }
  if (c === "<" && s[i + 1] === "<") {
    const d = {}; let j = i + 2;
    for (;;) {
      j = skipWs(s, j);
      if (s[j] === ">" && s[j + 1] === ">") return [d, j + 2];
      if (j >= s.length) return [d, j];
      const [k, j2] = parseValue(s, j);
      if (!(k instanceof Name)) { j = j2 > j ? j2 : j + 1; continue; }
      const [v, j3] = parseValue(s, j2);
      d[k.name] = v; j = j3;
    }
  }
  if (c === "<") {
    const e = s.indexOf(">", i);
    const hex = s.slice(i + 1, e < 0 ? s.length : e).replace(/\s+/g, "");
    let out = "";
    for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt((hex.slice(k, k + 2) + "0").slice(0, 2), 16));
    return [{ str: out }, (e < 0 ? s.length : e) + 1];
  }
  if (c === "[") {
    const a = []; let j = i + 1;
    for (;;) {
      j = skipWs(s, j);
      if (s[j] === "]" || j >= s.length) return [a, j + 1];
      const [v, j2] = parseValue(s, j);
      if (v instanceof Op && v.op === "R" && a.length >= 2) { const g = a.pop(), n = a.pop(); void g; a.push(new Ref(n)); } else a.push(v);
      j = j2;
    }
  }
  if (c === ">" || c === "]" || c === ")" || c === "{" || c === "}") return [new Op(c), i + 1];
  let j = i;
  while (j < s.length && !WS.includes(s[j]) && !DELIM.includes(s[j])) j++;
  const tok = s.slice(i, j);
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) return [parseFloat(tok), j];
  if (tok === "true") return [true, j];
  if (tok === "false") return [false, j];
  if (tok === "null") return [null, j];
  return [new Op(tok), j === i ? j + 1 : j];
}

// "12 0 R" inside a dict: fold number number R into a Ref as values arrive.
function parseObjectValue(s, i) {
  let [v, j] = parseValue(s, i);
  if (typeof v === "number" && Number.isInteger(v)) {
    const m = /^\s+(\d+)\s+R(?![A-Za-z])/.exec(s.slice(j, j + 24));
    if (m) return [new Ref(v), j + m[0].length];
  }
  return [v, j];
}
// Dicts and arrays contain refs too; patch the generic parser to fold them.
function resolveRefsInText(s) { return s.replace(/(\d+)\s+(\d+)\s+R(?![A-Za-z])/g, "$1 0 R"); }

// ---- stream decoding ---------------------------------------------------------
async function inflate(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot decompress PDF streams");
  const ds = new DecompressionStream("deflate");
  const w = ds.writable.getWriter();
  w.write(bytes).catch(() => {}); w.close().catch(() => {});
  const chunks = []; let n = 0;
  const r = ds.readable.getReader();
  try { for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); n += value.length; } } catch { /* truncated stream: keep what came out */ }
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
const toStr = (u8) => dec.decode(u8);

// ---- the object table ---------------------------------------------------------
async function loadObjects(u8) {
  const s = toStr(u8);
  const objs = new Map(); // number -> { dict, value, raw: [start, end] | null }
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  const pending = [];
  while ((m = re.exec(s))) {
    const num = parseInt(m[1], 10);
    let [v, j] = parseObjectValueDeep(s, m.index + m[0].length);
    let stream = null;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Name) && !(v.str !== undefined)) {
      const k = skipWs(s, j);
      if (s.startsWith("stream", k)) {
        let a = k + 6;
        if (s[a] === "\r" && s[a + 1] === "\n") a += 2; else if (s[a] === "\n" || s[a] === "\r") a++;
        let b = s.indexOf("endstream", a);
        if (b < 0) b = s.length;
        let end = b;
        if (s[end - 1] === "\n") end--;
        if (s[end - 1] === "\r") end--;
        stream = [a, end];
        re.lastIndex = b;
      }
    }
    objs.set(num, { value: v, stream });
    pending.push(num);
  }
  const getStream = async (o) => {
    if (!o?.stream) return null;
    const d = o.value;
    let f = d.Filter;
    f = f === undefined ? [] : Array.isArray(f) ? f : [f];
    let bytes = u8.subarray(o.stream[0], o.stream[1]);
    for (const x of f) {
      const n = (x instanceof Ref ? objs.get(x.ref)?.value : x)?.name;
      if (n === "FlateDecode" || n === "Fl") bytes = await inflate(bytes);
      else return null;
    }
    return bytes;
  };
  // Object streams (PDF 1.5): objects packed inside a compressed stream.
  for (const num of pending) {
    const o = objs.get(num);
    if (o.value?.Type?.name === "ObjStm" && o.stream) {
      const bytes = await getStream(o);
      if (!bytes) continue;
      const t = toStr(bytes);
      const n = o.value.N, first = o.value.First;
      const head = t.slice(0, first).trim().split(/\s+/).map(Number);
      for (let k = 0; k < n; k++) {
        const id = head[2 * k], off = head[2 * k + 1];
        if (!objs.has(id)) objs.set(id, { value: parseObjectValueDeep(t, first + off)[0], stream: null });
      }
    }
  }
  return { objs, getStream, text: s };
}

// A value where a dict, array or top-level number may be followed by "G R".
function parseObjectValueDeep(s, i) {
  const [v, j] = parseValueRefs(s, i);
  return [v, j];
}
function parseValueRefs(s, i) {
  i = skipWs(s, i);
  const c = s[i];
  if (c === "<" && s[i + 1] === "<") {
    const d = {}; let j = i + 2;
    for (;;) {
      j = skipWs(s, j);
      if ((s[j] === ">" && s[j + 1] === ">") || j >= s.length) return [d, j + 2];
      const [k, j2] = parseValue(s, j);
      if (!(k instanceof Name)) { j = j2 > j ? j2 : j + 1; continue; }
      const [v, j3] = parseValueRefs(s, j2);
      d[k.name] = v; j = j3;
    }
  }
  if (c === "[") {
    const a = []; let j = i + 1;
    for (;;) {
      j = skipWs(s, j);
      if (s[j] === "]" || j >= s.length) return [a, j + 1];
      const [v, j2] = parseValueRefs(s, j);
      a.push(v); j = j2;
    }
  }
  return parseObjectValue(s, i);
}

// ---- fonts -------------------------------------------------------------------
function parseCMap(t) {
  const map = new Map();
  const hexStr = (h) => { let o = ""; for (let k = 0; k < h.length; k += 4) o += String.fromCharCode(parseInt(h.slice(k, k + 4), 16)); return o; };
  for (const blk of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(m[1], 16), hexStr(m[2].padEnd(4, "0")));
  }
  for (const blk of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (m[3][0] === "[") {
        const items = [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)];
        for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, hexStr(items[c - lo][1].padEnd(4, "0")));
      } else {
        const base = parseInt(m[3].slice(1, -1), 16);
        for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, String.fromCodePoint(base + (c - lo)));
      }
    }
  }
  return map;
}

async function buildFont(ctx, fdict) {
  const get = (v) => (v instanceof Ref ? ctx.objs.get(v.ref)?.value : v);
  const f = { twoByte: false, map: null, widths: null, dw: 1000 };
  const sub = get(fdict.Subtype)?.name;
  if (sub === "Type0") f.twoByte = true;
  if (fdict.ToUnicode instanceof Ref) {
    const bytes = await ctx.getStream(ctx.objs.get(fdict.ToUnicode.ref));
    if (bytes) f.map = parseCMap(toStr(bytes));
  }
  if (f.twoByte) {
    const d = get(get(fdict.DescendantFonts)?.[0]);
    if (d) {
      if (typeof d.DW === "number") f.dw = d.DW;
      const w = get(d.W);
      if (Array.isArray(w)) {
        f.widths = new Map();
        for (let k = 0; k < w.length;) {
          const c0 = w[k], nxt = get(w[k + 1]);
          if (Array.isArray(nxt)) { nxt.forEach((x, q) => f.widths.set(c0 + q, get(x))); k += 2; }
          else { for (let c = c0; c <= nxt && c - c0 < 65536; c++) f.widths.set(c, get(w[k + 2])); k += 3; }
        }
      }
    }
  } else {
    const w = get(fdict.Widths), fc = get(fdict.FirstChar);
    if (Array.isArray(w) && typeof fc === "number") { f.widths = new Map(); w.forEach((x, q) => f.widths.set(fc + q, get(x))); }
    f.dw = 500;
  }
  return f;
}

function decodeShown(font, str) {
  const out = [], codes = [];
  if (font.twoByte) {
    for (let k = 0; k + 1 < str.length; k += 2) codes.push((str.charCodeAt(k) << 8) | str.charCodeAt(k + 1));
  } else for (let k = 0; k < str.length; k++) codes.push(str.charCodeAt(k));
  for (const c of codes) {
    let ch = font.map?.get(c);
    if (ch === undefined) ch = font.twoByte ? "" : (c === 0xA0 ? " " : String.fromCharCode(c));
    out.push({ ch, w: ((font.widths?.get(c) ?? font.dw) || 0) / 1000 });
  }
  return out;
}

// ---- page content -> positioned runs -------------------------------------------
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

function runsFromContent(text, fonts) {
  const runs = [];
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  let tm = [1, 0, 0, 1, 0, 0], tlm = tm, font = null, fs = 0, leading = 0, tc = 0, tw = 0, th = 1;
  const args = [];
  let i = 0;
  const show = (str) => {
    if (!font) return;
    for (const g of decodeShown(font, str)) {
      const dev = mul(tm, ctm);
      if (g.ch) runs.push({ x: dev[4], y: dev[5], w: Math.abs(g.w * fs * th * dev[0] || g.w * fs), size: Math.abs(fs * dev[3] || fs), ch: g.ch });
      const adv = (g.w * fs + tc + (g.ch === " " ? tw : 0)) * th;
      tm = mul([1, 0, 0, 1, adv, 0], tm);
    }
  };
  while (i < text.length) {
    const [v, j] = parseValue(text, i);
    if (v === undefined) break;
    i = j;
    if (!(v instanceof Op)) { args.push(v); continue; }
    const a = args;
    switch (v.op) {
      case "q": stack.push(ctm); break;
      case "Q": ctm = stack.pop() || ctm; break;
      case "cm": if (a.length >= 6) ctm = mul(a.slice(-6), ctm); break;
      case "BT": tm = tlm = [1, 0, 0, 1, 0, 0]; break;
      case "Tf": font = fonts[a[a.length - 2]?.name] || null; fs = a[a.length - 1] || 0; break;
      case "Tc": tc = a[0] || 0; break;
      case "Tw": tw = a[0] || 0; break;
      case "Tz": th = (a[0] ?? 100) / 100; break;
      case "TL": leading = a[0] || 0; break;
      case "Td": tlm = mul([1, 0, 0, 1, a[0] || 0, a[1] || 0], tlm); tm = tlm; break;
      case "TD": leading = -(a[1] || 0); tlm = mul([1, 0, 0, 1, a[0] || 0, a[1] || 0], tlm); tm = tlm; break;
      case "Tm": if (a.length >= 6) tm = tlm = a.slice(-6); break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case "Tj": if (a[0]?.str !== undefined) show(a[0].str); break;
      case "'": tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; if (a[0]?.str !== undefined) show(a[0].str); break;
      case '"': tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; if (a[2]?.str !== undefined) show(a[2].str); break;
      case "TJ":
        for (const it of a[0] || []) {
          if (it?.str !== undefined) show(it.str);
          else if (typeof it === "number") tm = mul([1, 0, 0, 1, (-it / 1000) * fs * th, 0], tm);
        }
        break;
      default: break;
    }
    args.length = 0;
  }
  return runs;
}

// Glyphs on one page -> text lines.
function linesFromRuns(runs) {
  const rows = [];
  for (const r of runs.sort((p, q) => q.y - p.y)) {
    const row = rows.find((x) => Math.abs(x.y - r.y) <= Math.max(1.5, r.size * 0.3));
    if (row) row.g.push(r); else rows.push({ y: r.y, g: [r] });
  }
  rows.sort((p, q) => q.y - p.y);
  return rows.map((row) => {
    row.g.sort((p, q) => p.x - q.x);
    let s = "", end = null, size = row.g[0].size;
    for (const g of row.g) {
      if (end !== null && g.x - end > Math.max(0.2, size * 0.25) && !s.endsWith(" ") && g.ch !== " ") s += " ";
      s += g.ch; end = g.x + g.w; size = g.size || size;
    }
    return s.replace(/[ \t]+/g, " ").trim();
  }).filter(Boolean);
}

// ---- page tree -----------------------------------------------------------------
function pageList(ctx) {
  const get = (v) => (v instanceof Ref ? ctx.objs.get(v.ref)?.value : v);
  let root = null;
  for (const [, o] of ctx.objs) if (o.value?.Type?.name === "Catalog") root = o.value;
  const pages = [];
  const walk = (node, inherited, depth) => {
    node = get(node);
    if (!node || depth > 40) return;
    const res = node.Resources !== undefined ? node.Resources : inherited;
    if (node.Kids || node.Type?.name === "Pages") for (const k of get(node.Kids) || []) walk(k, res, depth + 1);
    else pages.push({ node, res });
  };
  if (root?.Pages) walk(root.Pages, undefined, 0);
  else for (const [, o] of ctx.objs) if (o.value?.Type?.name === "Page") pages.push({ node: o.value, res: o.value.Resources });
  return pages;
}

// Returns the PDF's text, one line per row of the page, pages in order
// (a form feed between pages). Throws on encrypted files.
export async function pdfToText(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (toStr(u8.subarray(0, 8)).indexOf("%PDF-") < 0) throw new Error("not a PDF file");
  const ctx = await loadObjects(u8);
  if (/\/Encrypt\b/.test(ctx.text.slice(Math.max(0, ctx.text.lastIndexOf("trailer"))))) throw new Error("this PDF is password-protected; remove the password or download a CSV or OFX from the bank instead");
  const get = (v) => (v instanceof Ref ? ctx.objs.get(v.ref)?.value : v);
  const fontCache = new Map();
  const out = [];
  for (const { node, res } of pageList(ctx)) {
    const fonts = {};
    const fd = get(get(res)?.Font) || {};
    for (const [name, ref] of Object.entries(fd)) {
      const key = ref instanceof Ref ? ref.ref : null;
      if (key !== null && fontCache.has(key)) { fonts[name] = fontCache.get(key); continue; }
      const f = await buildFont(ctx, get(ref) || {});
      if (key !== null) fontCache.set(key, f);
      fonts[name] = f;
    }
    let c = get(node.Contents);
    const parts = Array.isArray(c) ? node.Contents.map((x) => x) : [node.Contents];
    let text = "";
    for (const p of parts) {
      const o = p instanceof Ref ? ctx.objs.get(p.ref) : null;
      const bytes = o ? await ctx.getStream(o) : null;
      if (bytes) text += toStr(bytes) + "\n";
    }
    void c;
    out.push(linesFromRuns(runsFromContent(text, fonts)).join("\n"));
  }
  return out.join("\n\f\n").trim();
}
void resolveRefsInText;
