// Write what an IDS asks for into the model: the property values a failing
// check is missing, where the IDS fixes the value (a simpleValue, or a one-item
// enumeration) or a person typed it into the to-fill table this module writes.
//
// The output is the same STEP file with a few records changed and new ones
// added before the DATA section's ENDSEC: every other line is byte for byte as
// it was. Property entities are never edited (they are often shared); a
// property set is edited in place only when every element that reaches it gets
// the same new values, and otherwise copied for the elements that change, so
// nothing outside the failing elements gains a value. After writing, the new
// file is read again and every written value is tested by the same facet that
// failed (eval/model-fill-2026-11-21.md).
//
// Quantities go the same way into IfcElementQuantity sets (Qto_ names, or a
// name the element already holds as one), each an IfcQuantityLength, Area,
// Volume, Count, Weight or Time picked by the facet's data type (or the
// standard Qto_ template's). A quantity's value can also come from the
// element's own other quantity sets: an IFC2X3 export's BaseQuantities often
// holds the NetSideArea a Qto_WallBaseQuantities facet asks for
// (eval/model-fill-attributes-quantities-2026-11-21.md). An attribute the
// element leaves unset ($ or '') is written into its own record; one that
// holds a value is never overwritten.
//
// Only STEP (.ifc) is written. Classifications, materials and relationships
// are reported, not written.
import { Model, checkIds, parseIds, psetRecord, psetInfo, psetSources, applies, PropertyFacet, QUANTITY_MEASURE } from "./ids.mjs";
import { rowsToCsv, csvToRows } from "./sheet.mjs";

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

function randomBytes16() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return b;
}

// An IfcGloballyUniqueId: 128 random bits in IFC's 22-character base-64 form
// (the first character carries 2 bits, the other 21 carry 6 each).
export function newGlobalId(random = randomBytes16) {
  const b = random();
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = B64[Number(n >> 126n)];
  for (let i = 20; i >= 0; i--) s += B64[Number((n >> BigInt(6 * i)) & 63n)];
  return s;
}

// A STEP string literal: ' doubled, \ doubled, anything outside printable
// ASCII as \X2\ UTF-16 hex \X0\ (ISO 10303-21), so the file stays ASCII.
export function stepString(s) {
  let out = "'";
  let hex = "";
  const flush = () => { if (hex) { out += "\\X2\\" + hex + "\\X0\\"; hex = ""; } };
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 32 && c <= 126) {
      flush();
      out += c === 39 ? "''" : c === 92 ? "\\\\" : s[i];
    } else hex += c.toString(16).toUpperCase().padStart(4, "0");
  }
  flush();
  return out + "'";
}

// A REAL as STEP writes it: always a decimal point, E for the exponent.
export function stepReal(x) {
  let s = String(Number(x.toPrecision(15)));
  s = s.replace("e", "E");
  if (!s.includes(".")) s = s.includes("E") ? s.replace("E", ".E") : s + ".";
  return s;
}

// A REAL written so it reads back as the same double (a copied value).
function exactReal(x) {
  let s = String(x).replace("e", "E");
  if (!s.includes(".")) s = s.includes("E") ? s.replace("E", ".E") : s + ".";
  return s;
}

// A value the IDS states (or a person typed) as the model holds it: {v, prim}
// for IdsValue.match, or {error}.
function readValue(S, dataType, text) {
  const prim = S.prim(dataType);
  const t = String(text).trim();
  if (prim === "string") return { v: String(text), prim };
  if (prim === "double") { const v = Number(t.replace(/^\+/, "")); return t !== "" && Number.isFinite(v) ? { v, prim } : { error: `"${text}" is not a number` }; }
  if (prim === "integer") return /^[+-]?\d+$/.test(t) ? { v: Number(t), prim } : { error: `"${text}" is not a whole number` };
  if (prim === "boolean" || prim === "logical") {
    const k = t.toLowerCase();
    if (k === "true" || k === "1") return { v: true, prim };
    if (k === "false" || k === "0") return { v: false, prim };
    if (prim === "logical" && k === "unknown") return { v: "UNKNOWN", prim };
    return { error: `"${text}" is not true or false` };
  }
  if (prim === "enum") {
    const items = enumItems(S, dataType);
    const k = t.replace(/^\.|\.$/g, "").toUpperCase();
    return items && items.includes(k) ? { v: { enum: k }, prim } : { error: `"${text}" is not one of ${items ? items.join(", ") : "the enumeration's values"}` };
  }
  return { error: `${dataType} is a ${prim} type, which this fill does not write` };
}

// The values an enumeration type allows (through defined types).
function enumItems(S, typeName) {
  let t = typeName;
  for (let g = 0; g < 20 && t; g++) {
    const d = S.types[t];
    if (!d) return null;
    if (d.kind === "enum") return d.values;
    t = d.of;
  }
  return null;
}

// The quantity class for a measure type (IFCAREAMEASURE -> IFCQUANTITYAREA).
const QUANTITY_OF = Object.fromEntries(Object.entries(QUANTITY_MEASURE).map(([q, [, mt]]) => [mt, q]));

// A number in the IDS's SI units as the model's project units hold it.
function toProjectUnits(model, measure, x) {
  const ut = model.measureUnits && Object.prototype.hasOwnProperty.call(model.measureUnits, measure) ? model.measureUnits[measure] : null;
  const u = ut && model.unitFactor.get(ut);
  return u ? (x - u.offset) / u.scale : x;
}

