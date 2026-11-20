// What changed between two versions of an IDS: the client's revision of an
// exchange requirement, a stage's IDS against the previous stage's, a national
// set's v2 against v1. A coordinator who receives a new IDS needs to know which
// specifications are new, which were dropped, and which ask more or less than
// before, before re-running a model check and reading every failure again.
//
//   diffIds(oldIds, newIds)          -> { info, specs, summary }
//   revisionImpact(oldCheck, newCheck, diff) -> elements newly failing / fixed per
//                                       specification, from two checkIds results
//   revisionReport(diff, impact)     -> plain text
//
// Specifications are paired by name (when the name is unique in both files),
// then, among those left, by identical applicability (a rename). Facets inside
// a pair are paired by what they ask about: the entity facet by itself, an
// attribute by its name, a property by set and name, a classification by its
// system, a material by itself, partOf by relation and whole. Each change is
// given an effect on the person who must meet the IDS:
//   tighter: more elements checked, or more asked of them (a new required
//            facet, optional to required, a shorter list of allowed values,
//            a narrower range, a removed applicability condition);
//   looser:  the reverse;
//   changed: neither contains the other (a different value, pattern or data
//            type), or a change of meaning (to or from prohibited).
// Value restrictions are compared as sets where that is exact (single values
// and enumerations, numeric bounds with nothing else); anything else that
// differs is "changed". Eval: eval/revision-diff-2026-11-20.md.

import { parseIds } from "./ids.mjs";
import { compareLanguages } from "./pattern-lang.mjs";
import { temporalKind, temporalKey } from "./temporal.mjs";

const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
const parse = (x) => (typeof x === "string" ? parseIds(x) : x);
// A restriction with no facets lets any value through: "(any)", with its base.
const str = (v) => { if (!v || !v.present) return "(any)"; const t = v.toString(); return t !== "" ? t : `(any${v.r && v.r.base ? " " + v.r.base : ""})`; };
const strBase = (v) => str(v) + (v && v.r && v.r.base ? ` [${v.r.base}]` : "");

// The identity of a facet inside a specification section.
export function facetKey(f) {
  switch (f.kind) {
    case "entity": return "entity";
    case "attribute": return "attribute " + str(f.name);
    case "property": return "property " + str(f.propertySet) + "." + str(f.baseName);
    case "classification": return "classification " + str(f.system);
    case "material": return "material";
    case "partOf": return "partOf " + (f.relation || "(any relation)") + " " + (f.entity ? str(f.entity.name) : "(anything)");
    default: return f.kind;
  }
}

// The facet as one line, with what describe() leaves out (data type, uri).
export function facetText(f, section) {
  const card = section === "requirements" && f.kind !== "entity" ? f.cardinality + " " : "";
  return card + f.describe();
}

// The value-like fields of each facet kind (beyond its key).
const VALUE_FIELDS = { entity: ["name", "predefinedType"], attribute: ["value"], property: ["value"], classification: ["value"], material: ["value"], partOf: [] };

const num = (x) => (x === undefined || x === null || x === "" || Number.isNaN(Number(x)) ? null : Number(x));

// The restriction as a plain description for set comparison, or null when it
// cannot be compared exactly. {any:true}; {set:[...]} (finite allowed values);
// {lo, loIn, hi, hiIn} (a numeric interval).
function shape(v) {
  if (!v || !v.present) return { any: true };
  if (v.simple !== undefined) return { set: [v.simple] };
  const r = v.r;
  const bounds = ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].filter((k) => r[k] !== undefined);
  const lens = ["length", "minLength", "maxLength"].some((k) => r[k] !== undefined);
  if (!r.enumeration.length && !r.pattern.length && !bounds.length && !lens) return { any: true };
  if (r.enumeration.length && !r.pattern.length && !bounds.length && !lens) return { set: [...r.enumeration] };
  if (bounds.length && !r.enumeration.length && !r.pattern.length && !lens && bounds.every((k) => num(r[k]) !== null)) {
    const lo = r.minInclusive !== undefined ? num(r.minInclusive) : r.minExclusive !== undefined ? num(r.minExclusive) : -Infinity;
    const hi = r.maxInclusive !== undefined ? num(r.maxInclusive) : r.maxExclusive !== undefined ? num(r.maxExclusive) : Infinity;
    return { lo, loIn: r.minExclusive === undefined, hi, hiIn: r.maxExclusive === undefined };
  }
  return null;
}

