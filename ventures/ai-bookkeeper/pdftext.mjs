// Text out of a PDF's text layer with no tool installed: the same job as
// `pdftotext -layout` for the plain statements and receipts banks produce, so a
// browser page can take a PDF straight from the file picker and the CLI works
// without poppler. It reads cross-reference-free (every `N G obj` is found by
// scanning), Flate streams and object streams, page order from the page tree,
// font names from each page's resources, ToUnicode maps for two-byte fonts, and
// puts text back into lines by its position. It does not read scans (no text
// layer: use OCR), encrypted files, or fonts with neither a ToUnicode map nor a
// plain one-byte encoding. A file it cannot read gives an empty string, never a
// guess.
const L1 = new TextDecoder("latin1");

async function inflate(bytes) {
  const ds = new DecompressionStream("deflate");
  const w = ds.writable.getWriter();
  w.write(bytes).catch(() => {}); w.close().catch(() => {});
  try { return new Uint8Array(await new Response(ds.readable).arrayBuffer()); } catch { return null; }
}

// Every top-level object: number -> { dict, stream (bytes or null) }.
async function readObjects(bytes) {
  const src = L1.decode(bytes);
  const objs = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf("endobj", start);
    const body = src.slice(start, end < 0 ? undefined : end);
    const si = body.search(/stream\r?\n/);
    let dict = body, stream = null;
    if (si >= 0 && /^\s*<</.test(body)) {
      dict = body.slice(0, si);
      const from = start + si + body.slice(si).match(/^stream\r?\n/)[0].length;
      const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      let to = len ? from + Number(len[1]) : -1;
      if (to < 0 || src.slice(to, to + 12).search(/\s*endstream/) !== 0) to = src.indexOf("endstream", from);
      stream = bytes.subarray(from, to < 0 ? bytes.length : to);
      if (!len) while (stream.length && (stream[stream.length - 1] === 10 || stream[stream.length - 1] === 13)) stream = stream.subarray(0, -1);
    }
    objs.set(Number(m[1]), { dict, stream });
    re.lastIndex = end < 0 ? re.lastIndex : end;
  }
  return objs;
}

async function decoded(o) {
  if (!o?.stream) return null;
  if (!/\/FlateDecode|\/Fl\b/.test(o.dict)) return /\/Filter/.test(o.dict) ? null : o.stream;
  if (/\/Filter\s*\[[^\]]*\/(ASCII85|LZW|DCT|CCITT|JBIG2)/.test(o.dict)) return null;
  return inflate(o.stream);
}

const refOf = (s, key) => { const m = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(s); return m ? Number(m[1]) : null; };

// Object streams (PDF 1.5) hold most dictionaries in modern files.
async function expandObjStms(objs) {
  for (const [, o] of [...objs]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const data = await decoded(o);
    if (!data) continue;
    const text = L1.decode(data);
    const n = Number(/\/N\s+(\d+)/.exec(o.dict)?.[1]), first = Number(/\/First\s+(\d+)/.exec(o.dict)?.[1]);
    const nums = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const id = nums[2 * i], off = nums[2 * i + 1];
      const next = i + 1 < n ? nums[2 * i + 3] : text.length - first;
      if (!objs.has(id)) objs.set(id, { dict: text.slice(first + off, first + next), stream: null });
    }
  }
}

// Hex source codes -> text, from a ToUnicode CMap.
function parseCMap(text) {
  const map = new Map(); let width = 1;
  const u = (h) => { let s = ""; for (let i = 0; i + 3 < h.length + 1; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return s; };
  for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) { width = Math.max(width, p[1].length / 2); map.set(parseInt(p[1], 16), u(p[2])); }
  for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      width = Math.max(width, p[1].length / 2);
      const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16);
      if (p[3][0] === "[") { [...p[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((q, i) => map.set(lo + i, u(q[1]))); continue; }
      const base = p[3].slice(1, -1), last = parseInt(base.slice(-4), 16);
      for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, u(base.slice(0, -4)) + String.fromCharCode(last + c - lo));
    }
  return { map, width };
}