// An attribute's value as the record holds it, untyped: the attribute's own
// declared type says what it is. Numbers are written as given: this checker
// (and the IDS standard's attribute facet) compares attribute values without
// unit conversion.
function attrStepValue(val) {
  const { v, prim } = val;
  if (prim === "string") return stepString(v);
  if (prim === "double") return stepReal(v);
  if (prim === "integer") return String(v);
  if (prim === "enum") return "." + v.enum + ".";
  return v === true ? ".T." : v === false ? ".F." : ".U.";
}

// The typed value's STEP text, a number converted from the IDS's SI units to
// the model's project units.
function stepValue(model, dataType, val) {
  const { v, prim } = val;
  let inner;
  if (prim === "string") inner = stepString(v);
  else if (prim === "double") inner = stepReal(toProjectUnits(model, dataType, v));
  else if (prim === "integer") inner = String(v);
  else inner = v === true ? ".T." : v === false ? ".F." : ".U.";
  return `${dataType}(${inner})`;
}

// The value an IDS facet fixes, or undefined when it allows more than one.
function fixedValue(iv) {
  if (iv.simple !== undefined) return iv.simple;
  const r = iv.r;
  if (!r || r.enumeration.length !== 1) return undefined;
  const others = [r.pattern.length, r.minInclusive, r.maxInclusive, r.minExclusive, r.maxExclusive, r.length, r.minLength, r.maxLength];
  return others.every((x) => !x) ? r.enumeration[0] : undefined;
}

// ------------------------------------------------------------ STEP text ----

// Where a record ends (its ";"), stepping over strings and comments.
function recordEnd(t, p) {
  for (let i = p; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 59) return i;
    if (c === 39) { i = t.indexOf("'", i + 1); while (i >= 0 && t.charCodeAt(i + 1) === 39) i = t.indexOf("'", i + 2); if (i < 0) return -1; }
    else if (c === 47 && t.charCodeAt(i + 1) === 42) { i = t.indexOf("*/", i + 2); if (i < 0) return -1; i++; }
  }
  return -1;
}

// The DATA section's records with the numbers in `want`: Map(id -> {start,
// end (the ";"), type, args: top-level argument texts}).
function findRecords(text, want) {
  const out = new Map();
  if (!want.size) return out;
  let i = text.search(/\bDATA\s*;/);
  const n = text.length;
  let q = 0, c = 0;
  while (i >= 0 && i < n && out.size < want.size) {
    const h = text.indexOf("#", i);
    if (h < 0) break;
    // Skip strings and comments between records. The next quote and comment
    // are found once and kept until the scan passes them: searching again from
    // every record ran to the end of a file with none (quadratic).
    if (q >= 0 && q < i) q = text.indexOf("'", i);
    if (c >= 0 && c < i) c = text.indexOf("/*", i);
    if (q >= 0 && q < h) { i = recordEnd(text, q) + 1 || n; continue; }
    if (c >= 0 && c < h) { i = text.indexOf("*/", c + 2) + 2 || n; continue; }
    const m = /^#(\d+)\s*=\s*([A-Za-z0-9_]*)\s*\(/.exec(text.slice(h, h + 120));
    if (!m) { i = h + 1; continue; }
    const end = recordEnd(text, h + m[0].length - 1);
    if (end < 0) break;
    const id = Number(m[1]);
    if (want.has(id) && m[2]) {
      const open = h + m[0].length - 1;
      const close = text.lastIndexOf(")", end);
      out.set(id, { start: h, end, type: m[2], args: splitArgs(text.slice(open + 1, close)) });
    }
    i = end + 1;
  }
  return out;
}

// Top-level comma-separated parts of an argument list's inside.
export function splitArgs(s) {
  const out = [];
  let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") { i++; while (i < s.length && !(s[i] === "'" && s[i + 1] !== "'")) i += s[i] === "'" ? 2 : 1; }
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) { out.push(s.slice(from, i).trim()); from = i + 1; }
  }
  const last = s.slice(from).trim();
  if (last !== "" || out.length) out.push(last);
  return out;
}

const listRefs = (arg) => (arg && arg.startsWith("(") ? splitArgs(arg.slice(1, arg.lastIndexOf(")"))).filter(Boolean) : []);
const listText = (refs) => "(" + refs.join(",") + ")";

// ------------------------------------------------------------- planning ----

// Every property facet that names set ps and property pn (ps null: every
// attribute facet naming attribute pn) in a specification applying to
// element e: [{spec, facet}]. A value written for one
// specification must not break another that constrains the same property on
// the same element.
function facetsOn(ids, model, ctx, e, ps, pn, cache) {
  const out = [];
  for (const [si, spec] of ids.specs.entries()) {
    if (spec.optionality === "prohibited") continue;
    const rs = spec.requirements.filter((r) => (ps === null ? r.kind === "attribute" && r.name.matchString(pn) : r.kind === "property" && r.propertySet.matchString(ps) && r.baseName.matchString(pn)));
    if (!rs.length) continue;
    let set = cache.get(si);
    if (!set) cache.set(si, (set = new Set(applies(spec, model, ctx).map((x) => x.id))));
    if (set.has(e.id)) for (const r of rs) out.push({ spec, facet: r });
  }
  return out;
}

// Whether a requirement facet holds on e, by its cardinality.
function facetHolds(r, e, model, ctx = null) {
  const t = r.test(e, model, ctx);
  return r.kind === "entity" ? t.ok : r.cardinality === "prohibited" ? !t.ok : r.cardinality === "optional" ? t.ok || !!t.absent : t.ok;
}

