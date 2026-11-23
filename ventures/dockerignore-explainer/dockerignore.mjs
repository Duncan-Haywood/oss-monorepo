// .dockerignore explainer: what BuildKit sends as the build context, which
// line decides each path, which COPY sources the rules break, which secrets
// and heavy folders still go to the builder, and fixes re-checked by running
// the same engine again. matcher.mjs is the BuildKit port; this file reports.

import { resolve, buildTree, readIgnore, goMatch, newMatcher, matchPath } from "./matcher.mjs";
import { contextUses } from "./dockerfile.mjs";

export const ENGINE = "BuildKit (Docker Engine 23+ and docker buildx): moby/patternmatcher v0.6.1 + tonistiigi/fsutil";

// ---------------------------------------------------------------- inputs

// A file list: `find . -type f`, `git ls-files`, or "size path" lines from
// `find . -type f -printf '%s %p\n'` (used only when every line has a size).
// A trailing / marks a folder. Returns { files: [{path,size}], dirs, sized }.
export function parseFileList(text) {
  if (Array.isArray(text)) return { files: text.map((p) => (typeof p === "string" ? { path: p, size: null } : p)), dirs: [], sized: text.some((p) => p && p.size != null) };
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l !== "" && l !== "." && l !== "./");
  const sized = lines.length > 0 && lines.every((l) => /^\d+\s+\S/.test(l));
  const files = [];
  const dirs = [];
  for (let l of lines) {
    let size = null;
    if (sized) {
      const m = l.match(/^(\d+)\s+(.*)$/);
      size = Number(m[1]);
      l = m[2];
    }
    l = l.replace(/^\.\//, "").replace(/^\/+/, "");
    if (l === "") continue;
    if (l.endsWith("/")) dirs.push(l.replace(/\/+$/, ""));
    else files.push({ path: l, size });
  }
  return { files, dirs, sized };
}

// ---------------------------------------------------------- what to flag

// Files that should not reach a builder. `pattern` is the line suggested to
// exclude them; every suggestion is re-checked before it is offered.
const SECRETS = [
  { id: "env", test: (b) => b === ".env" || (/^\.env\..+/.test(b) && !/\.(example|sample|template|dist|defaults?)$/i.test(b)), label: "a .env file", pattern: ["**/.env", "**/.env.*", "!**/.env.example", "!**/.env.sample", "!**/.env.template"] },
  { id: "key", test: (b) => /\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk)$/i.test(b), label: "a private key or keystore", pattern: ["**/*.pem", "**/*.key", "**/*.p12", "**/*.pfx", "**/*.jks", "**/*.keystore", "**/*.kdbx", "**/*.ppk"] },
  { id: "ssh", test: (b) => /^id_(rsa|dsa|ecdsa|ed25519)(_sk)?$/.test(b), label: "an SSH private key", pattern: ["**/id_rsa", "**/id_dsa", "**/id_ecdsa", "**/id_ed25519", "**/id_ecdsa_sk", "**/id_ed25519_sk"] },
  { id: "rc", test: (b) => [".npmrc", ".pypirc", ".netrc", ".git-credentials", ".dockercfg", ".htpasswd", ".pgpass"].includes(b), label: "a credentials file", pattern: ["**/.npmrc", "**/.pypirc", "**/.netrc", "**/.git-credentials", "**/.dockercfg", "**/.htpasswd", "**/.pgpass"] },
  { id: "cloud", test: (b, p) => /(^|\/)\.aws\/credentials$/.test(p) || /(^|\/)\.docker\/config\.json$/.test(p) || /(^|\/)\.kube\/config$/.test(p) || b === "kubeconfig", label: "a cloud or cluster credentials file", pattern: ["**/.aws", "**/.docker/config.json", "**/.kube", "**/kubeconfig"] },
  { id: "tfstate", test: (b) => /\.tfstate(\.backup)?$/.test(b) || /\.tfvars$/.test(b), label: "Terraform state or variables", pattern: ["**/*.tfstate", "**/*.tfstate.backup", "**/*.tfvars"] },
  { id: "gcp", test: (b) => b === "credentials.json" || /^service[-_]?account.*\.json$/i.test(b), label: "a service-account credentials file", pattern: ["**/credentials.json", "**/service-account*.json", "**/service_account*.json"] },
];

