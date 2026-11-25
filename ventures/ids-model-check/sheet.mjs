// An IDS as a spreadsheet, and a spreadsheet as an IDS.
//
// Requirements are often agreed in a table first (a client's information
// requirements, a LOIN matrix) and typed into an IDS by hand afterwards. This
// file turns an IDS into one row per facet, which Excel, LibreOffice or Google
// Sheets open as they are, and turns such a table back into IDS 1.0. Runs in
// Node and the browser; imports only this venture's own readers.
//
//   idsToRows(idsText)            -> string[][] (header row first)
//   rowsToIds(rows)               -> { text, errors: [{row, message}], warnings }
//   rowsToCsv(rows, sep = ",")    -> CSV text (RFC 4180)
//   csvToRows(text)               -> string[][] (comma, semicolon or tab, found from the header)
//   rowsToXlsx(rows, { lists })   -> Uint8Array (an .xlsx with a "Read me" sheet and dropdown lists)
//   sheetLists({ schemas, psets }) -> { entity, propertySet, dataType } words for those dropdowns
//   sheetVersions(rows)           -> the schema ids (IFC2X3, IFC4, IFC4X3) the rows name
//   sheetsToXlsx([{ name, rows, widths }]) -> Uint8Array (any worksheets, cells as Text)
//   await xlsxToRows(bytes, inflateRaw, { sheet }) -> string[][] (the sheet named, else the one named IDS, else the first;
//                                    dates as ISO 8601, numbers as Excel shows them)
//   await sheetToRows(bytes, inflateRaw) -> .xlsx or CSV by content; .xls/encrypted named
//
// The table (one row per facet, README "An IDS as a spreadsheet"):
//   section  info | specification | applicability | requirements
//   facet    entity | partOf | classification | attribute | property | material
//            (on info rows: the info field, title, author, ...)
//   value cells (entity, predefinedType, propertySet, property, attribute,
//   system, value): plain text is that exact value; a restriction is written
//   as clauses joined by ";":  one of: EI30 | EI60     pattern: [A-Z]{2}\d+
//   >= 0; < 10     length: 4     min length: 1     max length: 12     base: integer
//   A leading backslash is removed and keeps what follows literal: \one of: x is
//   the plain value "one of: x", \=SUM(A1) is "=SUM(A1)". Inside a clause ";;"
//   is a literal ";" and, in a one-of list, "||" a literal "|".
//   An empty cell is no element at all.

import { parseXml, kid, kids } from "./xml.mjs";
import { zipStore } from "./bcf.mjs";
import { zipEntries, readEntry } from "./zip.mjs";
import { temporalKind } from "./temporal.mjs";
import { fixStructure } from "./fix.mjs";

export const COLUMNS = ["spec", "section", "facet", "name", "ifcVersion", "entity", "predefinedType", "propertySet", "property", "dataType", "attribute", "system", "value", "relation", "cardinality", "uri", "instructions", "description", "identifier"];
const FACETS = ["entity", "partOf", "classification", "attribute", "property", "material"];
// Facet attributes that have a column of the same name.
const FACET_ATTRS = ["relation", "dataType", "cardinality", "uri", "instructions"];
// Value-like child elements of each facet, and the column each one goes in.
const PARTS = {
  entity: [["name", "entity"], ["predefinedType", "predefinedType"]],
  attribute: [["name", "attribute"], ["value", "value"]],
  property: [["propertySet", "propertySet"], ["baseName", "property"], ["value", "value"]],
  classification: [["value", "value"], ["system", "system"]],
  material: [["value", "value"]],
  partOf: [],
};
const SPEC_ATTRS = ["name", "ifcVersion", "identifier", "description", "instructions"];
const BOUNDS = [["minInclusive", ">="], ["minExclusive", ">"], ["maxInclusive", "<="], ["maxExclusive", "<"]];
const LENGTHS = [["length", "length:"], ["minLength", "min length:"], ["maxLength", "max length:"]];
// A cell that reads as a restriction, so a plain value spelled like one needs a backslash.
const RESTRICTION_START = /^\s*(one of:|pattern:|base:|length:|min length:|max length:|note:|>=|<=|>|<)/i;

const local = (s) => String(s).replace(/^[\w.-]+:/, "");
const escText = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const escAttr = (s) => escText(s).replace(/"/g, "&quot;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;").replace(/\t/g, "&#9;");

// ---------------------------------------------------------------- cells ----

// Plain text as a cell: a leading backslash, or text a reader would take for a
// restriction, gets one more backslash in front.
export function literalCell(s) {
  return s === "" || s.startsWith("\\") || RESTRICTION_START.test(s) ? "\\" + s : s;
}

// The base a restriction gets when its cell names none.
function defaultBase(r) {
  const bounds = BOUNDS.map(([k]) => r[k]).filter((v) => v !== undefined);
  if (!bounds.length) return "string";
  const kinds = new Set(bounds.map((b) => temporalKind(b)));
  if (kinds.size === 1) {
    const k = [...kinds][0];
    if (k) return k; // date, dateTime, time, duration
  }
  return "double";
}

const dbl = (s, ch) => s.split(ch).join(ch + ch);

// A <value>-like element (<simpleValue> or <xs:restriction>) as a cell.
// Returns null when the element holds something a cell cannot say.
function valueCell(node) {
  const sv = kid(node, "simpleValue");
  const r = kid(node, "restriction");
  const elems = node.children.filter((c) => c.local);
  if (sv && elems.length === 1) return literalCell(sv.text);
  if (!elems.length) return node.text.trim() === "" ? null : literalCell(node.text.trim());
  if (!r || elems.length !== 1) return null;
  const val = {};
  const enums = [], pats = [];
  let notes = null;
  for (const c of r.children.filter((x) => x.local)) {
    if (c.local === "annotation") {
      // <xs:annotation><xs:documentation>: an author's note on the restriction.
      if (notes) return null;
      notes = [];
      for (const d of c.children.filter((x) => x.local)) {
        if (d.local !== "documentation" || d.children.some((x) => x.local) || Object.keys(d.attrs).length) return null;
        notes.push(d.text);
      }
      continue;
    }
    if (c.attrs.value === undefined) return null;
    if (c.local === "enumeration") enums.push(c.attrs.value);
    else if (c.local === "pattern") pats.push(c.attrs.value);
    else if (BOUNDS.some(([k]) => k === c.local) || LENGTHS.some(([k]) => k === c.local)) {
      if (val[c.local] !== undefined) return null;
      val[c.local] = c.attrs.value;
    } else return null;
  }
  const clauses = [];
  const base = r.attrs.base === undefined ? null : local(r.attrs.base);
  if (enums.length) clauses.push("one of: " + enums.map((x) => dbl(dbl(x, ";"), "|")).join(" | "));
  for (const p of pats) clauses.push("pattern: " + dbl(p, ";"));
  for (const [k, op] of BOUNDS) if (val[k] !== undefined) clauses.push(`${op} ${dbl(val[k], ";")}`);
  for (const [k, word] of LENGTHS) if (val[k] !== undefined) clauses.push(`${word} ${dbl(val[k], ";")}`);
  if (notes) clauses.unshift(...(notes.length ? notes.map((t) => "note: " + dbl(t, ";")) : ["note:"]));
  if (base === null) clauses.push("base: (none)");
  else if (base !== defaultBase(val) || !clauses.length) clauses.unshift("base: " + base);
  return clauses.join("; ");
}

// Split on a separator, where the separator written twice is a literal one.
function splitDoubled(s, ch) {
  const out = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ch) {
      if (s[i + 1] === ch) { cur += ch; i++; continue; }
      out.push(cur); cur = "";
    } else cur += s[i];
  }
  out.push(cur);
  return out;
}

