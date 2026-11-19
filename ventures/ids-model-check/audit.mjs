// IDS audit: is the IDS itself valid against the IFC schema, before any model?
//
// auditIds(ids, { schemas, typeMap }) -> [{ spec, specName, level, code, facet, message }]
//
// level "error" means the specification is invalid: it names a class or an
// attribute the schema does not have, compares a value IDS cannot compare, or
// writes a number, integer or boolean in a form IDS does not accept. The
// checker then reports the specification as INVALID instead of running it,
// because a check run as written would only report every element as failing
// for a reason that is the IDS author's, not the model's. level "warning" is a
// specification that is valid but probably not what was meant (a value that no
// IFC enumeration member can equal, a property value with no dataType).
//
// The rules follow the IDS 1.0 implementer documentation and buildingSMART's
// test cases (the invalid-* pairs); eval/run-testcases.mjs scores both.
//
// Property facets naming a standard set (Pset_ or Qto_) are also checked
// against buildingSMART's property set templates (`psets`, from
// schema/psets-*.json), as buildingSMART's IDS-Audit-tool does: a set the
// templates lack (IDS reserves the prefixes for standard sets), a property the
// standard set lacks, a dataType other than the template's, and a required set
// the applicable classes cannot carry are errors, with the near standard name
// when one is a slip away (Pset_WallComon, FireRatng). A value outside a
// standard enumeration is a warning.
//
// `ids` is parseIds() output; `schemas` maps IFC2X3/IFC4/IFC4X3 to Schema
// objects (any subset: a specification is audited against the schemas its
// ifcVersion names that were passed, or every passed schema when none match).

import { temporalKind } from "./temporal.mjs";
import { parseXsdRegex, repairXsdRegex } from "./xsdregex.mjs";

const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);