const HEAVY = [
  { name: ".git", severity: "medium", why: "the whole repository history, which can hold secrets you deleted long ago, and it busts the build cache on every commit" },
  { name: "node_modules", severity: "medium", why: "dependencies built for your machine, not the image; a COPY . . can overwrite the ones the image installed" },
  { name: ".venv", severity: "low", why: "a Python virtual environment built for your machine" },
  { name: "venv", severity: "low", why: "a Python virtual environment built for your machine" },
  { name: "__pycache__", severity: "low", why: "Python bytecode caches" },
  { name: ".pytest_cache", severity: "low", why: "a test cache" },
  { name: ".mypy_cache", severity: "low", why: "a type-checker cache" },
  { name: ".tox", severity: "low", why: "test environments" },
  { name: ".terraform", severity: "low", why: "downloaded Terraform providers, often hundreds of megabytes" },
  { name: ".next", severity: "low", why: "a Next.js build and cache from your machine" },
  { name: ".gradle", severity: "low", why: "a Gradle cache" },
  { name: ".idea", severity: "low", why: "editor settings" },
  { name: ".vscode", severity: "low", why: "editor settings" },
  { name: "coverage", severity: "low", why: "test coverage output" },
];

// Patterns people write expecting .gitignore's "any depth" behaviour.
const DEEP_NAMES = /^(\*\.pyc|\*\.pyo|\*\.log|\*\.swp|\*~|\.DS_Store|Thumbs\.db|__pycache__|\*\.tmp|\.pytest_cache|\.mypy_cache|desktop\.ini)$/;

