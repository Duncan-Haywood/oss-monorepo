// Factur-X / ZUGFeRD writer: an invoice from the creator (generate.mjs) out as
// one PDF/A-3b file, a printed page a person reads with the CII XML a machine
// reads embedded in it. France's e-invoicing reform names Factur-X as one of
// its three formats, and Germany's ZUGFeRD 2 is the same file.
//
// What makes it PDF/A-3b (ISO 19005-3), checked with veraPDF 1.30.4
// (eval/facturx-pdf-verapdf.mjs): the two fonts are embedded (glyph subsets of
// fonts/PreflightSans-*.ttf, Type0 / CIDFontType2, Identity-H, with a
// ToUnicode map so text copies out), an sRGB output intent carries an ICC
// profile built here, the XMP packet says pdfaid part 3 conformance B and
// declares the Factur-X extension schema, the trailer has an /ID, and the XML
// is an associated file (/AF, /AFRelationship /Alternative, /Subtype
// text/xml). No Info dictionary is written, so nothing can disagree with the
// XMP.
//
// What the file says is the CII the creator writes; the page is drawn from
// the same document, so the two cannot disagree. Profiles: EN 16931
// (factur-x.xml, ConformanceLevel "EN 16931") and XRechnung
// (xrechnung.xml, "XRECHNUNG", as Factur-X 1.07 / ZUGFeRD 2.3 name it).
// Not a qualified signature, not an archive, not tax advice.
//
// Zero dependencies; runs in Node 20+ and the browser. The caller passes the
// two font files' bytes (Node: readFontsSync in facturx-pdf-node.mjs; the
// browser: fetch fonts/PreflightSans-*.ttf).

import { buildInvoice, toCii } from "./generate.mjs";

const UTF8 = new TextEncoder();
const A4 = [595.28, 841.89];
const MARGIN = 50;

export const FACTURX_PROFILES = {
  en16931: { filename: "factur-x.xml", level: "EN 16931" },
  xrechnung: { filename: "xrechnung.xml", level: "XRECHNUNG" },
};

// ------------------------------------------------------------------ TrueType

function u16(b, o) { return (b[o] << 8) | b[o + 1]; }
function i16(b, o) { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; }
function u32(b, o) { return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }

/** Parse the tables this writer needs from a TrueType (glyf) font. */
export function parseTrueType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const version = u32(b, 0);
  if (version !== 0x00010000 && version !== 0x74727565) throw new Error("Not a TrueType font with glyf outlines.");
  const tables = {};
  const n = u16(b, 4);
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16;
    const tag = String.fromCharCode(b[r], b[r + 1], b[r + 2], b[r + 3]);
    tables[tag] = { offset: u32(b, r + 8), length: u32(b, r + 12) };
  }
  for (const t of ["head", "hhea", "maxp", "hmtx", "loca", "glyf", "cmap"]) {
    if (!tables[t]) throw new Error(`Font has no ${t} table.`);
  }
  const head = tables.head.offset;
  const unitsPerEm = u16(b, head + 18);
  const bbox = [i16(b, head + 36), i16(b, head + 38), i16(b, head + 40), i16(b, head + 42)];
  const longLoca = i16(b, head + 50) === 1;
  const numGlyphs = u16(b, tables.maxp.offset + 4);
  const hhea = tables.hhea.offset;
  const ascent = i16(b, hhea + 4);
  const descent = i16(b, hhea + 6);
  const numHMetrics = u16(b, hhea + 34);
  const advances = new Uint16Array(numGlyphs);
  for (let g = 0; g < numGlyphs; g++) {
    advances[g] = u16(b, tables.hmtx.offset + 4 * Math.min(g, numHMetrics - 1));
  }
  const loca = new Uint32Array(numGlyphs + 1);
  for (let g = 0; g <= numGlyphs; g++) {
    loca[g] = longLoca ? u32(b, tables.loca.offset + 4 * g) : u16(b, tables.loca.offset + 2 * g) * 2;
  }
  let capHeight = Math.round(ascent * 0.7);
  let italicAngle = 0;
  if (tables["OS/2"] && tables["OS/2"].length >= 90 && u16(b, tables["OS/2"].offset) >= 2) {
    capHeight = i16(b, tables["OS/2"].offset + 88);
  }
  if (tables.post) italicAngle = i16(b, tables.post.offset + 4) + u16(b, tables.post.offset + 6) / 65536;
  return { bytes: b, tables, unitsPerEm, bbox, ascent, descent, capHeight, italicAngle, numGlyphs, advances, loca, cmap: readCmap(b, tables.cmap.offset) };
}

