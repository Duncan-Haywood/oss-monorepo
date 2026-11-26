// gitconfig include checker engine: reads git config files the way git 2.43+
// does (config.c: git_parse_source, get_value, parse_value, the include and
// includeIf handling in git_config_include, include_by_gitdir,
// include_by_branch, include_by_remote_url and interpolate_path), and says
// which [include] and [includeIf] lines took effect, which did not and why,
// and which file and line every value in the final config came from.
//
// Written from git's documented behaviour and checked against
// `git config --list --show-origin --show-scope` on random config trees
// (gitconfig.diff.test.mjs); no git source is copied. The wildmatch port is
// this repository's own, from ventures/gitignore-explainer (MIT).
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

// WM_CASEFOLD, as gitdir/i: uses it: ASCII letters compare without case.
// Lowering both sides is git's behaviour for everything except a bracket
// range whose ends straddle the letters (`[Z-a]`), which no real pattern uses.
const lowerAscii = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
function wildmatchFold(pattern, text, casefold) {
  return casefold ? wildmatch(lowerAscii(pattern), lowerAscii(text)) : wildmatch(pattern, text);
}

// ------------------------------------------------------------------ parsing

const isSpace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";
const isAlpha = (c) => c !== undefined && /^[A-Za-z]$/.test(c);
const isKeyChar = (c) => c !== undefined && /^[A-Za-z0-9-]$/.test(c);

class ParseError extends Error {
  constructor(line, reason) { super(reason); this.line = line; this.reason = reason; }
}

// Parse one config file into its entries, in order. Each entry is
// { key, value, line, section, subsection, name } with value null for a bare
// `key` line (a boolean true). A line git refuses to read ends the list with
// `error: { line, reason }`, and git stops there with
// "fatal: bad config line N in file F".
export function parseConfig(text) {
  let s = String(text ?? "");
  if (s.startsWith("\uFEFF")) s = s.slice(1);
  let pos = 0, linenr = 1, eof = false;
  const next = () => {
    if (pos >= s.length) { if (!eof) { eof = true; linenr++; } return "\n"; }
    let c = s[pos++];
    if (c === "\r" && s[pos] === "\n") { pos++; c = "\n"; }
    if (c === "\n") linenr++;
    return c;
  };
  const entries = [];
  let section = "", subsection = null, base = "";
  let comment = false;
  const fail = (reason, line = linenr) => { throw new ParseError(line, reason); };
  try {
    for (;;) {
      let c = next();
      if (c === "\n") { if (eof) break; comment = false; continue; }
      if (comment || isSpace(c)) continue;
      if (c === "#" || c === ";") { comment = true; continue; }
      if (c === "[") {
        // section header
        let name = "";
        let sub = null;
        for (;;) {
          c = next();
          if (eof) fail("the file ends inside a [section] header");
          if (isSpace(c)) {
            // [name "subsection"]
            do {
              if (c === "\n") fail("a [section] header runs past the end of the line", linenr - 1);
              c = next();
            } while (isSpace(c));
            if (c !== "\"") fail("a [section \"subsection\"] header needs the subsection in double quotes");
            sub = "";
            for (;;) {
              c = next();
              if (c === "\n") fail("a subsection name runs past the end of the line", linenr - 1);
              if (c === "\"") break;
              if (c === "\\") {
                c = next();
                if (c === "\n") fail("a subsection name runs past the end of the line", linenr - 1);
              }
              sub += c;
            }
            if (next() !== "]") fail("a [section \"subsection\"] header must end with \"] right after the closing quote");
            break;
          }
          if (c === "]") break;
          if (!isKeyChar(c) && c !== ".") fail(`"${c}" is not allowed in a section name (letters, digits, - and . only)`);
          name += c.toLowerCase();
        }
        section = name;
        subsection = sub;
        base = sub === null ? name : `${name}.${sub}`;
        continue;
      }
      if (!isAlpha(c)) fail(`a setting name must start with a letter, not "${c}"`);
      // key
      const startLine = linenr;
      let key = c.toLowerCase();
      for (;;) {
        c = next();
        if (eof) break;
        if (!isKeyChar(c)) break;
        key += c.toLowerCase();
      }
      while (c === " " || c === "\t") c = next();
      let value = null;
      if (c !== "\n") {
        if (c !== "=") fail(`"${c}" after the setting name "${key}"; only = or the end of the line may follow it`);
        // value
        let quote = false, inComment = false, trimLen = 0, v = "";
        for (;;) {
          c = next();
          if (c === "\n") {
            if (quote) fail("a value has an opening double quote with no closing one", linenr - 1);
            if (trimLen) v = v.slice(0, trimLen);
            break;
          }
          if (inComment) continue;
          if (isSpace(c) && !quote) {
            if (v.length) { if (!trimLen) trimLen = v.length; v += " "; }
            continue;
          }
          if (!quote && (c === ";" || c === "#")) { inComment = true; continue; }
          if (trimLen) trimLen = 0;
          if (c === "\\") {
            c = next();
            if (c === "\n") continue;
            if (c === "t") c = "\t";
            else if (c === "b") c = "\b";
            else if (c === "n") c = "\n";
            else if (c !== "\\" && c !== "\"") fail(`"\\${c}" is not an escape git knows (only \\n, \\t, \\b, \\\\ and \\")`, linenr);
            v += c;
            continue;
          }
          if (c === "\"") { quote = !quote; continue; }
          v += c;
        }
        value = v;
      }
      // git points at the entry's own line: the newline that ended it has
      // already been read.
      const line = linenr - 1;
      entries.push({ name: base ? `${base}.${key}` : key, section, subsection, key, value, line, startLine });
    }
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    return { entries, error: { line: e.line, reason: e.reason } };
  }
  return { entries, error: null };
}

