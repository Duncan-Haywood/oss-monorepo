// Static ReDoS (catastrophic backtracking) analysis for regular expressions
// found in JavaScript, TypeScript and Python source. Pure functions, no I/O,
// no dependencies: the browser page and the Node CLI share this file.
//
// It parses each pattern into a small AST and looks for the shapes that make a
// backtracking engine take exponential or polynomial time on a crafted input:
//   nested-quantifier        (a+)+  (\w+\s?)+  (a*b*)*      exponential
//   overlapping-alternation  (a|aa)+  (\d|\w)+              exponential
//   adjacent-overlap         \d+\d+  .*.*  \w+\s*\w+        polynomial
//   quadratic-end-anchor     \s+$  with no ^ anchor         polynomial
//   dynamic-regexp           new RegExp(variable)           information
// A static finding is a *suspect*: the CLI's --probe mode confirms it by
// timing the real engine on a generated input (see probe.mjs).

export const RULES = {
  "nested-quantifier": { severity: "error", summary: "an unbounded repeat whose iterations can split the same text in many ways (exponential)" },
  "overlapping-alternation": { severity: "error", summary: "a repeated alternation where two branches can match the same text (exponential)" },
  "adjacent-overlap": { severity: "warn", summary: "two unbounded repeats next to each other that can match the same characters (polynomial)" },
  "quadratic-end-anchor": { severity: "warn", summary: "an unbounded repeat before $ with no ^ anchor, retried from every start position (quadratic)" },
  "dynamic-regexp": { severity: "info", summary: "a RegExp built from a variable, which is a ReDoS and injection risk if the value is user-controlled" },
  "unparsable": { severity: "info", summary: "pattern could not be parsed, so it was not analysed" },
};

export const CHECKED_PATTERNS = [
  { lang: "JavaScript / TypeScript", examples: "/(a+)+$/   new RegExp(\"(a+)+$\")   RegExp('...', 'i')" },
  { lang: "Python", examples: "re.compile(r\"(a+)+$\")   re.match / search / fullmatch / sub / findall / finditer / split   PATTERN = r\"...\"" },
];

// Characters used to decide whether two character sets overlap. Wide enough
// that [^x] and \w and . behave like themselves, small enough to be fast.
const ALPHABET = [..."\t\n\r", ...Array.from({ length: 95 }, (_, k) => String.fromCharCode(32 + k)), "é", "中"];
const INF = Infinity;

const classOf = {
  d: (c) => c >= "0" && c <= "9",
  w: (c) => /[A-Za-z0-9_]/.test(c),
  s: (c) => /\s/.test(c),
};

function setNode(match) {
  return { t: "set", match };
}

