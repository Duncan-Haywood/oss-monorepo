// EditorConfig Explainer engine: resolves .editorconfig files the way an
// EditorConfig core does and explains, for every file path, which section
// and line set each property, and why a section or pair does nothing.
//
// Written from the EditorConfig specification (spec.editorconfig.org,
// version 0.17.2: no inline comments, `unset`, the 1024/4096 limits) and
// checked against the official core-tests suite (eval/core-tests.mjs) and
// two shipping cores, editorconfig-core-py and the npm `editorconfig`
// package (eval/differential.mjs). No code from either core is copied.
//
// Pure functions, no I/O, no dependencies.

// ---------------------------------------------------------------- globs

// A section name compiles to a small tree that a backtracking matcher walks.
// A regular expression cannot check {num1..num2} exactly: the number it
// captures has to be compared after the match, and a regex that has already
// committed to one split of the path cannot try another.
//
// Nodes: { t: "lit", c } one literal character; { t: "any" } `?`;
// { t: "star" } `*`; { t: "globstar" } `**`; { t: "slashstar" } a `/**/`
// segment (one slash, or a slash, anything, a slash); { t: "class", neg,
// items } `[...]`; { t: "alt", options: [seq] } `{a,b}`;
// { t: "range", lo, hi } `{3..120}`.

const NUM = /^([+-]?\d+)\.\.([+-]?\d+)$/;

// Index of the `}` closing the `{` at `start`, honouring nesting and `\`
// escapes, or -1 when it never closes.
function closingBrace(p, start) {
  let depth = 0;
  for (let i = start; i < p.length; i++) {
    const c = p[i];
    if (c === "\\") { i++; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Top-level, unescaped commas inside a brace body.
function splitCommas(body) {
  const parts = [];
  let depth = 0, from = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\") { i++; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "," && depth === 0) { parts.push(body.slice(from, i)); from = i + 1; }
  }
  parts.push(body.slice(from));
  return parts;
}

// `[...]` starting at `start`: returns { node, end } or null when the bracket
// is literal (no closing `]`, or a `/` before it: a class never spans a path
// separator, so the spec's `ab[e/]cd.i` names that file literally).
function parseClass(p, start) {
  let i = start + 1;
  let neg = false;
  if (p[i] === "!" || p[i] === "^") { neg = true; i++; }
  const items = [];
  let first = true;
  for (; i < p.length; i++) {
    let c = p[i];
    if (c === "]" && !first) return { node: { t: "class", neg, items }, end: i };
    if (c === "/") return null;
    if (c === "]" && first) return null; // `[]` and `[!]` are literal text
    first = false;
    if (c === "\\" && i + 1 < p.length) { i++; c = p[i]; if (c === "/") return null; }
    if (p[i + 1] === "-" && p[i + 2] !== undefined && p[i + 2] !== "]") {
      let hi = p[i + 2];
      let skip = 2;
      if (hi === "\\" && p[i + 3] !== undefined) { hi = p[i + 3]; skip = 3; }
      if (hi === "/") return null;
      items.push([c, hi]);
      i += skip;
    } else {
      items.push([c, c]);
    }
  }
  return null;
}

export function parseGlob(p) {
  const seq = [];
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\") {
      if (i + 1 < p.length) { i++; seq.push({ t: "lit", c: p[i] }); } else seq.push({ t: "lit", c: "\\" });
      continue;
    }
    if (c === "*") {
      if (p[i + 1] === "*") {
        while (p[i + 1] === "*") i++;
        seq.push({ t: "globstar" });
      } else seq.push({ t: "star" });
      continue;
    }
    if (c === "?") { seq.push({ t: "any" }); continue; }
    if (c === "/" && p.slice(i, i + 4) === "/**/") {
      seq.push({ t: "slashstar" });
      i += 3; // past "/**/"; the loop's increment moves to the next character
      continue;
    }
    if (c === "[") {
      const cls = parseClass(p, i);
      if (cls) { seq.push(cls.node); i = cls.end; continue; }
      seq.push({ t: "lit", c: "[" });
      continue;
    }
    if (c === "{") {
      const end = closingBrace(p, i);
      if (end < 0) { seq.push({ t: "lit", c: "{" }); continue; }
      const body = p.slice(i + 1, end);
      const parts = splitCommas(body);
      if (parts.length > 1) {
        seq.push({ t: "alt", options: parts.map(parseGlob) });
      } else {
        const m = body.match(NUM);
        if (m) {
          seq.push({ t: "range", lo: Number(m[1]), hi: Number(m[2]), text: body });
        } else {
          // `{single}` matches `{single}` itself; what is inside is still a glob.
          seq.push({ t: "lit", c: "{" }, ...parseGlob(body), { t: "lit", c: "}" });
        }
      }
      i = end;
      continue;
    }
    seq.push({ t: "lit", c });
  }
  return seq;
}

