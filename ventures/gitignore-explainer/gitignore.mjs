// .gitignore Explainer engine: resolves ignore rules the way git does and
// explains, for every path, which rule decided it and why.
//
// The matcher is a port of the semantics of git's wildmatch.c and the
// pattern handling in dir.c (parse_path_pattern, trim_trailing_spaces,
// match_basename, match_pathname, last_matching_pattern_from_lists and the
// "an excluded directory is never entered" step in prep_exclude). It is
// written from git's documented behaviour and checked against
// `git check-ignore --no-index -v` by a randomised differential test
// (gitignore.diff.test.mjs); no git source is copied.
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

export function wildmatch(pattern, text, { pathname = true } = {}) {
  return dowild(pattern, 0, text, 0, pathname) === MATCH;
}

// ------------------------------------------------------------------ parsing

// git trims trailing spaces (not tabs) unless the last one is escaped.
function trimTrailingSpaces(s) {
  let lastSpace = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === " ") {
      if (lastSpace === -1) lastSpace = i;
    } else if (c === "\\") {
      i++;
      if (i >= s.length) return s;
      lastSpace = -1;
    } else {
      lastSpace = -1;
    }
  }
  return lastSpace === -1 ? s : s.slice(0, lastSpace);
}

export function parseRule(raw) {
  let line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  if (line === "" || line[0] === "#") return null;
  line = trimTrailingSpaces(line);
  if (line === "") return null;
  let pattern = line;
  let negated = false;
  if (pattern[0] === "!") { negated = true; pattern = pattern.slice(1); }
  let dirOnly = false;
  if (pattern.length && pattern[pattern.length - 1] === "/") { dirOnly = true; pattern = pattern.slice(0, -1); }
  const anchored = pattern.includes("/");
  if (anchored && pattern[0] === "/") pattern = pattern.slice(1);
  const special = pattern.search(/[*?[\\]/);
  const prefix = special === -1 ? pattern.length : special;
  return { text: line, pattern, negated, dirOnly, anchored, prefix };
}

// Split a pasted bundle into ignore files. A line `==> path <==` (the format
// `head` prints for several files) starts a file; text before any header is
// the repository's root `.gitignore`.
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
      current = { path: ".gitignore", lines: [] };
      files.push(current);
    }
    current.lines.push(line);
  }
  // drop trailing blank lines `head` adds between files
  for (const f of files) while (f.lines.length && f.lines[f.lines.length - 1] === "") f.lines.pop();
  return files.filter((f) => f.path !== ".gitignore" || f.lines.some((l) => l.trim() !== "") || files.length === 1);
}

