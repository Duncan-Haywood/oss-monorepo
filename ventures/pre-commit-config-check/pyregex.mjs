// Does Python's `re.compile` accept this pattern?
//
// pre-commit's `files:` and `exclude:` keys are Python regular expressions
// (cfgv's `check_regex` calls `re.compile`), and a config whose pattern does
// not compile is rejected before any hook runs. JavaScript's RegExp is a
// different dialect: it accepts `\q`, `(?<name>...)` and variable-width
// look-behind that Python refuses, and refuses `(?x)`, `(?P<name>...)` and
// `\Z` that Python accepts. So this file answers the question for Python
// itself, written from the behaviour of CPython 3.11's `re` parser
// (`Lib/re/_parser.py`, and the look-behind width rule in
// `Lib/re/_compiler.py`). It validates; it does not match.
//
// `differential/regex-fuzz.mjs` compares its verdict with CPython's on
// generated patterns; the README gives the last count.
//
// Python versions: possessive quantifiers (`a*+`) and atomic groups (`(?>`)
// are new in 3.11, and "global flags not at the start" became an error in
// 3.11. `pythonVersionNotes` names those so a reader on 3.9/3.10 is told.

const DIGITS = "0123456789";
const OCT = "01234567";
const HEX = "0123456789abcdefABCDEF";
const WS = " \t\n\r\v\f";
const FLAGS = "iLmsxatu";
const TYPE_FLAGS = "aLu";
const MAXREPEAT = 4294967295;
const INF = Infinity;

export class PyRegexError extends Error {
  constructor(message, pos) { super(message); this.pos = pos; }
}

const isAsciiLetter = (c) => /^[A-Za-z]$/.test(c);
// str.isidentifier for the ASCII case, plus a lenient pass for non-ASCII
// letters (Python accepts most Unicode letters in names).
const isIdentifier = (s) => /^[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}_]*$/u.test(s);

class Source {
  constructor(text) {
    this.s = text;
    this.i = 0;
    this.next = null;
    this.advance();
  }
  advance() {
    if (this.i >= this.s.length) { this.next = null; return; }
    let c = this.s[this.i];
    if (c === "\\") {
      if (this.i + 1 >= this.s.length) throw new PyRegexError("bad escape (end of pattern)", this.s.length - 1);
      c += this.s[this.i + 1];
    }
    this.i += c.length;
    this.next = c;
  }
  get() { const c = this.next; this.advance(); return c; }
  match(c) { if (this.next === c) { this.advance(); return true; } return false; }
  tell() { return this.i - (this.next ? this.next.length : 0); }
  seek(i) { this.i = i; this.advance(); }
  getwhile(n, set) {
    let out = "";
    for (let k = 0; k < n; k++) {
      const c = this.next;
      if (c === null || !set.includes(c)) break;
      out += c;
      this.advance();
    }
    return out;
  }
  getuntil(term, name) {
    let out = "";
    for (;;) {
      const c = this.next;
      this.advance();
      if (c === null) {
        if (!out) throw new PyRegexError("missing " + name, this.tell());
        throw new PyRegexError(`missing ${term}, unterminated name`, this.tell());
      }
      if (c === term) {
        if (!out) throw new PyRegexError("missing " + name, this.tell());
        return out;
      }
      out += c;
    }
  }
}

// An item is { kind, lo, hi } with widths for the look-behind rule.
// kinds: "unit" (one character), "at" (zero-width anchor), "repeat",
// "group", "assert", "ref", "cond", "atomic".
function seqWidth(items) {
  let lo = 0, hi = 0;
  for (const it of items) { lo += it.lo; hi += it.hi; }
  return [lo, hi];
}

class State {
  constructor() {
    this.flags = new Set();
    this.groups = 1;
    this.groupWidths = [[0, 0]];
    this.groupNames = new Map();
    this.lookbehindGroups = null;
    this.condRefs = new Map();
    this.notes = new Set();
  }
  open(name, pos) {
    const gid = this.groups++;
    this.groupWidths.push(null);
    if (name !== null) {
      if (this.groupNames.has(name)) {
        throw new PyRegexError(`redefinition of group name '${name}' as group ${gid}; was group ${this.groupNames.get(name)}`, pos);
      }
      this.groupNames.set(name, gid);
    }
    return gid;
  }
  isClosed(gid) { return gid < this.groups && this.groupWidths[gid] !== null; }
  checkLookbehindRef(gid, pos) {
    if (this.lookbehindGroups === null) return;
    if (!this.isClosed(gid)) throw new PyRegexError("cannot refer to an open group", pos);
    if (gid >= this.lookbehindGroups) throw new PyRegexError("cannot refer to group defined in the same lookbehind subpattern", pos);
  }
}