export function parseRegex(src, { flags = "", lang = "js" } = {}) {
  const icase = flags.includes("i");
  const dotAll = flags.includes("s");
  let i = 0;
  const fail = (msg) => { throw new SyntaxError(`${msg} at ${i} in /${src}/`); };
  const eqChar = (a) => (icase ? (c) => c.toLowerCase() === a.toLowerCase() : (c) => c === a);

  function parseAlt() {
    const alts = [parseSeq()];
    while (src[i] === "|") { i += 1; alts.push(parseSeq()); }
    return alts.length === 1 ? alts[0] : { t: "alt", alts };
  }
  function parseSeq() {
    const items = [];
    while (i < src.length && src[i] !== "|" && src[i] !== ")") items.push(parseTerm());
    return { t: "seq", items };
  }
  function parseTerm() {
    const start = i;
    let node = parseAtom();
    const q = parseQuantifier();
    if (q) node = { t: "quant", body: node, ...q };
    node.s = start;
    node.e = i;
    return node;
  }
  function parseQuantifier() {
    const c = src[i];
    let q = null;
    if (c === "*") { q = { min: 0, max: INF }; i += 1; }
    else if (c === "+") { q = { min: 1, max: INF }; i += 1; }
    else if (c === "?") { q = { min: 0, max: 1 }; i += 1; }
    else if (c === "{") {
      const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(src.slice(i));
      if (!m) return null;
      const min = Number(m[1]);
      const max = m[2] ? (m[3] === "" ? INF : Number(m[3])) : min;
      q = { min, max };
      i += m[0].length;
    } else return null;
    q.lazy = false; q.possessive = false;
    if (src[i] === "?") { q.lazy = true; i += 1; }
    else if (src[i] === "+") { q.possessive = true; i += 1; }
    return q;
  }
  function parseGroup() {
    i += 1; // (
    let kind = "capture";
    if (src[i] === "?") {
      const rest = src.slice(i);
      let m;
      if (rest.startsWith("?:")) { kind = "non-capture"; i += 2; }
      else if (rest.startsWith("?=")) { kind = "look"; i += 2; }
      else if (rest.startsWith("?!")) { kind = "look"; i += 2; }
      else if (rest.startsWith("?<=") || rest.startsWith("?<!")) { kind = "look"; i += 3; }
      else if (rest.startsWith("?>")) { kind = "atomic"; i += 2; }
      else if (rest.startsWith("?#")) {
        const end = src.indexOf(")", i);
        if (end < 0) fail("unterminated comment group");
        i = end + 1;
        return { t: "seq", items: [] };
      } else if ((m = /^\?P=\w+\)/.exec(rest))) { i += m[0].length; return { t: "backref" }; }
      else if ((m = /^\?(?:P)?<\w+>/.exec(rest))) { i += m[0].length; }
      else if ((m = /^\?\(/.exec(rest))) { fail("conditional groups are not analysed"); }
      else if ((m = /^\?[a-zA-Z-]+(:|\))/.exec(rest))) {
        i += m[0].length;
        if (m[1] === ")") return { t: "seq", items: [] };
        kind = "non-capture";
      } else fail("unsupported group syntax");
    }
    const body = parseAlt();
    if (src[i] !== ")") fail("unterminated group");
    i += 1;
    if (kind === "look") return { t: "look", body };
    return { t: "group", kind, atomic: kind === "atomic", body };
  }
  function escapeToSet(c) {
    const lower = c.toLowerCase();
    if (lower === "d" || lower === "w" || lower === "s") {
      const f = classOf[lower];
      return c === lower ? setNode(f) : setNode((ch) => !f(ch));
    }
    return null;
  }
  function parseEscapeChar() {
    // Returns a single literal character for escapes that denote one, else null.
    const c = src[i];
    i += 1;
    if (c === "n") return "\n";
    if (c === "r") return "\r";
    if (c === "t") return "\t";
    if (c === "f") return "\f";
    if (c === "v") return "\v";
    if (c === "0") return "\0";
    if (c === "x") { const h = src.slice(i, i + 2); i += 2; return String.fromCharCode(parseInt(h, 16) || 0); }
    if (c === "u") {
      if (src[i] === "{") { const end = src.indexOf("}", i); const h = src.slice(i + 1, end); i = end + 1; return String.fromCodePoint(parseInt(h, 16) || 0); }
      const h = src.slice(i, i + 4); i += 4; return String.fromCharCode(parseInt(h, 16) || 0);
    }
    if (c === "c") { const l = src[i]; i += 1; return String.fromCharCode((l || "@").charCodeAt(0) % 32); }
    return c;
  }
  function parseEscape() {
    i += 1; // backslash
    if (i >= src.length) fail("dangling backslash");
    const c = src[i];
    const set = escapeToSet(c);
    if (set) { i += 1; return set; }
    if (c === "b" || c === "B" || (lang === "py" && (c === "A" || c === "Z"))) { i += 1; return { t: "anchor", c: `\\${c}` }; }
    if (/[1-9]/.test(c)) { while (/\d/.test(src[i] || "")) i += 1; return { t: "backref" }; }
    if (c === "k") { const end = src.indexOf(">", i); i = end < 0 ? i + 1 : end + 1; return { t: "backref" }; }
    if (c === "p" || c === "P") {
      i += 1;
      let name = "";
      if (src[i] === "{") { const end = src.indexOf("}", i); name = src.slice(i + 1, end); i = end + 1; }
      let test;
      try { const re = new RegExp(`^\\${c}{${name}}$`, "u"); test = (ch) => re.test(ch); } catch { test = (ch) => /\p{L}/u.test(ch); }
      return setNode(test);
    }
    return setNode(eqChar(parseEscapeChar()));
  }
  function parseClass() {
    i += 1; // [
    let negate = false;
    if (src[i] === "^") { negate = true; i += 1; }
    const tests = [];
    let first = true;
    while (i < src.length && !(src[i] === "]" && !(first && lang === "py"))) {
      first = false;
      const lo = parseClassAtom();
      if (src[i] === "-" && src[i + 1] !== "]" && i + 1 < src.length && lo.ch !== undefined) {
        const save = i;
        i += 1;
        const hi = parseClassAtom();
        if (hi.ch !== undefined) {
          tests.push(icase ? (c) => (c >= lo.ch && c <= hi.ch) || (c.toLowerCase() >= lo.ch.toLowerCase() && c.toLowerCase() <= hi.ch.toLowerCase()) || (c.toUpperCase() >= lo.ch && c.toUpperCase() <= hi.ch) : (c) => c >= lo.ch && c <= hi.ch);
          continue;
        }
        i = save;
      }
      tests.push(lo.test);
    }
    if (src[i] !== "]") fail("unterminated character class");
    i += 1;
    return setNode((ch) => tests.some((t) => t(ch)) !== negate);
  }
  function parseClassAtom() {
    if (src[i] === "\\") {
      i += 1;
      const c = src[i];
      const set = escapeToSet(c);
      if (set) { i += 1; return { test: set.match }; }
      if (c === "p" || c === "P") { i -= 1; return { test: parseEscape().match }; }
      if (c === "b") { i += 1; return { ch: "\b", test: (ch) => ch === "\b" }; }
      const ch = parseEscapeChar();
      return { ch, test: eqChar(ch) };
    }
    const ch = src[i];
    i += 1;
    return { ch, test: eqChar(ch) };
  }
  function parseAtom() {
    const c = src[i];
    if (c === "(") return parseGroup();
    if (c === "[") return parseClass();
    if (c === "\\") return parseEscape();
    if (c === ".") { i += 1; return setNode((ch) => dotAll || (ch !== "\n" && ch !== "\r")); }
    if (c === "^" || c === "$") { i += 1; return { t: "anchor", c }; }
    if (c === "*" || c === "+" || c === "?") fail("nothing to repeat");
    i += 1;
    return setNode(eqChar(c));
  }

  const ast = parseAlt();
  if (i < src.length) fail("unmatched )");
  return ast;
}