// A cell as the XML inside a <value>-like element, or { error }.
export function cellXml(cell) {
  if (cell.startsWith("\\")) return { xml: `<simpleValue>${escText(cell.slice(1))}</simpleValue>` };
  if (!RESTRICTION_START.test(cell)) return { xml: `<simpleValue>${escText(cell)}</simpleValue>` };
  const r = {};
  const enums = [], pats = [];
  let notes = null;
  let base;
  for (const raw of splitDoubled(cell, ";")) {
    const c = raw.trim();
    if (c === "") continue;
    let m;
    if ((m = /^one of:\s*([\s\S]*)$/i.exec(c))) enums.push(...splitDoubled(m[1], "|").map((x) => x.trim()));
    else if ((m = /^pattern:\s*([\s\S]*)$/i.exec(c))) pats.push(m[1]);
    else if ((m = /^note:\s*([\s\S]*)$/i.exec(c))) { notes ||= []; if (m[1] !== "") notes.push(m[1]); }
    else if ((m = /^base:\s*(\S+)$/i.exec(c))) base = m[1] === "(none)" ? null : local(m[1]);
    else if ((m = /^(>=|<=|>|<)\s*([\s\S]+)$/.exec(c))) {
      const k = BOUNDS.find(([, op]) => op === m[1])[0];
      if (r[k] !== undefined) return { error: `"${m[1]}" is written twice` };
      r[k] = m[2].trim();
    } else if ((m = /^(length:|min length:|max length:)\s*(\S+)$/i.exec(c))) {
      const k = LENGTHS.find(([, w]) => w === m[1].toLowerCase())[0];
      if (r[k] !== undefined) return { error: `"${m[1]}" is written twice` };
      r[k] = m[2];
    } else return { error: `"${c}" is not a restriction clause (one of:, pattern:, >=, >, <=, <, length:, min length:, max length:, base:, note:); start the cell with a backslash to write it as a plain value` };
  }
  if (base === undefined) base = defaultBase(r);
  const parts = [];
  if (notes) parts.push(notes.length ? `<xs:annotation>${notes.map((t) => `<xs:documentation>${escText(t)}</xs:documentation>`).join("")}</xs:annotation>` : `<xs:annotation/>`);
  for (const x of enums) parts.push(`<xs:enumeration value="${escAttr(x)}"/>`);
  for (const x of pats) parts.push(`<xs:pattern value="${escAttr(x)}"/>`);
  for (const [k] of [...BOUNDS, ...LENGTHS]) if (r[k] !== undefined) parts.push(`<xs:${k} value="${escAttr(r[k])}"/>`);
  const b = base === null ? "" : ` base="xs:${escAttr(base)}"`;
  return { xml: parts.length ? `<xs:restriction${b}>${parts.join("")}</xs:restriction>` : `<xs:restriction${b}/>` };
}

// --------------------------------------------------------------- IDS -> rows

function occursCell(app) {
  const mn = app.attrs.minOccurs, mx = app.attrs.maxOccurs;
  if (mn === undefined && mx === undefined) return "";
  if (mn === "1" && mx === "unbounded") return "required";
  if (mn === "0" && mx === "unbounded") return "optional";
  if (mn === "0" && mx === "0") return "prohibited";
  return `${mn ?? ""}..${mx ?? ""}`;
}

// Text attributes go in as written; a leading backslash is doubled.
// An attribute written empty (instructions="") is a lone backslash, so it
// comes back as written rather than left out.
const textCell = (s) => (s === undefined ? "" : s === "" || s.startsWith("\\") ? "\\" + s : s);

// One facet element as a row; notes collect what a row cannot carry.
function facetRow(f, spec, section, notes) {
  const row = Object.fromEntries(COLUMNS.map((c) => [c, ""]));
  row.spec = String(spec); row.section = section; row.facet = f.local;
  for (const [a, v] of Object.entries(f.attrs)) {
    if (FACET_ATTRS.includes(a)) row[a] = textCell(v);
    else if (!a.startsWith("xmlns")) notes.push(`spec ${spec} ${section} ${f.local}: attribute ${a} is not kept`);
  }
  let target = f;
  const known = new Set((Object.hasOwn(PARTS, f.local) ? PARTS[f.local] : []).map(([e]) => e));
  if (f.local === "partOf") {
    const en = kid(f, "entity");
    for (const c of f.children) if (c.local && c.local !== "entity") notes.push(`spec ${spec} ${section} partOf: <${c.local}> is not kept`);
    if (!en) return row;
    target = en;
    for (const k of ["name", "predefinedType"]) known.add(k);
    for (const a of Object.keys(en.attrs)) notes.push(`spec ${spec} ${section} partOf entity: attribute ${a} is not kept`);
  }
  const parts = f.local === "partOf" || !Object.hasOwn(PARTS, f.local) ? PARTS.entity : PARTS[f.local];
  for (const c of target.children) {
    if (!c.local) continue;
    if (!known.has(c.local)) { notes.push(`spec ${spec} ${section} ${f.local}: <${c.local}> is not kept`); continue; }
    const col = parts.find(([e]) => e === c.local)[1];
    const cell = valueCell(c);
    if (cell === null) notes.push(`spec ${spec} ${section} ${f.local}: <${c.local}> holds something a cell cannot say`);
    else row[col] = cell;
  }
  return row;
}