// Escape inside a character class: returns { lit: codepoint } or { cat: true }.
function classEscape(src, esc, pos) {
  const c = esc[1];
  if ("abfnrtv\\".includes(c)) return { lit: 1 };
  if ("dDsSwW".includes(c)) return { cat: true };
  if (c === "x") return hexEscape(src, esc, 2, pos);
  if (c === "u") return hexEscape(src, esc, 4, pos);
  if (c === "U") return hexEscape(src, esc, 8, pos);
  if (c === "N") return namedEscape(src, pos);
  if (OCT.includes(c)) {
    const more = src.getwhile(2, OCT);
    if (parseInt(c + more, 8) > 0o377) throw new PyRegexError(`octal escape value ${esc + more} outside of range 0-0o377`, pos);
    return { lit: parseInt(c + more, 8) };
  }
  if (DIGITS.includes(c) || isAsciiLetter(c)) throw new PyRegexError(`bad escape ${esc}`, pos);
  return { lit: c.codePointAt(0) };
}

function hexEscape(src, esc, n, pos) {
  const digits = src.getwhile(n, HEX);
  if (digits.length !== n) throw new PyRegexError(`incomplete escape ${esc}${digits}`, pos);
  const v = parseInt(digits, 16);
  if (n === 8 && v > 0x10ffff) throw new PyRegexError(`bad escape ${esc}${digits}`, pos);
  return { lit: v };
}

function namedEscape(src, pos) {
  // A real lookup needs the Unicode name table; any non-empty name is
  // accepted here, and `pythonVersionNotes` says so.
  if (!src.match("{")) throw new PyRegexError("missing {", pos);
  src.getuntil("}", "character name");
  return { lit: 0, named: true };
}

function escape(src, esc, state, pos) {
  const c = esc[1];
  if ("AbBZ".includes(c)) return { kind: "at", lo: 0, hi: 0 };
  if ("dDsSwW".includes(c)) return { kind: "unit", lo: 1, hi: 1 };
  if ("afnrtv\\".includes(c)) return { kind: "unit", lo: 1, hi: 1 };
  if (c === "x" || c === "u" || c === "U") {
    hexEscape(src, esc, c === "x" ? 2 : c === "u" ? 4 : 8, pos);
    return { kind: "unit", lo: 1, hi: 1 };
  }
  if (c === "N") { namedEscape(src, pos); state.notes.add("named-escape"); return { kind: "unit", lo: 1, hi: 1 }; }
  if (c === "0") { src.getwhile(2, OCT); return { kind: "unit", lo: 1, hi: 1 }; }
  if (DIGITS.includes(c)) {
    let digits = c;
    if (src.next !== null && DIGITS.includes(src.next)) {
      digits += src.get();
      if (OCT.includes(digits[0]) && OCT.includes(digits[1]) && src.next !== null && OCT.includes(src.next)) {
        digits += src.get();
        if (parseInt(digits, 8) > 0o377) throw new PyRegexError(`octal escape value \\${digits} outside of range 0-0o377`, pos);
        return { kind: "unit", lo: 1, hi: 1 };
      }
    }
    const gid = parseInt(digits, 10);
    if (gid < state.groups) {
      if (!state.isClosed(gid)) throw new PyRegexError("cannot refer to an open group", pos);
      state.checkLookbehindRef(gid, pos);
      const [lo, hi] = state.groupWidths[gid];
      return { kind: "ref", lo, hi };
    }
    throw new PyRegexError(`invalid group reference ${gid}`, pos + 1);
  }
  if (isAsciiLetter(c)) throw new PyRegexError(`bad escape ${esc}`, pos);
  return { kind: "unit", lo: 1, hi: 1 };
}

function parseAlternation(src, state, verbose, nested) {
  const branches = [];
  for (;;) {
    const r = parseSequence(src, state, verbose, nested + 1, nested === 0 && branches.length === 0);
    branches.push(r.items);
    verbose = r.verbose;
    if (!src.match("|")) break;
    if (nested === 0) verbose = state.flags.has("x");
  }
  if (branches.length === 1) return { items: branches[0], verbose };
  let lo = INF, hi = 0;
  for (const b of branches) { const [l, h] = seqWidth(b); lo = Math.min(lo, l); hi = Math.max(hi, h); }
  return { items: [{ kind: "group", lo, hi }], verbose };
}

