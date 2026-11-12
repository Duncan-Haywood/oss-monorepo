// Semver Range Explainer engine. Pure ES module, no imports, no I/O.
//
// Reimplements the range rules npm uses (the node-semver package, 7.x) from
// its documented behaviour: the range grammar, how ^ ~ x-ranges and hyphen
// ranges desugar into comparators, and the prerelease rule (a prerelease
// version only matches a comparator set that names a prerelease on the same
// major.minor.patch). Written independently and checked against node-semver
// 7.7.4 by a differential test (semver.diff.test.mjs); no node-semver code is
// copied. Version precedence follows Semantic Versioning 2.0.0, section 11.
//
// On top of matching, it answers questions node-semver has no single call
// for, exactly: does range A cover everything range B allows, do they
// overlap, and if not, which version proves it. Those come from a finite
// candidate set (every comparator boundary and its immediate successors, per
// release and per prerelease tuple a range names), which is complete because
// a range's verdict is constant between consecutive boundaries within each of
// those classes.

const MAX_LENGTH = 256;

/**
 * The node-semver releases whose rules differ in corners this engine models.
 * 7.8 is what npm 11 (Node 24) bundles, 7.7 what npm 10 (Node 22) bundles.
 */
export const SEMVER_FLAVOURS = {
  "7.8": "node-semver 7.8+ (npm 11, Node 24 and later)",
  "7.7": "node-semver 7.7 and earlier (npm 10, Node 22)",
};
export const DEFAULT_SEMVER = "7.8";

/** Which flavour a node-semver version string ("7.7.4") follows. */
export function semverFlavourFor(version) {
  const m = /(\d+)\.(\d+)/.exec(String(version || ""));
  if (!m) return DEFAULT_SEMVER;
  return +m[1] > 7 || (+m[1] === 7 && +m[2] >= 8) ? "7.8" : "7.7";
}
const NR = "0|[1-9]\\d*";
const XR = "[xX*]|0|[1-9]\\d*";
const PRE_ID = "(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*)";
const PRE = `${PRE_ID}(?:\\.${PRE_ID})*`;
const BUILD = "[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*";
const VERSION_RE = new RegExp(`^v?(${NR})\\.(${NR})\\.(${NR})(?:-(${PRE}))?(?:\\+(${BUILD}))?$`);
const PARTIAL = `[v=\\s]*(${XR})(?:\\.(${XR})(?:\\.(${XR})(?:-(${PRE}))?(?:\\+${BUILD})?)?)?`;
const HYPHEN_RE = new RegExp(`^\\s*(${PARTIAL.replace(/\((?!\?)/g, "(?:")})\\s+-\\s+(${PARTIAL.replace(/\((?!\?)/g, "(?:")})\\s*$`);
const PARTIAL_RE = new RegExp(`^${PARTIAL}$`);
const CARET_RE = new RegExp(`^\\^${PARTIAL}$`);
const TILDE_RE = new RegExp(`^~>?${PARTIAL}$`);
const XRANGE_RE = new RegExp(`^((?:<|>)?=?)\\s*${PARTIAL}$`);
const COMPARATOR_RE = new RegExp(`^((?:<|>)?=?)\\s*(v?(?:${NR})\\.(?:${NR})\\.(?:${NR})(?:-${PRE})?(?:\\+${BUILD})?)$`);

const isX = (s) => s === undefined || s === "" || s === "x" || s === "X" || s === "*";

// ---------------------------------------------------------------- versions

/** Parse a full version ("1.2.3", "v1.2.3-beta.1+build"). Returns null if invalid. */
export function parseVersion(input) {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (s.length > MAX_LENGTH) return null;
  const m = VERSION_RE.exec(s);
  if (!m) return null;
  const nums = [m[1], m[2], m[3]].map(Number);
  if (nums.some((n) => !Number.isSafeInteger(n))) return null;
  return mk(nums[0], nums[1], nums[2], m[4] ? m[4].split(".") : [], m[5] ? m[5].split(".") : []);
}

function mk(major, minor, patch, pre = [], build = []) {
  return { major, minor, patch, pre, build };
}

/** The canonical string (no leading v, no build metadata). */
export function format(v) {
  return `${v.major}.${v.minor}.${v.patch}${v.pre.length ? "-" + v.pre.join(".") : ""}`;
}

