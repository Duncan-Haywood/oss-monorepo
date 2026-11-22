// Reads an .xlsx / .xlsm workbook (an Office Open XML ZIP package) with no
// dependency: a ZIP central-directory reader, the platform's own
// DecompressionStream("deflate-raw") for the deflated parts, and small
// purpose-built XML scanners for the four part types an audit needs
// (workbook, its relationships, shared strings, worksheets).
//
// Source: ECMA-376 Part 1 (SpreadsheetML), sections 18.2 (workbook),
// 18.3.1 (worksheet sheetData / c / f / v) and 18.4 (shared strings);
// PKWARE APPNOTE.TXT for the ZIP records.

const td = new TextDecoder("utf-8");

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000; }

export function zipEntries(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) {
    if (b[0] === 0xd0 && b[1] === 0xcf) throw new Error("This is an old binary .xls file (Excel 97-2003). Open it in Excel or LibreOffice and save it as .xlsx first.");
    throw new Error("Not an .xlsx file: no ZIP directory found.");
  }
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error("Damaged ZIP directory.");
    const method = u16(b, p + 10);
    const csize = u32(b, p + 20);
    const nlen = u16(b, p + 28), elen = u16(b, p + 30), clen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = td.decode(b.subarray(p + 46, p + 46 + nlen));
    const lnlen = u16(b, local + 26), lelen = u16(b, local + 28);
    const start = local + 30 + lnlen + lelen;
    out.set(name.replace(/\\/g, "/"), { method, data: b.subarray(start, start + csize) });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

