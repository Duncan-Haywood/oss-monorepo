// npm publish contents: which files `npm pack` / `npm publish` put in the
// tarball, and which rule decides each one.
//
// A reimplementation, written from the behaviour of npm 10.9's npm-packlist
// 9.0.0, ignore-walk 7.0.0, minimatch 9.0.9 and brace-expansion 2.0.2 (all
// ISC or MIT), run over a virtual file tree so it works in a browser.
// `packlist.diff.test.mjs` compares it with the real npm-packlist on seeded
// random trees. Three things decide a file, in this order inside every folder:
//
//   1. npm's default excludes (.git, .DS_Store, *.orig, .npmrc, ...),
//   2. the folder's own rules: at the package root, `files` in package.json
//      if it is set, otherwise .npmignore, otherwise .gitignore; in every
//      sub-folder, its .npmignore, otherwise its .gitignore,
//   3. npm's forced rules: package.json, README, LICENSE/LICENCE and COPYING
//      at the root, `main`, `browser` and each `bin` always ship;
//      node_modules at the root, lockfiles and .npmrc never do.
//
// Rules are minimatch globs (matchBase, dot, nocase), not git's wildmatch: a
// rule without a slash matches the name at any depth, case is ignored, and a
// folder is only entered when some rule could still include something in it.
//
// No dependencies. Everything is a pure function of the input.

// ---------------------------------------------------------------- braces ---

function balanced(str) {
  // balanced-match('{', '}', str): the first balanced pair, preferring the
  // innermost-leftmost the way that module does.
  let ai = str.indexOf("{");
  let bi = str.indexOf("}", ai + 1);
  let i = ai;
  let result = null;
  if (ai >= 0 && bi > 0) {
    const begs = [];
    let left = str.length;
    let right;
    while (i >= 0 && !result) {
      if (i === ai) {
        begs.push(i);
        ai = str.indexOf("{", i + 1);
      } else if (begs.length === 1) {
        result = [begs.pop(), bi];
      } else {
        const beg = begs.pop();
        if (beg < left) {
          left = beg;
          right = bi;
        }
        bi = str.indexOf("}", i + 1);
      }
      i = ai < bi && ai >= 0 ? ai : bi;
    }
    if (begs.length && right !== undefined) result = [left, right];
  }
  if (!result) return null;
  return { pre: str.slice(0, result[0]), body: str.slice(result[0] + 1, result[1]), post: str.slice(result[1] + 1) };
}

const ESC = { slash: "\0S\0", open: "\0O\0", close: "\0C\0", comma: "\0M\0", period: "\0P\0" };
const escapeBraces = (s) => s.split("\\\\").join(ESC.slash).split("\\{").join(ESC.open).split("\\}").join(ESC.close).split("\\,").join(ESC.comma).split("\\.").join(ESC.period);
const unescapeBraces = (s) => s.split(ESC.slash).join("\\").split(ESC.open).join("{").split(ESC.close).join("}").split(ESC.comma).join(",").split(ESC.period).join(".");

function parseCommaParts(str) {
  if (!str) return [""];
  const m = balanced(str);
  if (!m) return str.split(",");
  const p = m.pre.split(",");
  p[p.length - 1] += "{" + m.body + "}";
  const postParts = parseCommaParts(m.post);
  if (m.post.length) {
    p[p.length - 1] += postParts.shift();
    p.push(...postParts);
  }
  return p;
}

const numeric = (s) => (String(parseInt(s, 10)) == s || parseInt(s, 10) == s ? parseInt(s, 10) : s.charCodeAt(0));

function expand(str, isTop) {
  const out = [];
  const m = balanced(str);
  if (!m) return [str];
  const post = m.post.length ? expand(m.post, false) : [""];
  if (/\$$/.test(m.pre)) {
    for (const p of post) out.push(m.pre + "{" + m.body + "}" + p);
    return out;
  }
  const isNum = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
  const isAlpha = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
  const isSeq = isNum || isAlpha;
  const isOptions = m.body.indexOf(",") >= 0;
  if (!isSeq && !isOptions) {
    if (m.post.match(/,(?!,).*\}/)) return expand(m.pre + "{" + m.body + ESC.close + m.post);
    return [str];
  }
  let n;
  if (isSeq) n = m.body.split(/\.\./);
  else {
    n = parseCommaParts(m.body);
    if (n.length === 1) {
      n = expand(n[0], false).map((x) => "{" + x + "}");
      if (n.length === 1) return post.map((p) => m.pre + n[0] + p);
    }
  }
  let N = [];
  if (isSeq) {
    const x = numeric(n[0]);
    const y = numeric(n[1]);
    const width = Math.max(n[0].length, n[1].length);
    let incr = n.length === 3 ? Math.abs(numeric(n[2])) : 1;
    const reverse = y < x;
    if (reverse) incr *= -1;
    const pad = n.some((el) => /^-?0\d/.test(el));
    for (let i = x; reverse ? i >= y : i <= y; i += incr) {
      if (incr === 0) break;
      let c;
      if (isAlpha) {
        c = String.fromCharCode(i);
        if (c === "\\") c = "";
      } else {
        c = String(i);
        if (pad) {
          const need = width - c.length;
          if (need > 0) c = i < 0 ? "-" + "0".repeat(need) + c.slice(1) : "0".repeat(need) + c;
        }
      }
      N.push(c);
      if (N.length > 10000) break;
    }
  } else {
    for (const part of n) N.push(...expand(part, false));
  }
  for (const a of N) for (const p of post) {
    const e = m.pre + a + p;
    if (!isTop || isSeq || e) out.push(e);
  }
  return out;
}

export function braceExpand(pattern) {
  if (!/\{(?:(?!\{).)*\}/.test(pattern)) return [pattern];
  if (!pattern) return [];
  let s = pattern;
  if (s.slice(0, 2) === "{}") s = "\\{\\}" + s.slice(2);
  return expand(escapeBraces(s), true).map(unescapeBraces);
}

// ------------------------------------------------------------- minimatch ---

const GLOBSTAR = Symbol("globstar");
const reSpecials = new Set("().*{}+?[]^$\\!");
const regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
const braceEscape = (s) => s.replace(/[[\]\\-]/g, "\\$&");
const QMARK = "[^/]";
const STAR = QMARK + "*?";
const STAR_NO_EMPTY = QMARK + "+?";
const START_NO_TRAVERSAL = "(?!(?:^|/)\\.\\.?(?:$|/))";
const POSIX = {
  "[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", true], "[:alpha:]": ["\\p{L}\\p{Nl}", true], "[:ascii:]": ["\\x00-\\x7f", false],
  "[:blank:]": ["\\p{Zs}\\t", true], "[:cntrl:]": ["\\p{Cc}", true], "[:digit:]": ["\\p{Nd}", true],
  "[:graph:]": ["\\p{Z}\\p{C}", true, true], "[:lower:]": ["\\p{Ll}", true], "[:print:]": ["\\p{C}", true],
  "[:punct:]": ["\\p{P}", true], "[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", true], "[:upper:]": ["\\p{Lu}", true],
  "[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", true], "[:xdigit:]": ["A-Fa-f0-9", false],
};