const numeric = (id) => /^\d+$/.test(id);
function cmpId(a, b) {
  const na = numeric(a), nb = numeric(b);
  if (na && nb) return a.length !== b.length ? (a.length < b.length ? -1 : 1) : a < b ? -1 : a > b ? 1 : 0;
  if (na) return -1;
  if (nb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semver 2.0.0 precedence: -1, 0 or 1. Build metadata is ignored. */
export function compare(a, b) {
  for (const k of ["major", "minor", "patch"]) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; ; i++) {
    if (i >= a.pre.length && i >= b.pre.length) return 0;
    if (i >= a.pre.length) return -1;
    if (i >= b.pre.length) return 1;
    const c = cmpId(a.pre[i], b.pre[i]);
    if (c) return c;
  }
}

const sameTuple = (a, b) => a.major === b.major && a.minor === b.minor && a.patch === b.patch;

// ------------------------------------------------------------------ ranges

/**
 * Parse a range into comparator sets. Each set is { comparators, steps },
 * where a comparator is { op, version } (op one of < <= > >= =) or { any: true },
 * and steps record how each written token became comparators.
 * Throws an Error with a readable message when the range is not valid.
 */
export function parseRange(input, { includePrerelease = false, semver = DEFAULT_SEMVER } = {}) {
  if (typeof input !== "string") throw new Error("A range must be text.");
  if (input.length > MAX_LENGTH) throw new Error(`A range is limited to ${MAX_LENGTH} characters.`);
  const raw = input.trim().replace(/\s+/g, " ");
  if (!SEMVER_FLAVOURS[semver]) throw new Error(`Unknown node-semver version "${semver}"; use one of ${Object.keys(SEMVER_FLAVOURS).join(", ")}.`);
  const written = raw.split("||").map((part) => parseSet(part.trim(), includePrerelease, semver));
  // node-semver's set-level rules: with several branches, unsatisfiable ones
  // (<0.0.0-0) are dropped, and a branch that is a lone "*" replaces them all,
  // which also drops any prereleases the other branches had opened.
  let sets = written;
  const collapsed = [];
  if (sets.length > 1) {
    const kept = sets.filter((x) => !isNullSet(x));
    sets = kept.length ? kept : [sets[0]];
    if (sets.length > 1) {
      const star = sets.find((x) => x.comparators.length === 1 && x.comparators[0].any);
      if (star) { collapsed.push(star.written || "*"); sets = [star]; }
    }
  }
  return { raw: input, includePrerelease, semver, sets, written, collapsedToAny: collapsed.length > 0 };
}

const isNullSet = (set) => set.comparators.length === 1 && !set.comparators[0].any && set.comparators[0].op === "<" && format(set.comparators[0].version) === "0.0.0-0";

function parseSet(text, incPre, flavour) {
  const steps = [];
  let tokens;
  const h = HYPHEN_RE.exec(text);
  if (h) {
    const out = hyphen(h[1], h[2], incPre);
    steps.push({ written: text, rule: "hyphen", becomes: out || "*" });
    tokens = out ? out.split(" ") : [""];
  } else {
    const squeezed = text
      .replace(/(^|\s)((?:<|>)?=?)\s+(?=[v=\s]*(?:[xX*]|\d))/g, "$1$2")
      .replace(/(^|\s)~>?\s+/g, "$1~")
      .replace(/(^|\s)\^\s+/g, "$1^");
    tokens = squeezed.split(" ");
  }
  // npm drops a token that is exactly ">=0.0.0" (">=0.0.0-0" with includePrerelease) as a no-op.
  const zero = incPre ? /^\s*>=\s*0\.0\.0-0\s*$/ : /^\s*>=\s*0\.0\.0\s*$/;
  const comparators = [];
  const seen = new Set();
  let nullSet = null;
  for (const tok of tokens) {
    const [out, rule] = desugar(tok, incPre, flavour);
    if (rule && !h) steps.push({ written: tok, rule, becomes: out || "*" });
    for (const c of out.split(/\s+/)) {
      const cmp = comparator(zero.test(c) ? "" : c, h ? text : tok);
      if (!cmp.any && cmp.op === "<" && format(cmp.version) === "0.0.0-0") nullSet = cmp;
      const key = cmp.any ? "" : cmp.op + format(cmp.version);
      if (seen.has(key)) continue;
      seen.add(key);
      comparators.push(cmp);
    }
  }
  // Every token is parsed (and can fail) first; then an unsatisfiable one stands for the whole branch.
  if (nullSet) return { written: text, comparators: [nullSet], steps };
  const real = comparators.filter((c) => !c.any);
  return { written: text, comparators: real.length ? real : [{ any: true }], steps };
}

function comparator(text, written) {
  if (text === "") return { any: true };
  const m = COMPARATOR_RE.exec(text);
  if (!m) throw new Error(invalidMessage(written));
  const version = parseVersion(m[2]);
  if (!version) throw new Error(invalidMessage(written));
  return { op: m[1] || "=", version };
}

function invalidMessage(tok) {
  const t = tok.trim();
  if (t === "-") return 'A lone "-" is only valid as a hyphen range on its own, like "1.2.3 - 2.3.4", with nothing else in the same || branch.';
  if (/^(latest|next|beta|canary|alpha|rc|stable)$/i.test(t)) return `"${t}" is a dist-tag, not a range. npm resolves tags from the registry; semver ranges cannot express them.`;
  if (/^(&&|,|and)$/i.test(t) || t.includes(",")) return `"${t}" is not part of range syntax: a space means AND, "||" means OR.`;
  if (/^(git|https?|file|npm|workspace|link):|\//.test(t)) return `"${t}" is a URL, path or protocol spec, not a semver range.`;
  if (/[xX*]\.\d/.test(t)) return `"${t}" has a number after an x. node-semver 7.8 and later (npm 11) reject that in a bare or <>= x-range; write it with x to the end, like 1.x.`;
  if (/^\d+\.\d+\.\d+\.\d+/.test(t)) return `"${t}" has four numbers; semver versions have exactly three (major.minor.patch).`;
  if (/(^|\.)0\d/.test(t.replace(/-.*/, ""))) return `"${t}" has a leading zero; semver numbers cannot start with 0 unless they are 0.`;
  return `"${t}" is not a valid comparator.`;
}

function desugar(tok, incPre, flavour) {
  let m;
  if ((m = CARET_RE.exec(tok))) return [caret(m, incPre, flavour), "caret"];
  if ((m = TILDE_RE.exec(tok))) return [tilde(m, flavour === "7.8" ? incPre : false), "tilde"];
  if ((m = XRANGE_RE.exec(tok))) {
    // 7.8 stopped accepting an x followed by a number ("1.x.2", "x.1") in a bare or <>= x-range.
    const [, , M, mi, p] = m;
    if (flavour === "7.8" && ((isX(M) && mi !== undefined && !isX(mi)) || (isX(mi) && p !== undefined && !isX(p)))) return [tok, null];
    const out = xrange(m, incPre);
    return [out, out === tok ? null : m[1] ? "partial" : "x-range"];
  }
  return [tok, null];
}

function caret(m, incPre, flavour) {
  const [, M, mi, p, pr] = m;
  const z = incPre ? "-0" : "";
  if (isX(M)) return "";
  if (isX(mi)) return `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
  if (isX(p)) return M === "0" ? `>=${M}.${mi}.0${z} <${M}.${+mi + 1}.0-0` : `>=${M}.${mi}.0${z} <${+M + 1}.0.0-0`;
  // 7.7 gives a full 0.x version the "-0" floor under includePrerelease; 7.8 dropped that, and 1.x never had it.
  const from = `>=${M}.${mi}.${p}${pr ? "-" + pr : M === "0" && flavour === "7.7" ? z : ""}`;
  if (M === "0") return mi === "0" ? `${from} <${M}.${mi}.${+p + 1}-0` : `${from} <${M}.${+mi + 1}.0-0`;
  return `${from} <${+M + 1}.0.0-0`;
}

function tilde(m, incPre) {
  const [, M, mi, p, pr] = m;
  const z = incPre ? "-0" : "";
  if (isX(M)) return "";
  if (isX(mi)) return `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
  if (isX(p)) return `>=${M}.${mi}.0${z} <${M}.${+mi + 1}.0-0`;
  return `>=${M}.${mi}.${p}${pr ? "-" + pr : ""} <${M}.${+mi + 1}.0-0`;
}

function xrange(m, incPre) {
  let [whole, gtlt, M, mi, p, pr] = m;
  const xM = isX(M), xm = xM || isX(mi), xp = xm || isX(p), anyX = xp;
  if (gtlt === "=" && anyX) gtlt = "";
  let z = incPre ? "-0" : "";
  if (xM) return gtlt === ">" || gtlt === "<" ? "<0.0.0-0" : "";
  if (gtlt && anyX) {
    let a = +M, b = xm ? 0 : +mi, c = 0;
    if (gtlt === ">") {
      gtlt = ">=";
      if (xm) { a += 1; b = 0; } else { b += 1; }
    } else if (gtlt === "<=") {
      gtlt = "<";
      if (xm) a += 1; else b += 1;
    }
    if (gtlt === "<") z = "-0";
    return `${gtlt}${a}.${b}.${c}${z}`;
  }
  if (xm) return `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
  if (xp) return `>=${M}.${mi}.0${z} <${M}.${+mi + 1}.0-0`;
  void pr;
  return whole;
}

function hyphen(fromText, toText, incPre) {
  const f = PARTIAL_RE.exec(fromText), t = PARTIAL_RE.exec(toText);
  const [, fM, fm, fp, fpr] = f, [, tM, tm, tp, tpr] = t;
  const z = incPre ? "-0" : "";
  let from;
  if (isX(fM)) from = "";
  else if (isX(fm)) from = `>=${fM}.0.0${z}`;
  else if (isX(fp)) from = `>=${fM}.${fm}.0${z}`;
  else if (fpr) from = `>=${fromText}`;
  else from = `>=${fromText}${z}`;
  let to;
  if (isX(tM)) to = "";
  else if (isX(tm)) to = `<${+tM + 1}.0.0-0`;
  else if (isX(tp)) to = `<${tM}.${+tm + 1}.0-0`;
  else if (tpr) to = `<=${toText}`;
  else if (incPre) to = `<${tM}.${tm}.${+tp + 1}-0`;
  else to = `<=${toText}`;
  return `${from} ${to}`.trim();
}

/** The comparator form of one set, as node-semver prints it ("" for any). */
export function setString(set) {
  return set.comparators.map((c) => (c.any ? "" : `${c.op === "=" ? "" : c.op}${format(c.version)}`)).join(" ").trim();
}

/** The whole range in comparator form, sets joined by "||". */
export function rangeString(range) {
  return range.sets.map(setString).join("||");
}

// ---------------------------------------------------------------- matching

function testComparator(c, v) {
  if (c.any) return true;
  const r = compare(v, c.version);
  switch (c.op) {
    case "=": return r === 0;
    case "<": return r < 0;
    case "<=": return r <= 0;
    case ">": return r > 0;
    case ">=": return r >= 0;
  }
  return false;
}

/** Why one set accepts or rejects a version: { ok, failed?, prereleaseBlocked? }. */
export function testSet(set, v, includePrerelease = false) {
  for (const c of set.comparators) if (!testComparator(c, v)) return { ok: false, failed: c };
  if (v.pre.length && !includePrerelease) {
    const opener = set.comparators.find((c) => !c.any && c.version.pre.length && sameTuple(c.version, v));
    if (!opener) return { ok: false, prereleaseBlocked: true };
    return { ok: true, opener };
  }
  return { ok: true };
}

function rangeOf(range, opts) {
  return typeof range === "string" ? parseRange(range, opts) : range;
}

function versionOf(v) {
  const p = typeof v === "string" ? parseVersion(v) : v;
  if (!p) throw new Error(`"${v}" is not a valid semver version.`);
  return p;
}

/** True when the version satisfies the range (npm's default rules unless includePrerelease). */
export function satisfies(version, range, { includePrerelease = false, semver = DEFAULT_SEMVER } = {}) {
  const r = rangeOf(range, { includePrerelease, semver });
  const v = versionOf(version);
  return r.sets.some((s) => testSet(s, v, r.includePrerelease).ok);
}

const cmpText = (c) => (c.any ? "*" : `${c.op === "=" ? "=" : c.op}${format(c.version)}`);

/** A plain-words verdict for one version against a range. */
export function explainVersion(version, range, { includePrerelease = false, semver = DEFAULT_SEMVER } = {}) {
  const r = rangeOf(range, { includePrerelease, semver });
  const v = parseVersion(String(version));
  if (!v) return { version: String(version).trim(), valid: false, ok: false, reason: invalidVersionReason(String(version).trim()) };
  includePrerelease = r.includePrerelease;
  const perSet = r.sets.map((s, i) => ({ set: i, ...testSet(s, v, includePrerelease) }));
  const hit = perSet.find((x) => x.ok);
  const text = format(v);
  if (hit) {
    const s = r.sets[hit.set];
    const where = r.sets.length > 1 ? ` (branch ${hit.set + 1}, ${setString(s) || "*"})` : "";
    const extra = hit.opener ? `; it is a prerelease, allowed because ${cmpText(hit.opener)} names a prerelease of ${v.major}.${v.minor}.${v.patch}` : v.pre.length ? "; prereleases are allowed because includePrerelease is on" : "";
    return { version: text, valid: true, ok: true, set: hit.set, reason: `matches${where}${extra}.` };
  }
  const reasons = perSet.map((x) => {
    const s = r.sets[x.set];
    const label = r.sets.length > 1 ? `branch ${x.set + 1} (${setString(s) || "*"}): ` : "";
    if (x.prereleaseBlocked)
      return `${label}${text} is inside the bounds, but it is a prerelease and no comparator in this branch names a prerelease of ${v.major}.${v.minor}.${v.patch}, so npm skips it`;
    return `${label}fails ${cmpText(x.failed)}`;
  });
  return { version: text, valid: true, ok: false, blockedByPrerelease: perSet.some((x) => x.prereleaseBlocked), reason: reasons.join("; ") + "." };
}

function invalidVersionReason(s) {
  if (/^=/.test(s)) return `"${s}" is not a version: drop the leading "=".`;
  if (/^\d+(\.\d+)?$/.test(s)) return `"${s}" is not a full version: semver needs major.minor.patch.`;
  if (/^\d+\.\d+\.\d+\.\d+/.test(s)) return `"${s}" has four numbers; semver has three.`;
  if (/(^|\.)0\d/.test(s.replace(/[-+].*/, ""))) return `"${s}" has a leading zero, which semver forbids.`;
  return `"${s}" is not a valid semver version.`;
}

function sortVersions(list) {
  return [...list].sort(compare);
}

function matching(versions, range, opts) {
  const r = rangeOf(range, opts);
  const out = [];
  for (const raw of versions) {
    const v = parseVersion(String(raw));
    if (v && r.sets.some((s) => testSet(s, v, r.includePrerelease).ok)) out.push({ raw, v });
  }
  return out;
}

/** Highest version in the list that satisfies the range, or null (what npm installs, given those published versions). Returned as written. */
export function maxSatisfying(versions, range, opts = {}) {
  let best = null;
  for (const x of matching(versions, range, opts)) if (!best || compare(x.v, best.v) > 0) best = x;
  return best ? best.raw : null;
}

/** Lowest version in the list that satisfies the range, or null. Returned as written. */
export function minSatisfying(versions, range, opts = {}) {
  let best = null;
  for (const x of matching(versions, range, opts)) if (!best || compare(x.v, best.v) < 0) best = x;
  return best ? best.raw : null;
}

// ------------------------------------------------------- range vs range

// The smallest version greater than v of each class a range can tell apart.
function succRelease(v) {
  return v.pre.length ? mk(v.major, v.minor, v.patch) : mk(v.major, v.minor, v.patch + 1);
}
function succAny(v) {
  return v.pre.length ? mk(v.major, v.minor, v.patch, [...v.pre, "0"]) : mk(v.major, v.minor, v.patch + 1, ["0"]);
}
function succPreOf(q, t) {
  const lowest = mk(t.major, t.minor, t.patch, ["0"]);
  if (compare(q, lowest) < 0) return lowest;
  if (sameTuple(q, t) && q.pre.length) return mk(q.major, q.minor, q.patch, [...q.pre, "0"]);
  return null;
}

/**
 * Every version that can change a verdict for these ranges: boundaries and the
 * least release, least version, and least prerelease of each named tuple
 * after each boundary (and after the very bottom, 0.0.0-0).
 */
export function candidates(ranges) {
  const bounds = [];
  for (const r of ranges) for (const s of r.sets) for (const c of s.comparators) if (!c.any) bounds.push(c.version);
  const tuples = bounds.filter((b) => b.pre.length);
  const out = new Map();
  const add = (v) => { if (v) out.set(format(v), v); };
  const bottom = mk(0, 0, 0, ["0"]);
  for (const q of [bottom, ...bounds]) {
    add(q);
    add(succRelease(q));
    add(succAny(q));
    for (const t of tuples) add(succPreOf(q, t));
  }
  add(mk(0, 0, 0));
  return sortVersions([...out.values()]);
}

function accepts(r, v, incPre) {
  return r.sets.some((s) => testSet(s, v, incPre).ok);
}

/**
 * Compare two ranges exactly. Returns { aInB, bInA, overlap, equivalent,
 * onlyA, onlyB, both } where onlyA/onlyB/both are the lowest witness versions
 * (or null), plus aEmpty/bEmpty for ranges no version satisfies.
 */
export function compareRanges(a, b, { includePrerelease = false, semver = DEFAULT_SEMVER } = {}) {
  const A = rangeOf(a, { includePrerelease, semver }), B = rangeOf(b, { includePrerelease, semver });
  let onlyA = null, onlyB = null, both = null, anyA = null, anyB = null;
  for (const v of candidates([A, B])) {
    const inA = accepts(A, v, includePrerelease), inB = accepts(B, v, includePrerelease);
    if (inA && !anyA) anyA = v;
    if (inB && !anyB) anyB = v;
    if (inA && !inB && !onlyA) onlyA = v;
    if (inB && !inA && !onlyB) onlyB = v;
    if (inA && inB && !both) both = v;
  }
  const f = (v) => (v ? format(v) : null);
  return {
    aInB: !onlyA, bInA: !onlyB, overlap: !!both, equivalent: !onlyA && !onlyB,
    onlyA: f(onlyA), onlyB: f(onlyB), both: f(both), aEmpty: !anyA, bEmpty: !anyB,
  };
}

/** True when every version range `sub` allows, `sup` allows too. */
export function subset(sub, sup, opts = {}) {
  return compareRanges(sub, sup, opts).aInB;
}

/** True when some version satisfies both ranges. */
export function intersects(a, b, opts = {}) {
  return compareRanges(a, b, opts).overlap;
}

/** The lowest version that satisfies the range, or null when none does. */
export function minVersion(range, opts = {}) {
  const r = rangeOf(range, opts);
  const v = candidates([r]).find((c) => accepts(r, c, r.includePrerelease));
  return v ? format(v) : null;
}

// --------------------------------------------------------------- explain

function bounds(set) {
  let lo = null, hi = null, eq = null;
  for (const c of set.comparators) {
    if (c.any) continue;
    if (c.op === "=") eq = c;
    else if (c.op[0] === ">") { if (!lo || compare(c.version, lo.version) > 0 || (compare(c.version, lo.version) === 0 && c.op === ">")) lo = c; }
    else if (!hi || compare(c.version, hi.version) < 0 || (compare(c.version, hi.version) === 0 && c.op === "<")) hi = c;
  }
  return { lo, hi, eq };
}

function upperWords(hi) {
  const v = hi.version;
  if (hi.op === "<" && v.pre.length === 1 && v.pre[0] === "0") return `below ${v.major}.${v.minor}.${v.patch} (its prereleases excluded too)`;
  return hi.op === "<" ? `below ${format(v)}` : `up to and including ${format(v)}`;
}

/** Tuples ("2.0.0") whose prereleases this set really lets through: named in a comparator and inside the bounds. */
export function openedTuples(set) {
  const out = new Set();
  for (const v of candidates([{ sets: [set] }])) if (v.pre.length && testSet(set, v, false).ok) out.add(`${v.major}.${v.minor}.${v.patch}`);
  return [...out];
}

/** Plain words for one comparator set. */
export function describeSet(set, includePrerelease = false) {
  const { lo, hi, eq } = bounds(set);
  if (set.comparators.every((c) => c.any)) return includePrerelease ? "any version, prereleases included" : "any release version (no prereleases)";
  const parts = [];
  if (eq) parts.push(`exactly ${format(eq.version)}`);
  if (lo) parts.push(lo.op === ">=" ? `at least ${format(lo.version)}` : `above ${format(lo.version)}`);
  if (hi) parts.push(upperWords(hi));
  let text = parts.join(", ");
  if (!lo && !eq && hi) text = `any version ${text}`;
  if (lo && !hi && !eq) text += ", with no upper limit (any future major version, including breaking ones)";
  if (!includePrerelease) {
    const tuples = openedTuples(set);
    text += tuples.length ? `; prereleases only of ${tuples.join(" and ")}` : "; no prereleases";
  }
  return text;
}

/**
 * Full explanation of a range: its sets in comparator form with the desugaring
 * steps and words, the lowest matching version, and findings (lint).
 */
export function explainRange(input, { includePrerelease = false, semver = DEFAULT_SEMVER } = {}) {
  let r;
  try {
    r = parseRange(input, { includePrerelease, semver });
  } catch (e) {
    return { valid: false, error: e.message, findings: [{ severity: "high", code: "invalid", message: e.message }] };
  }
  const sets = r.sets.map((s) => ({ written: s.written || "*", comparators: setString(s) || "*", steps: s.steps, words: describeSet(s, includePrerelease) }));
  const findings = lint(r, includePrerelease);
  return { valid: true, range: rangeString(r), sets, minVersion: minVersion(r, { includePrerelease, semver }), findings };
}

function lint(r, incPre) {
  const out = [];
  const raw = r.raw.trim();
  if (!minVersion(r, { includePrerelease: incPre, semver: r.semver })) out.push({ severity: "high", code: "unsatisfiable", message: "No version can satisfy this range: its lower bound is above its upper bound in every || branch." });
  if (r.collapsedToAny) {
    const opened = [...new Set(r.written.flatMap(openedTuples))];
    out.push({ severity: opened.length ? "high" : "medium", code: "star-branch", message: `One || branch is a bare "*" (or an x-range that means any version), and npm then ignores every other branch. The whole range is just "*"${opened.length ? `, so the prereleases the other branches opened (${opened.join(", ")}) no longer match` : ""}. Drop the "*" branch, or drop the others.` });
  }
  r.sets.forEach((s, i) => {
    const label = r.sets.length > 1 ? `Branch ${i + 1} (${s.written || "*"})` : "This range";
    const { lo, hi, eq } = bounds(s);
    if (s.comparators.every((c) => c.any)) out.push({ severity: "medium", code: "any", message: `${label} accepts every release, so it locks nothing: any new major version, breaking or not, can be installed.` });
    else if (lo && !hi && !eq) out.push({ severity: "medium", code: "no-upper-bound", message: `${label} has no upper bound: ${s.written} also accepts the next major version, which by semver may break your code. A caret (^${format(lo.version)}) stops below the next major.` });
    if (r.sets.length > 1) {
      for (let j = 0; j < r.sets.length; j++) {
        if (j === i) continue;
        const one = { raw: s.written, sets: [s] }, other = { raw: r.sets[j].written, sets: [r.sets[j]] };
        const c = compareRanges(one, other, { includePrerelease: incPre, semver: r.semver });
        if (c.aInB && (!c.bInA || j < i) && !c.aEmpty) { out.push({ severity: "low", code: "redundant-branch", message: `${label} adds nothing: every version it allows, branch ${j + 1} (${r.sets[j].written || "*"}) already allows.` }); break; }
      }
    }
  });
  // From the parsed caret steps, not the raw text, so "^ 0.2.3", "^v0.2.3",
  // "^0.2.3-beta" and partials like "^0.1" are caught the same as "^0.2.3".
  const carets = new Set();
  for (const s of r.written) for (const st of s.steps) {
    const m = st.rule === "caret" && CARET_RE.exec(st.written);
    if (!m || m[1] !== "0" || isX(m[2]) || carets.has(st.written)) continue;
    carets.add(st.written);
    const [, , mi, p, pr] = m;
    const allows = mi === "0" && !isX(p)
      ? pr ? `It allows only 0.0.${p} and its prereleases from 0.0.${p}-${pr} on` : `It allows only 0.0.${p} itself`
      : `It allows 0.${mi}.x patches only, not 0.${+mi + 1}.0`;
    out.push({ severity: "info", code: "caret-zero", message: `${st.written}: a caret on a 0.x version is narrow. ${allows}, because before 1.0.0 the leftmost non-zero number is treated as the breaking one.` });
  }
  for (const s of r.sets) {
    for (const st of s.steps) if (st.rule === "partial" && /^</.test(st.written) && !/^<=/.test(st.written)) {
      out.push({ severity: "info", code: "partial-upper", message: `${st.written} is read as ${st.becomes}: a partial version after < means "before the first prerelease of it", so no ${st.becomes.slice(1, -2)} prerelease slips in, even with includePrerelease.` });
    }
  }
  if (/^\s*v?\d+\.\d+\.\d+-\d+\.\d+\.\d+\s*$/.test(raw)) out.push({ severity: "medium", code: "hyphen-spacing", message: `${raw} is a single prerelease version, not a hyphen range: a hyphen range needs spaces on both sides of the "-", as in ${raw.replace("-", " - ")}.` });
  if (!incPre) {
    const tuples = [...new Set(r.sets.flatMap(openedTuples))];
    if (tuples.length)
    out.push({ severity: "info", code: "prerelease-opener", message: `A prerelease in the range opens prereleases of ${tuples.join(" and ")} only. Prereleases of any other version (for example a later beta) still do not match unless npm runs with includePrerelease.` });
  }
  return out;
}

/**
 * Everything the page shows: the range explained, a verdict per version, the
 * highest and lowest matching version from the list, and, when a second range
 * is given, an exact comparison with witness versions.
 */
export function analyze({ range = "", versions = "", other = "", includePrerelease = false, semver = DEFAULT_SEMVER } = {}) {
  const explained = explainRange(range, { includePrerelease, semver });
  const list = (Array.isArray(versions) ? versions : parseVersionList(versions)).map(String);
  const result = { semver, includePrerelease, range: explained, versions: [], max: null, min: null, comparison: null, totals: { versions: list.length, matching: 0, blocked: 0, invalid: 0 } };
  if (explained.valid) {
    const r = parseRange(range, { includePrerelease, semver });
    result.versions = list.map((v) => explainVersion(v, r, { includePrerelease, semver }));
    result.max = maxSatisfying(list, r, { includePrerelease, semver });
    result.min = minSatisfying(list, r, { includePrerelease, semver });
    for (const x of result.versions) {
      if (!x.valid) result.totals.invalid++;
      else if (x.ok) result.totals.matching++;
      else if (x.blockedByPrerelease) result.totals.blocked++;
    }
    if (result.totals.blocked) {
      const newer = result.versions.filter((x) => x.blockedByPrerelease).map((x) => x.version);
      explained.findings.push({ severity: "info", code: "prerelease-skipped", message: `${newer.length} version(s) in your list fall inside the bounds but are prereleases npm skips: ${newer.slice(0, 5).join(", ")}${newer.length > 5 ? ", ..." : ""}. Name one in the range (for example >=${newer[0]}) to opt in to that version's prereleases.` });
    }
  }
  if (other && other.trim()) {
    const o = explainRange(other, { includePrerelease, semver });
    if (!o.valid || !explained.valid) result.comparison = { valid: false, error: o.valid ? explained.error : o.error, other: o };
    else result.comparison = { valid: true, other: o, ...compareRanges(range, other, { includePrerelease, semver }) };
  }
  return result;
}

