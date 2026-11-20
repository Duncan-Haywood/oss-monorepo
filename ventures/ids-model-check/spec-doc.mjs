// An IDS as a document people read: every specification in plain English.
//
// An IDS is XML. The people who have to deliver what it asks for (a
// consultant's modeller, a contractor's BIM coordinator, a client signing off
// the information requirements) usually read it as a PDF appendix to the
// contract, which someone retypes by hand from the XML and which then drifts
// from it. This file writes that appendix from the IDS itself: a summary
// table, then each specification with what it applies to, how many such
// elements the model must have, and one sentence per requirement, with every
// name and value copied verbatim. Runs in Node and the browser; imports only
// this venture's IDS reader.
//
//   docFromIds(idsText, { classNames })  -> { title, info, specs: [{ name, ..., applicability: [Sentence], requirements: [Sentence] }] }
//   docToMarkdown(doc)                   -> Markdown text
//   docToHtml(doc)                       -> a standalone, printable HTML page
//   sentenceText(sentence)               -> the sentence as plain text
//   classNamesFrom(schemas)              -> { IFCWALL: "IfcWall", ... } from schema/ifc*.json
//
// A Sentence is an array of parts: a string is prose, { v } a name or value
// from the IDS (shown as code, never reworded), { b } emphasis. Every value is
// kept as written, so the document says exactly what the checker checks
// (eval/spec-doc-2026-11-20.md compares each sentence with IfcTester's own
// reading of the same facet on the 113 of 144 IDS files IfcTester opens).

import { parseIds } from "./ids.mjs";

// SI units IDS 1.0 requires numeric values in (whatever unit a model uses), for
// the measures requirements name most. A measure not listed gets no unit note.
const SI = {
  IFCLENGTHMEASURE: "metres", IFCPOSITIVELENGTHMEASURE: "metres", IFCNONNEGATIVELENGTHMEASURE: "metres",
  IFCAREAMEASURE: "square metres", IFCVOLUMEMEASURE: "cubic metres", IFCMASSMEASURE: "kilograms",
  IFCPLANEANGLEMEASURE: "radians", IFCPOSITIVEPLANEANGLEMEASURE: "radians", IFCTIMEMEASURE: "seconds",
  IFCTHERMODYNAMICTEMPERATUREMEASURE: "kelvin", IFCTHERMALTRANSMITTANCEMEASURE: "W/(m²·K)",
  IFCPOWERMEASURE: "watts", IFCPRESSUREMEASURE: "pascals", IFCMASSDENSITYMEASURE: "kg/m³",
  IFCVOLUMETRICFLOWRATEMEASURE: "m³/s", IFCELECTRICCURRENTMEASURE: "amperes", IFCELECTRICVOLTAGEMEASURE: "volts",
  IFCFREQUENCYMEASURE: "hertz", IFCLINEARVELOCITYMEASURE: "m/s", IFCHEATFLUXDENSITYMEASURE: "W/m²",
  IFCTHERMALRESISTANCEMEASURE: "m²·K/W", IFCILLUMINANCEMEASURE: "lux", IFCLUMINOUSFLUXMEASURE: "lumens",
  IFCFORCEMEASURE: "newtons", IFCENERGYMEASURE: "joules", IFCSOUNDPRESSURELEVELMEASURE: "decibels",
  IFCSOUNDPOWERLEVELMEASURE: "decibels",
};

// After "is": "It must be contained in an IfcBuildingStorey".
const RELATIONS = {
  IFCRELAGGREGATES: "part of (IfcRelAggregates)",
  IFCRELCONTAINEDINSPATIALSTRUCTURE: "contained in (IfcRelContainedInSpatialStructure)",
  IFCRELASSIGNSTOGROUP: "assigned to (IfcRelAssignsToGroup)",
  IFCRELNESTS: "nested in (IfcRelNests)",
  IFCRELVOIDSELEMENT: "an opening in (IfcRelVoidsElement)",
  IFCRELFILLSELEMENT: "filling an opening in (IfcRelFillsElement)",
  "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT": "filling an opening in (IfcRelVoidsElement and IfcRelFillsElement)",
};

