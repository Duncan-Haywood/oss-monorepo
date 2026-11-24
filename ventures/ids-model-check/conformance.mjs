// Does a STEP model follow its own IFC schema? The faults an IDS check reads
// past without a word: a record with the wrong number of attributes (every
// value after the gap is read from the wrong slot), a typed value whose type
// the schema lacks or that its select does not allow, an untyped number where
// a select needs a type, a label holding a number, an enumeration value the
// schema does not list, `*` and `$` swapped, a reference to the wrong class,
// a NaN, a short FILE_NAME header, and three rules the schema files here do
// not carry (IfcApplication's two UNIQUE rules; IFC2X3's IfcGroup grouped by
// exactly one IfcRelAssignsToGroup).
//
// Measured on IfcOpenShell's labelled broken files
// (test/fixtures/validate: 25 fail-*, 13 pass-*) and set beside
// ifcopenshell.validate on the public corpora:
// eval/conformance-2026-11-24.md.
//
// conformance(text, schemas) -> { schema, records, findings: [{ code, id, type, attr, message }], groups }
//   text: the STEP file (string or bytes); schemas: { IFC2X3, IFC4, IFC4X3 } as Schema or JSON.
//   groups: findings folded by (code, type, attr) with a count and the first id,
//   so a 100,000-record export with one systematic fault prints one line.
// Duplicate GlobalIds and classes outside the schema are reported by ids.mjs
// already (duplicateGlobalIds, Model reader notes) and are not repeated here.

import { parseStep, readStepArgs } from "./step.mjs";
import { Schema } from "./ids.mjs";

const PRIM = { REAL: "real", NUMBER: "real", INTEGER: "integer", STRING: "string", BOOLEAN: "boolean", LOGICAL: "logical", BINARY: "binary" };

function kindOf(v) {
  if (v === null) return "$";
  if (v === true || v === false) return "boolean";
  if (typeof v === "number") return Number.isNaN(v) ? "NaN" : "number";
  if (typeof v === "string") return "string";
  if (Array.isArray(v)) return "list";
  if (v && typeof v === "object") {
    if (v.derived) return "*";
    if ("ref" in v) return "ref";
    if ("enum" in v) return "enum";
    if (v.unknown) return "unknown";
    if ("typed" in v) return "typed";
    if ("binary" in v) return "binary";
  }
  return "other";
}
const show = (v) => {
  const k = kindOf(v);
  if (k === "string") return `'${v.length > 30 ? v.slice(0, 30) + "..." : v}'`;
  if (k === "number") return String(v);
  if (k === "enum") return `.${v.enum}.`;
  if (k === "boolean") return v ? ".T." : ".F.";
  if (k === "ref") return `#${v.ref}`;
  if (k === "typed") return `${v.typed}(${Array.isArray(v.value) && !v.value.length ? "" : show(v.value)})`;
  if (k === "list") return v.length ? "(...)" : "()";
  return k;
};
const a = (w) => (/^(IFC|[AEIOU])/i.test(w) ? "an" : "a");