// Whether every value interval a lets through, b lets through too.
function intervalWithin(a, b) {
  const loOk = a.lo > b.lo || (a.lo === b.lo && (b.loIn || !a.loIn));
  const hiOk = a.hi < b.hi || (a.hi === b.hi && (b.hiIn || !a.hiIn));
  return loOk && hiOk;
}

// How restriction b compares with restriction a: "same", "tighter" (b lets
// through fewer values), "looser", or "changed".
export function compareValues(a, b) {
  return compareValuesDetail(a, b).effect;
}

// The same, with example values where the restrictions were compared as string
// languages (patterns, or patterns against lists and lengths; pattern-lang.mjs):
// { effect, nowFails, nowPasses }, nowFails a value a matched and b does not.
export function compareValuesDetail(a, b) {
  const effect = compareSets(a, b);
  if (effect !== null) return { effect };
  const numBase = (v) => !!(v && v.r && NUMERIC.test(v.r.base));
  if (!numBase(a) && !numBase(b)) {
    const l = compareLanguages(a, b);
    if (l) return l;
  }
  const ta = temporalShape(a), tb = temporalShape(b);
  if (ta && tb) {
    // Values of one ISO form pass only bounds of that form (ids.mjs), so
    // ranges on two forms share no value.
    if (ta.kind !== tb.kind) return { effect: "changed" };
    const bInA = intervalWithin(tb, ta), aInB = intervalWithin(ta, tb);
    return { effect: bInA && aInB ? "same" : bInA ? "tighter" : aInB ? "looser" : "changed" };
  }
  return { effect: "changed" };
}

// A range whose bounds are all dates, dateTimes, times or durations of one
// form, as an interval on the instants ids.mjs compares (temporal.mjs), or
// null. Plain-date bounds are read exactly as languages first
// (pattern-lang.mjs); this covers zoned dates, dateTimes, times and durations.
function temporalShape(v) {
  if (!v || !v.present || v.simple !== undefined) return null;
  const r = v.r;
  if (r.enumeration.length || r.pattern.length || ["length", "minLength", "maxLength"].some((k) => r[k] !== undefined)) return null;
  const ks = ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].filter((k) => r[k] !== undefined);
  if (!ks.length) return null;
  const kinds = new Set(ks.map((k) => temporalKind(String(r[k]))));
  if (kinds.size !== 1 || kinds.has(null)) return null;
  const key = (k) => temporalKey(String(r[k]));
  if (ks.some((k) => Number.isNaN(key(k)))) return null;
  const lo = Math.max(r.minInclusive !== undefined ? key("minInclusive") : -Infinity, r.minExclusive !== undefined ? key("minExclusive") : -Infinity);
  const hi = Math.min(r.maxInclusive !== undefined ? key("maxInclusive") : Infinity, r.maxExclusive !== undefined ? key("maxExclusive") : Infinity);
  const loIn = !(r.minExclusive !== undefined && key("minExclusive") === lo);
  const hiIn = !(r.maxExclusive !== undefined && key("maxExclusive") === hi);
  if (lo > hi || (lo === hi && !(loIn && hiIn))) return null;
  return { kind: [...kinds][0], lo, loIn, hi, hiIn };
}

const NUMERIC = /^(double|float|decimal|integer|int|long|short|nonNegativeInteger|positiveInteger)$/;