const plural = (n, one, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export function bytes(n) {
  if (n == null) return null;
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

// ---------------------------------------------------------------- analyze

function patternMatches(pattern, path) {
  // One pattern against one path, ignoring order: the matcher with only it.
  const pm = newMatcher([pattern.replace(/^!/, "")]);
  if (pm.error) return false;
  try {
    return matchPath(pm, path, null).matched;
  } catch {
    return false;
  }
}

function runOnce(ignore, tree) {
  const res = resolve(ignore, tree);
  const byPath = new Map();
  if (res.entries) for (const e of res.entries) byPath.set(e.path, e);
  return { res, byPath };
}

const isUnder = (path, dir) => dir === "." || path === dir || path.startsWith(dir + "/");

// Core report. `ignore`: .dockerignore text. `files`: a file list (see
// parseFileList) or an array of paths. `dockerfile`: optional Dockerfile text.
export function analyze({ ignore = "", files = "", dockerfile = "" } = {}) {
  const list = parseFileList(files);
  const tree = buildTree(list.files, list.dirs);
  const { res, byPath } = runOnce(ignore, tree);
  const lines = res.lines;
  const ruleOf = (i) => (i >= 0 ? { line: res.lineOf[i], text: res.patterns[i], exception: res.patterns[i].startsWith("!") } : null);
  const findings = [];
  const add = (f) => findings.push(f);
  const df = dockerfile && dockerfile.trim() ? contextUses(dockerfile) : null;

  lintLines(lines, add);

  if (res.error) {
    add({ id: "build-fails", severity: "high", line: res.errorLine ?? null, text: res.errorLine ? lines[res.errorLine - 1].raw : null, title: "BuildKit refuses this .dockerignore, so every build fails", detail: `BuildKit stops before sending anything: \`${res.error}\`.${res.kind === "match" ? " The pattern passes Go's filepath syntax check but not its regular-expression compiler, so the error appears only once a path reaches that pattern." : ""} Fix or remove the line.` });
    return finish({ list, res, rows: [], findings, df, fix: null, lines });
  }

  const pm = res.pm;
  const entries = res.entries;
  const rows = entries.map((e) => ({ path: e.path, isDir: e.isDir, size: e.size, sent: e.sent, excluded: e.excluded, rule: e.unvisited ? null : ruleOf(e.decider), via: e.via, unvisited: e.unvisited }));
  const files_ = rows.filter((r) => !r.isDir);
  const sentFiles = files_.filter((r) => r.sent);

  // --- COPY / ADD / RUN --mount sources against what is sent
  const fixLines = []; // { kind, line(s), target paths, reason }
  if (df) {
    for (const u of df.uses) {
      if (u.variable) {
        add({ id: "copy-variable", severity: "info", line: u.line, text: u.source, where: "Dockerfile", title: `${u.instruction} \`${u.source}\` uses a variable`, detail: "The source depends on a build argument, so it was not checked. Check the expanded path by hand." });
        continue;
      }
      const inTree = u.path === "." ? rows : rows.filter((r) => (u.glob ? safeGlob(u.path, r.path) : r.path === u.path));
      if (u.path === ".") {
        u.copiesAll = true;
        continue;
      }
      if (!inTree.length) {
        if (list.files.length) add({ id: "copy-missing", severity: "info", line: u.line, text: u.source, where: "Dockerfile", title: `${u.instruction} \`${u.source}\` is not in your file list`, detail: "Nothing in the build context matches this source, so it could not be checked. Either the file list is incomplete, or the build fails with a not-found error because the context folder (the last argument of docker build) does not hold it." });
        continue;
      }
      const sentHits = inTree.filter((r) => r.sent);
      if (!sentHits.length) {
        const r0 = inTree[0];
        const rule = r0.rule || (r0.unvisited ? rows.find((x) => x.path === r0.unvisited)?.rule : null);
        add({ id: "copy-excluded", severity: "high", line: u.line, text: u.source, where: "Dockerfile", rule, title: `${u.instruction} \`${u.source}\` is excluded, so the build fails`, detail: `${u.glob ? `Every path the wildcard matches (${plural(inTree.length, "path")}) is` : `\`${u.path}\` is`} excluded by line ${rule?.line ?? "?"} \`${rule?.text ?? ""}\`${r0.unvisited ? ` (BuildKit never looks inside \`${r0.unvisited}/\`)` : ""}. BuildKit does not send it, and ${u.instruction} stops with a "not found" error.`, paths: inTree.map((r) => r.path) });
        if (!u.glob) fixLines.push({ kind: "copy", add: [`!${u.path}`], targets: [u.path], line: u.line });
        continue;
      }
      // A folder (or wildcard) copied with some of its files excluded.
      const under = files_.filter((r) => inTree.some((t) => (t.isDir ? isUnder(r.path, t.path) : r.path === t.path)));
      const dropped = under.filter((r) => !r.sent);
      if (dropped.length && under.some((r) => r.sent)) add({ id: "copy-partial", severity: "low", line: u.line, text: u.source, where: "Dockerfile", title: `${u.instruction} \`${u.source}\` copies ${plural(under.length - dropped.length, "file")}; ${plural(dropped.length, "file")} under it ${dropped.length === 1 ? "is" : "are"} excluded`, detail: "Usually intended (tests, caches). If the image needs one of them, add a `!` line for it.", paths: dropped.map((r) => r.path) });
    }
  }
  const copiedBy = (path) => (df ? df.uses.filter((u) => !u.variable && (u.path === "." || (u.glob ? safeGlob(u.path, path) || path.split("/").some((_, i, a) => safeGlob(u.path, a.slice(0, i + 1).join("/"))) : isUnder(path, u.path)))) : []);

  // --- secrets still sent
  const copySources = new Set(df ? df.uses.filter((u) => !u.glob && !u.variable).map((u) => u.path) : []);
  for (const kind of SECRETS) {
    const hits = sentFiles.filter((r) => kind.test(r.path.split("/").pop(), r.path) && !copySources.has(r.path));
    if (!hits.length) continue;
    const copied = hits.filter((r) => copiedBy(r.path).length);
    const sev = copied.length ? "high" : "medium";
    const lineNo = copied.length ? copiedBy(copied[0].path)[0].line : null;
    add({ id: `secret-${kind.id}`, severity: sev, line: lineNo, where: copied.length ? "Dockerfile" : null, title: `${plural(hits.length, kind.label.replace(/^an? /, ""), kind.label.replace(/^an? /, "") + "s")} ${hits.length === 1 ? "is" : "are"} sent to the builder${copied.length ? ` and ${copied.length === hits.length ? "copied" : `${copied.length} copied`} into the image` : ""}`, detail: copied.length ? `Line ${lineNo} of the Dockerfile copies ${copied.length === 1 ? "it" : "them"} into a layer, where anyone who can pull the image can read ${copied.length === 1 ? "it" : "them"}, even if a later step deletes ${copied.length === 1 ? "it" : "them"}. Exclude ${hits.length === 1 ? "it" : "them"} and pass secrets with \`RUN --mount=type=secret\` instead.` : `Nothing you pasted copies ${hits.length === 1 ? "it" : "them"} into the image, but the builder receives ${hits.length === 1 ? "it" : "them"}, and one broad \`COPY . .\` later would bake ${hits.length === 1 ? "it" : "them"} in. Exclude ${hits.length === 1 ? "it" : "them"}.`, paths: hits.map((r) => r.path) });
    // Only the lines that catch what was found (plus the .env exceptions
    // that keep example files, when a .env.* line is suggested).
    const used = kind.pattern.filter((p) => !p.startsWith("!") && hits.some((r) => patternMatches(p, r.path)));
    if (used.includes("**/.env.*")) used.push(...kind.pattern.filter((p) => p.startsWith("!")));
    fixLines.push({ kind: "secret", add: used.length ? used : kind.pattern, targets: hits.map((r) => r.path), id: kind.id });
  }

  // --- heavy folders still sent
  for (const h of HEAVY) {
    const dirs = rows.filter((r) => r.isDir && r.sent && r.path.split("/").pop() === h.name && !rows.some((p) => p.isDir && p.sent && p.path !== r.path && r.path.startsWith(p.path + "/") && p.path.split("/").pop() === h.name));
    if (!dirs.length) continue;
    const inside = sentFiles.filter((f) => dirs.some((d) => f.path.startsWith(d.path + "/")));
    if (!inside.length) continue;
    if (dirs.some((d) => copySources.has(d.path))) continue;
    const sz = list.sized ? inside.reduce((s, f) => s + (f.size || 0), 0) : null;
    add({ id: `heavy-${h.name}`, severity: h.severity, line: null, title: `\`${h.name}/\` is sent: ${plural(inside.length, "file")}${sz != null ? `, ${bytes(sz)}` : ""}`, detail: `${dirs.map((d) => `\`${d.path}/\``).slice(0, 4).join(", ")}${dirs.length > 4 ? ", …" : ""}: ${h.why}.`, paths: inside.map((f) => f.path) });
    fixLines.push({ kind: "heavy", add: [`**/${h.name}`], targets: inside.map((f) => f.path) });
  }

  // --- per-rule evidence: never matches, never decides, root-only, folder exceptions
  if (list.files.length || list.dirs.length) {
    const patIdxs = res.patterns.map((p, i) => i);
    const decided = new Set(rows.map((r) => r.rule && r.rule.line).filter(Boolean));
    for (const i of patIdxs) {
      const text = res.patterns[i];
      const line = res.lineOf[i];
      const raw = lines[line - 1].raw;
      const body = text.replace(/^!/, "");
      const exception = text.startsWith("!");
      const any = rows.some((r) => patternMatches(text, r.path));
      // Root-only: no slash, not starting with **, and a deeper basename match.
      if (!body.includes("/") && !body.startsWith("**")) {
        const deeper = rows.filter((r) => r.path.includes("/") && safeGlob(body, r.path.split("/").pop()) && (exception ? !r.sent : r.sent));
        if (deeper.length) {
          add({ id: "root-only", severity: exception ? "low" : "medium", line, text: raw, title: `\`${body}\` matches only at the top of the context`, detail: `Unlike .gitignore, a .dockerignore pattern without a slash is matched from the context root, so it misses ${plural(deeper.length, "path")} deeper down. Write \`${exception ? "!" : ""}**/${body}\` to match at any depth.`, paths: deeper.map((r) => r.path) });
          fixLines.push({ kind: "root-only", replace: { line, with: `${exception ? "!" : ""}**/${body}` }, targets: deeper.map((r) => r.path), exception });
          continue;
        }
      } else if (!body.includes("/") && DEEP_NAMES.test(body)) {
        /* handled above when evidence exists */
      }
      if (!any) {
        if (/^\s+#/.test(raw) || /\s#/.test(body)) continue; // already flagged as a comment mistake
        add({ id: "rule-unused", severity: "low", line, text: raw, title: `\`${text}\` matches nothing in your list`, detail: body.includes("/") || body.startsWith("**") ? "No path in the list you pasted matches it. If the list is complete, the line can go." : "No path at the top of the context matches it, and this pattern only matches there." });
        continue;
      }
      if (!decided.has(line)) {
        if (exception) {
          // Folder exception trap: !dir does not reach files whose exclusion
          // came from a pattern that matched them directly.
          const folder = rows.find((r) => r.isDir && patternMatches(text, r.path));
          if (folder) {
            const blocked = rows.filter((r) => !r.isDir && !r.sent && r.path.startsWith(folder.path + "/"));
            if (blocked.length) {
              add({ id: "folder-exception", severity: "medium", line, text: raw, title: `\`${text}\` does not re-include the files inside \`${folder.path}/\``, detail: `BuildKit applies an exception for a folder to its contents only when the folder itself was excluded first. Here the files were excluded by a pattern that matched them directly (line ${blocked[0] && rows.find((r) => r.path === blocked[0].path)?.rule?.line}), so \`${text}\` never reaches them. Write \`${text.replace(/\/+$/, "")}/**\`.`, paths: blocked.map((r) => r.path) });
              fixLines.push({ kind: "folder-exception", replace: { line, with: `${text.replace(/\/+$/, "")}/**` }, targets: blocked.map((r) => r.path), exception: true });
              continue;
            }
          }
          add({ id: "rule-shadowed", severity: "low", line, text: raw, title: `\`${text}\` re-includes nothing`, detail: "It matches paths in your list, but none of them is excluded when this line is reached, or a later line excludes them again. Exceptions must come after the line they undo." });
        } else {
          add({ id: "rule-shadowed", severity: "low", line, text: raw, title: `\`${text}\` never decides a path`, detail: "Every path it matches is already excluded by an earlier line or re-included by a later one, so removing it changes nothing in your list." });
        }
      }
    }
  }

  const fix = fixLines.length ? checkFix(ignore, lines, tree, byPath, fixLines) : null;
  return finish({ list, res, rows, findings, df, fix, lines });
}