async function inflate(data) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readEntry(entries, name) {
  const key = name.replace(/^\//, "");
  let e = entries.get(key);
  if (!e) {
    const lower = key.toLowerCase();
    for (const [k, v] of entries) if (k.toLowerCase() === lower) { e = v; break; }
  }
  if (!e) return null;
  if (e.method === 0) return td.decode(e.data);
  if (e.method === 8) return td.decode(await inflate(e.data));
  throw new Error(`Unsupported ZIP compression method ${e.method} in ${name}.`);
}

export function decodeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, g) => {
    const k = g.toLowerCase();
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "amp") return "&";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const n = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  }).replace(/_x([0-9A-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Drop namespace prefixes on element names (<x:c> -> <c>), which some
// generators write; attributes keep theirs (r:id is looked up as such).
function stripPrefixes(xml) { return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1"); }

export function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = decodeXml(m[3] ?? m[4]);
  return out;
}

export function colToNum(s) { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
export function numToCol(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
export function addr(r, c) { return numToCol(c) + r; }
export function parseAddr(a) { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(a); return m ? { r: +m[2], c: colToNum(m[1]) } : null; }

function parseSharedStrings(xml) {
  if (!xml) return [];
  xml = stripPrefixes(xml);
  const out = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
    const body = (m[1] || "").replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    let s = "";
    for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += decodeXml(t[1]);
    out.push(s);
  }
  return out;
}

function resolveTarget(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function parseRels(xml, base) {
  const out = new Map();
  if (!xml) return out;
  for (const m of stripPrefixes(xml).matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    out.set(a.Id, { target: a.TargetMode === "External" ? a.Target : resolveTarget(base, a.Target), type: a.Type || "", external: a.TargetMode === "External" });
  }
  return out;
}

export function parseSheetXml(xml, sst) {
  xml = stripPrefixes(xml);
  const cells = new Map();
  const hiddenRows = new Set();
  const hiddenCols = [];
  const shared = new Map();
  for (const m of xml.matchAll(/<col\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.hidden === "1" || a.hidden === "true") hiddenCols.push([+a.min, +a.max]);
  }
  const dimM = /<dimension\b[^>]*ref="([^"]+)"/.exec(xml);
  const prot = /<sheetProtection\b[^>]*>/.exec(xml);
  const protectedSheet = !!prot && /\bsheet="(1|true)"/.test(prot[0]);
  let rowNum = 0;
  const rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g;
  for (const rm of xml.matchAll(rowRe)) {
    const ra = attrs(rm[1]);
    rowNum = ra.r ? +ra.r : rowNum + 1;
    if (ra.hidden === "1" || ra.hidden === "true") hiddenRows.add(rowNum);
    const body = rm[3] || "";
    let colNum = 0;
    for (const cm of body.matchAll(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs(cm[1]);
      let r = rowNum, c;
      if (a.r) { const p = parseAddr(a.r); r = p.r; c = p.c; } else c = colNum + 1;
      colNum = c;
      const inner = cm[3] || "";
      const cell = { r, c, t: a.t || "n", s: a.s ? +a.s : 0 };
      const fm = /<f\b([^>]*?)(\/>|>([\s\S]*?)<\/f>)/.exec(inner);
      if (fm) {
        const fa = attrs(fm[1]);
        const text = decodeXml(fm[3] || "");
        if (fa.t === "shared" && fa.si !== undefined) {
          if (text) shared.set(fa.si, { r, c, text });
          cell.sharedSi = fa.si;
          if (text) cell.f = text;
        } else if (text) cell.f = text;
        if (fa.t === "array") cell.array = fa.ref || addr(r, c);
        if (fa.t === "dataTable") cell.dataTable = true;
      }
      const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
      const raw = vm ? decodeXml(vm[1]) : null;
      if (cell.t === "s") { cell.v = raw === null ? null : (sst[+raw] ?? ""); cell.kind = "text"; }
      else if (cell.t === "inlineStr") {
        let s = ""; for (const t of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += decodeXml(t[1]);
        cell.v = s; cell.kind = "text";
      } else if (cell.t === "str") { cell.v = raw ?? ""; cell.kind = "text"; }
      else if (cell.t === "b") { cell.v = raw === "1"; cell.kind = "bool"; }
      else if (cell.t === "e") { cell.v = raw ?? "#N/A"; cell.kind = "error"; }
      else if (cell.t === "d") { cell.v = raw; cell.kind = raw === null ? "empty" : "number"; }
      else { cell.v = raw === null || raw === "" ? null : Number(raw); cell.kind = cell.v === null ? "empty" : "number"; }
      if (cell.kind === "empty" && !cell.f && cell.sharedSi === undefined) continue;
      cells.set(r * 16384 + c, cell);
    }
  }
  return { cells, shared, hiddenRows, hiddenCols, dimension: dimM ? dimM[1] : null, protectedSheet };
}

export async function readWorkbook(bytes) {
  const entries = zipEntries(bytes);
  const ct = await readEntry(entries, "[Content_Types].xml");
  const rootRels = parseRels(await readEntry(entries, "_rels/.rels"), "");
  let wbPath = "xl/workbook.xml";
  for (const r of rootRels.values()) if (/officeDocument$/.test(r.type)) wbPath = r.target;
  const wbXmlRaw = await readEntry(entries, wbPath);
  if (!wbXmlRaw) throw new Error(ct && /opendocument/i.test(ct) ? "This looks like an OpenDocument file; save it as .xlsx first." : "No workbook part found; is this an .xlsx file?");
  const wbXml = stripPrefixes(wbXmlRaw);
  const relsPath = wbPath.replace(/[^/]+$/, (f) => `_rels/${f}.rels`);
  const rels = parseRels(await readEntry(entries, relsPath), wbPath);
  let sstPath = null;
  for (const r of rels.values()) if (/sharedStrings$/.test(r.type)) sstPath = r.target;
  const sst = parseSharedStrings(sstPath ? await readEntry(entries, sstPath) : await readEntry(entries, "xl/sharedStrings.xml"));
  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    const rid = a["r:id"] || Object.entries(a).find(([k]) => /:id$/.test(k))?.[1];
    const rel = rels.get(rid);
    const sheet = { name: a.name, state: a.state || "visible", path: rel?.target || null, kind: rel && /chartsheet$/.test(rel.type) ? "chart" : "worksheet" };
    if (sheet.kind === "worksheet" && sheet.path) {
      const xml = await readEntry(entries, sheet.path);
      Object.assign(sheet, xml ? parseSheetXml(xml, sst) : { cells: new Map(), shared: new Map(), hiddenRows: new Set(), hiddenCols: [] });
    } else Object.assign(sheet, { cells: new Map(), shared: new Map(), hiddenRows: new Set(), hiddenCols: [] });
    sheets.push(sheet);
  }
  const names = [];
  for (const m of wbXml.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
    const a = attrs(m[1]);
    names.push({ name: a.name, text: decodeXml(m[2]), localSheetId: a.localSheetId !== undefined ? +a.localSheetId : null, hidden: a.hidden === "1" || a.hidden === "true" });
  }
  const calcPr = /<calcPr\b[^>]*>/.exec(wbXml);
  const calc = calcPr ? attrs(calcPr[0]) : {};
  const externalLinks = [];
  for (const r of rels.values()) {
    if (!/externalLink$/.test(r.type)) continue;
    const elRels = parseRels(await readEntry(entries, r.target.replace(/[^/]+$/, (f) => `_rels/${f}.rels`)), r.target);
    for (const er of elRels.values()) externalLinks.push(er.target);
  }
  const hasMacros = [...entries.keys()].some((k) => /vbaProject\.bin$/i.test(k));
  return { sheets, names, iterate: calc.iterate === "1" || calc.iterate === "true", calcMode: calc.calcMode || "auto", externalLinks, hasMacros };
}