// The exact set comparisons, or null when neither side is a plain set or range.
function compareSets(a, b) {
  const ta = a && a.present ? a.toString() : "";
  const tb = b && b.present ? b.toString() : "";
  // The same restriction on another base: only a move to or from a number
  // base changes how values compare (xs:string and no base read alike).
  const numBase = (v) => !!(v && v.r && /^(double|float|decimal|integer|int|long|short|nonNegativeInteger|positiveInteger)$/.test(v.r.base));
  if (ta === tb) return numBase(a) === numBase(b) ? "same" : "changed";
  const sa = shape(a), sb = shape(b);
  if (!sa || !sb) return null;
  if (sa.any && sb.any) return "same";
  if (sa.any) return "tighter";
  if (sb.any) return "looser";
  if (sa.set && sb.set) {
    const A = new Set(sa.set), B = new Set(sb.set);
    const bInA = [...B].every((x) => A.has(x)), aInB = [...A].every((x) => B.has(x));
    if (bInA && aInB) return "same";
    if (bInA) return "tighter";
    if (aInB) return "looser";
    return "changed";
  }
  if (sa.lo !== undefined && sb.lo !== undefined) {
    const bInA = intervalWithin(sb, sa), aInB = intervalWithin(sa, sb);
    if (bInA && aInB) return "same";
    if (bInA) return "tighter";
    if (aInB) return "looser";
    return "changed";
  }
  // A finite list against a numeric range: exact when every listed value is a number.
  if (sa.set && sb.lo !== undefined && sa.set.every((x) => num(x) !== null)) {
    return sa.set.every((x) => intervalWithin({ lo: num(x), loIn: true, hi: num(x), hiIn: true }, sb)) ? "looser" : "changed";
  }
  if (sb.set && sa.lo !== undefined && sb.set.every((x) => num(x) !== null)) {
    return sb.set.every((x) => intervalWithin({ lo: num(x), loIn: true, hi: num(x), hiIn: true }, sa)) ? "tighter" : "changed";
  }
  return "changed";
}

const flip = (e) => (e === "tighter" ? "looser" : e === "looser" ? "tighter" : e);
const CARD_RANK = { optional: 0, required: 1 };

// Pairs facets of one section by key; duplicates of a key pair in order.
function pairFacets(as, bs) {
  const keyed = (fs) => {
    const seen = new Map();
    return fs.map((f) => { const k = facetKey(f); const n = (seen.get(k) || 0) + 1; seen.set(k, n); return [n > 1 ? `${k} #${n}` : k, f]; });
  };
  const A = new Map(keyed(as)), B = new Map(keyed(bs));
  const out = [];
  for (const [k, f] of A) out.push([k, f, B.get(k) || null]);
  for (const [k, f] of B) if (!A.has(k)) out.push([k, null, f]);
  return out;
}

// The changes inside one section. In applicability a tighter condition selects
// fewer elements, which asks less of the model, so its effect is flipped.
function sectionChanges(section, as, bs) {
  const changes = [];
  const add = (key, kind, effect, before, after, what) => changes.push({ section, key, kind, effect, before, after, what });
  for (const [key, a, b] of pairFacets(as, bs)) {
    if (a && !b) {
      // Removing an applicability condition makes the specification select more.
      const effect = section === "applicability" ? "tighter" : a.cardinality === "optional" && !hasValue(a) ? "same" : "looser";
      add(key, "removed", effect, facetText(a, section), null, section === "applicability" ? "condition removed: selects more elements" : "requirement removed");
      continue;
    }
    if (!a && b) {
      const effect = section === "applicability" ? "looser" : "tighter";
      add(key, "added", effect, null, facetText(b, section), section === "applicability" ? "condition added: selects fewer elements" : b.cardinality === "optional" ? "optional requirement added: checks the value where present" : b.cardinality === "prohibited" ? "prohibition added" : "requirement added");
      continue;
    }
    const before = facetText(a, section), after = facetText(b, section);
    if (section === "requirements" && a.cardinality !== b.cardinality) {
      const ra = own(CARD_RANK, a.cardinality), rb = own(CARD_RANK, b.cardinality);
      const effect = ra !== undefined && rb !== undefined ? (rb > ra ? "tighter" : "looser") : "changed";
      add(key, "cardinality", effect, a.cardinality, b.cardinality, `${a.cardinality} to ${b.cardinality}`);
    }
    for (const field of own(VALUE_FIELDS, a.kind) || []) {
      const d = compareValuesDetail(a[field], b[field]);
      let c = d.effect;
      if (c === "same") continue;
      // A prohibited facet forbids the values it lists, so fewer listed is looser.
      if (section === "requirements" && b.cardinality === "prohibited" && a.cardinality === "prohibited") c = flip(c);
      if (section === "applicability") c = flip(c);
      const same = str(a[field]) === str(b[field]);
      const sa = same ? strBase(a[field]) : str(a[field]), sb = same ? strBase(b[field]) : str(b[field]);
      add(key, field, c, sa, sb, `${field === "value" ? "value" : field === "name" ? "class" : "predefined type"} ${sa} to ${sb}${examples(d)}`);
      if (d.nowFails !== undefined || d.nowPasses !== undefined) Object.assign(changes[changes.length - 1], { nowFails: d.nowFails, nowPasses: d.nowPasses });
    }
    if ((a.dataType || null) !== (b.dataType || null)) add(key, "dataType", a.dataType && !b.dataType ? "looser" : !a.dataType && b.dataType ? "tighter" : "changed", a.dataType || "(none)", b.dataType || "(none)", `data type ${a.dataType || "(none)"} to ${b.dataType || "(none)"}`);
    if (a.kind === "partOf" && a.entity && b.entity) {
      const c = compareValues(a.entity.predefinedType, b.entity.predefinedType);
      if (c !== "same") add(key, "partOfType", section === "applicability" ? flip(c) : c, str(a.entity.predefinedType), str(b.entity.predefinedType), `whole's predefined type ${str(a.entity.predefinedType)} to ${str(b.entity.predefinedType)}`);
    }
    if ((a.uri || null) !== (b.uri || null)) add(key, "uri", "same", a.uri || "(none)", b.uri || "(none)", `bSDD link ${a.uri || "(none)"} to ${b.uri || "(none)"}`);
  }
  return changes;
}
// The example values of a language comparison, in words that hold in every
// section ("matched" is "selected" in applicability, "allowed" in requirements).
function examples(d) {
  const bits = [];
  if (d.nowFails !== undefined) bits.push(`${JSON.stringify(d.nowFails)} matched before, not now`);
  if (d.nowPasses !== undefined) bits.push(`${JSON.stringify(d.nowPasses)} matches now, not before`);
  return bits.length ? ` (e.g. ${bits.join("; ")})` : "";
}
const hasValue = (f) => (own(VALUE_FIELDS, f.kind) || []).some((k) => f[k] && f[k].present);