function unescapeLiteral(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") { out += c; continue; }
    const n = s[++i];
    if (n === "n") out += "\n"; else if (n === "r") out += "\r"; else if (n === "t") out += "\t"; else if (n === "b") out += "\b"; else if (n === "f") out += "\f";
    else if (/[0-7]/.test(n)) { let d = n; while (d.length < 3 && /[0-7]/.test(s[i + 1] || "")) d += s[++i]; out += String.fromCharCode(parseInt(d, 8) & 255); }
    else if (n === "\r" || n === "\n") { if (n === "\r" && s[i + 1] === "\n") i++; }
    else out += n;
  }
  return out;
}

// Content-stream tokens: strings stay raw (latin1 byte strings), arrays are lists.
function tokens(s) {
  const out = []; let i = 0;
  const ws = /[\s\0]/, delim = /[()<>\[\]{}\/%]/;
  while (i < s.length) {
    const c = s[i];
    if (ws.test(c)) { i++; continue; }
    if (c === "%") { while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (c === "(") {
      let d = 1, j = i + 1;
      while (j < s.length && d) { if (s[j] === "\\") j++; else if (s[j] === "(") d++; else if (s[j] === ")") d--; j++; }
      out.push({ str: unescapeLiteral(s.slice(i + 1, j - 1)) }); i = j; continue;
    }
    if (c === "<" && s[i + 1] !== "<") {
      const j = s.indexOf(">", i); const h = s.slice(i + 1, j < 0 ? s.length : j).replace(/\s/g, "");
      let b = ""; for (let k = 0; k < h.length; k += 2) b += String.fromCharCode(parseInt((h.slice(k, k + 2) + "0").slice(0, 2), 16));
      out.push({ str: b }); i = j < 0 ? s.length : j + 1; continue;
    }
    if (c === "[") { out.push("["); i++; continue; }
    if (c === "]") { out.push("]"); i++; continue; }
    if (c === "<" || c === ">") { i += s[i + 1] === c ? 2 : 1; continue; }
    if (c === "/") { let j = i + 1; while (j < s.length && !ws.test(s[j]) && !delim.test(s[j])) j++; out.push({ name: s.slice(i + 1, j) }); i = j; continue; }
    let j = i; while (j < s.length && !ws.test(s[j]) && !delim.test(s[j])) j++;
    if (j === i) { i++; continue; }
    const w = s.slice(i, j); out.push(/^[-+]?(\d+\.?\d*|\.\d+)$/.test(w) ? Number(w) : w); i = j;
  }
  return out;
}

function showText(font, str) {
  if (font?.cmap) {
    const w = font.cmap.width; let o = "";
    for (let i = 0; i + w <= str.length; i += w) { let code = 0; for (let k = 0; k < w; k++) code = code * 256 + str.charCodeAt(i + k); o += font.cmap.map.get(code) ?? ""; }
    return o;
  }
  return str.replace(/\0/g, "");
}

const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];