function normalisePath(p) {
  return String(p).trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

// Where a file's rules apply, and its precedence group. `.git/info/exclude`
// and a global excludes file apply repository-wide below every .gitignore.
function classifySource(path) {
  if (path === ".git/info/exclude" || /(^|\/)\.config\/git\/ignore$/.test(path) || /^(global|core\.excludesfile|excludesfile)\b/i.test(path)) {
    return { kind: "exclude", base: "" };
  }
  const slash = path.lastIndexOf("/");
  return { kind: "dir", base: slash === -1 ? "" : path.slice(0, slash) };
}

export function compile(sourcesText) {
  const files = splitSources(sourcesText).map((f, fileIndex) => {
    const { kind, base } = classifySource(f.path);
    const rules = [];
    f.lines.forEach((raw, i) => {
      const r = parseRule(raw);
      if (r) rules.push({ ...r, source: f.path, line: i + 1, raw, base, kind, id: `${f.path}:${i + 1}`, fileIndex });
    });
    return { path: f.path, kind, base, lines: f.lines, rules };
  });
  return files;
}

// ----------------------------------------------------------------- matching

function ruleMatches(rule, path, isDir) {
  if (rule.dirOnly && !isDir) return false;
  // a nested .gitignore only speaks for paths below its own directory
  if (rule.base && !path.startsWith(rule.base + "/")) return false;
  if (!rule.anchored) {
    const slash = path.lastIndexOf("/");
    return wildmatch(rule.pattern, path.slice(slash + 1), { pathname: false });
  }
  let name = path;
  if (rule.base) {
    if (!path.startsWith(rule.base + "/")) return false;
    name = path.slice(rule.base.length + 1);
  }
  // git compares the literal prefix (up to the first `*?[\\`) as plain text
  // and wildmatches only the rest, as a pattern of its own. That changes
  // meaning: in `a**/x` the `**` then starts the pattern and crosses
  // directories, where wildmatch on the whole would treat it as `*`.
  const prefix = rule.prefix;
  if (prefix) {
    if (prefix > name.length || name.slice(0, prefix) !== rule.pattern.slice(0, prefix)) return false;
    const restP = rule.pattern.slice(prefix), restN = name.slice(prefix);
    if (!restP) return !restN;
    return wildmatch(restP, restN, { pathname: true });
  }
  return wildmatch(rule.pattern, name, { pathname: true });
}

function lastMatchIn(rules, path, isDir, skip) {
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i];
    if (skip && skip.has(r.id)) continue;
    if (ruleMatches(r, path, isDir)) return r;
  }
  return null;
}

function parentOf(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

// A resolver over one compiled rule set. `skip` (a Set of rule ids) removes
// rules, used to measure what each rule changes.
export function resolver(files, skip = null) {
  const dirFiles = new Map(); // base dir -> rules of the .gitignore there
  for (const f of files) {
    if (f.kind !== "dir") continue;
    const list = dirFiles.get(f.base) || [];
    list.push(...f.rules);
    dirFiles.set(f.base, list);
  }
  const excludeRules = files.filter((f) => f.kind === "exclude").flatMap((f) => f.rules);
  const dirCache = new Map();

  // Lists in effect for paths directly inside `dir`, deepest first. A
  // directory's own .gitignore is read only if git would enter it.
  const stackCache = new Map();
  function stackFor(dir) {
    if (stackCache.has(dir)) return stackCache.get(dir);
    const parts = dir === "" ? [] : dir.split("/");
    const stack = [];
    let cur = "";
    if (dirFiles.has("")) stack.unshift(dirFiles.get(""));
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (dirFiles.has(cur)) stack.unshift(dirFiles.get(cur));
    }
    stackCache.set(dir, stack);
    return stack;
  }

  function decide(path, isDir) {
    const stack = stackFor(parentOf(path));
    for (const rules of stack) {
      const r = lastMatchIn(rules, path, isDir, skip);
      if (r) return r;
    }
    return lastMatchIn(excludeRules, path, isDir, skip);
  }

  // Is directory `dir` excluded, counting its ancestors? Returns the
  // excluded ancestor (or the dir itself) and the rule, or null.
  function dirState(dir) {
    if (dir === "") return null;
    if (dirCache.has(dir)) return dirCache.get(dir);
    const up = dirState(parentOf(dir));
    let res = up;
    if (!up) {
      const r = decide(dir, true);
      res = r && !r.negated ? { dir, rule: r } : null;
    }
    dirCache.set(dir, res);
    return res;
  }

  return function explain(path, isDir = false) {
    const anc = dirState(parentOf(path));
    const own = decide(path, isDir);
    if (anc) return { ignored: true, rule: anc.rule, via: anc.dir, own };
    return { ignored: !!own && !own.negated, rule: own, via: null, own };
  };
}

// ----------------------------------------------------------------- analysis