function inClass(node, ch) {
  let hit = false;
  for (const [lo, hi] of node.items) if (ch >= lo && ch <= hi) { hit = true; break; }
  return node.neg ? !hit : hit;
}

// Continuation-passing backtracking over the tree. `k(pos)` is called for
// every position the sequence can end at; it returns true to stop.
function walk(seq, si, s, pos, k) {
  if (si === seq.length) return k(pos);
  const n = seq[si];
  switch (n.t) {
    case "lit":
      return s[pos] === n.c && walk(seq, si + 1, s, pos + 1, k);
    case "any":
      return pos < s.length && s[pos] !== "/" && walk(seq, si + 1, s, pos + 1, k);
    case "class":
      return pos < s.length && s[pos] !== "/" && inClass(n, s[pos]) && walk(seq, si + 1, s, pos + 1, k);
    case "star":
      for (let e = pos; e <= s.length; e++) {
        if (walk(seq, si + 1, s, e, k)) return true;
        if (s[e] === "/") break;
      }
      return false;
    case "globstar":
      for (let e = pos; e <= s.length; e++) if (walk(seq, si + 1, s, e, k)) return true;
      return false;
    case "slashstar":
      if (s[pos] !== "/") return false;
      if (walk(seq, si + 1, s, pos + 1, k)) return true;
      for (let e = pos + 1; e < s.length; e++) if (s[e] === "/" && walk(seq, si + 1, s, e + 1, k)) return true;
      return false;
    case "alt":
      for (const opt of n.options) {
        if (walk(opt, 0, s, pos, (p2) => walk(seq, si + 1, s, p2, k))) return true;
      }
      return false;
    case "range": {
      const m = /^[+-]?\d+/.exec(s.slice(pos));
      if (!m) return false;
      // Try every prefix of the digits: `{1..3}{0..9}` has to split "15" as 1, 5.
      const sign = /^[+-]/.test(m[0]) ? 1 : 0;
      for (let len = m[0].length; len > sign; len--) {
        const txt = m[0].slice(0, len);
        const digits = txt.slice(sign);
        if (digits.length > 1 && digits[0] === "0") continue; // 060 is not 60
        const v = Number(txt);
        if (v >= n.lo && v <= n.hi && walk(seq, si + 1, s, pos + len, k)) return true;
      }
      return false;
    }
  }
  return false;
}

export function globMatch(seq, s) {
  return walk(seq, 0, s, 0, (p) => p === s.length);
}

// The glob a section name stands for, as a full pattern from the top of the
// tree. `dir` is the folder holding the .editorconfig ("" for the top).
// A name with a `/` (outside brackets) is anchored to that folder, a leading
// `/` is dropped, and a name without one matches at any depth below it.
export function hasSlash(name) {
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    if (c === "\\") { i++; continue; }
    if (c === "[") {
      const cls = parseClass(name, i);
      if (cls) { i = cls.end; continue; }
    }
    if (c === "/") return true;
  }
  return false;
}

function litSeq(text) {
  return [...text].map((c) => ({ t: "lit", c }));
}

export function compileSection(name, dir) {
  let glob = name;
  const anchored = hasSlash(glob);
  if (anchored && glob[0] === "/") glob = glob.slice(1);
  // `/` + "**/x" is a `/**/` segment: x directly in the folder or anywhere
  // below. The folder's own path is literal text, special characters and all.
  return [...litSeq(dir ? "/" + dir : ""), ...parseGlob("/" + (anchored ? glob : "**/" + glob))];
}

export function sectionMatches(name, dir, path) {
  const seq = compileSection(name, dir);
  return globMatch(seq, "/" + path);
}

// ---------------------------------------------------------------- parsing