// --- analysis helpers -------------------------------------------------------

const memoFirst = new WeakMap();
const memoLast = new WeakMap();
function lastInfo(node) {
  if (memoLast.has(node)) return memoLast.get(node);
  let out;
  switch (node.t) {
    case "set": case "anchor": case "look": case "backref": out = firstInfo(node); break;
    case "group": out = lastInfo(node.body); break;
    case "quant": { const b = lastInfo(node.body); out = { set: b.set, nullable: node.min === 0 || b.nullable }; break; }
    case "alt": { const set = new Set(); let nullable = false; for (const a of node.alts) { const f = lastInfo(a); f.set.forEach((c) => set.add(c)); nullable ||= f.nullable; } out = { set, nullable }; break; }
    case "seq": { const set = new Set(); let nullable = true; for (const it of [...node.items].reverse()) { const f = lastInfo(it); f.set.forEach((c) => set.add(c)); if (!f.nullable) { nullable = false; break; } } out = { set, nullable }; break; }
    default: out = { set: new Set(), nullable: true };
  }
  memoLast.set(node, out);
  return out;
}
function firstInfo(node) {
  if (memoFirst.has(node)) return memoFirst.get(node);
  let out;
  switch (node.t) {
    case "set": out = { set: new Set(ALPHABET.filter((c) => node.match(c))), nullable: false }; break;
    case "anchor": case "look": case "backref": out = { set: new Set(), nullable: true }; break;
    case "group": out = firstInfo(node.body); break;
    case "quant": { const b = firstInfo(node.body); out = { set: b.set, nullable: node.min === 0 || b.nullable }; break; }
    case "alt": { const set = new Set(); let nullable = false; for (const a of node.alts) { const f = firstInfo(a); f.set.forEach((c) => set.add(c)); nullable ||= f.nullable; } out = { set, nullable }; break; }
    case "seq": { const set = new Set(); let nullable = true; for (const it of node.items) { const f = firstInfo(it); f.set.forEach((c) => set.add(c)); if (!f.nullable) { nullable = false; break; } } out = { set, nullable }; break; }
    default: out = { set: new Set(), nullable: true };
  }
  memoFirst.set(node, out);
  return out;
}
const isNullable = (n) => firstInfo(n).nullable;

