// A port of how BuildKit decides which files of a build context it sends.
//
// Three Go sources, ported line for line and checked against them on random
// trees (README, "How it is checked"):
//
//   moby/patternmatcher v0.6.1  ignorefile.ReadAll  -> readIgnore()
//                               New, MatchesUsingParentResults, Pattern.match,
//                               Pattern.compile     -> newMatcher(), matchPath()
//   tonistiigi/fsutil           filterFS.Walk (exclude half) -> walk()
//   Go path/filepath            Clean, Match        -> goClean(), goMatch()
//
// Go's regexp is reached through a translator for the subset compile() can
// emit (goRegexToJs). Pure functions, no imports, no I/O.
//
// Licences: the translated parts keep their upstream licences (Apache-2.0,
// BSD-3-Clause, MIT); see THIRD_PARTY_NOTICES.md and licenses/.

// ---------------------------------------------------------------- Go helpers

// unicode.IsSpace, which strings.TrimSpace uses: ASCII \t\n\v\f\r and space,
// U+0085, U+00A0, and the Unicode Z categories. JS's trim() differs on U+FEFF
// (JS trims it, Go does not) and U+0085 (Go trims it, JS does not).
const GO_SPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000]);

export function goTrimSpace(s) {
  const cps = [...s];
  let a = 0;
  let b = cps.length;
  while (a < b && GO_SPACE.has(cps[a].codePointAt(0))) a++;
  while (b > a && GO_SPACE.has(cps[b - 1].codePointAt(0))) b--;
  return cps.slice(a, b).join("");
}

// path/filepath.Clean on a Unix system.
export function goClean(path) {
  if (path === "") return ".";
  const rooted = path[0] === "/";
  const out = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!rooted) out.push("..");
      continue;
    }
    out.push(part);
  }
  const s = (rooted ? "/" : "") + out.join("/");
  return s === "" ? "." : s;
}

class BadPattern extends Error {
  constructor() {
    super("syntax error in pattern");
  }
}

// Go strings are bytes; these helpers walk JS strings by code unit, which is
// the same as Go's byte walk for every decision Match makes (all the special
// characters are ASCII), and decode a whole code point where Go decodes a rune.
function cpAt(s, i) {
  const c = s.codePointAt(i);
  return [c, c > 0xffff ? 2 : 1];
}

function scanChunk(pattern) {
  let star = false;
  while (pattern.length > 0 && pattern[0] === "*") {
    pattern = pattern.slice(1);
    star = true;
  }
  let inrange = false;
  let i;
  for (i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      if (i + 1 < pattern.length) i++;
    } else if (c === "[") inrange = true;
    else if (c === "]") inrange = false;
    else if (c === "*" && !inrange) break;
  }
  return [star, pattern.slice(0, i), pattern.slice(i)];
}

function getEsc(chunk) {
  if (chunk.length === 0 || chunk[0] === "-" || chunk[0] === "]") throw new BadPattern();
  if (chunk[0] === "\\") {
    chunk = chunk.slice(1);
    if (chunk.length === 0) throw new BadPattern();
  }
  const [r, n] = cpAt(chunk, 0);
  const rest = chunk.slice(n);
  if (rest.length === 0) throw new BadPattern();
  return [r, rest];
}

function matchChunk(chunk, s) {
  let failed = false;
  while (chunk.length > 0) {
    if (!failed && s.length === 0) failed = true;
    const c = chunk[0];
    if (c === "[") {
      let r = -1;
      if (!failed) {
        const [cp, n] = cpAt(s, 0);
        r = cp;
        s = s.slice(n);
      }
      chunk = chunk.slice(1);
      let negated = false;
      if (chunk.length > 0 && chunk[0] === "^") {
        negated = true;
        chunk = chunk.slice(1);
      }
      let match = false;
      let nrange = 0;
      for (;;) {
        if (chunk.length > 0 && chunk[0] === "]" && nrange > 0) {
          chunk = chunk.slice(1);
          break;
        }
        let lo;
        [lo, chunk] = getEsc(chunk);
        let hi = lo;
        if (chunk[0] === "-") [hi, chunk] = getEsc(chunk.slice(1));
        if (lo <= r && r <= hi) match = true;
        nrange++;
      }
      if (match === negated) failed = true;
    } else if (c === "?") {
      if (!failed) {
        if (s[0] === "/") failed = true;
        s = s.slice(cpAt(s, 0)[1]);
      }
      chunk = chunk.slice(1);
    } else {
      if (c === "\\") {
        chunk = chunk.slice(1);
        if (chunk.length === 0) throw new BadPattern();
      }
      if (!failed) {
        if (chunk[0] !== s[0]) failed = true;
        s = s.slice(1);
      }
      chunk = chunk.slice(1);
    }
  }
  return failed ? [null, false] : [s, true];
}

