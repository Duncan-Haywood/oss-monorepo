// Excel2IDS requirement matrices read as IDS.
//
// buildingSMART-community's Excel2IDS (github.com/buildingsmart-community/Excel2IDS,
// GPL-3.0) is a workbook template BIM managers fill in to agree requirements:
// an orange table of asset categories (one column each: name, cardinality,
// IFC entity, property, classification, attribute, material, purpose), a blue
// table of requirements (one row each), and a yellow matrix where an "X", or a
// value for a row's REPLACEME cell, says which category needs which
// requirement. Its tool is a Windows .exe that writes one IDS per purpose
// (discipline). This file reads the same workbook layout and writes the same
// IDS files through this venture's own table (sheet.mjs), in Node or the
// browser. No code is taken from Excel2IDS: the layout is read from the
// template's labels and its written instructions, and the behaviour was
// compared with the tool's output (eval/excel2ids-2026-11-19.md).
//
//   isExcel2Ids(rows)                          -> boolean
//   excel2idsToTables(rows, { byPhase })       -> { files: [{ purpose, milestone, rows }], warnings, phases }
//   excel2idsToIds(rows, { byPhase })          -> { files: [{ purpose, milestone, suffix, text, errors, warnings }], warnings, phases }
//   idsToExcel2Ids(idsText)                    -> { rows (the grid), notes, kept, total }; excel2IdsToXlsx(rows) -> Uint8Array
//   await readRequirementSheet(bytes, inflateRaw, { byPhase }) -> either layout, as IDS text(s)
//
// rows: string[][] as sheet.mjs's xlsxToRows returns them (cells as Excel shows
// them, booleans "true"/"false", dates ISO 8601).
//
// Read as the template's instructions say: a value in "double quotes" is a
// pattern; a value with commas, semicolons or line breaks is a list of allowed
// values; "X" in the matrix means the row's requirement as written; any other
// value replaces the row's REPLACEME cell for that column. Where the tool and
// its instructions differ, the instructions are followed and the difference is
// listed in eval/excel2ids-2026-11-19.md (booleans written "true", not "True";
// a REPLACEME property keeps its value and URI; a phase split on request).

import { COLUMNS, literalCell, rowsToIds, idsToRows, sheetsToXlsx, sheetToRows } from "./sheet.mjs";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
const cell = (rows, r, c) => String(rows[r]?.[c] ?? "");
const SPLIT = /\s*[,;\n]\s*/;
const IFC_VERSIONS = ["IFC2X3", "IFC4", "IFC4X3_ADD2"];

// Labels of the orange (applicability) table, in the specification-name column.
const APPLY_LABELS = [
  ["name", (n) => n === "specificationname"],
  ["description", (n) => n === "description"],
  ["instructions", (n) => n === "instructions"],
  ["identifier", (n) => n === "identifier"],
  ["cardinality", (n) => n === "cardinality"],
  ["entity", (n) => n === "ifcentity"],
  ["predefinedType", (n) => n === "ifcpredefinedtype"],
  ["propertySet", (n) => n === "propertyset"],
  ["property", (n) => n === "propertyname"],
  ["value", (n) => n === "propertyvalue"],
  ["dataType", (n) => n === "propertydatatype"],
  ["system", (n) => n === "classificationsystem"],
  // The template spells it "Classifciation code".
  ["code", (n) => /^classi\w*code$/.test(n)],
  ["attribute", (n) => n === "attributename"],
  ["attributeValue", (n) => n === "attributevalue"],
  ["material", (n) => n === "material"],
  ["purpose", (n) => n.startsWith("purpose")],
  ["include", (n) => n.startsWith("toggle")],
];
// Headings of the blue (requirements) table.
const REQ_LABELS = [
  ["instructions", (n) => n === "instructions"],
  ["cardinality", (n) => n === "cardinality"],
  ["entity", (n) => n === "ifcentity"],
  ["predefinedType", (n) => n === "ifcpredefinedtype"],
  ["propertySet", (n) => n === "propertyset"],
  ["property", (n) => n === "propertyname"],
  ["value", (n) => n === "propertyvalue"],
  ["dataType", (n) => n === "propertydatatype"],
  ["uri", (n) => n.startsWith("propertyidentifier")],
  ["system", (n) => n === "classificationsystem"],
  ["code", (n) => /^classi\w*code$/.test(n)],
  ["classUri", (n) => /^classi\w*identifier/.test(n)],
  ["attribute", (n) => n === "attributename"],
  ["attributeValue", (n) => n === "attributevalue"],
  ["material", (n) => n === "material"],
  ["milestone", (n) => n.startsWith("milestone")],
  ["include", (n) => n.startsWith("toggle")],
];
const META_LABELS = [
  ["title", (n) => n === "title"],
  ["author", (n) => n.startsWith("author")],
  ["date", (n) => n === "date"],
  ["version", (n) => n === "version"],
  ["copyright", (n) => n === "copyright"],
  ["ifcVersion", (n) => n === "ifcversion"],
  ["description", (n) => n === "description"],
];
// The columns a REPLACEME may stand in, in the order Excel2IDS looks.
const REPLACEABLE = ["entity", "propertySet", "property", "value", "system", "code", "attribute", "attributeValue", "material"];