export function idsToRows(text, opts = {}) {
  const root = parseXml(text);
  if (root.local !== "ids") throw new Error(`not an IDS file: root element is <${root.name}>`);
  const notes = [];
  const out = [];
  const blank = () => Object.fromEntries(COLUMNS.map((c) => [c, ""]));
  const info = kid(root, "info");
  if (info) for (const c of info.children) {
    if (!c.local) continue;
    const r = blank(); r.section = "info"; r.facet = c.local; r.value = textCell(c.text); out.push(r);
  }
  let n = 0;
  for (const s of kids(kid(root, "specifications"), "specification")) {
    n++;
    const r = blank(); r.spec = String(n); r.section = "specification";
    for (const [a, v] of Object.entries(s.attrs)) {
      if (SPEC_ATTRS.includes(a)) r[a] = textCell(v);
      else notes.push(`spec ${n}: attribute ${a} is not kept`);
    }
    const app = kid(s, "applicability");
    if (app) {
      r.cardinality = occursCell(app);
      for (const a of Object.keys(app.attrs)) if (a !== "minOccurs" && a !== "maxOccurs") notes.push(`spec ${n} applicability: attribute ${a} is not kept`);
    }
    out.push(r);
    const req = kid(s, "requirements");
    for (const c of s.children) if (c.local && c.local !== "applicability" && c.local !== "requirements") notes.push(`spec ${n}: <${c.local}> is not kept`);
    for (const [sec, node] of [["applicability", app], ["requirements", req]]) {
      if (!node) continue;
      const facets = node.children.filter((c) => c.local);
      if (sec === "requirements" && (node.attrs.description !== undefined || !facets.length)) {
        const q = blank(); q.spec = String(n); q.section = "requirements"; q.description = textCell(node.attrs.description); out.push(q);
      }
      for (const f of facets) {
        if (!FACETS.includes(f.local)) { notes.push(`spec ${n} ${sec}: <${f.local}> is not kept`); continue; }
        out.push(facetRow(f, n, sec, notes));
      }
    }
  }
  const rows = [COLUMNS.slice(), ...out.map((r) => COLUMNS.map((c) => r[c]))];
  if (opts.notes) return { rows, notes };
  return rows;
}

// The rows for an IDS as the page and the CLI make them: ids.xsd faults with
// one right answer (fix.mjs: IDS 0.9's minOccurs, <name> for <baseName>, ...)
// are repaired first, so the sheet holds what the file meant.
// -> { rows, notes, fixes }
export function sheetFromIds(text) {
  const fx = fixStructure(text);
  const src = !fx.error && fx.fixes.length ? fx.text : text;
  const { rows, notes } = idsToRows(src, { notes: true });
  return { rows, notes, fixes: !fx.error ? fx.fixes : [] };
}

// --------------------------------------------------------------- rows -> IDS

const HEADER_ALIASES = { spec: ["spec", "specification #", "spec #", "#"], propertyset: ["propertyset", "property set", "pset"], property: ["property", "basename", "property name"], predefinedtype: ["predefinedtype", "predefined type"], ifcversion: ["ifcversion", "ifc version"], datatype: ["datatype", "data type"] };

function columnIndex(header) {
  const norm = header.map((h) => String(h ?? "").trim().toLowerCase());
  const idx = {};
  const unknown = [];
  norm.forEach((h, i) => {
    if (h === "") return;
    let col = COLUMNS.find((c) => c.toLowerCase() === h);
    if (!col) for (const [k, names] of Object.entries(HEADER_ALIASES)) if (names.includes(h)) col = COLUMNS.find((c) => c.toLowerCase() === k);
    if (col && idx[col] === undefined) idx[col] = i; else unknown.push(header[i]);
  });
  return { idx, unknown };
}

const unescapeText = (s) => (s.startsWith("\\") ? s.slice(1) : s);

function occursAttrs(cell) {
  const c = cell.trim().toLowerCase();
  if (c === "") return { attrs: "" };
  if (c === "required") return { attrs: ` minOccurs="1" maxOccurs="unbounded"` };
  if (c === "optional") return { attrs: ` minOccurs="0" maxOccurs="unbounded"` };
  if (c === "prohibited") return { attrs: ` minOccurs="0" maxOccurs="0"` };
  const m = /^(\d*)\.\.(\d*|unbounded)$/.exec(c);
  if (!m) return { error: `cardinality "${cell}" is not required, optional, prohibited or min..max` };
  return { attrs: (m[1] !== "" ? ` minOccurs="${m[1]}"` : "") + (m[2] !== "" ? ` maxOccurs="${m[2]}"` : "") };
}

const APP_ORDER = ["entity", "partOf", "classification", "attribute", "property", "material"];