function parseFlags(src, state, ch, start) {
  const add = new Set();
  const del = new Set();
  if (ch !== "-") {
    for (;;) {
      if (ch === "L") throw new PyRegexError("bad inline flags: cannot use 'L' flag with a str pattern", src.tell());
      add.add(ch);
      const types = [...add].filter((f) => TYPE_FLAGS.includes(f));
      if (TYPE_FLAGS.includes(ch) && types.length > 1) throw new PyRegexError("bad inline flags: flags 'a', 'u' and 'L' are incompatible", src.tell());
      ch = src.get();
      if (ch === null) throw new PyRegexError("missing -, : or )", src.tell());
      if (")-:".includes(ch)) break;
      if (!FLAGS.includes(ch)) throw new PyRegexError(/^\p{L}$/u.test(ch) ? "unknown flag" : "missing -, : or )", src.tell());
    }
  }
  if (ch === ")") {
    for (const f of add) state.flags.add(f);
    return null;
  }
  if (add.has("t")) throw new PyRegexError("bad inline flags: cannot turn on global flag", src.tell());
  if (ch === "-") {
    ch = src.get();
    if (ch === null) throw new PyRegexError("missing flag", src.tell());
    if (!FLAGS.includes(ch)) throw new PyRegexError(/^\p{L}$/u.test(ch) ? "unknown flag" : "missing flag", src.tell());
    for (;;) {
      if (TYPE_FLAGS.includes(ch)) throw new PyRegexError("bad inline flags: cannot turn off flags 'a', 'u' and 'L'", src.tell());
      del.add(ch);
      ch = src.get();
      if (ch === null) throw new PyRegexError("missing :", src.tell());
      if (ch === ":") break;
      if (!FLAGS.includes(ch)) throw new PyRegexError(/^\p{L}$/u.test(ch) ? "unknown flag" : "missing :", src.tell());
    }
  }
  if (del.has("t")) throw new PyRegexError("bad inline flags: cannot turn off global flag", src.tell());
  for (const f of add) if (del.has(f)) throw new PyRegexError("bad inline flags: flag turned on and off", src.tell());
  return { add, del };
}