// Where the template's tables are, found by their labels so a workbook with
// rows or columns added still reads. null when this is not that layout.
function locate(rows) {
  let nameAt = null;
  for (let r = 0; r < rows.length && !nameAt; r++) for (let c = 0; c < (rows[r] || []).length; c++) if (norm(rows[r][c]) === "specificationname") { nameAt = { r, c }; break; }
  if (!nameAt) return null;
  const apply = {};
  for (let r = nameAt.r; r < rows.length; r++) {
    const n = norm(cell(rows, r, nameAt.c));
    const hit = APPLY_LABELS.find(([k, t]) => apply[k] === undefined && t(n));
    if (hit) apply[hit[0]] = r;
    if (hit && hit[0] === "include") break;
  }
  if (apply.include === undefined || apply.entity === undefined) return null;
  const headRow = apply.include;
  const req = {};
  for (let c = 0; c < nameAt.c; c++) {
    const n = norm(cell(rows, headRow, c));
    const hit = REQ_LABELS.find(([k, t]) => req[k] === undefined && t(n));
    if (hit) req[hit[0]] = c;
  }
  req.include = nameAt.c;
  if (req.cardinality === undefined || req.entity === undefined || req.property === undefined) return null;
  // Metadata: labels in one column above the requirements table, the value beside each.
  const meta = {};
  for (let r = 0; r < headRow; r++) for (let c = 0; c < nameAt.c; c++) {
    const n = norm(cell(rows, r, c));
    if (n === "metadata") {
      for (let rr = r + 1; rr < headRow; rr++) {
        const hit = META_LABELS.find(([k, t]) => meta[k] === undefined && t(norm(cell(rows, rr, c))));
        if (hit) meta[hit[0]] = { r: rr, c: c + 1 };
      }
    }
  }
  let width = 0;
  for (const row of rows) width = Math.max(width, (row || []).length);
  const specCols = [];
  for (let c = nameAt.c + 1; c < width; c++) {
    let any = false;
    for (let r = nameAt.r; r < rows.length && !any; r++) if (cell(rows, r, c).trim() !== "") any = true;
    if (any) specCols.push(c);
  }
  return { nameAt, apply, req, meta, headRow, specCols };
}

export function isExcel2Ids(rows) {
  return locate(rows) !== null;
}

const on = (v) => { const t = String(v ?? "").trim().toLowerCase(); return !(t === "" || t === "false" || t === "0" || t === "no"); };
const dbl = (s, ch) => s.split(ch).join(ch + ch);

// A template value cell as one of sheet.mjs's value cells.
function valueCell(raw) {
  const v = String(raw ?? "").trim();
  if (v === "") return "";
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return "pattern: " + dbl(v.slice(1, -1), ";");
  if (/[,;\n]/.test(v)) return "one of: " + v.split(SPLIT).map((x) => dbl(dbl(x, ";"), "|")).join(" | ");
  return literalCell(v);
}
const textCell = (raw) => { const s = String(raw ?? ""); return s.startsWith("\\") ? "\\" + s : s; };
const dataTypeCell = (raw) => String(raw ?? "").trim().toUpperCase();
// IDS entity names are upper case; the template's own lists are, a typed one may not be.
// A pattern is left as written: upper-casing \d would change what it matches.
const isQuoted = (v) => v.length >= 2 && v.startsWith('"') && v.endsWith('"');
function entityCell(raw, warn) {
  const v = String(raw ?? "").trim();
  if (isQuoted(v) || v === v.toUpperCase()) return valueCell(v);
  warn(`IFC entity "${v}" written as ${v.toUpperCase()}: IDS class names are upper case, and IfcWall would match nothing`);
  return valueCell(v.toUpperCase());
}

