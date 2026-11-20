// Value restrictions as languages: which strings an IDS value restriction lets
// through, and whether one restriction's strings all pass another's. This is
// what lets a revision diff grade a pattern edit ("D-[0-9]+" to "D-[0-9]{2}"
// asks more) instead of calling every pattern change "different", and say
// which value used to pass and now fails.
//
//   restrictionLanguage(idsValue) -> Language | null
//       null when the restriction is not a set of strings this module can
//       read exactly: numeric bounds, date bounds with a time zone, time,
//       dateTime or duration bounds, a pattern that is not XSD, a numeric
//       base, or an automaton past the size caps. Bounds that are plain dates
//       (minInclusive="2024-01-01") are read exactly: see dateRangePatterns.
//   languageWithin(L1, L2)        -> { within: true } | { within: false, example } | null
//       whether every string L1 accepts, L2 accepts too; when not, the
//       shortest string L1 accepts and L2 refuses (null past the caps).
//   compareLanguages(a, b)        -> { effect, nowFails, nowPasses } | null
//       effect for restriction b against a: same, tighter, looser or changed.
//
// A Language is the intersection of a few automata: the enumeration (a list of
// literals), the patterns (XSD reads several xs:pattern facets in one
// restriction as alternatives, and so does ids.mjs), and the length facets.
// Patterns are parsed with the XSD 1.0 grammar (xsdregex.mjs; same reading as
// elementpath, the regex engine under IfcTester) into Thompson automata over
// code-point intervals. Inclusion is decided by a breadth-first search over
// the product of the subset constructions, on character classes made from the
// interval boundaries of every set in play, so \p{L} or [^a-z] cost a few
// hundred classes, not a million characters. Strings are XML text: the
// universe is XML's Char production (tab, LF, CR, U+0020 up, no surrogates,
// no U+FFFE/U+FFFF). Eval: eval/pattern-inclusion-2026-11-20.md.

import { parseXsdRegex, SINGLE, CATEGORIES, MULTI_JS, blockJs } from "./xsdregex.mjs";
import { lexRange, daysInMonth } from "./temporal.mjs";

const MAX_NFA_STATES = 20000;
const MAX_PRODUCT_STATES = 20000;
const MAX_CP = 0x10ffff;

class TooBig extends Error {}

// ---- interval sets: sorted, disjoint, non-adjacent [lo, hi] pairs ----