function safeGlob(pattern, name) {
  try {
    return goMatch(pattern, name);
  } catch {
    return false;
  }
}

function lintLines(lines, add) {
  for (const l of lines) {
    if (l.pattern === null) continue;
    const raw = l.raw;
    const body = l.pattern.replace(/^!/, "");
    if (/^\s+#/.test(raw)) add({ id: "indented-comment", severity: "medium", line: l.line, text: raw, title: "This line is a pattern, not a comment", detail: "Only a line whose very first character is # is a comment. With whitespace before the #, BuildKit trims it and matches the rest as a path. Remove the leading whitespace." });
    else if (/\s#/.test(body)) add({ id: "inline-comment", severity: "medium", line: l.line, text: raw, title: "A # after a pattern is part of the pattern", detail: `.dockerignore has no end-of-line comments, so this rule looks for a path literally named \`${body}\`. Put the comment on its own line.` });
    if (/\[!/.test(body)) add({ id: "bang-class", severity: "medium", line: l.line, text: raw, title: "`[!...]` is not a negated class here", detail: "Go's matcher negates a class with `^`, as in `[^a]`; `[!a]` matches `!` or `a`. .gitignore and shells accept `!`, which is where the habit comes from." });
    if (/\[\^/.test(body)) add({ id: "class-slash", severity: "low", line: l.line, text: raw, title: "A negated class can match `/`", detail: "BuildKit turns the pattern into a regular expression, where `[^a]` matches any character but `a`, slashes included. So `a[^x]b` matches `a/b` too." });
    if (/(^|\/)\.\.(\/|$)/.test(body)) add({ id: "dotdot", severity: "low", line: l.line, text: raw, title: "A pattern that starts above the context matches nothing", detail: "Paths in the context never start with `..`, so this line can go." });
    if (/\\[A-Za-z0-9]/.test(body)) add({ id: "escape-letter", severity: "low", line: l.line, text: raw, title: "A backslash before a letter or digit is a regular-expression escape", detail: "BuildKit passes `\\` and the next character to Go's regexp, where `\\d` means any digit, `\\n` a newline, and most other letters are an error that fails the build. Use `/` between folders; escape only punctuation." });
  }
}

// Applies the suggested lines, re-runs the engine, and reports what changes.
function checkFix(ignore, lines, tree, before, fixLines) {
  const replaced = new Map();
  for (const f of fixLines) if (f.replace) replaced.set(f.replace.line, f.replace.with);
  const appendEx = [];
  const appendInc = [];
  for (const f of fixLines) {
    if (!f.add) continue;
    for (const a of f.add) (a.startsWith("!") && f.kind === "copy" ? appendInc : appendEx).push(a);
  }
  const seen = new Set();
  const uniq = (xs) => xs.filter((x) => !seen.has(x) && seen.add(x));
  for (const w of replaced.values()) seen.add(w);
  const appended = uniq([...appendEx, ...appendInc]);
  const outLines = lines.map((l) => (replaced.has(l.line) ? replaced.get(l.line) : l.raw));
  const text = [...outLines, ...(appended.length ? ["", "# added by the .dockerignore explainer", ...appended] : [])].join("\n") + "\n";
  const after = runOnce(text, tree);
  if (after.res.error) return { text, error: after.res.error, replaced: [...replaced].map(([line, w]) => ({ line, with: w })), appended };
  const targetSet = new Map();
  for (const f of fixLines) for (const t of f.targets) targetSet.set(t, f.kind === "copy" || f.exception ? "sent" : "excluded");
  const fixed = [];
  const unfixed = [];
  for (const [t, want] of targetSet) {
    const e = after.byPath.get(t);
    if (!e) continue;
    const ok = want === "sent" ? e.sent : !e.sent;
    (ok ? fixed : unfixed).push(t);
  }
  const sideEffects = [];
  for (const [p, e] of after.byPath) {
    if (targetSet.has(p) || e.isDir) continue;
    const b = before.get(p);
    if (b && b.sent !== e.sent) sideEffects.push({ path: p, before: b.sent, after: e.sent });
  }
  return { text, replaced: [...replaced].map(([line, w]) => ({ line, with: w })), appended, fixed, unfixed, sideEffects };
}

const SEV = { high: 0, medium: 1, low: 2, info: 3 };

function finish({ list, res, rows, findings, df, fix }) {
  const rank = (s) => (Object.hasOwn(SEV, s) ? SEV[s] : 9);
  findings.sort((a, b) => rank(a.severity) - rank(b.severity) || (a.line ?? 1e9) - (b.line ?? 1e9));
  const files = rows.filter((r) => !r.isDir);
  const sent = files.filter((r) => r.sent);
  const sum = (xs) => (list.sized ? xs.reduce((s, r) => s + (r.size || 0), 0) : null);
  const totals = {
    rules: res.patterns.length,
    files: files.length,
    sent: sent.length,
    excluded: files.length - sent.length,
    bytesSent: sum(sent),
    bytesExcluded: list.sized ? sum(files) - sum(sent) : null,
    high: findings.filter((f) => f.severity === "high").length,
    copies: df ? df.uses.length : 0,
  };
  // Largest sent top-level folders, when sizes are known.
  let biggest = [];
  if (list.sized) {
    const by = new Map();
    for (const f of sent) {
      const top = f.path.includes("/") ? f.path.split("/")[0] + "/" : f.path;
      by.set(top, (by.get(top) || 0) + (f.size || 0));
    }
    biggest = [...by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, size]) => ({ path, size }));
  }
  return { engine: ENGINE, error: res.error || null, patterns: res.patterns, rows, findings, fix, totals, biggest, dockerfile: df ? { uses: df.uses, skipped: df.skipped } : null };
}

// ------------------------------------------------------------------- why

// The steps BuildKit takes for one path, folder by folder.
export function why({ ignore = "", path = "", files = "" } = {}) {
  const target = String(path).trim().replace(/^\.\//, "").replace(/^\/+/, "");
  if (!target) return { steps: [], error: null };
  const isDir = target.endsWith("/");
  const clean = target.replace(/\/+$/, "");
  const list = parseFileList(files);
  const tree = buildTree([...list.files, ...(isDir ? [] : [{ path: clean, size: null }])], [...list.dirs, ...(isDir ? [clean] : [])]);
  const res = resolve(ignore, tree);
  if (res.error) return { steps: [], error: res.error };
  const parts = clean.split("/");
  const steps = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts.slice(0, i + 1).join("/");
    const e = res.entries.find((x) => x.path === p);
    if (!e) continue;
    const rule = e.decider >= 0 ? { line: res.lineOf[e.decider], text: res.patterns[e.decider] } : null;
    let note = null;
    const next = i + 1 < parts.length ? res.entries.find((x) => x.path === parts.slice(0, i + 2).join("/")) : null;
    const skippedHere = next && next.unvisited === p;
    if (skippedHere) note = "BuildKit skips this folder without looking inside: it is excluded and no exception line could match anything below it. Nothing under it is sent.";
    else if (e.via) note = `The deciding line matched the folder ${e.via}/, and the answer carries down to everything inside it.`;
    else if (e.excluded && i < parts.length - 1) note = "Excluded, but an exception line could match something inside, so BuildKit keeps walking.";
    steps.push({ path: p + (i < parts.length - 1 || isDir ? "/" : ""), sent: e.sent, excluded: e.excluded, rule, note });
    if (skippedHere) break;
  }
  return { steps, error: null };
}

// ------------------------------------------------------------------- CSV

export function reportCsv(report) {
  const q = (s) => {
    let v = String(s ?? "");
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) v = "'" + v;
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const head = "path,type,sent,line,rule,via,size";
  const body = report.rows.map((r) => [r.path + (r.isDir ? "/" : ""), r.isDir ? "folder" : "file", r.sent ? "yes" : "no", r.rule?.line ?? "", r.rule?.text ?? (r.unvisited ? `(inside skipped ${r.unvisited}/)` : ""), r.via ?? "", r.size ?? ""].map(q).join(","));
  return [head, ...body].join("\n") + "\n";
}

// The page's example: a Node service with the usual mistakes.
export const DEFAULTS = {
  ignore: ["# keep the context small", "node_modules", "*.log", "  # test output", "coverage", "**/*.md", "!docs", "src/config", "[!.]*.tmp", ""].join("\n"),
  files: [
    "1840 Dockerfile",
    "312 .dockerignore",
    "1290 package.json",
    "48210 package-lock.json",
    "96 .env",
    "1120 .npmrc",
    "1835 README.md",
    "2290 docs/README.md",
    "5120 docs/api.md",
    "3355 src/index.js",
    "915 src/config/default.js",
    "640 src/config/production.js",
    "2240 src/routes/users.js",
    "620 src/routes/health.js",
    "18431 logs/server.log",
    "6422 logs/error.log",
    "1024 api.log",
    "40960 node_modules/express/index.js",
    "51200 node_modules/express/lib/router.js",
    "4096 packages/web/node_modules/react/index.js",
    "254000 .git/objects/pack/pack-1a2b.pack",
    "23 .git/HEAD",
    "512 .git/config",
    "7300 test/users.test.js",
  ].join("\n"),
  dockerfile: [
    "# syntax=docker/dockerfile:1",
    "FROM node:22-slim",
    "WORKDIR /app",
    "COPY package.json package-lock.json ./",
    "RUN npm ci --omit=dev",
    "COPY src/config/default.js ./config/",
    "COPY . .",
    'CMD ["node", "src/index.js"]',
  ].join("\n"),
};

export { readIgnore };