export const KNOWN = {
  indent_style: { values: ["tab", "space"], lower: true },
  indent_size: { lower: true, check: (v) => v === "tab" || /^[1-9]\d*$/.test(v), want: "a whole number or tab" },
  tab_width: { check: (v) => /^[1-9]\d*$/.test(v), want: "a whole number" },
  end_of_line: { values: ["lf", "cr", "crlf"], lower: true },
  charset: { values: ["latin1", "utf-8", "utf-8-bom", "utf-16be", "utf-16le"], lower: true },
  trim_trailing_whitespace: { values: ["true", "false"], lower: true },
  insert_final_newline: { values: ["true", "false"], lower: true },
  spelling_language: { check: (v) => /^[a-z]{2}(-[A-Z]{2})?$/i.test(v), want: "a two-letter language code, optionally with a territory, like en or en-US" },
  // Not in the specification, but on the project's list of widely supported
  // domain-specific properties and read by most editors.
  max_line_length: { check: (v) => v === "off" || /^[1-9]\d*$/.test(v), want: "a whole number or off" },
  root: { values: ["true", "false"] },
};

// Keys the cores lowercase the value of (the core-tests' lowercase_values).
const LOWER_VALUES = new Set(["indent_style", "indent_size", "end_of_line", "charset", "trim_trailing_whitespace", "insert_final_newline"]);

// One .editorconfig file's text -> its lines, sections and pairs.
export function parseFile(text, file = ".editorconfig") {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r\n|\n|\r/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const out = { file, dir: dirOf(file), root: false, rootLine: 0, preamble: [], sections: [], invalid: [] };
  let cur = null;
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const t = raw.trim();
    if (t === "" || t[0] === "#" || t[0] === ";") return;
    if (t[0] === "[" && t[t.length - 1] === "]" && t.length >= 2) {
      cur = { name: t.slice(1, -1), line, pairs: [], file };
      out.sections.push(cur);
      return;
    }
    const eq = t.indexOf("=");
    if (eq > 0) {
      const keyRaw = t.slice(0, eq).trim();
      const valueRaw = t.slice(eq + 1).trim();
      if (keyRaw === "") { out.invalid.push({ line, text: raw, why: "empty key" }); return; }
      const key = keyRaw.toLowerCase();
      const pair = { key, keyRaw, value: valueRaw, line, raw };
      if (cur) cur.pairs.push(pair);
      else {
        out.preamble.push(pair);
        if (key === "root") { out.root = valueRaw.toLowerCase() === "true"; out.rootLine = line; }
      }
      return;
    }
    let why = "not a section, a key = value pair or a comment";
    if (t[0] === "[") {
      why = "a section header must end with ]";
      // The pairs under a broken header belong to no section: they must not
      // fall into the section above it.
      cur = { name: null, line, pairs: [], file, broken: true };
    }
    else if (/^[^\s:]+\s*:/.test(t)) why = "uses : instead of =";
    else if (eq === 0) why = "empty key";
    out.invalid.push({ line, text: raw, why });
  });
  return out;
}

export function dirOf(file) {
  const f = String(file).replace(/^\.\//, "");
  const i = f.lastIndexOf("/");
  return i < 0 ? "" : f.slice(0, i);
}

// Pasted text -> [{ file, text }]. Several files are separated by a line
// `==> path/.editorconfig <==` (what `head` prints for several files);
// without one, the text is the top-level .editorconfig.
export function splitSources(text) {
  const src = String(text ?? "");
  const re = /^==> (.+?) <==\s*$/gm;
  const marks = [...src.matchAll(re)];
  if (!marks.length) return [{ file: ".editorconfig", text: src }];
  const files = [];
  const before = src.slice(0, marks[0].index);
  if (before.trim()) files.push({ file: ".editorconfig", text: before });
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
    let file = m[1].trim().replace(/^\.\//, "");
    files.push({ file, text: src.slice(m.index + m[0].length + 1, end) });
  });
  return files;
}