function charsOf(node, acc = new Set()) {
  if (node.t === "set") ALPHABET.forEach((c) => node.match(c) && acc.add(c));
  else if (node.t === "group" || node.t === "quant") charsOf(node.body, acc);
  else if (node.t === "alt") node.alts.forEach((a) => charsOf(a, acc));
  else if (node.t === "seq") node.items.forEach((a) => charsOf(a, acc));
  return acc;
}

const isUnbounded = (n) => n.t === "quant" && n.max === INF && !n.possessive;
const union = (...sets) => new Set(sets.flatMap((s) => [...s]));
const intersects = (a, b) => [...a].some((c) => b.has(c));

// Characters that the *end* (or start) of a node can absorb an unbounded
// number of times. Walks through trailing (leading) items that may be empty.
function flex(node, fromEnd) {
  switch (node.t) {
    case "quant":
      if (node.possessive) return new Set();
      // A repeated single character class absorbs its own characters; a repeated
      // compound body is delimited by whatever its own ends are.
      if (isUnbounded(node)) return singleChar(node.body) ? charsOf(node.body) : flex(node.body, fromEnd);
      return flex(node.body, fromEnd);
    case "group": return node.atomic ? new Set() : flex(node.body, fromEnd);
    case "alt": return union(...node.alts.map((a) => flex(a, fromEnd)));
    case "seq": {
      const items = fromEnd ? [...node.items].reverse() : node.items;
      let acc = new Set();
      for (const it of items) { acc = union(acc, flex(it, fromEnd)); if (!isNullable(it)) break; }
      return acc;
    }
    default: return new Set();
  }
}

function hasUnbounded(node) {
  if (isUnbounded(node)) return true;
  if (node.t === "quant" && node.possessive) return false;
  if (node.t === "group") return node.atomic ? false : hasUnbounded(node.body);
  if (node.t === "quant") return hasUnbounded(node.body);
  if (node.t === "alt") return node.alts.some(hasUnbounded);
  if (node.t === "seq") return node.items.some(hasUnbounded);
  return false;
}

function unwrap(node) {
  let n = node;
  while (n.t === "group" && !n.atomic) n = n.body;
  while (n.t === "seq" && n.items.length === 1) n = n.items[0];
  return n.t === "group" && !n.atomic ? unwrap(n.body) : n;
}

function literalString(node) {
  const n = unwrap(node);
  if (n.t === "set" && !n.multi) { const m = ALPHABET.filter((c) => n.match(c)); return m.length === 1 ? m[0] : null; }
  if (n.t === "seq" && n.items.length) {
    let s = "";
    for (const it of n.items) { const l = literalString(it); if (l === null || it.t === "quant") return null; s += l; }
    return s;
  }
  return null;
}

function singleChar(node) {
  const n = unwrap(node);
  return n.t === "set" ? n : null;
}

function walk(node, fn) {
  fn(node);
  if (node.t === "group" || node.t === "quant") walk(node.body, fn);
  else if (node.t === "alt") node.alts.forEach((a) => walk(a, fn));
  else if (node.t === "seq") node.items.forEach((a) => walk(a, fn));
}

const snippet = (src, node) => (node.s !== undefined ? src.slice(node.s, node.e) : src);