export function excel2idsToTables(rows, opts = {}) {
  const L = locate(rows);
  if (!L) return null;
  const warnings = [];
  const { apply, req, meta, headRow, specCols } = L;
  const at = (r, c) => (r === undefined || c === undefined ? "" : cell(rows, r, c));
  const m = (k) => (meta[k] ? at(meta[k].r, meta[k].c).trim() : "");
  let date = m("date");
  if (/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(date)) date = date.slice(0, 10);
  const versions = m("ifcVersion").toUpperCase().split(/[\s,;]+/).filter(Boolean).map((v) => (v === "IFC4X3" ? "IFC4X3_ADD2" : v));
  let ifcVersion = versions.filter((v) => IFC_VERSIONS.includes(v)).join(" ");
  if (!ifcVersion) {
    if (m("ifcVersion")) warnings.push({ row: meta.ifcVersion.r + 1, message: `IFC version "${m("ifcVersion")}" is not IFC2X3, IFC4 or IFC4X3_ADD2; written as IFC4X3_ADD2, as Excel2IDS does` });
    ifcVersion = "IFC4X3_ADD2";
  }

  // The requirement rows that are switched on.
  const reqRows = [];
  for (let r = headRow + 1; r < rows.length; r++) {
    if (!on(at(r, req.include))) continue;
    const g = (k) => at(r, req[k]);
    const phases = g("milestone").trim() === "" ? [] : g("milestone").trim().split(SPLIT).filter(Boolean);
    reqRows.push({ r, g, phases });
  }
  const allPhases = [...new Set(reqRows.flatMap((x) => x.phases))];

  // A requirement row as table rows (one per facet), for one matrix cell.
  function facetsFor(x, mark, col) {
    const { g, r } = x;
    const out = [];
    let sub = null;
    if (mark.trim().toUpperCase() !== "X") {
      sub = REPLACEABLE.find((k) => g(k).trim() === "REPLACEME");
      if (!sub) { warnings.push({ row: r + 1, message: `column ${colName(col)} holds "${mark.trim()}", but only X, or a value for a REPLACEME cell in this row, is read; left out` }); return out; }
    } else if (REPLACEABLE.some((k) => g(k).trim() === "REPLACEME")) {
      warnings.push({ row: r + 1, message: `column ${colName(col)} is X on a row with a REPLACEME cell; the word REPLACEME is written as the value` });
    }
    const v = (k) => (sub === k ? mark : g(k));
    const card = g("cardinality").trim().toLowerCase();
    const instr = textCell(g("instructions"));
    const base = { section: "requirements", instructions: instr };
    const want = (k) => (sub ? REPLACE_FACET[sub] === k : true);
    if (want("entity") && v("entity").trim() !== "") out.push({ ...base, facet: "entity", entity: entityCell(v("entity"), (m) => warnings.push({ row: r + 1, message: m })), predefinedType: valueCell(g("predefinedType")) });
    if (want("property") && v("property").trim() !== "") out.push({ ...base, facet: "property", cardinality: card, propertySet: valueCell(v("propertySet")), property: valueCell(v("property")), value: valueCell(v("value")), dataType: dataTypeCell(g("dataType")), uri: textCell(g("uri").trim()) });
    if (want("classification") && v("system").trim() !== "") out.push({ ...base, facet: "classification", cardinality: card, system: valueCell(v("system")), value: valueCell(v("code")), uri: textCell(g("classUri").trim()) });
    if (want("attribute") && v("attribute").trim() !== "") out.push({ ...base, facet: "attribute", cardinality: card, attribute: valueCell(v("attribute")), value: valueCell(v("attributeValue")) });
    if (want("material") && v("material").trim() !== "") out.push({ ...base, facet: "material", cardinality: card, value: valueCell(v("material")) });
    if (!out.length) warnings.push({ row: r + 1, message: `the requirement in column ${colName(col)} names no facet (entity, property name, classification system, attribute name or material); left out` });
    return out;
  }

  // purpose -> phase -> Map(spec name -> spec)
  const groups = new Map();
  const groupFor = (purpose, phase) => {
    const key = purpose + "\u0000" + (phase ?? "");
    if (!groups.has(key)) groups.set(key, { purpose, milestone: phase, specs: new Map() });
    return groups.get(key);
  };
  for (const c of specCols) {
    const a = (k) => at(apply[k], c);
    if (!on(a("include"))) continue;
    const name = a("name").trim();
    const card = a("cardinality").trim().toLowerCase();
    const app = [];
    if (a("entity").trim() !== "") app.push({ facet: "entity", entity: entityCell(a("entity"), (msg) => warnings.push({ row: apply.entity + 1, message: `column ${colName(c)}: ${msg}` })), predefinedType: valueCell(a("predefinedType")) });
    if (a("property").trim() !== "") app.push({ facet: "property", propertySet: valueCell(a("propertySet")), property: valueCell(a("property")), value: valueCell(a("value")), dataType: dataTypeCell(a("dataType")) });
    if (a("system").trim() !== "") app.push({ facet: "classification", system: valueCell(a("system")), value: valueCell(a("code")) });
    if (a("attribute").trim() !== "") app.push({ facet: "attribute", attribute: valueCell(a("attribute")), value: valueCell(a("attributeValue")) });
    if (a("material").trim() !== "") app.push({ facet: "material", value: valueCell(a("material")) });
    const marked = reqRows.map((x) => ({ x, mark: at(x.r, c) })).filter(({ mark }) => mark.trim() !== "");
    const phases = opts.byPhase && allPhases.length ? allPhases : [null];
    // No purpose: one file with no <purpose> (Excel2IDS stops on such a column).
    const purposes = a("purpose").trim() === "" ? [""] : a("purpose").trim().split(SPLIT).filter(Boolean);
    for (const phase of phases) {
      const reqs = marked.filter(({ x }) => phase === null || !x.phases.length || x.phases.includes(phase)).flatMap(({ x, mark }) => facetsFor(x, mark, c));
      if (!reqs.length && card !== "prohibited") continue;
      for (const purpose of purposes) {
        const g = groupFor(purpose, phase);
        const key = name;
        if (g.specs.has(key)) { g.specs.get(key).req.push(...reqs); continue; }
        g.specs.set(key, {
          spec: { section: "specification", name: textCell(name), ifcVersion, identifier: textCell(a("identifier").trim()), description: textCell(a("description")), instructions: textCell(a("instructions")), cardinality: card === "prohibited" || card === "optional" ? card : "required" },
          app, req: [...reqs],
        });
      }
    }
  }
  // A row read once per phase warns once.
  const seen = new Set();
  const uniq = warnings.filter((w) => { const k = w.row + w.message; if (seen.has(k)) return false; seen.add(k); return true; });

  const files = [];
  for (const g of groups.values()) {
    const out = [COLUMNS];
    const push = (o) => out.push(COLUMNS.map((k) => o[k] ?? ""));
    for (const [k, v] of [["title", m("title")], ["copyright", m("copyright")], ["version", m("version")], ["description", m("description")], ["author", m("author")], ["date", date], ["purpose", g.purpose], ["milestone", g.milestone ?? ""]]) {
      if (v !== "") push({ section: "info", facet: k, value: textCell(v) });
    }
    let n = 0;
    for (const s of g.specs.values()) {
      const key = String(++n);
      push({ ...s.spec, spec: key });
      for (const f of s.app) push({ ...f, section: "applicability", spec: key });
      for (const f of s.req) push({ ...f, spec: key });
    }
    files.push({ purpose: g.purpose, milestone: g.milestone, rows: out });
  }
  return { files, warnings: uniq, phases: allPhases };
}

// Which facet a REPLACEME in each column builds.
const REPLACE_FACET = { entity: "entity", propertySet: "property", property: "property", value: "property", system: "classification", code: "classification", attribute: "attribute", attributeValue: "attribute", material: "material" };