function parsePaths(text) {
  const out = [];
  const seen = new Set();
  for (let line of String(text ?? "").replace(/\r\n/g, "\n").split("\n")) {
    line = line.replace(/^\s+|\s+$/g, "");
    if (!line || line.startsWith("#")) continue;
    // `git status --porcelain` / `--ignored` lines: "?? path", "!! path"
    const m = line.match(/^(\?\?|!!|[ MADRCU?!]{2}) (.+)$/);
    if (m) line = m[2];
    if (line.startsWith('"') && line.endsWith('"')) line = line.slice(1, -1);
    const isDir = line.endsWith("/");
    const path = normalisePath(line).replace(/\/+$/, "");
    if (!path || path === "." || path.startsWith(".git/") || path === ".git") continue;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, isDir });
  }
  return out;
}

const describeRule = (r) => r ? { id: r.id, source: r.source, line: r.line, text: r.text, negated: r.negated } : null;

function lint(files) {
  const out = [];
  for (const f of files) {
    f.lines.forEach((raw, i) => {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      const where = { source: f.path, line: i + 1, text: line };
      if (line === "" || line[0] === "#") return;
      const rule = parseRule(raw);
      if (!rule) return;
      if (/\t+$/.test(rule.text)) {
        out.push({ severity: "high", kind: "trailing-tab", ...where,
          title: "Trailing tab is part of the pattern",
          detail: "Git trims trailing spaces but not tabs, so this rule only matches names that really end in a tab. Delete the tab." });
      }
      if (/^\s/.test(line)) {
        out.push({ severity: "high", kind: "leading-space", ...where,
          title: "Leading whitespace is part of the pattern",
          detail: "Git does not trim the start of a line, so this rule looks for a name that begins with a space or tab. Remove the indentation." });
      }
      if (/\s#/.test(rule.text)) {
        out.push({ severity: "high", kind: "inline-comment", ...where,
          title: "Comments only work at the start of a line",
          detail: "A `#` after a pattern is not a comment: it becomes part of the name the rule looks for. Move the comment to its own line." });
      }
      if (/\\$/.test(rule.text) || (/\\[A-Za-z0-9_.-]/.test(rule.text) && !/\\[\[\]*?!# \\]/.test(rule.text))) {
        out.push({ severity: "high", kind: "backslash", ...where,
          title: "Backslash is an escape, not a path separator",
          detail: "In .gitignore a `\\` escapes the next character, even on Windows. Use `/` between directories." });
      }
      const p = rule.pattern;
      if (rule.anchored && /[^/]\*\*|\*\*[^/]/.test(p)) {
        out.push({ severity: "medium", kind: "starstar", ...where,
          title: "`**` next to other characters acts like `*`",
          detail: "`**` only crosses directories when it fills a whole path segment (`**/`, `/**/`, `/**`). Here it is glued to other characters, so it stops at the first `/`. Write `dir/**/*.ext` to reach every depth." });
      }
      if (unbalancedBracket(p)) {
        out.push({ severity: "high", kind: "bracket", ...where,
          title: "Unclosed `[` never matches",
          detail: "A `[` starts a character set that needs a closing `]`. Escape it as `\\[` to match a literal bracket." });
      }
    });
  }
  return out;
}

function unbalancedBracket(p) {
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "\\") { i++; continue; }
    if (p[i] === "[") {
      let j = i + 1;
      if (p[j] === "!" || p[j] === "^") j++;
      if (p[j] === "]") j++;
      while (j < p.length && p[j] !== "]") { if (p[j] === "\\") j++; j++; }
      if (j >= p.length) return true;
      i = j;
    }
  }
  return false;
}

function allDirs(entries) {
  const dirs = new Set();
  for (const e of entries) {
    if (e.isDir) dirs.add(e.path);
    let p = parentOf(e.path);
    while (p) { dirs.add(p); p = parentOf(p); }
  }
  return dirs;
}

function statusMap(files, entries, skip) {
  const explain = resolver(files, skip);
  const m = new Map();
  for (const e of entries) m.set(e.path, explain(e.path, e.isDir).ignored);
  return m;
}