function norm(iv) {
  const s = iv.filter(([a, b]) => a <= b).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
function complementAll(iv) {
  const out = [];
  let next = 0;
  for (const [a, b] of iv) { if (a > next) out.push([next, a - 1]); next = b + 1; }
  if (next <= MAX_CP) out.push([next, MAX_CP]);
  return out;
}
function intersect(x, y) {
  const out = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    const lo = Math.max(x[i][0], y[j][0]), hi = Math.min(x[i][1], y[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (x[i][1] < y[j][1]) i++; else j++;
  }
  return out;
}
const union = (x, y) => norm([...x, ...y].map((p) => [...p]));
const minus = (x, y) => intersect(x, complementAll(y));

// XML 1.0 Char: the only characters an IDS value can hold.
export const XML_CHAR = [[0x9, 0xa], [0xd, 0xd], [0x20, 0xd7ff], [0xe000, 0xfffd], [0x10000, MAX_CP]];
const inXml = (iv) => intersect(norm(iv), XML_CHAR);
const complement = (iv) => intersect(complementAll(norm(iv.map((p) => [...p]))), XML_CHAR);

// A class written in JavaScript regex syntax (the "v" flag), read off by
// testing every XML character once; cached per source.
const scanCache = new Map();
function scanJs(src) {
  if (scanCache.has(src)) return scanCache.get(src);
  const re = new RegExp("^(?:" + src + ")$", "v");
  const out = [];
  let start = -1;
  for (const [lo, hi] of XML_CHAR) {
    for (let cp = lo; cp <= hi; cp++) {
      if (re.test(String.fromCodePoint(cp))) { if (start < 0) start = cp; }
      else if (start >= 0) { out.push([start, cp - 1]); start = -1; }
    }
    if (start >= 0) { out.push([start, hi]); start = -1; }
  }
  const n = norm(out);
  scanCache.set(src, n);
  return n;
}

const LINE_ENDS = [[0xa, 0xa], [0xd, 0xd]];
function multiSet(e) {
  if (e === "s") return inXml([[0x20, 0x20], [0x9, 0xa], [0xd, 0xd]]);
  if (e === "S") return complement([[0x20, 0x20], [0x9, 0xa], [0xd, 0xd]]);
  return scanJs(MULTI_JS[e]);
}

// ---- XSD regex to an AST of sets, sequences, alternatives and repeats ----
// Assumes parseXsdRegex(p).ok: the grammar errors are its job.

function parseAst(p) {
  const cps = [...String(p)];
  let i = 0;
  const peek = () => cps[i];
  function regExp() {
    const xs = [branch()];
    while (peek() === "|") { i++; xs.push(branch()); }
    return xs.length === 1 ? xs[0] : { t: "alt", xs };
  }
  function branch() {
    const xs = [];
    while (i < cps.length && peek() !== "|" && peek() !== ")") xs.push(piece());
    return { t: "seq", xs };
  }
  function piece() {
    const x = atom();
    const c = peek();
    if (c === "?") { i++; return { t: "rep", x, min: 0, max: 1 }; }
    if (c === "*") { i++; return { t: "rep", x, min: 0, max: Infinity }; }
    if (c === "+") { i++; return { t: "rep", x, min: 1, max: Infinity }; }
    if (c === "{") {
      i++;
      let lo = ""; while (/[0-9]/.test(peek() || "")) lo += cps[i++];
      let hi = lo;
      if (peek() === ",") { i++; hi = ""; while (/[0-9]/.test(peek() || "")) hi += cps[i++]; if (hi === "") hi = "inf"; }
      i++; // "}"
      return { t: "rep", x, min: Number(lo), max: hi === "inf" ? Infinity : Number(hi) };
    }
    return x;
  }
  function atom() {
    const c = peek();
    if (c === "(") { i++; const x = regExp(); i++; return x; }
    if (c === "[") return { t: "set", set: classExpr() };
    if (c === ".") { i++; return { t: "set", set: complement(LINE_ENDS) }; }
    if (c === "\\") { const e = escape(); return { t: "set", set: e.set }; }
    i++;
    const cp = c.codePointAt(0);
    return { t: "set", set: inXml([[cp, cp]]) };
  }
  // { set, single } with single the code point of a single-character escape.
  function escape() {
    i++;
    const e = cps[i++];
    if (e === "p" || e === "P") {
      const close = cps.indexOf("}", i);
      const name = cps.slice(i + 1, close).join("");
      i = close + 1;
      let set;
      if (CATEGORIES.has(name)) set = scanJs("\\p{General_Category=" + name + "}");
      else set = scanJs(blockJs(name.slice(2)));
      return { set: e === "p" ? set : complement(set) };
    }
    if ("sSiIcCdDwW".includes(e)) return { set: multiSet(e) };
    const cp = (Object.hasOwn(SINGLE, e) ? SINGLE[e] : e).codePointAt(0);
    return { set: inXml([[cp, cp]]), single: cp };
  }
  function classExpr() {
    i++; // "["
    let neg = false;
    if (peek() === "^") { neg = true; i++; }
    let set = [];
    let sub = null;
    for (;;) {
      const c = peek();
      if (c === "]") { i++; break; }
      if (c === "-" && cps[i + 1] === "[") { i++; sub = classExpr(); i++; break; }
      if (c === "-") { i++; set = union(set, [[0x2d, 0x2d]]); continue; }
      let lo;
      if (c === "\\") {
        const e = escape();
        if (e.single === undefined) { set = union(set, e.set); continue; }
        lo = e.single;
      } else { i++; lo = c.codePointAt(0); }
      if (peek() === "-" && cps[i + 1] !== "]" && cps[i + 1] !== "[") {
        i++;
        let hi;
        if (peek() === "\\") hi = escape().single;
        else { hi = cps[i].codePointAt(0); i++; }
        set = union(set, [[lo, hi]]);
      } else set = union(set, [[lo, lo]]);
    }
    set = inXml(set);
    if (neg) set = complement(set);
    if (sub) set = minus(set, sub);
    return set;
  }
  return regExp();
}

// ---- Thompson automata ----

class Nfa {
  constructor() { this.eps = []; this.edges = []; this.start = 0; this.accept = 0; }
  state() {
    if (this.eps.length >= MAX_NFA_STATES) throw new TooBig();
    this.eps.push([]); this.edges.push([]);
    return this.eps.length - 1;
  }
  build(node) {
    switch (node.t) {
      case "set": { const s = this.state(), e = this.state(); if (node.set.length) this.edges[s].push([node.set, e]); return [s, e]; }
      case "seq": {
        const s = this.state(); let cur = s;
        for (const x of node.xs) { const [a, b] = this.build(x); this.eps[cur].push(a); cur = b; }
        return [s, cur];
      }
      case "alt": {
        const s = this.state(), e = this.state();
        for (const x of node.xs) { const [a, b] = this.build(x); this.eps[s].push(a); this.eps[b].push(e); }
        return [s, e];
      }
      case "rep": {
        const s = this.state(); let cur = s;
        for (let k = 0; k < node.min; k++) { const [a, b] = this.build(node.x); this.eps[cur].push(a); cur = b; }
        if (node.max === Infinity) {
          const [a, b] = this.build(node.x);
          const e = this.state();
          this.eps[cur].push(a, e); this.eps[b].push(a, e);
          return [s, e];
        }
        const e = this.state();
        for (let k = node.min; k < node.max; k++) {
          const [a, b] = this.build(node.x);
          this.eps[cur].push(a, e); cur = b;
        }
        this.eps[cur].push(e);
        return [s, e];
      }
    }
    throw new Error("unknown node " + node.t);
  }
  static of(node) {
    const n = new Nfa();
    const [s, e] = n.build(node);
    n.start = s; n.accept = e;
    return n;
  }
}

const lit = (text) => ({ t: "seq", xs: [...text].map((ch) => { const cp = ch.codePointAt(0); return { t: "set", set: inXml([[cp, cp]]) }; }) });

// A pattern as an automaton, or null when it is not an XSD regex or too big.
export function patternNfa(p) {
  if (!parseXsdRegex(p).ok) return null;
  try { return Nfa.of(parseAst(p)); } catch (e) { if (e instanceof TooBig) return null; throw e; }
}

const NUMERIC_BASE = /^(double|float|decimal|integer|int|long|short|byte|nonNegativeInteger|positiveInteger|nonPositiveInteger|negativeInteger|unsignedInt|unsignedLong|unsignedShort|unsignedByte)$/;

// ---- date ranges as languages ----
//
// ids.mjs passes a string on a range whose bounds are dates when the string,
// less XML whitespace around it, is an ISO date (YYYY-MM-DD, optional time
// zone) of a day that exists, whose instant (midnight in its own zone, no zone
// read as UTC; temporal.mjs) is within the bounds. Days are whole, and a zone
// offset is under a day, so for bounds that are plain dates the instant test
// becomes a test on the written day by the zone's sign: a day written east of
// UTC (+01:00) starts before its UTC midnight, so it needs a day more to clear
// a lower bound, and one written west (-05:00) starts after, so it needs a day
// less to stay under an upper bound. Each sign is then a lexical range of
// fixed-width days (lexRange), intersected with the calendar (leap years
// included) and the zone forms Date.parse accepts (hours 00-23, minutes
// 00-59). The test file checks this against ids.mjs string by string.
const D = "[0-9]";
const LEAP = `(${D}${D}(0[48]|[2468][048]|[13579][26])|([02468][048]|[13579][26])00)`;
const CALENDAR = `(${D}{4}-((0[13578]|1[02])-(0[1-9]|[12]${D}|3[01])|(0[469]|11)-(0[1-9]|[12]${D}|30)|02-(0[1-9]|1${D}|2[0-8]))|${LEAP}-02-29)`;
const OFFSET = `(00:(0[1-9]|[1-5]${D})|(0[1-9]|1${D}|2[0-3]):[0-5]${D})`;
const ZONE = { zero: "(Z|[+\\-]00:00)?", east: `\\+${OFFSET}`, west: `\\-${OFFSET}` };
const WS = "[ \\t\\r\\n]*";
const PLAIN = /^[ \t\r\n]*(\d{4})-(\d{2})-(\d{2})[ \t\r\n]*$/;
// Day number <-> "YYYY-MM-DD" over years 0000-9999 (proleptic Gregorian).
function toDay(s) {
  const m = s.match(PLAIN);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return NaN;
  const t = new Date(0);
  t.setUTCFullYear(y, mo - 1, d);
  t.setUTCHours(0, 0, 0, 0);
  return Math.round(t.getTime() / 864e5);
}
function fromDay(n) {
  const t = new Date(n * 864e5);
  return String(t.getUTCFullYear()).padStart(4, "0") + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
}
const FIRST = toDay("0000-01-01"), LAST = toDay("9999-12-31");
// The patterns (all must match) for a restriction whose bounds are all plain
// dates; [null] when no string can pass; null when a bound is not a plain date.
export function dateRangePatterns(r) {
  const b = {};
  for (const k of ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"]) {
    if (r[k] === undefined) continue;
    const n = toDay(String(r[k]));
    if (n === null) return null;
    if (Number.isNaN(n)) return [null]; // a bound no day can be compared with
    b[k] = n;
  }
  // Lowest and highest written day per zone sign.
  const span = (sign) => {
    let lo = FIRST, hi = LAST;
    if (b.minInclusive !== undefined) lo = Math.max(lo, b.minInclusive + (sign === "east" ? 1 : 0));
    if (b.minExclusive !== undefined) lo = Math.max(lo, b.minExclusive + (sign === "west" ? 0 : 1));
    if (b.maxInclusive !== undefined) hi = Math.min(hi, b.maxInclusive - (sign === "west" ? 1 : 0));
    if (b.maxExclusive !== undefined) hi = Math.min(hi, b.maxExclusive - (sign === "east" ? 0 : 1));
    return lo <= hi ? [lo, hi] : null;
  };
  const alts = [];
  for (const sign of ["zero", "east", "west"]) {
    const s = span(sign);
    if (!s) continue;
    const body = lexRange(fromDay(s[0]), fromDay(s[1]));
    if (body === null) return null;
    alts.push(`${body.replace(/\\d/g, D)}${ZONE[sign]}`);
  }
  if (!alts.length) return [null];
  return [`${WS}${CALENDAR}[\\s\\S]*`, `${WS}(${alts.join("|")})${WS}`];
}

// The strings an IdsValue lets through, as { nfas: [...] } (all must accept),
// or null when that is not exact (see the header).
export function restrictionLanguage(v) {
  if (!v || !v.present) return { nfas: [] };
  try {
    if (v.simple !== undefined) return { nfas: [Nfa.of(lit(v.simple))] };
    const r = v.r;
    if (r.base && NUMERIC_BASE.test(r.base)) return null;
    const nfas = [];
    if (["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"].some((k) => r[k] !== undefined)) {
      const ps = dateRangePatterns(r);
      if (!ps) return null;
      for (const p of ps) nfas.push(p === null ? Nfa.of({ t: "set", set: [] }) : Nfa.of(parseAst(p)));
    }
    if (r.enumeration.length) nfas.push(Nfa.of({ t: "alt", xs: r.enumeration.map(lit) }));
    if (r.pattern.length) {
      if (!r.pattern.every((p) => parseXsdRegex(p).ok)) return null;
      nfas.push(Nfa.of({ t: "alt", xs: r.pattern.map(parseAst) }));
    }
    const n = (k) => (r[k] === undefined ? undefined : Number(r[k]));
    const len = n("length"), minL = n("minLength"), maxL = n("maxLength");
    if ([len, minL, maxL].some((x) => x !== undefined && !(Number.isInteger(x) && x >= 0))) return null;
    if (len !== undefined || minL !== undefined || maxL !== undefined) {
      const lo = Math.max(len ?? 0, minL ?? 0), hi = Math.min(len ?? Infinity, maxL ?? Infinity);
      nfas.push(lo > hi ? Nfa.of({ t: "set", set: [] }) : Nfa.of({ t: "rep", x: { t: "set", set: XML_CHAR }, min: lo, max: hi }));
    }
    return { nfas };
  } catch (e) {
    if (e instanceof TooBig) return null;
    throw e;
  }
}

// ---- inclusion by product search ----

function closure(nfa, states) {
  const seen = new Set(states), stack = [...states];
  while (stack.length) for (const t of nfa.eps[stack.pop()]) if (!seen.has(t)) { seen.add(t); stack.push(t); }
  return [...seen].sort((a, b) => a - b);
}

// The nicest character in [lo, hi] for an example: a letter or digit, other
// printable ASCII, a space, then the lowest printable non-ASCII.
const PREFS = [[0x41, 0x5a], [0x61, 0x7a], [0x30, 0x39], [0x21, 0x7e], [0x20, 0x20], [0xa1, MAX_CP], [0, MAX_CP]];
function pick(atoms) {
  for (let k = 0; k < PREFS.length; k++) {
    for (const [lo, hi] of atoms) {
      const a = Math.max(lo, PREFS[k][0]), b = Math.min(hi, PREFS[k][1]);
      if (a <= b) return { cp: a, rank: k };
    }
  }
  return { cp: atoms[0][0], rank: PREFS.length };
}

// Whether ∩pos accepts some string neg refuses; returns that string (the
// shortest), false when there is none, or null past the cap.
function findOutside(pos, neg) {
  const nfas = neg ? [...pos, neg] : pos;
  // Character classes: atoms between all interval boundaries, grouped by
  // which edge sets hold them.
  const sets = [];
  const setId = new Map();
  for (const nfa of nfas) for (const es of nfa.edges) for (const ed of es) {
    if (!setId.has(ed[0])) { setId.set(ed[0], sets.length); sets.push(ed[0]); }
  }
  const cuts = new Set([0, MAX_CP + 1]);
  for (const s of [...sets, XML_CHAR]) for (const [a, b] of s) { cuts.add(a); cuts.add(b + 1); }
  const pts = [...cuts].sort((a, b) => a - b);
  const contains = (s, cp) => { let lo = 0, hi = s.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (cp < s[m][0]) hi = m - 1; else if (cp > s[m][1]) lo = m + 1; else return true; } return false; };
  const classes = new Map();
  for (let k = 0; k + 1 < pts.length; k++) {
    const lo = pts[k], hi = pts[k + 1] - 1;
    if (!contains(XML_CHAR, lo)) continue;
    const sig = sets.map((s) => (contains(s, lo) ? "1" : "0")).join("");
    if (!classes.has(sig)) classes.set(sig, { member: sets.map((s) => contains(s, lo)), atoms: [] });
    classes.get(sig).atoms.push([lo, hi]);
  }
  const cls = [...classes.values()].map((c) => ({ ...c, ...pick(c.atoms) })).sort((a, b) => a.rank - b.rank || a.cp - b.cp);
  const ids = nfas.map((nfa) => nfa.edges.map((es) => es.map(([s, to]) => [setId.get(s), to])));
  const accepts = (tuple) => pos.every((nfa, k) => tuple[k].includes(nfa.accept)) && (!neg || !tuple[pos.length].includes(neg.accept));
  const keyOf = (tuple) => tuple.map((s) => s.join(",")).join("|");
  const start = nfas.map((nfa) => closure(nfa, [nfa.start]));
  const seen = new Map([[keyOf(start), null]]);
  const queue = [[start, keyOf(start)]];
  for (let q = 0; q < queue.length; q++) {
    const [tuple, key] = queue[q];
    if (accepts(tuple)) {
      const out = [];
      for (let k = key; seen.get(k); k = seen.get(k)[0]) out.push(seen.get(k)[1]);
      return String.fromCodePoint(...out.reverse());
    }
    for (const c of cls) {
      const next = [];
      let dead = false;
      for (let k = 0; k < nfas.length; k++) {
        const to = [];
        for (const st of tuple[k]) for (const [sid, t] of ids[k][st]) if (c.member[sid]) to.push(t);
        // A positive automaton with no move kills the branch; the negated one
        // with no move just refuses from here on.
        if (!to.length && k < pos.length) { dead = true; break; }
        next.push(to.length ? closure(nfas[k], to) : []);
      }
      if (dead) continue;
      const nk = keyOf(next);
      if (seen.has(nk)) continue;
      if (seen.size >= MAX_PRODUCT_STATES) return null;
      seen.set(nk, [key, c.cp]);
      queue.push([next, nk]);
    }
  }
  return false;
}

// Whether every string L1 accepts, L2 accepts too.
export function languageWithin(L1, L2) {
  if (!L1 || !L2) return null;
  const universe = Nfa.of({ t: "rep", x: { t: "set", set: XML_CHAR }, min: 0, max: Infinity });
  const pos = L1.nfas.length ? L1.nfas : [universe];
  for (const neg of L2.nfas) {
    const w = findOutside(pos, neg);
    if (w === null) return null;
    if (w !== false) return { within: false, example: w };
  }
  return { within: true };
}

// Whether L accepts no string at all (an unsatisfiable restriction).
export function languageEmpty(L) {
  if (!L) return null;
  if (!L.nfas.length) return false;
  const w = findOutside(L.nfas, null);
  return w === null ? null : w === false;
}

// Restriction b against a: { effect, nowFails, nowPasses } where nowFails is
// a value a let through and b refuses, nowPasses the reverse; null when either
// side is not an exact string language.
export function compareLanguages(a, b) {
  const La = restrictionLanguage(a), Lb = restrictionLanguage(b);
  if (!La || !Lb) return null;
  const bInA = languageWithin(Lb, La), aInB = languageWithin(La, Lb);
  if (!bInA || !aInB) return null;
  const nowFails = aInB.within ? undefined : aInB.example;
  const nowPasses = bInA.within ? undefined : bInA.example;
  const effect = bInA.within && aInB.within ? "same" : bInA.within ? "tighter" : aInB.within ? "looser" : "changed";
  return { effect, nowFails, nowPasses };
}
