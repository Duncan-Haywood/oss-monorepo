// .gitattributes Explainer engine: resolves .gitattributes files the way git
// does and explains, for every path, which line set each attribute, through
// which macro, and what git will do to the file's line endings.
//
// Written from git's documentation (gitattributes(5)) and from reading the
// behaviour of git's attr.c (parse_attr_line, parse_attr, attr_name_valid,
// determine_macros, fill, fill_one, path_matches), dir.c (parse_path_pattern,
// match_basename, match_pathname), quote.c (unquote_c_style) and convert.c
// (convert_attrs, text_eol_is_crlf, output_eol). No git source is copied; git
// is GPL-2.0 and this file is MIT. Checked against `git check-attr -a` and
// `git ls-files --eol` by a randomised differential test
// (gitattributes.diff.test.mjs), and against real `git add` and checkout
// round trips (eol.git.test.mjs).
//
// The wildcard matcher below is the one in ../gitignore-explainer/gitignore.mjs
// (same repository, same FSL-1.1-MIT licence), copied so each published page stays
// self-contained: attributes and ignore rules share git's dir.c matcher.
//
// Pure functions, no I/O, no dependencies.

// ---------------------------------------------------------------- wildmatch


const MATCH = 0, NOMATCH = 1, ABORT_ALL = -1, ABORT_TO_STARSTAR = -2;