// Own keys only: a dataType or relation written "constructor" must not find Object.prototype.
const own = (o, k) => (typeof k === "string" && Object.hasOwn(o, k) ? o[k] : undefined);

export function classNamesFrom(schemas) {
  const out = {};
  for (const s of schemas || []) for (const [k, e] of Object.entries(s.entities || {})) if (e && e.name) out[k] = e.name;
  return out;
}

const lst = (xs, word = "or") => {
  const out = [];
  xs.forEach((x, i) => {
    if (i) out.push(i === xs.length - 1 ? (xs.length > 2 ? `, ${word} ` : ` ${word} `) : ", ");
    out.push(x);
  });
  return out;
};

// A restriction or simple value as words; `name` turns class names into
// their schema casing (IFCWALL as IfcWall) and leaves every other value alone.
function valueParts(val, name = (x) => x) {
  if (val.simple !== undefined) return [{ v: name(val.simple) }];
  const r = val.r;
  if (!r) return ["any value"];
  const bits = [];
  if (r.enumeration.length) bits.push(r.enumeration.length === 1 ? [{ v: name(r.enumeration[0]) }] : ["one of ", ...lst(r.enumeration.map((x) => ({ v: name(x) })))]);
  if (r.pattern.length) bits.push([r.pattern.length > 1 ? "matching one of the patterns " : "matching the pattern ", ...lst(r.pattern.map((x) => ({ v: x })))]);
  const dateLike = (x) => /^-?\d{4}-\d\d-\d\d|^-?P\d|^-?PT|^\d\d:\d\d/.test(String(x));
  const b = (x, num, date) => [dateLike(x) ? date : num, { v: x }];
  if (r.minInclusive !== undefined) bits.push(b(r.minInclusive, "at least ", "on or after "));
  if (r.minExclusive !== undefined) bits.push(b(r.minExclusive, "more than ", "after "));
  if (r.maxInclusive !== undefined) bits.push(b(r.maxInclusive, "at most ", "on or before "));
  if (r.maxExclusive !== undefined) bits.push(b(r.maxExclusive, "less than ", "before "));
  if (r.length !== undefined) bits.push(["exactly ", { v: r.length }, " characters long"]);
  if (r.minLength !== undefined) bits.push(["at least ", { v: r.minLength }, " characters long"]);
  if (r.maxLength !== undefined) bits.push(["at most ", { v: r.maxLength }, " characters long"]);
  if (!bits.length) return ["any value"];
  const out = [];
  bits.forEach((x, i) => { if (i) out.push(" and "); out.push(...x); });
  return out;
}

// "the value `5`", "a value that is one of `A` or `B`", "a code matching the pattern `Pr_.*`".
function withNoun(val, noun, name = (x) => x) {
  if (val.simple !== undefined) return [`the ${noun} `, { v: name(val.simple) }];
  const r = val.r;
  if (!r || valueParts(val)[0] === "any value") return [`any ${noun}`];
  const onlyPattern = r.pattern.length && !r.enumeration.length && [r.minInclusive, r.maxInclusive, r.minExclusive, r.maxExclusive, r.length, r.minLength, r.maxLength].every((x) => x === undefined);
  if (onlyPattern) return [`a ${noun} `, ...valueParts(val, name)];
  if (r.enumeration.length === 1 && !r.pattern.length && valueParts(val, name).length === 1) return [`the ${noun} `, ...valueParts(val, name)];
  return [`a ${noun} that is `, ...valueParts(val, name)];
}

// "`IfcWall`", "`IfcDoor` or `IfcWindow`", "element with a class matching ..."
function entityParts(f, name) {
  const n = f.name;
  let parts;
  if (n.simple !== undefined) parts = valueParts(n, name);
  else if (n.r && n.r.enumeration.length && !n.r.pattern.length && n.r.minLength === undefined && n.r.maxLength === undefined && n.r.length === undefined) parts = lst(n.r.enumeration.map((x) => ({ v: name(x) })));
  else parts = ["element with ", ...withNoun(n, "class", name)];
  if (f.predefinedType.present) parts.push(f.predefinedType.simple !== undefined ? [" of predefined type ", { v: f.predefinedType.simple }] : [" with ", ...withNoun(f.predefinedType, "predefined type")]);
  return parts;
}