export function rowsToIds(rows) {
  const errors = [], warnings = [];
  const headerAt = rows.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (headerAt < 0) return { text: null, errors: [{ row: 1, message: "the sheet is empty" }], warnings };
  const { idx, unknown } = columnIndex(rows[headerAt]);
  if (idx.section === undefined || idx.facet === undefined) return { text: null, errors: [{ row: headerAt + 1, message: `the first row must name the columns, with at least "section" and "facet" (found: ${rows[headerAt].filter((c) => c !== "").join(", ")})` }], warnings };
  if (unknown.length) warnings.push({ row: headerAt + 1, message: `columns not read: ${unknown.join(", ")}` });
  const info = [];
  const specs = new Map();
  let current = null;
  for (let i = headerAt + 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (c) => (idx[c] === undefined ? "" : String(row[idx[c]] ?? ""));
    if (COLUMNS.every((c) => get(c).trim() === "")) continue;
    const rn = i + 1;
    const section = get("section").trim().toLowerCase();
    const facet = get("facet").trim();
    const specKey = get("spec").trim();
    if (section === "info") {
      if (!/^[A-Za-z]\w*$/.test(facet)) { errors.push({ row: rn, message: `an info row needs the field name (title, author, ...) in "facet"` }); continue; }
      info.push([facet, unescapeText(get("value"))]);
      continue;
    }
    if (section === "specification") {
      const key = specKey || String(specs.size + 1);
      if (specs.has(key)) { errors.push({ row: rn, message: `specification ${key} is started twice` }); continue; }
      const occ = occursAttrs(get("cardinality"));
      if (occ.error) errors.push({ row: rn, message: occ.error });
      current = { key, row: rn, attrs: SPEC_ATTRS.filter((a) => get(a) !== "").map((a) => ` ${a}="${escAttr(unescapeText(get(a)))}"`).join(""), occurs: occ.attrs || "", app: [], req: [], reqDesc: undefined, reqSeen: false };
      if (get("name").trim() === "") warnings.push({ row: rn, message: `specification ${key} has no name, which ids.xsd requires` });
      if (get("ifcVersion").trim() === "") warnings.push({ row: rn, message: `specification ${key} has no ifcVersion, which ids.xsd requires` });
      specs.set(key, current);
      continue;
    }
    if (section !== "applicability" && section !== "requirements") { errors.push({ row: rn, message: `section "${get("section")}" is not info, specification, applicability or requirements` }); continue; }
    const spec = specKey ? specs.get(specKey) : current;
    if (!spec) { errors.push({ row: rn, message: specKey ? `specification ${specKey} has no specification row above this one` : "a facet row before any specification row" }); continue; }
    current = spec;
    if (section === "requirements" && facet === "") {
      spec.reqSeen = true;
      if (get("description") !== "") spec.reqDesc = unescapeText(get("description"));
      continue;
    }
    const kind = FACETS.find((f) => f.toLowerCase() === facet.toLowerCase());
    if (!kind) { errors.push({ row: rn, message: `facet "${facet}" is not one of ${FACETS.join(", ")}` }); continue; }
    const inReq = section === "requirements";
    let attrs = "";
    for (const a of FACET_ATTRS) {
      const v = get(a);
      if (v === "") continue;
      if (a === "cardinality" && (!inReq || kind === "entity")) { warnings.push({ row: rn, message: `cardinality is read only on requirement facets other than entity; "${v}" left out` }); continue; }
      if (a === "relation" && kind !== "partOf") continue;
      if (a === "dataType" && kind !== "property") continue;
      if (a === "uri" && !["classification", "property", "material"].includes(kind)) continue;
      // Required, OPTIONAL: the IDS words in any case; anything else as written.
      let val = unescapeText(v);
      if (a === "cardinality" && ["required", "optional", "prohibited"].includes(val.trim().toLowerCase())) val = val.trim().toLowerCase();
      attrs += ` ${a}="${escAttr(val)}"`;
    }
    // A CSV saved by Excel or LibreOffice writes a typed true as TRUE, which
    // matches no IDS boolean (they are lower case); on a boolean-typed
    // property the case is fixed, with a warning, as the .xlsx reader does.
    const boolValue = kind === "property" && /^IFC(BOOLEAN|LOGICAL)$/i.test(get("dataType").trim());
    const part = (el, col) => {
      let c = get(col);
      if (c === "") return "";
      if (boolValue && col === "value") {
        const lower = c.replace(/\b(TRUE|FALSE)\b/gi, (w) => w.toLowerCase());
        if (lower !== c && /^\s*(?:one of:\s*)?(?:true|false)(?:\s*\|\s*(?:true|false))*\s*$/i.test(c)) {
          warnings.push({ row: rn, message: `value "${c}" written "${lower}": IDS booleans are lower case, and a spreadsheet saved as CSV writes TRUE and FALSE` });
          c = lower;
        }
      }
      const x = cellXml(c);
      if (x.error) { errors.push({ row: rn, message: `${col}: ${x.error}` }); return ""; }
      return `<${el}>${x.xml}</${el}>`;
    };
    const used = new Set();
    const parts = (kind === "partOf" ? [] : PARTS[kind]).map(([el, col]) => { used.add(col); return part(el, col); }).join("");
    let xml;
    if (kind === "partOf") {
      used.add("entity"); used.add("predefinedType");
      const inner = part("name", "entity") + part("predefinedType", "predefinedType");
      if (get("entity") === "") errors.push({ row: rn, message: "a partOf facet needs the class it is part of in \"entity\"" });
      xml = `<partOf${attrs}><entity>${inner}</entity></partOf>`;
    } else {
      if (kind === "entity" && get("entity") === "") errors.push({ row: rn, message: "an entity facet needs a class in \"entity\"" });
      if (kind === "attribute" && get("attribute") === "") errors.push({ row: rn, message: "an attribute facet needs its name in \"attribute\"" });
      if (kind === "property" && (get("propertySet") === "" || get("property") === "")) errors.push({ row: rn, message: "a property facet needs \"propertySet\" and \"property\"" });
      xml = parts ? `<${kind}${attrs}>${parts}</${kind}>` : `<${kind}${attrs}/>`;
    }
    const stray = ["entity", "predefinedType", "propertySet", "property", "attribute", "system", "value"].filter((c) => !used.has(c) && get(c) !== "");
    if (stray.length) warnings.push({ row: rn, message: `${stray.join(", ")} not read on a ${kind} facet` });
    if (inReq) spec.req.push(xml); else spec.app.push({ kind, xml });
    if (inReq) spec.reqSeen = true;
  }
  if (!specs.size) warnings.push({ row: headerAt + 2, message: "no specification rows" });
  if (!info.some(([k]) => k === "title")) warnings.push({ row: headerAt + 1, message: "no info row with the title, which ids.xsd requires; written as \"Untitled IDS\"" });
  const L = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">`,
    `  <info>`,
    ...(info.some(([k]) => k === "title") ? [] : [`    <title>Untitled IDS</title>`]),
    ...info.map(([k, v]) => `    <${k}>${escText(v)}</${k}>`),
    `  </info>`,
    `  <specifications>`,
  ];
  for (const s of specs.values()) {
    L.push(`    <specification${s.attrs}>`);
    // ids.xsd fixes the order of applicability facets (requirements take any
    // order); rows may come in any, so they are written in the schema's order.
    const app = s.app.slice().sort((a, b) => APP_ORDER.indexOf(a.kind) - APP_ORDER.indexOf(b.kind)).map((f) => f.xml);
    L.push(`      <applicability${s.occurs}>`, ...app.map((x) => "        " + x), `      </applicability>`);
    if (s.reqSeen) {
      const d = s.reqDesc !== undefined ? ` description="${escAttr(s.reqDesc)}"` : "";
      if (s.req.length) L.push(`      <requirements${d}>`, ...s.req.map((x) => "        " + x), `      </requirements>`);
      else L.push(`      <requirements${d}/>`);
    }
    L.push(`    </specification>`);
  }
  L.push(`  </specifications>`, `</ids>`, "");
  return { text: errors.length ? null : L.join("\n"), errors, warnings };
}

// ----------------------------------------------------------------- CSV ----

// Excel runs a cell starting with = + - @ as a formula when it opens a CSV;
// such cells get the table's own leading backslash, which rowsToIds removes.
const FORMULA = /^[=+@\t\r]|^-(?![\d.])/;

