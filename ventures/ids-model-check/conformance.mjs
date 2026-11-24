// Does a STEP model follow its own IFC schema? The faults an IDS check reads
// past without a word: a record with the wrong number of attributes (every
// value after the gap is read from the wrong slot), a typed value whose type
// the schema lacks or that its select does not allow, an untyped number where
// a select needs a type, a label holding a number, an enumeration value the
// schema does not list, `*` and `$` swapped, a reference to the wrong class,
// a NaN, a short FILE_NAME header, IfcApplication's two UNIQUE rules, and
// inverse cardinalities (how many records point at each one through the
// attribute an INVERSE names, against its bounds: eval/inverse-counts-2026-11-24.md)
// and, given the rules JSON, the schema's WHERE rules, DERIVE attributes,
// functions and global RULEs (where-rules.mjs: eval/where-rules-2026-11-24.md).
//
// Measured on IfcOpenShell's labelled broken files
// (test/fixtures/validate: 25 fail-*, 13 pass-*) and set beside
// ifcopenshell.validate on the public corpora:
// eval/conformance-2026-11-24.md.
//
// conformance(text, schemas, { rules }) -> { schema, records, findings: [{ code, id, type, attr, message }], groups, whereStats }
//   text: the STEP file (string or bytes); schemas: { IFC2X3, IFC4, IFC4X3 } as Schema or JSON;
//   rules (optional): { IFC2X3, IFC4, IFC4X3 } as schema/rules-*.json, to run the WHERE rules.
//   groups: findings folded by (code, type, attr) with a count and the first id,
//   so a 100,000-record export with one systematic fault prints one line.
// Duplicate GlobalIds and classes outside the schema are reported by ids.mjs
// already (duplicateGlobalIds, Model reader notes) and are not repeated here.

import { parseStep, readStepArgs } from "./step.mjs";
import { Schema } from "./ids.mjs";
import { whereRules } from "./where-rules.mjs";

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