// git's parse_config_key: "includeif.<cond>.path" -> { section, sub, key }.
// The section is lowercased already; the subsection is everything between
// the first and the last dot.
function splitName(name) {
  const first = name.indexOf(".");
  if (first < 0) return { section: name, sub: null, key: "" };
  const last = name.lastIndexOf(".");
  return {
    section: name.slice(0, first),
    sub: last > first ? name.slice(first + 1, last) : null,
    key: name.slice(last + 1),
  };
}

// ------------------------------------------------------------------ paths

export function normalizePath(p) {
  const abs = p.startsWith("/");
  const out = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") { if (out.length) out.pop(); continue; }
    out.push(part);
  }
  return (abs ? "/" : "") + out.join("/");
}
const dirOf = (p) => { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i + 1); };

// interpolate_path: a leading ~ or ~/ becomes $HOME. ~user/ needs the
// password database, which a browser cannot read: returned as { user }.
function interpolate(path, home) {
  if (path[0] !== "~") return { path };
  const slash = path.indexOf("/");
  const user = slash < 0 ? path.slice(1) : path.slice(1, slash);
  const rest = slash < 0 ? "" : path.slice(slash);
  if (user === "") return { path: home + rest };
  return { user, path };
}

// prepare_include_condition_pattern + add_trailing_starstar_for_dir.
function gitdirPattern(cond, configPath, home) {
  const steps = [];
  let pat = cond;
  const interp = interpolate(pat, home);
  if (interp.user) return { error: `~${interp.user} names another user's home folder, which this tool cannot look up` };
  if (interp.path !== pat) steps.push(`~ becomes ${home}`);
  pat = interp.path;
  let prefix = 0;
  if (pat[0] === "." && pat[1] === "/") {
    if (!configPath) return { error: "relative config include conditionals must come from files" };
    const dir = dirOf(configPath).replace(/\/$/, "");
    pat = dir + pat.slice(1);
    prefix = dir.length + 1;
    steps.push(`./ becomes the folder of the file it is in, ${dir}/`);
  } else if (pat[0] !== "/") {
    pat = "**/" + pat;
    steps.push("not absolute, so git puts **/ in front: it matches at any depth");
  }
  if (pat.endsWith("/")) { pat += "**"; steps.push("ends in /, so git adds ** and it matches everything inside"); }
  return { pattern: pat, prefix, steps };
}

function matchGitdir(pp, texts, icase) {
  for (const text of texts) {
    if (pp.prefix > 0) {
      if (text.length < pp.prefix) continue;
      const a = pp.pattern.slice(0, pp.prefix), b = text.slice(0, pp.prefix);
      if (icase ? lowerAscii(a) !== lowerAscii(b) : a !== b) continue;
    }
    if (wildmatchFold(pp.pattern.slice(pp.prefix), text.slice(pp.prefix), icase)) return text;
  }
  return null;
}

const KNOWN_CONDITIONS = ["gitdir:", "gitdir/i:", "onbranch:", "hasconfig:remote.*.url:"];
const MAX_INCLUDE_DEPTH = 10;

// ------------------------------------------------------------------ sources

export function splitSources(text, home = "~") {
  const raw = String(text ?? "");
  const lines = raw.split("\n");
  const files = [];
  let current = null;
  for (const line of lines) {
    const m = /^==>\s*(.+?)\s*<==\s*$/.exec(line.replace(/\r$/, ""));
    if (m) { current = { path: m[1], lines: [] }; files.push(current); continue; }
    if (!current) {
      if (line.trim() === "" ) continue;
      current = { path: "~/.gitconfig", lines: [] };
      files.push(current);
    }
    current.lines.push(line);
  }
  return files.map((f) => ({ path: f.path, text: f.lines.join("\n") }));
}

function expandHeaderPath(p, home) {
  if (p === "~") return home;
  if (p.startsWith("~/")) return home + p.slice(1);
  return p;
}

// ------------------------------------------------------------------ engine

class Fatal extends Error {
  constructor(message, file, line, reason = null) { super(message); this.file = file; this.line = line; this.reason = reason; }
}

function isSingleValued(name) {
  return !(
    /^include\.path$/.test(name) ||
    /^includeif\..*\.path$/.test(name) ||
    /^credential\.(.*\.)?helper$/.test(name) ||
    /^remote\..*\.(fetch|push|url|pushurl)$/.test(name) ||
    /^url\..*\.(insteadof|pushinsteadof)$/.test(name) ||
    /^safe\.directory$/.test(name) ||
    /^http\.(.*\.)?extraheader$/.test(name) ||
    /^branch\..*\.merge$/.test(name) ||
    /^log\.excludedecoration$/.test(name)
  );
}