const OPT_RANK = { optional: 0, required: 1 };

function specChanges(a, b) {
  const changes = [];
  if (a.optionality !== b.optionality) {
    const ra = own(OPT_RANK, a.optionality), rb = own(OPT_RANK, b.optionality);
    changes.push({ section: "specification", key: "optionality", kind: "optionality", effect: ra !== undefined && rb !== undefined ? (rb > ra ? "tighter" : "looser") : "changed", before: a.optionality, after: b.optionality, what: `${a.optionality} to ${b.optionality}` });
  }
  const va = a.ifcVersion.join(" "), vb = b.ifcVersion.join(" ");
  if (va !== vb) changes.push({ section: "specification", key: "ifcVersion", kind: "ifcVersion", effect: "same", before: va, after: vb, what: `IFC versions ${va || "(none)"} to ${vb || "(none)"}` });
  if (a.name !== b.name) changes.push({ section: "specification", key: "name", kind: "renamed", effect: "same", before: a.name, after: b.name, what: `renamed from "${a.name}"` });
  for (const k of ["description", "instructions"]) if ((a[k] || "") !== (b[k] || "")) changes.push({ section: "specification", key: k, kind: k, effect: "same", before: a[k], after: b[k], what: `${k} reworded` });
  changes.push(...sectionChanges("applicability", a.applicability, b.applicability));
  changes.push(...sectionChanges("requirements", a.requirements, b.requirements));
  return changes;
}

const appKey = (s) => s.applicability.map((f) => facetText(f, "applicability")).sort().join(" | ") + " @ " + s.ifcVersion.join(" ");

// One effect for a specification from its changes.
export function overallEffect(changes) {
  const effs = new Set(changes.map((c) => c.effect).filter((e) => e !== "same"));
  if (!effs.size) return changes.length ? "metadata" : "same";
  if (effs.size === 1) return [...effs][0];
  return "mixed";
}