export function conformance(text, schemas, { rules = null } = {}) {
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
  // Inverse cardinalities: how many records point at each one through the
  // relationship attribute an INVERSE names, against its bounds other than
  // [0:?] (schema/*.json inverseBounds; a bare "Name : IfcRelX FOR Attr" is
  // exactly one). IFC2X3's IfcGroup.IsGroupedBy keeps its own code.
  const invCache = new Map();
  const invOf = (type) => {
    let list = invCache.get(type);
    if (list) return list;
    list = [];
    const seen = new Set();
    for (let t = type; t && S.entities[t]; t = S.entities[t].super) {
      const en = S.entities[t];
      for (const [name, [ent, attr]] of Object.entries(en.inverseFor || {})) {
        if (seen.has(name)) continue; // a subtype's redeclaration wins
        seen.add(name);
        const b = en.inverseBounds && en.inverseBounds[name];
        if (b) list.push({ name, ent, attr, min: b[0], max: b[1], bag: !!b[2], entName: (S.entities[ent] || {}).name || ent });
      }
    }
    invCache.set(type, list);
    return list;
  };
  const wanted = new Map(); // attr -> Set of relationship classes
  for (const e of E.values()) if (S.has(e.type)) for (const iv of invOf(e.type)) {
    if (!wanted.has(iv.attr)) wanted.set(iv.attr, new Set());
    wanted.get(iv.attr).add(iv.ent);
  }
  const pointers = new Map(); // "target|ent|attr" -> [record ids], a record once per reference
  const outside = new Map(); // record id -> the first record of a class outside the schema pointing at it
  if (wanted.size) {
    const refsIn = (v, out) => { if (Array.isArray(v)) for (const x of v) refsIn(x, out); else if (v && typeof v === "object" && "ref" in v) out.push(v.ref); return out; };
    // Per class, the (slot, relationship class, attribute) triples it can
    // point through, worked out once: most classes have none.
    const slots = new Map();
    const slotsOf = (type) => {
      let l = slots.get(type);
      if (l) return l;
      l = [];
      const ats = S.attrs(type);
      for (const [attr, ents] of wanted) {
        const i = ats.index.get(attr);
        if (i !== undefined) for (const ent of ents) if (S.isA(type, ent)) l.push([i, ent, attr]);
      }
      slots.set(type, l);
      return l;
    };
    for (const r of E.values()) {
      if (!S.has(r.type)) { for (const t of refsIn(r.args, [])) if (!outside.has(t)) outside.set(t, r); continue; }
      // A record with the wrong attribute count is read by position, as
      // ifcopenshell.validate reads it (it is flagged above already).
      for (const [i, ent, attr] of slotsOf(r.type)) {
        if (i >= r.args.length) continue;
        for (const target of refsIn(r.args[i], [])) {
          const key = `${target}|${ent}|${attr}`;
          let list = pointers.get(key);
          if (!list) pointers.set(key, (list = []));
          list.push(r.id);
        }
      }
    }
  }
  const range = (iv) => `[${iv.min}:${iv.max === null ? "?" : iv.max}]`;
  for (const e of E.values()) {
    if (!S.has(e.type)) continue;
    for (const iv of invOf(e.type)) {
      const list = pointers.get(`${e.id}|${iv.ent}|${iv.attr}`) || [];
      const distinct = [...new Set(list)];
      const n = iv.bag ? list.length : distinct.length;
      if (n >= iv.min && (iv.max === null || n <= iv.max)) continue;
      const by = distinct.slice(0, 3).map((x) => "#" + x).join(", ") + (distinct.length > 3 ? ", ..." : "") + (distinct.length < n ? ` (${distinct.length < 2 ? "one record" : distinct.length + " records"} listing it ${n} times)` : "");
      if (id === "IFC2X3" && iv.name === "IsGroupedBy") {
        add("group-assignments", e, "IsGroupedBy", `#${e.id}: ${e.type} is the RelatingGroup of ${n} IfcRelAssignsToGroup; IFC2X3 needs exactly one${n ? " (merge them into one relationship)" : " (an empty group: give it its members, or drop it)"}`);
        continue;
      }
      // ifcopenshell.validate counts these too. When a record of a class the
      // schema lacks points here (IFC4X3's IFCBEAMSTANDARDCASE, an IFC4X2
      // bridge part), that is the likelier cause: say so.
      const o = outside.get(e.id);
      const msg = o ? `${inverseMessage(e, iv, n, by, raw, range(iv)).split(". ")[0]}. #${o.id}, ${a(o.type)} ${o.type}, also points here, but ${raw} has no such class, so it is not counted: give that record a ${raw} class and this goes` : inverseMessage(e, iv, n, by, raw, range(iv));
      add("inverse-count", e, iv.name, `#${e.id}: ${msg}`);
    }
  }
  for (const h of header(text)) findings.push({ code: h.code, id: null, type: h.record, attr: null, message: h.message });
  // The schema's own WHERE rules (where-rules.mjs), when their JSON is given.
  let whereStats = null;
  if (rules && rules[id]) {
    const w = whereRules(p, S, rules[id]);
    findings.push(...w.findings);
    whereStats = w.stats;
    const o = contextOrigins(p, S, rules[id], w.findings);
    if (o) findings.push(o);
  }
  const elementRules = whereStats ? ruleLinks(E, S, findings) : null;

  const groups = new Map();
  for (const f of findings) {
    const key = `${f.code}|${f.type}|${f.attr}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { code: f.code, type: f.type, attr: f.attr, count: 1, first: f.id, message: f.message });
  }
  return { schema: raw, records, findings, groups: [...groups.values()], whereStats, elementRules };
}

// IFC2X3's and IFC4's IfcSameAxis2Placement ends with
// IfcSameCartesianPoint(ap1.Location, ap1.Location, ...): it compares the first
// placement's origin with itself, so IfcRepresentationContextSameWCS never sees
// two contexts whose origins differ (IFC4X3 reads ap2.Location). Run the global
// rule once more with the comparison IFC4X3 makes, and say so if only that
// fails (eval/where-rules-global-seeds-2026-11-24.md).
const SELF_POINT = /IfcSameCartesianPoint\s*\(\s*ap1\.Location\s*,\s*ap1\.Location/i;
const fixedRules = new WeakMap();
function contextOrigins(p, S, R, found) {
  const fn = R.functions && R.functions.IFCSAMEAXIS2PLACEMENT;
  const rule = (R.rules || []).find((r) => r.name === "IfcRepresentationContextSameWCS");
  if (!fn || !rule || !SELF_POINT.test(fn)) return null;
  if (found.some((f) => f.attr === rule.name)) return null;
  let F = fixedRules.get(R);
  if (!F) {
    // Only the derived attributes (a subcontext's WCS, a placement's P) and the
    // functions: no WHERE rule but this one runs.
    const entities = {};
    for (const [k, v] of Object.entries(R.entities)) { const { where, ...rest } = v; entities[k] = rest; }
    F = { ...R, entities, types: {}, rules: [rule], functions: { ...R.functions, IFCSAMEAXIS2PLACEMENT: fn.replace(SELF_POINT, "IfcSameCartesianPoint(ap1.Location, ap2.Location") } };
    fixedRules.set(R, F);
  }
  const w = whereRules(p, S, F);
  if (!w.findings.some((f) => f.attr === rule.name)) return null;
  const ctx = [...p.entities.values()].filter((e) => e.type === "IFCGEOMETRICREPRESENTATIONCONTEXT").map((e) => "#" + e.id);
  return { code: "context-origin", id: null, type: null, attr: "IfcRepresentationContextSameWCS", message: `the representation contexts (${ctx.slice(0, 4).join(", ")}${ctx.length > 4 ? ", ..." : ""}) do not share one world origin, so geometry in one sits offset from geometry in another. ${R.schema}'s own rule IfcRepresentationContextSameWCS cannot see this (its IfcSameAxis2Placement compares the first placement's Location with itself; IFC4X3 fixed it), so this is the check IFC4X3 makes` };
}

// The WHERE rules an IDS facet leans on, tied to the element they change the
// answer for (NEXT.md, "An IDS-side cross-reference"): the element's own
// PredefinedType and type rules, its type object's PredefinedType rule, two
// property sets of one name on it or on its type, and a set defining it that
// names one property twice. Seeded per family in eval/where-rules-seeded-2026-11-24.md.
const IDS_RULES = {
  CorrectPredefinedType: "PredefinedType is USERDEFINED with no name for it, so a predefinedType facet's answer depends on the tool",
  CorrectTypeAssigned: "its type is another class's type, so the properties it inherits are not its own class's",
  UniquePropertySetNames: "two property sets of one name, so a property facet may read either",
  UniquePropertyNames: "one property named twice in a set, so a property facet may read either value",
};
const ruleLabel = (attr) => { const l = String(attr || "").split(".").pop(); return l === "WR32" ? "UniquePropertyNames" : l; };
function ruleLinks(E, S, findings) {
  const byRecord = new Map();
  for (const f of findings) {
    if (f.code !== "where-rule" || f.id === null) continue;
    let label = ruleLabel(f.attr);
    // IFC2X3 names the duplicate-property rule IfcPropertySet.WR32.
    if (label === "UniquePropertyNames" && !/PROPERTYSET\./i.test(f.attr)) continue;
    if (!IDS_RULES[label]) continue;
    if (!byRecord.has(f.id)) byRecord.set(f.id, []);
    byRecord.get(f.id).push({ rule: f.attr, why: IDS_RULES[label] });
  }
  const out = new Map();
  if (!byRecord.size) return out;
  const put = (el, note) => { if (!out.has(el)) out.set(el, []); const l = out.get(el); if (!l.some((x) => x.rule === note.rule && x.via === note.via)) l.push(note); };
  for (const [id, l] of byRecord) for (const n of l) put(id, n);
  const refs = (v) => (Array.isArray(v) ? v.flatMap(refs) : v && typeof v === "object" && "ref" in v ? [v.ref] : []);
  const at = (r, name) => { const i = S.attrs(r.type).index.get(name); return i === undefined ? undefined : r.args[i]; };
  const typePsets = new Map(); // pset id -> type ids holding it
  for (const r of E.values()) {
    if (!S.has(r.type)) continue;
    if (S.isA(r.type, "IFCTYPEOBJECT")) for (const ps of refs(at(r, "HasPropertySets"))) { if (!typePsets.has(ps)) typePsets.set(ps, []); typePsets.get(ps).push(r.id); }
  }
  const via = (rec, what) => `${what} #${rec.id} ${rec.type}`;
  for (const r of E.values()) {
    if (!S.has(r.type)) continue;
    if (S.isA(r.type, "IFCRELDEFINESBYTYPE")) {
      const t = refs(at(r, "RelatingType"))[0];
      const notes = byRecord.get(t);
      if (notes) for (const o of refs(at(r, "RelatedObjects"))) for (const n of notes) put(o, { ...n, via: via(E.get(t), "its type") });
      const tr = E.get(t);
      // A pset on the type that names a property twice reaches its occurrences too.
      if (tr) for (const ps of refs(at(tr, "HasPropertySets"))) for (const n of byRecord.get(ps) || []) for (const o of refs(at(r, "RelatedObjects"))) put(o, { ...n, via: via(E.get(ps), "its type's property set") });
    } else if (S.isA(r.type, "IFCRELDEFINESBYPROPERTIES")) {
      for (const ps of refs(at(r, "RelatingPropertyDefinition"))) for (const n of byRecord.get(ps) || []) for (const o of refs(at(r, "RelatedObjects"))) put(o, { ...n, via: via(E.get(ps), "its property set") });
    }
  }
  return out;
}