const DOUBLE = /^[-+]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?$|^(NaN|INF|\+INF|-INF)$/;
const INTEGER = /^[-+]?[0-9]+$/;
const BOOLEAN = /^(true|false|0|1)$/;
// The relation values ids.xsd allows; voids and fills are one value, a token pair.
const PARTOF_RELS = ["IFCRELAGGREGATES", "IFCRELASSIGNSTOGROUP", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCRELNESTS", "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"];
const VERSIONS = ["IFC2X3", "IFC4", "IFC4X3", "IFC4X3_ADD2"];

const versionId = (v) => (v.startsWith("IFC4X3") ? "IFC4X3" : v === "IFC4" ? "IFC4" : v === "IFC2X3" ? "IFC2X3" : null);

// Schemas to audit one specification against.
function schemasFor(spec, schemas) {
  const all = Object.entries(schemas || {}).filter(([, s]) => s);
  const named = all.filter(([id]) => spec.ifcVersion.some((v) => versionId(v) === id));
  return (named.length ? named : all).map(([id, s]) => ({ id, S: s }));
}

// Class names an IdsValue lists outright (simple value or enumeration), or null
// for a pattern or an empty value.
function listedNames(v) {
  if (v.simple !== undefined) return [v.simple];
  if (v.r && v.r.enumeration.length && !v.r.pattern.length) return v.r.enumeration;
  return null;
}

// Every attribute name a class answers to, with how: explicit, derived, inverse.
function attributeKinds(S, cls) {
  const out = new Map();
  for (const a of S.attrs(cls)) out.set(a.name, { kind: a.derived ? "derived" : "explicit", attr: a });
  for (let t = cls; t && S.entities[t]; t = S.entities[t].super) {
    const e = S.entities[t];
    for (const n of e.ownDerived || []) if (!out.has(n)) out.set(n, { kind: "derived" });
    for (const n of e.inverse || []) if (!out.has(n)) out.set(n, { kind: "inverse" });
  }
  return out;
}

// Is a literal written the way IDS needs for this primitive? Returns a reason
// or null.
function literalProblem(text, prim, what) {
  if (prim === "double") {
    if (!DOUBLE.test(text)) return `${what} ${JSON.stringify(text)} is not a number IDS can read (write it like 42.3, with a point and no thousands separator)`;
  } else if (prim === "integer") {
    if (!INTEGER.test(text)) return DOUBLE.test(text) ? `${what} ${JSON.stringify(text)} is not an integer, and the value is an integer (write ${Number.isInteger(Number(text)) ? String(Number(text)) : "a whole number"})` : `${what} ${JSON.stringify(text)} is not an integer`;
  } else if (prim === "boolean" || prim === "logical") {
    if (!BOOLEAN.test(text)) return `${what} ${JSON.stringify(text)} is not a boolean; IDS writes booleans in lower case, true or false`;
  }
  return null;
}

// Problems with a value restriction against the primitive it is compared with.
// Returns { error } or { warning } or null.
function valueProblem(value, prim, enumValues) {
  if (!value.present) return null;
  const numeric = prim === "double" || prim === "integer";
  if (value.simple !== undefined) {
    const p = literalProblem(value.simple, prim, "value");
    if (p) return { error: p };
    if (prim === "enum" && enumValues && !enumValues.includes(value.simple)) return { warning: `value ${JSON.stringify(value.simple)} is not a member of the enumeration (${enumValues.slice(0, 8).join(", ")}${enumValues.length > 8 ? ", ..." : ""}), so it can never match` };
    return null;
  }
  const r = value.r;
  if (!r) return null;
  // IDS's DataTypes table allows a pattern on xs:boolean (matched against
  // true or false), but buildingSMART's test cases make one on a number invalid.
  if (r.pattern.length && numeric) return { error: `a pattern only applies to text; this value is ${prim === "double" ? "a number" : "an integer"}, so the pattern can never match` };
  if (r.pattern.length && (prim === "boolean" || prim === "logical") && (r.regexes || []).every(Boolean) && !["true", "false"].some((t) => r.regexes.some((re) => re.test(t)))) return { warning: `the pattern matches neither true nor false, so this boolean can never match` };
  for (const [i, re] of (r.regexes || []).entries()) if (!re) return { error: `pattern /${r.pattern[i]}/ is not a valid regular expression: ${parseXsdRegex(r.pattern[i]).error}` };
  for (const t of r.enumeration) {
    const p = literalProblem(t, prim, "enumeration value");
    if (p) return { error: p };
  }
  for (const k of ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"]) {
    if (r[k] === undefined) continue;
    // A date, time or duration bound on a text-based type (IFCDATE,
    // IFCDATETIME, IFCTIME, IFCDURATION) is an XSD range IDS allows.
    if (!numeric && temporalKind(r[k])) continue;
    if (!DOUBLE.test(r[k])) return { error: `${k} ${JSON.stringify(r[k])} is not a number${numeric ? "" : ", a date, a time or a duration"}` };
    if (!numeric && prim !== "unknown") return { warning: `${k} compares numbers, but this value is ${prim === "enum" ? "an enumeration" : "text"}, so it can never match` };
  }
  if (prim === "enum" && enumValues && r.enumeration.length && !r.enumeration.some((t) => enumValues.includes(t))) return { warning: `no listed value is a member of the enumeration, so it can never match` };
  return null;
}

// Every class a specification's applicability names outright, by schema.
function applicableClasses(spec, S, typeMap, id) {
  const ef = spec.applicability.find((f) => f.kind === "entity");
  if (!ef) return null;
  let names = listedNames(ef.name);
  // A class-name pattern selects the classes it matches in full.
  if (!names && ef.name.r && ef.name.r.pattern.length && !ef.name.r.enumeration.length && ef.name.r.regexes.every(Boolean)) {
    names = Object.keys(S.entities).filter((n) => ef.name.matchString(n));
    if (!names.length) return null;
  }
  if (!names) return null;
  const out = [];
  for (const n of names) {
    if (S.has(n)) out.push(n);
    else if (id === "IFC2X3" && own(typeMap, n)) out.push(own(typeMap, n)[0]);
  }
  return out;
}

function entityNameIssues(f, ctx, where) {
  const issues = [];
  const names = listedNames(f.name);
  const known = (n) => ctx.list.some(({ id, S }) => S.has(n) || (id === "IFC2X3" && own(ctx.typeMap, n)));
  const label = ctx.list.map((x) => x.id).join(" or ");
  if (names) {
    for (const n of names) {
      if (known(n)) continue;
      if (n !== n.toUpperCase() && known(n.toUpperCase())) issues.push({ level: "error", code: "class-case", message: `${where}class ${JSON.stringify(n)} must be written in upper case: ${n.toUpperCase()}` });
      else issues.push({ level: "error", code: "class-unknown", message: `${where}${JSON.stringify(n)} is not an ${label} class` });
    }
  } else if (f.name.r && f.name.r.pattern.length) {
    const res = f.name.r.regexes || [];
    if (res.some((re) => !re)) issues.push({ level: "error", code: "pattern-invalid", message: `${where}class name pattern is not a valid regular expression: ${f.name.r.pattern.map((p) => parseXsdRegex(p)).find((x) => !x.ok)?.error}` });
    else if (!ctx.list.some(({ S }) => Object.keys(S.entities).some((n) => res.some((re) => re.test(n))))) issues.push({ level: "warning", code: "class-pattern-empty", message: `${where}class name pattern ${f.name} matches no ${label} class` });
  }
  // A predefined type the class's enumeration lacks only matches USERDEFINED
  // objects whose ObjectType says so: legal, but worth a word.
  if (names && f.predefinedType.simple !== undefined) {
    const pt = f.predefinedType.simple;
    const enumsFor = names.flatMap((n) => ctx.list.map(({ S }) => {
      if (!S.has(n)) return null;
      const a = S.attrs(n).find((x) => x.name === "PredefinedType");
      const d = a && S.types[a.type];
      return d && d.kind === "enum" ? d.values : null;
    })).filter(Boolean);
    if (pt !== pt.toUpperCase() && enumsFor.some((v) => v.includes(pt.toUpperCase()))) issues.push({ level: "warning", code: "predefined-case", message: `${where}predefined type ${JSON.stringify(pt)} differs from the enumeration member ${pt.toUpperCase()} only in case; it matches only USERDEFINED objects named exactly ${JSON.stringify(pt)}` });
    else if (enumsFor.length && !enumsFor.some((v) => v.includes(pt))) issues.push({ level: "warning", code: "predefined-custom", message: `${where}predefined type ${JSON.stringify(pt)} is not in the class's enumeration, so it matches only USERDEFINED objects whose ObjectType (or the type's ElementType) is ${JSON.stringify(pt)}` });
  }
  return issues;
}

// An entity facet naming an abstract class (IFC2X3's IFCBUILDINGELEMENT,
// IFCELEMENT, IFCPRODUCT): no object has it as its own class, and IDS class
// names do not take in subclasses, so the name matches nothing. Valid IDS,
// so a warning; a required specification whose every name is abstract fails
// on every model as "nothing applicable". Found on the Dutch RVB BIM Norm IDS
// (eval/abstract-classes-2026-11-17.md). Not for patterns: a pattern that
// also matches concrete classes is how an author asks for a family.
function concreteBelow(S, cls) {
  return Object.keys(S.entities).filter((c) => c !== cls && !S.entities[c].abstract && isA(S, c, cls)).sort();
}

function abstractIssues(f, ctx, where, spec, isApplicability) {
  const names = listedNames(f.name);
  if (!names) return [];
  const known = names.filter((n) => ctx.list.some(({ S }) => S.has(n)));
  const abstractIn = (n) => ctx.list.filter(({ S }) => S.has(n) && S.entities[n].abstract).map(({ id }) => id);
  const flagged = known.filter((n) => abstractIn(n).length);
  if (!flagged.length) return [];
  // Does every listed name match nothing in some audited schema?
  const deadIn = ctx.list.filter(({ id, S }) => names.every((n) => !S.has(n) ? !(id === "IFC2X3" && own(ctx.typeMap, n)) : S.entities[n].abstract)).map(({ id }) => id);
  return flagged.map((n) => {
    const ids = abstractIn(n);
    const { S } = ctx.list.find(({ id }) => id === ids[0]);
    const sub = concreteBelow(S, n);
    const inSchemas = ids.length === ctx.list.length ? "" : ` in ${ids.join(" and ")}`;
    const subs = sub.length ? `; to check the objects below it, name their classes (${sub.slice(0, 8).join(", ")}${sub.length > 8 ? ` and ${sub.length - 8} more` : ""})` : "";
    let what;
    if (!isApplicability) what = `no element is part of an object of exactly that class, so this partOf facet never matches${deadIn.length ? "" : " through that name"}`;
    else if (deadIn.length) what = `this specification applies to nothing${deadIn.length === ctx.list.length ? "" : ` in ${deadIn.join(" and ")} models`}${spec.optionality === "required" ? `, and being required it fails on every such model as "nothing applicable"` : ""}`;
    else what = "the facet matches only its other class names";
    return { level: "warning", code: "class-abstract", message: `${where}${n} is abstract${inSchemas}: no object has it as its own class, and IDS class names do not include subclasses, so ${what}${subs}` };
  });
}

// A required entity requirement whose every name is abstract, under an
// applicability with no entity facet (with one, entityContradiction already
// catches it): no object is of an abstract class itself, so every applicable
// element fails for a fault in the IDS. Invalid, like entityContradiction;
// in a schema where some name is concrete, a warning from the applicability
// rule's wording instead.
function abstractRequirement(f, spec, ctx) {
  if (f.cardinality === "optional" || f.cardinality === "prohibited") return [];
  if (spec.applicability.some((x) => x.kind === "entity")) return [];
  const names = listedNames(f.name);
  if (!names) return [];
  const dead = (id, S, n) => (!S.has(n) ? !(id === "IFC2X3" && own(ctx.typeMap, n)) : S.entities[n].abstract && !(id === "IFC2X3" && own(ctx.typeMap, n)));
  const deadIn = ctx.list.filter(({ id, S }) => names.every((n) => dead(id, S, n))).map(({ id }) => id);
  if (!deadIn.length || !names.some((n) => ctx.list.some(({ S }) => S.has(n) && S.entities[n].abstract))) return [];
  const { S } = ctx.list.find(({ id }) => id === deadIn[0]);
  const sub = [...new Set(names.flatMap((n) => (S.has(n) ? concreteBelow(S, n) : [])))];
  const subs = sub.length ? `; to require objects below it, name their classes (${sub.slice(0, 8).join(", ")}${sub.length > 8 ? ` and ${sub.length - 8} more` : ""})` : "";
  const all = deadIn.length === ctx.list.length;
  return [{ level: all ? "error" : "warning", code: "class-abstract", message: `the requirement asks for entity ${f.name}, which is abstract${all ? "" : ` in ${deadIn.join(" and ")}`}: no object has it as its own class, and IDS class names do not include subclasses, so every applicable element${all ? "" : ` in ${deadIn.join(" and ")} models`} would fail${subs}` }];
}

// A required entity facet that no applicable class can satisfy: the
// applicability picks exact classes, and the requirement names others (a
// subclass is not its parent; IFCSLAB is never IFCWALL). Every applicable
// element would fail for a reason in the IDS, so it is invalid.
function entityContradiction(f, spec, ctx) {
  const ef = spec.applicability.find((x) => x.kind === "entity");
  const names = ef && listedNames(ef.name);
  if (!names || f.cardinality === "optional" || f.cardinality === "prohibited") return [];
  const canMatch = names.some((a) => {
    if (f.name.matchString(a)) return true;
    // IFC2X3 elements also answer to the IDS type-mapping names of their class.
    const occ = own(ctx.typeMap, a) ? own(ctx.typeMap, a)[0] : a;
    return ctx.list.some(({ id }) => id === "IFC2X3") && Object.entries(ctx.typeMap || {}).some(([k, [o]]) => (o === a || o === occ) && f.name.matchString(k));
  });
  if (canMatch) return [];
  return [{ level: "error", code: "entity-contradiction", message: `the applicability selects ${names.join(", ")} (exact classes, no subclasses), and the requirement asks for entity ${f.name}, which none of them can be, so every applicable element would fail` }];
}

function attributeIssues(f, spec, ctx) {
  // Per schema and applicable class, the first problem (or null when fine).
  const outcomes = [];
  const warnings = [];
  for (const { id, S } of ctx.list) {
    const classes = applicableClasses(spec, S, ctx.typeMap, id);
    if (classes === null) {
      // No class named: only a name no class has anywhere is an error.
      const names = listedNames(f.name);
      if (!names) { outcomes.push(null); continue; }
      const all = attributeIndex(S);
      const bad = names.filter((n) => !all.has(n));
      outcomes.push(bad.length === names.length ? { code: "attribute-unknown", message: `no ${id} class has an attribute ${JSON.stringify(bad[0])}` } : null);
      // A value on an attribute that is a list (or an object, a select,
      // binary) on every class storing it: every object it applies to fails
      // (IDS's value_checks_always_fail_for_lists test case). A warning, not
      // an error: with no class named, the IDS-Audit-tool accepts it.
      if (f.value.present && bad.length < names.length) {
        const why = uncomparable(S, names.filter((n) => all.has(n)));
        if (why) warnings.push(`${why}; ${(spec.applicability || []).includes(f) ? "so this applicability selects nothing" : "every object this checks fails it"} (${id})`);
      }
      continue;
    }
    for (const cls of classes) {
      const kinds = attributeKinds(S, cls);
      const hits = [...kinds.entries()].filter(([n]) => f.name.matchString(n));
      const explicit = hits.filter(([, k]) => k.kind === "explicit");
      if (!explicit.length) {
        const first = hits[0];
        const pretty = S.entities[cls].name || cls;
        if (first && first[1].kind === "inverse") outcomes.push({ code: "attribute-inverse", message: `${first[0]} is an inverse attribute of ${pretty}; IDS checks only explicit attributes` });
        else if (first && first[1].kind === "derived") outcomes.push({ code: "attribute-derived", message: `${first[0]} is a derived attribute of ${pretty}; IDS checks only explicit attributes` });
        else outcomes.push({ code: "attribute-unknown", message: `${pretty} (${id}) has no attribute ${f.name}` });
        continue;
      }
      let problem = null;
      if (f.value.present) {
        for (const [n, { attr }] of explicit) {
          const prim = S.prim(attr.type);
          if (attr.aggregate || prim === "aggregate") { problem = { code: "value-list", message: `${n} is a list; IDS cannot compare a list with a value` }; break; }
          if (prim === "entity") { problem = { code: "value-object", message: `${n} refers to an object; IDS cannot compare an object with a value` }; break; }
          if (prim === "select") { problem = { code: "value-select", message: `${n} is a select (${attr.type}); IDS cannot compare a select with a value` }; break; }
          if (prim === "binary") { problem = { code: "value-binary", message: `${n} is binary; IDS cannot compare it with a value` }; break; }
          const d = S.types[attr.type];
          const vp = valueProblem(f.value, prim, d && d.kind === "enum" ? d.values : enumOf(S, attr.type));
          if (vp && vp.error) { problem = { code: "value-format", message: `${n}: ${vp.error}` }; break; }
          if (vp && vp.warning) warnings.push(`${n}: ${vp.warning}`);
        }
      }
      outcomes.push(problem);
    }
  }
  const issues = [];
  if (outcomes.length && outcomes.every(Boolean)) issues.push({ level: "error", code: outcomes[0].code, message: outcomes[0].message });
  else if (warnings.length) issues.push({ level: "warning", code: "value-never", message: warnings[0] });
  return issues;
}

// For attribute names with no class: why none of them can be compared with a
// value on any class that stores it ("TexCoordsList is a list on every class
// that has it (IfcIndexedTextureMap)"), or null when one can.
function uncomparable(S, names) {
  const what = new Map();
  for (const [cls, e] of Object.entries(S.entities)) {
    for (const a of S.attrs(cls)) {
      if (!names.includes(a.name) || a.derived) continue;
      const prim = S.prim(a.type);
      const k = a.aggregate || prim === "aggregate" ? "a list" : prim === "entity" ? "an object" : prim === "select" ? "a select" : prim === "binary" ? "binary" : null;
      if (!k) return null;
      if (!what.has(a.name)) what.set(a.name, { k: new Set(), on: [] });
      const w = what.get(a.name);
      w.k.add(k);
      if (e.attrs.some((x) => x.name === a.name)) w.on.push(e.name || cls);
    }
  }
  if (!what.size) return null;
  const [n, w] = [...what][0];
  const kinds = [...w.k];
  return `${n} is ${kinds.length === 1 ? kinds[0] : kinds.join(" or ")} on every class that has it (${w.on.slice(0, 3).join(", ")}${w.on.length > 3 ? ", ..." : ""}); IDS cannot compare it with a value`;
}

function enumOf(S, type) {
  for (let t = type, g = 0; t && g < 20; g++) {
    const d = S.types[t];
    if (!d) return null;
    if (d.kind === "enum") return d.values;
    if (d.kind !== "defined") return null;
    t = d.of;
  }
  return null;
}

const attrIndexCache = new WeakMap();
function attributeIndex(S) {
  let s = attrIndexCache.get(S);
  if (!s) {
    s = new Set();
    for (const e of Object.values(S.entities)) for (const a of e.attrs) s.add(a.name);
    attrIndexCache.set(S, s);
  }
  return s;
}

// Edit distance with adjacent transpositions (optimal string alignment:
// Lenght and Length are one slip apart, not two), capped: returns cap + 1
// once it is exceeded.
function editDistance(a, b, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

// The standard name a misspelt one most likely meant: same letters ignoring
// case, or one or two edits away (only for names long enough that two edits
// are a slip, not another word). Null when none, or when two tie.
export function nearName(name, candidates) {
  const lower = name.toLowerCase();
  const exact = candidates.filter((c) => c.toLowerCase() === lower);
  if (exact.length) return exact[0];
  const cap = name.length >= 12 ? 2 : name.length >= 5 ? 1 : 0;
  if (!cap) return null;
  let best = null;
  let bestD = cap + 1;
  let tie = false;
  for (const c of candidates) {
    const d = editDistance(lower, c.toLowerCase(), cap);
    if (d < bestD) { best = c; bestD = d; tie = false; }
    else if (d === bestD && d <= cap) tie = true;
  }
  return bestD <= cap && !tie ? best : null;
}

// Is `cls` the class `anc` or one of its subclasses?
function isA(S, cls, anc) {
  for (let t = cls, g = 0; t && S.entities[t] && g < 40; t = S.entities[t].super, g++) if (t === anc) return true;
  return false;
}

// Can an object of exact class `cls` carry a set that applies to `classes`?
// Yes when it is one of them or a subclass, when it is the type object of one
// (IFCWALLTYPE for IFCWALL), or, generously, when it is a superclass of one
// (an applicability naming IFCBUILDINGELEMENT in IFC2X3 may mean any wall).
// An occurrence also carries the sets of its type, which it inherits, so
// <cls>TYPE is tried too; with the superclass rule that covers IFC2X3, where
// an IfcFlowTerminal typed by IfcAirTerminalType (an IfcFlowTerminalType) has
// Pset_AirTerminalTypeCommon. (applicableClasses has already mapped IFC2X3
// names through the type map, so no lookup by `cls` is needed here.)
function canCarry(S, cls, classes) {
  const names = S.entities[cls + "TYPE"] ? [cls, cls + "TYPE"] : [cls];
  return names.some((c) => classes.some((t) => isA(S, c, t) || isA(S, t, c) || (c.endsWith("TYPE") && (isA(S, c, t + "TYPE") || isA(S, c, t.replace(/STANDARDCASE$/, "") + "TYPE"))) || (/^IFC(TYPEOBJECT|TYPEPRODUCT|ELEMENTTYPE)$/.test(t) && isA(S, c, "IFCTYPEOBJECT"))));
}

// A standard set the templates give only to some predefined types of a class
// (Pset_ActuatorTypeElectricActuator: IfcActuator/ELECTRICACTUATOR; IFC4 and
// IFC4X3 templates, schema/psets-*.json `pt`). Warns when the specification's
// predefinedType names none of those types, or names no type at all, so
// objects of the other types are asked for a set the standard never gives
// them. Fine when any selected class can carry the set whatever its type.
// Types compare without case: IFC4 writes some as ObjectType text
// ("IfcDiscreteAccessory/Wire loop"), IFC4X3 upper-cases them.
function predefinedIssue(S, spec, setName, set, classes, id) {
  if (!set.pt) return null;
  const allowed = new Set();
  const hasType = (n) => S.has(n) && S.attrs(n).some((x) => x.name === "PredefinedType");
  for (const c of classes) {
    const via = set.classes.filter((t) => canCarry(S, c, [t]));
    if (!via.length) continue;
    // IFC4's IfcMaterial/Concrete names a Category, not a predefined type.
    if (!hasType(c) && !hasType(c + "TYPE")) return null;
    if (via.some((t) => !own(set.pt, t))) return null;
    for (const t of via) for (const v of set.pt[t]) allowed.add(v);
  }
  if (!allowed.size) return null;
  const ef = spec.applicability.find((x) => x.kind === "entity");
  // An attribute facet on PredefinedType selects types as well.
  const af = spec.applicability.find((x) => x.kind === "attribute" && listedNames(x.name)?.includes("PredefinedType"));
  const typeValue = ef && ef.predefinedType.present ? ef.predefinedType : af && af.value && af.value.present ? af.value : null;
  const types = [...allowed];
  const list = types.slice(0, 4).join(", ") + (types.length > 4 ? ", ..." : "");
  const on = [...new Set(set.classes.filter((t) => own(set.pt, t)))].slice(0, 2).join(", ");
  if (!typeValue) return { code: "pset-predefined", message: `${setName} is the ${id} standard set only for ${on} of predefined type ${list}; the applicability selects every ${classes.join(", ")} whatever its type, so objects of the other types are asked for a set the standard does not give them. Add predefinedType ${types.length === 1 ? types[0] : "(" + list + ")"} to the entity facet`, predefinedType: types };
  const named = listedNames(typeValue);
  if (!named) return null;
  const lower = new Set(types.map((v) => v.toLowerCase()));
  if (named.some((v) => lower.has(v.toLowerCase()))) return null;
  return { code: "pset-predefined", message: `${setName} is the ${id} standard set only for ${on} of predefined type ${list}; the applicability selects predefined type ${named.join(", ")}, which the standard does not give this set`, predefinedType: types };
}

// Where the template type says a standard set may sit (schema/psets-*.json
// `tt`, IFC4 and IFC4X3). PSET_OCCURRENCEDRIVEN and QTO_OCCURRENCEDRIVEN sets
// go on occurrences only (Pset_FanOccurrence on each IfcFan, never on an
// IfcFanType), so a type object selected for one is asked for a set the
// standard never gives it: warns pset-occurrence. PSET_PERFORMANCEDRIVEN sets
// (Pset_ActuatorPHistory) go on the IfcPerformanceHistory that records the
// element's performance over time, not on the element: warns
// pset-performance for any selected class that is not a performance history.
// Warnings, like pset-predefined: the template type is the standard's
// guidance, not a schema rule, and a model can still satisfy the
// specification. Material and profile sets are left to pset-class.
function templateTypeIssue(S, setName, set, classes, id) {
  const tt = set.tt;
  if (!tt) return null;
  const list = (xs) => xs.slice(0, 4).join(", ") + (xs.length > 4 ? ", ..." : "");
  if (/OCCURRENCEDRIVEN$/.test(tt)) {
    // Type objects that reach the set only as the type of its occurrence.
    const types = classes.filter((c) => isA(S, c, "IFCTYPEOBJECT") && canCarry(S, c, set.classes));
    if (!types.length) return null;
    const occ = [...new Set(types.map((c) => c.replace(/TYPE$/, "")).filter((c) => S.has(c) && canCarry(S, c, set.classes)))];
    return { code: "pset-occurrence", message: `${setName} is an occurrence set in the ${id} templates (${tt}): the standard puts it on each ${list(set.classes)} and never on a type, so ${list(types)} ${types.length === 1 ? "is" : "are"} asked for a set ${types.length === 1 ? "it" : "they"} should not have${occ.length ? `. Select ${list(occ)} instead` : ""}`, occurrences: occ };
  }
  if (tt === "PSET_PERFORMANCEDRIVEN") {
    const others = classes.filter((c) => !isA(S, c, "IFCPERFORMANCEHISTORY"));
    if (!others.length || !S.has("IFCPERFORMANCEHISTORY")) return null;
    return { code: "pset-performance", message: `${setName} is a performance history set in the ${id} templates (${tt}): the standard puts it on the IfcPerformanceHistory that records the performance of ${list(set.classes)} over time, not on the element itself, so ${list(others)} ${others.length === 1 ? "is" : "are"} asked for a set ${others.length === 1 ? "it" : "they"} should not carry. Select IFCPERFORMANCEHISTORY instead` };
  }
  return null;
}

// Standard property set template checks, following buildingSMART's
// IDS-Audit-tool: a Pset_/Qto_ set the templates lack, a property its standard
// set lacks, a dataType the template does not give, and a set the applicable
// classes cannot carry are errors. `templates` is [{ id, sets, S }] for the
// schemas the specification is audited against.
function templateIssues(f, spec, ctx, where) {
  const templates = ctx.templates || [];
  if (!templates.length) return [];
  const setNames = listedNames(f.propertySet);
  if (!setNames || !setNames.every((n) => /^(Pset|Qto)_/.test(n))) return [];
  const label = templates.map((t) => t.id).join(" or ");
  // Per schema: { error } or { warning } or null when fine. An error counts
  // only when every schema has one, as for classes and attributes.
  const perSchema = templates.map(({ id, sets, S }) => {
    const found = [];
    for (const setName of setNames) {
      const set = own(sets, setName);
      if (!set) {
        const near = nearName(setName, Object.keys(sets));
        if (near) return { error: { code: "pset-name", message: `${setName} is not an ${label} standard property set; did you mean ${near}?` } };
        return { error: { code: "pset-custom", message: `${setName} is not a standard ${label} property set, and IDS reserves the ${setName.slice(0, 4)} prefix for those; a project's own set needs another name (e.g. ${"e" + setName} or ${setName.replace(/^(Pset|Qto)_/, "Project_")})` } };
      }
      found.push([setName, set]);
    }
    // Applicability: can any class the specification selects carry the set?
    let ptWarning = null;
    if (where === "requirements") {
      // An IFC2X3 type-mapping name (IFCACTUATOR: an
      // IfcDistributionControlElement typed by an IfcActuatorType) also
      // carries its type's sets, as the property facet reads type properties.
      const ef = spec.applicability.find((x) => x.kind === "entity");
      const mappedTypes = id === "IFC2X3" && ef ? (listedNames(ef.name) || []).map((n) => own(ctx.typeMap, n)).filter((m) => m && m[1]).map((m) => m[1]) : [];
      for (const [setName, set] of found) {
        const classes = applicableClasses(spec, S, ctx.typeMap, id);
        // A performance set sits on the IfcPerformanceHistory that records
        // the element's performance, so selecting the history is right.
        const history = set.tt === "PSET_PERFORMANCEDRIVEN" && classes && classes.some((c) => isA(S, c, "IFCPERFORMANCEHISTORY"));
        if (classes && classes.length && set.classes.length && !history && !classes.some((c) => canCarry(S, c, set.classes)) && !mappedTypes.some((t) => S.has(t) && canCarry(S, t, set.classes))) {
          return { error: { code: "pset-class", message: `${setName} applies to ${set.classes.slice(0, 4).join(", ")}${set.classes.length > 4 ? ", ..." : ""} in ${id}; the applicability selects ${classes.join(", ")}, which cannot carry it` } };
        }
        // The wrong kind of object outranks a missing predefined type.
        if (classes && classes.length) ptWarning ||= templateTypeIssue(S, setName, set, classes, id);
        if (classes && classes.length && !mappedTypes.length) ptWarning ||= predefinedIssue(S, spec, setName, set, classes, id);
      }
    }
    const propNames = listedNames(f.baseName);
    if (!propNames) return ptWarning ? { warning: ptWarning } : null;
    let warning = ptWarning;
    for (const [setName, set] of found) {
      for (const pn of propNames) {
        const tpl = own(set.props, pn);
        if (!tpl) {
          const near = nearName(pn, Object.keys(set.props));
          const names = Object.keys(set.props);
          return { error: { code: "pset-property", message: `${setName} has no standard property ${pn}${near ? `; did you mean ${near}?` : ` (it has ${names.slice(0, 6).join(", ")}${names.length > 6 ? ", ..." : ""})`}` } };
        }
        // Template types the schema lacks (a few in the IFC4.3 development
        // templates) are not compared.
        const allowed = (tpl.types || (tpl.type ? [tpl.type] : [])).filter((t) => S.types[t]);
        if (f.dataType && allowed.length && !allowed.includes(f.dataType)) return { error: { code: "pset-datatype", message: `${setName}.${pn} is ${allowed.join(" or ")} in the ${id} templates, not ${f.dataType}, so a model that follows the standard can never pass` } };
        if (!f.dataType && allowed.length && f.value.present) {
          // TRUE or True on a boolean: IDS writes booleans true/false, and with
          // no dataType checkers part ways (this one matches no object,
          // IfcTester 0.8.0 matches the true ones; README, 2026-11-17).
          const sv = f.value.simple;
          const caps = typeof sv === "string" && /^(true|false)$/i.test(sv) && sv !== sv.toLowerCase() && allowed.some((t) => ["boolean", "logical"].includes(S.prim(t)));
          warning ||= { code: "value-no-datatype", message: `property ${setName}.${pn} has a value but no dataType; IDS 1.0 expects one, and the ${id} templates give ${allowed.join(" or ")}${caps ? `. ${sv} is not how IDS writes a boolean (${sv.toLowerCase()}): with no dataType, checkers disagree on whether it matches` : ""}` };
        }
        if (tpl.enum && tpl.enum.length && f.value.present) {
          const listed = listedNames(f.value);
          if (listed && !listed.some((v) => tpl.enum.includes(v))) warning ||= { code: "value-never", message: `${setName}.${pn} is an enumeration (${tpl.enum.slice(0, 8).join(", ")}${tpl.enum.length > 8 ? ", ..." : ""}); ${listed.length === 1 ? JSON.stringify(listed[0]) + " is" : "none of the listed values is"} not a member, so a model that follows the standard cannot match` };
        }
      }
    }
    return warning ? { warning } : null;
  });
  // Every schema finds an error: report the one from a schema that has the set
  // (its reason is the more specific), else the first.
  if (perSchema.length && perSchema.every((x) => x && x.error)) {
    const specific = perSchema.find((x) => !["pset-custom", "pset-name"].includes(x.error.code)) || perSchema[0];
    return [{ level: "error", ...specific.error }];
  }
  const w = perSchema.find((x) => x && x.warning);
  return w && perSchema.every((x) => x) ? [{ level: "warning", ...w.warning }] : [];
}

function propertyIssues(f, ctx, spec, where) {
  const issues = [];
  if (f.dataType) {
    const found = ctx.list.filter(({ S }) => S.types[f.dataType] && S.types[f.dataType].kind !== "select");
    if (!found.length) {
      issues.push({ level: "error", code: "datatype-unknown", message: `dataType ${f.dataType} is not an ${ctx.list.map((x) => x.id).join(" or ")} data type` });
      return issues;
    }
    if (f.value.present) {
      const results = found.map(({ S }) => valueProblem(f.value, S.prim(f.dataType), enumOf(S, f.dataType)));
      if (results.every((r) => r && r.error)) issues.push({ level: "error", code: "value-format", message: `${f.dataType}: ${results[0].error}` });
      else { const w = results.find((r) => r && r.warning); if (w) issues.push({ level: "warning", code: "value-never", message: `${f.dataType}: ${w.warning}` }); }
    }
  } else if (f.value.present) {
    issues.push({ level: "warning", code: "value-no-datatype", message: `property ${f.propertySet}.${f.baseName} has a value but no dataType; IDS 1.0 expects one, and without it the value is compared with every type the property might hold` });
  }
  if (issues.some((x) => x.level === "error")) return issues;
  const tpl = templateIssues(f, spec, ctx, where);
  // The template's own no-dataType warning names the type to use.
  if (tpl.some((x) => x.code === "value-no-datatype")) return tpl;
  if (tpl.some((x) => x.level === "error")) return tpl;
  return [...issues, ...tpl];
}

// Every xs:pattern in a facet read as XML Schema regex (xsdregex.mjs): one
// that is not XSD (a "(?:" group, a lazy "*?", "{,3}") is an error, because
// IfcTester stops on it and schema validators refuse it, even where this
// checker's looser fallback still ran it; one that is XSD but means something
// else in JavaScript or Python ("^" and "$" are characters, not anchors; "\w"
// is wider) is a warning. Each says what to write instead. A pattern no
// reader takes at all is reported by the value checks above, not twice.
// (eval/xsd-regex-2026-11-18.md)
function patternIssues(f) {
  const out = [];
  const values = Object.entries(f).filter(([, v]) => v && typeof v === "object" && "r" in v && "simple" in v);
  if (f.entity) values.push(...Object.entries(f.entity).filter(([, v]) => v && typeof v === "object" && "r" in v && "simple" in v).map(([k, v]) => ["partOf " + k, v]));
  for (const [key, v] of values) {
    if (!v.r) continue;
    v.r.pattern.forEach((p, i) => {
      if (!v.r.regexes || !v.r.regexes[i]) return;
      const r = parseXsdRegex(p);
      const fix = repairXsdRegex(p);
      const instead = fix !== null ? `; write /${fix}/` : "";
      const label = key.replace(/([A-Z])/g, " $1").toLowerCase();
      if (!r.ok) out.push({ level: "error", code: "pattern-not-xsd", message: `${label} pattern /${p}/ is not an XML Schema regex, which IDS patterns are: ${r.error}${instead}. IfcTester stops on it, so the file checks differently in each tool`, ...(fix !== null ? { fix } : {}) });
      else for (const n of r.notes) out.push({ level: "warning", code: n.code, message: `${label} pattern /${p}/: ${n.message}${n.fix && fix !== null ? `; write /${fix}/` : ""}`, ...(n.fix && fix !== null ? { fix } : {}) });
    });
  }
  return out;
}

export function auditIds(ids, { schemas, typeMap, psets } = {}) {
  // The file's structure against ids.xsd first (structure.mjs): element order,
  // allowed attributes and their fixed values. `structure: true` marks them.
  // Capped at 200: a file written without <simpleValue> wrappers can break
  // the schema 50,000 times, and the first findings say what to fix.
  const structure = ids.structure || [];
  const out = structure.slice(0, 200).map((x) => ({ spec: x.spec, specName: x.spec === null ? "IDS file" : ids.specs[x.spec]?.name ?? `specification ${x.spec + 1}`, facet: x.line ? `line ${x.line}` : null, level: x.level, code: x.code, message: x.message, structure: true, ...(x.topic ? { topic: x.topic } : {}) }));
  if (structure.length > 200) out.push({ spec: null, specName: "IDS file", facet: null, level: "error", code: "xsd-more", message: `${(structure.length - 200).toLocaleString("en-US")} more places break ids.xsd; fix the ones above and audit again`, structure: true });
  ids.specs.forEach((spec, i) => {
    const add = (facet, issue) => out.push({ spec: i, specName: spec.name, facet, ...issue });
    for (const v of spec.ifcVersion) if (!VERSIONS.includes(v)) add(null, { level: "error", code: "version-unknown", message: `ifcVersion ${v} is not one of IFC2X3, IFC4, IFC4X3_ADD2` });
    const list = schemasFor(spec, schemas);
    const ctx = { list, typeMap, templates: list.filter(({ id }) => psets && own(psets, id)).map(({ id, S }) => ({ id, S, sets: psets[id] })) };
    if (!ctx.list.length) return;
    if (!spec.applicability.length) add("applicability", { level: "error", code: "applicability-empty", message: "the applicability has no facet; IDS needs at least one" });
    if (spec.optionality === "prohibited" && spec.requirements.length) add("requirements", { level: "error", code: "prohibited-requirements", message: "a prohibited specification (maxOccurs 0) cannot have requirements: it fails when anything matches its applicability, so write the requirement into the applicability or make the specification required" });
    for (const [where, list] of [["applicability", spec.applicability], ["requirements", spec.requirements]]) {
      for (const f of list) {
        const issues = [];
        if (f.kind === "entity") {
          issues.push(...entityNameIssues(f, ctx, ""));
          if (where === "applicability" && !issues.some((x) => x.level === "error")) issues.push(...abstractIssues(f, ctx, "", spec, true));
          if (where === "requirements" && !issues.some((x) => x.level === "error")) issues.push(...entityContradiction(f, spec, ctx));
          if (where === "requirements" && !issues.some((x) => x.level === "error")) issues.push(...abstractRequirement(f, spec, ctx));
        }
        else if (f.kind === "attribute") issues.push(...attributeIssues(f, spec, ctx));
        else if (f.kind === "property") issues.push(...propertyIssues(f, ctx, spec, where));
        else if (f.kind === "classification" && !f.system.present) issues.push({ level: "error", code: "classification-no-system", message: "a classification facet needs a system in IDS 1.0 (ids.xsd), and tools that validate the file refuse it without one; to accept any system, give a pattern such as .*" });
        else if (f.kind === "partOf") {
          if (f.relation === "IFCRELVOIDSELEMENT" || f.relation === "IFCRELFILLSELEMENT") issues.push({ level: "error", code: "relation-voids-fills", message: `partOf relation ${f.relation} on its own is not an IDS 1.0 value, and tools that validate against ids.xsd (IfcTester among them) refuse the file; write relation="IFCRELVOIDSELEMENT IFCRELFILLSELEMENT" for an element in an opening of another` });
          else if (f.relation && !PARTOF_RELS.includes(f.relation)) issues.push({ level: "error", code: "relation-unknown", message: `partOf relation ${f.relation} is not one of ${PARTOF_RELS.map((r) => JSON.stringify(r)).join(", ")}` });
          if (f.entity) {
            const named = entityNameIssues(f.entity, ctx, "partOf: ");
            issues.push(...named);
            if (!named.some((x) => x.level === "error")) issues.push(...abstractIssues(f.entity, ctx, "partOf: ", spec, false));
          }
        }
        issues.push(...patternIssues(f));
        for (const x of issues) add(where + " " + f.describe(), x);
      }
    }
  });
  // A structure finding the checks above already made in their own words
  // (a partOf relation, an ifcVersion, a classification with no system) is
  // kept once: the specific message, which says what to write instead.
  const SAME = { relation: ["relation-voids-fills", "relation-unknown"], ifcVersion: ["version-unknown"], "classification-system": ["classification-no-system"] };
  const said = new Set(out.filter((x) => !x.structure).map((x) => x.spec + " " + x.code));
  return out.filter((x) => !(x.structure && x.topic && SAME[x.topic].some((c) => said.has(x.spec + " " + c))));
}