// Items { x, end, y, text, size } for a page (device coordinates, y up), in drawing order.
function interpret(content, fonts) {
  const items = [];
  const I = [1, 0, 0, 1, 0, 0];
  let font = null, size = 10, lead = 0, tm = I, tlm = I, ctm = I, saved = [], stack = [];
  const show = (str) => {
    const w = font?.cmap ? font.cmap.width : 1;
    for (let i = 0; i + w <= str.length; i += w) {
      let code = 0; for (let k = 0; k < w; k++) code = code * 256 + str.charCodeAt(i + k);
      const text = font?.cmap ? (font.cmap.map.get(code) ?? "") : String.fromCharCode(code);
      const adv = ((font?.width ? font.width(code) : 500) / 1000) * size;
      const d = mul(tm, ctm), sc = Math.sqrt(Math.abs(d[0] * d[3] - d[1] * d[2]));
      if (text && text !== "\0") items.push({ x: d[4], end: d[4] + adv * sc, y: d[5], text, size: size * sc });
      tm = mul([1, 0, 0, 1, adv, 0], tm);
    }
  };
  const move = (x, y) => { tlm = mul([1, 0, 0, 1, x, y], tlm); tm = tlm; };
  for (const t of tokens(content)) {
    if (typeof t !== "string" || t === "[" || t === "]") { stack.push(t); continue; }
    const a = stack;
    const num = (k) => (typeof a[a.length - k] === "number" ? a[a.length - k] : 0);
    switch (t) {
      case "q": saved.push(ctm); break;
      case "Q": ctm = saved.pop() || ctm; break;
      case "cm": ctm = mul([num(6), num(5), num(4), num(3), num(2), num(1)], ctm); break;
      case "BT": tm = tlm = I; break;
      case "Tf": { const nm = a[a.length - 2]; font = fonts[nm?.name] || null; size = num(1) || size; break; }
      case "TL": lead = num(1); break;
      case "Td": move(num(2), num(1)); break;
      case "TD": lead = -num(1); move(num(2), num(1)); break;
      case "Tm": tm = tlm = [num(6), num(5), num(4), num(3), num(2), num(1)]; break;
      case "T*": move(0, -lead); break;
      case "Tj": { const s = a[a.length - 1]; if (s?.str != null) show(s.str); break; }
      case "'": case '"': { move(0, -lead); const s = a[a.length - 1]; if (s?.str != null) show(s.str); break; }
      case "TJ": {
        const from = a.lastIndexOf("["); if (from < 0) break;
        for (const e of a.slice(from + 1)) {
          if (e?.str != null) show(e.str);
          else if (typeof e === "number") tm = mul([1, 0, 0, 1, (-e / 1000) * size, 0], tm);
        }
        break;
      }
      default: break;
    }
    stack = [];
  }
  return items;
}

function layout(items) {
  const rows = [];
  for (const it of items) {
    const tol = Math.max(1.5, it.size * 0.4);
    let r = rows.find((q) => Math.abs(q.y - it.y) <= tol);
    if (!r) { r = { y: it.y, parts: [] }; rows.push(r); }
    r.parts.push(it);
  }
  rows.sort((p, q) => q.y - p.y);
  return rows.map((r) => {
    r.parts.sort((p, q) => p.x - q.x);
    let line = "", end = null;
    for (const p of r.parts) {
      const gap = end === null ? 0 : p.x - end;
      if (line && gap > p.size * 0.2 && !/\s$/.test(line) && !/^\s/.test(p.text)) line += gap > p.size * 1.5 ? "   " : " ";
      line += p.text; end = Math.max(end ?? -1e9, p.end);
    }
    return line.replace(/\s+$/, "");
  }).filter((l) => l.trim()).join("\n");
}