// A fix for negations that cannot work because a parent directory is
// excluded: re-include each blocking directory with `!/dir/`, ignore its
// contents with `/dir/*`, then repeat the negation. Every candidate is run
// through the resolver, and only one that re-includes the intended paths is
// offered, with every other path it changes listed.
const escapeGlob = (s) => s.replace(/[*?[\\]/g, "\\$&");

function applyPatches(files, patches) {
  const patched = files.map((f) => {
    const p = patches.find((x) => x.file === f.path);
    if (!p) return f;
    return { ...f, lines: [...f.lines, "", "# re-include paths inside ignored directories (git never looks inside one)", ...p.lines] };
  });
  return compile(patched.map((f) => `==> ${f.path} <==\n${f.lines.join("\n")}`).join("\n"));
}

function assemble(dirs, negs) {
  const ordered = [...dirs].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return [...ordered.flatMap((d) => [`!/${d}/`, `/${d}/*`]), ...new Set(negs)];
}

// The candidate edit for one blocked negation if its fix goes in `file`.
function candidate(file, b) {
  const base = file.base;
  const rel = (d) => escapeGlob(base ? d.slice(base.length + 1) : d);
  const dirs = new Set();
  for (const x of b.blockers) {
    for (const p of x.paths) {
      let d = parentOf(p);
      while (d && d !== base && (!base || d.startsWith(base + "/"))) {
        if (d === x.dir || d.startsWith(x.dir + "/")) dirs.add(rel(d));
        d = parentOf(d);
      }
    }
  }
  if (!dirs.size) return null;
  const r = b.rule;
  let neg = null;
  if (r.source === file.path) neg = r.text;
  else if (r.base !== base && (!base || r.base.startsWith(base + "/"))) {
    // the negation sits in a file git never read: copy it here, anchored
    const where = rel(r.base);
    neg = r.anchored ? `!/${where}/${r.pattern}${r.dirOnly ? "/" : ""}` : `!/${where}/**/${r.pattern}${r.dirOnly ? "/" : ""}`;
  } else return null;
  return { file: file.path, dirs, negs: [neg] };
}

// A fix for negations that cannot work because a parent directory is
// excluded: re-include each blocking directory with `!/dir/`, ignore its
// contents with `/dir/*`, then repeat the negation. Each blocked negation
// gets the candidate file that works best for it (its own file, or the file
// of a rule that blocks it); the combined edit is then run through the
// resolver, and every path it changes beyond the intended ones is listed.
function proposeFix(files, entries, blocked, before) {
  if (!blocked.length) return null;
  const chosen = [];
  for (const b of blocked) {
    const names = new Set([b.rule.source, ...b.blockers.map((x) => x.rule.source)]);
    let best = null;
    for (const name of names) {
      const file = files.find((f) => f.path === name);
      if (!file || file.kind !== "dir") continue;
      const c = candidate(file, b);
      if (!c) continue;
      const after = statusMap(applyPatches(files, [{ file: c.file, lines: assemble(c.dirs, c.negs) }]), entries, null);
      const fixed = b.paths.filter((p) => !after.get(p)).length;
      const side = entries.filter((e) => !e.implied && !b.paths.includes(e.path) && before.get(e.path) !== after.get(e.path)).length;
      if (fixed && (!best || fixed > best.fixed || (fixed === best.fixed && side < best.side))) best = { c, fixed, side };
    }
    if (best) chosen.push(best.c);
  }
  if (!chosen.length) return null;
  const byFile = new Map();
  for (const c of chosen) {
    const cur = byFile.get(c.file) || { dirs: new Set(), negs: [] };
    for (const d of c.dirs) cur.dirs.add(d);
    cur.negs.push(...c.negs);
    byFile.set(c.file, cur);
  }
  const patches = [...byFile].map(([file, v]) => ({ file, lines: assemble(v.dirs, v.negs) }));
  const after = statusMap(applyPatches(files, patches), entries, null);
  const targets = new Set(blocked.flatMap((b) => b.paths));
  // a path inside a re-included folder coming back is the point, not a side effect
  const within = (p) => [...targets].some((t) => p.startsWith(t + "/"));
  const intended = (e) => within(e.path) && before.get(e.path) && !after.get(e.path);
  return {
    patches,
    fixed: [...targets, ...entries.filter((e) => !e.implied && !targets.has(e.path) && intended(e)).map((e) => e.path)].filter((p) => !after.get(p)),
    unfixed: [...targets].filter((p) => after.get(p)),
    sideEffects: entries.filter((e) => !e.implied && !targets.has(e.path) && !intended(e) && before.get(e.path) !== after.get(e.path))
      .map((e) => ({ path: e.path, before: before.get(e.path), after: after.get(e.path) })),
  };
}

export function analyze(input = {}) {
  const files = compile(input.sources ?? DEFAULTS.sources);
  const untracked = parsePaths(input.paths ?? DEFAULTS.paths);
  const tracked = parsePaths(input.tracked ?? DEFAULTS.tracked);
  const trackedSet = new Set(tracked.map((e) => e.path));
  const entries = [...tracked, ...untracked.filter((e) => !trackedSet.has(e.path))];
  // directories implied by the listed paths are checked too
  const listed = new Set(entries.map((e) => e.path));
  const dirEntries = [...allDirs(entries)].filter((d) => !listed.has(d)).map((d) => ({ path: d, isDir: true, implied: true }));
  const everything = [...entries, ...dirEntries];
  const rules = files.flatMap((f) => f.rules);
  const explain = resolver(files);

  const rows = entries.map((e) => {
    const x = explain(e.path, e.isDir);
    return { path: e.path, isDir: e.isDir, tracked: trackedSet.has(e.path), ignored: x.ignored, rule: describeRule(x.rule), via: x.via, own: describeRule(x.own) };
  });

  // per-rule tallies over every listed path and every implied directory
  const stats = new Map(rules.map((r) => [r.id, { decides: 0, matches: 0 }]));
  const matched = new Map(rules.map((r) => [r.id, []]));
  for (const e of everything) {
    const x = explain(e.path, e.isDir);
    if (!x.via && x.rule) stats.get(x.rule.id).decides++;
    for (const r of rules) {
      if (ruleMatches(r, e.path, e.isDir)) { stats.get(r.id).matches++; matched.get(r.id).push(e); }
    }
  }

  // what each rule changes: remove it and count listed paths that flip.
  // Only a path the rule matches, or one below a directory it matches, can.
  const before = statusMap(files, entries, null);
  const below = new Map();
  entries.forEach((e) => {
    for (let d = parentOf(e.path); d; d = parentOf(d)) {
      if (!below.has(d)) below.set(d, []);
      below.get(d).push(e);
    }
  });
  const effect = new Map();
  for (const r of rules) {
    const hits = matched.get(r.id);
    if (!hits.length) { effect.set(r.id, 0); continue; }
    const affected = new Set();
    for (const h of hits) {
      if (!h.implied) affected.add(h);
      if (h.isDir) for (const e of below.get(h.path) || []) affected.add(e);
    }
    const explainWithout = resolver(files, new Set([r.id]));
    let n = 0;
    for (const e of affected) if (before.get(e.path) !== explainWithout(e.path, e.isDir).ignored) n++;
    effect.set(r.id, n);
  }

  const findings = [];

  // negations defeated by an excluded parent directory
  const blockedByRule = new Map();
  // listed paths, and the folders they imply (`!build/assets/` under `build/`)
  const scan = [...rows, ...dirEntries.map((e) => {
    const x = explain(e.path, true);
    return { path: e.path, isDir: true, ignored: x.ignored, rule: describeRule(x.rule), via: x.via, own: describeRule(x.own) };
  })];
  const dirSet = new Set(everything.filter((e) => e.isDir).map((e) => e.path));
  for (const row of scan) {
    if (!row.via || !row.own || !row.own.negated) continue;
    const key = row.own.id;
    if (!blockedByRule.has(key)) blockedByRule.set(key, { rule: rules.find((r) => r.id === key), paths: [], blockers: new Map() });
    const b = blockedByRule.get(key);
    b.paths.push(row.path);
    const bk = `${row.via}|${row.rule.id}`;
    if (!b.blockers.has(bk)) b.blockers.set(bk, { dir: row.via, rule: rules.find((r) => r.id === row.rule.id), paths: [] });
    b.blockers.get(bk).paths.push(row.path);
  }
  const blocked = [...blockedByRule.values()].map((b) => ({ ...b, blockers: [...b.blockers.values()] }));
  for (const b of blocked) {
    const bl = b.blockers[0];
    findings.push({
      severity: "high", kind: "negation-blocked", source: b.rule.source, line: b.rule.line, text: b.rule.text,
      title: `\`${b.rule.text}\` cannot re-include ${plural(b.paths.length, "path")}`,
      detail: `Git never looks inside an ignored directory, so a \`!\` rule for a file inside one has no effect. \`${bl.dir}/\` is ignored by \`${bl.rule.text}\` (${bl.rule.source}:${bl.rule.line}).` +
        (b.blockers.length > 1 ? ` ${b.blockers.length - 1} other ignored ${b.blockers.length === 2 ? "directory blocks" : "directories block"} it too.` : "") +
        ` Ignore the directory's contents (\`dir/*\`) instead of the directory, or re-include each directory on the way down with \`!dir/\`.`,
      paths: b.paths.map((p) => (dirSet.has(p) ? p + "/" : p)),
    });
  }
  const fix = proposeFix(files, everything, blocked, statusMap(files, everything, null));

  // tracked files an ignore rule matches: .gitignore has no effect on them
  const trackedIgnored = rows.filter((r) => r.tracked && r.ignored);
  const byRule = new Map();
  for (const r of trackedIgnored) {
    const k = r.rule.id;
    if (!byRule.has(k)) byRule.set(k, { rule: r.rule, paths: [] });
    byRule.get(k).paths.push(r.path);
  }
  for (const { rule, paths } of byRule.values()) {
    findings.push({
      severity: "medium", kind: "tracked-ignored", source: rule.source, line: rule.line, text: rule.text,
      title: `${plural(paths.length, "tracked file")} ${paths.length === 1 ? "matches" : "match"} \`${rule.text}\` but ${paths.length === 1 ? "stays" : "stay"} tracked`,
      detail: "Ignore rules only apply to files git is not already tracking. These are committed, so changes to them still show up. To stop tracking them and keep them on disk: `git rm --cached <path>` and commit.",
      paths,
    });
  }

  const linted = lint(files);
  const blockedIds = new Set(blocked.map((b) => b.rule.id));
  const lintedIds = new Set(linted.map((l) => `${l.source}:${l.line}`));
  for (const r of rules) {
    const s = stats.get(r.id);
    const base = { source: r.source, line: r.line, text: r.text };
    if (blockedIds.has(r.id) || lintedIds.has(r.id)) continue;
    if (s.matches === 0) {
      findings.push({ severity: "info", kind: "unmatched", ...base,
        title: `\`${r.text}\` matches nothing in your list`,
        detail: (r.anchored && !r.pattern.startsWith("**/") && r.pattern.indexOf("/") > 0
          ? `It contains a \`/\`, so it only matches relative to ${r.base ? "`" + r.base + "/`" : "the repository root"}. To match at any depth, write \`**/${r.pattern}${r.dirOnly ? "/" : ""}\`. `
          : "") + "This may be fine: your list may not include a path it is meant for." });
    } else if (s.decides === 0 && effect.get(r.id) === 0) {
      findings.push({ severity: "low", kind: "shadowed", ...base,
        title: `\`${r.text}\` never decides anything`,
        detail: `It matches ${plural(s.matches, "path")}, but a later or deeper rule, or an ignored parent directory, decides each of them. Removing it changes nothing in your list. That is normal for a broad rule with exceptions (\`*.log\` then \`!keep.log\`) when your list holds only the exceptions; add untracked paths to see what it catches.` });
    } else if (effect.get(r.id) === 0) {
      findings.push({ severity: "low", kind: "redundant", ...base,
        title: `\`${r.text}\` is redundant in your list`,
        detail: `It decides ${plural(s.decides, "path")}, but another rule would decide every one of them the same way. Removing it changes nothing in your list.` });
    }
  }

  findings.push(...linted);
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    files: files.map((f) => ({ path: f.path, kind: f.kind, base: f.base, rules: f.rules.length })),
    rules: rules.map((r) => ({ id: r.id, source: r.source, line: r.line, text: r.text, negated: r.negated, dirOnly: r.dirOnly, anchored: r.anchored, ...stats.get(r.id), effect: effect.get(r.id) })),
    paths: rows,
    findings,
    fix,
    totals: {
      paths: rows.length,
      ignored: rows.filter((r) => r.ignored).length,
      tracked: tracked.length,
      trackedIgnored: trackedIgnored.length,
      blockedNegations: blocked.length,
      rules: rules.length,
    },
  };
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Why is one path ignored (or not)? The step-by-step reasoning git applies.
export function why(input = {}) {
  const files = compile(input.sources ?? DEFAULTS.sources);
  const raw = String(input.path ?? "").trim();
  const isDir = raw.endsWith("/");
  const path = normalisePath(raw).replace(/\/+$/, "");
  if (!path) return { path: "", steps: [], ignored: false };
  const explain = resolver(files);
  const steps = [];
  const parts = path.split("/");
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur ? `${cur}/${parts[i]}` : parts[i];
    const x = explain(cur, true);
    steps.push({ path: cur + "/", ignored: x.ignored, rule: describeRule(x.rule), inherited: !!x.via && x.via !== cur });
    if (x.ignored) {
      steps.push({ path: raw, ignored: true, rule: describeRule(x.rule), inherited: true, note: `Git never looks inside ${cur}/, so no rule about anything below it is read.` });
      return { path, steps, ignored: true, rule: describeRule(x.rule), via: cur };
    }
  }
  const x = explain(path, isDir);
  steps.push({ path: raw, ignored: x.ignored, rule: describeRule(x.rule), inherited: false });
  return { path, steps, ignored: x.ignored, rule: describeRule(x.rule), via: null };
}

export function reportCsv(result) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["path,tracked,ignored,deciding_rule,source,line,via_directory"];
  for (const r of result.paths) {
    lines.push([q(r.path), r.tracked, r.ignored, q(r.rule?.text ?? ""), q(r.rule?.source ?? ""), r.rule?.line ?? "", q(r.via ?? "")].join(","));
  }
  return lines.join("\n") + "\n";
}

export const DEFAULTS = {
  sources: [
    "# build output",
    "build/",
    "!build/keep.txt",
    "*.log",
    "!important.log",
    "node_modules/",
    ".env",
    "docs/*.pdf",
    "coverage   # test coverage",
    "",
    "==> packages/web/.gitignore <==",
    "dist",
    "!dist/robots.txt",
    "*.log",
  ].join("\n"),
  paths: [
    "build/keep.txt",
    "build/app.js",
    "debug.log",
    "important.log",
    "packages/web/dist/robots.txt",
    "packages/web/dist/main.js",
    "packages/web/src/docs/guide.pdf",
    "docs/manual.pdf",
    "coverage/index.html",
    "src/index.js",
  ].join("\n"),
  tracked: [
    ".env",
    "README.md",
    "package.json",
  ].join("\n"),
};