const isOne = (val) => val.simple !== undefined || (val.r && val.r.enumeration.length === 1 && !val.r.pattern.length);

// "the property `IsExternal` in the set `Pset_WallCommon`, of data type `IFCBOOLEAN`"
function propertyParts(f) {
  const nm = isOne(f.baseName) ? ["the property ", ...valueParts(f.baseName)] : ["a property with ", ...withNoun(f.baseName, "name")];
  const ps = isOne(f.propertySet) ? [" in the set ", ...valueParts(f.propertySet)] : [" in a set with ", ...withNoun(f.propertySet, "name")];
  const out = [...nm, ...ps];
  if (f.dataType) out.push(", of data type ", { v: f.dataType });
  return out;
}
const attrParts = (f) => (isOne(f.name) ? ["its attribute ", ...valueParts(f.name)] : ["an attribute with ", ...withNoun(f.name, "name")]);
const unitNote = (f) => (own(SI, f.dataType) && f.value.present && valueParts(f.value)[0] !== "any value" ? [` (in ${own(SI, f.dataType)}, as IDS requires, whatever unit the model uses)`] : []);
const cap = (parts) => { const p = flat(parts); if (typeof p[0] === "string") p[0] = p[0][0].toUpperCase() + p[0].slice(1); return p; };

// One requirement as a sentence about "each element".
function requirementSentence(f, name) {
  // A value restriction with no facets admits any value: say "with a value".
  if (f.value && f.value.present && valueParts(f.value)[0] === "any value") f = Object.assign(Object.create(Object.getPrototypeOf(f)), f, { value: { present: false } });
  const card = f.cardinality || "required";
  const no = card === "prohibited";
  const s = [];
  switch (f.kind) {
    case "entity":
      s.push(no ? "It must not be " : "It must be ", ...article(entityParts(f, name)), ".");
      break;
    case "attribute":
      if (card === "optional") s.push("If ", ...attrParts(f), " is filled in, it ", f.value.present ? ["must hold ", ...withNoun(f.value, "value")] : ["may hold any value"], ".");
      else if (f.value.present) s.push(...cap(attrParts(f)), no ? " must not hold " : " must hold ", ...withNoun(f.value, "value"), ".");
      else s.push(...cap(attrParts(f)), no ? " must be empty or not set." : " must be filled in (not empty).");
      break;
    case "property":
      if (card === "optional") s.push("If it has ", ...propertyParts(f), ", ", f.value.present ? ["that property must hold ", ...withNoun(f.value, "value"), ...unitNote(f)] : ["any value is accepted"], ".");
      else if (f.value.present) s.push(no ? "It must not have " : "It must have ", ...propertyParts(f), ", holding ", ...withNoun(f.value, "value"), ...unitNote(f), ".");
      else s.push(no ? "It must not have " : "It must have ", ...propertyParts(f), no ? "." : ", with a value.");
      break;
    case "classification": {
      const sys = f.system.present ? (f.system.simple !== undefined ? [" in the system ", { v: f.system.simple }] : [" in ", ...withNoun(f.system, "system")]) : [];
      if (card === "optional") s.push("If it is classified", ...sys, ", ", f.value.present ? ["it must have ", ...withNoun(f.value, "code")] : ["any code is accepted"], ".");
      else s.push(no ? "It must not be classified" : "It must be classified", ...sys, ...(f.value.present ? [" with ", ...withNoun(f.value, "code")] : []), ".");
      break;
    }
    case "material":
      if (card === "optional") s.push("If it has a material, ", f.value.present ? ["that material must have ", ...withNoun(f.value, "name or category")] : ["any material is accepted"], ".");
      else s.push(no ? "It must not have a material" : "It must have a material", ...(f.value.present ? [" with ", ...withNoun(f.value, "name or category")] : []), ".");
      break;
    case "partOf": {
      const rel = f.relation ? [" ", own(RELATIONS, f.relation) || f.relation] : [" part of"];
      const whole = f.entity ? [" ", ...article(entityParts(f.entity, name))] : [" anything"];
      if (card === "optional") s.push("If it is", ...rel, " something, that must be", ...whole, ".");
      else s.push(no ? "It must not be" : "It must be", ...rel, ...whole, ".");
      break;
    }
    default:
      s.push(`A ${f.kind} requirement this document cannot put in words.`);
  }
  return flat(s);
}