function parseSequence(src, state, verbose, nested, first) {
  const items = [];
  for (;;) {
    const ch = src.next;
    if (ch === null || ch === "|" || ch === ")") break;
    const pos = src.tell();
    src.get();
    if (verbose) {
      if (WS.includes(ch)) continue;
      if (ch === "#") {
        for (;;) { const c = src.get(); if (c === null || c === "\n") break; }
        continue;
      }
    }
    if (ch[0] === "\\") { items.push(escape(src, ch, state, pos)); continue; }
    if (!".\\[{()*+?^$|".includes(ch)) { items.push({ kind: "unit", lo: 1, hi: 1 }); continue; }
    if (ch === "[") { parseClass(src, pos); items.push({ kind: "unit", lo: 1, hi: 1 }); continue; }
    if ("*+?{".includes(ch)) {
      let min, max;
      if (ch === "?") [min, max] = [0, 1];
      else if (ch === "*") [min, max] = [0, MAXREPEAT];
      else if (ch === "+") [min, max] = [1, MAXREPEAT];
      else {
        if (src.next === "}") { items.push({ kind: "unit", lo: 1, hi: 1 }); continue; }
        const here = src.tell();
        let lo = "", hi = "";
        while (src.next !== null && DIGITS.includes(src.next)) lo += src.get();
        if (src.match(",")) { while (src.next !== null && DIGITS.includes(src.next)) hi += src.get(); }
        else hi = lo;
        if (!src.match("}")) { items.push({ kind: "unit", lo: 1, hi: 1 }); src.seek(here); continue; }
        min = 0; max = MAXREPEAT;
        if (lo) { min = Number(lo); if (min >= MAXREPEAT) throw new PyRegexError("the repetition number is too large", pos); }
        if (hi) {
          max = Number(hi);
          if (max >= MAXREPEAT) throw new PyRegexError("the repetition number is too large", pos);
          if (max < min) throw new PyRegexError("min repeat greater than max repeat", pos);
        }
      }
      const prev = items[items.length - 1];
      if (!prev || prev.kind === "at") throw new PyRegexError("nothing to repeat", pos);
      if (prev.kind === "repeat") throw new PyRegexError("multiple repeat", pos);
      if (!src.match("?") && src.match("+")) state.notes.add("possessive");
      state.repeats = true;
      const unbounded = max === MAXREPEAT;
      items[items.length - 1] = {
        kind: "repeat",
        lo: prev.lo * min,
        hi: unbounded && prev.hi ? INF : prev.hi * (unbounded ? 0 : max),
      };
      continue;
    }
    if (ch === ".") { items.push({ kind: "unit", lo: 1, hi: 1 }); continue; }
    if (ch === "^" || ch === "$") { items.push({ kind: "at", lo: 0, hi: 0 }); continue; }
    if (ch === "(") {
      const start = pos;
      let capture = true, name = null, subVerbose = verbose, atomic = false;
      if (src.match("?")) {
        const c = src.get();
        if (c === null) throw new PyRegexError("unexpected end of pattern", src.tell());
        if (c === "P") {
          if (src.match("<")) {
            name = src.getuntil(">", "group name");
            if (!isIdentifier(name)) throw new PyRegexError(`bad character in group name '${name}'`, src.tell());
          } else if (src.match("=")) {
            const ref = src.getuntil(")", "group name");
            if (!isIdentifier(ref)) throw new PyRegexError(`bad character in group name '${ref}'`, src.tell());
            const gid = state.groupNames.get(ref);
            if (gid === undefined) throw new PyRegexError(`unknown group name '${ref}'`, src.tell());
            if (!state.isClosed(gid)) throw new PyRegexError("cannot refer to an open group", src.tell());
            state.checkLookbehindRef(gid, src.tell());
            const [lo, hi] = state.groupWidths[gid];
            items.push({ kind: "ref", lo, hi });
            continue;
          } else {
            const d = src.get();
            if (d === null) throw new PyRegexError("unexpected end of pattern", src.tell());
            throw new PyRegexError("unknown extension ?P" + d, src.tell());
          }
        } else if (c === ":") {
          capture = false;
        } else if (c === "#") {
          for (;;) {
            if (src.next === null) throw new PyRegexError("missing ), unterminated comment", start);
            if (src.get() === ")") break;
          }
          continue;
        } else if ("=!<".includes(c)) {
          let behind = false;
          let dir = c;
          let saved = null;
          if (c === "<") {
            dir = src.get();
            if (dir === null) throw new PyRegexError("unexpected end of pattern", src.tell());
            if (!"=!".includes(dir)) throw new PyRegexError("unknown extension ?<" + dir, src.tell());
            behind = true;
            saved = state.lookbehindGroups;
            if (saved === null) state.lookbehindGroups = state.groups;
          }
          const inner = parseAlternation(src, state, verbose, nested + 1);
          if (behind && saved === null) state.lookbehindGroups = null;
          if (!src.match(")")) throw new PyRegexError("missing ), unterminated subpattern", start);
          if (behind) {
            const [lo, hi] = seqWidth(inner.items);
            if (lo !== hi) throw new LookbehindWidthError();
          }
          items.push({ kind: "assert", lo: 0, hi: 0 });
          continue;
        } else if (c === "(") {
          const cond = src.getuntil(")", "group name");
          let gid;
          if (isIdentifier(cond)) {
            gid = state.groupNames.get(cond);
            if (gid === undefined) throw new PyRegexError(`unknown group name '${cond}'`, src.tell());
          } else {
            if (!/^[0-9]+$/.test(cond)) throw new PyRegexError(`bad character in group name '${cond}'`, src.tell());
            gid = Number(cond);
            if (!gid) throw new PyRegexError("bad group number", src.tell());
            if (gid >= 1073741823) throw new PyRegexError(`invalid group reference ${gid}`, src.tell());
            if (!state.condRefs.has(gid)) state.condRefs.set(gid, src.tell());
          }
          state.checkLookbehindRef(gid, src.tell());
          const yes = parseSequence(src, state, verbose, nested + 1, false).items;
          let no = null;
          if (src.match("|")) {
            no = parseSequence(src, state, verbose, nested + 1, false).items;
            if (src.next === "|") throw new PyRegexError("conditional backref with more than two branches", src.tell());
          }
          if (!src.match(")")) throw new PyRegexError("missing ), unterminated subpattern", start);
          let [lo, hi] = seqWidth(yes);
          if (no) { const [l, h] = seqWidth(no); lo = Math.min(lo, l); hi = Math.max(hi, h); } else lo = 0;
          items.push({ kind: "cond", lo, hi });
          continue;
        } else if (c === ">") {
          capture = false;
          atomic = true;
          state.notes.add("atomic");
        } else if (FLAGS.includes(c) || c === "-") {
          const f = parseFlags(src, state, c, start);
          if (f === null) {
            if (!first || items.length) throw new PyRegexError("global flags not at the start of the expression", start);
            verbose = state.flags.has("x");
            continue;
          }
          capture = false;
          subVerbose = (verbose || f.add.has("x")) && !f.del.has("x");
        } else {
          throw new PyRegexError("unknown extension ?" + c, src.tell());
        }
      }
      const gid = capture ? state.open(name, src.tell()) : null;
      const inner = parseAlternation(src, state, subVerbose, nested + 1);
      if (!src.match(")")) throw new PyRegexError("missing ), unterminated subpattern", start);
      const [lo, hi] = seqWidth(inner.items);
      if (gid !== null) state.groupWidths[gid] = [lo, hi];
      items.push({ kind: atomic ? "atomic" : "group", lo, hi });
      continue;
    }
  }
  return { items, verbose };
}