export const IDENTITY_KEYS = ["user.name", "user.email", "user.signingkey", "gpg.format", "commit.gpgsign", "tag.gpgsign", "core.sshcommand", "user.useconfigonly"];

// The repository context the conditions are evaluated in.
function context(input) {
  const home = (input.home || "/home/you").replace(/\/+$/, "") || "/";
  let gitdir = input.gitdir ? expandHeaderPath(String(input.gitdir).trim(), home) : null;
  const repo = input.repo ? expandHeaderPath(String(input.repo).trim(), home).replace(/\/+$/, "") : null;
  if (!gitdir && repo) gitdir = repo.endsWith("/.git") || /\.git$/.test(repo) && input.bare ? repo : repo + "/.git";
  if (gitdir) gitdir = normalizePath(gitdir);
  const realGitdir = input.realGitdir ? normalizePath(expandHeaderPath(String(input.realGitdir).trim(), home)) : gitdir;
  let commondir = gitdir;
  const wt = gitdir && /^(.*)\/worktrees\/[^/]+$/.exec(gitdir);
  if (wt) commondir = wt[1];
  if (input.commondir) commondir = normalizePath(expandHeaderPath(input.commondir, home));
  const branch = input.branch === undefined ? "main" : (input.branch === null ? "" : String(input.branch).trim().replace(/^refs\/heads\//, ""));
  const xdg = input.xdgConfigHome ? expandHeaderPath(input.xdgConfigHome, home).replace(/\/+$/, "") : home + "/.config";
  return { home, gitdir, realGitdir, commondir, branch, xdg, worktree: Boolean(wt), system: input.systemPath || "/etc/gitconfig" };
}

function fileMap(input, ctx) {
  const list = Array.isArray(input.files) ? input.files : splitSources(input.files ?? input.sources ?? "", ctx.home);
  const map = new Map();
  for (const f of list) {
    const path = normalizePath(expandHeaderPath(String(f.path).trim(), ctx.home));
    map.set(path, { path, text: String(f.text ?? ""), parsed: parseConfig(f.text ?? "") });
  }
  if (ctx.gitdir && Array.isArray(input.remotes) && input.remotes.length) {
    const local = normalizePath(ctx.commondir + "/config");
    if (!map.has(local)) {
      const text = input.remotes.map((u, i) => `[remote "${i === 0 ? "origin" : "remote" + i}"]\n\turl = ${u}`).join("\n");
      map.set(local, { path: local, text, parsed: parseConfig(text), synthetic: true });
    }
  }
  return map;
}

function topLevel(ctx, files) {
  const tops = [];
  const sys = normalizePath(ctx.system);
  const has = (p) => files.has(normalizePath(p));
  for (const p of files.keys()) if (p.endsWith("/etc/gitconfig") && p !== sys && !tops.some((t) => t.path === p)) tops.push({ path: p, scope: "system" });
  if (has(sys)) tops.unshift({ path: sys, scope: "system" });
  tops.push({ path: normalizePath(ctx.xdg + "/git/config"), scope: "global" });
  tops.push({ path: normalizePath(ctx.home + "/.gitconfig"), scope: "global" });
  if (ctx.gitdir) {
    tops.push({ path: normalizePath(ctx.commondir + "/config"), scope: "local" });
    tops.push({ path: normalizePath(ctx.gitdir + "/config.worktree"), scope: "worktree", needsExtension: true });
  }
  return tops;
}

// extensions.worktreeConfig comes from the shared .git/config itself (git
// reads the repository format before any include), last value wins.
function worktreeConfigOn(ctx, files) {
  const f = files.get(normalizePath(ctx.commondir + "/config"));
  if (!f) return false;
  const e = f.parsed.entries.filter((x) => x.name === "extensions.worktreeconfig").pop();
  return e ? boolValue(e.value) === true : false;
}

// Run git's reading sequence. mode "list" collects every entry with its
// origin; mode "urls" is populate_remote_urls, the hidden first pass a
// hasconfig:remote.*.url: condition triggers.
function readAll(ctx, files, mode, state) {
  const out = mode === "list" ? state.entries : [];
  const tops = topLevel(ctx, files);
  for (const top of tops) {
    if (top.needsExtension && !worktreeConfigOn(ctx, files)) continue;
    const f = files.get(top.path);
    if (!f) continue;
    readFile(f, top.path, top.scope, [], mode === "urls" ? "collect" : "emit");
  }
  return out;

  function readFile(f, shownPath, scope, chain, fn) {
    const { entries, error } = f.parsed;
    for (const e of entries) {
      const parts = splitName(e.name);
      if (fn === "forbid") {
        if (parts.section === "remote" && parts.sub !== null && parts.key === "url")
          throw new Fatal("remote URLs cannot be configured in file directly or indirectly included by includeIf.hasconfig:remote.*.url", shownPath, e.line);
      } else if (fn === "collect") {
        if (parts.section === "remote" && parts.sub !== null && parts.key === "url" && e.value !== null) state.urls.push(e.value);
      } else {
        out.push({ scope, file: shownPath, line: e.line, key: e.name, value: e.value, chain });
      }
      if (e.name === "include.path") {
        handleInclude(e, f, shownPath, scope, chain, fn, { kind: "include", condition: null, matched: true });
      } else if (parts.section === "includeif" && parts.sub !== null) {
        const verdict = condition(parts.sub, shownPath, mode);
        if (mode === "list" && parts.key === "path") {
          let target = null;
          if (e.value !== null) {
            const ip = interpolate(e.value, ctx.home);
            if (!ip.user) target = ip.path.startsWith("/") ? ip.path : dirOf(shownPath) + ip.path;
          }
          state.directives.push({ file: shownPath, line: e.line, scope, kind: "includeIf", condition: parts.sub, path: e.value, target, found: target ? files.has(normalizePath(target)) : false, ...verdict, chain });
        }
        if (verdict.matched && parts.key === "path") {
          const inner = mode === "urls" ? "forbid" : fn;
          handleInclude(e, f, shownPath, scope, chain, inner, null, true);
        } else if (mode === "list" && parts.key !== "path") {
          state.misc.push({ type: "includeif-not-path", file: shownPath, line: e.line, key: e.name });
        }
      } else if (parts.section === "include" && mode === "list" && e.name !== "include.path") {
        state.misc.push({ type: "include-not-path", file: shownPath, line: e.line, key: e.name });
      }
    }
    if (error) throw new Fatal(`bad config line ${error.line} in file ${shownPath}`, shownPath, error.line, error.reason);
  }

  function handleInclude(e, f, shownPath, scope, chain, fn, directive, conditional) {
    if (directive && mode === "list") {
      directive = { file: shownPath, line: e.line, scope, kind: "include", condition: null, path: e.value, matched: true, chain };
      state.directives.push(directive);
    }
    const record = mode === "list" ? state.directives[state.directives.length - 1] : null;
    if (e.value === null) throw new Fatal("missing value for 'include.path'", shownPath, e.line, "an include path line with no = value");
    const interp = interpolate(e.value, ctx.home);
    if (interp.user) {
      if (record) { record.target = null; record.found = false; record.note = `~${interp.user}/ is another user's home folder; this tool cannot look it up, so the include was skipped here (git would read it if that file exists)`; }
      return;
    }
    let target = interp.path;
    if (!target.startsWith("/")) target = dirOf(shownPath) + target;
    const key = normalizePath(target);
    const inc = files.get(key);
    if (record) { record.target = target; record.found = Boolean(inc); }
    if (!inc) return;
    const depth = chain.length + 1;
    if (depth > MAX_INCLUDE_DEPTH) throw new Fatal(`exceeded maximum include depth (${MAX_INCLUDE_DEPTH}) while including ${target} from ${shownPath}; this might be due to circular includes`, shownPath, e.line);
    if (record) record.read = true;
    readFile(inc, target, scope, [...chain, { file: shownPath, line: e.line, condition: conditional ? splitName(e.name).sub : null }], fn);
  }

  function condition(cond, configPath, passMode) {
    let m;
    if ((m = /^gitdir(\/i)?:/.exec(cond))) {
      const icase = Boolean(m[1]);
      const raw = cond.slice(m[0].length);
      if (!ctx.gitdir) return { matched: false, type: m[0], reason: "not inside a repository, so no gitdir: condition can match" };
      const pp = gitdirPattern(raw, configPath, ctx.home);
      if (pp.error) {
        if (/must come from files/.test(pp.error)) throw new Fatal(pp.error, configPath, 0);
        return { matched: false, type: m[0], reason: pp.error, unknown: true };
      }
      const texts = [...new Set([ctx.realGitdir, ctx.gitdir])];
      const hit = matchGitdir(pp, texts, icase);
      // git tries the resolved path first and then the path as typed, but it
      // only knows the typed path when it runs in the top folder of the work
      // tree with $PWD naming it (strbuf_add_absolute_path); from a
      // subfolder, with git -C, or from most tools it sees the real path only.
      const onlyLogical = Boolean(hit) && hit !== ctx.realGitdir;
      return { matched: Boolean(hit), onlyLogical, type: m[0], pattern: pp.pattern, steps: pp.steps, against: texts, reason: hit ? `${pp.pattern} matches ${hit}` : `${pp.pattern} does not match ${texts.join(" or ")}`, icase, raw };
    }
    if (cond.startsWith("onbranch:")) {
      const raw = cond.slice("onbranch:".length);
      if (!ctx.gitdir) return { matched: false, type: "onbranch:", reason: "not inside a repository", raw };
      if (!ctx.branch) return { matched: false, type: "onbranch:", reason: "HEAD is detached (no branch checked out), so no onbranch: condition can match", raw };
      let pat = raw;
      if (pat.endsWith("/")) pat += "**";
      const hit = wildmatch(pat, ctx.branch);
      return { matched: hit, type: "onbranch:", pattern: pat, raw, reason: `${pat} ${hit ? "matches" : "does not match"} the branch ${ctx.branch}` };
    }
    if (cond.startsWith("hasconfig:remote.*.url:")) {
      const raw = cond.slice("hasconfig:remote.*.url:".length);
      if (passMode === "urls") return { matched: true, type: "hasconfig:remote.*.url:", raw };
      if (!state.urls) {
        state.urls = [];
        state.urlPass = true;
        readAll(ctx, files, "urls", state);
      }
      // No trailing-slash "**" here: git adds it for gitdir: and onbranch: only
      // (config.c include_by_remote_url matches the pattern as written).
      const pat = raw;
      const hit = state.urls.find((u) => wildmatch(pat, u));
      return { matched: hit !== undefined, type: "hasconfig:remote.*.url:", pattern: pat, raw, urls: [...state.urls], reason: hit !== undefined ? `${pat} matches the remote URL ${hit}` : state.urls.length ? `${pat} matches none of the remote URLs (${state.urls.join(", ")})` : `${pat} has no remote URL to match: no remote.<name>.url is set outside conditional includes` };
    }
    return { matched: false, type: null, unknown: true, reason: `"${cond}" is not a condition git knows (it knows ${KNOWN_CONDITIONS.join(", ")}, case-sensitive), so git treats it as false and says nothing` };
  }
}

export function boolValue(v) {
  if (v === null) return true;
  const s = String(v).toLowerCase();
  if (["true", "yes", "on", "1"].includes(s)) return true;
  if (["false", "no", "off", "0", ""].includes(s)) return false;
  if (/^-?\d+$/.test(s)) return Number(s) !== 0;
  return undefined;
}

// git config --list --show-origin --show-scope, as text.
export function listing(result) {
  return result.entries.map((e) => `${e.scope}\tfile:${e.file}\t${e.key}${e.value === null ? "" : "=" + e.value}`).join("\n");
}

// ------------------------------------------------------------------ analysis

const SEVERITY_ORDER = new Map([["error", 0], ["high", 1], ["medium", 2], ["low", 3], ["info", 4]]);

function nearestCondition(cond) {
  const lower = cond.toLowerCase().replace(/\s+/g, "");
  if (lower.startsWith("gitdir/i:")) return "gitdir/i:" + cond.slice(cond.indexOf(":") + 1).trim();
  if (lower.startsWith("gitdir:") || lower.startsWith("gitdir=") || lower.startsWith("gitdir ")) return "gitdir:" + cond.slice(cond.search(/[:=\s]/) + 1).trim();
  if (lower.startsWith("onbranch:")) return "onbranch:" + cond.slice(cond.indexOf(":") + 1).trim();
  if (lower.startsWith("hasconfig:")) {
    const m = /url:(.*)$/i.exec(cond);
    return "hasconfig:remote.*.url:" + (m ? m[1].trim() : "<pattern>");
  }
  if (lower.startsWith("branch:")) return "onbranch:" + cond.slice(cond.indexOf(":") + 1).trim();
  return null;
}

const where = (d) => `${d.file}:${d.line}`;

function gitdirHints(d, ctx) {
  const out = [];
  const raw = d.raw ?? "";
  if (/^\s/.test(raw) || /\s$/.test(raw)) out.push({ kind: "condition-whitespace", severity: d.matched ? "low" : "high",
    title: "Space inside the condition",
    detail: `git keeps the space in "${d.condition}" as part of the pattern${/^\s/.test(raw) ? `, and a pattern that no longer starts with ~ or / gets **/ put in front` : ""}, so it does not mean what it looks like. Write [includeIf "gitdir:${raw.trim()}"].` });
  if (raw.includes("\\")) out.push({ kind: "gitdir-backslash", severity: d.matched ? "low" : "high",
    title: "Backslash in a gitdir: pattern",
    detail: "In git's patterns a backslash escapes the next character; it is not a folder separator. Use forward slashes, also on Windows (gitdir:C:/Users/you/work/)." });
  if (/\$\w|\$\{|%\w+%/.test(raw)) out.push({ kind: "gitdir-env-var", severity: d.matched ? "low" : "high",
    title: "Environment variable in a gitdir: pattern",
    detail: "git does not expand $HOME, ${VAR} or %USERPROFILE% in conditions; only a leading ~/ and ./ are special. Write gitdir:~/work/." });
  if (d.matched || !d.pattern || !ctx.gitdir) return out;
  const trimmed = raw.trim();
  if (!trimmed.endsWith("/") && !/\*\*$/.test(trimmed)) {
    const pp = gitdirPattern(trimmed + "/", d.file, ctx.home);
    const hit = pp.pattern && matchGitdir(pp, [ctx.realGitdir, ctx.gitdir], d.icase);
    const workTree = ctx.gitdir.replace(/\/\.git$/, "");
    const pp0 = gitdirPattern(trimmed, d.file, ctx.home);
    const namesWorkTree = pp0.pattern && !ctx.worktree && matchGitdir(pp0, [workTree], d.icase);
    if (namesWorkTree) out.push({ kind: "gitdir-names-work-tree", severity: "high",
      title: "gitdir: names the work tree, not the .git folder",
      detail: `git compares the pattern with the repository's .git folder (${ctx.gitdir}), not the folder you cd into. Write gitdir:${trimmed}/ (with the slash it matches everything inside, .git included).` });
    else if (hit) out.push({ kind: "gitdir-no-trailing-slash", severity: "high",
      title: "No trailing slash, so it only matches one exact .git folder",
      detail: `Without a trailing / the pattern must equal the whole .git path; it never matches repositories inside the folder. With the slash, gitdir:${trimmed}/ would match ${hit}.` });
  }
  if (!d.icase) {
    const ci = matchGitdir(gitdirPattern(raw.trim(), d.file, ctx.home), [ctx.realGitdir, ctx.gitdir], true);
    if (ci) out.push({ kind: "gitdir-case", severity: "medium",
      title: "Matches only if case is ignored",
      detail: `The pattern differs from ${ci} only in upper and lower case. On macOS and Windows the file system does not care but git does: use gitdir/i:${raw.trim()}.` });
  }
  return out;
}

export function analyze(input = {}) {
  const ctx = context(input);
  const files = fileMap(input, ctx);
  const state = { entries: [], directives: [], misc: [], urls: null };
  let fatal = null;
  // Every git command starts by reading the system and global files once
  // with no repository (trace2's read_very_early_config): gitdir: and
  // onbranch: are false there, and a bad line in those files stops git
  // before the repository is even looked at.
  try {
    readAll({ ...ctx, gitdir: null, realGitdir: null, branch: "" }, files, "list", { entries: [], directives: [], misc: [], urls: null });
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    fatal = { message: e.message, file: e.file, line: e.line, reason: e.reason, early: true };
  }
  // Then git checks the repository format by parsing .git/config on its
  // own, without following includes: a bad line there stops git next.
  const localFile = ctx.gitdir && files.get(normalizePath(ctx.commondir + "/config"));
  if (!fatal && localFile && localFile.parsed.error) {
    const { line, reason } = localFile.parsed.error;
    fatal = { message: `bad config line ${line} in file ${localFile.path}`, file: localFile.path, line, reason };
  }
  try {
    readAll(ctx, files, "list", state);
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    if (!fatal) fatal = { message: e.message, file: e.file, line: e.line, reason: e.reason };
  }
  const entries = state.entries;
  entries.forEach((e, i) => { e.index = i; });

  // the last value of each key wins
  const last = new Map();
  for (const e of entries) last.set(e.key, e);
  const effective = Object.create(null);
  for (const [k, e] of last) effective[k] = { value: e.value, file: e.file, line: e.line, scope: e.scope, via: e.chain.map((c) => `${c.file}:${c.line}`) };
  const identity = IDENTITY_KEYS.filter((k) => last.has(k)).map((k) => ({ key: k, ...effective[k] }));

  const findings = [];
  const add = (f) => findings.push(f);
  if (fatal) add({ severity: "error", kind: "git-stops", file: fatal.file, line: fatal.line,
    title: `git stops: ${fatal.message.split(";")[0]}`,
    detail: `${fatal.reason ? fatal.reason[0].toUpperCase() + fatal.reason.slice(1) + ". " : ""}Every git command in this repository fails with "fatal: ${fatal.message}" until the line is fixed. Settings below are the ones read before git stopped.` });

  for (const d of state.directives) {
    d.where = where(d);
    if (d.kind === "includeIf") {
      if (d.unknown && d.type === null) {
        const near = nearestCondition(d.condition);
        add({ severity: "high", kind: "unknown-condition", file: d.file, line: d.line,
          title: "Condition git does not know, so the include never happens",
          detail: `${d.reason}.${near ? ` Did you mean [includeIf "${near}"]?` : ""}` });
      } else if (d.unknown) {
        add({ severity: "medium", kind: "cannot-evaluate", file: d.file, line: d.line, title: "This tool cannot evaluate the condition", detail: d.reason });
      }
      if (d.type === "gitdir:" || d.type === "gitdir/i:") for (const h of gitdirHints(d, ctx)) add({ ...h, file: d.file, line: d.line });
      if (d.onlyLogical) add({ severity: "high", kind: "gitdir-symlink", file: d.file, line: d.line,
        title: "Matches only through a symlink, so only sometimes",
        detail: `${d.pattern} matches the path as you gave it (${ctx.gitdir}) but not the real one (${ctx.realGitdir}). git uses the typed path only when it runs in the top folder of the repository from a shell that changed into it through the link; from a subfolder, with git -C, or from an editor, hook or GUI it sees the real path and skips this include. Add a second [includeIf] for the real location, for example gitdir:${ctx.realGitdir.replace(/\/[^/]+\/\.git$/, "/")}.` });
      if (d.type === "gitdir:" && d.matched && d.raw && !/^(~|\/|\.\/)/.test(d.raw) && !/^\*\*/.test(d.raw)) add({ severity: "low", kind: "gitdir-relative", file: d.file, line: d.line,
        title: "Relative gitdir: pattern matches at any depth",
        detail: `git puts **/ in front of a pattern that does not start with ~/, / or ./, so ${d.condition} matches any repository below a folder of that name anywhere on disk (${d.pattern}). Anchor it with ~/ if that is not what you want.` });
      if (d.type === "onbranch:") {
        if (/^refs\/(heads\/)?/.test(d.raw)) add({ severity: d.matched ? "low" : "high", kind: "onbranch-refs-prefix", file: d.file, line: d.line,
          title: "onbranch: compares the short branch name",
          detail: `git matches the pattern against the branch name without refs/heads/ (for example main), so "${d.raw}" never matches. Write onbranch:${d.raw.replace(/^refs\/(heads\/)?/, "")}.` });
        if (!ctx.branch && ctx.gitdir) add({ severity: "info", kind: "onbranch-detached", file: d.file, line: d.line,
          title: "onbranch: never matches on a detached HEAD",
          detail: "With no branch checked out (CI checkouts of a commit or pull request, git bisect, the middle of a rebase) git skips every onbranch: include. Settings that must hold in CI belong in an unconditional file." });
      }
      if (d.type === "hasconfig:remote.*.url:" && d.matched === false && d.urls && d.urls.length) {
        const ssh = d.urls.some((u) => /^[\w.-]+@[\w.-]+:/.test(u) || /^ssh:/.test(u));
        const httpsPat = /^https?:/.test(d.raw);
        if (ssh && httpsPat || !ssh && /^[\w.-]+@|^ssh:/.test(d.raw)) add({ severity: "medium", kind: "hasconfig-scheme", file: d.file, line: d.line,
          title: "The pattern and the remote use different URL forms",
          detail: `git compares the remote URL as written; ${d.raw} and ${d.urls.join(", ")} differ in scheme (SSH git@host:path versus https://host/path). Add a second [includeIf] for the other form.` });
      }
    }
    if (d.matched && d.path !== null && d.path !== undefined) {
      if (d.found === false && d.target) add({ severity: d.kind === "includeIf" ? "high" : "medium", kind: "include-target-missing", file: d.file, line: d.line,
        title: d.kind === "includeIf" ? "Condition matched, but the file it names was not given" : "Included file was not given",
        detail: `git reads ${d.target}${d.path !== d.target ? ` (from path = ${d.path})` : ""} if it exists and skips it without a word if it does not. Paste it as ==> ${d.target} <== if it exists; if it does not, that is why its settings are missing.` });
      if (/\$\w|\$\{|%\w+%/.test(d.path)) add({ severity: "high", kind: "include-env-var", file: d.file, line: d.line,
        title: "Environment variable in an include path",
        detail: `git does not expand variables in include paths, so it looks for a file literally named ${d.target ?? d.path}. Use ~/ for your home folder, or a path relative to this file.` });
      if (d.note) add({ severity: "medium", kind: "cannot-evaluate", file: d.file, line: d.line, title: "Include not followed", detail: d.note });
    }
  }

  for (const m of state.misc) {
    if (m.type === "includeif-not-path") add({ severity: "high", kind: "includeif-not-path", file: m.file, line: m.line,
      title: `"${m.key.split(".").pop()}" does nothing under [includeIf]`,
      detail: `Only a key called path makes git include a file; ${m.key} is stored and ignored. Write path = <file>.` });
    if (m.type === "include-not-path") add({ severity: "high", kind: "include-not-path", file: m.file, line: m.line,
      title: `${m.key} is not an include`,
      detail: `Only include.path (no subsection) and includeIf.<condition>.path include a file; ${m.key} is stored and ignored. ${/^include\..+\.path$/.test(m.key) ? "A condition needs the section name includeIf." : "Write path = <file>."}` });
  }

  // keys without a section (before the first [section] header)
  for (const e of entries) if (!e.key.includes(".")) add({ severity: "high", kind: "key-without-section", file: e.file, line: e.line,
    title: `"${e.key}" is set outside any [section]`,
    detail: `git reads it as a setting called just "${e.key}", which nothing uses. Put it under the section it belongs to, for example [user] for email and name.` });

  // values from an include that a later line overrides
  const overridden = new Map();
  for (const e of entries) {
    if (!e.chain.length || !isSingleValued(e.key)) continue;
    const win = last.get(e.key);
    if (win === e || win.value === e.value) continue;
    const winIn = win.chain.length && win.chain[0].file === e.chain[0].file && win.chain[0].line === e.chain[0].line;
    if (winIn) continue;
    if (win.index < e.index) continue;
    const top = e.chain[0];
    const k = `${top.file}:${top.line}:${e.key}`;
    if (overridden.has(k)) continue;
    overridden.set(k, true);
    const id = IDENTITY_KEYS.includes(e.key);
    add({ severity: id ? "high" : "medium", kind: "include-overridden", file: e.file, line: e.line,
      title: `The included ${e.key} loses to a later line`,
      detail: `${e.file}:${e.line} sets ${e.key} = ${e.value} (included from ${top.file}:${top.line}), but git reads ${win.file}:${win.line} = ${win.value} afterwards and the last value wins. ${win.file === top.file && win.scope === e.scope ? `Move the [include${top.condition ? `If "${top.condition}"` : ""}] block to the end of ${top.file}, below the setting it should override.` : `${win.scope !== e.scope ? `That line is in the ${win.scope} config, which git reads after the ${e.scope} one.` : ""}`}`.trim() });
  }

  // config files given but never read
  const read = new Set(entries.map((e) => normalizePath(e.file)));
  for (const d of state.directives) if (d.read && d.target) read.add(normalizePath(d.target));
  const tops = new Set(topLevel(ctx, files).map((t) => t.path));
  for (const [p, f] of files) {
    if (f.synthetic || tops.has(p) || read.has(p)) continue;
    const named = state.directives.filter((d) => d.target && normalizePath(d.target) === p);
    if (named.length) continue; // condition false: reported on the directive
    add({ severity: "medium", kind: "file-never-read", file: p, line: 0,
      title: "No include reaches this file",
      detail: `Nothing that git reads points at ${p}${f.parsed.entries.length ? `, so its ${f.parsed.entries.length} setting${f.parsed.entries.length === 1 ? "" : "s"} never apply` : ""}. Check the path = lines: paths are relative to the file they are written in.` });
  }

  if (ctx.worktree) add({ severity: "info", kind: "linked-worktree", file: null, line: 0,
    title: "Linked worktree: gitdir: sees the main repository's .git",
    detail: `A worktree made with git worktree add has its git folder at ${ctx.gitdir}, inside the main repository, so gitdir: conditions match where the main repository lives, not where the worktree folder is.` });

  findings.sort((a, b) => SEVERITY_ORDER.get(a.severity) - SEVERITY_ORDER.get(b.severity));
  const directives = state.directives.map(({ chain, ...d }) => ({ ...d, via: chain.map((c) => `${c.file}:${c.line}`) }));
  return {
    context: { home: ctx.home, gitdir: ctx.gitdir, realGitdir: ctx.realGitdir, branch: ctx.branch || null, worktree: ctx.worktree },
    entries: entries.map(({ index, chain, ...e }) => ({ ...e, via: chain.map((c) => `${c.file}:${c.line}`) })),
    effective, identity, directives, findings, fatal,
    files: [...files.values()].map((f) => ({ path: f.path, synthetic: Boolean(f.synthetic), settings: f.parsed.entries.length })),
    remoteUrls: state.urls,
    totals: {
      files: files.size, entries: entries.length,
      includes: directives.length, matched: directives.filter((d) => d.matched).length,
      findings: findings.length, high: findings.filter((f) => f.severity === "high" || f.severity === "error").length,
    },
  };
}

// Every value of one key, in git's reading order, and the one that wins.
export function why(input = {}) {
  const key = normalizeKey(String(input.key || "user.email"));
  const r = analyze(input);
  const values = r.entries.filter((e) => e.key === key);
  return { key, values, winner: values.length ? values[values.length - 1] : null, multi: !isSingleValued(key), fatal: r.fatal };
}

// user.Email -> user.email; remote.Origin.URL -> remote.Origin.url
export function normalizeKey(k) {
  const first = k.indexOf("."), last = k.lastIndexOf(".");
  if (first < 0) return k.toLowerCase();
  if (first === last) return k.toLowerCase();
  return k.slice(0, first).toLowerCase() + k.slice(first, last + 1) + k.slice(last + 1).toLowerCase();
}

export function reportText(r) {
  const lines = [];
  lines.push(`gitdir: ${r.context.gitdir ?? "(not in a repository)"}  branch: ${r.context.branch ?? "(detached)"}`);
  for (const i of r.identity) lines.push(`${i.key} = ${i.value}   (${i.file}:${i.line}${i.via.length ? " via " + i.via.join(" > ") : ""})`);
  lines.push("");
  for (const d of r.directives) lines.push(`${d.matched ? "READ " : "skip "} ${d.where}  ${d.kind === "include" ? "[include]" : `[includeIf "${d.condition}"]`} path = ${d.path}${d.matched ? (d.found === false ? "  (file not given)" : "") : "  -- " + d.reason}`);
  lines.push("");
  for (const f of r.findings) lines.push(`${f.severity.toUpperCase().padEnd(6)} ${f.file ? f.file + (f.line ? ":" + f.line : "") : ""}  ${f.title}\n       ${f.detail}`);
  return lines.join("\n");
}

export const DEFAULTS = {
  home: "/home/sam",
  repo: "~/work/api",
  branch: "main",
  files: `==> ~/.gitconfig <==
[includeIf "gitdir:~/work"]
	path = .gitconfig-work
[user]
	name = Sam Doe
	email = sam@personal.example
[includeIf "gitdir:~/oss/"]
	path = .gitconfig-oss

==> ~/.gitconfig-work <==
[user]
	email = sam@company.example
	signingkey = ~/.ssh/work_ed25519.pub
[gpg]
	format = ssh
[commit]
	gpgsign = true

==> ~/.gitconfig-oss <==
[user]
	email = sam@users.noreply.example
`,
};