function readCmap(b, base) {
  const map = new Map();
  const n = u16(b, base + 2);
  let best = null;
  for (let i = 0; i < n; i++) {
    const r = base + 4 + i * 8;
    const pid = u16(b, r), eid = u16(b, r + 2), off = base + u32(b, r + 4);
    const fmt = u16(b, off);
    const rank = fmt === 12 ? 3 : (pid === 3 && eid === 1) || pid === 0 ? (fmt === 4 ? 2 : 0) : 0;
    if (rank && (!best || rank > best.rank)) best = { rank, off, fmt };
  }
  if (!best) throw new Error("Font has no Unicode cmap.");
  const o = best.off;
  if (best.fmt === 4) {
    const segX2 = u16(b, o + 6);
    const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = u16(b, ends + 2 * s), start = u16(b, starts + 2 * s);
      const delta = u16(b, deltas + 2 * s), rangeOff = u16(b, ranges + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (rangeOff === 0) g = (c + delta) & 0xffff;
        else {
          g = u16(b, ranges + 2 * s + rangeOff + 2 * (c - start));
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) map.set(c, g);
      }
    }
  } else {
    const groups = u32(b, o + 12);
    for (let i = 0; i < groups; i++) {
      const r = o + 16 + i * 12;
      const start = u32(b, r), end = u32(b, r + 4), g0 = u32(b, r + 8);
      for (let c = start; c <= end; c++) map.set(c, g0 + (c - start));
    }
  }
  return map;
}

/**
 * Keep only the outlines of `used` glyph ids (and the parts of composite
 * glyphs), at their original ids, so a CIDToGIDMap of /Identity still holds.
 * Returns a TrueType file with head, hhea, maxp, hmtx, loca, glyf, cmap, post.
 */
export function subsetTrueType(font, used) {
  const b = font.bytes;
  const keep = new Set([0, ...used]);
  const glyf = font.tables.glyf.offset;
  const queue = [...keep];
  while (queue.length) {
    const g = queue.pop();
    const start = font.loca[g], end = font.loca[g + 1];
    if (end <= start || i16(b, glyf + start) >= 0) continue;
    let p = glyf + start + 10;
    for (;;) {
      const flags = u16(b, p), comp = u16(b, p + 2);
      if (!keep.has(comp)) { keep.add(comp); queue.push(comp); }
      p += 4 + (flags & 1 ? 4 : 2);
      if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
      if (!(flags & 0x20)) break;
    }
  }
  const pieces = [];
  const loca = new Uint8Array(4 * (font.numGlyphs + 1));
  let at = 0;
  for (let g = 0; g < font.numGlyphs; g++) {
    putU32(loca, 4 * g, at);
    if (keep.has(g)) {
      const piece = b.subarray(glyf + font.loca[g], glyf + font.loca[g + 1]);
      const padded = new Uint8Array((piece.length + 3) & ~3);
      padded.set(piece);
      pieces.push(padded);
      at += padded.length;
    }
  }
  putU32(loca, 4 * font.numGlyphs, at);
  const glyfOut = concatBytes(pieces);
  const copy = (tag) => b.slice(font.tables[tag].offset, font.tables[tag].offset + font.tables[tag].length);
  const head = copy("head");
  head[50] = 0; head[51] = 1; // long loca
  putU32(head, 8, 0);
  const tables = { cmap: copy("cmap"), glyf: glyfOut, head, hhea: copy("hhea"), hmtx: copy("hmtx"), loca, maxp: copy("maxp") };
  if (font.tables.post) {
    const post = copy("post").slice(0, 32);
    post[0] = 0; post[1] = 3; post[2] = 0; post[3] = 0; // format 3: no glyph names
    tables.post = post;
  }
  const out = writeSfnt(tables);
  const sum = (0xb1b0afba - checksum(out)) >>> 0;
  const headAt = sfntTableOffset(out, "head");
  putU32(out, headAt + 8, sum);
  return out;
}