class LookbehindWidthError extends Error {}

function parseClass(src, start) {
  let count = 0;
  src.match("^");
  for (;;) {
    let ch = src.get();
    if (ch === null) throw new PyRegexError("unterminated character set", start);
    if (ch === "]" && count) break;
    const pos = src.tell();
    const a = ch[0] === "\\" ? classEscape(src, ch, pos) : { lit: ch.codePointAt(0) };
    if (src.match("-")) {
      const that = src.get();
      if (that === null) throw new PyRegexError("unterminated character set", start);
      if (that === "]") { count += 2; break; }
      const b = that[0] === "\\" ? classEscape(src, that, src.tell()) : { lit: that.codePointAt(0) };
      if (a.cat || b.cat) throw new PyRegexError(`bad character range ${ch}-${that}`, pos);
      if (!a.named && !b.named && litValue(that, b) < litValue(ch, a)) throw new PyRegexError(`bad character range ${ch}-${that}`, pos);
    }
    count++;
  }
}

// classEscape returns { lit: 1 } as a placeholder for the single-letter
// escapes; recover their real code points for range comparison.
function litValue(token, parsed) {
  if (token.length === 1) return token.codePointAt(0);
  const c = token[1];
  const map = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, "\\": 92 };
  if (c in map) return map[c];
  return parsed.lit;
}

/**
 * Check a pattern the way Python 3.11's `re.compile(pattern)` would.
 * Returns { ok: true, notes } or { ok: false, message, pos }.
 */
export function checkPythonRegex(pattern) {
  if (typeof pattern !== "string") return { ok: false, message: "not a string", pos: 0 };
  const state = new State();
  try {
    const src = new Source(pattern);
    parseAlternation(src, state, false, 0);
    if (src.next !== null) throw new PyRegexError("unbalanced parenthesis", src.tell());
    for (const [gid, pos] of state.condRefs) {
      if (gid >= state.groups) throw new PyRegexError(`invalid group reference ${gid}`, pos);
    }
    if (state.flags.has("t") && state.repeats) throw new PyRegexError("internal: unsupported template operator MAX_REPEAT", 0);
    if (state.flags.has("a") && state.flags.has("u")) throw new PyRegexError("ASCII and UNICODE flags are incompatible", 0);
  } catch (e) {
    if (e instanceof LookbehindWidthError) return { ok: false, message: "look-behind requires fixed-width pattern", pos: null };
    if (e instanceof PyRegexError) return { ok: false, message: e.message, pos: e.pos };
    throw e;
  }
  return { ok: true, notes: [...state.notes], verbose: state.flags.has("x") };
}

export function pythonVersionNotes(result) {
  const out = [];
  if (!result.ok) return out;
  if (result.notes.includes("possessive")) out.push("uses a possessive quantifier (*+, ++, ?+), which Python 3.10 and older reject as 'multiple repeat'");
  if (result.notes.includes("atomic")) out.push("uses an atomic group (?>...), which Python 3.10 and older reject as an unknown extension");
  if (result.notes.includes("named-escape")) out.push("uses \\N{...}; the character name itself is not checked here");
  return out;
}