// path/filepath.Match. Throws BadPattern where Go returns ErrBadPattern. Like
// Go, it stops checking syntax once the name stops matching after a star, so
// "a*[" is accepted here and only fails later, in the regexp compiler.
export function goMatch(pattern, name) {
  outer: while (pattern.length > 0) {
    let star;
    let chunk;
    [star, chunk, pattern] = scanChunk(pattern);
    if (star && chunk === "") return !name.includes("/");
    let t;
    let ok;
    let err = null;
    try {
      [t, ok] = matchChunk(chunk, name);
    } catch (e) {
      err = e;
    }
    if (ok && (t.length === 0 || pattern.length > 0)) {
      name = t;
      continue;
    }
    if (err) throw err;
    if (star) {
      for (let i = 0; i < name.length && name[i] !== "/"; i++) {
        const [t2, ok2] = matchChunk(chunk, name.slice(i + 1));
        if (ok2) {
          if (pattern.length === 0 && t2.length > 0) continue;
          name = t2;
          continue outer;
        }
      }
    }
    return false;
  }
  return name.length === 0;
}

// ------------------------------------------------------ ignorefile.ReadAll

// The lines of a .dockerignore as BuildKit reads them: a UTF-8 BOM dropped from
// the first line, a line that *starts* with # skipped (an indented # is a
// pattern), whitespace trimmed, ! split off and trimmed again, the rest
// cleaned with filepath.Clean and one leading / removed. Returns every line
// with what became of it, so findings can point at line numbers.
export function readIgnore(text) {
  const raw = String(text ?? "").split("\n");
  if (raw.length && raw[raw.length - 1] === "") raw.pop();
  const lines = [];
  raw.forEach((line0, idx) => {
    let line = line0.endsWith("\r") ? line0.slice(0, -1) : line0;
    if (idx === 0 && line.startsWith("\ufeff")) line = line.slice(1);
    const entry = { line: idx + 1, raw: line, pattern: null, comment: false };
    lines.push(entry);
    if (line.startsWith("#")) {
      entry.comment = true;
      return;
    }
    let p = goTrimSpace(line);
    if (p === "") return;
    const invert = p[0] === "!";
    if (invert) p = goTrimSpace(p.slice(1));
    if (p.length > 0) {
      p = goClean(p);
      if (p.length > 1 && p[0] === "/") p = p.slice(1);
    }
    entry.pattern = invert ? "!" + p : p;
  });
  return lines;
}

// -------------------------------------------------- patternmatcher.New etc.

// Regexp metacharacters compile() escapes; others pass through raw.
const SHOULD_ESCAPE = new Set([..."+.(){}|$"]);

// Pattern.compile, giving the same match type and the same Go regexp text.
function compilePattern(cleaned) {
  let regStr = "^";
  let type = "exact";
  const cps = [...cleaned];
  let k = 0;
  const peek = () => (k < cps.length ? cps[k] : null);
  for (let i = 0; peek() !== null; i++) {
    const ch = cps[k++];
    if (ch === "*") {
      if (peek() === "*") {
        k++;
        if (peek() === "/") k++;
        if (peek() === null) {
          if (type === "exact") type = "prefix";
          else {
            regStr += ".*";
            type = "regexp";
          }
        } else {
          regStr += "(.*/)?";
          type = "regexp";
        }
        if (i === 0) type = "suffix";
      } else {
        regStr += "[^/]*";
        type = "regexp";
      }
    } else if (ch === "?") {
      regStr += "[^/]";
      type = "regexp";
    } else if (SHOULD_ESCAPE.has(ch)) {
      regStr += "\\" + ch;
    } else if (ch === "\\") {
      if (peek() !== null) {
        regStr += "\\" + cps[k++];
        type = "regexp";
      } else regStr += "\\";
    } else if (ch === "[" || ch === "]") {
      regStr += ch;
      type = "regexp";
    } else regStr += ch;
  }
  if (type !== "regexp") return { type, goRegex: null, re: null, error: null };
  regStr += "$";
  const t = goRegexToJs(regStr);
  if (t.error) return { type, goRegex: regStr, re: null, error: t.error, unsupported: t.unsupported || false };
  return { type, goRegex: regStr, re: new RegExp(t.source, "u"), error: null };
}

