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
//   rowsToXlsx(rows)              -> Uint8Array (an .xlsx with a "Read me" sheet)
//   await xlsxToRows(bytes, inflateRaw) -> string[][] (first sheet, or the one named IDS)
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
    const part = (el, col) => {
      const c = get(col);
      if (c === "") return "";
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
    (inReq ? spec.req : spec.app).push(xml);
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
    L.push(`      <applicability${s.occurs}>`, ...s.app.map((x) => "        " + x), `      </applicability>`);
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
  return "﻿" + rows.map((r) => r.map(q).join(sep)).join("\r\n") + "\r\n";
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
const xmlSafe = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

function sheetXml(rows, { widths = [], freeze = false, bold = false } = {}) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const pane = freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === "" || v === undefined || v === null ? "" : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${bold && ri === 0 ? ` s="1"` : ""}><is><t xml:space="preserve">${escText(xmlSafe(v))}</t></is></c>`)).join("")}</row>`).join("");
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
  ["Made by IDS Model Check (MIT): https://marisstella.app/ids-model-check/ . Not legal or professional advice; check the IDS you hand over."],
];

export function rowsToXlsx(rows) {
  const widths = rows[0].map((h, i) => Math.min(60, Math.max(8, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2))));
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="IDS" sheetId="1" r:id="rId1"/><sheet name="Read me" sheetId="2" r:id="rId2"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(rows, { widths, freeze: true, bold: true }) },
    { name: "xl/worksheets/sheet2.xml", data: sheetXml(README_ROWS, { widths: [120], bold: true }) },
  ];
  return zipStore(files);
}

// "B12" -> 1 (zero-based column).
function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || "");
  if (!m) return null;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// All the text of an <si> or <is>: its <t>, or its rich-text runs' <t>s (not phonetic <rPh>).
function runText(node) {
  const t = kid(node, "t");
  if (t) return t.text;
  return kids(node, "r").map((r) => (kid(r, "t") ? kid(r, "t").text : "")).join("");
}

export async function xlsxToRows(bytes, inflateRaw) {
  const entries = zipEntries(bytes);
  const read = async (name) => {
    const e = entries.find((x) => x.name === name) || entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return e ? new TextDecoder().decode(await readEntry(bytes, e, inflateRaw)) : null;
  };
  const wb = await read("xl/workbook.xml");
  if (!wb) throw new Error("not an .xlsx workbook (no xl/workbook.xml)");
  const sheets = kids(kid(parseXml(wb), "sheets"), "sheet");
  if (!sheets.length) throw new Error("the workbook has no sheets");
  const pick = sheets.find((s) => String(s.attrs.name).trim().toLowerCase() === "ids") || sheets[0];
  const rid = Object.entries(pick.attrs).find(([k]) => local(k) === "id" && k !== "sheetId");
  const rels = await read("xl/_rels/workbook.xml.rels");
  let target = "worksheets/sheet1.xml";
  if (rels && rid) {
    const rel = kids(parseXml(rels), "Relationship").find((r) => r.attrs.Id === rid[1]);
    if (rel) target = rel.attrs.Target;
  }
  const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  const sheetText = await read(path);
  if (!sheetText) throw new Error(`the sheet ${pick.attrs.name} (${path}) is missing from the workbook`);
  const sstText = await read("xl/sharedStrings.xml");
  const sst = sstText ? kids(parseXml(sstText), "si").map(runText) : [];
  const out = [];
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
      else if (t === "b") val = v ? (v.text === "1" ? "TRUE" : "FALSE") : "";
      else val = v ? v.text : "";
      cells[col] = val;
    }
    for (let k = 0; k < cells.length; k++) if (cells[k] === undefined) cells[k] = "";
    out[rowNo - 1] = cells;
  }
  for (let k = 0; k < out.length; k++) if (!out[k]) out[k] = [];
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