// A specification's failing count from a report checked with maxFailed (the
// failing elements' reasons are not kept: a specification with no class on
// a 40 MB MEP export fails 5.3 million times, eval/model-fill-2026-11-21.md).
const failCount = (s) => s.failedCount ?? s.failed.length;
const reportFailing = (r) => r.specs.reduce((n, s) => n + failCount(s), 0);

// The PropertySet column's text for an attribute row of the to-fill table.
export const ATTRIBUTE = "(attribute)";

const KIND_WORDS = { entity: "class", attribute: "attribute", classification: "classification", material: "material", partOf: "part of", property: "property" };

// What the fill would write: {writes: [{e, globalId, pset, prop, dataType,
// valueText, source}], unfilled: [rows for the to-fill table], notWritten:
// {kind: count}, report}. values: rows read from a filled to-fill table
// (readValues).
export function planFill(idsText, model, opts = {}) {
  const ids = typeof idsText === "string" ? parseIds(idsText) : idsText;
  // Verdicts and counts only; the failing elements are found below, for the
  // specifications the fill can write to, without a reason string each.
  const report = checkIds(ids, model, { ...opts, maxFailed: 0 });
  const S = model.schema;
  const templates = opts.psets && opts.psets[model.schemaId];
  const values = opts.values || [];
  const userValue = (gid, ps, pn) => {
    const hit = values.find((r) => r.globalId === gid && r.pset === ps && r.prop === pn) || values.find((r) => r.globalId === "*" && r.pset === ps && r.prop === pn);
    return hit ? hit.value : undefined;
  };
  const writes = new Map(); // `${e.id}\0${pset}\0${prop}` -> write
  const conflicts = new Set();
  const unfilled = [];
  const notWritten = {};
  const ctx = { typeMap: opts.typeMap || null };
  const appliesCache = new Map();
  const reader = new PropertyFacet({ attrs: {}, children: [] });
  // Quantity pn of class qclass in the element's other quantity sets, when
  // they agree on one value: {text: in SI units, for the facet test; raw:
  // the number as the file holds it, when it is in the project's units (no
  // Unit of its own), so the copy is exact}.
  const modelQuantity = (e, ps, pn, qclass) => {
    const seen = new Map();
    psetSources(model, e, (d) => {
      if (d.type !== "IFCELEMENTQUANTITY") return;
      const info = psetInfo(model, d);
      if (info.name === ps) return;
      const q = info.props.get(pn);
      if (!q || q.type !== qclass) return;
      const got = reader.values(model, q);
      const ui = S.attrs(q.type).index.get("Unit"), vi = S.attrs(q.type).index.get(QUANTITY_MEASURE[qclass][0]);
      const raw = q.args[ui] === null || q.args[ui] === undefined ? q.args[vi] : undefined;
      for (const x of got.values || []) if (typeof x.v === "number" && Number.isFinite(x.v)) {
        const k = Number(x.v.toPrecision(12));
        if (!seen.has(k)) seen.set(k, { text: String(x.v), raw: typeof raw === "number" ? raw : undefined });
      }
    });
    return seen.size === 1 ? [...seen.values()][0] : undefined;
  };
  // An attribute the element leaves unset, written into its own record.
  // What no table value could fix is counted, not listed: a pattern-named
  // attribute on every entity is one row per entity (203,748 on the 3.9 MB
  // construction model), none of which a person can type a value for.
  const count = (k) => { notWritten[k] = (notWritten[k] || 0) + 1; };
  const planAttribute = (spec, r, e, f) => {
    const an = r.name.simple;
    const row = { globalId: f.globalId || "", id: e.id, type: e.type, name: f.name || "", spec: spec.name, pset: ATTRIBUTE, prop: an ?? String(r.name), dataType: "", allowed: r.value.present ? String(r.value) : "(any value)", why: "" };
    if (an === undefined) return count("attribute named by a pattern or list");
    const ai = S.attrs(e.type).index.get(an);
    const a = ai === undefined ? null : S.attrs(e.type)[ai];
    if (!a) return count("attribute the class does not have");
    row.dataType = a.type;
    if (a.derived) return count("attribute derived (computed, not stored)");
    const prim = S.prim(a.type);
    if (a.aggregate || !["string", "double", "integer", "boolean", "logical", "enum"].includes(prim)) return count("attribute holding a list, an object or a select");
    if (an === "GlobalId") return count("attribute GlobalId (the element's identity)");
    const cur = (e.shallowArgs || e.args)[ai];
    if (!(cur === null || cur === undefined || cur === "")) return count("attribute already set (not overwritten)");
    let text = fixedValue(r.value), source = "ids";
    if (text === undefined && f.globalId) { text = userValue(f.globalId, ATTRIBUTE, an); source = "table"; }
    if (text === undefined && opts.suggest) { text = opts.suggest(r, a.type, prim); source = "table"; }
    if (text === undefined || text === null || text === "") { unfilled.push({ ...row, why: f.globalId ? "no value given: type one in the Value column" : "no value given, and the element has no GlobalId to give one by" }); return; }
    const val = readValue(S, a.type, text);
    if (val.error) { unfilled.push({ ...row, value: text, why: val.error }); return; }
    if (r.value.present && !r.value.match(val.v, prim)) { unfilled.push({ ...row, value: text, why: `"${text}" is not ${r.value}` }); return; }
    for (const { spec: s2, facet: r2 } of facetsOn(ids, model, ctx, e, null, an, appliesCache)) {
      if (r2 === r) continue;
      let clash = null;
      if (r2.cardinality === "prohibited") clash = `specification "${s2.name}" prohibits ${an} here`;
      else if (r2.value.present && !r2.value.match(val.v, prim)) clash = `specification "${s2.name}" asks for ${an} ${r2.value}`;
      if (clash) { unfilled.push({ ...row, value: text, why: `"${text}" would break another check: ${clash}` }); return; }
    }
    const key = `${e.id}\0${ATTRIBUTE}\0${an}`;
    const valueText = attrStepValue(val);
    const prev = writes.get(key);
    if (prev && prev.valueText !== valueText) { conflicts.add(key); unfilled.push({ ...row, value: text, why: `another specification asks for ${prev.text}` }); return; }
    if (!prev) writes.set(key, { kind: "attribute", attrIndex: ai, e, globalId: f.globalId, pset: ATTRIBUTE, prop: an, dataType: a.type, text: String(text), valueText, source, spec: spec.name });
  };
  for (const [si, spec] of ids.specs.entries()) {
    const s = report.specs[si];
    if (s.status !== "fail" || spec.optionality === "prohibited") continue;
    if (!spec.requirements.some((r) => (r.kind === "property" || r.kind === "attribute") && r.cardinality === "required")) {
      const k = "elements failing a specification with no required property or attribute";
      notWritten[k] = (notWritten[k] || 0) + failCount(s);
      continue;
    }
    for (const e of applies(spec, model, ctx)) {
      const verdicts = spec.requirements.map((r) => facetHolds(r, e, model, ctx));
      if (verdicts.every(Boolean)) continue;
      const gidAttr = model.attr(e, "GlobalId"), nameAttr = model.attr(e, "Name");
      const f = { globalId: typeof gidAttr === "string" ? gidAttr : "", name: typeof nameAttr === "string" ? nameAttr : "" };
      for (const [ri, r] of spec.requirements.entries()) {
        if (verdicts[ri]) continue;
        if (r.kind === "attribute" && r.cardinality === "required") { planAttribute(spec, r, e, f); continue; }
        if (r.kind !== "property" || r.cardinality !== "required") {
          const k = (Object.hasOwn(KIND_WORDS, r.kind) ? KIND_WORDS[r.kind] : r.kind) + (r.kind === "entity" || r.cardinality === "required" ? "" : " (" + r.cardinality + ")");
          notWritten[k] = (notWritten[k] || 0) + 1;
          continue;
        }
        const row = { globalId: f.globalId || "", id: e.id, type: e.type, name: f.name || "", spec: spec.name, pset: r.propertySet.simple ?? String(r.propertySet), prop: r.baseName.simple ?? String(r.baseName), dataType: r.dataType || "", allowed: r.value.present ? String(r.value) : "(any value)", why: "" };
        const ps = r.propertySet.simple, pn = r.baseName.simple;
        if (ps === undefined || pn === undefined) { unfilled.push({ ...row, why: "the IDS names the set or property by a pattern or list, so no one name can be written" }); continue; }
        if (!f.globalId) { unfilled.push({ ...row, why: "the element has no GlobalId" }); continue; }
        // What the element holds sets of this name as. A set of the other
        // kind beside it (IFC2X3 exports name their IfcElementQuantity
        // BaseQuantities) would be merged by this checker but read by
        // IfcTester as the one set, hiding what is there
        // (eval/model-fill-2026-11-21.md).
        const held = new Set();
        psetSources(model, e, (d) => { if (psetInfo(model, d).name === ps) held.add(d.type); });
        const quantity = held.has("IFCELEMENTQUANTITY") || (!held.size && /^Qto_/.test(ps));
        const setType = quantity ? "IFCELEMENTQUANTITY" : "IFCPROPERTYSET";
        const other = [...held].find((t) => t !== setType);
        if (other) { unfilled.push({ ...row, why: `the model holds ${ps} as an ${other}, so ${quantity ? "a quantity" : "a property"} of that name is not written beside it` }); continue; }
        let dataType = r.dataType;
        if (!dataType) {
          const tpl = templates && Object.hasOwn(templates, ps) && Object.hasOwn(templates[ps].props, pn) ? templates[ps].props[pn] : null;
          dataType = (tpl && tpl.type) || (quantity ? null : "IFCLABEL");
        }
        row.dataType = dataType || "";
        let qclass = null;
        if (quantity) {
          qclass = dataType && Object.hasOwn(QUANTITY_OF, dataType) ? QUANTITY_OF[dataType] : null;
          if (!dataType) { unfilled.push({ ...row, why: "the IDS gives no data type and no standard Qto_ template names this quantity, so its kind (length, area, volume ...) is unknown" }); continue; }
          if (!qclass || !S.has(qclass)) { unfilled.push({ ...row, why: `${dataType} is not a quantity measure in ${model.schemaId} (length, area, volume, count, weight or time)` }); continue; }
        }
        const prim = S.prim(dataType);
        if (!["string", "double", "integer", "boolean", "logical"].includes(prim)) { unfilled.push({ ...row, why: `${dataType} is not a value type in ${model.schemaId}` }); continue; }
        let text = fixedValue(r.value), source = "ids";
        if (text === undefined) { text = userValue(f.globalId, ps, pn); source = "table"; }
        // A quantity the element already holds under the same name in
        // another quantity set, of the same kind: its value in SI units.
        let copied;
        if (text === undefined && quantity) { copied = modelQuantity(e, ps, pn, qclass); if (copied !== undefined) { text = copied.text; source = "model"; } }
        // Else the element's own geometry, measured by ifc-quantity-takeoff
        // (opts.geometry(e, name, qclass) -> SI value; geometry-quantities.mjs),
        // to six significant figures: the measurement is not finer than that.
        let geomTried = false;
        if (text === undefined && quantity && opts.geometry) {
          geomTried = true;
          const g = opts.geometry(e, pn, qclass);
          if (typeof g === "number" && Number.isFinite(g)) { text = String(Number(g.toPrecision(6))); source = "geometry"; }
        }
        // opts.suggest(facet, dataType): a stand-in for a person typing a
        // value (eval/model-fill-sweep.mjs uses it to exercise the table path).
        if (text === undefined && opts.suggest) { text = opts.suggest(r, dataType, prim); source = "table"; }
        if (text === undefined || text === null || text === "") { unfilled.push({ ...row, why: geomTried ? "no value given, and the element's geometry gives none (no body read, a faceted or unread section, an opening that could not be cut, or a quantity the body does not define): type one in the Value column" : "no value given: type one in the Value column" }); continue; }
        const val = readValue(S, dataType, text);
        if (val.error) { unfilled.push({ ...row, value: text, why: val.error }); continue; }
        if (r.value.present && !r.value.match(val.v, val.prim)) { unfilled.push({ ...row, value: text, why: `"${text}" is not ${r.value}` }); continue; }
        // The other specifications on this element that name the property.
        let clash = null;
        for (const { spec: s2, facet: r2 } of facetsOn(ids, model, ctx, e, ps, pn, appliesCache)) {
          if (r2 === r) continue;
          if (r2.cardinality === "prohibited") clash = `specification "${s2.name}" prohibits ${ps}.${pn} here`;
          else if (r2.dataType && r2.dataType !== dataType) clash = `specification "${s2.name}" asks for ${ps}.${pn} as ${r2.dataType}`;
          else if (r2.value.present && !r2.value.match(val.v, val.prim)) clash = `specification "${s2.name}" asks for ${ps}.${pn} ${r2.value}`;
          if (clash) break;
        }
        if (clash) { unfilled.push({ ...row, value: text, why: `"${text}" would break another check: ${clash}` }); continue; }
        const key = `${e.id}\0${ps}\0${pn}`;
        const inUnits = quantity ? toProjectUnits(model, dataType, val.v) : null;
        const valueText = quantity ? (copied && copied.raw !== undefined ? exactReal(copied.raw) : stepReal(source === "geometry" ? Number(inUnits.toPrecision(6)) : inUnits)) : stepValue(model, dataType, val);
        const prev = writes.get(key);
        if (prev && prev.valueText !== valueText) { conflicts.add(key); unfilled.push({ ...row, value: text, why: `another specification asks for ${prev.text}` }); continue; }
        if (!prev) writes.set(key, { kind: quantity ? "quantity" : "property", setType, qclass, e, globalId: f.globalId, pset: ps, prop: pn, dataType, text: String(text), valueText, source, spec: spec.name });
      }
    }
  }
  for (const k of conflicts) writes.delete(k);
  return { writes: [...writes.values()], unfilled, notWritten, report };
}