function parseClass(glob, pos) {
  const ranges = [];
  const negs = [];
  let i = pos + 1;
  let sawStart = false;
  let uflag = false;
  let escaping = false;
  let negate = false;
  let endPos = pos;
  let rangeStart = "";
  outer: while (i < glob.length) {
    const c = glob.charAt(i);
    if ((c === "!" || c === "^") && i === pos + 1) { negate = true; i++; continue; }
    if (c === "]" && sawStart && !escaping) { endPos = i + 1; break; }
    sawStart = true;
    if (c === "\\" && !escaping) { escaping = true; i++; continue; }
    if (c === "[" && !escaping) {
      for (const [cls, [unip, u, neg]] of Object.entries(POSIX)) {
        if (glob.startsWith(cls, i)) {
          if (rangeStart) return ["$.", false, glob.length - pos, true];
          i += cls.length;
          (neg ? negs : ranges).push(unip);
          uflag = uflag || u;
          continue outer;
        }
      }
    }
    escaping = false;
    if (rangeStart) {
      if (c > rangeStart) ranges.push(braceEscape(rangeStart) + "-" + braceEscape(c));
      else if (c === rangeStart) ranges.push(braceEscape(c));
      rangeStart = "";
      i++;
      continue;
    }
    if (glob.startsWith("-]", i + 1)) { ranges.push(braceEscape(c + "-")); i += 2; continue; }
    if (glob.startsWith("-", i + 1)) { rangeStart = c; i += 2; continue; }
    ranges.push(braceEscape(c));
    i++;
  }
  if (endPos < i) return ["", false, 0, false];
  if (!ranges.length && !negs.length) return ["$.", false, glob.length - pos, true];
  if (negs.length === 0 && ranges.length === 1 && /^\\?.$/.test(ranges[0]) && !negate) {
    const r = ranges[0].length === 2 ? ranges[0].slice(-1) : ranges[0];
    return [regExpEscape(r), false, endPos - pos, false];
  }
  const sr = "[" + (negate ? "^" : "") + ranges.join("") + "]";
  const sn = "[" + (negate ? "" : "^") + negs.join("") + "]";
  return [ranges.length && negs.length ? "(" + sr + "|" + sn + ")" : ranges.length ? sr : sn, uflag, endPos - pos, true];
}

const unescape = (s) => s.replace(/((?!\\).|^)\[([^/\\])\]/g, "$1$2").replace(/\\([^/])/g, "$1");

// Extglobs (+(a|b), !(x), ...) are rare in ignore files. They are compiled
// here with a plain translation and the rule is marked approximate; minimatch
// 9.0.9 rewrites nested extglobs in ways this does not reproduce.
const EXTGLOB = /[!?+*@]\(/;

function compileExtglob(seg) {
  let re = "";
  const stack = [];
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === "\\" && i + 1 < seg.length) { re += regExpEscape(seg[++i]); continue; }
    if ("!?+*@".includes(c) && seg[i + 1] === "(") { stack.push(c); re += c === "!" ? "(?:(?!(?:" : "(?:"; i++; continue; }
    if (c === "|" && stack.length) { re += "|"; continue; }
    if (c === ")" && stack.length) {
      const t = stack.pop();
      re += t === "!" ? ")$)" + STAR + ")" : t === "@" ? ")" : ")" + t;
      continue;
    }
    if (c === "*") { re += STAR; continue; }
    if (c === "?") { re += QMARK; continue; }
    if (c === "[") {
      const [src, , consumed] = parseClass(seg, i);
      if (consumed) { re += src; i += consumed - 1; continue; }
    }
    re += regExpEscape(c);
  }
  while (stack.length) { stack.pop(); re += ")"; }
  try { return new RegExp("^" + START_NO_TRAVERSAL + re + "$", "iu"); } catch { return /$./; }
}