// ---------------------------------------------- Go regexp -> JS translator

const hex = (cp) => `\\u{${cp.toString(16)}}`;
const ASCII_PUNCT = (c) => c < 0x80 && !/[0-9A-Za-z]/.test(String.fromCodePoint(c));
const NAMED = {
  alnum: [[0x30, 0x39], [0x41, 0x5a], [0x61, 0x7a]],
  alpha: [[0x41, 0x5a], [0x61, 0x7a]],
  ascii: [[0x0, 0x7f]],
  blank: [[0x9, 0x9], [0x20, 0x20]],
  cntrl: [[0x0, 0x1f], [0x7f, 0x7f]],
  digit: [[0x30, 0x39]],
  graph: [[0x21, 0x7e]],
  lower: [[0x61, 0x7a]],
  print: [[0x20, 0x7e]],
  punct: [[0x21, 0x2f], [0x3a, 0x40], [0x5b, 0x60], [0x7b, 0x7e]],
  space: [[0x9, 0xd], [0x20, 0x20]],
  upper: [[0x41, 0x5a]],
  word: [[0x30, 0x39], [0x41, 0x5a], [0x61, 0x7a], [0x5f, 0x5f]],
  xdigit: [[0x30, 0x39], [0x41, 0x46], [0x61, 0x66]],
};
const PERL = { d: NAMED.digit, s: [[0x9, 0xa], [0xc, 0xd], [0x20, 0x20]], w: NAMED.word };
const CTRL = { a: 7, f: 12, n: 10, r: 13, t: 9, v: 11 };
const ranges = (rs) => rs.map(([a, b]) => (a === b ? hex(a) : `${hex(a)}-${hex(b)}`)).join("");

class Unsupported extends Error {}
class GoRegexError extends Error {}

// One escape after a backslash; cps[k] is the character after it. Returns
// [kind, value, newK]: kind "char" (a code point) or "class" (ranges, plus
// negation) or "assert" (outside classes only).
function parseEscape(cps, k, inClass) {
  if (k >= cps.length) throw new GoRegexError("trailing backslash at end of expression");
  const c = cps[k];
  const cp = c.codePointAt(0);
  if (ASCII_PUNCT(cp)) return ["char", cp, k + 1];
  if (c in CTRL) return ["char", CTRL[c], k + 1];
  if (c.toLowerCase() in PERL && /[dswDSW]/.test(c)) return ["class", { rs: PERL[c.toLowerCase()], neg: c !== c.toLowerCase() }, k + 1];
  if (!inClass && c === "A") return ["assert", "^", k + 1];
  if (!inClass && c === "z") return ["assert", "$", k + 1];
  if (!inClass && (c === "b" || c === "B")) return ["assert", "\\" + c, k + 1];
  if (/[0-7]/.test(c)) {
    if (c !== "0" && !(k + 1 < cps.length && /[0-7]/.test(cps[k + 1]))) throw new GoRegexError("invalid escape sequence");
    let j = k;
    let v = 0;
    while (j < cps.length && j < k + 3 && /[0-7]/.test(cps[j])) v = v * 8 + Number(cps[j++]);
    return ["char", v, j];
  }
  if (c === "x") {
    if (cps[k + 1] === "{") {
      const end = cps.indexOf("}", k + 2);
      const h = end < 0 ? "" : cps.slice(k + 2, end).join("");
      if (!/^[0-9A-Fa-f]{1,8}$/.test(h) || parseInt(h, 16) > 0x10ffff) throw new GoRegexError("invalid escape sequence");
      return ["char", parseInt(h, 16), end + 1];
    }
    const h = cps.slice(k + 1, k + 3).join("");
    if (!/^[0-9A-Fa-f]{2}$/.test(h)) throw new GoRegexError("invalid escape sequence");
    return ["char", parseInt(h, 16), k + 3];
  }
  if (c === "p" || c === "P" || c === "Q" || c === "C") throw new Unsupported(`\\${c}`);
  throw new GoRegexError("invalid escape sequence");
}