// ------------------------------------------------------------- writing ----

// fillModel(idsText, ifcText, {schemas, psets, measureUnits, typeMap, values,
// random, geometry}) -> {text, written, sets: {edited, copied, added}, unfilled,
// notWritten, verified, before, after}.
export function fillModel(idsText, ifc, opts = {}) {
  const text = ifc instanceof Uint8Array ? new TextDecoder().decode(ifc) : ifc;
  // opts.model: the same text already parsed (eval sweeps check one model
  // against many IDS files).
  const model = opts.model || new Model(text, opts.schemas, { psets: opts.psets });
  if (model.format !== "STEP") throw new Error(`only STEP (.ifc) models are written; this one is ${model.format}`);
  model.measureUnits = opts.measureUnits || null;
  const ids = typeof idsText === "string" ? parseIds(idsText) : idsText;
  const plan = planFill(ids, model, opts);
  const S = model.schema;
  const at = (type, name) => S.attrs(type).index.get(name);
  const random = opts.random || randomBytes16;

  // Group the writes by element and set name (attributes apart: they go
  // into the element's own record).
  const byElemSet = new Map();
  const attrWrites = [];
  for (const w of plan.writes) {
    if (w.kind === "attribute") { attrWrites.push(w); continue; }
    const k = `${w.e.id}\0${w.setType}\0${w.pset}`;
    let g = byElemSet.get(k);
    if (!g) byElemSet.set(k, (g = { e: w.e, pset: w.pset, setType: w.setType, props: [] }));
    g.props.push(w);
  }
  const listAttr = (type) => (type === "IFCELEMENTQUANTITY" ? "Quantities" : "HasProperties");
  // Which property set each element's values go to: its own (occurrence or
  // type object) set of that name, the last one as psetsOf reads it, or a new
  // one. Groups of elements that get the same values in the same set.
  const isType = (e) => model.isA(e, "IFCTYPEOBJECT");
  const ownSets = (e) => (isType(e) ? model.refs(e, "HasPropertySets") : model.psetRels.get(e.id) || []);
  const groups = new Map();
  for (const g of byElemSet.values()) {
    g.props.sort((a, b) => (a.prop < b.prop ? -1 : a.prop > b.prop ? 1 : 0));
    const sig = g.props.map((p) => p.prop + "=" + p.valueText).join("\n");
    const own = ownSets(g.e).filter((p) => p.type === g.setType && psetInfo(model, p).name === g.pset);
    const target = own.length ? own[own.length - 1] : null;
    const k = (target ? "P" + target.id : "N" + g.setType + "\0" + (isType(g.e) ? "T" + g.e.id : "") + g.pset) + "\0" + sig;
    let G = groups.get(k);
    if (!G) groups.set(k, (G = { target, pset: g.pset, setType: g.setType, props: g.props, elems: [] }));
    G.elems.push(g.e);
  }

  // Who reaches each set that will change: property relationships and type objects.
  const targets = new Set([...groups.values()].filter((G) => G.target).map((G) => G.target.id));
  const holders = new Map(); // set id -> {rels: [{rel, objs, multi}], types: [type]}
  const holder = (id) => { let h = holders.get(id); if (!h) holders.set(id, (h = { rels: [], types: [] })); return h; };
  if (targets.size) {
    for (const rel of model.ofKind("IFCRELDEFINESBYPROPERTIES")) {
      const v = model.attr(rel, "RelatingPropertyDefinition");
      const defs = v && v.typed ? (Array.isArray(v.value) ? v.value : [v.value]) : Array.isArray(v) ? v : [v];
      const ids = defs.map((d) => d && d.ref).filter((x) => x !== undefined);
      for (const d of ids) if (targets.has(d)) holder(d).rels.push({ rel, objs: model.refs(rel, "RelatedObjects").map((o) => o.id), multi: ids.length > 1 });
    }
    for (const ty of model.ofKind("IFCTYPEOBJECT")) for (const p of model.refs(ty, "HasPropertySets")) if (targets.has(p.id)) holder(p.id).types.push(ty);
  }

  // The records the fill edits, read from the text once.
  const needIds = new Set([...targets]);
  for (const h of holders.values()) { for (const r of h.rels) needIds.add(r.rel.id); for (const t of h.types) needIds.add(t.id); }
  for (const G of groups.values()) if (!G.target) for (const e of G.elems) if (isType(e)) needIds.add(e.id);
  for (const w of attrWrites) needIds.add(w.e.id);
  const recs = findRecords(text, needIds);
  const changed = new Set();

  let nextId = 0;
  for (const id of model.entities.keys()) if (id > nextId) nextId = id;
  const topId = nextId;
  const added = [];
  const add = (body) => { const id = ++nextId; added.push(`#${id}=${body};`); return "#" + id; };
  const oh = (model.byType.get("IFCOWNERHISTORY") || [])[0];
  const ownerRef = oh ? "#" + oh.id : "$";
  const guid = () => stepString(newGlobalId(random));
  // A record of class type with the named arguments given, every other one $.
  const record = (type, given) => `${type}(${S.attrs(type).map((a) => (Object.hasOwn(given, a.name) ? given[a.name] : a.derived ? "*" : "$")).join(",")})`;
  const propRefs = (G) => G.props.map((p) => add(p.kind === "quantity" ? record(p.qclass, { Name: stepString(p.prop), [QUANTITY_MEASURE[p.qclass][0]]: p.valueText }) : `IFCPROPERTYSINGLEVALUE(${stepString(p.prop)},$,${p.valueText},$)`));
  const nameOfRef = (P) => { const r = psetRecord(model, P); const m = new Map(); for (let i = 1; i < r.length; i += 2) m.set(r[i + 1].id, r[i]); return m; };
  const keptRefs = (P, G) => { const names = new Set(G.props.map((p) => p.prop)); const nm = nameOfRef(P); return listRefs(recs.get(P.id).args[at(P.type, listAttr(P.type))]).filter((r) => !names.has(nm.get(Number(r.slice(1))))); };
  const sets = { edited: 0, copied: 0, added: 0 };
  const written = [];
  const skipped = [];
  const relateNew = (pref, elems) => {
    const occ = elems.filter((e) => !isType(e));
    if (occ.length) add(`IFCRELDEFINESBYPROPERTIES(${guid()},${ownerRef},$,$,${listText(occ.map((e) => "#" + e.id))},${pref})`);
    for (const ty of elems.filter(isType)) {
      const rec = recs.get(ty.id);
      const k = at(ty.type, "HasPropertySets");
      rec.args[k] = listText([...listRefs(rec.args[k]), pref]);
      changed.add(ty.id);
    }
  };

  // Sets of a name an element does not have yet: one new set per group.
  for (const G of groups.values()) {
    if (G.target) continue;
    const pref = add(G.setType === "IFCPROPERTYSET" ? `IFCPROPERTYSET(${guid()},${ownerRef},${stepString(G.pset)},$,${listText(propRefs(G))})` : record(G.setType, { GlobalId: guid(), OwnerHistory: ownerRef, Name: stepString(G.pset), [listAttr(G.setType)]: listText(propRefs(G)) }));
    relateNew(pref, G.elems);
    sets.added++;
    written.push(G);
  }
  // Sets that exist: edited in place for the group that covers everyone who
  // reaches the set (the largest group, when the groups cover them all), copied
  // for every other group.
  const byTarget = new Map();
  for (const G of groups.values()) if (G.target) { let l = byTarget.get(G.target.id); if (!l) byTarget.set(G.target.id, (l = [])); l.push(G); }
  for (const [pid, Gs] of byTarget) {
    const P = Gs[0].target;
    const h = holders.get(pid) || { rels: [], types: [] };
    const all = new Set([...h.rels.flatMap((r) => r.objs), ...h.types.map((t) => t.id)]);
    const covered = new Set(Gs.flatMap((G) => G.elems.map((e) => e.id)));
    Gs.sort((a, b) => b.elems.length - a.elems.length);
    const inPlace = [...all].every((id) => covered.has(id)) ? Gs[0] : null;
    for (const G of Gs) {
      if (G === inPlace) continue;
      const move = new Set(G.elems.map((e) => e.id));
      // A relationship that would lose only some of its objects while it
      // relates other sets too would take those sets from them: left alone.
      const partialMulti = h.rels.some((r) => r.multi && r.objs.some((o) => move.has(o)) && !r.objs.every((o) => move.has(o)));
      if (partialMulti) { skipped.push(G); continue; }
      const rec = recs.get(pid);
      const args = rec.args.slice();
      args[at(P.type, "GlobalId")] = guid();
      args[at(P.type, listAttr(P.type))] = listText([...keptRefs(P, G), ...propRefs(G)]);
      const copy = add(`${rec.type}(${args.join(",")})`);
      const re = new RegExp(`#${pid}(?!\\d)`, "g");
      const loose = [];
      for (const r of h.rels) {
        const mine = r.objs.filter((o) => move.has(o));
        if (!mine.length) continue;
        const rr = recs.get(r.rel.id);
        const kd = at(r.rel.type, "RelatingPropertyDefinition");
        if (mine.length === r.objs.length) rr.args[kd] = rr.args[kd].replace(re, copy);
        else {
          const ko = at(r.rel.type, "RelatedObjects");
          rr.args[ko] = listText(listRefs(rr.args[ko]).filter((x) => !move.has(Number(x.slice(1)))));
          loose.push(...mine);
          r.objs = r.objs.filter((o) => !move.has(o));
        }
        changed.add(r.rel.id);
      }
      for (const ty of h.types) if (move.has(ty.id)) {
        const rec2 = recs.get(ty.id);
        const k = at(ty.type, "HasPropertySets");
        rec2.args[k] = rec2.args[k].replace(re, copy);
        changed.add(ty.id);
      }
      if (loose.length) add(`IFCRELDEFINESBYPROPERTIES(${guid()},${ownerRef},$,$,${listText([...new Set(loose)].map((o) => "#" + o))},${copy})`);
      sets.copied++;
      written.push(G);
    }
    if (inPlace) {
      const rec = recs.get(pid);
      rec.args[at(P.type, listAttr(P.type))] = listText([...keptRefs(P, inPlace), ...propRefs(inPlace)]);
      changed.add(pid);
      sets.edited++;
      written.push(inPlace);
    }
  }

  // Attributes left unset, written into the element's own record.
  const attrsDone = [];
  for (const w of attrWrites) {
    const rec = recs.get(w.e.id);
    if (!rec || rec.args.length <= w.attrIndex) { skipped.push({ elems: [w.e], props: [w], why: "its record could not be found in the file's text" }); continue; }
    rec.args[w.attrIndex] = w.valueText;
    changed.add(w.e.id);
    attrsDone.push(w);
  }

  // The new file: edited records in place, new ones before the DATA ENDSEC.
  const spans = [...changed].map((id) => ({ ...recs.get(id), id })).sort((a, b) => a.start - b.start);
  let out = "";
  let p = 0;
  for (const r of spans) { out += text.slice(p, r.start) + `#${r.id}=${r.type}(${r.args.join(",")})`; p = r.end; }
  const endIso = text.lastIndexOf("END-ISO-10303-21");
  const endsec = text.lastIndexOf("ENDSEC", endIso < 0 ? text.length : endIso);
  if (endsec < p) throw new Error("no ENDSEC after the DATA section");
  const lineBreak = text.includes("\r\n") ? "\r\n" : "\n";
  out += text.slice(p, endsec) + (added.length ? added.join(lineBreak) + lineBreak : "") + text.slice(endsec);

  const writtenRows = [];
  for (const G of written) for (const e of G.elems) for (const w of G.props) writtenRows.push({ kind: w.kind, id: e.id, globalId: model.attr(e, "GlobalId"), pset: w.pset, prop: w.prop, value: w.valueText, source: w.source });
  for (const w of attrsDone) writtenRows.push({ kind: "attribute", id: w.e.id, globalId: w.globalId, pset: ATTRIBUTE, prop: w.prop, value: w.valueText, source: w.source });
  const skippedRows = skipped.flatMap((G) => G.elems.flatMap((e) => G.props.map((w) => ({ globalId: w.globalId, id: e.id, type: e.type, name: "", spec: w.spec, pset: w.pset, prop: w.prop, dataType: w.dataType, allowed: "", value: w.text, why: G.why || "its set is shared through a relationship that relates other sets too; not changed" }))));

  // Read the new file back and test each written value with the facets that failed.
  let verified = null, after = null;
  if (opts.verify !== false) {
    const m2 = new Model(out, opts.schemas, { psets: opts.psets });
    m2.measureUnits = model.measureUnits;
    after = checkIds(ids, m2, { ...opts, maxFailed: 0 });
    let ok = 0;
    const bad = [];
    // Every property facet on the element naming the written property, in
    // every specification applying to it: the one that failed, and any other
    // the write could have broken.
    const cache2 = new Map();
    const ctx2 = { typeMap: opts.typeMap || null };
    for (const w of writtenRows) {
      const e = m2.entities.get(w.id);
      const fs = e ? facetsOn(ids, m2, ctx2, e, w.kind === "attribute" ? null : w.pset, w.prop, cache2) : [];
      if (e && fs.length && fs.every(({ facet }) => facetHolds(facet, e, m2))) ok++;
      else bad.push(w);
    }
    verified = { values: writtenRows.length, pass: ok, fail: bad, parseErrors: m2.parseErrors.length };
    // Failing results on the records the fill added: a specification with no
    // class (applying to every entity) checks the new sets and relationships
    // too, as it checks the model's own.
    let addedFailing = 0;
    const added2 = [];
    for (let id = topId + 1; id <= nextId; id++) { const e = m2.entities.get(id); if (e) added2.push(e); }
    for (const [si, spec] of ids.specs.entries()) {
      if (after.specs[si].status !== "fail" || !added2.length) continue;
      let set = cache2.get(si);
      if (!set) cache2.set(si, (set = new Set(applies(spec, m2, ctx2).map((x) => x.id))));
      for (const e of added2) if (set.has(e.id) && (spec.optionality === "prohibited" || !spec.requirements.every((r) => facetHolds(r, e, m2, ctx2)))) addedFailing++;
    }
    after.addedFailing = addedFailing;
  }
  return {
    text: out,
    written: writtenRows.length,
    writtenList: writtenRows,
    elements: new Set(writtenRows.map((w) => w.id)).size,
    fromIds: plan.writes.filter((w) => w.source === "ids").length,
    fromTable: plan.writes.filter((w) => w.source === "table").length,
    fromModel: plan.writes.filter((w) => w.source === "model").length,
    fromGeometry: plan.writes.filter((w) => w.source === "geometry").length,
    kinds: writtenRows.reduce((o, w) => ((o[w.kind] = (o[w.kind] || 0) + 1), o), {}),
    sets,
    added: added.length,
    editedRecords: changed.size,
    unfilled: [...plan.unfilled, ...skippedRows],
    notWritten: plan.notWritten,
    verified,
    before: { failing: reportFailing(plan.report), pass: plan.report.pass },
    after: after ? { failing: reportFailing(after), pass: after.pass, addedRecords: after.addedFailing } : null,
  };
}