function parseSegment(pattern) {
  if (pattern === "**") return GLOBSTAR;
  if (pattern === "") return "";
  if (EXTGLOB.test(pattern)) return compileExtglob(pattern);
  // AST.#parseGlob for a single string part that is both start and end.
  const noEmpty = true;
  let escaping = false;
  let re = "";
  let uflag = false;
  let inStar = false;
  let hasMagic = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (escaping) {
      escaping = false;
      re += (reSpecials.has(c) ? "\\" : "") + c;
      inStar = false;
      continue;
    }
    if (c === "\\") {
      if (i === pattern.length - 1) re += "\\\\";
      else escaping = true;
      continue;
    }
    if (c === "[") {
      const [src, needU, consumed, magic] = parseClass(pattern, i);
      if (consumed) {
        re += src;
        uflag = uflag || needU;
        i += consumed - 1;
        hasMagic = hasMagic || magic;
        inStar = false;
        continue;
      }
    }
    if (c === "*") {
      if (inStar) continue;
      inStar = true;
      re += noEmpty && /^[*]+$/.test(pattern) ? STAR_NO_EMPTY : STAR;
      hasMagic = true;
      continue;
    }
    inStar = false;
    if (c === "?") { re += QMARK; hasMagic = true; continue; }
    re += regExpEscape(c);
  }
  let start = "";
  const dotTravAllowed = pattern === "." || pattern === "..";
  if (!dotTravAllowed) {
    const aps = (ch) => ch === "[" || ch === ".";
    const needNoTrav = aps(re.charAt(0)) || (re.startsWith("\\.") && aps(re.charAt(2))) || (re.startsWith("\\.\\.") && aps(re.charAt(4)));
    if (needNoTrav) start = START_NO_TRAVERSAL;
  }
  const anyMagic = hasMagic || pattern.toUpperCase() !== pattern.toLowerCase();
  if (!anyMagic) return unescape(re);
  let rx;
  try { rx = new RegExp("^" + start + re + "$", "i" + (uflag ? "u" : "")); } catch { rx = /$./; }
  // minimatch's fast paths replace the regexp's test for common shapes.
  let m;
  let fast = null;
  if (/^\*+$/.test(pattern)) fast = (f) => f.length !== 0 && f !== "." && f !== "..";
  else if ((m = pattern.match(/^\*+([^+@!?*[(]*)$/))) { const ext = m[1].toLowerCase(); fast = (f) => f.toLowerCase().endsWith(ext); }
  else if ((m = pattern.match(/^\?+([^+@!?*[(]*)?$/))) {
    const len = m[0].length;
    const ext = (m[1] || "").toLowerCase();
    fast = (f) => f.length === len && f !== "." && f !== ".." && (!ext || f.toLowerCase().endsWith(ext));
  } else if (/^\*+\.\*+$/.test(pattern)) fast = (f) => f !== "." && f !== ".." && f.includes(".");
  else if (/^\.\*+$/.test(pattern)) fast = (f) => f !== "." && f !== ".." && f.startsWith(".");
  return { test: fast || ((f) => rx.test(f)), source: rx.source };
}

function levelOneOptimize(parts) {
  const set = [];
  for (const part of parts) {
    const prev = set[set.length - 1];
    if (part === "**" && prev === "**") continue;
    if (part === ".." && prev && prev !== ".." && prev !== "." && prev !== "**") { set.pop(); continue; }
    set.push(part);
  }
  return set.length === 0 ? [""] : set;
}

const segTest = (p, f) => (typeof p === "string" ? f === p : p.test(f));

function matchPlain(file, pattern, partial, fi0, pi0) {
  let fi = fi0;
  let pi = pi0;
  const fl = file.length;
  const pl = pattern.length;
  for (; fi < fl && pi < pl; fi++, pi++) {
    const p = pattern[pi];
    if (p === GLOBSTAR) return false;
    if (!segTest(p, file[fi])) return false;
  }
  if (fi === fl && pi === pl) return true;
  if (fi === fl) return partial;
  return fi === fl - 1 && file[fi] === "";
}

function matchGlobStarBody(file, segs, fileIndex, bodyIndex, partial, depth, sawTail) {
  const bs = segs[bodyIndex];
  if (!bs) {
    for (let i = fileIndex; i < file.length; i++) {
      sawTail = true;
      if (file[i] === "." || file[i] === "..") return false;
    }
    return sawTail;
  }
  const [body, after] = bs;
  while (fileIndex <= after) {
    const m = matchPlain(file.slice(0, fileIndex + body.length), body, partial, fileIndex, 0);
    if (m && depth < 200) {
      const sub = matchGlobStarBody(file, segs, fileIndex + body.length, bodyIndex + 1, partial, depth + 1, sawTail);
      if (sub !== false) return sub;
    }
    const f = file[fileIndex];
    if (f === "." || f === "..") return false;
    fileIndex++;
  }
  return partial || null;
}

function matchGlobstar(file, pattern, partial) {
  let fileIndex = 0;
  const firstgs = pattern.indexOf(GLOBSTAR);
  const lastgs = pattern.lastIndexOf(GLOBSTAR);
  const head = pattern.slice(0, firstgs);
  const body = partial ? pattern.slice(firstgs + 1) : pattern.slice(firstgs + 1, lastgs);
  const tail = partial ? [] : pattern.slice(lastgs + 1);
  if (head.length) {
    if (!matchPlain(file.slice(fileIndex, fileIndex + head.length), head, partial, 0, 0)) return false;
    fileIndex += head.length;
  }
  let fileTailMatch = 0;
  if (tail.length) {
    if (tail.length + fileIndex > file.length) return false;
    let tailStart = file.length - tail.length;
    if (matchPlain(file, tail, partial, tailStart, 0)) fileTailMatch = tail.length;
    else {
      if (file[file.length - 1] !== "" || fileIndex + tail.length === file.length) return false;
      tailStart--;
      if (!matchPlain(file, tail, partial, tailStart, 0)) return false;
      fileTailMatch = tail.length + 1;
    }
  }
  if (!body.length) {
    let sawSome = !!fileTailMatch;
    for (let i = fileIndex; i < file.length - fileTailMatch; i++) {
      sawSome = true;
      const f = String(file[i]);
      if (f === "." || f === "..") return false;
    }
    return partial || sawSome;
  }
  const segs = [[[], 0]];
  let cur = segs[0];
  let nonGs = 0;
  const sums = [0];
  for (const b of body) {
    if (b === GLOBSTAR) { sums.push(nonGs); cur = [[], 0]; segs.push(cur); }
    else { cur[0].push(b); nonGs++; }
  }
  let i = segs.length - 1;
  const fileLength = file.length - fileTailMatch;
  for (const b of segs) b[1] = fileLength - (sums[i--] + b[0].length);
  return !!matchGlobStarBody(file, segs, fileIndex, 0, partial, 0, !!fileTailMatch);
}

// One ignore-file line compiled the way ignore-walk compiles it:
// new Minimatch(line.trim(), { matchBase, dot, flipNegate, nocase }).
export function compileRule(text) {
  const rule = { text, negate: false, approximate: false, set: [], globParts: [] };
  let pattern = text;
  if (pattern.charAt(0) === "#") { rule.comment = true; return finish(rule); }
  if (!pattern) { rule.empty = true; return finish(rule); }
  let n = 0;
  while (pattern.charAt(n) === "!") n++;
  rule.negate = n % 2 === 1;
  pattern = pattern.slice(n);
  const globSet = [...new Set(braceExpand(pattern))];
  rule.globParts = globSet.map((s) => levelOneOptimize(s.split(/\/+/)));
  rule.set = rule.globParts.map((parts) => parts.map(parseSegment));
  rule.approximate = EXTGLOB.test(pattern);
  return finish(rule);
}

function finish(rule) {
  rule.match = (f, partial = false) => {
    if (rule.comment) return false;
    if (rule.empty) return f === "";
    if (f === "/" && partial) return true;
    const ff = f.split(/\/+/);
    let filename = ff[ff.length - 1];
    if (!filename) for (let i = ff.length - 2; !filename && i >= 0; i--) filename = ff[i];
    for (const pattern of rule.set) {
      const file = pattern.length === 1 ? [filename] : ff;
      const hit = pattern.includes(GLOBSTAR) ? matchGlobstar(file, pattern, partial) : matchPlain(file, pattern, partial, 0, 0);
      if (hit) return true;
    }
    return false;
  };
  return rule;
}

// ---------------------------------------------------------- the file tree ---

function normalizePath(p) {
  const out = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { if (out.length) out.pop(); else out.push(".."); continue; }
    out.push(seg);
  }
  return out.join("/");
}

// files: iterable of paths relative to the package root ("lib/a.js");
// contents: Map or object of path -> text for package.json and ignore files.
export function buildTree(files, contents = {}) {
  const get = contents instanceof Map ? (k) => contents.get(k) : (k) => contents[k];
  const dirs = new Map([["", new Map()]]);
  const fileSet = new Set();
  const addDir = (d) => {
    if (dirs.has(d)) return;
    const i = d.lastIndexOf("/");
    const parent = i < 0 ? "" : d.slice(0, i);
    addDir(parent);
    dirs.set(d, new Map());
    dirs.get(parent).set(d.slice(i + 1), "dir");
  };
  for (const raw of files) {
    const p = normalizePath(String(raw).replace(/\\/g, "/"));
    if (!p || p.startsWith("..")) continue;
    const i = p.lastIndexOf("/");
    const parent = i < 0 ? "" : p.slice(0, i);
    addDir(parent);
    if (dirs.has(p)) continue; // already a folder
    dirs.get(parent).set(p.slice(i + 1), "file");
    fileSet.add(p);
  }
  return {
    dirs,
    files: fileSet,
    isFile: (p) => fileSet.has(p),
    isDir: (p) => dirs.has(p),
    read: (p) => get(p),
  };
}

// --------------------------------------------------------------- the walk ---

const DEFAULT_RULES = Symbol("npm's default excludes");
const STRICT_RULES = Symbol("npm's forced rules");

export const DEFAULTS = [
  ".npmignore", ".gitignore", "**/.git", "**/.svn", "**/.hg", "**/CVS", "**/.git/**", "**/.svn/**", "**/.hg/**",
  "**/CVS/**", "/.lock-wscript", "/.wafpickle-*", "/build/config.gypi", "npm-debug.log", "**/.npmrc", ".*.swp",
  ".DS_Store", "**/.DS_Store/**", "._*", "**/._*/**", "*.orig", "/archived-packages/**",
];

function posixRelative(from, to) {
  const a = normalizePath(from).split("/").filter(Boolean);
  const b = normalizePath(to).split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

function rulesFromText(source, text) {
  return text.split(/\r?\n/).map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !/^#|^$/.test(line.trim()))
    .map(({ line, n }) => Object.assign(compileRule(line.trim()), { source, line: n }));
}

function synthetic(source, lines, why) {
  return lines.map((text, i) => Object.assign(compileRule(text.trim()), { source, line: null, why: why ? why[i] : null }));
}

// Normalise `bin` the way npm-normalize-package-bin does.
export function normalizeBin(pkg) {
  let bin = pkg.bin;
  if (!bin) return {};
  if (typeof bin === "string") { if (!pkg.name) return {}; bin = { [pkg.name]: bin }; }
  else if (Array.isArray(bin)) bin = Object.fromEntries(bin.map((k) => [String(k).split("/").pop(), k]));
  else if (typeof bin !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(bin)) {
    const base = normalizePath("/" + String(k).replace(/\\|:/g, "/").split("/").pop());
    if (typeof v !== "string" || !base) continue;
    const target = normalizePath("/" + v.replace(/\\/g, "/"));
    if (!target) continue;
    out[base] = target;
  }
  return out;
}

class Walker {
  constructor(ctx, { dir, parent = null, ignoreFiles, requiredFiles = [], exact, isPackage = false }) {
    this.ctx = ctx;
    this.dir = dir;
    this.basename = dir.split("/").pop();
    this.parent = parent;
    this.ignoreFiles = ignoreFiles;
    this.requiredFiles = requiredFiles;
    this.exact = exact;
    this.isPackage = isPackage;
    this.ignoreRules = {};
    this.ignoreRules[DEFAULT_RULES] = synthetic("npm default excludes", DEFAULTS);
    if (!isPackage) {
      this.ignoreRules[STRICT_RULES] = synthetic("npm forced rules", ["/.git", ...requiredFiles.map((f) => "!" + f)],
        ["never packed", ...requiredFiles.map(() => "named in files, main, browser or bin")]);
    }
  }

  rel(entry) { return this.dir ? this.dir + "/" + entry : entry; }

  run() {
    const { tree } = this.ctx;
    const entries = [...tree.dirs.get(this.dir).keys()];
    if (!entries.length) return;
    for (const e of entries) {
      if (typeof e !== "string" || !this.ignoreFiles.includes(e)) continue;
      if (e === "package.json" && this.isPackage) this.processPackage();
      else if (tree.isFile(this.rel(e))) {
        const text = tree.read(this.rel(e));
        this.ignoreRules[e] = rulesFromText(this.rel(e), text == null ? "" : String(text));
        if (text == null) this.ctx.unread.add(this.rel(e));
      }
    }
    if (this.ignoreRules["package.json"]) {
      this.shadow(".npmignore", "files in package.json");
      this.shadow(".gitignore", "files in package.json");
    } else if (this.ignoreRules[".npmignore"]) {
      this.shadow(".gitignore", this.rel(".npmignore"));
    }
    for (const entry of entries) {
      const passFile = this.filterEntry(entry);
      const passDir = this.filterEntry(entry, true);
      const path = this.rel(entry);
      if (!passFile && !passDir) { this.ctx.note(path, "excluded"); continue; }
      if (/\*/.test(entry)) { this.ctx.note(path, "star"); continue; }
      if (tree.isFile(path)) {
        if (passFile) this.ctx.result.add(path);
        else this.ctx.note(path, "excluded");
      } else if (tree.isDir(path)) {
        if (!passDir) { this.ctx.note(path, "excluded"); continue; }
        const child = new Walker(this.ctx, {
          dir: path,
          parent: this,
          ignoreFiles: [DEFAULT_RULES, ".npmignore", ".gitignore", STRICT_RULES],
          exact: passFile || this.filterEntry(entry + "/"),
          requiredFiles: this.requiredFiles
            .filter((f) => posixRelative(f, entry) === "..")
            .map((f) => posixRelative(entry, f)),
        });
        child.run();
      }
    }
  }

  shadow(file, by) {
    if (this.ignoreRules[file]) this.ctx.shadowed.push({ file: this.rel(file), by });
    this.ignoreRules[file] = null;
  }

  processPackage() {
    const { pkg, tree } = this.ctx;
    const ignores = [];
    const ignoreWhy = [];
    const strict = [
      "/.git", "!/package.json", "!/readme{,.*[^~$]}", "!/copying{,.*[^~$]}", "!/license{,.*[^~$]}", "!/licence{,.*[^~$]}",
      "/.git", "/node_modules", ".npmrc", "/package-lock.json", "/yarn.lock", "/pnpm-lock.yaml",
    ];
    const why = [
      "never packed", "always packed", "always packed (README)", "always packed (COPYING)", "always packed (LICENSE)", "always packed (LICENCE)",
      "never packed", "never packed (the root node_modules)", "never packed", "never packed", "never packed", "never packed",
    ];
    this.ctx.filesKinds = [];
    if (Array.isArray(pkg.files)) {
      for (let file of pkg.files) {
        if (typeof file !== "string") continue;
        const original = file;
        if (file.startsWith("./")) file = file.slice(1);
        if (file.endsWith("/*")) file += "*";
        const inverse = "!" + file;
        const target = file.replace(/^!+/, "");
        // npm stats the entry: a file is forced in, a folder adds itself and
        // everything below, anything else is read as a glob.
        const trailingSlash = /\/$/.test(target);
        const p = normalizePath(target);
        let kind = "pattern";
        if (!p.startsWith("..") && tree.isFile(p) && !trailingSlash) kind = "file";
        else if (!p.startsWith("..") && (tree.isDir(p))) kind = "dir";
        this.ctx.filesKinds.push({ entry: original, kind });
        if (kind === "file") {
          strict.unshift(inverse);
          why.unshift(`"${original}" in files names this file`);
          this.requiredFiles.push(file.startsWith("/") ? file.slice(1) : file);
        } else if (kind === "dir") {
          ignores.push(inverse, inverse + "/**");
          ignoreWhy.push(`"${original}" in files`, `"${original}" in files (everything below it)`);
        } else {
          ignores.push(inverse);
          ignoreWhy.push(`"${original}" in files`);
        }
      }
      this.ignoreRules["package.json"] = synthetic("package.json files", ["*", ...ignores], ["files is set, so anything it does not list is left out", ...ignoreWhy]);
    }
    if (typeof pkg.browser === "string") { strict.push("!/" + pkg.browser); why.push("browser in package.json"); }
    if (typeof pkg.main === "string" && pkg.main) { strict.push("!/" + pkg.main); why.push("main in package.json"); }
    for (const [name, target] of Object.entries(normalizeBin(pkg))) { strict.push("!/" + target); why.push(`bin "${name}" in package.json`); }
    this.ignoreRules[STRICT_RULES] = synthetic("npm forced rules", strict, why);
  }

  // ignore-walk's filterEntry, recording which rule decided.
  filterEntry(entry, partial, entryBasename, trace) {
    let included = true;
    let decided = null;
    if (this.parent) {
      const sub = { decided: null };
      included = this.parent.filterEntry(this.basename + "/" + entry, partial, entryBasename || entry, sub);
      decided = sub.decided;
      if (!included && !this.exact) { if (trace) trace.decided = decided; return false; }
    }
    for (const f of this.ignoreFiles) {
      const rules = this.ignoreRules[f];
      if (!rules) continue;
      for (const rule of rules) {
        if (rule.negate === included) continue;
        const isRelativeRule = entryBasename && rule.globParts.some((part) => part.length <= (part[part.length - 1] ? 1 : 2));
        const match = rule.match("/" + entry) || rule.match(entry) || (!!partial && (
          rule.match("/" + entry + "/") || rule.match(entry + "/") ||
          (rule.negate && (rule.match("/" + entry, true) || rule.match(entry, true))) ||
          (isRelativeRule && (rule.match("/" + entryBasename + "/") || rule.match(entryBasename + "/") ||
            (rule.negate && (rule.match("/" + entryBasename, true) || rule.match(entryBasename, true)))))));
        if (match) {
          included = rule.negate;
          decided = { rule, at: this.dir };
          if (rule.approximate) this.ctx.approximate.add(rule);
        }
      }
    }
    if (trace) trace.decided = decided;
    return included;
  }
}

// The list npm would pack, plus why. `pkg` is the parsed package.json.
export function packlist(tree, pkg) {
  const ctx = {
    tree, pkg: pkg || {}, result: new Set(), notes: new Map(), shadowed: [], unread: new Set(), approximate: new Set(),
    note(path, why) { this.notes.set(path, why); },
  };
  const root = new Walker(ctx, { dir: "", ignoreFiles: [DEFAULT_RULES, "package.json", ".npmignore", ".gitignore", STRICT_RULES], isPackage: true });
  ctx.root = root;
  root.run();
  const sorted = [...ctx.result].sort(packSort);
  return { files: sorted, ctx };
}

// npm sorts for compressibility: extension, then base name, then path.
function packSort(a, b) {
  const ext = (p) => { const base = p.split("/").pop(); const i = base.lastIndexOf("."); return i > 0 ? base.slice(i).toLowerCase() : ""; };
  const base = (p) => p.split("/").pop().toLowerCase();
  return ext(a).localeCompare(ext(b), "en") || base(a).localeCompare(base(b), "en") || a.localeCompare(b, "en");
}

// ------------------------------------------------------------ explanation ---

function walkerFor(ctx, dir) {
  // Rebuild the chain of walkers down to `dir` without re-running them, so a
  // path can be asked about after the walk (and for files the walk skipped).
  let w = ctx.root;
  if (!dir) return w;
  let cur = "";
  for (const seg of dir.split("/")) {
    const path = cur ? cur + "/" + seg : seg;
    const child = new Walker(ctx, {
      dir: path,
      parent: w,
      ignoreFiles: [DEFAULT_RULES, ".npmignore", ".gitignore", STRICT_RULES],
      exact: w.filterEntry(seg) || w.filterEntry(seg + "/"),
      requiredFiles: w.requiredFiles.filter((f) => posixRelative(f, seg) === "..").map((f) => posixRelative(seg, f)),
    });
    for (const e of ctx.tree.dirs.get(path)?.keys() || []) {
      if (!child.ignoreFiles.includes(e) || !ctx.tree.isFile(path + "/" + e)) continue;
      const text = ctx.tree.read(path + "/" + e);
      child.ignoreRules[e] = rulesFromText(path + "/" + e, text == null ? "" : String(text));
    }
    if (child.ignoreRules[".npmignore"]) child.ignoreRules[".gitignore"] = null;
    w = child;
    cur = path;
  }
  return w;
}

function describeRule(d) {
  if (!d) return null;
  const { rule } = d;
  const where = rule.line ? `${rule.source}:${rule.line}` : rule.source;
  return { source: rule.source, line: rule.line, text: rule.text, negate: rule.negate, why: rule.why || null, where };
}

// Why is `path` in or out? Walks the folders above it first: a folder the
// walk never entered decides for everything inside.
export function explain(result, path) {
  const { ctx } = result;
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    const parentDir = parts.slice(0, i - 1).join("/");
    const w = walkerFor(ctx, parentDir);
    const name = parts[i - 1];
    if (/\*/.test(name)) return { included: false, kind: "star-name", folder: dir };
    const t = {};
    const passDir = w.filterEntry(name, true, undefined, t);
    if (!passDir) return { included: false, kind: "folder", folder: dir, rule: describeRule(t.decided) };
  }
  const dir = parts.slice(0, -1).join("/");
  const name = parts[parts.length - 1];
  if (/\*/.test(name)) return { included: false, kind: "star-name" };
  const w = walkerFor(ctx, dir);
  const t = {};
  const passFile = w.filterEntry(name, false, undefined, t);
  const included = ctx.result.has(path);
  return { included, kind: included ? "file" : passFile ? "other" : "file", rule: describeRule(t.decided) };
}

// ------------------------------------------------------------ the report ---

const SECRET_PATTERNS = [
  [/(^|\/)\.env(\.[^/]*)?$/i, "an .env file (environment variables, often API keys)"],
  [/\.(pem|key|p12|pfx|jks|keystore|ppk|asc|gpg)$/i, "a private key or certificate store"],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i, "an SSH key"],
  [/(^|\/)\.(netrc|pypirc|git-credentials|htpasswd|pgpass)$/i, "a credentials file"],
  [/(^|\/)(credentials|secrets?|service[-_]?account)[^/]*\.(json|ya?ml|toml|ini|txt)$/i, "a credentials or service-account file"],
  [/(^|\/)\.aws\/|(^|\/)\.ssh\/|(^|\/)\.docker\/config\.json$/i, "a cloud or SSH config folder"],
  [/\.tfstate(\.backup)?$|(^|\/)\.terraform\//i, "Terraform state (holds secrets in plain text)"],
  [/\.(sqlite3?|db)$/i, "a database file"],
  [/(^|\/)\.yarnrc(\.yml)?$/i, "a yarn config file (can hold an auth token)"],
];

const BLOAT_PATTERNS = [
  [/(^|\/)(test|tests|__tests__|spec|__mocks__|fixtures?)\//i, "tests"],
  [/\.(test|spec)\.[cm]?[jt]sx?$/i, "tests"],
  [/(^|\/)coverage\/|(^|\/)\.nyc_output\//i, "coverage output"],
  [/(^|\/)\.github\/|(^|\/)\.circleci\/|(^|\/)\.gitlab-ci\.yml$|(^|\/)\.travis\.yml$/i, "CI configuration"],
  [/(^|\/)\.vscode\/|(^|\/)\.idea\//i, "editor settings"],
  [/(^|\/)(\.eslintrc[^/]*|\.prettierrc[^/]*|eslint\.config\.[cm]?js|tsconfig[^/]*\.json|\.editorconfig|jest\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|\.babelrc[^/]*)$/i, "tool configuration"],
  [/\.(log|tgz)$/i, "logs and packed tarballs"],
  [/(^|\/)(examples?|docs?|benchmarks?|bench)\//i, "docs, examples and benchmarks"],
  [/\.map$/i, "source maps"],
];

export function classify(path) {
  if (/(^|\/)\.env\.(example|sample|template|dist|defaults)$/i.test(path)) return {};
  for (const [re, what] of SECRET_PATTERNS) if (re.test(path)) return { secret: what };
  for (const [re, what] of BLOAT_PATTERNS) if (re.test(path)) return { bloat: what };
  return {};
}

// Parse the page's "ignore files" box: blocks headed by `==> path <==`
// (the output of `head -n 9999 .npmignore lib/.gitignore`) or `--- path`.
export function parseIgnoreBundle(text) {
  const out = new Map();
  let cur = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^==> (.+?) <==\s*$/) || line.match(/^--- (\S.*?)\s*$/);
    if (m) { cur = normalizePath(m[1].trim().replace(/^\.\//, "")); out.set(cur, []); continue; }
    if (cur) out.get(cur).push(line);
  }
  const res = new Map();
  for (const [k, v] of out) {
    while (v.length && v[v.length - 1] === "") v.pop();
    res.set(k, v.join("\n"));
  }
  return res;
}

export function parseFileList(text) {
  const out = [];
  const s = String(text || "").trim();
  if (s.startsWith("[") || s.startsWith("{")) {
    // `npm pack --dry-run --json` output or a JSON array of paths.
    try {
      const j = JSON.parse(s);
      const arr = Array.isArray(j) ? j : [j];
      for (const x of arr) {
        if (typeof x === "string") out.push(x);
        else if (x && Array.isArray(x.files)) for (const f of x.files) out.push(f.path);
      }
      return out.filter(Boolean);
    } catch { /* fall through to lines */ }
  }
  for (let line of s.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    // `npm notice 1.2kB lib/a.js` lines from npm pack
    const notice = line.match(/^npm notice\s+[\d.]+\s*[kMG]?B\s+(.+)$/);
    if (notice) line = notice[1];
    line = line.replace(/^\.\//, "");
    if (line.endsWith("/")) continue;
    out.push(line);
  }
  return out;
}

function sourceLabel(r) {
  if (!r) return "no rule matches, so it ships";
  const head = r.line ? `${r.where} \`${r.text}\`` : `${r.source}: \`${r.text}\``;
  return `${head}${r.why ? ` (${r.why})` : ""}`;
}

// Everything the page and the CLI show, from a package.json and a tree.
export function analyze({ packageJson, files, ignoreFiles = new Map(), compare = null }) {
  let pkg;
  const errors = [];
  if (packageJson && typeof packageJson === "object") pkg = packageJson;
  else {
    try { pkg = JSON.parse(packageJson || "{}"); } catch (e) { errors.push(`package.json is not valid JSON: ${e.message}`); pkg = {}; }
  }
  const contents = new Map(ignoreFiles instanceof Map ? ignoreFiles : Object.entries(ignoreFiles || {}));
  const list = [...new Set([...(files || []).map((f) => normalizePath(String(f).replace(/\\/g, "/"))), "package.json", ...contents.keys()])].filter((f) => f && !f.startsWith(".."));
  const tree = buildTree(list, contents);
  const result = packlist(tree, pkg);
  const shipped = new Set(result.files);
  const rows = [...tree.files].sort().map((path) => {
    const e = explain(result, path);
    const c = classify(path);
    let reason;
    if (e.kind === "folder") reason = `folder ${e.folder}/ is never entered: ${sourceLabel(e.rule)}`;
    else if (e.kind === "star-name") reason = "npm skips names containing *";
    else reason = sourceLabel(e.rule);
    return { path, included: shipped.has(path), reason, rule: e.rule, folder: e.folder || null, ...c };
  });
  const findings = [];
  const leaks = rows.filter((r) => r.included && r.secret);
  if (leaks.length) findings.push({
    severity: "high", id: "secret-ships",
    message: `${leaks.length} file${leaks.length === 1 ? "" : "s"} that look${leaks.length === 1 ? "s" : ""} secret would be published. Anything in a published tarball is public for good: unpublishing does not reach mirrors and caches, so rotate the secret as well as excluding it.`,
    paths: leaks.map((r) => `${r.path}: ${r.secret}`),
  });

  // The .npmignore trap: a root .npmignore stops the root .gitignore applying.
  const rootGit = tree.isFile(".gitignore");
  const rootNpm = tree.isFile(".npmignore");
  if (rootGit && (rootNpm || Array.isArray(pkg.files))) {
    const gitRules = rulesFromText(".gitignore", String(tree.read(".gitignore") ?? ""));
    const wouldIgnore = rows.filter((r) => r.included && gitIgnoreAlone(gitRules, r.path));
    if (wouldIgnore.length) {
      const by = Array.isArray(pkg.files) ? "`files` in package.json is set" : "there is a .npmignore at the root";
      findings.push({
        severity: wouldIgnore.some((r) => r.secret) ? "high" : "medium", id: "gitignore-shadowed",
        message: `Your root .gitignore is not read, because ${by}. ${wouldIgnore.length} file${wouldIgnore.length === 1 ? "" : "s"} your .gitignore excludes would be published. npm reads .npmignore *instead of* .gitignore, not as well; copy the lines you still need into .npmignore, or use \`files\` as an allow-list.`,
        paths: wouldIgnore.map((r) => r.path),
      });
    }
  }

  // Entry points that would be missing from the tarball.
  const missing = [];
  const want = [];
  if (typeof pkg.main === "string" && pkg.main) want.push(["main", pkg.main]);
  if (typeof pkg.types === "string") want.push(["types", pkg.types]);
  if (typeof pkg.typings === "string") want.push(["typings", pkg.typings]);
  if (typeof pkg.module === "string") want.push(["module", pkg.module]);
  if (typeof pkg.browser === "string") want.push(["browser", pkg.browser]);
  for (const [name, target] of Object.entries(normalizeBin(pkg))) want.push([`bin.${name}`, target]);
  for (const t of exportTargets(pkg.exports)) want.push(["exports", t]);
  for (const [field, target] of want) {
    const p = normalizePath(target);
    if (/[*]/.test(p)) continue;
    const candidates = [p, p + ".js", p + ".json", p + ".node", p + "/index.js"];
    const hit = candidates.find((c) => shipped.has(c));
    if (hit) continue;
    const exists = candidates.find((c) => tree.isFile(c));
    missing.push({ field, target, exists: exists || null, reason: exists ? rows.find((r) => r.path === exists)?.reason : null });
  }
  if (missing.length) findings.push({
    severity: "high", id: "entry-missing",
    message: `${missing.length} entry point${missing.length === 1 ? "" : "s"} named in package.json would not be in the tarball, so installs would fail to import ${missing.length === 1 ? "it" : "them"}.`,
    paths: missing.map((m) => `${m.field}: ${m.target}${m.exists ? ` (exists, but ${m.reason})` : " (no such file in your list: build first, or fix the path)"}`),
  });
  const dotMain = missing.find((m) => m.field === "main" && m.exists && /^\.\//.test(m.target));
  if (dotMain) findings.push({
    severity: "high", id: "main-dot-slash",
    message: `npm always packs \`main\`, but only when it is written without a leading "./". npm turns main into the rule \`!/${dotMain.target}\`, and minimatch does not drop the "./" segment, so the rule never matches. (\`bin\` paths are cleaned first, so "./bin/x.js" works.) Write "main": "${dotMain.target.slice(2)}", or list its folder in \`files\`. Checked on npm 10.9.9 and 11.21.3.`,
    paths: [`main: ${dotMain.target}`],
  });

  // `files` entries that select nothing.
  if (Array.isArray(pkg.files)) {
    const dead = [];
    for (const k of result.ctx.filesKinds || []) {
      if (k.entry.startsWith("!")) continue;
      const rule = result.ctx.root.ignoreRules["package.json"]?.find((r) => r.why && r.why.startsWith(`"${k.entry}"`));
      const any = rows.some((r) => r.included && r.rule && r.rule.text === rule?.text) || (k.kind === "file");
      if (!any && !rows.some((r) => r.included && r.reason.includes(`"${k.entry}" in files`))) dead.push(k.entry);
    }
    if (dead.length) findings.push({
      severity: "medium", id: "files-entry-unused",
      message: `${dead.length} entr${dead.length === 1 ? "y" : "ies"} in \`files\` select${dead.length === 1 ? "s" : ""} nothing in your list. A build output folder that does not exist yet is the usual cause; otherwise check the spelling (npm ignores case, but not a wrong folder).`,
      paths: dead,
    });
  }

  // Things that ship that rarely belong in a package.
  const bloat = rows.filter((r) => r.included && r.bloat);
  if (bloat.length) {
    const groups = {};
    for (const r of bloat) (groups[r.bloat] ||= []).push(r.path);
    findings.push({
      severity: "low", id: "bloat",
      message: `${bloat.length} file${bloat.length === 1 ? "" : "s"} that usually stay out of a published package would ship: ${Object.entries(groups).map(([k, v]) => `${k} (${v.length})`).join(", ")}. Harmless to users, but they add install size.`,
      paths: bloat.map((r) => r.path),
    });
  }

  // A sub-folder ignore file still applies under `files`.
  const nested = [...tree.files].filter((p) => p.includes("/") && /(^|\/)\.(npm|git)ignore$/.test(p));
  if (nested.length) {
    const cut = rows.filter((r) => !r.included && r.rule && nested.includes(r.rule.source));
    if (cut.length) findings.push({
      severity: "info", id: "nested-ignore",
      message: `Ignore files in sub-folders still apply, even under \`files\`. ${cut.length} file${cut.length === 1 ? " is" : "s are"} left out by one of them.`,
      paths: cut.map((r) => `${r.path}: ${r.reason}`),
    });
  }

  // A folder rule stops working once npm has a reason to enter the folder.
  const bypassed = [];
  for (const r of rows) {
    if (!r.included || !r.path.includes("/") || r.rule?.source === "npm forced rules") continue;
    // A file npm forces in (main, bin, browser, a file named in files) is meant to ship.
    if ((result.ctx.root.ignoreRules[STRICT_RULES] || []).some((rule) => rule.negate && rule.match("/" + r.path))) continue;
    const hit = folderRuleOver(result.ctx, r.path);
    if (hit) bypassed.push({ path: r.path, ...hit });
  }
  if (bypassed.length) {
    const byRule = new Map();
    for (const b of bypassed) {
      const k = `${b.rule.source}${b.rule.line ? ":" + b.rule.line : ""} \`${b.rule.text}\` (folder ${b.folder}/)`;
      if (!byRule.has(k)) byRule.set(k, []);
      byRule.get(k).push(b.path);
    }
    findings.push({
      severity: bypassed.some((b) => classify(b.path).secret) ? "high" : "medium", id: "folder-rule-bypassed",
      message: `${bypassed.length} file${bypassed.length === 1 ? "" : "s"} ship from inside a folder that an ignore rule names. npm only skips a folder it never enters; when \`main\`, \`bin\`, \`files\` or a \`!\` rule gives it a reason to go in, the folder rule no longer matches the files inside, so they ship. Add a rule that matches the files themselves, such as \`dist/**\`, and a \`!\` line for each file that must stay.`,
      paths: [...byRule].map(([k, v]) => `${k}: ${v.slice(0, 8).join(", ")}${v.length > 8 ? ` and ${v.length - 8} more` : ""}`),
    });
  }

  const nestedModules = rows.filter((r) => r.included && /(^|\/)node_modules\//.test(r.path));
  if (nestedModules.length) findings.push({
    severity: "medium", id: "nested-node-modules",
    message: `npm only drops the node_modules folder at the package root. ${nestedModules.length} file${nestedModules.length === 1 ? "" : "s"} inside a nested node_modules would ship.`,
    paths: nestedModules.map((r) => r.path),
  });

  if (result.ctx.approximate.size) findings.push({
    severity: "info", id: "extglob",
    message: "A rule uses an extglob such as +(a|b) or !(x). This tool translates those plainly; check the files they touch with `npm pack --dry-run`.",
    paths: [...result.ctx.approximate].map((r) => `${r.source}${r.line ? ":" + r.line : ""} ${r.text}`),
  });
  for (const u of result.ctx.unread) errors.push(`${u} is in the file list but its contents were not given, so it was read as empty.`);
  if (pkg.bundleDependencies || pkg.bundledDependencies) errors.push("bundleDependencies are packed too; this tool does not walk node_modules, so they are not listed.");
  if (pkg.workspaces) errors.push("This package.json declares workspaces; npm leaves workspace folders out of the root tarball and this tool does not model that.");
  if (pkg.directories && pkg.directories.bin && !pkg.bin) errors.push("directories.bin is set: npm adds every file in it as a bin (and forces it in); this tool does not expand it.");

  let comparison = null;
  if (compare && compare.length) {
    const theirs = new Set(compare.map((f) => normalizePath(f)));
    comparison = {
      onlyHere: result.files.filter((f) => !theirs.has(f)),
      onlyThere: [...theirs].filter((f) => !shipped.has(f)).sort(),
    };
  }

  return {
    errors,
    pkg: { name: pkg.name || null, version: pkg.version || null, hasFiles: Array.isArray(pkg.files) },
    files: result.files,
    rows,
    findings,
    shadowed: result.ctx.shadowed,
    comparison,
    totals: { listed: tree.files.size, shipped: result.files.length, excluded: tree.files.size - result.files.length, secrets: leaks.length },
  };
}

function gitIgnoreAlone(rules, path) {
  // Would the root .gitignore, applied by npm on its own, exclude this path or
  // a folder above it? (npm's matching, so the comparison is like for like.)
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join("/");
    const isLast = i === parts.length;
    let included = true;
    for (const rule of rules) {
      if (rule.negate === included) continue;
      const m = rule.match("/" + p) || rule.match(p) || (!isLast && (rule.match("/" + p + "/") || rule.match(p + "/")));
      if (m) included = rule.negate;
    }
    if (!included) return true;
  }
  return false;
}

// Does an active (non-negated) rule in .npmignore/.gitignore name a folder
// above `path` as a folder? Then npm entered it anyway.
function folderRuleOver(ctx, path) {
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const folder = parts.slice(0, i).join("/");
    for (let j = 0; j < i; j++) {
      const w = walkerFor(ctx, parts.slice(0, j).join("/"));
      const rel = parts.slice(j, i).join("/");
      for (const f of [".npmignore", ".gitignore"]) {
        for (const rule of w.ignoreRules[f] || []) {
          if (rule.negate) continue;
          if (rule.match(rel + "/") || rule.match("/" + rel + "/") || rule.match(rel) || rule.match("/" + rel)) return { folder, rule: describeRule({ rule }) };
        }
      }
    }
  }
  return null;
}

function exportTargets(exp, out = []) {
  if (typeof exp === "string") { if (exp.startsWith("./")) out.push(exp); }
  else if (Array.isArray(exp)) exp.forEach((e) => exportTargets(e, out));
  else if (exp && typeof exp === "object") Object.values(exp).forEach((e) => exportTargets(e, out));
  return out;
}

export function reportCsv(report) {
  // Quote every cell, and defuse spreadsheet formulas: a file named "=cmd|..."
  // must not run when the CSV is opened.
  const q = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return ["path,ships,reason,flag", ...report.rows.map((r) => [q(r.path), r.included ? "yes" : "no", q(r.reason), q(r.secret || r.bloat || "")].join(","))].join("\n") + "\n";
}

export const EXAMPLE = {
  packageJson: JSON.stringify({ name: "tiny-date-fmt", version: "2.1.0", main: "dist/index.js", types: "dist/index.d.ts", bin: { "tiny-date": "./bin/cli.js" } }, null, 2),
  files: [
    "package.json", "package-lock.json", "README.md", "LICENSE", "CHANGELOG.md", ".gitignore", ".npmignore", ".env", ".env.example",
    "bin/cli.js", "src/index.ts", "src/format.ts", "dist/index.js", "dist/index.d.ts", "dist/index.js.map",
    "test/format.test.ts", "test/fixtures/dates.json", "coverage/lcov.info", ".github/workflows/ci.yml",
    "tsconfig.json", "notes/todo.md", "node_modules/left-pad/index.js",
  ].join("\n"),
  ignoreFiles: "==> .gitignore <==\nnode_modules/\ndist/\ncoverage/\n.env\nnotes/\n\n==> .npmignore <==\nsrc/\ntest/\ntsconfig.json\n",
};