// "an `IfcBuildingStorey`", "an element with a class matching ..."
const article = (parts) => ["an ", ...parts];

// One applicability facet as a clause after "Applies to every ...".
function applicabilityClause(f, name) {
  const no = f.cardinality === "prohibited";
  switch (f.kind) {
    case "entity": return entityParts(f, name);
    case "attribute": return [no ? "that does not have " : "that has ", ...(isOne(f.name) ? ["the attribute ", ...valueParts(f.name)] : ["an attribute with ", ...withNoun(f.name, "name")]), ...(f.value.present ? [" holding ", ...withNoun(f.value, "value")] : [" filled in"])];
    case "property": return [no ? "that does not have " : "that has ", ...propertyParts(f), ...(f.value.present ? [", holding ", ...withNoun(f.value, "value")] : [])];
    case "classification": return [no ? "that is not classified" : "that is classified", ...(f.system.present ? (f.system.simple !== undefined ? [" in the system ", { v: f.system.simple }] : [" in ", ...withNoun(f.system, "system")]) : []), ...(f.value.present ? [" with ", ...withNoun(f.value, "code")] : [])];
    case "material": return [no ? "that does not have a material" : "that has a material", ...(f.value.present ? [" with ", ...withNoun(f.value, "name or category")] : [])];
    case "partOf": return [no ? "that is not" : "that is", ...(f.relation ? [" ", own(RELATIONS, f.relation) || f.relation] : [" part of"]), ...(f.entity ? [" ", ...article(entityParts(f.entity, name))] : [" anything"])];
    default: return [`with a ${f.kind} facet`];
  }
}

// Nested arrays flattened, adjacent strings joined.
function flat(parts) {
  const out = [];
  const walk = (p) => {
    if (Array.isArray(p)) { p.forEach(walk); return; }
    if (typeof p === "string" && typeof out[out.length - 1] === "string") out[out.length - 1] += p;
    else out.push(p);
  };
  walk(parts);
  return out;
}

export const sentenceText = (s) => s.map((p) => (typeof p === "string" ? p : p.v !== undefined ? String(p.v) : String(p.b))).join("");

const OPTIONALITY = {
  required: "Required: the model must contain at least one such element, and every one must meet the requirements below.",
  optional: "Optional: the model need not contain any such element, but every one it contains must meet the requirements below.",
  prohibited: "Prohibited: the model must not contain any such element.",
};

export function docFromIds(idsText, { classNames = {} } = {}) {
  const ids = parseIds(idsText);
  const name = (x) => (typeof x === "string" && own(classNames, x.toUpperCase())) || x;
  const specs = ids.specs.map((s, i) => {
    const ents = s.applicability.filter((f) => f.kind === "entity");
    const rest = s.applicability.filter((f) => f.kind !== "entity");
    // "Applies to every IfcDoor of predefined type X, that have ..., and that are ..."
    let applies;
    if (!s.applicability.length) applies = ["Applies to every element in the model."];
    else {
      const head = ents.length ? ents.map((f) => entityParts(f, name)) : [["element"]];
      const subj = ["Applies to every "];
      head.forEach((h, k) => { if (k) subj.push(" that is also "); subj.push(...h); });
      const tails = rest.map((f) => applicabilityClause(f, name));
      const out = [...subj];
      tails.forEach((t, k) => { out.push(k === 0 ? " " : k === tails.length - 1 ? ", and " : ", "); out.push(...t); });
      out.push(".");
      applies = out;
    }
    return {
      number: i + 1,
      name: s.name,
      description: s.description,
      instructions: s.instructions,
      ifcVersion: s.ifcVersion,
      optionality: s.optionality,
      optionalityText: own(OPTIONALITY, s.optionality) || OPTIONALITY.required,
      applies: flat(applies),
      applicability: s.applicability.map((f) => ({ kind: f.kind, sentence: flat(applicabilityClause(f, name)), instructions: f.instructions || null })),
      requirementsDescription: s.requirementsDescription || null,
      requirements: s.optionality === "prohibited" && s.requirements.length === 0 ? [] : s.requirements.map((f) => ({ kind: f.kind, cardinality: f.cardinality || "required", sentence: requirementSentence(f, name), instructions: f.instructions || null })),
    };
  });
  return { title: ids.title, info: ids.info, specs };
}