// Translates the regexp text compile() builds (anchors, literals, the three
// star forms, user [...] classes and \ escapes) into an equivalent JS regexp
// under the u flag, following Go's RE2 parser where the two differ: a leading
// ] in a class is literal, - is literal wherever it cannot form a range,
// [:name:] classes, Perl \d\s\w meaning ASCII only, and "." not matching \n.
export function goRegexToJs(src) {
  const cps = [...src];
  let out = "";
  let k = 0;
  try {
    while (k < cps.length) {
      const c = cps[k];
      if (c === "\\") {
        const [kind, v, nk] = parseEscape(cps, k + 1, false);
        k = nk;
        if (kind === "char") out += hex(v);
        else if (kind === "assert") out += v;
        else out += `[${v.neg ? "^" : ""}${ranges(v.rs)}]`;
      } else if (c === "[") {
        const [cls, nk] = parseClass(cps, k);
        out += cls;
        k = nk;
      } else if (c === ".") {
        out += "[^\\n]";
        k++;
      } else if ("^$()?*".includes(c)) {
        out += c;
        k++;
      } else {
        out += hex(c.codePointAt(0));
        k++;
      }
    }
  } catch (e) {
    if (e instanceof Unsupported) return { error: `uses ${e.message}, which this tool does not model`, unsupported: true };
    if (e instanceof GoRegexError) return { error: e.message };
    throw e;
  }
  return { source: out };
}

function parseClass(cps, k) {
  k++; // [
  let neg = false;
  if (cps[k] === "^") {
    neg = true;
    k++;
  }
  const items = [];
  let first = true;
  while (k >= cps.length || cps[k] !== "]" || first) {
    if (k >= cps.length) throw new GoRegexError("missing closing ]");
    // Go: "-" is fine anywhere (Perl flags), [:name:] is a named class.
    if (cps[k] === "[" && cps[k + 1] === ":") {
      const rest = cps.slice(k + 2).join("");
      const end = rest.indexOf(":]");
      if (end >= 0) {
        let name = rest.slice(0, end);
        let nneg = false;
        if (name.startsWith("^")) {
          nneg = true;
          name = name.slice(1);
        }
        if (!(name in NAMED)) throw new GoRegexError("invalid character class range");
        if (nneg) throw new Unsupported(`[:^${name}:]`);
        items.push(ranges(NAMED[name]));
        k += 2 + [...rest.slice(0, end)].length + 2;
        first = false;
        continue;
      }
    }
    let lo;
    if (cps[k] === "\\") {
      const [kind, v, nk] = parseEscape(cps, k + 1, true);
      k = nk;
      if (kind === "class") {
        if (v.neg) {
          if (v.rs === PERL.s) throw new Unsupported("\\S inside [...]");
          items.push(v.rs === PERL.d ? "\\D" : "\\W");
        } else items.push(ranges(v.rs));
        first = false;
        continue;
      }
      lo = v;
    } else {
      lo = cps[k].codePointAt(0);
      k++;
    }
    let hi = lo;
    if (cps[k] === "-" && k + 1 < cps.length && cps[k + 1] !== "]") {
      k++;
      if (cps[k] === "\\") {
        const [kind, v, nk] = parseEscape(cps, k + 1, true);
        if (kind !== "char") throw new GoRegexError("invalid character class range");
        hi = v;
        k = nk;
      } else {
        hi = cps[k].codePointAt(0);
        k++;
      }
      if (hi < lo) throw new GoRegexError("invalid character class range");
    }
    items.push(lo === hi ? hex(lo) : `${hex(lo)}-${hex(hi)}`);
    first = false;
  }
  k++; // ]
  // Go's class [^...] never matches \n unless (?s); there are no flags here,
  // and RE2's negated classes do match \n (only "." excludes it). Same in JS.
  return [`[${neg ? "^" : ""}${items.join("")}]`, k];
}