export function diffIds(oldIds, newIds) {
  const A = parse(oldIds), B = parse(newIds);
  const info = [];
  const keys = new Set([...Object.keys(A.info || {}), ...Object.keys(B.info || {})]);
  for (const k of keys) if ((A.info[k] || null) !== (B.info[k] || null)) info.push({ field: k, before: A.info[k] || null, after: B.info[k] || null });
  const count = (ss) => { const m = new Map(); for (const s of ss) m.set(s.name, (m.get(s.name) || 0) + 1); return m; };
  const ca = count(A.specs), cb = count(B.specs);
  const pairs = []; // [oldIndex, newIndex]
  const usedA = new Set(), usedB = new Set();
  // 1. Unique names in both.
  B.specs.forEach((s, j) => {
    if (cb.get(s.name) !== 1 || ca.get(s.name) !== 1) return;
    const i = A.specs.findIndex((x) => x.name === s.name);
    pairs.push([i, j]); usedA.add(i); usedB.add(j);
  });
  // 2. Repeated names: pair in order of appearance.
  const byName = new Map();
  A.specs.forEach((s, i) => { if (!usedA.has(i)) { if (!byName.has(s.name)) byName.set(s.name, []); byName.get(s.name).push(i); } });
  B.specs.forEach((s, j) => {
    if (usedB.has(j)) return;
    const q = byName.get(s.name);
    if (q && q.length && ca.get(s.name) > 1) { const i = q.shift(); pairs.push([i, j]); usedA.add(i); usedB.add(j); }
  });
  // 3. Renames: identical applicability and versions, unique among those left.
  const leftA = A.specs.map((s, i) => [i, appKey(s)]).filter(([i]) => !usedA.has(i));
  const leftB = B.specs.map((s, j) => [j, appKey(s)]).filter(([j]) => !usedB.has(j));
  for (const [j, kb] of leftB) {
    const cands = leftA.filter(([i, ka]) => ka === kb && !usedA.has(i));
    const others = leftB.filter(([j2, k2]) => k2 === kb && !usedB.has(j2));
    if (cands.length === 1 && others.length === 1) { const i = cands[0][0]; pairs.push([i, j]); usedA.add(i); usedB.add(j); }
  }
  // 4. A leading section number ("3.3 Storey names", "(3.3) Levels",
  // "EIR-04: ...") unique on both sides: national sets renumber rarely and
  // reword often.
  const code = (n) => { const m = /^\s*[([]?\s*([A-Za-z]{0,6}[-_ ]?\d+(?:[.\-_]\d+)*)\s*[)\]]?(?=[\s:.\-_]|$)/.exec(n); return m ? m[1].toUpperCase().replace(/[-_ ]/g, "") : null; };
  const codesLeft = (ss, used) => { const m = new Map(); ss.forEach((s, i) => { if (used.has(i)) return; const c = code(s.name); if (c) m.set(c, m.has(c) ? -1 : i); }); return m; };
  const codeA = codesLeft(A.specs, usedA), codeB = codesLeft(B.specs, usedB);
  for (const [c, j] of codeB) { const i = codeA.get(c); if (j >= 0 && i !== undefined && i >= 0) { pairs.push([i, j]); usedA.add(i); usedB.add(j); } }
  const specs = [];
  for (const [i, j] of pairs.sort((x, y) => x[1] - y[1])) {
    const changes = specChanges(A.specs[i], B.specs[j]);
    const effect = overallEffect(changes);
    specs.push({ status: changes.length ? "changed" : "same", effect, oldIndex: i, newIndex: j, name: B.specs[j].name, oldName: A.specs[i].name, changes });
  }
  B.specs.forEach((s, j) => { if (!usedB.has(j)) specs.push({ status: "added", effect: s.optionality === "optional" ? "same" : "tighter", oldIndex: null, newIndex: j, name: s.name, oldName: null, changes: [], spec: summarizeSpec(s) }); });
  A.specs.forEach((s, i) => { if (!usedA.has(i)) specs.push({ status: "removed", effect: s.optionality === "optional" ? "same" : "looser", oldIndex: i, newIndex: null, name: s.name, oldName: s.name, changes: [], spec: summarizeSpec(s) }); });
  const by = (st) => specs.filter((s) => s.status === st).length;
  const changed = specs.filter((s) => s.status === "changed");
  const summary = {
    oldSpecs: A.specs.length, newSpecs: B.specs.length,
    added: by("added"), removed: by("removed"), changed: changed.length, same: by("same"),
    renamed: changed.filter((s) => s.oldName !== s.name).length,
    tighter: changed.filter((s) => s.effect === "tighter").length,
    looser: changed.filter((s) => s.effect === "looser").length,
    mixed: changed.filter((s) => s.effect === "mixed" || s.effect === "changed").length,
    metadata: changed.filter((s) => s.effect === "metadata" || s.effect === "same").length,
  };
  // Where a file breaks ids.xsd the diff reads it as this checker does (an
  // IDS 0.9 <n> for <name> reads as "any name"), so say so.
  const xsd = (x) => (x.structure || []).length;
  return { oldTitle: A.title, newTitle: B.title, info, specs, summary, oldXsdFaults: xsd(A), newXsdFaults: xsd(B) };
}