function colName(c) {
  let s = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const fileSuffix = (s) => String(s).trim().replace(/[^\w.-]+/g, "_");

export function excel2idsToIds(rows, opts = {}) {
  const t = excel2idsToTables(rows, opts);
  if (!t) return null;
  const files = t.files.map((f) => {
    const r = rowsToIds(f.rows);
    return { purpose: f.purpose, milestone: f.milestone, suffix: [f.purpose, f.milestone].filter(Boolean).map(fileSuffix).join("_"), text: r.text, errors: r.errors, warnings: r.warnings };
  });
  return { files, warnings: t.warnings, phases: t.phases };
}

// ------------------------------------------------- the tool's own read ----
//
// Where Excel2IDS's own tool (Excel2IDS.py at 4eb7575, the Windows .exe is
// built from it) would write a different IDS from the same workbook, or stop.
// Read from its source, not run: its behaviour is described here, none of its
// code is used. The tool reads fixed cells (settings.json: sheet
// "Requirements", metadata J2:J8, categories from column R, requirement rows
// from 19, toggles in row 18 and column Q), tests a toggle with Python truth,
// compares REPLACEME and the cardinality words exactly, and carries some
// values from one row to the next (instructions, the predefined type, the last
// property facet, the last REPLACEME facet). Which cells Excel stored as a
// boolean or a number comes from xlsxToRows (rows.cellTypes); rows with no
// such map (CSV, a grid in memory) have none.
//   -> { stops: [{ row?, col?, message }], notes: [{ row?, col?, message }] }
//      (row and col 1-based; a stop means the tool writes no file at all)
const TOOL = {
  apply: ["name", "description", "instructions", "identifier", "cardinality", "entity", "predefinedType", "propertySet", "property", "value", "dataType", "system", "code", "attribute", "attributeValue", "material", "purpose", "include"],
  req: ["instructions", "cardinality", "entity", "predefinedType", "propertySet", "property", "value", "dataType", "uri", "system", "code", "classUri", "attribute", "attributeValue", "material", "milestone"],
  meta: ["title", "author", "date", "version", "copyright", "ifcVersion", "description"],
};

export function excel2idsToolNotes(rows, opts = {}) {
  const L = locate(rows);
  if (!L) return null;
  const stops = [], notes = [];
  const sheetName = opts.sheetName ?? rows.sheetName;
  if (sheetName !== undefined && sheetName !== "Requirements") stops.push({ message: `the sheet is named "${sheetName}"; the tool opens only a sheet named exactly "Requirements" (KeyError)` });
  const { apply, req, meta, headRow, nameAt } = L;
  const moved = [];
  if (nameAt.c !== 16) moved.push(`the category labels are in column ${colName(nameAt.c)}, not Q`);
  TOOL.apply.forEach((k, i) => { if (apply[k] !== undefined && apply[k] !== i && moved.length < 4) moved.push(`"${k}" is on row ${apply[k] + 1}, not ${i + 1}`); });
  TOOL.req.forEach((k, i) => { if (req[k] !== undefined && req[k] !== i && moved.length < 4) moved.push(`requirement column "${k}" is ${colName(req[k])}, not ${colName(i)}`); });
  TOOL.meta.forEach((k, i) => { if (meta[k] && (meta[k].r !== i + 1 || meta[k].c !== 9) && moved.length < 4) moved.push(`metadata "${k}" is in ${colName(meta[k].c)}${meta[k].r + 1}, not J${i + 2}`); });
  if (moved.length) {
    notes.push({ message: `the layout has moved (${moved.join("; ")}); the tool reads the template's fixed cells, so it would read other cells than the ones filled in. Nothing below is listed until the layout matches.` });
    return { stops, notes };
  }
  const at = (r, c) => cell(rows, r, c);
  const types = rows.cellTypes || new Map();
  const typedBool = (r, c) => types.get(`${r},${c}`) === "b";
  const typedNum = (r, c) => types.get(`${r},${c}`) === "n";
  // Python truth of the openpyxl value: None, "", False and 0 are false, any
  // other text is true (a text "FALSE" too). Rows with no type map (CSV)
  // count "false" and "0" as the boolean and number they most likely were.
  const toolOn = (r, c) => {
    const v = at(r, c);
    if (v === "") return false;
    if (!rows.cellTypes) return !(v === "false" || /^-?0+(\.0+)?$/.test(v));
    if (typedBool(r, c)) return v === "true";
    if (typedNum(r, c)) return Number(v) !== 0;
    return true;
  };
  // Workbook-wide differences.
  notes.push({ message: "the tool writes <milestone>LOD400</milestone> into every IDS (a placeholder in its code); this reader writes none, or each phase when the workbook is split by phase" });
  const ver = at(6, 9);
  const toolVer = IFC_VERSIONS.includes(ver) ? ver : "IFC4X3_ADD2";
  const ourVer = ver.trim().toUpperCase().split(/[\s,;]+/).filter(Boolean).map((v) => (v === "IFC4X3" ? "IFC4X3_ADD2" : v)).filter((v) => IFC_VERSIONS.includes(v)).join(" ") || "IFC4X3_ADD2";
  if (toolVer !== ourVer) notes.push({ row: 7, col: 10, message: `IFC version "${ver}": the tool writes ${toolVer} (it takes only exactly IFC2X3, IFC4 or IFC4X3_ADD2); this reader writes ${ourVer}` });
  // Run 2026-11-19 (eval/excel2ids-sidebyside-2026-11-19.md): the tool passes
  // the version cell through str(), so an empty one is written as "None".
  if (at(4, 9).trim() === "") notes.push({ row: 5, col: 10, message: `the version cell is empty: the tool writes <version>None</version> (Python's str of an empty cell); this reader writes no <version>` });
  // openpyxl returns cell text without undoing the _xHHHH_ escapes Excel
  // writes for a carriage return and other control characters (and for a
  // literal "_x0041_", as _x005F_x0041_), so the tool copies them into the IDS.
  const escNote = (r, c, where) => {
    const v = at(r, c);
    const m = /[\u0000-\u0008\u000b-\u001f\ufffe\uffff]|_x[0-9A-Fa-f]{4}_/.exec(v);
    if (m) notes.push({ row: r + 1, col: c + 1, message: `${where} holds ${m[0] === "\r" ? "a carriage return" : m[0].length === 1 ? `the control character U+${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}` : `the text "${m[0]}"`}: Excel stores it as ${m[0].length === 1 ? `_x${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_` : `_x005F${m[0]}`} and the tool (openpyxl) copies that escape into the IDS as typed; this reader writes the text itself` });
  };
  for (let r = 1; r <= 7; r++) escNote(r, 9, `metadata cell J${r + 1}`);

  const boolNote = (r, c, v, where) => notes.push({ row: r + 1, col: c + 1, message: `${where} is a typed ${v.toUpperCase()}: the tool writes "${v === "true" ? "True" : "False"}", which matches no IDS boolean; this reader writes "${v}"` });
  const caseNote = (r, c, v, what) => notes.push({ row: r + 1, col: c + 1, message: `${what} "${v}": the tool writes it as typed; this reader writes ${what === "IFC entity" ? "the upper-case class name IDS needs" : `"${v.toLowerCase()}"`}` });
  const valueCols = ["value", "attributeValue", "code", "material", "predefinedType", "propertySet", "property", "system", "attribute"];

  // Requirement rows the tool reads (its toggle in column Q).
  const reqRows = [];
  for (let r = 18; r < rows.length; r++) {
    const t = at(r, 16);
    const tool = toolOn(r, 16), ours = on(t);
    if (tool && !ours) notes.push({ row: r + 1, col: 17, message: `requirement row toggle "${t}" is text: the tool counts any text as on, so it reads this row; this reader leaves it off` });
    if (tool) reqRows.push(r);
  }
  for (const r of reqRows) {
    for (const k of TOOL.req) if (req[k] !== undefined) escNote(r, req[k], `requirement ${k}`);
    for (const k of valueCols) { const v = at(r, req[k]); if (typedBool(r, req[k])) boolNote(r, req[k], v, `requirement ${k}`); }
    // The tool strips text (process_value) but changes no case.
    const card = at(r, req.cardinality).trim();
    if (card !== card.toLowerCase()) caseNote(r, req.cardinality, card, "cardinality");
    const dt = at(r, req.dataType).trim();
    if (dt !== dt.toUpperCase()) notes.push({ row: r + 1, col: req.dataType + 1, message: `data type "${dt}": the tool writes it as typed; this reader writes ${dt.toUpperCase()}` });
    const ent = at(r, req.entity).trim();
    if (ent !== "" && ent !== "REPLACEME" && !isQuoted(ent) && ent !== ent.toUpperCase()) caseNote(r, req.entity, ent, "IFC entity");
  }

  // Carried between rows and columns, as in the tool's loop.
  const carried = { instructions: undefined, predefined: undefined, property: undefined, facet: undefined };
  const replaceOrder = ["entity", "propertySet", "property", "value", "system", "code", "attribute", "attributeValue", "material"];
  const width = Math.max(...rows.map((x) => (x || []).length));
  for (let c = 17; c < width; c++) {
    const t = at(17, c);
    if (!toolOn(17, c)) continue;
    const C = colName(c);
    if (!on(t)) notes.push({ row: 18, col: c + 1, message: `column ${C} toggle "${t}" is text: the tool counts any text as on, so it writes this category; this reader leaves it off` });
    const a = (k) => at(apply[k], c);
    for (const k of TOOL.apply) if (apply[k] !== undefined && k !== "include") escNote(apply[k], c, `column ${C}'s ${k}`);
    carried.predefined = { row: apply.predefinedType, v: a("predefinedType").trim() };
    if (a("property") !== "") carried.property = { col: c, where: `column ${C}'s applicability` };
    for (const k of ["value", "attributeValue", "code", "material", "predefinedType"]) if (typedBool(apply[k], c)) boolNote(apply[k], c, a(k), `column ${C}'s ${k}`);
    const ent = a("entity").trim();
    if (ent !== "" && !isQuoted(ent) && ent !== ent.toUpperCase()) caseNote(apply.entity, c, ent, "IFC entity");
    const card = a("cardinality");
    if (card.trim().toLowerCase() !== card && ["prohibited", "optional"].includes(card.trim().toLowerCase())) notes.push({ row: apply.cardinality + 1, col: c + 1, message: `column ${C} cardinality "${card}": the tool compares it with "${card.trim().toLowerCase()}" exactly, so it writes the category as required; this reader reads it as ${card.trim().toLowerCase()}` });
    let any = false;
    for (const r of reqRows) {
      const mark = at(r, c);
      if (mark === "") continue;
      const here = `row ${r + 1}, column ${C}`;
      if (typedBool(r, c) || typedNum(r, c)) {
        stops.push({ row: r + 1, col: c + 1, message: `${here} holds ${typedBool(r, c) ? `a typed ${mark.toUpperCase()}` : `the number ${mark}`}: the tool stops (it calls .strip() on the cell, which only text has; AttributeError); type it as text ('${mark})` });
        any = true;
        continue;
      }
      if (mark.trim().toUpperCase() === "X") {
        any = true;
        carried.instructions = { row: r, v: at(r, req.instructions) };
        carried.predefined = { row: r, v: at(r, req.predefinedType).trim() };
        if (at(r, req.property).trim() !== "") carried.property = { col: c, where: `row ${r + 1}` };
        continue;
      }
      // A value for a REPLACEME cell: the tool looks for the exact word.
      const sub = replaceOrder.find((k) => at(r, req[k]) === "REPLACEME");
      const trimmedSub = replaceOrder.find((k) => at(r, req[k]).trim() === "REPLACEME");
      if (!sub) {
        if (trimmedSub) notes.push({ row: r + 1, col: req[trimmedSub] + 1, message: `"${at(r, req[trimmedSub])}" has spaces around REPLACEME; the tool looks for the exact word, so it does not see it` });
        if (carried.facet) notes.push({ row: r + 1, col: c + 1, message: `${here} holds "${mark.trim()}" on a row with no REPLACEME cell the tool sees: it adds the REPLACEME facet from row ${carried.facet + 1} again; this reader leaves the cell out with a warning` });
        else stops.push({ row: r + 1, col: c + 1, message: `${here} holds "${mark.trim()}" on a row with no REPLACEME cell the tool sees, before any REPLACEME row: the tool stops (UnboundLocalError on facet)` });
        any = true;
        continue;
      }
      any = true;
      const kind = REPLACE_FACET[sub];
      if (carried.instructions === undefined) { stops.push({ row: r + 1, col: c + 1, message: `${here} fills a REPLACEME before any X has been read: the tool stops (UnboundLocalError on instructions)` }); continue; }
      const own = at(r, req.instructions);
      if (carried.instructions.v !== own) notes.push({ row: r + 1, col: c + 1, message: `${here}: the tool gives this facet row ${carried.instructions.row + 1}'s instructions (${carried.instructions.v === "" ? "none" : `"${carried.instructions.v.slice(0, 60)}"`}), not this row's (${own === "" ? "none" : `"${own.slice(0, 60)}"`})` });
      if (kind === "entity" && carried.predefined.v !== at(r, req.predefinedType).trim()) notes.push({ row: r + 1, col: c + 1, message: `${here}: the tool gives this entity the predefined type from row ${carried.predefined.row + 1} (${carried.predefined.v || "none"}), not this row's (${at(r, req.predefinedType).trim() || "none"})` });
      if (kind === "property") {
        const lost = (sub === "propertySet" || sub === "property" ? ["value", "uri"] : ["uri"]).filter((k) => at(r, req[k]).trim() !== "");
        if (lost.length) {
          if (!carried.property) { stops.push({ row: r + 1, col: c + 1, message: `${here}: the row's ${lost.join(" and ")} would go to an earlier property facet and there is none: the tool stops (UnboundLocalError on property)` }); continue; }
          const it = lost.length > 1 ? "them" : "it";
          notes.push({ row: r + 1, col: c + 1, message: `${here}: the tool drops this row's ${lost.join(" and ")} from the facet${carried.property.col === c ? ` and writes ${it} onto the property facet from ${carried.property.where} instead` : ""}; this reader keeps ${it} on this row's facet` });
        }
      }
      carried.facet = r;
    }
    const purposeCell = a("purpose");
    if ((any || card === "prohibited") && purposeCell.trim() === "") stops.push({ row: apply.purpose + 1, col: c + 1, message: `column ${C} has no purpose: the tool stops (it splits the empty cell, TypeError); this reader writes the category to an IDS with no <purpose>` });
  }
  return { stops, notes };
}

// ----------------------------------------------------------- writing ----
//
// An IDS as an Excel2IDS workbook, so a requirement set that exists only as an
// IDS (Excel2IDS cannot open one) can be reviewed and extended in the template.
// What the template cannot say is listed in notes and that part is left out:
// partOf facets, two facets of one kind in an applicability, ranges and
// lengths, a value that holds a comma, semicolon or line break (the template
// reads those as lists), specifications in another IFC version than the
// first one, and a second specification with the same name (the template
// merges specifications by name).


// One of sheet.mjs's value cells as a template cell, or { error }.
function templateValue(c) {
  if (c === "") return { v: "" };
  if (c.startsWith("\\")) return plain(c.slice(1));
  const m = /^\s*(one of|pattern):\s*([\s\S]*)$/i.exec(c);
  if (!m) {
    if (/^\s*(base:|length:|min length:|max length:|note:|>=|<=|>|<)/i.test(c)) return { error: `"${c}" (a range, length or typed restriction)` };
    return plain(c);
  }
  // A single clause only: a lone ";" starts another.
  if (/(^|[^;]);(?!;)/.test(m[2].replace(/;;/g, ""))) return { error: `"${c}" (more than one clause)` };
  const body = m[2].replace(/;;/g, ";");
  if (m[1].toLowerCase() === "pattern") {
    if (/[\n]/.test(body)) return { error: `pattern "${body}" holds a line break` };
    return { v: `"${body}"` };
  }
  const items = [];
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "|") { if (body[i + 1] === "|") { cur += "|"; i++; continue; } items.push(cur.trim()); cur = ""; } else cur += body[i];
  }
  items.push(cur.trim());
  // A list of one allows what that value allows; the template writes it plain.
  if (items.length === 1) return plain(items[0]);
  if (items.some((x) => x === "" || /[,;\n]/.test(x) || (x.startsWith('"') && x.endsWith('"')))) return { error: `"${c}" (an item holds a comma, semicolon or line break)` };
  return { v: items.join(", ") };
}
function plain(s) {
  if (s === "") return { error: "an empty value (the template reads an empty cell as no element)" };
  if (s !== s.trim()) return { error: `"${s}" (spaces at the ends, which the template trims)` };
  if (/[,;\n]/.test(s)) return { error: `"${s}" (a comma, semicolon or line break, which the template reads as a list)` };
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return { error: `${s} (in quotes, which the template reads as a pattern)` };
  if (s === "REPLACEME" || s.toUpperCase() === "X") return { error: `"${s}" (a word the template's matrix reserves)` };
  return { v: s };
}