// patternmatcher.New: patterns trimmed and cleaned again, "!" split off, and
// each checked with filepath.Match(p, ".") for syntax. Returns
// { patterns, exclusions } or { error, index } (index into the input list).
export function newMatcher(list) {
  const patterns = [];
  let exclusions = false;
  for (let index = 0; index < list.length; index++) {
    let p = goTrimSpace(list[index]);
    if (p === "") continue;
    p = goClean(p);
    let exclusion = false;
    if (p[0] === "!") {
      if (p.length === 1) return { error: 'illegal exclusion pattern: "!"', index };
      exclusion = true;
      p = p.slice(1);
      exclusions = true;
    }
    try {
      goMatch(p, ".");
    } catch (e) {
      if (e instanceof BadPattern) return { error: "syntax error in pattern", index };
      throw e;
    }
    patterns.push({ index, exclusion, cleaned: p, compiled: null });
  }
  return { patterns, exclusions };
}

class MatchError extends Error {}

// Pattern.match. Compiles on first use, like Go; a compile error surfaces only
// when the pattern is actually evaluated, which is when BuildKit fails.
function patternMatch(pat, path) {
  if (!pat.compiled) pat.compiled = compilePattern(pat.cleaned);
  const c = pat.compiled;
  if (c.error) throw new MatchError(c.error);
  switch (c.type) {
    case "exact":
      return path === pat.cleaned;
    case "prefix":
      return path.startsWith(pat.cleaned.slice(0, -2));
    case "suffix": {
      const suffix = pat.cleaned.slice(2);
      if (path.endsWith(suffix)) return true;
      return suffix[0] === "/" && path === suffix.slice(1);
    }
    default:
      return c.re.test(path);
  }
}

// MatchesUsingParentResults. `parent` is the parent folder's info (null at
// the top). Returns { matched, info, decider } where info.matched[i] says
// whether pattern i matched this path or (inherited) a folder above it, and
// info.origin[i] the path where it first matched. `decider` is the index (in
// the matcher's list) of the last pattern that set the result, or -1.
export function matchPath(pm, path, parent) {
  const n = pm.patterns.length;
  const info = { matched: new Array(n).fill(false), origin: new Array(n).fill(null) };
  let matched = false;
  let decider = -1;
  for (let i = 0; i < n; i++) {
    const pat = pm.patterns[i];
    let match = false;
    let origin = null;
    if (parent) {
      match = parent.matched[i];
      origin = parent.origin[i];
    }
    if (!match) {
      if (pat.exclusion !== matched) continue;
      match = patternMatch(pat, path);
      if (match) origin = path;
      if (!match && !parent) {
        const slash = path.lastIndexOf("/");
        if (slash > 0) {
          const dirs = path.slice(0, slash).split("/");
          for (let j = 0; j < dirs.length; j++) {
            const anc = dirs.slice(0, j + 1).join("/");
            match = patternMatch(pat, anc);
            if (match) {
              origin = anc;
              break;
            }
          }
        }
      }
    }
    info.matched[i] = match;
    info.origin[i] = match ? origin : null;
    if (match) {
      matched = !pat.exclusion;
      decider = i;
    }
  }
  return { matched, info, decider };
}

// fsutil's patternWithoutTrailingGlob and the "only prefix exceptions" test.
const PATTERN_CHARS = "*[]?^\\";
function withoutTrailingGlob(p) {
  let s = p;
  if (s.endsWith("/**")) s = s.slice(0, -3);
  if (s.endsWith("/*")) s = s.slice(0, -2);
  return s;
}
export function onlyPrefixExceptions(pm) {
  return !pm.patterns.some((p) => p.exclusion && [...PATTERN_CHARS].some((c) => withoutTrailingGlob(p.cleaned).includes(c)));
}

// ------------------------------------------------------------------ tree

// Go sorts directory entries by byte order, which for UTF-8 is code point
// order; JS's default sort is UTF-16 order, which differs above U+FFFF.
export function cmpCodePoints(a, b) {
  const A = [...a];
  const B = [...b];
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const d = A[i].codePointAt(0) - B[i].codePointAt(0);
    if (d) return d;
  }
  return A.length - B.length;
}