export function rowsToCsv(rows, sep = ",") {
  const q = (v) => {
    let s = String(v ?? "");
    if (FORMULA.test(s)) s = "\\" + s;
    return /["\n\r]/.test(s) || s.includes(sep) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\ufeff" + rows.map((r) => r.map(q).join(sep)).join("\r\n") + "\r\n";
}

export function csvToRows(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // The separator: whichever of tab, semicolon and comma the header line has most of.
  const firstLine = text.split(/\r?\n/, 1)[0];
  const count = (ch) => firstLine.split(ch).length - 1;
  const sep = ["\t", ";", ","].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");
  const rows = [];
  let row = [], cell = "", i = 0, quoted = false, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } inQ = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === "" && !quoted) { inQ = true; quoted = true; i++; continue; }
    if (c === sep) { row.push(cell); cell = ""; quoted = false; i++; continue; }
    if (c === "\r" || c === "\n") {
      row.push(cell); rows.push(row); row = []; cell = ""; quoted = false;
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += c; i++;
  }
  if (inQ) throw new Error("the CSV ends inside a quoted cell");
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------- XLSX ----

const colName = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
// XML 1.0 has no place for most control characters.
// A cell's text as an OOXML string (ST_Xstring): characters XML cannot hold
// written _xHHHH_ (a CR as _x000D_, as Excel writes it: a literal CR would be
// read as a line end and lost), and a literal _xHHHH_ kept as _x005F_xHHHH_.
// Other control characters are dropped.
const xmlSafe = (s) => String(s)
  .replace(/_x([0-9A-Fa-f]{4})_/g, "_x005F_x$1_")
  .replace(/\r/g, "_x000D_")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

// text: every cell, and every column's empty cells, formatted as Text (@),
// so what a person types later stays the characters they typed: Excel and
// LibreOffice otherwise turn 42.0 into 42, true into TRUE and 2024-01-01 into
// a date serial (eval/excel-workbooks-2026-11-19.md).
function sheetXml(rows, { widths = [], freeze = false, bold = false, text = false } = {}) {
  const colStyle = text ? ` style="2"` : "";
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${colStyle}/>`).join("")}${text ? `<col min="${widths.length + 1}" max="${widths.length + 6}" width="12"${colStyle}/>` : ""}</cols>` : "";
  const pane = freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === "" || v === undefined || v === null ? "" : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${bold && ri === 0 ? ` s="1"` : text ? ` s="2"` : ""}><is><t xml:space="preserve">${escText(xmlSafe(v))}</t></is></c>`)).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${body}</sheetData></worksheet>`;
}

export const README_ROWS = [
  ["How this sheet becomes an IDS"],
  ["One row per facet. Rows with section \"specification\" start a specification (name, ifcVersion, description, instructions, identifier; cardinality required, optional or prohibited). The applicability and requirements rows under it share its number in \"spec\"."],
  ["facet is entity, partOf, classification, attribute, property or material. An info row (section \"info\") puts its \"value\" in the IDS <info> field named in \"facet\" (title, author, date, ...)."],
  ["A value cell holds the exact value (IFCWALL, Pset_WallCommon, EI60) or a restriction written as clauses joined by \";\":"],
  ["  one of: EI30 | EI60 | EI90"],
  ["  pattern: [A-Z]{2}[0-9]{3}"],
  ["  >= 0; < 10            (also > and <=)"],
  ["  length: 4; min length: 1; max length: 12"],
  ["  base: integer          (when the restriction is not on string, double, or a date/time/duration its bounds already show)"],
  ["A leading backslash keeps a cell literal: \\one of: x is the plain value \"one of: x\". In a clause, ;; is a literal ; and in a one-of list || is a literal |."],
  ["An empty cell means no element. cardinality on a requirement row is required (or empty), optional or prohibited."],
  ["Columns with a fixed set of words (section, facet, cardinality, relation) offer them as a dropdown; entity, propertySet, dataType and ifcVersion suggest the IFC schema's words but take anything, so a restriction (one of: ..., pattern: ...) still fits. The words are on the hidden Lists sheet."],
  ["The IDS sheet's cells are formatted as Text, so 42.0, true and 2024-01-01 stay as typed. Keep that format when you paste: use Paste Special > Values."],
  ["Made by IDS Model Check (FSL-1.1-MIT): https://marisstella.app/ids-model-check/ . Not legal or professional advice; check the IDS you hand over."],
];

// Any worksheets as an .xlsx, cells as Text: [{ name, rows, widths }].
export function sheetsToXlsx(sheets) {
  const n = sheets.length;
  const ids = sheets.map((_, i) => i + 1);
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ids.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${escAttr(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ids.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("")}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: STYLES_XML },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh.rows, { widths: sh.widths || [], text: true }) })),
  ];
  return zipStore(files);
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;

// ----------------------------------------------------- dropdown lists ----
//
// The downloaded workbook offers each fixed-word column as an in-cell
// dropdown (Excel and LibreOffice "data validation"), from a hidden "Lists"
// sheet. Columns whose words come from the IFC schema (entity, propertySet,
// dataType, ifcVersion) only suggest: a cell there may hold a restriction
// (one of: ..., pattern: ...) or several versions, so typing past the list
// raises no alert. section is held to its list; facet, cardinality and
// relation warn but let a person keep what they typed (an info row's field,
// a min..max cardinality).