const APPLY_ROWS = ["Specification name", "Description", "Instructions", "Identifier", "Cardinality", "IFC entity", "IFC predefined type", "Property set", "Property name", "Property value", "Property data type", "Classification system", "Classification code", "Attribute name", "Attribute value", "Material", "Purpose (discipline)", "Toggle on/off (TRUE/FALSE)"];
const REQ_HEAD = ["Instructions", "Cardinality", "IFC entity", "IFC predefined type", "Property set", "Property name", "Property value", "Property data type", "Property identifier (URI)", "Classification system", "Classification code", "Classification identifier (URI)", "Attribute name", "Attribute value", "Material", "Milestone (phase)"];
const META_ROWS = [["Title", "title"], ["Author email", "author"], ["Date", "date"], ["Version", "version"], ["Copyright", "copyright"], ["IFC version", null], ["Description", "description"]];
const LABEL_COL = 16; // Q, as in the template
const META_COL = 8; // I

// IDS class names are upper case; Excel2IDS's tool writes a cell as typed, so
// the workbook carries them upper case (a quoted pattern is left as it is).
const upperEntity = (v) => (isQuoted(v) ? v : v.toUpperCase());

export function idsToExcel2Ids(text) {
  const { rows, notes: lost } = idsToRows(text, { notes: true });
  const head = rows[0];
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const notes = [];
  const info = {};
  const specs = [];
  let cur = null;
  for (const r of rows.slice(1)) {
    const g = (k) => r[ix[k]] ?? "";
    const sec = g("section");
    if (sec === "info") { info[g("facet")] = g("value").startsWith("\\") ? g("value").slice(1) : g("value"); continue; }
    if (sec === "specification") {
      // What the table form itself could not hold (sheet.mjs's notes, "spec N ...").
      const own = lost.filter((n) => n.startsWith(`spec ${g("spec")} `) || n.startsWith(`spec ${g("spec")}:`)).map((n) => n.replace(/^spec \d+:? ?/, ""));
      cur = { key: g("spec"), g: Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])), app: [], req: [], problems: own };
      specs.push(cur);
      continue;
    }
    if (!cur) continue;
    if (sec === "requirements" && g("facet") === "") { if (g("description") !== "") cur.problems.push("a description on <requirements>"); continue; }
    (sec === "applicability" ? cur.app : cur.req).push(Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  }
  const untext = (s) => (s.startsWith("\\") ? s.slice(1) : s);
  const versions = specs.map((s) => s.g.ifcVersion.trim().toUpperCase().split(/\s+/).sort().join(" ")).filter(Boolean);
  const ifcVersion = versions[0] || "IFC4X3_ADD2";
  const columns = [];
  const reqRows = [];
  const reqKey = new Map();
  const names = new Set();
  for (const s of specs) {
    const P = s.problems;
    const val = (cell, what) => { const t = templateValue(cell); if (t.error) { P.push(`${what}: ${t.error}`); return ""; } return t.v; };
    const ver = s.g.ifcVersion.trim().toUpperCase().split(/\s+/).sort().join(" ");
    if (ver !== ifcVersion) P.push(`IFC version ${s.g.ifcVersion} (the template has one, ${ifcVersion})`);
    const odd = ver.split(" ").filter((v) => v && !IFC_VERSIONS.includes(v));
    if (odd.length) P.push(`IFC version ${odd.join(" ")} (the template reads IFC2X3, IFC4 and IFC4X3_ADD2)`);
    const name = untext(s.g.name);
    if (name.trim() === "") P.push("no name");
    if (names.has(name)) P.push(`a second specification named "${name}" (the template merges them)`);
    if (name !== name.trim()) P.push("spaces at the ends of the name");
    // Applicability occurs as the checker reads them (ids.mjs): maxOccurs 0 is
    // prohibited, minOccurs 0 optional, anything else required.
    const occ = /^(\d*)\.\.(\d*|unbounded)$/.exec(s.g.cardinality);
    let card = s.g.cardinality;
    if (occ && occ[2] === "0") card = "prohibited";
    else if (occ && occ[1] === "0" && (occ[2] === "" || occ[2] === "unbounded")) card = "optional";
    else if (occ && occ[1] !== "0" && (occ[2] === "" || occ[2] === "unbounded")) card = "required";
    if (!["", "required", "optional", "prohibited"].includes(card)) P.push(`applicability cardinality ${card}`);
    const col = { name, description: untext(s.g.description), instructions: untext(s.g.instructions), identifier: untext(s.g.identifier), cardinality: card || "required", cells: {} };
    if (col.identifier !== col.identifier.trim()) P.push("spaces at the ends of the identifier");
    const kinds = new Set();
    if (!s.app.length) P.push("no applicability facets");
    for (const f of s.app) {
      if (f.facet === "partOf") { P.push("a partOf facet"); continue; }
      if (kinds.has(f.facet)) { P.push(`two ${f.facet} facets in the applicability`); continue; }
      kinds.add(f.facet);
      for (const a of ["uri", "instructions", "cardinality", "relation"]) if (f[a] !== "") P.push(`${a} on an applicability ${f.facet}`);
      const c = col.cells;
      if (f.facet === "entity" && f.entity === "") P.push("an entity with no name");
      if (f.facet === "entity") { c.entity = upperEntity(val(f.entity, "IFC entity")); c.predefinedType = val(f.predefinedType, "predefined type"); }
      if (f.facet === "property") { c.propertySet = val(f.propertySet, "property set"); c.property = val(f.property, "property name"); c.value = val(f.value, "property value"); c.dataType = f.dataType; }
      if (f.facet === "classification") { if (f.system === "") P.push("a classification with no system (the template needs one)"); c.system = val(f.system, "classification system"); c.code = val(f.value, "classification code"); }
      if (f.facet === "attribute") { c.attribute = val(f.attribute, "attribute name"); c.attributeValue = val(f.value, "attribute value"); }
      if (f.facet === "material") { if (f.value === "") P.push("a material with no value (the template needs one)"); c.material = val(f.value, "material"); }
    }
    const marks = [];
    for (const f of s.req) {
      const row = new Array(REQ_HEAD.length).fill("");
      const set = (i, cell, what) => { row[i] = val(cell, what); };
      if (f.facet === "partOf") { P.push("a partOf requirement"); continue; }
      row[0] = untext(f.instructions);
      row[1] = f.facet === "entity" ? "" : f.cardinality || "required";
      if (f.facet === "entity" && f.entity === "") P.push("an entity requirement with no name");
      if (f.facet === "entity") { set(2, f.entity, "IFC entity"); row[2] = upperEntity(row[2]); set(3, f.predefinedType, "predefined type"); }
      if (f.facet === "property") { set(4, f.propertySet, "property set"); set(5, f.property, "property name"); set(6, f.value, "property value"); row[7] = f.dataType; row[8] = untext(f.uri); }
      if (f.facet === "classification") { if (f.system === "") P.push("a classification requirement with no system (the template needs one)"); set(9, f.system, "classification system"); set(10, f.value, "classification code"); row[11] = untext(f.uri); }
      if (f.facet === "attribute") { set(12, f.attribute, "attribute name"); set(13, f.value, "attribute value"); }
      if (f.facet === "material") { if (f.value === "") P.push("a material requirement with no value (the template needs one)"); set(14, f.value, "material"); if (f.uri !== "") P.push("a URI on a material requirement"); }
      if (f.facet === "entity" && f.cardinality !== "") P.push("cardinality on an entity requirement");
      if (row[0] !== row[0].trim() && row[0] !== "") P.push("spaces at the ends of instructions");
      marks.push(row);
    }
    if (!s.req.length && card !== "prohibited") P.push("no requirements (the template writes a specification only when it has some, or is prohibited)");
    if (P.length) { notes.push(`specification "${name}" left out: ${[...new Set(P)].join("; ")}`); continue; }
    names.add(name);
    col.marks = [];
    for (const row of marks) {
      const k = JSON.stringify(row);
      if (!reqKey.has(k)) { reqKey.set(k, reqRows.length); reqRows.push(row); }
      // The same facet twice in one specification asks for the same thing: one X.
      if (!col.marks.includes(reqKey.get(k))) col.marks.push(reqKey.get(k));
    }
    col.index = specs.indexOf(s);
    columns.push(col);
  }
  let milestone = (info.milestone ?? "").trim();
  if (/[,;\n]/.test(milestone)) { notes.push(`info milestone "${milestone}" is not kept: the template reads a comma, semicolon or line break in it as several phases`); milestone = ""; }
  if (milestone) for (const row of reqRows) row[15] = milestone;
  for (const k of Object.keys(info)) if (!["title", "author", "date", "version", "copyright", "description", "purpose", "milestone"].includes(k)) notes.push(`info ${k} is not kept`);
  for (const k of ["title", "author", "date", "version", "copyright", "description"]) if (info[k] !== undefined && info[k] !== info[k].trim()) { notes.push(`info ${k} has spaces at the ends, which the template trims`); }
  if (info.title === undefined) notes.push("no title in <info>");
  for (const n of lost) if (!/^spec \d/.test(n)) notes.push(n);

  // The grid, laid out as the template is.
  const H = APPLY_ROWS.length; // the requirement header is the last label row
  const grid = [];
  const put = (r, c, v) => { while (grid.length <= r) grid.push([]); grid[r][c] = v; };
  put(0, 0, "EXCEL2IDS layout, written by IDS Model Check");
  put(0, META_COL, "METADATA");
  put(0, LABEL_COL - 1, "SPECIFICATION");
  META_ROWS.forEach(([label, k], i) => { put(i + 1, META_COL, label); put(i + 1, META_COL + 1, k ? (info[k] ?? "").trim() : ifcVersion); });
  APPLY_ROWS.forEach((label, i) => put(i, LABEL_COL, label));
  put(H - 1 - 1, 7, "REQUIREMENTS");
  REQ_HEAD.forEach((label, i) => put(H - 1, i, label));
  let purpose = (info.purpose ?? "").trim();
  if (/[,;\n]/.test(purpose)) { notes.push(`info purpose "${purpose}" is not kept: the template reads a comma, semicolon or line break in it as several purposes, one IDS each`); purpose = ""; }
  // Excel2IDS's tool stops on a category with no purpose; "General" is its
  // own default name for one (add_to_ids), and reads back as <purpose>General</purpose>.
  // What Excel2IDS's own tool would do with the download (not a loss here).
  const tool = [];
  let purposeFilled = false;
  if (!purpose && columns.length) { purpose = "General"; purposeFilled = true; tool.push("the IDS has no purpose: the template's purpose row is filled with General (Excel2IDS's own default), because its tool stops on an empty one; read back, the IDS says <purpose>General</purpose>"); }
  if (columns.length && ifcVersion.includes(" ")) tool.push(`the IFC version cell names ${ifcVersion}: IDS Model Check reads them all, but Excel2IDS's tool takes one exact version and would write IFC4X3_ADD2`);
  const A = ["name", "description", "instructions", "identifier", "cardinality", "entity", "predefinedType", "propertySet", "property", "value", "dataType", "system", "code", "attribute", "attributeValue", "material"];
  columns.forEach((col, j) => {
    const c = LABEL_COL + 1 + j;
    A.forEach((k, i) => { const v = i < 5 ? col[k] : col.cells[k] ?? ""; if (v !== "") put(i, c, v); });
    if (purpose) put(16, c, purpose);
    put(H - 1, c, "TRUE");
    for (const m of col.marks) put(H + m, c, "X");
  });
  reqRows.forEach((row, i) => { row.forEach((v, k) => { if (v !== "") put(H + i, k, v); }); put(H + i, LABEL_COL, "TRUE"); });
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) if (grid[r][c] === undefined) grid[r][c] = "";
  return { rows: grid, notes, kept: columns.length, keptIndex: columns.map((c) => c.index), total: specs.length, requirementRows: reqRows.length, byPhase: Boolean(milestone), purposeFilled, tool };
}