export function analyzePattern(src, flags = "", lang = "js") {
  let ast;
  try { ast = parseRegex(src, { flags, lang }); } catch (err) {
    return { parsed: false, findings: [{ rule: "unparsable", severity: "info", message: `Could not parse /${src}/ (${err.message}); not analysed.` }] };
  }
  const findings = [];
  const seen = new Set();
  const add = (rule, message, node) => {
    const key = `${rule}:${node ? node.s : ""}:${node ? node.e : ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ rule, severity: RULES[rule].severity, message, part: node ? snippet(src, node) : src });
  };

  walk(ast, (node) => {
    if (node.t === "quant" && isUnbounded(node)) {
      const body = unwrap(node.body);
      if (body.t === "group" && body.atomic) return;
      if (node.body.t === "group" && node.body.atomic) return;
      // 1. nested quantifier: the end of one iteration can be re-consumed by the start of the next.
      if (hasUnbounded(node.body) || body.t === "alt") {
        const first = firstInfo(node.body).set;
        const tail = flex(node.body, true);
        const head = flex(node.body, false);
        const last = lastInfo(node.body).set;
        if (hasUnbounded(node.body) && (intersects(tail, first) || intersects(last, head))) {
          add("nested-quantifier", `${snippet(src, node)} repeats a body that already ends in an unbounded repeat over characters the next iteration can also start with, so a long run of them followed by a non-match splits exponentially many ways.`, node);
        }
      }
      // 2. overlapping alternation under a repeat.
      const alt = body.t === "alt" ? body : null;
      if (alt) {
        outer: for (let a = 0; a < alt.alts.length; a += 1) {
          for (let b = a + 1; b < alt.alts.length; b += 1) {
            const A = alt.alts[a]; const B = alt.alts[b];
            const sa = singleChar(A); const sb = singleChar(B);
            const la = literalString(A); const lb = literalString(B);
            let certain = false; let suspect = false;
            if (sa && sb) certain = intersects(firstInfo(sa).set, firstInfo(sb).set);
            else if (la && lb && la !== lb) {
              const [short, long] = la.length <= lb.length ? [la, lb] : [lb, la];
              if (long.startsWith(short)) {
                const rest = long.slice(short.length);
                certain = rest.length > 0 && alt.alts.some((x) => firstInfo(x).set.has(rest[0]));
              }
            } else if (la && lb && la === lb) certain = true;
            else if (!(la && lb)) suspect = !firstInfo(A).nullable && !firstInfo(B).nullable && intersects(firstInfo(A).set, firstInfo(B).set);
            if (certain) {
              add("overlapping-alternation", `Branches ${snippet(src, A) || "(empty)"} and ${snippet(src, B) || "(empty)"} inside ${snippet(src, node)} can match the same text, so each repeat has more than one way to continue.`, node);
              break outer;
            }
            if (suspect) {
              add("overlapping-alternation", `Branches ${snippet(src, A)} and ${snippet(src, B)} inside ${snippet(src, node)} can start with the same characters; if they can also match the same whole text the repeat is exponential. Confirm with --probe.`, node);
              break outer;
            }
          }
        }
      }
    }
    // 3. adjacent unbounded repeats over overlapping characters.
    if (node.t === "seq") {
      const items = node.items;
      for (let a = 0; a < items.length; a += 1) {
        const tf = flex(items[a], true);
        if (!tf.size) continue;
        for (let b = a + 1; b < items.length; b += 1) {
          const hf = flex(items[b], false);
          if (intersects(tf, hf)) {
            const from = items[a].s; const to = items[b].e;
            findings.push(...(seen.has(`adjacent-overlap:${from}:${to}`) ? [] : (seen.add(`adjacent-overlap:${from}:${to}`), [{ rule: "adjacent-overlap", severity: "warn", message: `${src.slice(from, to)}: two unbounded repeats here can match the same characters, so a failing input is retried at every split point (polynomial: quadratic or worse).`, part: src.slice(from, to) }])));
            break;
          }
          if (!isNullable(items[b])) break;
        }
      }
    }
  });

  // 4. unbounded repeat before $ with no start anchor.
  const topAlts = ast.t === "alt" ? ast.alts : [ast];
  for (const alt of topAlts) {
    const items = alt.t === "seq" ? alt.items : [alt];
    if (items.length < 2) continue;
    const last = items[items.length - 1];
    const prev = items[items.length - 2];
    const endsAtDollar = last.t === "anchor" && last.c === "$";
    const startAnchored = items[0].t === "anchor" && items[0].c === "^" && !flags.includes("m");
    if (endsAtDollar && !startAnchored && flex(prev, true).size) {
      const set = flex(prev, true);
      const ws = [" ", "\t", "\n"].some((c) => set.has(c));
      findings.push({ rule: "quadratic-end-anchor", severity: ws ? "warn" : "info", message: `${src.slice(prev.s, last.e)} has no ^ anchor: on a long run that is not at the end of the input the engine retries from every start position (quadratic)${ws ? " -- this is the classic whitespace-trim pattern behind the 2016 Stack Overflow outage" : ""}.`, part: src.slice(prev.s, last.e) });
    }
  }

  if (findings.some((f) => f.severity === "error")) {
    for (let k = findings.length - 1; k >= 0; k -= 1) if (findings[k].rule === "quadratic-end-anchor" && findings[k].severity === "info") findings.splice(k, 1);
  }
  const order = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { parsed: true, findings };
}

// --- finding regex literals in source ---------------------------------------

const lineAt = (text, index) => text.slice(0, index).split("\n").length;
const KEYWORDS_BEFORE_REGEX = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

function unescapeJsString(body) {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (m, c) => {
    if (c[0] === "u" && c.length > 1) return c[1] === "{" ? String.fromCodePoint(parseInt(c.slice(2, -1), 16)) : String.fromCharCode(parseInt(c.slice(1), 16));
    if (c[0] === "x" && c.length === 3) return String.fromCharCode(parseInt(c.slice(1), 16));
    return { n: "\n", t: "\t", r: "\r", f: "\f", v: "\v", 0: "\0" }[c] ?? c;
  });
}

export function extractJsRegexes(text) {
  const found = [];
  const n = text.length;
  let i = 0;
  let prev = { kind: "start" };
  const regexAllowed = () => prev.kind === "start" || (prev.kind === "punct" && !")]}".includes(prev.v)) || (prev.kind === "word" && KEYWORDS_BEFORE_REGEX.has(prev.v));
  while (i < n) {
    const c = text[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === "/" && text[i + 1] === "/") { while (i < n && text[i] !== "\n") i += 1; continue; }
    if (c === "/" && text[i + 1] === "*") { const end = text.indexOf("*/", i + 2); i = end < 0 ? n : end + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const start = i;
      i += 1;
      while (i < n && text[i] !== c) { if (text[i] === "\\") i += 1; i += 1; }
      i += 1;
      prev = { kind: "lit", start, end: i, quote: c, body: text.slice(start + 1, i - 1) };
      continue;
    }
    if (c === "/" && regexAllowed()) {
      let j = i + 1; let inClass = false; let ok = false;
      while (j < n && text[j] !== "\n") {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === "[") inClass = true;
        else if (text[j] === "]") inClass = false;
        else if (text[j] === "/" && !inClass) { ok = true; break; }
        j += 1;
      }
      if (ok && j > i + 1) {
        const pattern = text.slice(i + 1, j);
        let k = j + 1;
        while (/[a-z]/.test(text[k] || "")) k += 1;
        found.push({ pattern, flags: text.slice(j + 1, k), line: lineAt(text, i), kind: "literal", lang: "js" });
        i = k;
        prev = { kind: "lit" };
        continue;
      }
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(text[j])) j += 1;
      prev = { kind: "word", v: text.slice(i, j) };
      if (prev.v === "RegExp") {
        const m = /^\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\\n])*)\1(?=\s*[,)])(?:\s*,\s*(["'])([a-z]*)\3)?/.exec(text.slice(j));
        if (m) found.push({ pattern: unescapeJsString(m[2]), flags: m[4] || "", line: lineAt(text, i), kind: "RegExp", lang: "js" });
        else if (/^\s*\(\s*[A-Za-z_$]/.test(text.slice(j)) && !/^\s*\(\s*(?:["'`])/.test(text.slice(j))) found.push({ pattern: null, flags: "", line: lineAt(text, i), kind: "dynamic", lang: "js" });
      }
      i = j;
      continue;
    }
    if (/\d/.test(c)) { let j = i; while (j < n && /[\w.]/.test(text[j])) j += 1; i = j; prev = { kind: "lit" }; continue; }
    prev = { kind: "punct", v: c };
    i += 1;
  }
  return found;
}