function writeSfnt(tables) {
  const tags = Object.keys(tables).sort();
  const n = tags.length;
  let pow = 1, log = 0;
  while (pow * 2 <= n) { pow *= 2; log++; }
  const headerLen = 12 + 16 * n;
  let size = headerLen;
  for (const t of tags) size += (tables[t].length + 3) & ~3;
  const out = new Uint8Array(size);
  putU32(out, 0, 0x00010000);
  putU16(out, 4, n); putU16(out, 6, pow * 16); putU16(out, 8, log); putU16(out, 10, n * 16 - pow * 16);
  let at = headerLen;
  tags.forEach((t, i) => {
    const data = tables[t];
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[r + k] = t.charCodeAt(k);
    const padded = new Uint8Array((data.length + 3) & ~3);
    padded.set(data);
    putU32(out, r + 4, checksum(padded));
    putU32(out, r + 8, at);
    putU32(out, r + 12, data.length);
    out.set(data, at);
    at += padded.length;
  });
  return out;
}

function sfntTableOffset(b, tag) {
  const n = u16(b, 4);
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16;
    if (String.fromCharCode(b[r], b[r + 1], b[r + 2], b[r + 3]) === tag) return u32(b, r + 8);
  }
  return -1;
}

function checksum(b) {
  let s = 0;
  for (let i = 0; i < b.length; i += 4) {
    s = (s + (((b[i] << 24) >>> 0) + ((b[i + 1] || 0) << 16) + ((b[i + 2] || 0) << 8) + (b[i + 3] || 0))) >>> 0;
  }
  return s;
}

function putU16(b, o, v) { b[o] = (v >> 8) & 255; b[o + 1] = v & 255; }
function putU32(b, o, v) { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; }