// Text of a PDF given as bytes (Uint8Array or ArrayBuffer). Pages in page-tree order.
export async function pdfText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (L1.decode(bytes.subarray(0, 1024)).indexOf("%PDF-") < 0) throw new Error("not a PDF file");
  const objs = await readObjects(bytes);
  await expandObjStms(objs);
  const raw = (n) => objs.get(n)?.dict || "";
  if ([...objs.values()].some((o) => /\/Encrypt\b/.test(o.dict) && !o.stream) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(L1.decode(bytes.subarray(Math.max(0, bytes.length - 2048))))) throw new Error("this PDF is encrypted");

  const pages = [];
  const walk = (n, seen = new Set()) => {
    if (seen.has(n)) return; seen.add(n);
    const d = raw(n);
    if (/\/Type\s*\/Pages\b/.test(d)) { const k = /\/Kids\s*\[([^\]]*)\]/.exec(d); if (k) for (const r of k[1].matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(r[1]), seen); }
    else if (/\/Type\s*\/Page\b/.test(d)) pages.push(n);
  };
  const root = [...objs.entries()].find(([, o]) => /\/Type\s*\/Catalog\b/.test(o.dict));
  const top = root ? refOf(root[1].dict, "Pages") : null;
  if (top) walk(top);
  if (!pages.length) for (const [n, o] of objs) if (/\/Type\s*\/Page\b/.test(o.dict)) pages.push(n);

  const arrayAt = (src) => { const r = /^\s*(\d+)\s+\d+\s+R/.exec(src); return r ? raw(Number(r[1])) : src; };
  function widthsOf(n) {
    const d = raw(n);
    if (/\/Subtype\s*\/Type0/.test(d)) {
      const dm = /\/DescendantFonts\s*(?:\[\s*)?(\d+)\s+\d+\s+R/.exec(d);
      const cd = dm ? raw(Number(dm[1])) : d;
      const dw = Number(/\/DW\s+(\d+)/.exec(cd)?.[1] ?? 1000);
      const wi = cd.indexOf("/W "), wm = wi < 0 ? null : /\/W\s*(\d+\s+\d+\s+R|\[)/.exec(cd);
      let wsrc = ""; if (wm) wsrc = wm[1] === "[" ? cd.slice(cd.indexOf("[", wi)) : arrayAt(wm[1]);
      const table = new Map();
      for (const e of wsrc.matchAll(/(\d+)\s*\[([^\]]*)\]|(\d+)\s+(\d+)\s+(-?[\d.]+)/g)) {
        if (e[1] !== undefined) e[2].trim().split(/\s+/).forEach((v, i) => table.set(Number(e[1]) + i, Number(v)));
        else for (let c = Number(e[3]); c <= Number(e[4]) && c - Number(e[3]) < 70000; c++) table.set(c, Number(e[5]));
      }
      return (c) => table.get(c) ?? dw;
    }
    const first = Number(/\/FirstChar\s+(\d+)/.exec(d)?.[1] ?? 0);
    const wm = /\/Widths\s*(\d+\s+\d+\s+R|\[[^\]]*\])/.exec(d);
    const ws = wm ? arrayAt(wm[1]).replace(/[\[\]]/g, " ").trim().split(/\s+/).map(Number) : null;
    const dflt = /\/BaseFont\s*\/Courier/.test(d) ? 600 : Number(/\/MissingWidth\s+(\d+)/.exec(d)?.[1] ?? 500);
    return (c) => (ws && ws[c - first] > 0 ? ws[c - first] : dflt);
  }
  const fontCache = new Map();
  async function loadFont(n) {
    if (fontCache.has(n)) return fontCache.get(n);
    const tu = refOf(raw(n), "ToUnicode");
    const data = tu ? await decoded(objs.get(tu)) : null;
    const f = { cmap: data ? parseCMap(L1.decode(data)) : null, width: widthsOf(n) };
    if (f.cmap && !f.cmap.map.size) f.cmap = null;
    fontCache.set(n, f); return f;
  }
  const inherited = (n, key, depth = 0) => {
    const d = raw(n); const ix = d.indexOf(`/${key}`);
    if (ix >= 0) return { n, d, ix };
    const p = refOf(d, "Parent");
    return p && depth < 12 ? inherited(p, key, depth + 1) : null;
  };

  const out = [];
  for (const pn of pages) {
    const fonts = {};
    const res = inherited(pn, "Resources");
    if (res) {
      let rd = res.d.slice(res.ix);
      const rr = refOf(rd, "Resources"); if (rr && /^\/Resources\s+\d+\s+\d+\s+R/.test(rd)) rd = raw(rr);
      let fd = /\/Font\s*<<([\s\S]*?)>>/.exec(rd)?.[1];
      const fr = /\/Font\s+(\d+)\s+\d+\s+R/.exec(rd); if (fr) fd = raw(Number(fr[1]));
      if (fd) for (const m of fd.matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) fonts[m[1]] = await loadFont(Number(m[2]));
    }
    const pd = raw(pn);
    const cm = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(pd)?.[1] || "";
    let content = "";
    for (const r of cm.matchAll(/(\d+)\s+\d+\s+R/g)) { const d = await decoded(objs.get(Number(r[1]))); if (d) content += L1.decode(d) + "\n"; }
    const items = interpret(content, fonts);
    if (items.length) out.push(layout(items));
  }
  return out.join("\n\n").trim();
}