/** One version per line, or a JSON array (npm view <pkg> versions --json), or space/comma separated. */
export function parseVersionList(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  if (t.startsWith("[") || t.startsWith('"')) {
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) return j.map(String);
      if (typeof j === "string") return [j];
    } catch { /* fall through to splitting */ }
    return t.replace(/[[\]"']/g, " ").split(/[\s,]+/).filter(Boolean);
  }
  return t.split(/[\s,]+/).filter(Boolean);
}

/** CSV of the per-version verdicts. */
export function reportCsv(result) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["version", "satisfies", "reason"].join(",")];
  for (const v of result.versions) rows.push([q(v.version), v.ok ? "yes" : v.valid ? "no" : "invalid", q(v.reason)].join(","));
  return rows.join("\n") + "\n";
}

/** Inputs an agent call starts from: one range, nothing else. */
export const DEFAULTS = { range: "^1.2.0", versions: "", other: "", includePrerelease: false, semver: DEFAULT_SEMVER };

/** The page's "Load the example". */
export const EXAMPLE = {
  range: "^1.2.0 || >=2.0.0-beta.1 <2.0.0",
  versions: "1.1.9\n1.2.0\n1.8.3\n1.9.0-rc.1\n2.0.0-alpha.3\n2.0.0-beta.1\n2.0.0-beta.4\n2.0.0\n2.1.0-beta.0",
  other: "^1.2.0 || ^2.0.0-0",
  includePrerelease: false,
};