function summarizeSpec(s) {
  return {
    optionality: s.optionality,
    ifcVersion: s.ifcVersion,
    applicability: s.applicability.map((f) => facetText(f, "applicability")),
    requirements: s.requirements.map((f) => facetText(f, "requirements")),
  };
}

// Elements newly failing and newly passing, per specification, from checkIds
// results of the old and the new IDS on one model. Elements are matched by
// GlobalId where they have one, else by #id. When a check kept only the first
// N failures (maxFailed), the lists are partial and `partial` says so.
export function revisionImpact(oldCheck, newCheck, diff) {
  const key = (e) => e.globalId || "#" + e.id;
  const out = [];
  let newlyFailing = 0, fixed = 0, more = 0;
  for (const s of diff.specs) {
    const a = s.oldIndex !== null ? oldCheck.specs[s.oldIndex] : null;
    const b = s.newIndex !== null ? newCheck.specs[s.newIndex] : null;
    const fa = new Map((a ? a.failed : []).map((e) => [key(e), e]));
    const fb = new Map((b ? b.failed : []).map((e) => [key(e), e]));
    // An invalid specification is not run (checkIds), so its empty failure
    // list says nothing: no element counts as fixed or newly failing.
    const invalid = (a && a.status === "invalid") || (b && b.status === "invalid");
    const nowFail = invalid ? [] : [...fb.values()].filter((e) => !fa.has(key(e)));
    const nowPass = invalid ? [] : [...fa.values()].filter((e) => !fb.has(key(e)));
    // Elements failing on both sides that the revision gives more to fix: a
    // reason the old check did not give them.
    const moreToFix = [];
    if (!invalid) for (const [k, e] of fb) { const o = fa.get(k); if (!o) continue; const had = new Set(o.reasons); const extra = e.reasons.filter((r) => !had.has(r)); if (extra.length) moreToFix.push({ ...e, reasons: extra }); }
    const partial = !!((a && a.failedCount) || (b && b.failedCount));
    const row = {
      name: s.name, status: s.status,
      before: a ? { status: a.status, applicable: a.applicable, failed: a.failedCount ?? a.failed.length, ...(a.invalid ? { invalid: a.invalid } : {}) } : null,
      after: b ? { status: b.status, applicable: b.applicable, failed: b.failedCount ?? b.failed.length, ...(b.invalid ? { invalid: b.invalid } : {}) } : null,
      newlyFailing: nowFail, moreToFix, fixed: nowPass, partial, notCompared: !!invalid,
    };
    newlyFailing += nowFail.length; fixed += nowPass.length; more += moreToFix.length;
    out.push(row);
  }
  const verdictChanged = out.filter((r) => r.before && r.after && r.before.status !== r.after.status).length;
  const notCompared = out.filter((r) => r.notCompared).length;
  return { specs: out, newlyFailing, moreToFix: more, fixed, verdictChanged, notCompared, passBefore: oldCheck.pass, passAfter: newCheck.pass };
}

const EFFECT_WORD = { tighter: "asks more", looser: "asks less", changed: "asks something different", mixed: "asks more in some ways, less in others", metadata: "metadata only (names, descriptions, IFC versions, bSDD links)", same: "no change" };