export function conformance(text, schemas) {
  const p = parseStep(text, { eager: true });
  const raw = (p.schema || "").toUpperCase();
  const id = raw.startsWith("IFC4X3") ? "IFC4X3" : raw.startsWith("IFC4") ? "IFC4" : raw.startsWith("IFC2X3") ? "IFC2X3" : raw;
  if (!schemas[id]) throw new Error(`IFC schema ${raw || "(none)"} is not supported (IFC2X3, IFC4, IFC4X3)`);
  const S = schemas[id] instanceof Schema ? schemas[id] : new Schema(schemas[id]);
  const E = p.entities;
  const findings = [];
  const add = (code, e, attr, message) => findings.push({ code, id: e ? e.id : null, type: e ? e.type : null, attr: attr || null, message });

  // Members of a select, expanded through nested selects: entity classes and
  // the named (defined, enum, aggregate) types a typed value may carry.
  const selCache = new Map();
  const members = (t) => {
    let m = selCache.get(t);
    if (m) return m;
    m = { entities: [], named: new Set() };
    selCache.set(t, m);
    const walk = (x, seen) => {
      if (seen.has(x)) return;
      seen.add(x);
      if (S.entities[x]) { m.entities.push(x); return; }
      const d = S.types[x];
      if (!d) return;
      if (d.kind === "select") for (const y of d.members) walk(y, seen);
      else m.named.add(x);
    };
    for (const y of S.types[t].members) walk(y, new Set());
    return m;
  };

  // The problem with value v in a slot of type t (not an aggregate slot), or
  // null. inSelect: v came out of a typed value, so it must be bare.
  function check(t, v, ctx) {
    const k = kindOf(v);
    if (k === "NaN") return { code: "nan", msg: `NaN where ${t} needs a number (ISO 10303-21 has no NaN)` };
    if (PRIM[t]) return prim(PRIM[t], t, v, k);
    if (S.entities[t]) {
      if (k !== "ref") return { code: "expected-reference", msg: `${show(v)} where a reference to ${a(t)} ${t} belongs` };
      return refTo(v, [t]);
    }
    const d = S.types[t];
    if (!d) return null; // a type the schema files do not carry: nothing to say
    if (d.kind === "enum") {
      if (k !== "enum" && k !== "boolean" && k !== "unknown") return { code: "wrong-literal", msg: `${show(v)} where the enumeration ${t} belongs` };
      const word = k === "enum" ? v.enum : k === "boolean" ? (v ? "T" : "F") : "U";
      if (!d.values.includes(word)) return { code: "bad-enum", msg: `.${word}. is not a value of ${t} (${d.values.slice(0, 6).map((x) => "." + x + ".").join(", ")}${d.values.length > 6 ? ", ..." : ""})` };
      return null;
    }
    if (d.kind === "select") {
      const m = members(t);
      if (k === "ref") return refTo(v, m.entities, t);
      if (k === "typed") {
        const name = v.typed;
        if (!S.types[name] && !S.entities[name] && !PRIM[name]) return { code: "typed-unknown-type", msg: `${show(v)}: ${name} is not ${a(raw)} ${raw} type, so the value has no type to be read by` };
        if (!m.named.has(name)) return { code: "typed-not-in-select", msg: `${show(v)}: ${name} is not one of the types ${t} allows` };
        const inner = v.value;
        if (Array.isArray(inner) && !inner.length && S.types[name] && S.types[name].kind !== "aggregate") return { code: "typed-empty", msg: `${name}() with no value inside` };
        if (kindOf(inner) === "typed") return { code: "typed-in-simple", msg: `${show(v)}: a typed value nested in a typed value` };
        return check(name, inner, ctx);
      }
      if (k === "$" || k === "*") return null;
      return { code: "untyped-in-select", msg: `${show(v)} with no type where ${t} (a select) needs one, e.g. ${kindOf(v) === "string" ? "IFCLABEL" : "IFCREAL"}(${show(v)}) or the measure it is: a reader cannot tell which measure it is` };
    }
    if (d.kind === "defined") {
      if (k === "typed") return { code: "typed-in-simple", msg: `${show(v)} where ${t} takes a bare value (a type name is written only inside a select)` };
      return check(d.of, v, ctx);
    }
    if (d.kind === "aggregate") {
      if (k !== "list") return { code: "expected-list", msg: `${show(v)} where ${t} (a list) belongs` };
      for (const x of v) { const r = check(d.of, x, ctx); if (r) return r; }
      return null;
    }
    return null;
  }
  function prim(want, t, v, k) {
    const ok = want === "real" ? k === "number"
      : want === "integer" ? k === "number" && Number.isInteger(v)
      : want === "string" ? k === "string"
      : want === "boolean" ? k === "boolean"
      : want === "logical" ? k === "boolean" || k === "unknown"
      : want === "binary" ? k === "binary" : true;
    if (ok) return null;
    if (k === "list" && !v.length) return { code: "typed-empty", msg: `an empty value where ${t} needs ${want === "string" ? "a string" : "a " + want}` };
    return { code: "wrong-literal", msg: `${show(v)} where ${want === "string" ? "a string" : want === "real" ? "a number" : want === "integer" ? "an integer" : "a " + want} belongs` };
  }
  function refTo(v, allowed, via) {
    const target = E.get(v.ref);
    if (!target) return { code: "dangling-reference", msg: `#${v.ref} is not in the file` };
    if (!S.has(target.type)) return { code: "reference-outside-schema", msg: `#${v.ref} is ${a(target.type)} ${target.type}, a class ${raw} does not have` };
    if (!allowed.some((t) => S.isA(target.type, t))) return { code: "reference-wrong-class", msg: `#${v.ref} is ${a(target.type)} ${target.type}; ${via ? `${via} allows ` : ""}${allowed.length > 4 ? allowed.slice(0, 4).join(", ") + ", ..." : allowed.join(" or ")}${via ? "" : " is required"}` };
    return null;
  }

  // A draft schema is read as the released one its name starts with
  // (IFC4X3_RC1-RC4 as IFC4X3_ADD2; IFC4X1 and IFC4X2, the alignment and
  // bridge drafts, as IFC4), whose classes and enumerations moved since: say
  // so first, so the faults below are read as that (web-ifc's
  // ifcbridge-model01.ifc is IFC4X2).
  const draft = /^IFC4X3_RC/.test(raw) ? "IFC4X3_ADD2" : /^IFC4X[12]\b/.test(raw) ? "IFC4" : null;
  if (draft) findings.push({ code: "draft-schema", id: null, type: null, attr: null, message: `the file declares ${raw}, a draft schema; it is read as ${draft}, so the classes, attribute counts and enumeration values below may be the draft's own (re-export as ${draft === "IFC4" ? "IFC4 or IFC4X3_ADD2" : draft}). IfcOpenShell does not open it` });

  // Records.
  let records = 0;
  const apps = [];
  const groupRels = new Map();
  for (const e of E.values()) {
    records++;
    if (!S.has(e.type)) continue; // ids.mjs Model notes these already
    const attrs = S.attrs(e.type);
    if (S.entities[e.type].abstract) add("abstract-class", e, null, `#${e.id}: ${e.type} is abstract in ${raw} and cannot be a record of its own; an IDS entity facet on it matches nothing that is written properly`);
    if (e.args.length !== attrs.length) {
      add("attribute-count", e, null, `#${e.id}: ${e.type} has ${e.args.length} attribute${e.args.length === 1 ? "" : "s"}, ${a(raw)} ${raw} ${S.entities[e.type].name} has ${attrs.length}. Values are read by position, so an IDS attribute facet may test the wrong one; ifcopenshell.validate rejects the record`);
      continue;
    }
    for (let i = 0; i < attrs.length; i++) {
      const at = attrs[i], v = e.args[i], k = kindOf(v);
      if (at.derived) {
        if (k !== "*") add(k === "$" ? "unset-derived" : "value-in-derived", e, at.name, `#${e.id}: ${e.type}.${at.name} is derived in ${raw} and must be written *, not ${show(v)}`);
        continue;
      }
      if (k === "*") { add("derived-in-explicit", e, at.name, `#${e.id}: ${e.type}.${at.name} is written * but is not derived in ${raw}; ${at.optional ? "write $ to leave it unset" : "it needs a value"}`); continue; }
      if (k === "$") {
        if (!at.optional) add("required-unset", e, at.name, `#${e.id}: ${e.type}.${at.name} is required in ${raw} and is unset ($)`);
        continue;
      }
      let r = null;
      if (at.aggregate) {
        if (k !== "list") r = { code: "expected-list", msg: `${show(v)} where a list of ${at.type} belongs` };
        else if (at.min && v.length < at.min) r = { code: "list-too-short", msg: `${v.length ? `${v.length} item${v.length === 1 ? "" : "s"}` : "an empty list ()"} where ${raw} needs at least ${at.min}${at.optional ? " (write $ to leave it unset)" : ""}` };
        else {
          const depth = 1 + (at.inner ? at.inner.length : 0);
          const walk = (x, d) => {
            if (d > 1) {
              for (const y of x) {
                if (kindOf(y) !== "list") return { code: "expected-list", msg: `${show(y)} where a nested list belongs` };
                const size = at.inner[at.inner.length - d + 1];
                if (size && y.length !== size) return { code: "inner-list-size", msg: `an inner list of ${y.length} where ${raw} fixes ${size} (e.g. 3D points in a 2D list)` };
                const q = walk(y, d - 1); if (q) return q;
              }
              return null;
            }
            for (const y of x) { const q = kindOf(y) === "$" ? null : check(at.type, y); if (q) return q; }
            return null;
          };
          r = walk(v, depth);
        }
      } else r = check(at.type, v);
      if (r) add(r.code, e, at.name, `#${e.id}: ${e.type}.${at.name}: ${r.msg}`);
    }
    if (e.type === "IFCAPPLICATION") apps.push(e);
    if (e.type === "IFCRELASSIGNSTOGROUP" || S.isA(e.type, "IFCRELASSIGNSTOGROUP")) {
      const g = e.args[attrs.findIndex((x) => x.name === "RelatingGroup")];
      if (g && g.ref !== undefined) groupRels.set(g.ref, (groupRels.get(g.ref) || 0) + 1);
    }
  }
  for (const err of p.errors) {
    const m = /^#(\d+): (.*)$/.exec(err);
    const rid = m ? Number(m[1]) : null;
    const rec = rid !== null ? recordText(text, rid) : "";
    const nan = /[(,]\s*-?(nan|inf|infinity)\.?\s*[,)]/i.exec(rec);
    findings.push({ code: nan ? "nan" : "unreadable-record", id: rid, type: (/=\s*([A-Za-z0-9_]+)/.exec(rec) || [])[1]?.toUpperCase() || null, attr: null,
      message: nan ? `#${rid}: ${nan[1]} is not a number ISO 10303-21 can write, so the record is not read at all (and an IDS check never sees it)` : `${err} (the record is not read, so an IDS check never sees it)` });
  }

  // UNIQUE rules on IfcApplication (UR1 ApplicationIdentifier; UR2
  // ApplicationFullName with Version), in all three schemas.
  const ix = (n) => S.attrs("IFCAPPLICATION").index.get(n);
  for (const [rule, keys] of [["ApplicationIdentifier", ["ApplicationIdentifier"]], ["ApplicationFullName and Version", ["ApplicationFullName", "Version"]]]) {
    const seen = new Map();
    for (const e of apps) {
      const key = JSON.stringify(keys.map((n) => e.args[ix(n)]));
      if (seen.has(key)) add("duplicate-application", e, keys.join("+"), `#${e.id}: IFCAPPLICATION repeats #${seen.get(key)}'s ${rule} (${keys.map((n) => show(e.args[ix(n)])).join(", ")}); ${raw} requires it unique, so OwnerHistory cannot say which tool wrote what`);
      else seen.set(key, e.id);
    }
  }
  // IFC2X3 IfcGroup: INVERSE IsGroupedBy : IfcRelAssignsToGroup FOR RelatingGroup (exactly one).
  if (id === "IFC2X3") {
    for (const e of E.values()) {
      if (!S.has(e.type) || !S.isA(e.type, "IFCGROUP")) continue;
      const n = groupRels.get(e.id) || 0;
      if (n !== 1) add("group-assignments", e, "IsGroupedBy", `#${e.id}: ${e.type} is the RelatingGroup of ${n} IfcRelAssignsToGroup; IFC2X3 needs exactly one${n ? " (merge them into one relationship)" : " (an empty group: give it its members, or drop it)"}`);
    }
  }
  for (const h of header(text)) findings.push({ code: h.code, id: null, type: h.record, attr: null, message: h.message });

  const groups = new Map();
  for (const f of findings) {
    const key = `${f.code}|${f.type}|${f.attr}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { code: f.code, type: f.type, attr: f.attr, count: 1, first: f.id, message: f.message });
  }
  return { schema: raw, records, findings, groups: [...groups.values()] };
}

function recordText(text, rid) {
  const t = typeof text === "string" ? text : new TextDecoder().decode(text);
  const m = new RegExp(`#${rid}\\s*=[^;]*;`).exec(t);
  return m ? m[0] : "";
}

// The three header records ISO 10303-21 requires, against their fixed
// shapes: FILE_DESCRIPTION(LIST OF STRING, STRING), FILE_NAME(STRING,
// STRING, LIST OF STRING, LIST OF STRING, STRING, STRING, STRING),
// FILE_SCHEMA(LIST OF STRING).
const HEADER = {
  FILE_DESCRIPTION: [["description", "list"], ["implementation_level", "string"]],
  FILE_NAME: [["name", "string"], ["time_stamp", "string"], ["author", "list"], ["organization", "list"], ["preprocessor_version", "string"], ["originating_system", "string"], ["authorization", "string"]],
  FILE_SCHEMA: [["schema_identifiers", "list"]],
};
export function header(text) {
  const t = typeof text === "string" ? text : new TextDecoder().decode(text.subarray(0, Math.min(text.length, 1 << 16)));
  const h0 = t.search(/\bHEADER\s*;/), h1 = t.search(/\bENDSEC\s*;/);
  const out = [];
  if (h0 < 0 || h1 < h0) return [{ code: "header-missing", record: null, message: "no HEADER section" }];
  const body = t.slice(h0, h1);
  for (const [rec, shape] of Object.entries(HEADER)) {
    const m = new RegExp(`\\b${rec}\\s*\\(`).exec(body);
    if (!m) { out.push({ code: "header-missing", record: rec, message: `the header has no ${rec}` }); continue; }
    let args;
    try { args = readStepArgs(body, m.index + m[0].length - 1); }
    catch (e) { out.push({ code: "header-unreadable", record: rec, message: `${rec} is not readable: ${e.message}` }); continue; }
    if (args.length !== shape.length) { out.push({ code: "header-count", record: rec, message: `${rec} has ${args.length} fields, ISO 10303-21 gives it ${shape.length} (${shape.map((s) => s[0]).join(", ")})` }); continue; }
    shape.forEach(([name, want], i) => {
      const v = args[i], k = kindOf(v);
      if (want === "string" && k !== "string") out.push({ code: "header-type", record: rec, message: `${rec} ${name} is ${show(v)}, not a string${k === "$" ? " ('' for none)" : ""}` });
      if (want === "list" && (k !== "list" || v.some((x) => kindOf(x) !== "string"))) out.push({ code: "header-type", record: rec, message: `${rec} ${name} is ${k === "list" ? "a list holding " + v.filter((x) => kindOf(x) !== "string").map(show).join(", ") : show(v)}, not a list of strings${k === "$" ? " (('') for none)" : ""}` });
      else if (want === "list" && !v.length) out.push({ code: "header-empty-list", record: rec, message: `${rec} ${name} is an empty list (); ISO 10303-21 needs at least one string, ('') for none` });
    });
  }
  return out;
}

// One line per (code, class, attribute) group, most frequent first, for the
// CLI and the text report.
export function conformanceText(r, { max = 50 } = {}) {
  const gs = [...r.groups].sort((x, y) => y.count - x.count);
  if (!gs.length) return `${r.schema}: ${r.records.toLocaleString("en-US")} records, every one follows the schema as far as this checks (attribute counts, types, enumerations, derived slots, references, header, IfcApplication and IFC2X3 group rules)\n`;
  const out = [`${r.schema}: ${r.findings.length.toLocaleString("en-US")} schema fault(s) in ${gs.length} kind(s) across ${r.records.toLocaleString("en-US")} records`];
  for (const g of gs.slice(0, max)) out.push(`${g.count > 1 ? `${g.count.toLocaleString("en-US")} x ` : ""}${g.message}${g.count > 1 ? " (first shown)" : ""}`);
  if (gs.length > max) out.push(`and ${gs.length - max} more kind(s): --json lists every finding`);
  return out.join("\n") + "\n";
}

// The page's summary: the groups, capped, and the totals (worker.mjs).
export function conformanceSummary(r, cap = 200) {
  const gs = [...r.groups].sort((x, y) => y.count - x.count);
  return { schema: r.schema, records: r.records, total: r.findings.length, groups: gs.slice(0, cap), more: Math.max(0, gs.length - cap) };
}