function concatBytes(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// ------------------------------------------------------------- ICC profile

/**
 * A small ICC v2 display profile for sRGB (D50-adapted primaries, a 2.2 gamma
 * curve), enough for a PDF/A output intent. Built here so no binary blob of
 * unknown provenance ships in the repository.
 */
export function srgbIccProfile() {
  const s15 = (v) => Math.round(v * 65536) | 0;
  const xyz = (x, y, z) => { const t = new Uint8Array(20); t.set([0x58, 0x59, 0x5a, 0x20]); putU32(t, 8, s15(x) >>> 0); putU32(t, 12, s15(y) >>> 0); putU32(t, 16, s15(z) >>> 0); return t; };
  const desc = (() => {
    const txt = "sRGB (einvoice-preflight)";
    const t = new Uint8Array(12 + txt.length + 1 + 8 + 3 + 67);
    t.set([0x64, 0x65, 0x73, 0x63]);
    putU32(t, 8, txt.length + 1);
    for (let i = 0; i < txt.length; i++) t[12 + i] = txt.charCodeAt(i);
    return t;
  })();
  const cprt = (() => {
    const txt = "No copyright, use freely";
    const t = new Uint8Array(8 + txt.length + 1);
    t.set([0x74, 0x65, 0x78, 0x74]);
    for (let i = 0; i < txt.length; i++) t[8 + i] = txt.charCodeAt(i);
    return t;
  })();
  const curv = new Uint8Array(14);
  curv.set([0x63, 0x75, 0x72, 0x76]);
  putU32(curv, 8, 1); putU16(curv, 12, 0x0233); // gamma 2.2 as u8Fixed8
  const data = [
    ["desc", desc], ["cprt", cprt], ["wtpt", xyz(0.9642, 1.0, 0.8249)],
    ["rXYZ", xyz(0.4361, 0.2225, 0.0139)], ["gXYZ", xyz(0.3851, 0.7169, 0.0971)], ["bXYZ", xyz(0.1431, 0.0606, 0.7141)],
    ["rTRC", curv], ["gTRC", curv], ["bTRC", curv],
  ];
  const tableLen = 4 + 12 * data.length;
  let at = 128 + tableLen;
  const placed = new Map();
  const entries = data.map(([sig, body]) => {
    if (!placed.has(body)) { at = (at + 3) & ~3; placed.set(body, at); at += body.length; }
    return [sig, placed.get(body), body.length];
  });
  const size = (at + 3) & ~3;
  const p = new Uint8Array(size);
  putU32(p, 0, size);
  putU32(p, 8, 0x02100000);
  p.set(UTF8.encode("mntrRGB XYZ "), 12);
  putU16(p, 24, 2026); putU16(p, 26, 1); putU16(p, 28, 1);
  p.set(UTF8.encode("acsp"), 36);
  putU32(p, 68, s15(0.9642)); putU32(p, 72, s15(1.0)); putU32(p, 76, s15(0.8249));
  putU32(p, 128, data.length);
  entries.forEach(([sig, off, len], i) => {
    p.set(UTF8.encode(sig), 132 + 12 * i);
    putU32(p, 136 + 12 * i, off);
    putU32(p, 140 + 12 * i, len);
  });
  for (const [body, off] of placed) p.set(body, off);
  return p;
}

// ------------------------------------------------------------------- text

class FontUse {
  constructor(bytes, name) {
    this.font = parseTrueType(bytes);
    this.name = name;
    this.used = new Map(); // gid -> string it stands for
    this.scale = 1000 / this.font.unitsPerEm;
  }
  glyphs(text) {
    const out = [];
    for (const ch of text) {
      let gid = this.font.cmap.get(ch.codePointAt(0));
      let shown = ch;
      if (!gid) { gid = this.font.cmap.get(0x3f) || 0; shown = "?"; }
      if (!this.used.has(gid)) this.used.set(gid, shown);
      out.push(gid);
    }
    return out;
  }
  width(text, size) {
    let w = 0;
    for (const ch of text) {
      const gid = this.font.cmap.get(ch.codePointAt(0)) || this.font.cmap.get(0x3f) || 0;
      w += Math.round(this.font.advances[gid] * this.scale);
    }
    return (w * size) / 1000;
  }
  hex(text) {
    return this.glyphs(text).map((g) => g.toString(16).padStart(4, "0")).join("");
  }
}

function wrap(font, text, size, width) {
  const lines = [];
  for (const para of String(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.width(next, size) <= width) { line = next; continue; }
      if (line) lines.push(line);
      line = word;
      while (font.width(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.width(line.slice(0, cut), size) > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

// ----------------------------------------------------------------- layout

const CATEGORY_LABEL = { S: "Standard", Z: "Zero rated", E: "Exempt", AE: "Reverse charge", K: "Intra-EU supply", G: "Export", O: "Outside scope" };

function money(cents, currency) {
  const neg = cents < 0;
  const [whole, frac] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${neg ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac} ${currency}`;
}

function number(v) {
  const s = String(v);
  return /^-?\d+(\.\d+)?$/.test(s) ? s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : s;
}

// A unit price with at least two decimals (100 -> 100.00, 0.125 -> 0.125).
function price(v) {
  const s = number(v);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const [w, f = ""] = s.split(".");
  return `${w}.${f.padEnd(2, "0")}`;
}

function partyLines(p) {
  const out = [p.name];
  if (p.street) out.push(p.street);
  if (p.street2) out.push(p.street2);
  const city = [p.postal_code, p.city].filter(Boolean).join(" ");
  out.push([city, p.country].filter(Boolean).join(", "));
  if (p.vat_id) out.push(`VAT ID ${p.vat_id}`);
  if (p.tax_number) out.push(`Tax number ${p.tax_number}`);
  if (p.company_id) out.push(`Company ID ${p.company_id}`);
  const c = p.contact || {};
  for (const v of [c.name, c.phone, c.email]) if (v) out.push(v);
  return out;
}

class Pages {
  constructor(regular, bold, footer) {
    this.regular = regular;
    this.bold = bold;
    this.footer = footer;
    this.pages = [];
    this.newPage();
  }
  newPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = A4[1] - MARGIN;
  }
  ensure(h) {
    if (this.y - h < MARGIN + 30) this.newPage();
  }
  text(str, x, y, size, { bold = false, align = "left", width = 0, grey = false } = {}) {
    const f = bold ? this.bold : this.regular;
    let tx = x;
    if (align === "right") tx = x + width - f.width(str, size);
    this.ops.push(`BT ${grey ? "0.35 0.35 0.35" : "0 0 0"} rg /${f.name} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td <${f.hex(str)}> Tj ET`);
  }
  rule(y, x0 = MARGIN, x1 = A4[0] - MARGIN, w = 0.5) {
    this.ops.push(`0.6 0.6 0.6 RG ${w} w ${x0.toFixed(2)} ${y.toFixed(2)} m ${x1.toFixed(2)} ${y.toFixed(2)} l S`);
  }
  finish() {
    const n = this.pages.length;
    this.pages.forEach((ops, i) => {
      this.ops = ops;
      this.rule(MARGIN + 14);
      this.text(this.footer, MARGIN, MARGIN, 7, { grey: true });
      if (n > 1) this.text(`Page ${i + 1} of ${n}`, MARGIN, MARGIN, 7, { grey: true, align: "right", width: A4[0] - 2 * MARGIN });
    });
    return this.pages.map((ops) => ops.join("\n"));
  }
}

function drawInvoice(doc, regular, bold, level, filename) {
  const footer = `Factur-X ${level} invoice: the legally relevant data is the embedded ${filename}. Made with einvoice-preflight (open source).`;
  const pg = new Pages(regular, bold, footer);
  const W = A4[0] - 2 * MARGIN;
  const cur = doc.currency;
  const title = doc.kind === "credit_note" ? "Credit note" : "Invoice";
  pg.text(title, MARGIN, pg.y - 18, 20, { bold: true });
  const meta = [["Number", doc.number], ["Issue date", doc.issue_date]];
  if (doc.due_date && doc.kind !== "credit_note") meta.push(["Due date", doc.due_date]);
  if (doc.delivery_date) meta.push(["Delivery date", doc.delivery_date]);
  if (doc.period && (doc.period.start || doc.period.end)) meta.push(["Period", `${doc.period.start || "?"} to ${doc.period.end || "?"}`]);
  if (doc.buyer_reference) meta.push(["Buyer reference", doc.buyer_reference]);
  if (doc.order_reference) meta.push(["Order", doc.order_reference]);
  if (doc.original_invoice) meta.push(["Corrects invoice", doc.original_invoice]);
  let my = pg.y - 4;
  for (const [k, v] of meta) {
    pg.text(k, MARGIN + W - 230, my - 10, 8.5, { grey: true });
    pg.text(String(v), MARGIN + W - 130, my - 10, 8.5, { bold: true, align: "right", width: 130 });
    my -= 12;
  }
  pg.y = Math.min(pg.y - 30, my) - 14;
  const colW = W / 2 - 10;
  const blocks = [["From", partyLines(doc.seller)], ["To", partyLines(doc.buyer)]];
  let lowest = pg.y;
  blocks.forEach(([label, lines], i) => {
    const x = MARGIN + i * (colW + 20);
    let y = pg.y;
    pg.text(label.toUpperCase(), x, y, 7.5, { grey: true, bold: true });
    y -= 13;
    lines.forEach((line, j) => {
      for (const part of wrap(regular, line, 9, colW)) {
        pg.text(part, x, y, j === 0 ? 10 : 9, { bold: j === 0 });
        y -= j === 0 ? 13 : 11.5;
      }
    });
    lowest = Math.min(lowest, y);
  });
  pg.y = lowest - 14;

  // Line table: # | description | qty unit | unit price | VAT | net
  const cols = [
    { h: "#", w: 22 }, { h: "Description", w: W - 22 - 62 - 66 - 40 - 82 },
    { h: "Quantity", w: 62, right: true }, { h: "Unit price", w: 66, right: true },
    { h: "VAT", w: 40, right: true }, { h: "Net", w: 82, right: true },
  ];
  const header = () => {
    pg.ensure(30);
    let x = MARGIN;
    for (const c of cols) { pg.text(c.h, x, pg.y - 10, 8, { bold: true, align: c.right ? "right" : "left", width: c.w }); x += c.w; }
    pg.rule(pg.y - 15);
    pg.y -= 28;
  };
  header();
  for (const l of doc.lines) {
    const desc = wrap(regular, l.description + (l.note ? `\n${l.note}` : ""), 9, cols[1].w - 8);
    const h = desc.length * 11.5 + 6;
    if (pg.y - h < MARGIN + 30) { pg.newPage(); header(); }
    const cells = [l.id, null, `${number(l.quantity)} ${l.unit}`, price(l.unit_price),
      l.category === "S" ? `${number(l.percent)}%` : l.category, money(l.net, cur)];
    let x = MARGIN;
    cols.forEach((c, i) => {
      if (i === 1) desc.forEach((d, k) => pg.text(d, x, pg.y - k * 11.5, 9, { grey: k > 0 && Boolean(l.note) && k >= desc.length - wrap(regular, l.note, 9, cols[1].w - 8).length }));
      else pg.text(String(cells[i]), x, pg.y, 9, { align: c.right ? "right" : "left", width: c.w });
      x += c.w;
    });
    pg.y -= h;
  }
  pg.rule(pg.y + 4);
  pg.y -= 10;

  // VAT breakdown and totals, right-aligned block.
  const rows = [];
  for (const g of doc.breakdown) {
    const label = g.category === "S" ? `VAT ${number(g.percent)}% on ${money(g.taxable, cur)}` : `${Object.hasOwn(CATEGORY_LABEL, g.category) ? CATEGORY_LABEL[g.category] : g.category} (${g.category}) on ${money(g.taxable, cur)}`;
    rows.push([label, money(g.tax, cur), false]);
  }
  const t = doc.totals;
  // Document-level allowances and charges (BG-20, BG-21) between the lines' total and the VAT
  // rows, so the printed page adds up to the same amounts as the embedded XML.
  const adj = [...(doc.allowances || []), ...(doc.charges || [])].map((a) => [
    `${a.charge ? "Charge" : "Allowance"}: ${a.charge_reason.length > 34 ? `${a.charge_reason.slice(0, 33)}…` : a.charge_reason} (${a.category === "S" ? `${number(a.percent)}%` : a.category})`,
    money(a.charge ? a.amount : -a.amount, cur), false]);
  if (adj.length) rows.unshift(["Total net of lines", money(t.net, cur), false], ...adj, ["Total net", money(t.taxable, cur), false]);
  else rows.unshift(["Total net", money(t.net, cur), false]);
  rows.push(["Total VAT", money(t.tax, cur), false], ["Total", money(t.gross, cur), true]);
  if (t.prepaid) rows.push(["Paid in advance", money(-t.prepaid, cur), false]);
  rows.push([doc.kind === "credit_note" ? "Amount credited" : "Amount due", money(t.due, cur), true]);
  pg.ensure(rows.length * 14 + 10);
  for (const [k, v, strong] of rows) {
    pg.text(k, MARGIN + W - 300, pg.y, 9, { bold: strong });
    pg.text(v, MARGIN + W - 120, pg.y, 9, { bold: strong, align: "right", width: 120 });
    pg.y -= 14;
  }
  const reasons = doc.breakdown.filter((g) => g.reason).map((g) => `${g.category}: ${g.reason}`);
  pg.y -= 8;

  const tail = [];
  const p = doc.payment || {};
  if (p.iban) tail.push(["Pay to", [`IBAN ${p.iban.replace(/(.{4})(?=.)/g, "$1 ")}`, p.bic ? `BIC ${p.bic}` : "", p.account_name].filter(Boolean).join("   ")]);
  if (p.reference) tail.push(["Payment reference", p.reference]);
  if (p.terms) tail.push(["Terms", p.terms]);
  if (reasons.length) tail.push(["VAT exemption", reasons.join("; ")]);
  if (doc.note) tail.push(["Note", doc.note]);
  for (const [k, v] of tail) {
    const lines = wrap(regular, v, 9, W - 110);
    pg.ensure(lines.length * 11.5 + 4);
    pg.text(k, MARGIN, pg.y, 8.5, { grey: true });
    lines.forEach((line, i) => pg.text(line, MARGIN + 110, pg.y - i * 11.5, 9));
    pg.y -= lines.length * 11.5 + 4;
  }
  return pg.finish();
}

// ------------------------------------------------------------- PDF objects

function pdfString(s) {
  return `(${String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?")})`;
}

function xmlEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pdfDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function xmpDate(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function xmpPacket({ title, date, level, filename, producer }) {
  const prop = (name, desc) => `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${desc}</pdfaProperty:description></rdf:li>`;
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
<pdfaid:part>3</pdfaid:part>
<pdfaid:conformance>B</pdfaid:conformance>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:format>application/pdf</dc:format>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(title)}</rdf:li></rdf:Alt></dc:title>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
<xmp:CreatorTool>${xmlEsc(producer)}</xmp:CreatorTool>
<xmp:CreateDate>${xmpDate(date)}</xmp:CreateDate>
<xmp:ModifyDate>${xmpDate(date)}</xmp:ModifyDate>
<xmp:MetadataDate>${xmpDate(date)}</xmp:MetadataDate>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<pdf:Producer>${xmlEsc(producer)}</pdf:Producer>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
<fx:DocumentType>INVOICE</fx:DocumentType>
<fx:DocumentFileName>${filename}</fx:DocumentFileName>
<fx:Version>1.0</fx:Version>
<fx:ConformanceLevel>${level}</fx:ConformanceLevel>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property><rdf:Seq>
${prop("DocumentFileName", "The name of the embedded XML document")}
${prop("DocumentType", "The type of the hybrid document in capital letters, e.g. INVOICE or ORDER")}
${prop("Version", "The actual version of the standard applying to the embedded XML document")}
${prop("ConformanceLevel", "The conformance level of the embedded XML document")}
</rdf:Seq></pdfaSchema:property>
</rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function toUnicodeCMap(used) {
  const entries = [...used.entries()].sort((a, b) => a[0] - b[0]);
  const hex = (s) => [...s].map((c) => {
    const cp = c.codePointAt(0);
    if (cp < 0x10000) return cp.toString(16).padStart(4, "0");
    const v = cp - 0x10000;
    return ((0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16));
  }).join("");
  const chunks = [];
  for (let i = 0; i < entries.length; i += 100) {
    const part = entries.slice(i, i + 100);
    chunks.push(`${part.length} beginbfchar\n${part.map(([g, s]) => `<${g.toString(16).padStart(4, "0")}> <${hex(s)}>`).join("\n")}\nendbfchar`);
  }
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${chunks.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}

function widthsArray(f) {
  const gids = [...f.used.keys()].sort((a, b) => a - b);
  const parts = [];
  let i = 0;
  while (i < gids.length) {
    const start = gids[i];
    const run = [];
    while (i < gids.length && gids[i] === start + run.length) {
      run.push(Math.round(f.font.advances[gids[i]] * f.scale));
      i++;
    }
    parts.push(`${start} [${run.join(" ")}]`);
  }
  return `[${parts.join(" ")}]`;
}

// FNV-1a over bytes: a stable, dependency-free fingerprint for the file /ID
// and the font subset tags (not a security hash; nothing depends on that).
function fnv(bytes, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

function subsetTag(f) {
  let h = fnv(UTF8.encode([...f.used.keys()].join(",") + f.name));
  let tag = "";
  for (let i = 0; i < 6; i++) { tag += String.fromCharCode(65 + (h % 26)); h = Math.floor(h / 26) + 7919 * (i + 1); }
  return tag;
}

class PdfWriter {
  constructor() { this.objects = []; }
  reserve() { this.objects.push(null); return this.objects.length; }
  set(num, dict, stream = null) { this.objects[num - 1] = { dict, stream }; return num; }
  add(dict, stream = null) { const n = this.reserve(); return this.set(n, dict, stream); }
  bytes(rootNum, idSeed) {
    const chunks = [UTF8.encode("%PDF-1.7\n"), new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
    let at = chunks.reduce((s, c) => s + c.length, 0);
    const offsets = [];
    this.objects.forEach((o, i) => {
      offsets.push(at);
      const parts = [];
      if (o.stream) {
        parts.push(UTF8.encode(`${i + 1} 0 obj\n<< ${o.dict} /Length ${o.stream.length} >>\nstream\n`), o.stream, UTF8.encode("\nendstream\nendobj\n"));
      } else {
        parts.push(UTF8.encode(`${i + 1} 0 obj\n${o.dict}\nendobj\n`));
      }
      for (const p of parts) { chunks.push(p); at += p.length; }
    });
    const id = [fnv(idSeed), fnv(idSeed, 0x1234567), fnv(idSeed, 0x7654321), fnv(idSeed, 0xabcdef)].map((v) => v.toString(16).padStart(8, "0")).join("");
    const xref = [`xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`];
    for (const off of offsets) xref.push(`${String(off).padStart(10, "0")} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${this.objects.length + 1} /Root ${rootNum} 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${at}\n%%EOF\n`);
    chunks.push(UTF8.encode(xref.join("")));
    return concatBytes(chunks);
  }
}

/**
 * Write a Factur-X PDF/A-3b from a built invoice document (generate.mjs
 * buildInvoice().doc) and its CII XML.
 * fonts: { regular: Uint8Array, bold: Uint8Array } (TrueType files).
 * date: the creation time written to the XMP and the attachment (default now).
 */
export function writeFacturXPdf(doc, ciiXml, { fonts, date = new Date() } = {}) {
  if (!fonts || !fonts.regular || !fonts.bold) throw new Error("writeFacturXPdf needs fonts.regular and fonts.bold (TrueType bytes).");
  const prof = Object.hasOwn(FACTURX_PROFILES, doc.profile) ? FACTURX_PROFILES[doc.profile] : null;
  if (!prof) throw new Error(`Factur-X has no profile for "${doc.profile}"; use en16931 or xrechnung.`);
  const regular = new FontUse(fonts.regular, "F1");
  const bold = new FontUse(fonts.bold, "F2");
  const pageStreams = drawInvoice(doc, regular, bold, prof.level, prof.filename);
  const xmlBytes = typeof ciiXml === "string" ? UTF8.encode(ciiXml) : ciiXml;

  const w = new PdfWriter();
  const catalog = w.reserve();
  const pagesNum = w.reserve();
  const fontRefs = [regular, bold].map((f) => {
    const program = subsetTrueType(f.font, [...f.used.keys()]);
    const base = `${subsetTag(f)}+PreflightSans-${f === bold ? "Bold" : "Regular"}`;
    const file = w.add(`/Length1 ${program.length}`, program);
    const ff = f.font;
    const s = (v) => Math.round(v * f.scale);
    const descriptor = w.add(`<< /Type /FontDescriptor /FontName /${base} /Flags 32 /FontBBox [${ff.bbox.map(s).join(" ")}] /ItalicAngle ${ff.italicAngle} /Ascent ${s(ff.ascent)} /Descent ${s(ff.descent)} /CapHeight ${s(ff.capHeight)} /StemV ${f === bold ? 140 : 80} /FontFile2 ${file} 0 R >>`);
    const cid = w.add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 1000 /W ${widthsArray(f)} /CIDToGIDMap /Identity >>`);
    const toUni = w.add("", UTF8.encode(toUnicodeCMap(f.used)));
    return w.add(`<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUni} 0 R >>`);
  });
  const resources = `<< /Font << /F1 ${fontRefs[0]} 0 R /F2 ${fontRefs[1]} 0 R >> >>`;
  const pageNums = pageStreams.map((ops) => {
    const content = w.add("", UTF8.encode(ops));
    return w.add(`<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources ${resources} /Contents ${content} 0 R >>`);
  });
  w.set(pagesNum, `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`);

  // The filespec is numbered (and so written) just before the stream, as most
  // generators do: readers that look for the name near the stream find it.
  const spec = w.reserve();
  const embedded = w.add(`/Type /EmbeddedFile /Subtype /text#2Fxml /Params << /Size ${xmlBytes.length} /ModDate (${pdfDate(date)}) >>`, xmlBytes);
  w.set(spec, `<< /Type /Filespec /F ${pdfString(prof.filename)} /UF ${pdfString(prof.filename)} /Desc (Factur-X ${prof.level} invoice data) /AFRelationship /Alternative /EF << /F ${embedded} 0 R /UF ${embedded} 0 R >> >>`);
  const icc = srgbIccProfile();
  const iccNum = w.add("/N 3", icc);
  const intent = w.add(`<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB) /Info (sRGB IEC61966-2.1) /DestOutputProfile ${iccNum} 0 R >>`);
  const title = `${doc.kind === "credit_note" ? "Credit note" : "Invoice"} ${doc.number}`;
  const xmp = UTF8.encode(xmpPacket({ title, date, level: prof.level, filename: prof.filename, producer: "einvoice-preflight Factur-X writer" }));
  const meta = w.add("/Type /Metadata /Subtype /XML", xmp);
  w.set(catalog, `<< /Type /Catalog /Pages ${pagesNum} 0 R /Metadata ${meta} 0 R /OutputIntents [${intent} 0 R] /Names << /EmbeddedFiles << /Names [${pdfString(prof.filename)} ${spec} 0 R] >> >> /AF [${spec} 0 R] /PageMode /UseAttachments /Lang (en) >>`);
  return w.bytes(catalog, concatBytes([xmlBytes, UTF8.encode(xmpDate(date))]));
}

/**
 * Draft -> { ok, errors, warnings, totals, pdf (Uint8Array), xml, filename }:
 * the same validation as generateInvoice, then the Factur-X PDF.
 */
export function generateFacturX(draft, { profile = "en16931", fonts, date } = {}) {
  const result = { ok: false, errors: [], warnings: [], format: "facturx" };
  if (!Object.hasOwn(FACTURX_PROFILES, profile)) {
    result.errors.push({ path: "profile", message: `Factur-X takes the en16931 or xrechnung profile, not "${profile}". Peppol BIS is sent as UBL or CII XML over the network, not as a PDF.` });
    return result;
  }
  const built = buildInvoice(draft, { profile });
  result.ok = built.ok;
  result.errors = built.errors;
  result.warnings = built.warnings;
  if (!built.ok) return result;
  const t = built.doc.totals;
  result.totals = { net: t.net / 100, tax: t.tax / 100, gross: t.gross / 100, prepaid: t.prepaid / 100, due: t.due / 100 };
  if (built.doc.allowances.length) result.totals.allowances = t.allowances / 100;
  if (built.doc.charges.length) result.totals.charges = t.charges / 100;
  if (built.doc.allowances.length || built.doc.charges.length) result.totals.taxable = t.taxable / 100;
  result.xml = toCii(built.doc);
  result.pdf = writeFacturXPdf(built.doc, result.xml, { fonts, date });
  result.filename = `${built.doc.number.replace(/[^\w.-]+/g, "_")}.pdf`;
  return result;
}