export function revisionReport(diff, impact = null, { maxElements = 10 } = {}) {
  const L = [];
  const s = diff.summary;
  L.push(`IDS revision: ${diff.oldTitle || "(untitled)"} -> ${diff.newTitle || "(untitled)"}`);
  L.push(`${s.oldSpecs} specification(s) before, ${s.newSpecs} after: ${s.added} added, ${s.removed} removed, ${s.changed} changed (${s.tighter} ask more, ${s.looser} ask less, ${s.mixed} mixed or different, ${s.metadata} metadata only${s.renamed ? `; ${s.renamed} renamed` : ""}), ${s.same} unchanged.`);
  for (const i of diff.info) L.push(`  info ${i.field}: ${i.before ?? "(none)"} -> ${i.after ?? "(none)"}`);
  for (const [which, n] of [["old", diff.oldXsdFaults], ["new", diff.newXsdFaults]]) if (n) L.push(`  note: the ${which} file breaks ids.xsd in ${n} place(s) (node cli.mjs --audit names them); it is compared as this checker reads it, which validating tools may refuse`);
  const imp = impact ? new Map(impact.specs.map((r) => [r.name + "\u0000" + r.status, r])) : null;
  const impactLines = (sp) => {
    if (!imp) return;
    const r = imp.get(sp.name + "\u0000" + sp.status);
    if (!r) return;
    const b = r.before, a = r.after;
    const fmt = (x) => (!x ? "-" : x.status === "invalid" ? "invalid IDS, not checked" : `${x.status}, ${x.failed} of ${x.applicable} failing`);
    L.push(`    on the model: before ${fmt(b)}; after ${fmt(a)}`);
    for (const [when, x] of [["old", b], ["new", a]]) if (x && x.invalid) L.push(`    the ${when} specification is invalid, so elements are not compared: ${x.invalid.join("; ")}`);
    if (r.newlyFailing.length) {
      L.push(`    newly failing (${r.newlyFailing.length}${r.partial ? ", of the failures kept" : ""}):`);
      for (const e of r.newlyFailing.slice(0, maxElements)) L.push(`      ${e.type} #${e.id}${e.globalId ? " " + e.globalId : ""}${e.name ? ` "${e.name}"` : ""}: ${e.reasons.join("; ")}`);
      if (r.newlyFailing.length > maxElements) L.push(`      ... ${r.newlyFailing.length - maxElements} more`);
    }
    if (r.moreToFix.length) {
      L.push(`    already failing, with more to fix (${r.moreToFix.length}${r.partial ? ", of the failures kept" : ""}):`);
      for (const e of r.moreToFix.slice(0, maxElements)) L.push(`      ${e.type} #${e.id}${e.globalId ? " " + e.globalId : ""}${e.name ? ` "${e.name}"` : ""}: ${e.reasons.join("; ")}`);
      if (r.moreToFix.length > maxElements) L.push(`      ... ${r.moreToFix.length - maxElements} more`);
    }
    if (r.fixed.length) L.push(`    no longer failing: ${r.fixed.length}`);
  };
  const section = (title, list, fn) => {
    if (!list.length) return;
    L.push("");
    L.push(title);
    for (const sp of list) fn(sp);
  };
  section("Added:", diff.specs.filter((x) => x.status === "added"), (sp) => {
    L.push(`  + ${sp.name} (${sp.spec.optionality})`);
    L.push(`    applies to: ${sp.spec.applicability.join("; ") || "(everything)"}`);
    for (const r of sp.spec.requirements) L.push(`    requires: ${r}`);
    impactLines(sp);
  });
  section("Removed:", diff.specs.filter((x) => x.status === "removed"), (sp) => {
    L.push(`  - ${sp.name} (${sp.spec.optionality})`);
    impactLines(sp);
  });
  section("Changed:", diff.specs.filter((x) => x.status === "changed"), (sp) => {
    L.push(`  ~ ${sp.name}${sp.oldName !== sp.name ? ` (was "${sp.oldName}")` : ""}: ${own(EFFECT_WORD, sp.effect) || sp.effect}`);
    for (const c of sp.changes) {
      if (c.kind === "renamed") continue;
      const tag = c.effect === "same" ? "" : ` [${c.effect}]`;
      const where = c.section === "specification" ? "" : `${c.section} ${c.key}: `;
      L.push(`    ${where}${c.what}${tag}`);
      if ((c.kind === "added" || c.kind === "removed") && (c.after || c.before)) L.push(`      ${c.after || c.before}`);
    }
    impactLines(sp);
  });
  if (impact) {
    L.push("");
    L.push(`On the model: ${impact.newlyFailing} element failure(s) new, ${impact.moreToFix} failing element(s) with more to fix, ${impact.fixed} gone; ${impact.verdictChanged} specification verdict(s) changed${impact.notCompared ? `, ${impact.notCompared} not compared (an invalid side)` : ""}; overall ${impact.passBefore ? "pass" : "fail"} -> ${impact.passAfter ? "pass" : "fail"}.`);
  }
  return L.join("\n") + "\n";
}