export function splitPaths(text) {
  if (Array.isArray(text)) return text.map(String).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (let l of String(text ?? "").split(/\r?\n/)) {
    l = l.trim().replace(/^\.\//, "");
    if (!l || l.startsWith("# ")) continue;
    if (!seen.has(l)) { seen.add(l); out.push(l); }
  }
  return out;
}

// ---------------------------------------------------------------- resolve

// Folders from the top down to the path's own folder, each with the
// .editorconfig there (if pasted). Reading starts at the nearest one with
// `root = true` and comes down, so nearer files are read last and win.
function chainFor(files, path) {
  const parts = path.split("/");
  parts.pop();
  const dirs = [""];
  for (let i = 0; i < parts.length; i++) dirs.push(parts.slice(0, i + 1).join("/"));
  const byDir = new Map(files.map((f) => [f.dir, f]));
  const chain = dirs.map((d) => byDir.get(d)).filter(Boolean);
  let start = 0;
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i].root) { start = i; break; }
  return { read: chain.slice(start), skipped: chain.slice(0, start) };
}

// Every property for one path, with the pair that set it and every pair it
// overrode. `version` is the core's version for the indent_size = tab
// default (0.10.0 and later), as in the core-tests' `-b`.
export function resolvePath(files, path, { version = "0.17.2" } = {}) {
  const { read, skipped } = chainFor(files, path);
  const props = new Map();
  const matched = [];
  for (const f of read) {
    for (const sec of f.sections) {
      if (!sectionMatches(sec.name, f.dir, path)) continue;
      matched.push(sec);
      for (const pair of sec.pairs) {
        const prev = props.get(pair.key);
        const entry = { key: pair.key, value: LOWER_VALUES.has(pair.key) ? pair.value.toLowerCase() : pair.value, file: f.file, line: pair.line, section: sec.name, sectionLine: sec.line, overrides: prev ? [...prev.overrides, prev] : [] };
        if (prev) props.delete(pair.key);
        props.set(pair.key, entry);
      }
    }
  }
  const core = new Map([...props].map(([k, e]) => [k, e.value]));
  const derived = {};
  const vnum = String(version).split(".").map(Number);
  const atLeast010 = vnum[0] > 0 || vnum[1] >= 10;
  if (core.get("indent_style") === "tab" && !core.has("indent_size") && atLeast010) { core.set("indent_size", "tab"); derived.indent_size = "indent_style = tab"; }
  if (core.has("indent_size") && !core.has("tab_width") && core.get("indent_size") !== "tab") { core.set("tab_width", core.get("indent_size")); derived.tab_width = "indent_size"; }
  if (core.has("indent_size") && core.has("tab_width") && core.get("indent_size") === "tab") { core.set("indent_size", core.get("tab_width")); derived.indent_size = "tab_width"; }
  return { path, props: [...props.values()], core: Object.fromEntries(core), derived, matched, read: read.map((f) => f.file), skipped: skipped.map((f) => f.file) };
}

// What a core prints: `key=value` lines.
export function coreOutput(result) {
  return Object.entries(result.core).map(([k, v]) => `${k}=${v}`).join("\n");
}

export function compile(sourcesText) {
  const sources = Array.isArray(sourcesText) ? sourcesText : splitSources(sourcesText);
  return sources.map((s) => parseFile(s.text, s.file));
}

// ---------------------------------------------------------------- findings

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function nearKey(key) {
  if (Object.hasOwn(KNOWN, key)) return null;
  const norm = key.replace(/[-\s.]/g, "_");
  if (Object.hasOwn(KNOWN, norm)) return norm;
  let best = null, bestD = 3;
  for (const k of Object.keys(KNOWN)) {
    if (k === "root") continue;
    const dist = editDistance(norm, k);
    if (dist < bestD && dist <= Math.max(1, Math.floor(k.length / 6))) { best = k; bestD = dist; }
  }
  return best;
}

export function checkValue(key, value) {
  const spec = Object.hasOwn(KNOWN, key) ? KNOWN[key] : null;
  if (!spec) return null;
  const v = value.toLowerCase();
  if (v === "unset") return null;
  if (spec.values) return spec.values.includes(v) ? null : `one of ${spec.values.join(", ")}`;
  if (spec.check) return spec.check(spec.lower ? v : value) ? null : spec.want;
  return null;
}