export function extractPythonRegexes(text) {
  const found = [];
  const re = /(?:\b(?:re|regex)\.(?:compile|match|search|fullmatch|sub|subn|findall|finditer|split)\(\s*|\b\w*(?:re|regex|pattern|pat|rx)\w*\s*=\s*(?:re\.compile\(\s*)?)([rRbBuU]{0,2})("""|'''|"|')/gi;
  let m;
  while ((m = re.exec(text))) {
    const raw = /r/i.test(m[1]);
    if (!raw && /^[A-Za-z_]\w*\s*=/.test(m[0]) && !/re\.compile/.test(m[0])) continue;
    const quote = m[2];
    let j = re.lastIndex;
    let body = "";
    while (j < text.length && !text.startsWith(quote, j)) {
      if (text[j] === "\\" && j + 1 < text.length) { body += raw ? text.slice(j, j + 2) : (text[j + 1] === "\\" || text[j + 1] === quote[0] ? text[j + 1] : text.slice(j, j + 2)); j += 2; continue; }
      if (text[j] === "\n" && quote.length === 1) break;
      body += text[j];
      j += 1;
    }
    found.push({ pattern: body, flags: "", line: lineAt(text, m.index), kind: "python", lang: "py" });
    re.lastIndex = j;
  }
  return found;
}

export function extractRegexes(text, file = "") {
  if (/\.py$/.test(file)) return extractPythonRegexes(text);
  if (/\.[cm]?[jt]sx?$/.test(file)) return extractJsRegexes(text);
  // Pasted text of unknown language: the two extractors look for disjoint call shapes.
  return [...extractJsRegexes(text), ...extractPythonRegexes(text)].sort((a, b) => a.line - b.line);
}

export function scanSource(text, file = "pasted source") {
  const patterns = extractRegexes(text, file);
  const findings = [];
  for (const p of patterns) {
    if (p.pattern === null) {
      findings.push({ rule: "dynamic-regexp", severity: "info", file, line: p.line, pattern: "(variable)", message: "new RegExp(...) built from a variable. If any part comes from user input, escape it and cap its length; a user-supplied pattern is itself a ReDoS vector." });
      continue;
    }
    const { findings: fs } = analyzePattern(p.pattern, p.flags, p.lang);
    for (const f of fs) {
      if (f.rule === "unparsable" && p.kind === "python") continue;
      findings.push({ ...f, file, line: p.line, pattern: p.pattern, flags: p.flags, lang: p.lang });
    }
  }
  return { file, patterns, findings };
}

export function mergeScans(scans) {
  return { patterns: scans.flatMap((s) => s.patterns.map((p) => ({ ...p, file: s.file }))), findings: scans.flatMap((s) => s.findings) };
}

export function summarize(scan) {
  const count = (sev) => scan.findings.filter((f) => f.severity === sev).length;
  const errors = count("error"); const warns = count("warn"); const infos = count("info");
  const total = scan.patterns.length;
  if (!total) return { status: "none", errors, warns, infos, text: "No regular expressions found." };
  const status = errors ? "error" : warns ? "warn" : "ok";
  const bits = [`${total} regular expression${total === 1 ? "" : "s"} checked`];
  if (errors) bits.push(`${errors} likely exponential`);
  if (warns) bits.push(`${warns} polynomial warning${warns === 1 ? "" : "s"}`);
  if (infos) bits.push(`${infos} note${infos === 1 ? "" : "s"}`);
  if (!errors && !warns) bits.push("no backtracking risk found");
  return { status, errors, warns, infos, text: bits.join(", ") + "." };
}

export const FIXES = {
  "nested-quantifier": "Make each iteration unambiguous (a+ instead of (a+)+), put a mandatory delimiter between iterations, use an atomic group or possessive quantifier where your engine has one, or run the pattern on a linear-time engine such as RE2. Capping input length is a cheap backstop.",
  "overlapping-alternation": "Make the branches disjoint (use a single class like [\\w] instead of (\\d|\\w)), or order and anchor them so only one can match a given character.",
  "adjacent-overlap": "Merge the two repeats into one, or separate them with a mandatory character the repeats cannot match.",
  "quadratic-end-anchor": "Anchor the start (^) or trim with a loop or String.prototype.trim() instead of a regex.",
  "dynamic-regexp": "Escape user input before building a pattern, bound its length, and prefer a linear-time engine for untrusted patterns.",
};