// Adds to each failing row of a checkIds() report the WHERE rules the model
// itself breaks on that element (ruleLinks above), as modelRules: strings.
export function markModelRules(report, conf) {
  const m = conf && conf.elementRules;
  if (!m || !m.size) return 0;
  let n = 0;
  for (const s of report.specs || []) for (const f of s.failed || []) {
    const l = m.get(f.id);
    if (!l) continue;
    f.modelRules = l.map((x) => `the model breaks ${x.rule}${x.via ? ` on ${x.via}` : ""}: ${x.why}`);
    n++;
  }
  return n;
}

function recordText(text, rid) {
  const t = typeof text === "string" ? text : new TextDecoder().decode(text);
  const m = new RegExp(`#${rid}\\s*=[^;]*;`).exec(t);
  return m ? m[0] : "";
}

// What an inverse count outside its bounds means, in words, for the cases
// the public files hold most (eval/inverse-counts-2026-11-24.md); the rest
// get the bare count. None of these moves a value an IDS check reads, apart
// from the [0:1] links a partOf facet follows (ContainedInStructure,
// Decomposes, FillsVoids, Nests), where a second link makes the answer
// depend on which one a tool takes.
function inverseMessage(e, iv, n, by, raw, range) {
  const ent = iv.entName;
  const head = `${e.type}.${iv.name} counts ${n} ${ent}${n === 1 ? "" : "s"} (${iv.attr} pointing here${by ? ": " + by : ""}), ${raw} gives ${range}`;
  if (iv.name === "ShapeOfProduct" && n === 0) return `${head}. A shape no product uses: nothing reads it, and a type's geometry belongs in an IfcRepresentationMap (the type's RepresentationMaps) instead`;
  if (iv.name === "ShapeOfProduct") return `${head}. One IfcProductDefinitionShape shared by ${n} products: each reads the same geometry, so quantities stay right, but ${raw} wants one per product (share it through an IfcRepresentationMap and IfcMappedItem)`;
  if (iv.name === "PlacesObject" && n === 0) return `${head}. A placement no product uses (often one only other placements are relative to): harmless to read, but ${raw} wants each IfcObjectPlacement to place exactly one product`;
  if (iv.name === "PlacesObject") return `${head}. One placement shared by ${n} products: they sit in the same place, harmless to read, but ${raw} wants one placement per product`;
  if (iv.name === "VoidsElements" && n === 0) return `${head}. An opening that voids no element: a quantity takeoff subtracts it from nothing, and an IDS check on the wall it was meant for cannot see it`;
  if (iv.name === "ProjectsElements" && n === 0) return `${head}. A projection attached to no element`;
  if (iv.name === "AssociatedTo" && n === 0) return `${head}. A material usage (layer or profile set usage) no IfcRelAssociatesMaterial attaches to anything, so no element reads it`;
  if (iv.name === "DefinesType") return `${head}. One property set shared by ${n} types: each type reads the same values, so an IDS property check gives each the same answer, but ${raw} wants one type per set, and an edit to it changes them all`;
  if (iv.name === "StyledByItem") return `${head}. ${n} styles on one geometry item: its colour or material look depends on which one a viewer takes`;
  if (iv.name === "ToMaterialLayerSet" && by.includes("listing it")) return `${head}. One layer record listed ${n} times in one set (often the same board on both faces): each place in the set should be its own IfcMaterialLayer, so its thickness and material can differ`;
  if (iv.name === "ToMaterialLayerSet") return `${head}. One material layer in ${n} layer sets: a layer thickness or material edited for one set changes the others`;
  if (iv.name === "ContainedIn" && n === 0) return `${head}. A port that belongs to no element (no IfcRelConnectsPortToElement): a system check cannot tell what it connects`;
  if (iv.max === 1 && /^(ContainedInStructure|Decomposes|FillsVoids|Nests|IsTypedBy|IsDeclaredBy)$/.test(iv.name)) return `${head}. An IDS partOf or type check follows one of these links; with ${n}, the answer depends on which one a tool takes`;
  if (iv.min > 0 && n === 0) return `${head}. Nothing points at it, so it is orphaned: a reader that walks from the model's root never reaches it`;
  return `${head}`;
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
  if (!gs.length) return `${r.schema}: ${r.records.toLocaleString("en-US")} records, every one follows the schema as far as this checks (attribute counts, types, enumerations, derived slots, references, header, IfcApplication rules, inverse counts${r.whereStats ? `, ${r.whereStats.evaluated.toLocaleString("en-US")} WHERE rule checks` : ""})\n`;
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