// ------------------------------------------------------------- Markdown ----

const mdEsc = (s) => String(s).replace(/([\\`*_[\]<>#|])/g, "\\$1");
function mdCode(x) {
  const s = String(x);
  if (s === "") return "`\u00a0`"; // an empty value still shows as a code span
  const runs = s.match(/`+/g) || [];
  const fence = "`".repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = /^`|`$|^ .* $/.test(s) || s.startsWith("`") || s.endsWith("`") ? " " : "";
  return fence + pad + s + pad + fence;
}
const mdSentence = (s) => s.map((p) => (typeof p === "string" ? mdEsc(p) : p.v !== undefined ? mdCode(p.v) : `**${mdEsc(p.b)}**`)).join("");
const mdCell = (s) => mdEsc(s).replace(/\r?\n/g, " ");

export function docToMarkdown(doc) {
  const L = [];
  L.push(`# ${mdEsc(doc.title || "Information requirements")}`, "");
  const info = Object.entries(doc.info || {}).filter(([k]) => k !== "title");
  if (info.length) {
    L.push("| | |", "| --- | --- |");
    for (const [k, v] of info) L.push(`| ${k[0].toUpperCase() + k.slice(1)} | ${mdCell(v)} |`);
    L.push("");
  }
  L.push("Written from the IDS (Information Delivery Specification) file by IDS Model Check. The IDS is the authority: this document repeats every name and value exactly as the IDS gives it. Names in `code` must appear in the IFC model exactly as written, upper and lower case included.", "");
  L.push("## Summary", "", "| # | Specification | Applies to | Requirements | IFC |", "| --- | --- | --- | --- | --- |");
  for (const s of doc.specs) L.push(`| ${s.number} | ${mdCell(s.name)} | ${mdSentence(s.applies.slice(0)).replace(/^Applies to every /, "").replace(/\.$/, "").replace(/\|/g, "\\|")} | ${s.optionality === "prohibited" ? "none may exist" : s.requirements.length} | ${s.ifcVersion.join(", ") || "any"} |`);
  L.push("");
  for (const s of doc.specs) {
    L.push(`## ${s.number}. ${mdEsc(s.name)}`, "");
    if (s.description) L.push(mdEsc(s.description), "");
    if (s.instructions) L.push(`*Instructions:* ${mdEsc(s.instructions)}`, "");
    L.push(mdSentence(s.applies), "");
    for (const a of s.applicability) if (a.instructions) L.push(`*Instructions (${a.kind}):* ${mdEsc(a.instructions)}`, "");
    L.push(`**${mdEsc(s.optionalityText)}**`, "");
    if (s.ifcVersion.length) L.push(`IFC version: ${s.ifcVersion.map(mdCode).join(", ")}`, "");
    if (s.requirements.length) {
      L.push(s.optionality === "prohibited" ? "Requirements (these only narrow down which elements are prohibited):" : `Each such element:${s.requirementsDescription ? " " + mdEsc(s.requirementsDescription) : ""}`, "");
      for (const r of s.requirements) {
        L.push(`- ${r.cardinality === "required" ? "" : `*${r.cardinality}:* `}${mdSentence(r.sentence)}`);
        if (r.instructions) L.push(`  *Instructions:* ${mdEsc(r.instructions)}`);
      }
      L.push("");
    } else if (s.optionality !== "prohibited") L.push("No further requirements: the elements only have to exist.", "");
  }
  L.push("---", "", "*Generated by IDS Model Check (MIT licensed). Not a design review, a code-compliance check or professional advice; the IDS file is the authority.*", "");
  return L.join("\n");
}

// ----------------------------------------------------------------- HTML ----

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const htmlSentence = (s) => s.map((p) => (typeof p === "string" ? esc(p) : p.v !== undefined ? `<code>${esc(p.v) || "&nbsp;"}</code>` : `<strong>${esc(p.b)}</strong>`)).join("");

export function docToHtml(doc) {
  const title = doc.title || "Information requirements";
  const h = [];
  h.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>
body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:52rem;margin:2rem auto;padding:0 16px;color:#1d1d1f;background:#fff}
h1{font-size:1.6rem;margin-bottom:.4rem}h2{font-size:1.15rem;margin-top:2rem;border-top:1px solid #ddd;padding-top:1rem;break-after:avoid}
table{border-collapse:collapse;width:100%;margin:.5rem 0 1rem;font-size:.92em}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f3f3f3}
code{font:.9em ui-monospace,Menlo,Consolas,monospace;background:#f2f2f2;padding:0 3px;border-radius:3px;overflow-wrap:anywhere}
.opt{font-weight:600}.muted{color:#555;font-size:.9em}.card{font-style:italic;color:#555}section{break-inside:avoid-page}
@media print{body{margin:0;max-width:none}a{color:inherit}}
</style></head><body>`);
  h.push(`<h1>${esc(title)}</h1>`);
  const info = Object.entries(doc.info || {}).filter(([k]) => k !== "title");
  if (info.length) h.push(`<table>${info.map(([k, v]) => `<tr><th>${esc(k[0].toUpperCase() + k.slice(1))}</th><td>${esc(v)}</td></tr>`).join("")}</table>`);
  h.push(`<p class="muted">Written from the IDS (Information Delivery Specification) file by IDS Model Check. The IDS is the authority: this document repeats every name and value exactly as the IDS gives it. Names in <code>code</code> must appear in the IFC model exactly as written, upper and lower case included.</p>`);
  h.push(`<h2>Summary</h2><table><thead><tr><th>#</th><th>Specification</th><th>Applies to</th><th>Requirements</th><th>IFC</th></tr></thead><tbody>`);
  for (const s of doc.specs) h.push(`<tr><td><a href="#spec-${s.number}">${s.number}</a></td><td>${esc(s.name)}</td><td>${htmlSentence(s.applies).replace(/^Applies to every /, "").replace(/\.$/, "")}</td><td>${s.optionality === "prohibited" ? "none may exist" : s.requirements.length}</td><td>${esc(s.ifcVersion.join(", ") || "any")}</td></tr>`);
  h.push(`</tbody></table>`);
  for (const s of doc.specs) {
    h.push(`<section id="spec-${s.number}"><h2>${s.number}. ${esc(s.name)}</h2>`);
    if (s.description) h.push(`<p>${esc(s.description)}</p>`);
    if (s.instructions) h.push(`<p><em>Instructions:</em> ${esc(s.instructions)}</p>`);
    h.push(`<p>${htmlSentence(s.applies)}</p>`);
    for (const a of s.applicability) if (a.instructions) h.push(`<p><em>Instructions (${esc(a.kind)}):</em> ${esc(a.instructions)}</p>`);
    h.push(`<p class="opt">${esc(s.optionalityText)}</p>`);
    if (s.ifcVersion.length) h.push(`<p class="muted">IFC version: ${s.ifcVersion.map((v) => `<code>${esc(v)}</code>`).join(", ")}</p>`);
    if (s.requirements.length) {
      h.push(`<p>${s.optionality === "prohibited" ? "Requirements (these only narrow down which elements are prohibited):" : `Each such element:${s.requirementsDescription ? " " + esc(s.requirementsDescription) : ""}`}</p><ul>`);
      for (const r of s.requirements) h.push(`<li>${r.cardinality === "required" ? "" : `<span class="card">${esc(r.cardinality)}:</span> `}${htmlSentence(r.sentence)}${r.instructions ? `<br><span class="muted"><em>Instructions:</em> ${esc(r.instructions)}</span>` : ""}</li>`);
      h.push(`</ul>`);
    } else if (s.optionality !== "prohibited") h.push(`<p>No further requirements: the elements only have to exist.</p>`);
    h.push(`</section>`);
  }
  h.push(`<p class="muted">Generated by IDS Model Check (MIT licensed). Not a design review, a code-compliance check or professional advice; the IDS file is the authority.</p></body></html>`);
  return h.join("\n");
}