// What an old core that still strips inline comments would read: the text
// before the first ` #` or ` ;` (editorconfig-core-py 0.17.1 does this).
export function legacyValue(value) {
  const m = /^(.*?)\s[#;]/.exec(value);
  return m ? m[1].trim() : value;
}

// Lint for one section name that needs no path list.
export function sectionHints(name) {
  const hints = [];
  const body = name;
  if (body !== body.trim()) hints.push({ kind: "spaces", text: "starts or ends with a space, and the space is part of the glob, so it only matches names that have one" });
  if (/\/$/.test(body)) hints.push({ kind: "trailing-slash", text: "ends with `/`, and a section name ending with `/` matches no file; write `dir/**` for everything inside a folder" });
  if (/\\(?![\\*?\[\]{},#;!-])/.test(body)) hints.push({ kind: "backslash", text: "contains `\\`, which escapes the next character rather than separating folders; use `/` even on Windows" });
  if (/\\[*?\[]/.test(body)) hints.push({ kind: "escaped-wildcard", text: "escapes a wildcard with `\\`, which the specification and the npm core read as a literal character but editorconfig-core-py 0.17.1 still reads as a wildcard, so editors disagree on which files match" });
  if (/(^|\/)\.\.?(\/|$)/.test(body)) hints.push({ kind: "dot-segment", text: "contains a `.` or `..` folder, which globs do not resolve; paths are matched as written, from the .editorconfig's own folder down" });
  // a comma outside every {...} is literal text, so [a,b] or [x/**.py,] names one odd file
  {
    let depth = 0, stray = false;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === "\\") { i++; continue; }
      if (c === "{" && closingBrace(body, i) >= 0) depth++;
      else if (c === "}" && depth > 0) depth--;
      else if (c === "," && depth === 0) stray = true;
    }
    if (stray) hints.push({ kind: "stray-comma", text: `has a \`,\` outside any braces, and a comma there is literal text, so it only matches names containing a comma; list alternatives inside braces, like {a,b}, and check for a trailing comma` });
  }
  // single-alternative braces, outside brackets
  for (const m of body.matchAll(/(?<!\\)\{([^{},]*)\}/g)) {
    const inner = m[1];
    const num = inner.match(NUM);
    if (num) {
      if (Number(num[1]) > Number(num[2])) hints.push({ kind: "range-reversed", text: `\`{${inner}}\` is a numeric range with the larger number first, which the specification calls invalid, so spec-following cores match no number while the npm editorconfig core counts down and matches ${num[2]} to ${num[1]}; write {${num[2]}..${num[1]}}` });
      else if (/^[+-]?0\d/.test(num[1]) || /^[+-]?0\d/.test(num[2])) hints.push({ kind: "range-zeros", text: `\`{${inner}}\` has leading zeros; the range is read as numbers, and a name like 05 is not 5, so zero-padded names do not match` });
      continue;
    }
    if (/^[a-z]+\.\.[a-z]+$/i.test(inner)) { hints.push({ kind: "alpha-range", text: `\`{${inner}}\` is not a range: only numbers have ranges, so this matches the literal text {${inner}}` }); continue; }
    hints.push({ kind: "single-brace", text: `\`{${inner}}\` has no comma, so it matches the literal text {${inner}}, braces included; write ${inner || "the text"} without braces, or list two or more alternatives` });
  }
  return hints;
}

const SEV = { high: 0, medium: 1, low: 2, info: 3 };

export function analyze(input = {}) {
  const files = compile(input.sources ?? "");
  const paths = splitPaths(input.paths ?? "");
  const version = input.version || "0.17.2";
  const findings = [];
  const add = (f) => findings.push(f);

  const results = paths.map((p) => resolvePath(files, p, { version }));

  // which section decided anything, per (file, line)
  const sectionHits = new Map();
  const pairDecides = new Map();
  const pairApplies = new Map();
  for (const r of results) {
    for (const sec of r.matched) {
      const id = `${sec.file}:${sec.line}`;
      if (!sectionHits.has(id)) sectionHits.set(id, []);
      sectionHits.get(id).push(r.path);
    }
    for (const e of r.props) {
      const id = `${e.file}:${e.line}`;
      pairDecides.set(id, (pairDecides.get(id) || 0) + 1);
      for (const o of [e, ...e.overrides]) {
        const oid = `${o.file}:${o.line}`;
        if (!pairApplies.has(oid)) pairApplies.set(oid, { entry: o, paths: [] });
        pairApplies.get(oid).paths.push(r.path);
      }
    }
  }

  const tops = files.filter((f) => f.dir === "");
  for (const f of files) {
    for (const bad of f.invalid) {
      const after = f.sections.filter((x) => x.line > bad.line).length;
      add({ severity: "high", kind: "invalid-line", file: f.file, line: bad.line, text: bad.text.trim(), title: `Line ${bad.line} is not valid EditorConfig (${bad.why})`, detail: bad.why === "uses : instead of =" ? "EditorConfig pairs are written `key = value`. Some cores (editorconfig-core-py) also accept `:`, others ignore the line or stop reading the file, so editors on the same project disagree. Use `=`." : bad.why === "a section header must end with ]" ? `The line starts like a section header but does not end with \`]\`; anything after the \`]\`, a comment included, makes the whole line invalid. Cores disagree on what follows: editorconfig-core-py 0.17.1 reads the header up to the \`]\` and applies the section; the npm editorconfig core stops reading the file at this line${after ? `, so the ${after} valid section${after === 1 ? "" : "s"} below it are lost too` : ""}; this tool skips the line and the pairs under it. Put the comment on its own line.` : "The specification defines blank lines, comments (`#` or `;` first), `[section]` headers and `key = value` pairs; anything else is invalid, and a strict core may stop reading the file." });
    }
    for (const p of f.preamble) {
      if (p.key === "root") {
        const bad = checkValue("root", p.value);
        if (bad) add({ severity: "medium", kind: "invalid-value", file: f.file, line: p.line, text: p.raw.trim(), title: `root = ${p.value} is not true or false`, detail: "Only `root = true` (any case) stops the search for parent .editorconfig files; anything else is read as false." });
        continue;
      }
      add({ severity: "medium", kind: "preamble-pair", file: f.file, line: p.line, text: p.raw.trim(), title: `\`${p.keyRaw}\` before the first section applies to no file`, detail: "Only `root` belongs above the first `[section]`. Every other pair has to sit under a section to take effect; for every file, put it under `[*]`." });
    }
    const seenKeys = new Map();
    for (const sec of f.sections) {
      for (const h of sectionHints(sec.name)) {
        add({ severity: h.kind === "spaces" || h.kind === "trailing-slash" || h.kind === "single-brace" || h.kind === "range-reversed" || h.kind === "backslash" || h.kind === "stray-comma" ? "medium" : "low", kind: `glob-${h.kind}`, file: f.file, line: sec.line, text: `[${sec.name}]`, title: `[${sec.name}] ${h.text.split(",")[0]}`, detail: `The section name ${h.text}.` });
      }
      seenKeys.clear();
      for (const p of sec.pairs) {
        if (seenKeys.has(p.key)) add({ severity: "low", kind: "duplicate-key", file: f.file, line: p.line, text: p.raw.trim(), title: `\`${p.key}\` is set twice in [${sec.name}]`, detail: `Line ${seenKeys.get(p.key)} sets it first and this line replaces it; delete one.` });
        seenKeys.set(p.key, p.line);
        if (p.key === "root") {
          add({ severity: "high", kind: "root-in-section", file: f.file, line: p.line, text: p.raw.trim(), title: `root = ${p.value} inside [${sec.name}] does not stop the search`, detail: "`root` only counts in the preamble, above the first section. Inside a section it is an ordinary key: cores report `root=...` for matching files and keep reading parent .editorconfig files. Move it to the top of the file." });
          continue;
        }
        const near = nearKey(p.key);
        if (near) add({ severity: "medium", kind: "unknown-key", file: f.file, line: p.line, text: p.raw.trim(), title: `\`${p.keyRaw}\` is not an EditorConfig key; did you mean \`${near}\`?`, detail: `Cores pass unknown keys through and editors ignore them, so this line does nothing. The specified key is \`${near}\`.` });
        const want = checkValue(p.key, p.value);
        if (want) {
          const legacy = legacyValue(p.value);
          const legacyOk = legacy !== p.value && !checkValue(p.key, legacy);
          if (legacyOk) {
            add({ severity: "high", kind: "inline-comment", file: f.file, line: p.line, text: p.raw.trim(), title: `\`${p.key} = ${p.value}\`: editors disagree on this value`, detail: `Since version 0.15 of the specification, \`#\` and \`;\` after a value are part of the value, so cores that follow it read \`${p.value}\`, which is not ${want}, and editors ignore the setting. Older cores (editorconfig-core-py 0.17.1 still does) strip the comment and read \`${legacy}\`. Move the comment to its own line.` });
          } else {
            const off = /^(off|false|none|no|disable|disabled|ignore)$/i.test(p.value) && p.key !== "max_line_length";
            add({ severity: p.key === "max_line_length" ? "low" : "medium", kind: "invalid-value", file: f.file, line: p.line, text: p.raw.trim(), title: `\`${p.key} = ${p.value}\` is not ${want}`, detail: off ? `Editors ignore a value they do not support, so this does not switch ${p.key} off: files keep whatever an earlier section or the editor set. To cancel an earlier setting, write \`${p.key} = unset\`.` : p.key === "max_line_length" ? "`max_line_length` is not in the specification; the editors that read it document a whole number or `off`, and may ignore this value." : "Editors ignore a value they do not support, so this file keeps whatever the editor or an earlier section set." });
          }
        } else if (/\s[#;]/.test(p.value) && !Object.hasOwn(KNOWN, p.key)) {
          add({ severity: "low", kind: "inline-comment", file: f.file, line: p.line, text: p.raw.trim(), title: `\`${p.key}\`'s value contains \` #\` or \` ;\``, detail: `Cores that follow the specification read the whole \`${p.value}\`; older ones stop at the \`#\` or \`;\` and read \`${legacyValue(p.value)}\`.` });
        }
      }
    }
  }

  // nested root files cut off the files above them
  for (const f of files) {
    if (f.dir !== "" && f.root) {
      const above = files.filter((g) => g !== f && (g.dir === "" || f.dir.startsWith(g.dir + "/")));
      if (above.length) add({ severity: "info", kind: "nested-root", file: f.file, line: f.rootLine, text: "root = true", title: `${f.file} has root = true, so files under ${f.dir}/ never read ${above.map((g) => g.file).join(", ")}`, detail: "A nested `root = true` makes this folder its own project. Settings from the files above it, `[*]` included, stop applying below it; repeat what you still want here, or remove the line." });
    }
  }
  if (files.length && !tops.some((f) => f.root)) {
    const top = tops[0];
    add({ severity: "low", kind: "no-root", file: top ? top.file : files[0].file, line: 1, text: "", title: "No `root = true` at the top of the project", detail: "Without it, editors keep looking in the folders above the project, your home folder included, and a stray ~/.editorconfig there can change settings for this repository on one person's machine. Add `root = true` as the first line of the top-level .editorconfig." });
  }

  if (paths.length) {
    for (const f of files) {
      for (const sec of f.sections) {
        const id = `${f.file}:${sec.line}`;
        if (sectionHits.has(id)) {
          for (const p of sec.pairs) {
            const pid = `${f.file}:${p.line}`;
            if (p.key !== "root" && pairApplies.has(pid) && !pairDecides.has(pid)) {
              const ex = results.find((r) => pairApplies.get(pid).paths.includes(r.path));
              const winner = ex && ex.props.find((e) => e.key === p.key);
              add({ severity: "low", kind: "overridden-pair", file: f.file, line: p.line, text: p.raw.trim(), title: `\`${p.key} = ${p.value}\` in [${sec.name}] is overridden for every listed file it applies to`, detail: winner ? `For example ${ex.path} gets \`${winner.key} = ${winner.value}\` from [${winner.section}] (${winner.file}:${winner.line}). A later section, or a nearer .editorconfig, wins.` : "A later section, or a nearer .editorconfig, wins.", paths: pairApplies.get(pid).paths });
            }
          }
          continue;
        }
        const below = paths.filter((p) => f.dir === "" || p.startsWith(f.dir + "/"));
        if (!below.length) continue;
        const cut = paths.filter((p) => below.includes(p) && chainFor(files, p).skipped.includes(f));
        let detail = `None of the ${below.length} listed path${below.length === 1 ? "" : "s"} below this .editorconfig matches it.`;
        if (cut.length === below.length) detail = `Every listed path below it is under a folder whose .editorconfig has root = true, so this file is never read for them.`;
        else {
          // looser names that would have matched: any depth, and * widened to **
          const name = sec.name.replace(/^\//, "");
          const tries = [];
          if (hasSlash(sec.name)) tries.push(["**/" + name, "A name with a `/` is anchored to the folder of its .editorconfig"]);
          if (/(^|[^*\\])\*(?!\*)/.test(name)) tries.push([name.replace(/(^|[^*\\])\*(?!\*)/g, "$1**"), "`*` stops at a `/`"]);
          let hinted = false;
          for (const [loose, why] of tries) {
            const would = below.filter((p) => sectionMatches(loose, f.dir, p));
            if (would.length) { detail += ` ${why}; \`[${loose}]\` would match ${would.length}, e.g. ${would[0]}.`; hinted = true; break; }
          }
          if (!hinted) {
            const ci = below.filter((p) => sectionMatches(sec.name.toLowerCase(), f.dir, p.toLowerCase()));
            if (ci.length) detail += ` Matching is case-sensitive; ignoring case it would match ${ci.length}, e.g. ${ci[0]}.`;
          }
        }
        const hints = sectionHints(sec.name);
        if (hints.length) detail += ` The name ${hints[0].text}.`;
        add({ severity: "medium", kind: "section-unmatched", file: f.file, line: sec.line, text: `[${sec.name}]`, title: `[${sec.name}] matches none of the listed files`, detail });
      }
    }
  }

  const rank = (sv) => (Object.hasOwn(SEV, sv) ? SEV[sv] : 9);
  findings.sort((a, b) => rank(a.severity) - rank(b.severity) || a.file.localeCompare(b.file) || a.line - b.line);
  const unset = results.reduce((n, r) => n + r.props.filter((e) => e.value.toLowerCase() === "unset").length, 0);
  return {
    files: files.map((f) => ({ file: f.file, root: f.root, sections: f.sections.length, pairs: f.sections.reduce((n, s) => n + s.pairs.length, 0) })),
    paths: results.map((r) => ({ path: r.path, props: r.props.map((e) => ({ key: e.key, value: e.value, file: e.file, line: e.line, section: e.section, overrides: e.overrides.map((o) => ({ value: o.value, file: o.file, line: o.line, section: o.section })) })), core: r.core, derived: r.derived, read: r.read, skipped: r.skipped })),
    findings,
    totals: {
      files: files.length,
      sections: files.reduce((n, f) => n + f.sections.length, 0),
      paths: results.length,
      withSettings: results.filter((r) => r.props.length).length,
      noSettings: results.filter((r) => !r.props.length).length,
      unset,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
    },
  };
}

// The steps for one path: which files are read, in which order, and which
// sections match.
export function why(input = {}) {
  const files = compile(input.sources ?? "");
  const path = String(input.path ?? "").trim().replace(/^\.\//, "");
  if (!path) return { path, steps: [] };
  const { read, skipped } = chainFor(files, path);
  const steps = [];
  for (const f of skipped) steps.push({ file: f.file, note: "not read: a nearer .editorconfig has root = true", sections: [] });
  for (const f of read) {
    steps.push({
      file: f.file,
      note: f.root ? "root = true: the search stops here" : "",
      sections: f.sections.map((s) => ({ name: s.name, line: s.line, matches: sectionMatches(s.name, f.dir, path), pairs: s.pairs.map((p) => `${p.key} = ${p.value}`) })),
    });
  }
  const r = resolvePath(files, path, { version: input.version });
  return { path, steps, core: r.core, derived: r.derived };
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function reportCsv(result) {
  const rows = [["path", "key", "value", "file", "line", "section", "overrides"]];
  for (const p of result.paths) {
    if (!p.props.length) rows.push([p.path, "", "", "", "", "", ""]);
    for (const e of p.props) rows.push([p.path, e.key, e.value, e.file, e.line, e.section, e.overrides.map((o) => `${o.file}:${o.line}=${o.value}`).join("; ")]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export const DEFAULTS = {
  sources: `==> .editorconfig <==
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{md}]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab

[*.py]
indent_size = 4 # PEP 8

[src/*.go]
indent_style = tab

==> packages/legacy/.editorconfig <==
[*.js]
root = true
indent-size = 4
`,
  paths: `README.md
docs/guide.md
Makefile
tools/build.py
cmd/server/main.go
src/server/main.go
packages/legacy/index.js
packages/legacy/lib/util.js`,
};