export const INFO_FIELDS = ["title", "copyright", "version", "description", "author", "date", "purpose", "milestone"];
export const RELATION_WORDS = ["IFCRELAGGREGATES", "IFCRELASSIGNSTOGROUP", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCRELNESTS", "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"];
const BASE_LISTS = {
  section: ["info", "specification", "applicability", "requirements"],
  facet: [...FACETS, ...INFO_FIELDS],
  cardinality: ["required", "optional", "prohibited"],
  relation: RELATION_WORDS,
  ifcVersion: ["IFC2X3", "IFC4", "IFC4X3_ADD2"],
};
// How each column is held: "stop" refuses another value, "warning" asks,
// "suggest" only offers the list. Titles <= 32 and texts <= 255 characters
// (Excel's limits).
const VALIDATION = {
  section: { style: "stop", title: "section", prompt: "info, specification, applicability or requirements.", error: "section is info, specification, applicability or requirements." },
  facet: { style: "warning", title: "facet", prompt: "entity, partOf, classification, attribute, property or material; on an info row the info field (title, author, ...).", error: "Not a facet or an IDS info field. ids.xsd allows title, copyright, version, description, author, date, purpose and milestone." },
  cardinality: { style: "warning", title: "cardinality", prompt: "required, optional or prohibited (empty means required). On a specification row min..max also works.", error: "cardinality is required, optional or prohibited, or min..max on a specification row." },
  relation: { style: "warning", title: "relation (partOf)", prompt: "How the element is part of the class in entity. Empty means any of these relations.", error: "Not an IDS 1.0 partOf relation; tools that validate against ids.xsd refuse the file." },
  ifcVersion: { style: "suggest", title: "ifcVersion", prompt: "IFC2X3, IFC4 or IFC4X3_ADD2; several are separated by a space." },
  entity: { style: "suggest", title: "entity", prompt: "An IFC class in upper case (IFCWALL), or a restriction: one of: IFCWALL | IFCSLAB, pattern: ..." },
  propertySet: { style: "suggest", title: "propertySet", prompt: "A standard set from the list or the project's own set name, or a restriction (pattern: Pset_.*)." },
  dataType: { style: "suggest", title: "dataType", prompt: "The IFC type the value is checked as, upper case (IFCLABEL, IFCLENGTHMEASURE, IFCBOOLEAN)." },
};

// Schema-word lists for the IFC versions given, from schema/<v>.json and
// schema/psets-<v>.json objects: classes that can be instances (upper case,
// as IDS writes them), standard property and quantity set names, and the
// data types a property facet can name (selects left out). Each sorted, no
// repeats; the IFC versions in the order given.
export function sheetLists({ schemas = [], psets = [] } = {}) {
  const entity = new Set(), propertySet = new Set(), dataType = new Set();
  for (const S of schemas) {
    for (const [k, e] of Object.entries(S.entities || {})) if (!e.abstract) entity.add(k);
    for (const [k, t] of Object.entries(S.types || {})) if (t.kind !== "select") dataType.add(k);
  }
  for (const P of psets) for (const k of Object.keys(P || {})) propertySet.add(k);
  const sorted = (x) => [...x].sort();
  return { entity: sorted(entity), propertySet: sorted(propertySet), dataType: sorted(dataType) };
}

// The IFC versions a sheet's specification rows name, as schema file ids
// (IFC2X3, IFC4, IFC4X3); all three when none is named.
export function sheetVersions(rows) {
  const i = (rows[0] || []).indexOf("ifcVersion");
  const out = new Set();
  if (i >= 0) for (const r of rows.slice(1)) for (const v of String(r[i] ?? "").toUpperCase().split(/\s+/)) {
    if (v === "IFC2X3") out.add("IFC2X3");
    else if (v === "IFC4") out.add("IFC4");
    else if (v.startsWith("IFC4X3")) out.add("IFC4X3");
  }
  return out.size ? [...out] : ["IFC2X3", "IFC4", "IFC4X3"];
}

const listName = (col) => "ids_" + col;

// The data validations for the IDS sheet, one per listed column the header
// names, over the whole column below the header.
function validationsXml(header, lists) {
  const out = [];
  for (const [col, v] of Object.entries(VALIDATION)) {
    const ci = header.indexOf(col);
    if (ci < 0 || !lists[col] || !lists[col].length) continue;
    const L = colName(ci);
    const err = v.style === "suggest" ? ` showErrorMessage="0"` : ` showErrorMessage="1"${v.style === "warning" ? ` errorStyle="warning"` : ""} errorTitle="${escAttr(v.title)}" error="${escAttr(v.error)}"`;
    out.push(`<dataValidation type="list" allowBlank="1" showInputMessage="1"${err} promptTitle="${escAttr(v.title)}" prompt="${escAttr(v.prompt)}" sqref="${L}2:${L}1048576"><formula1>${listName(col)}</formula1></dataValidation>`);
  }
  return out.length ? `<dataValidations count="${out.length}">${out.join("")}</dataValidations>` : "";
}

// rows -> .xlsx: the IDS sheet (cells as Text, header frozen, dropdowns), a
// "Read me" sheet, and a hidden "Lists" sheet the dropdowns read. opts.lists
// adds schema words ({ entity, propertySet, dataType }, from sheetLists);
// without it the fixed IDS words still get their dropdowns.
export function rowsToXlsx(rows, opts = {}) {
  const widths = rows[0].map((h, i) => Math.min(60, Math.max(8, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2))));
  const lists = { ...BASE_LISTS, ...(opts.lists || {}) };
  const listCols = Object.keys(VALIDATION).filter((c) => lists[c] && lists[c].length && rows[0].includes(c));
  const longest = Math.max(1, ...listCols.map((c) => lists[c].length));
  const listRows = [listCols, ...Array.from({ length: longest }, (_, i) => listCols.map((c) => lists[c][i] ?? ""))];
  const names = listCols.map((c, i) => `<definedName name="${listName(c)}">Lists!$${colName(i)}$2:$${colName(i)}$${lists[c].length + 1}</definedName>`).join("");
  const sheet1 = sheetXml(rows, { widths, freeze: true, bold: true, text: true }).replace("</sheetData>", "</sheetData>" + validationsXml(rows[0], lists));
  const ws = (i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  const rel = (i, target) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${target ? "worksheet" : "styles"}" Target="${target || "styles.xml"}"/>`;
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ws(1)}${ws(2)}${listCols.length ? ws(3) : ""}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="IDS" sheetId="1" r:id="rId1"/><sheet name="Read me" sheetId="2" r:id="rId2"/>${listCols.length ? `<sheet name="Lists" sheetId="3" state="hidden" r:id="rId4"/>` : ""}</sheets>${names ? `<definedNames>${names}</definedNames>` : ""}</workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel(1, "worksheets/sheet1.xml")}${rel(2, "worksheets/sheet2.xml")}${rel(3)}${listCols.length ? rel(4, "worksheets/sheet3.xml") : ""}</Relationships>` },
    { name: "xl/styles.xml", data: STYLES_XML },
    { name: "xl/worksheets/sheet1.xml", data: sheet1 },
    { name: "xl/worksheets/sheet2.xml", data: sheetXml(README_ROWS, { widths: [120], bold: true }) },
    ...(listCols.length ? [{ name: "xl/worksheets/sheet3.xml", data: sheetXml(listRows, { widths: listCols.map((c) => Math.min(48, Math.max(12, ...lists[c].map((x) => x.length + 2)))), bold: true, text: true }) }] : []),
  ];
  return zipStore(files);
}

// "B12" -> 1 (zero-based column).
function colIndex(ref) {
  const m = /^\$?([A-Za-z]+)/.exec(ref || "");
  if (!m) return null;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// OOXML strings write a character XML cannot hold (a CR, a control
// character) as _xHHHH_, and a literal "_x" that would read as one as
// _x005F_x... (ECMA-376 Part 1, 22.9.2.19 ST_Xstring). Excel writes the hex
// upper-case; the lower-case form is read too (one generator in Apache POI's
// test files writes it).
export function unescapeXstring(s) {
  return s.indexOf("_x") < 0 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// All the text of an <si> or <is>: its <t>, or its rich-text runs' <t>s (not phonetic <rPh>).
function runText(node) {
  const t = kid(node, "t");
  if (t) return unescapeXstring(t.text);
  return unescapeXstring(kids(node, "r").map((r) => (kid(r, "t") ? kid(r, "t").text : "")).join(""));
}

// Built-in number formats that show a date or time (ECMA-376 18.8.30, and
// the East Asian ids Excel maps to dates).
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const BUILTIN_CODES = { 14: "yyyy-mm-dd", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "yyyy-mm-dd h:mm", 45: "mm:ss", 46: "[h]:mm:ss", 47: "mm:ss.0" };

// What a number format shows a number as: "date", "time", "dateTime" or null
// (a plain number). Elapsed-time formats ([h]:mm) are durations, not a time
// of day, and stay numbers.
export function formatKind(code) {
  if (!code) return null;
  // The first section is the one positive numbers use; quoted text,
  // backslash-escaped characters and [colour]/[$-409] brackets are not tokens.
  const sec = splitFormat(code)[0].replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/_./g, "").replace(/\*./g, "");
  if (/\[(h+|m+|s+)\]/i.test(sec)) return null;
  const t = sec.replace(/\[[^\]]*\]/g, "");
  if (/general/i.test(t)) return null;
  const date = /[dy]/i.test(t) || /e/i.test(t.replace(/E[+-]/g, ""));
  const time = /[hs]/i.test(t) || /AM\/PM|A\/P/i.test(t);
  const month = /m/i.test(t);
  if (date && time) return "dateTime";
  if (date || (month && !time)) return "date";
  if (time) return "time";
  return null;
}

function splitFormat(code) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '"') q = !q;
    if (c === "\\" && !q) { cur += c + (code[i + 1] ?? ""); i++; continue; }
    if (c === ";" && !q) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const pad = (n, w = 2) => String(n).padStart(w, "0");

// An Excel serial day number as ISO 8601 text of the given kind (xs:date,
// xs:time, xs:dateTime, the forms an IDS value takes). The 1900 system counts
// 1900-02-29, a day that never was, so serials from 61 on are one day off its
// count; the 1904 system (old Mac workbooks) starts four years later.
export function serialToIso(serial, kind, date1904 = false) {
  let secs = Math.round(serial * 86400);
  let days = Math.floor(secs / 86400);
  secs -= days * 86400;
  const time = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  if (kind === "time") return time;
  let date;
  if (!date1904 && days === 60) date = "1900-02-29";
  else {
    if (date1904) days += 1462;
    else if (days < 60) days += 1;
    const d = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
    date = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return kind === "date" ? date : `${date}T${time}`;
}

// A number cell's text as Excel's General format shows it: 15 significant
// digits. Excel saves a formula's result, and older versions any fraction,
// with 17 (0.93827160493827155, 6.1728395061728392E-2), which is the same
// double but not what anyone typed or sees.
export function excelNumber(text) {
  const t = text.trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return text;
  const n = Number(t);
  if (!Number.isFinite(n)) return text;
  return plainNumber(Number(n.toPrecision(15)));
}

// A number without an exponent where it has fewer than 21 digits either side
// of the point (0.0000001, not 1e-7): xs:decimal, which an IDS bound on a
// decimal uses, has no exponent; xs:double reads both.
function plainNumber(n) {
  const s = String(n);
  const m = /^(-?)(\d)(?:\.(\d+))?e([-+]\d+)$/.exec(s);
  if (!m) return s;
  const exp = Number(m[4]);
  const digits = m[2] + (m[3] || "");
  if (exp < -20 || exp > 20) return s.replace(/e\+?/, "E");
  if (exp < 0) return `${m[1]}0.${"0".repeat(-exp - 1)}${digits}`;
  return m[1] + digits + "0".repeat(Math.max(0, exp - digits.length + 1));
}

// A workbook's number formats: style index -> "date" | "time" | "dateTime" | null.
function styleKinds(stylesText) {
  if (!stylesText) return [];
  let root;
  // A damaged styles part costs the date reading, not the sheet: Excel
  // repairs it on open and shows the numbers.
  try { root = parseXml(stylesText); } catch { return []; }
  const custom = new Map(kids(kid(root, "numFmts"), "numFmt").map((f) => [Number(f.attrs.numFmtId), f.attrs.formatCode || ""]));
  return kids(kid(root, "cellXfs"), "xf").map((xf) => {
    const id = Number(xf.attrs.numFmtId || 0);
    if (custom.has(id)) return formatKind(custom.get(id));
    if (DATE_FORMAT_IDS.has(id)) return formatKind(BUILTIN_CODES[id] || "yyyy-mm-dd");
    return null;
  });
}

// An OLE2 compound file: an Excel 97-2003 .xls, or any Office file saved with
// a password (the encrypted .xlsx sits inside one).
const isOle2 = (b) => b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;

// Any spreadsheet a person drops: .xlsx (a zip), CSV/TSV text, or a clear
// error for the two Excel files that are neither.
export async function sheetToRows(bytes, inflateRaw, opts = {}) {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try { return await xlsxToRows(bytes, inflateRaw, opts); } catch (e) {
      // One shared string repeated in every cell can unpack to more text
      // than a JavaScript string holds (Apache POI's poc-shared-strings.xlsx).
      if (e instanceof RangeError) throw new Error("the workbook unpacks to more text than can be read here; an IDS sheet is a few thousand rows, so check this is the right file");
      throw e;
    }
  }
  if (isOle2(bytes)) throw new Error("this is an Excel 97-2003 .xls, or a workbook saved with a password; in Excel use File > Save As > Excel Workbook (.xlsx), with no password (File > Info > Protect Workbook > Encrypt with Password, cleared), and drop that");
  return csvToRows(new TextDecoder().decode(bytes));
}

const RELS_NO_CELLS = /(chartsheet|dialogsheet|macrosheet)$/i;

export async function xlsxToRows(bytes, inflateRaw, opts = {}) {
  if (isOle2(bytes)) return sheetToRows(bytes, inflateRaw);
  // Some writers store part names with backslashes (xl\workbook.xml) and in
  // other letter cases; Excel opens them, so this does too.
  const entries = zipEntries(bytes).map((e) => ({ ...e, key: e.name.replace(/\\/g, "/").replace(/^\//, "").toLowerCase() }));
  const read = async (name) => {
    const e = entries.find((x) => x.key === name.toLowerCase());
    // XML parsers turn a literal CR LF (or lone CR) in a part into LF before
    // reading it (XML 1.0, 2.11); a CR written as &#13; or _x000D_ stays.
    return e ? new TextDecoder().decode(await readEntry(bytes, e, inflateRaw)).replace(/\r\n?/g, "\n") : null;
  };
  // The workbook part: the package's officeDocument relationship, else xl/workbook.xml.
  let wbPath = "xl/workbook.xml";
  const pkgRels = await read("_rels/.rels");
  let pkgRoot = null;
  // A damaged package index is skipped: Excel finds xl/workbook.xml anyway.
  try { pkgRoot = pkgRels && parseXml(pkgRels); } catch { /* fall back below */ }
  if (pkgRoot) {
    const rel = kids(pkgRoot, "Relationship").find((r) => /\/officeDocument$/.test(r.attrs.Type || ""));
    if (rel && rel.attrs.Target) wbPath = rel.attrs.Target.replace(/\\/g, "/").replace(/^\.?\//, "");
  }
  let wb = await read(wbPath);
  if (!wb && wbPath !== "xl/workbook.xml") { wbPath = "xl/workbook.xml"; wb = await read(wbPath); }
  if (!wb) throw new Error("not an .xlsx workbook (no xl/workbook.xml)");
  const wbDir = wbPath.includes("/") ? wbPath.slice(0, wbPath.lastIndexOf("/") + 1) : "";
  const wbRoot = parseXml(wb);
  const date1904 = /^(1|true)$/i.test(kid(wbRoot, "workbookPr")?.attrs.date1904 || "");
  const sheets = kids(kid(wbRoot, "sheets"), "sheet");
  if (!sheets.length) throw new Error("the workbook has no sheets");
  const relsText = await read(wbDir + "_rels/" + wbPath.slice(wbDir.length) + ".rels");
  const relList = relsText ? kids(parseXml(relsText), "Relationship") : [];
  const resolve = (target) => {
    const t = target.replace(/\\/g, "/");
    if (t.startsWith("/")) return t.slice(1);
    const parts = (wbDir + t).split("/");
    const out = [];
    for (const p of parts) { if (p === "..") out.pop(); else if (p !== "." && p !== "") out.push(p); }
    return out.join("/");
  };
  // Each sheet's part and whether it is a worksheet (not a chart sheet or a
  // macro/dialog sheet, which hold no cells).
  const placed = sheets.map((s, i) => {
    const rid = Object.entries(s.attrs).find(([k]) => local(k) === "id" && k !== "sheetId");
    const rel = rid && relList.find((r) => r.attrs.Id === rid[1]);
    return { s, path: rel ? resolve(rel.attrs.Target) : wbDir + `worksheets/sheet${i + 1}.xml`, cells: !rel || !RELS_NO_CELLS.test(rel.attrs.Type || "") };
  });
  const withCells = placed.filter((p) => p.cells);
  if (!withCells.length) throw new Error("the workbook has no worksheet with cells (only chart sheets)");
  const named = (n) => withCells.find((p) => String(p.s.attrs.name).trim().toLowerCase() === n);
  const pick = (opts.sheet && named(String(opts.sheet).trim().toLowerCase())) || named("ids") || withCells[0];
  const sheetText = await read(pick.path);
  if (!sheetText) throw new Error(`the sheet ${pick.s.attrs.name} (${pick.path}) is missing from the workbook`);
  const sstRel = relList.find((r) => /\/sharedStrings$/.test(r.attrs.Type || ""));
  const sstText = (sstRel && (await read(resolve(sstRel.attrs.Target)))) || (await read(wbDir + "sharedStrings.xml"));
  const sst = sstText ? kids(parseXml(sstText), "si").map(runText) : [];
  const stRel = relList.find((r) => /\/styles$/.test(r.attrs.Type || ""));
  const kinds = styleKinds((stRel && (await read(resolve(stRel.attrs.Target)))) || (await read(wbDir + "styles.xml")));
  const out = [];
  const cellTypes = new Map(); // "row,col" (0-based) -> "b" boolean or "n" number cell, as Excel stored it
  let rowNo = 0;
  for (const r of kids(kid(parseXml(sheetText), "sheetData"), "row")) {
    rowNo = r.attrs.r ? Number(r.attrs.r) : rowNo + 1;
    const cells = [];
    let col = -1;
    for (const c of kids(r, "c")) {
      const ci = colIndex(c.attrs.r);
      col = ci === null ? col + 1 : ci;
      const t = c.attrs.t;
      const v = kid(c, "v");
      let val = "";
      if (t === "inlineStr") val = kid(c, "is") ? runText(kid(c, "is")) : "";
      else if (t === "s") val = v ? sst[Number(v.text)] ?? "" : "";
      // Excel turns a typed true/false into a boolean cell; IDS writes a
      // boolean value true or false, lower case (TRUE matches nothing).
      else if (t === "b") { val = v ? (/^(1|true)$/i.test(v.text.trim()) ? "true" : "false") : ""; if (v) cellTypes.set(`${rowNo - 1},${col}`, "b"); }
      else if (t === "str" || t === "e") val = v ? unescapeXstring(v.text) : "";
      else if (t === "d") val = v ? v.text : ""; // ISO 8601 already (strict OOXML, rare)
      else if (v) {
        const kind = kinds[Number(c.attrs.s || 0)];
        const n = Number(v.text);
        // Day 0 under a date-only format is Excel's "1900-01-00", no date at
        // all (a formula pointing at an empty cell): it stays the number.
        const asDate = kind && Number.isFinite(n) && n >= 0 && !(kind === "date" && n < 1 && !date1904);
        val = asDate ? serialToIso(n, kind, date1904) : excelNumber(v.text);
        if (!asDate) cellTypes.set(`${rowNo - 1},${col}`, "n");
      }
      cells[col] = val;
    }
    for (let k = 0; k < cells.length; k++) if (cells[k] === undefined) cells[k] = "";
    out[rowNo - 1] = cells;
  }
  for (let k = 0; k < out.length; k++) if (!out[k]) out[k] = [];
  // Which sheet this is and what else the workbook holds (not row data).
  Object.defineProperty(out, "sheetNames", { value: withCells.map((p) => String(p.s.attrs.name)) });
  Object.defineProperty(out, "sheetName", { value: String(pick.s.attrs.name) });
  Object.defineProperty(out, "cellTypes", { value: cellTypes });
  return out;
}

// ------------------------------------------------------------- compare ----

// A file's IDS content as a comparable tree: element local names, attributes
// (namespace declarations and xsi:schemaLocation left out, prefixes dropped
// from xs:restriction's base), text of leaf elements; white space between
// elements and comments are not content. Used by the round-trip check.
const INFO_TEXT = new Set(["title", "copyright", "version", "description", "author", "date", "purpose", "milestone"]);
export function canonicalIds(text) {
  const walk = (n) => {
    const attrs = {};
    for (const [k, v] of Object.entries(n.attrs)) {
      if (k === "xmlns" || k.startsWith("xmlns:") || local(k) === "schemaLocation") continue;
      attrs[local(k)] = n.local === "restriction" && k === "base" ? local(v) : v;
    }
    const kidsEl = n.children.filter((c) => c.local);
    // White space alone in a structural element is layout; in <simpleValue>
    // and the <info> fields it is the value.
    const keep = n.local === "simpleValue" || INFO_TEXT.has(n.local) || n.text.trim() !== "";
    return { n: n.local, a: Object.fromEntries(Object.entries(attrs).sort()), t: kidsEl.length || !keep ? "" : n.text, c: kidsEl.map(walk) };
  };
  return JSON.stringify(walk(parseXml(text)));
}