// ------------------------------------------------------- to-fill table ----

export const FILL_COLUMNS = ["GlobalId", "Class", "Name", "PropertySet", "Property", "DataType", "Allowed", "Value", "Specification", "Why"];

// The rows the fill could not write, as a CSV a person fills in (Value) and
// hands back with --values. One row per element and property. rowsToCsv
// (sheet.mjs) carries the CSV formula-injection guard: a cell a spreadsheet
// would run as a formula (=, +, @, tab, CR, or - before a non-number) gets a
// leading backslash, which readValues takes off again.
export function toFillCsv(unfilled) {
  const seen = new Set();
  const rows = [FILL_COLUMNS];
  for (const u of unfilled) {
    const k = `${u.globalId}\0${u.pset}\0${u.prop}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push([u.globalId, u.type, u.name, u.pset, u.prop, u.dataType, u.allowed, u.value ?? "", u.spec, u.why]);
  }
  return rowsToCsv(rows);
}

// A filled to-fill table (CSV, any of its separators) back as rows {globalId,
// pset, prop, value}. GlobalId * gives every element in the table that value.
export function readValues(csvText) {
  const rows = csvToRows(csvText);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n.toLowerCase());
  const [g, ps, pr, v] = ["GlobalId", "PropertySet", "Property", "Value"].map(col);
  if ([g, ps, pr, v].some((i) => i < 0)) throw new Error("the table needs GlobalId, PropertySet, Property and Value columns");
  // rowsToCsv wrote a backslash before a cell that a spreadsheet would read
  // as a formula; take it off again.
  const unf = (s) => (/^\\[=+\-@]/.test(s) ? s.slice(1) : s);
  return rows.slice(1).filter((r) => r.length > v && r[v] !== "").map((r) => ({ globalId: r[g].trim(), pset: r[ps].trim(), prop: r[pr].trim(), value: unf(r[v]) }));
}

// A few lines on what the fill did, for the command line.
export function fillReport(r) {
  const out = [];
  const n = (x) => x.toLocaleString("en-US");
  out.push(`wrote ${n(r.written)} value(s) on ${n(r.elements)} element(s): ${n(r.fromIds)} the IDS fixes, ${n(r.fromTable)} from the table${r.fromModel ? `, ${n(r.fromModel)} copied from the element's own other quantity sets` : ""}${r.fromGeometry ? `, ${n(r.fromGeometry)} measured from the element's geometry` : ""}`);
  const k = r.kinds || {};
  if (k.quantity || k.attribute) out.push(`of them: ${n(k.property || 0)} propert${k.property === 1 ? "y" : "ies"}, ${n(k.quantity || 0)} quantit${k.quantity === 1 ? "y" : "ies"}, ${n(k.attribute || 0)} attribute(s)`);
  out.push(`property and quantity sets: ${r.sets.edited} edited, ${r.sets.copied} copied for the elements that differ, ${r.sets.added} added; ${r.editedRecords} record(s) changed, ${r.added} added, every other line as it was`);
  if (r.verified) out.push(`read back: ${n(r.verified.pass)} of ${n(r.verified.values)} written value(s) now pass the facet that failed${r.verified.parseErrors ? `; ${r.verified.parseErrors} read error(s)` : ""}`);
  if (r.after) out.push(`failing elements: ${n(r.before.failing)} before, ${n(r.after.failing)} after${r.after.addedRecords ? ` (${n(r.after.addedRecords)} of them the new property sets and relationships themselves, checked by a specification that applies to every entity, as the model's own are)` : ""}`);
  const kinds = Object.entries(r.notWritten);
  if (kinds.length) out.push(`not written (not property, quantity or attribute values): ${kinds.map(([k, v]) => `${n(v)} ${k}`).join(", ")}`);
  if (r.unfilled.length) {
    const why = new Map();
    for (const u of r.unfilled) why.set(u.why, (why.get(u.why) || 0) + 1);
    out.push(`left for a person: ${n(r.unfilled.length)} value(s)`);
    for (const [w, c] of [...why].sort((a, b) => b[1] - a[1]).slice(0, 8)) out.push(`  ${n(c)}: ${w}`);
  }
  return out.join("\n");
}