// A tree from file paths (folders implied) and explicit folder paths.
export function buildTree(files, dirs = []) {
  const root = { name: "", path: "", isDir: true, children: new Map() };
  const add = (path, isDir, size) => {
    const parts = path.split("/").filter((s) => s !== "" && s !== ".");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      const name = parts[i];
      let child = node.children.get(name);
      const p = node.path ? node.path + "/" + name : name;
      if (!child) {
        child = { name, path: p, isDir: !last || isDir, children: new Map(), size: 0 };
        node.children.set(name, child);
      } else if (!last || isDir) {
        child.isDir = true;
      }
      if (last && !isDir && size != null) child.size = size;
      node = child;
    }
  };
  for (const d of dirs) add(d, true);
  for (const f of files) {
    if (typeof f === "string") add(f, false);
    else add(f.path, false, f.size);
  }
  return root;
}

// filterFS.Walk with ExcludePatterns only. Returns { error } when BuildKit's
// walk fails, else { entries }: every path in the tree in walk order with
// sent (true when the walk hands it on), excluded (the matcher's answer),
// decider (pattern index or -1), via (ancestor where the deciding pattern
// first matched, when it is not the path itself) and unvisited (the folder
// the walk skipped without looking inside, for paths below it).
export function walk(tree, pm) {
  const entries = [];
  const none = !pm || pm.patterns.length === 0;
  const prefixOnly = none ? true : onlyPrefixExceptions(pm);
  const visit = (node, parentInfo, emitAncestors) => {
    const kids = [...node.children.values()].sort((a, b) => cmpCodePoints(a.name, b.name));
    for (const child of kids) {
      const rec = { path: child.path, isDir: child.isDir, size: child.size || 0, sent: true, excluded: false, decider: -1, via: null, unvisited: null };
      entries.push(rec);
      if (none) {
        if (child.isDir) visit(child, null, null);
        continue;
      }
      const r = matchPath(pm, child.path, parentInfo);
      rec.excluded = r.matched;
      rec.decider = r.decider;
      if (r.decider >= 0) {
        const o = r.info.origin[r.decider];
        if (o && o !== child.path) rec.via = o;
      }
      if (r.matched) {
        rec.sent = false;
        if (child.isDir && prefixOnly) {
          let enter = false;
          if (pm.exclusions) {
            const dirSlash = child.path + "/";
            enter = pm.patterns.some((p) => p.exclusion && (withoutTrailingGlob(p.cleaned) + "/").startsWith(dirSlash));
          }
          if (!enter) {
            markUnvisited(child, child.path, entries);
            continue;
          }
        }
        if (child.isDir) {
          const pending = [...(emitAncestors || []), rec];
          visit(child, r.info, pending);
        }
        continue;
      }
      // Sent: every folder above it that the walk passed over unsent is
      // sent now too (fsutil calls fn for those parents first).
      if (emitAncestors) for (const a of emitAncestors) a.sent = true;
      if (child.isDir) visit(child, r.info, null);
    }
  };
  try {
    visit(tree, null, null);
  } catch (e) {
    if (e instanceof MatchError) return { error: e.message, kind: "match" };
    throw e;
  }
  return { entries };
}

function markUnvisited(node, skipped, entries) {
  const kids = [...node.children.values()].sort((a, b) => cmpCodePoints(a.name, b.name));
  for (const child of kids) {
    entries.push({ path: child.path, isDir: child.isDir, size: child.size || 0, sent: false, excluded: true, decider: -1, via: null, unvisited: skipped });
    if (child.isDir) markUnvisited(child, skipped, entries);
  }
}

// BuildKit's whole answer for one ignore text and tree: what the oracle
// computes. { lines, patterns (ReadAll output), error?, entries? }.
export function resolve(ignoreText, tree) {
  const lines = readIgnore(ignoreText);
  const patterns = lines.filter((l) => l.pattern !== null).map((l) => l.pattern);
  const lineOf = lines.filter((l) => l.pattern !== null).map((l) => l.line);
  const pm = newMatcher(patterns);
  if (pm.error) return { lines, patterns, lineOf, error: `invalid excludepatterns: ${pm.error}`, errorLine: lineOf[pm.index], kind: "syntax" };
  const w = walk(tree, pm);
  if (w.error) return { lines, patterns, lineOf, pm, error: `failed to match excludepatterns: ${w.error}`, kind: "match" };
  return { lines, patterns, lineOf, pm, entries: w.entries };
}
