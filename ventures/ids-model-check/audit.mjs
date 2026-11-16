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
// `ids` is parseIds() output; `schemas` maps IFC2X3/IFC4/IFC4X3 to Schema
// objects (any subset: a specification is audited against the schemas its
// ifcVersion names that were passed, or every passed schema when none match).

const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);

const DOUBLE = /^[-+]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][-+]?[0-9]+)?$|^(NaN|INF|\+INF|-INF)$/;
const INTEGER = /^[-+]?[0-9]+$/;
const BOOLEAN = /^(true|false|0|1)$/;
const PARTOF_RELS = ["IFCRELAGGREGATES", "IFCRELASSIGNSTOGROUP", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCRELNESTS", "IFCRELVOIDSELEMENT", "IFCRELFILLSELEMENT"];
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
  if (r.pattern.length && (numeric || prim === "boolean" || prim === "logical")) return { error: `a pattern only applies to text; this value is ${prim === "double" ? "a number" : prim === "integer" ? "an integer" : "a boolean"}, so the pattern can never match` };
  for (const [i, re] of (r.regexes || []).entries()) if (!re) return { error: `pattern /${r.pattern[i]}/ is not a valid regular expression` };
  for (const t of r.enumeration) {
    const p = literalProblem(t, prim, "enumeration value");
    if (p) return { error: p };
  }
  for (const k of ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"]) {
    if (r[k] === undefined) continue;
    if (!DOUBLE.test(r[k])) return { error: `${k} ${JSON.stringify(r[k])} is not a number` };
    if (!numeric && prim !== "unknown") return { warning: `${k} compares numbers, but this value is ${prim === "enum" ? "an enumeration" : "text"}, so it can never match` };
  }
  if (prim === "enum" && enumValues && r.enumeration.length && !r.enumeration.some((t) => enumValues.includes(t))) return { warning: `no listed value is a member of the enumeration, so it can never match` };
  return null;
}

// Every class a specification's applicability names outright, by schema.
function applicableClasses(spec, S, typeMap, id) {
  const ef = spec.applicability.find((f) => f.kind === "entity");
  if (!ef) return null;
  const names = listedNames(ef.name);
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
    if (res.some((re) => !re)) issues.push({ level: "error", code: "pattern-invalid", message: `${where}class name pattern is not a valid regular expression` });
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

function propertyIssues(f, ctx) {
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
  return issues;
}

export function auditIds(ids, { schemas, typeMap } = {}) {
  const out = [];
  ids.specs.forEach((spec, i) => {
    const add = (facet, issue) => out.push({ spec: i, specName: spec.name, facet, ...issue });
    for (const v of spec.ifcVersion) if (!VERSIONS.includes(v)) add(null, { level: "error", code: "version-unknown", message: `ifcVersion ${v} is not one of IFC2X3, IFC4, IFC4X3_ADD2` });
    const ctx = { list: schemasFor(spec, schemas), typeMap };
    if (!ctx.list.length) return;
    if (!spec.applicability.length) add("applicability", { level: "error", code: "applicability-empty", message: "the applicability has no facet; IDS needs at least one" });
    if (spec.optionality === "prohibited" && spec.requirements.length) add("requirements", { level: "error", code: "prohibited-requirements", message: "a prohibited specification (maxOccurs 0) cannot have requirements: it fails when anything matches its applicability, so write the requirement into the applicability or make the specification required" });
    for (const [where, list] of [["applicability", spec.applicability], ["requirements", spec.requirements]]) {
      for (const f of list) {
        const issues = [];
        if (f.kind === "entity") {
          issues.push(...entityNameIssues(f, ctx, ""));
          if (where === "requirements" && !issues.some((x) => x.level === "error")) issues.push(...entityContradiction(f, spec, ctx));
        }
        else if (f.kind === "attribute") issues.push(...attributeIssues(f, spec, ctx));
        else if (f.kind === "property") issues.push(...propertyIssues(f, ctx));
        else if (f.kind === "partOf") {
          if (f.relation && !PARTOF_RELS.includes(f.relation)) issues.push({ level: "error", code: "relation-unknown", message: `partOf relation ${f.relation} is not one of ${PARTOF_RELS.join(", ")}` });
          if (f.entity) issues.push(...entityNameIssues(f.entity, ctx, "partOf: "));
        }
        for (const x of issues) add(where + " " + f.describe(), x);
      }
    }
  });
  return out;
}