const CLASSES = {
  alnum: (c) => /[A-Za-z0-9]/.test(c),
  alpha: (c) => /[A-Za-z]/.test(c),
  blank: (c) => c === " " || c === "\t",
  cntrl: (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
  digit: (c) => /[0-9]/.test(c),
  graph: (c) => c.charCodeAt(0) > 32 && c.charCodeAt(0) < 127,
  lower: (c) => /[a-z]/.test(c),
  print: (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127,
  punct: (c) => /[!-\/:-@\[-`{-~]/.test(c),
  space: (c) => /[ \t\n\r\f\v]/.test(c),
  upper: (c) => /[A-Z]/.test(c),
  xdigit: (c) => /[0-9A-Fa-f]/.test(c),
};

// pathname: true is git's WM_PATHNAME: `*`, `?` and `[...]` never match `/`,
// and only a `**` that fills a whole path segment crosses directories.
function dowild(p, pi, t, ti, pathname) {
  for (; pi < p.length; pi++, ti++) {
    let pc = p[pi];
    const tc = t[ti];
    if (tc === undefined && pc !== "*") return ABORT_ALL;
    switch (pc) {
      case "\\":
        pi++;
        pc = p[pi];
        if (pc === undefined) return ABORT_ALL; // a trailing backslash never matches
        if (tc !== pc) return NOMATCH;
        continue;
      case "?":
        if (pathname && tc === "/") return NOMATCH;
        continue;
      case "*": {
        let matchSlash;
        if (p[pi + 1] === "*") {
          const before = pi - 1;
          pi++;
          while (p[pi + 1] === "*") pi++;
          const after = p[pi + 1];
          if ((before < 0 || p[before] === "/") &&
              (after === undefined || after === "/" || (after === "\\" && p[pi + 2] === "/"))) {
            if (after === "/" && dowild(p, pi + 2, t, ti, pathname) === MATCH) return MATCH;
            matchSlash = true;
          } else {
            matchSlash = !pathname;
          }
        } else {
          matchSlash = !pathname;
        }
        pi++; // now at the character after the star(s)
        if (pi >= p.length) {
          if (!matchSlash && t.indexOf("/", ti) !== -1) return NOMATCH;
          return MATCH;
        }
        if (!matchSlash && p[pi] === "/") {
          const slash = t.indexOf("/", ti);
          if (slash === -1) return NOMATCH;
          ti = slash;
          // the loop's increments consume the slash in both strings
          continue;
        }
        for (;;) {
          if (ti >= t.length) break;
          const m = dowild(p, pi, t, ti, pathname);
          if (m !== NOMATCH) {
            if (!matchSlash || m !== ABORT_TO_STARSTAR) return m;
          } else if (!matchSlash && t[ti] === "/") {
            return ABORT_TO_STARSTAR;
          }
          ti++;
        }
        return ABORT_ALL;
      }
      case "[": {
        pi++;
        pc = p[pi];
        if (pc === "^") pc = "!";
        const negated = pc === "!";
        if (negated) { pi++; pc = p[pi]; }
        let prev = "";
        let matched = false;
        do {
          if (pc === undefined) return ABORT_ALL;
          if (pc === "\\") {
            pi++;
            pc = p[pi];
            if (pc === undefined) return ABORT_ALL;
            if (tc === pc) matched = true;
          } else if (pc === "-" && prev && p[pi + 1] !== undefined && p[pi + 1] !== "]") {
            pi++;
            pc = p[pi];
            if (pc === "\\") {
              pi++;
              pc = p[pi];
              if (pc === undefined) return ABORT_ALL;
            }
            if (tc <= pc && tc >= prev) matched = true;
            pc = "";
          } else if (pc === "[" && p[pi + 1] === ":") {
            const start = pi + 2;
            let j = start;
            while (j < p.length && p[j] !== "]") j++;
            if (j >= p.length) return ABORT_ALL;
            if (j - start - 1 < 0 || p[j - 1] !== ":") {
              // no ":]" -- a literal "[" in the set
              pi = start - 2;
              pc = "[";
              if (tc === pc) matched = true;
            } else {
              const name = p.slice(start, j - 1);
              const cls = CLASSES[name];
              if (!cls) return ABORT_ALL;
              if (cls(tc)) matched = true;
              pi = j;
              pc = "";
            }
          } else if (tc === pc) {
            matched = true;
          }
          prev = pc;
          pi++;
          pc = p[pi];
        } while (pc !== "]");
        if (matched === negated || (pathname && tc === "/")) return NOMATCH;
        continue;
      }
      default:
        if (tc !== pc) return NOMATCH;
        continue;
    }
  }
  return ti < t.length ? NOMATCH : MATCH;
}

// git matches bytes, not characters: `?`, `[...]` and a range each take one
// byte, so `caf?.txt` does not match the UTF-8 name `café.txt` (é is two
// bytes). Non-ASCII text is matched as a string of its UTF-8 bytes.
const NON_ASCII = /[^\x00-\x7f]/;
const UTF8 = new TextEncoder();
const bytes = (s) => {
  let out = "";
  for (const b of UTF8.encode(s)) out += String.fromCharCode(b);
  return out;
};

export function wildmatch(pattern, text, { pathname = true } = {}) {
  if (NON_ASCII.test(pattern) || NON_ASCII.test(text)) { pattern = bytes(pattern); text = bytes(text); }
  return dowild(pattern, 0, text, 0, pathname) === MATCH;
}

const own = (obj, key) => Object.hasOwn(obj, key);

// ------------------------------------------------------------ git versions

// Two behaviours changed in releases this engine knows about:
// - git 2.44.0 reserved attribute names starting with `builtin_` (attr.c,
//   attr_name_reserved; absent from v2.43.0's attr.c, present in v2.44.0's).
//   On 2.44+ a line naming one is dropped like any invalid name.
// - git 2.52.0 changed how an anchored pattern's literal prefix is handed to
//   wildmatch (dir.c, match_pathname; found by ../gitignore-explainer's
//   differential test). Older git: `/a**/x` lets `**` cross folders; 2.52+
//   treats that `**` like `*`.
export const GIT_MODES = { modern: "2.52 or later", mid: "2.44 to 2.51", old: "2.43 or earlier" };

export function gitModeFor(versionText) {
  const m = String(versionText ?? "").match(/(\d+)\.(\d+)/);
  if (!m) return "modern";
  const v = Number(m[1]) * 1000 + Number(m[2]);
  if (v >= 2052) return "modern";
  if (v >= 2044) return "mid";
  return "old";
}

const modeFlags = (git) => {
  const mode = own(GIT_MODES, git) ? git : "modern";
  return { mode, legacyPrefix: mode !== "modern", reserved: mode !== "old" };
};

// ------------------------------------------------------------------ parsing

const isBlank = (c) => c === " " || c === "\t" || c === "\r" || c === "\n";
const skipBlank = (s, i) => { while (i < s.length && isBlank(s[i])) i++; return i; };
const toBlank = (s, i) => { while (i < s.length && !isBlank(s[i])) i++; return i; };
const byteLength = (s) => UTF8.encode(s).length;

// attr.c: names are [-._0-9a-zA-Z]+ and may not start with `-`.
export function attrNameValid(name) {
  return /^[A-Za-z0-9._][-A-Za-z0-9._]*$/.test(name);
}

const C_ESCAPES = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, "\\": 92, '"': 34 };

// quote.c unquote_c_style: `"..."` with C escapes and three-digit octal
// bytes. Returns the decoded text and the index just past the closing quote,
// or null when the quoting is broken (git then reads the token unquoted).
function unquoteC(s, start) {
  if (s[start] !== '"') return null;
  const out = [];
  for (let i = start + 1; i < s.length; i++) {
    const c = s[i];
    if (c === '"') return { value: new TextDecoder().decode(new Uint8Array(out)), end: i + 1 };
    if (c !== "\\") { out.push(...UTF8.encode(c)); continue; }
    const n = s[i + 1];
    if (n !== undefined && own(C_ESCAPES, n)) { out.push(C_ESCAPES[n]); i++; continue; }
    if (/^[0-3][0-7][0-7]$/.test(s.slice(i + 1, i + 4))) { out.push(parseInt(s.slice(i + 1, i + 4), 8)); i += 3; continue; }
    return null;
  }
  return null;
}

// One attribute token: `name` set, `-name` unset, `!name` unspecified,
// `name=value`. A value after `-` or `!` is ignored, as git ignores it.
function parseState(token, reserved) {
  const eq = token.indexOf("=");
  let name = eq === -1 ? token : token.slice(0, eq);
  let value;
  if (token[0] === "-" || token[0] === "!") {
    value = token[0] === "-" ? false : null;
    name = name.slice(1);
  } else {
    value = eq === -1 ? true : token.slice(eq + 1);
  }
  if (!attrNameValid(name)) return { error: "invalid-name", name };
  if (reserved && name.startsWith("builtin_")) return { error: "reserved-name", name };
  return { name, value, token };
}

export const MAX_LINE_BYTES = 2048; // attr.h ATTR_MAX_LINE_LENGTH

// Parse one line as git's parse_attr_line does. `macroOk` is true for the
// root .gitattributes, .git/info/attributes and the global and system files.
export function parseLine(raw, { macroOk = true, git = "modern", first = false } = {}) {
  const { reserved } = modeFlags(git);
  let line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  if (first && line[0] === "\uFEFF") line = line.slice(1);
  const start = skipBlank(line, 0);
  if (start >= line.length) return { type: "blank" };
  if (line[start] === "#") return { type: "comment" };
  if (byteLength(line) >= MAX_LINE_BYTES) return { type: "dropped", reason: "long-line" };
  let name, statesAt;
  const q = line[start] === '"' ? unquoteC(line, start) : null;
  if (q) {
    name = q.value;
    statesAt = q.end;
  } else {
    statesAt = toBlank(line, start);
    name = line.slice(start, statesAt);
  }
  let macro = null;
  if (byteLength(name) > 6 && name.startsWith("[attr]")) {
    if (!macroOk) return { type: "dropped", reason: "macro-not-allowed", name, macroName: macroNameOf(name) };
    macro = macroNameOf(name);
    if (!attrNameValid(macro)) return { type: "dropped", reason: "invalid-name", name: macro };
    if (reserved && macro.startsWith("builtin_")) return { type: "dropped", reason: "reserved-name", name: macro };
  }
  const states = [];
  let i = skipBlank(line, statesAt);
  while (i < line.length) {
    const end = toBlank(line, i);
    const st = parseState(line.slice(i, end), reserved);
    if (st.error) return { type: "dropped", reason: st.error, name: st.name, pattern: macro ? null : name };
    states.push(st);
    i = skipBlank(line, end);
  }
  if (macro) return { type: "macro", name: macro, states, quoted: Boolean(q) };
  // dir.c parse_path_pattern
  let pattern = name;
  const negated = pattern[0] === "!";
  if (negated) pattern = pattern.slice(1);
  const dirOnly = pattern.length > 0 && pattern[pattern.length - 1] === "/";
  if (dirOnly) pattern = pattern.slice(0, -1);
  const anchored = pattern.includes("/");
  if (negated) return { type: "dropped", reason: "negative", pattern: name, states };
  const written = pattern;
  if (anchored && pattern[0] === "/") pattern = pattern.slice(1);
  const special = pattern.search(/[*?[\\]/);
  const prefix = special === -1 ? pattern.length : special;
  return { type: "rule", pattern, written, dirOnly, anchored, prefix, states, quoted: Boolean(q) };
}

function macroNameOf(name) {
  const rest = name.slice(6);
  const s = skipBlank(rest, 0);
  return rest.slice(s, toBlank(rest, s));
}

function normalisePath(p) {
  return String(p).trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

// Split a pasted bundle into attribute files. A line `==> path <==` (what
// `head` prints for several files) starts a file; text before any header is
// the repository's root `.gitattributes`.
export function splitSources(text) {
  const files = [];
  let current = null;
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const h = line.match(/^==> (.+?) <==\s*$/);
    if (h) {
      current = { path: normalisePath(h[1]), lines: [] };
      files.push(current);
      continue;
    }
    if (!current) {
      current = { path: ".gitattributes", lines: [] };
      files.push(current);
    }
    current.lines.push(line);
  }
  for (const f of files) while (f.lines.length && f.lines[f.lines.length - 1] === "") f.lines.pop();
  return files.filter((f) => f.path !== ".gitattributes" || f.lines.some((l) => l.trim() !== "") || files.length === 1);
}

// Where a file sits in git's precedence order (gitattributes(5), "Defining
// macro attributes" and "DESCRIPTION"): system < global < root
// .gitattributes < deeper .gitattributes < .git/info/attributes.
function classifySource(path) {
  if (/^\.git\/info\/attributes$/.test(path)) return { kind: "info", base: "", macroOk: true };
  const label = !/(^|\/)\.gitattributes$/.test(path);
  if ((label && /^(global|core\.attributesfile)\b/i.test(path)) || /(^|\/)\.config\/git\/attributes$/.test(path)) return { kind: "global", base: "", macroOk: true };
  if ((label && /^system\b/i.test(path)) || /(^|\/)etc\/gitattributes$/.test(path)) return { kind: "system", base: "", macroOk: true };
  const slash = path.lastIndexOf("/");
  const base = slash === -1 ? "" : path.slice(0, slash);
  return { kind: base ? "dir" : "root", base, macroOk: !base };
}

export const BUILTIN = { path: "built-in", kind: "builtin", base: "", lines: ["[attr]binary -diff -merge -text"] };

export function compile(sourcesText, { git = "modern" } = {}) {
  const flags = modeFlags(git);
  const parsed = splitSources(sourcesText);
  const byPath = new Map();
  for (const f of parsed) byPath.set(f.path, f); // a repeated header: the last copy wins
  const all = [...byPath.values(), BUILTIN];
  return all.map((f) => {
    const c = f === BUILTIN ? { kind: "builtin", base: "", macroOk: true } : classifySource(f.path);
    const lines = [];
    const rules = [];
    f.lines.forEach((raw, i) => {
      const p = parseLine(raw, { macroOk: c.macroOk, git: flags.mode, first: i === 0 });
      const entry = { ...p, source: f.path, line: i + 1, raw: raw.endsWith("\r") ? raw.slice(0, -1) : raw, base: c.base, legacy: flags.legacyPrefix };
      entry.id = `${f.path}:${i + 1}`;
      lines.push(entry);
      if (p.type === "rule" || p.type === "macro") rules.push(entry);
    });
    return { path: f.path, kind: c.kind, base: c.base, lines, rules };
  });
}

// ----------------------------------------------------------------- matching

// dir.c match_basename / match_pathname, as in ../gitignore-explainer.
function ruleMatches(rule, path, isDir) {
  if (rule.dirOnly && !isDir) return false;
  if (!rule.anchored) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (rule.prefix === rule.pattern.length) return name === rule.pattern;
    if (rule.pattern[0] === "*" && rule.pattern.slice(1).search(/[*?[\\]/) === -1) return name.endsWith(rule.pattern.slice(1));
    return wildmatch(rule.pattern, name, { pathname: false });
  }
  let name = path;
  if (rule.base) {
    if (!path.startsWith(rule.base + "/")) return false;
    name = path.slice(rule.base.length + 1);
  }
  const prefix = rule.prefix;
  if (prefix) {
    if (prefix > name.length || name.slice(0, prefix) !== rule.pattern.slice(0, prefix)) return false;
    if (prefix === rule.pattern.length) return prefix === name.length;
    const cut = rule.legacy ? prefix : prefix - 1;
    return wildmatch(rule.pattern.slice(cut), name.slice(cut), { pathname: true });
  }
  return wildmatch(rule.pattern, name, { pathname: true });
}

const KIND_ORDER = new Map([["info", 0], ["dir", 1], ["root", 2], ["global", 3], ["system", 4], ["builtin", 5]]);
const kindRank = (k) => KIND_ORDER.get(k) ?? 9;

// The files git consults for `path`, most important first: info/attributes,
// then each .gitattributes from the path's own folder up to the root, then
// the global and system files, then the built-in `binary` macro.
function stackFor(files, path) {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  return files
    .filter((f) => f.kind !== "dir" || dir === f.base || dir.startsWith(f.base + "/"))
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || (a.kind === "dir" ? b.base.split("/").length - a.base.split("/").length : 0));
}

const ruleRef = (r) => (r ? { id: r.id, source: r.source, line: r.line, text: r.raw } : null);

// Resolve every attribute for one path (attr.c determine_macros, fill and
// fill_one). Returns a Map name -> { value, rule, via } and, with `trace`,
// every matching line in the order git reads it with what each token did.
export function resolvePath(files, path, isDir = false, { trace = false } = {}) {
  const stack = stackFor(files, path);
  const macros = new Map();
  for (const f of stack) {
    for (let i = f.rules.length - 1; i >= 0; i--) {
      const r = f.rules[i];
      if (r.type === "macro" && !macros.has(r.name)) macros.set(r.name, r);
    }
  }
  const decided = new Map();
  const steps = trace ? [] : null;
  for (const f of stack) {
    for (let i = f.rules.length - 1; i >= 0; i--) {
      const r = f.rules[i];
      if (r.type !== "rule" || !ruleMatches(r, path, isDir)) continue;
      const step = trace ? { rule: ruleRef(r), tokens: [] } : null;
      const queue = r.states.map((s) => ({ s, via: [] }));
      let item;
      while ((item = queue.pop())) {
        const { s, via } = item;
        const prior = decided.get(s.name);
        if (!prior) {
          decided.set(s.name, { value: s.value, rule: r, via });
          const m = macros.get(s.name);
          const expands = m && s.value === true;
          if (expands) queue.push(...m.states.map((ms) => ({ s: ms, via: [...via, { name: s.name, rule: ruleRef(m) }] })));
          if (step) step.tokens.push({ name: s.name, value: s.value, via: via.map((v) => v.name), decided: true, expands: Boolean(expands) });
        } else if (step) {
          step.tokens.push({ name: s.name, value: s.value, via: via.map((v) => v.name), decided: false, by: ruleRef(prior.rule) });
        }
      }
      if (step) steps.push(step);
    }
  }
  return { attrs: decided, macros, steps };
}

// check-attr's way of printing a value.
export function showValue(v) {
  if (v === true) return "set";
  if (v === false) return "unset";
  if (v === null || v === undefined) return "unspecified";
  return v;
}

// ------------------------------------------------------------- line endings

// convert.c convert_attrs: what the `text`, `crlf` and `eol` attributes ask
// for, before core.autocrlf and core.eol are consulted. `label` is what
// `git ls-files --eol` prints after "attr/".
const CRLF_LABEL = {
  UNDEFINED: "", BINARY: "-text", TEXT: "text", TEXT_INPUT: "text eol=lf", TEXT_CRLF: "text eol=crlf",
  AUTO: "text=auto", AUTO_CRLF: "text=auto eol=crlf", AUTO_INPUT: "text=auto eol=lf",
};

function crlfFrom(v) {
  if (v === true) return "TEXT";
  if (v === false) return "BINARY";
  if (v === "input") return "TEXT_INPUT";
  if (v === "auto") return "AUTO";
  return "UNDEFINED";
}

export function attrAction(get) {
  let action = crlfFrom(get("text"));
  if (action === "UNDEFINED") action = crlfFrom(get("crlf"));
  if (action !== "BINARY") {
    const e = get("eol");
    const eol = e === "lf" ? "LF" : e === "crlf" ? "CRLF" : null;
    if (action === "AUTO" && eol === "LF") action = "AUTO_INPUT";
    else if (action === "AUTO" && eol === "CRLF") action = "AUTO_CRLF";
    else if (eol === "LF") action = "TEXT_INPUT";
    else if (eol === "CRLF") action = "TEXT_CRLF";
  }
  return { action, label: CRLF_LABEL[action] };
}

export const EOL_DEFAULTS = { autocrlf: "false", eol: "native", platform: "unix" };

function textEolIsCrlf(s) {
  if (s.autocrlf === "true") return true;
  if (s.autocrlf === "input") return false;
  if (s.eol === "crlf") return true;
  if (s.eol === "native" && s.platform === "windows") return true;
  return false;
}

// The final decision after core.autocrlf and core.eol, and what it means.
export function lineEndings(get, settings = {}) {
  const s = { ...EOL_DEFAULTS, ...settings };
  const { action: asked, label } = attrAction(get);
  let action = asked;
  if (action === "TEXT") action = textEolIsCrlf(s) ? "TEXT_CRLF" : "TEXT_INPUT";
  if (action === "UNDEFINED") action = s.autocrlf === "true" ? "AUTO_CRLF" : s.autocrlf === "input" ? "AUTO_INPUT" : "BINARY";
  let checkout = "as stored";
  if (action === "TEXT_CRLF" || action === "AUTO_CRLF") checkout = "crlf";
  else if (action === "TEXT_INPUT" || action === "AUTO_INPUT") checkout = "lf";
  else if (action === "AUTO") checkout = textEolIsCrlf(s) ? "crlf" : "lf";
  const auto = action.startsWith("AUTO");
  const normalise = action === "BINARY" ? "never" : auto ? "if text" : "always";
  let summary;
  if (action === "BINARY") summary = asked === "BINARY" ? "Not text: stored and checked out byte for byte." : "No line-ending conversion (nothing sets text and core.autocrlf is false): stored as you commit it.";
  else {
    const out = checkout === "crlf" ? "CRLF" : "LF";
    summary = auto
      ? `If git judges the content text, CRLF becomes LF when committed and the file is checked out with ${out}; content git judges binary is left alone.`
      : `Text: CRLF becomes LF when committed; checked out with ${out}.`;
  }
  return { asked, label, action, normalise, checkout, summary, fromConfig: asked === "UNDEFINED" || asked === "TEXT" };
}

// What a new, plain-text file ends up as, given its line endings: the blob
// git stores on `git add`, then what a fresh checkout writes. Used by the
// round-trip test against real git; plain ASCII text only (no NUL, no lone CR).
export function predictRoundTrip(get, settings, content) {
  const le = lineEndings(get, settings);
  const index = le.action === "BINARY" ? content : "lf";
  const worktree = le.checkout === "crlf" && index === "lf" ? "crlf" : index;
  return { index, worktree };
}

// ---------------------------------------------------------------- analysis

// Attributes git or a well-known tool reads (gitattributes(5); GitHub
// Linguist's documentation for linguist-*; git-lfs for lockable). Used to
// spot case mistakes and typos, never to reject a name: any valid name is a
// legal attribute.
export const KNOWN = {
  text: "git: line-ending normalisation", eol: "git: line endings in the working tree", crlf: "git: old name for text",
  binary: "git: built-in macro for -diff -merge -text", diff: "git: diff driver, or -diff for binary", merge: "git: merge driver",
  filter: "git: clean/smudge filter (git-lfs uses filter=lfs)", ident: "git: $Id$ expansion", "export-ignore": "git archive: leave out",
  "export-subst": "git archive: expand placeholders", delta: "git: delta compression", encoding: "git gui: file encoding",
  "working-tree-encoding": "git: re-encode in the working tree", whitespace: "git: whitespace checks",
  "conflict-marker-size": "git: conflict marker length", lockable: "git-lfs: read-only until locked",
  "linguist-vendored": "GitHub Linguist: vendored code", "linguist-generated": "GitHub Linguist: generated code",
  "linguist-documentation": "GitHub Linguist: documentation", "linguist-detectable": "GitHub Linguist: count in language stats",
  "linguist-language": "GitHub Linguist: language override", "gitlab-language": "GitLab: highlighting override", "gitlab-generated": "GitLab: generated file",
};
const KNOWN_NAMES = Object.keys(KNOWN);

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

const where = (e) => ({ source: e.source, line: e.line, text: e.raw });

// Everything a line sets, macros expanded with the definitions visible from
// the root (enough for per-line lint; the per-path resolution is exact).
function expandLine(entry, macros, seen = new Set()) {
  const out = [];
  for (const s of entry.states) {
    out.push(s);
    const m = macros.get(s.name);
    if (m && s.value === true && !seen.has(s.name)) out.push(...expandLine(m, macros, new Set([...seen, s.name])));
  }
  return out;
}

function lint(files) {
  const out = [];
  const macros = new Map();
  for (const f of [...files].sort((a, b) => kindRank(a.kind) - kindRank(b.kind))) {
    for (let i = f.rules.length - 1; i >= 0; i--) if (f.rules[i].type === "macro" && !macros.has(f.rules[i].name)) macros.set(f.rules[i].name, f.rules[i]);
  }
  for (const f of files) {
    if (f.kind === "builtin") continue;
    for (const e of f.lines) {
      const w = where(e);
      if (e.type === "dropped") {
        if (e.reason === "negative") {
          out.push({ severity: "high", kind: "negative-pattern", ...w,
            title: "`!` patterns are not allowed in .gitattributes: git ignores this whole line",
            detail: "Unlike .gitignore, an attributes file cannot exclude paths with `!`. Git prints a warning and drops the line. To take a path out of a broad rule, write a line for it after the broad one that switches the attribute off (`-name`) or back to unspecified (`!name`). Write `\\!` if the file name really starts with `!`." });
        } else if (e.reason === "macro-not-allowed") {
          const users = files.filter((g) => g.kind !== "builtin").flatMap((g) => g.rules.filter((r) => r.type === "rule" && r.states.some((s) => s.name === e.macroName && s.value === true)).map((r) => `${r.source}:${r.line}`));
          out.push({ severity: "high", kind: "macro-not-allowed", ...w,
            title: `\`[attr]${e.macroName}\` only works in the top-level .gitattributes`,
            detail: `Git ignores macro definitions in a .gitattributes below the repository root (it prints "not allowed"). Move the line to the root .gitattributes or .git/info/attributes.${users.length ? ` Until then, lines that use \`${e.macroName}\` set an attribute of that name and nothing else.` : ""}`,
            paths: users.length ? users : undefined });
        } else if (e.reason === "invalid-name") {
          out.push({ severity: "high", kind: "invalid-name", ...w,
            title: `\`${e.name}\` is not a valid attribute name, so git ignores the whole line`,
            detail: "Attribute names use only letters, digits, `-`, `.` and `_`, and cannot start with `-`. One bad name drops every attribute on the line." + (e.name === "" ? " A lone `-`, `!` or `=` is an empty name." : "") + (/[/*]/.test(e.name) ? " If this is part of a file name with a space in it, put the pattern in double quotes." : "") });
        } else if (e.reason === "reserved-name") {
          out.push({ severity: "high", kind: "reserved-name", ...w,
            title: `\`${e.name}\`: names starting with \`builtin_\` are reserved`,
            detail: "Since git 2.44 a line that sets a `builtin_` attribute is dropped with a warning (git computes those itself, for example `builtin_objectmode`). Rename the attribute." });
        } else if (e.reason === "long-line") {
          out.push({ severity: "high", kind: "long-line", ...w, text: e.raw.slice(0, 80) + "…",
            title: "Line is 2,048 bytes or longer, so git ignores it",
            detail: "Git skips attribute lines of 2,048 bytes or more with a warning. Split the attributes over several lines with the same pattern." });
        }
        continue;
      }
      if (e.type !== "rule" && e.type !== "macro") continue;
      if (e.type === "rule" && e.states.length === 0) {
        out.push({ severity: "low", kind: "no-attributes", ...w, title: "Pattern with no attributes", detail: "A line with a pattern and nothing after it sets nothing. If the attributes are on the next line, join them." });
      }
      if (e.type === "rule" && e.dirOnly) {
        const others = e.states.filter((s) => s.name !== "export-ignore");
        if (others.length) {
          const fixed = `${e.written}/** ${e.states.map((s) => s.token).join(" ")}`;
          out.push({ severity: "high", kind: "folder-pattern", ...w,
            title: "A trailing `/` makes this line apply to the folder itself, not the files in it",
            detail: `Attributes are looked up for each file, and a pattern ending in \`/\` only matches folders, so ${others.map((s) => "`" + s.token + "`").join(", ")} never reaches a file. Write \`${fixed}\` to cover everything inside.${e.states.some((s) => s.name === "export-ignore") ? " `export-ignore` is the exception: git archive checks folders, so it does work here." : ""}` });
        }
      }
      const all = e.type === "rule" ? expandLine(e, macros) : e.states;
      for (const s of e.states) {
        if (!own(KNOWN, s.name)) {
          const lower = s.name.toLowerCase();
          if (own(KNOWN, lower)) {
            out.push({ severity: "high", kind: "name-case", ...w, title: `Attribute names are case-sensitive: \`${s.name}\` is not \`${lower}\``,
              detail: `Git and the tools that read \`${lower}\` look for it in lower case, so \`${s.name}\` does nothing for them. Write \`${lower}\`.` });
          } else {
            const near = s.name.length >= 4 ? KNOWN_NAMES.find((k) => editDistance(lower, k) <= (k.length >= 8 ? 2 : 1)) : null;
            if (near) out.push({ severity: "medium", kind: "name-typo", ...w, title: `\`${s.name}\`: did you mean \`${near}\`?`,
              detail: `\`${near}\` is read by ${KNOWN[near].split(":")[0]}; \`${s.name}\` is a valid but unknown name, so nothing reads it unless you have your own tooling for it.` });
            else if (/^[^=]+\.[A-Za-z0-9]{1,5}$/.test(s.name) && e.type === "rule") out.push({ severity: "medium", kind: "unquoted-space", ...w,
              title: `\`${s.name}\` looks like the rest of a file name`,
              detail: "Whitespace ends the pattern, so a name with a space is read as a short pattern followed by attributes. Put the whole pattern in double quotes: `\"my file.txt\" text`." });
          }
        }
        if (s.name === "eol" && typeof s.value === "string" && s.value !== "lf" && s.value !== "crlf") {
          const fix = s.value.toLowerCase() === "lf" || s.value.toLowerCase() === "crlf" ? ` Write \`eol=${s.value.toLowerCase()}\` (lower case).` : "";
          out.push({ severity: "high", kind: "eol-value", ...w, title: `\`eol=${s.value}\` is not a value git knows, so it is ignored`,
            detail: `Git only understands \`eol=lf\` and \`eol=crlf\`, compared exactly.${fix}` });
        } else if (s.name === "eol" && typeof s.value === "boolean") {
          out.push({ severity: "medium", kind: "eol-value", ...w, title: `\`${s.token}\` has no effect`, detail: "`eol` needs a value: `eol=lf` or `eol=crlf`." });
        }
        if ((s.name === "text" || s.name === "crlf") && typeof s.value === "string" && s.value !== "auto" && s.value !== "input") {
          out.push({ severity: "high", kind: "text-value", ...w, title: `\`${s.token}\` is not a value git knows`,
            detail: `Git reads \`${s.name}\` as set, \`-${s.name}\`, \`${s.name}=auto\` or \`${s.name}=input\`; any other value counts as if ${s.name} were not set, so core.autocrlf decides. Write \`${s.name}\` for "always text" or \`${s.name}=auto\` for "text when git sees text".` });
        }
        if (s.name === "crlf") {
          out.push({ severity: "low", kind: "legacy-crlf", ...w, title: "`crlf` is the old name for `text`",
            detail: "Git still reads it, but only when `text` is not set for the path. `crlf` → `text`, `-crlf` → `-text`, `crlf=input` → `text eol=lf`." });
        }
        if ((s.name === "diff" || s.name === "merge") && typeof s.value === "string" && /^(false|no|none|off|0|binary)$/i.test(s.value)) {
          out.push({ severity: "medium", kind: "driver-value", ...w, title: `\`${s.token}\` asks for a driver named "${s.value}"`,
            detail: `A value after \`${s.name}=\` names a driver from your git config. Without a \`[${s.name} "${s.value}"]\` section git falls back to its normal ${s.name}, so this does not switch anything off. Write \`-${s.name}\` (or \`binary\`).` });
        }
      }
      if (e.type === "rule") {
        const last = new Map();
        for (const s of all) if (!last.has(s.name)) last.set(s.name, s);
        // later tokens on a line win; expandLine lists them in order, so read it backwards
        const final = new Map();
        for (let i = all.length - 1; i >= 0; i--) if (!final.has(all[i].name)) final.set(all[i].name, all[i].value);
        if (final.get("filter") === "lfs" && final.get("text") !== false) {
          out.push({ severity: "medium", kind: "lfs-text", ...w, title: "Git LFS line without `-text`",
            detail: "Git LFS writes `filter=lfs diff=lfs merge=lfs -text`. Without `-text`, a broader `text` or `text=auto` rule can apply line-ending conversion to the LFS pointer and the checked-out file. Add `-text` to this line." });
        }
        if (final.get("text") === false && typeof final.get("eol") === "string") {
          out.push({ severity: "low", kind: "eol-binary", ...w, title: "`eol` does nothing on a path that is not text",
            detail: "This line unsets `text` (directly or through `binary`), and git skips line-ending conversion for non-text paths, so the `eol` setting is ignored." });
        }
      }
    }
  }
  return out;
}

const SEVERITY = new Map([["high", 0], ["medium", 1], ["low", 2], ["info", 3]]);
const severityRank = (k) => SEVERITY.get(k) ?? 9;

// `text` is pasted text (one path per line, a trailing `/` marks a folder,
// `# ` starts a comment, git's C-quoted names are decoded), or an array of
// exact paths.
export function parsePaths(text) {
  const out = [];
  const seen = new Set();
  const add = (path, isDir) => {
    if (!path || path === ".git" || path.startsWith(".git/")) return;
    const key = path + (isDir ? "/" : "");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ path, isDir });
  };
  if (Array.isArray(text)) { for (const p of text) add(p, false); return out; }
  for (let line of String(text ?? "").replace(/\r\n/g, "\n").split("\n")) {
    line = line.trim();
    if (!line || /^#(\s|$)/.test(line)) continue;
    // `git ls-files --eol` lines: "i/lf    w/lf    attr/text=auto \tpath"
    const eolCols = line.match(/^i\/\S*\s+w\/\S*\s+attr\/.*?\t(.+)$/);
    if (eolCols) line = eolCols[1];
    const q = unquoteC(line, 0);
    if (q && q.end === line.length) line = q.value;
    else line = normalisePath(line);
    const isDir = line.endsWith("/");
    add(line.replace(/^\.\//, "").replace(/\/+$/, ""), isDir);
  }
  return out;
}

export function analyze(input = {}) {
  const git = own(GIT_MODES, input.git) ? input.git : "modern";
  const settings = { ...EOL_DEFAULTS, ...(input.settings || {}) };
  const files = compile(input.sources ?? "", { git });
  const paths = parsePaths(input.paths);
  const findings = lint(files);
  const rows = [];
  const decides = new Map(); // rule id -> number of attribute decisions
  const matches = new Map(); // rule id -> number of matched paths
  const eolCounts = { text: 0, auto: 0, binary: 0, config: 0 };
  for (const p of paths) {
    const { attrs, steps } = resolvePath(files, p.path, p.isDir, { trace: true });
    for (const s of steps) matches.set(s.rule.id, (matches.get(s.rule.id) || 0) + 1);
    const list = [...attrs].map(([name, d]) => {
      decides.set(d.rule.id, (decides.get(d.rule.id) || 0) + 1);
      return { name, value: d.value, shown: showValue(d.value), rule: ruleRef(d.rule), via: d.via.map((v) => v.name) };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const row = { path: p.path, isDir: p.isDir, attrs: list };
    if (!p.isDir) {
      const get = (n) => attrs.get(n)?.value;
      row.eol = lineEndings(get, settings);
      if (row.eol.action === "BINARY") eolCounts[row.eol.asked === "BINARY" ? "binary" : "config"]++;
      else if (row.eol.normalise === "if text") eolCounts.auto++;
      else eolCounts.text++;
      if (get("filter") === "lfs") row.lfs = true;
    }
    rows.push(row);
  }
  if (paths.length) {
    for (const f of files) {
      if (f.kind === "builtin") continue;
      for (const r of f.rules) {
        if (r.type !== "rule" || !r.states.length) continue;
        if (findings.some((x) => x.kind === "folder-pattern" && x.source === r.source && x.line === r.line)) continue;
        const m = matches.get(r.id) || 0;
        if (!m) {
          findings.push({ severity: "low", kind: "matches-nothing", ...where(r), title: "Matches none of your paths",
            detail: (r.anchored ? "The pattern contains a `/`, so it is matched from the folder of the file it is in, not at any depth. Start it with `**/` to match anywhere. " : "") + "Evidence from your list only: the paths it was meant for may simply not be in it." });
        } else if (!decides.get(r.id)) {
          findings.push({ severity: "low", kind: "overridden", ...where(r), title: `Matches ${m} path${m === 1 ? "" : "s"} but decides nothing`,
            detail: "Every attribute it sets is decided by a more important line for every path it matches (a later line in the same file, a deeper .gitattributes, or .git/info/attributes). It can probably go." });
        }
      }
    }
  }
  findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.source.localeCompare(b.source) || a.line - b.line);
  const ruleCount = files.filter((f) => f.kind !== "builtin").reduce((n, f) => n + f.rules.length, 0);
  const dropped = files.reduce((n, f) => n + f.lines.filter((l) => l.type === "dropped").length, 0);
  return {
    git, settings,
    files: files.filter((f) => f.kind !== "builtin").map((f) => ({ path: f.path, kind: f.kind, rules: f.rules.length, dropped: f.lines.filter((l) => l.type === "dropped").length })),
    paths: rows, findings,
    totals: {
      paths: rows.length, files: rows.filter((r) => !r.isDir).length, rules: ruleCount, dropped,
      high: findings.filter((f) => f.severity === "high").length, findings: findings.length,
      eol: eolCounts, lfs: rows.filter((r) => r.lfs).length,
    },
  };
}

// The lines git reads for one path, in the order it reads them, and what
// each attribute on them did.
export function why(input = {}) {
  const git = own(GIT_MODES, input.git) ? input.git : "modern";
  const files = compile(input.sources ?? "", { git });
  const [p] = parsePaths(String(input.path ?? ""));
  if (!p) return { path: "", steps: [], attrs: [] };
  const { attrs, steps } = resolvePath(files, p.path, p.isDir, { trace: true });
  const out = { path: p.path, isDir: p.isDir, steps, attrs: [...attrs].map(([name, d]) => ({ name, shown: showValue(d.value), rule: ruleRef(d.rule), via: d.via.map((v) => v.name) })).sort((a, b) => a.name.localeCompare(b.name)) };
  if (!p.isDir) out.eol = lineEndings((n) => attrs.get(n)?.value, { ...EOL_DEFAULTS, ...(input.settings || {}) });
  return out;
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // keep spreadsheets from running a pasted path as a formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(result) {
  const rows = [["path", "attribute", "value", "file", "line", "via macro", "line endings"]];
  for (const r of result.paths) {
    const eol = r.eol ? r.eol.summary : "";
    if (!r.attrs.length) rows.push([r.path + (r.isDir ? "/" : ""), "", "", "", "", "", eol]);
    for (const a of r.attrs) rows.push([r.path + (r.isDir ? "/" : ""), a.name, a.shown, a.rule.source, a.rule.line, a.via.join(" > "), eol]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export const DEFAULTS = {
  sources: [
    "# line endings",
    "* text=auto",
    "*.sh text eol=lf",
    "*.bat text eol=CRLF",
    "*.png binary",
    "",
    "# big files in Git LFS",
    "*.psd filter=lfs diff=lfs merge=lfs",
    "[attr]lfs filter=lfs diff=lfs merge=lfs -text",
    "*.zip lfs",
    "",
    "# GitHub language stats",
    "docs/ linguist-documentation",
    "vendor/** linguist-vendored",
    "!vendor/ours/** -linguist-vendored",
    "*.min.js -diff linguist-generated",
    "",
    "==> web/.gitattributes <==",
    "[attr]generated linguist-generated -diff",
    "*.snap generated",
    "*.svg text Diff=html",
  ].join("\n"),
  paths: [
    "build.sh", "scripts/setup.bat", "logo.png", "art/cover.psd", "release.zip",
    "docs/guide.md", "docs/", "vendor/lib/jquery.js", "vendor/ours/util.js",
    "web/app.min.js", "web/__snapshots__/app.snap", "web/icon.svg", "README.md",
  ].join("\n"),
};