export const EXCEL2IDS_README = [
  ["About this workbook"],
  ["The Requirements sheet follows the layout of buildingSMART-community's Excel2IDS template (github.com/buildingsmart-community/Excel2IDS): asset categories in columns from R, one requirement per row from 19, an X where a category needs a requirement."],
  ["A value in \"double quotes\" is a pattern; commas, semicolons or line breaks make a list of allowed values. Toggle a row or column off with FALSE."],
  ["Drop it back on IDS Model Check (https://marisstella.app/ids-model-check/) to get one IDS per purpose, audited, or run node cli.mjs --from-sheet. Excel2IDS's own tool reads it too, with these differences (checked by running it, 2026-11-19): it writes <milestone>LOD400</milestone> into every IDS, <version>None</version> when the version cell is empty, and the escape _x000D_ where a cell holds a carriage return; and it keeps only one exact IFC version (several become IFC4X3_ADD2). Every category has a purpose, because the tool stops on an empty one."],
  ["Made by IDS Model Check (all rights reserved). Not legal or professional advice; check the IDS you hand over."],
];

export function excel2IdsToXlsx(grid) {
  const widths = Array.from({ length: Math.max(...grid.map((r) => r.length)) }, (_, i) => (i === LABEL_COL ? 26 : i < LABEL_COL ? 16 : 18));
  return sheetsToXlsx([{ name: "Requirements", rows: grid, widths }, { name: "Read me", rows: EXCEL2IDS_README, widths: [120] }]);
}

// Any dropped spreadsheet as IDS text(s): an Excel2IDS workbook gives one IDS
// per purpose (and phase, with byPhase); this venture's own table gives one.
//   -> { format: "excel2ids" | "table", files: [{ suffix, text, errors, warnings }], warnings, phases }
export async function readRequirementSheet(bytes, inflateRaw, opts = {}) {
  let rows = await sheetToRows(bytes, inflateRaw);
  if (!isExcel2Ids(rows) && rows.sheetNames && rows.sheetNames.some((n) => n.trim().toLowerCase() === "requirements") && rows.sheetName.trim().toLowerCase() !== "requirements") {
    const other = await sheetToRows(bytes, inflateRaw, { sheet: "requirements" });
    if (isExcel2Ids(other)) rows = other;
  }
  if (isExcel2Ids(rows)) return { format: "excel2ids", ...excel2idsToIds(rows, opts), tool: excel2idsToolNotes(rows) };
  const r = rowsToIds(rows);
  return { format: "table", files: [{ suffix: "", text: r.text, errors: r.errors, warnings: r.warnings }], warnings: [], phases: [] };
}
