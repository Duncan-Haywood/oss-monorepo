// pre-commit config checker. Pure functions, no I/O, no network: the page
// (index.html) and the CLI (cli.mjs) import this one file.
//
// Two layers of findings:
//
//   source "pre-commit": what `pre-commit validate-config` (pre-commit
//   4.7.0) itself reports. The schema is re-expressed from pre-commit's
//   `clientlib.py` and cfgv's validators, in the same order, with the same
//   messages and context lines, so the first error here is the error
//   pre-commit prints. pre-commit stops at its first error; this checker
//   keeps going and lists every one.
//
//   source "beyond": things pre-commit accepts silently that are usually
//   mistakes (an unknown hook key it ignores, a duplicate YAML key whose
//   first value is thrown away, an `args` item that is two arguments glued
//   together). These are this tool's own opinions, and each says why.
//
// `differential/config-diff.mjs` runs both this file and pre-commit's own
// loader over real configs and generated mutations of them; the README
// gives the last count.

import { loadYaml, YamlError, pyType, pyRepr, PyScalar, KEY_LINES, ITEM_LINES, DUP_KEYS, LINE } from "./yaml11.mjs";
import { checkPythonRegex, pythonVersionNotes } from "./pyregex.mjs";
import { PRE_COMMIT_VERSION, LANGUAGES, HOOK_TYPES, STAGES, LEGACY_STAGES, META_HOOK_IDS, TYPE_TAGS } from "./tables.mjs";

export { PRE_COMMIT_VERSION };

const MISSING = Symbol("missing");

// Manifest hook keys in pre-commit's order (MANIFEST_HOOK_DICT).
const MANIFEST_KEYS = [
  "minimum_pre_commit_version", "id", "name", "entry", "language", "alias",
  "files", "exclude", "types", "types_or", "exclude_types",
  "additional_dependencies", "args", "always_run", "fail_fast",
  "pass_filenames", "description", "language_version", "log_file",
  "require_serial", "stages", "verbose",
];
// Keys prek (https://github.com/j178/prek, a Rust reimplementation of
// pre-commit) reads and pre-commit ignores. Probed with
// `prek validate-config` 0.5.11 (differential/README.md): prek parses these
// and warns "Ignored unexpected keys" for anything else.
export const PREK_VERSION = "0.5.11";
const PREK_HOOK_KEYS = ["priority", "env", "shell", "groups", "minimum_prek_version"];
const PREK_ROOT_KEYS = ["priorities", "orphan", "default_env", "minimum_prek_version"];
const ROOT_KEYS = [
  "repos", "default_install_hook_types", "default_language_version",
  "default_stages", "files", "exclude", "fail_fast",
  "minimum_pre_commit_version", "ci",
];

class Invalid extends Error {
  constructor(msg) { super(msg); this.msg = msg; }
}

const reprOrMissing = (v) => (v === MISSING ? "MISSING" : pyRepr(v));
const get = (m, k) => (m instanceof Map && m.has(k) ? m.get(k) : MISSING);
const translateLanguage = (v) => (v === "system" ? "unsupported" : v === "script" ? "unsupported_script" : v);
const transformStage = (v) => (typeof v === "string" && v in LEGACY_STAGES ? LEGACY_STAGES[v] : v);

// ------------------------------------------------------------ validators
// Each throws Invalid(message) like a cfgv check function.

function checkString(v) { if (typeof v !== "string") throw new Invalid(`Expected string got ${pyType(v)}`); }
function checkBool(v) { if (typeof v !== "boolean") throw new Invalid(`Expected bool got ${pyType(v)}`); }
function checkDict(v) { if (!(v instanceof Map)) throw new Invalid(`Expected dict got ${pyType(v)}`); }
function checkOneOf(possible) {
  const sorted = [...possible].sort();
  return (v) => {
    if (!possible.includes(v)) throw new Invalid(`Expected one of ${sorted.join(", ")} but got: ${pyRepr(v)}`);
  };
}
function checkRegex(v) {
  const r = checkPythonRegex(v);
  if (!r.ok) {
    const e = new Invalid(`${pyRepr(v)} is not a valid python regex`);
    e.detail = r.message;
    throw e;
  }
}
const checkStringRegex = (v) => { checkString(v); checkRegex(v); };
function checkTypeTag(v) {
  if (!TYPE_TAGS.has(v)) throw new Invalid(`Type tag ${pyRepr(v)} is not recognized.  Try upgrading identify and pre-commit?`);
}

// Python's int() on a version component: surrounding whitespace, a sign and
// underscores between digits are accepted.
function pyIntPart(s) {
  const t = s.trim();
  if (!/^[+-]?[0-9](?:_?[0-9])*$/.test(t)) return null;
  return Number(t.replace(/_/g, ""));
}
function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}
function checkMinVersion(installed) {
  return (v) => {
    const parts = v.split(".").map(pyIntPart);
    if (parts.some((p) => p === null)) {
      const e = new Invalid(`pre-commit crashes on this value: int() cannot read ${pyRepr(v)} as a version`);
      e.crash = true;
      throw e;
    }
    const inst = installed.split(".").map(Number);
    if (compareVersions(parts, inst) > 0) {
      throw new Invalid(`pre-commit version ${v} is required but version ${installed} is installed.  Perhaps run \`pip install --upgrade pre-commit\`.`);
    }
  };
}
function checkArray(inner) {
  return (v, ctx) => {
    if (!Array.isArray(v)) throw new Invalid(`Expected array but got '${pyType(v)}'`);
    v.forEach((x, i) => ctx.at(`At index ${i}`, x, () => inner(x, ctx), itemLine(v, i)));
  };
}
const itemLine = (arr, i) => (arr && arr[ITEM_LINES] ? arr[ITEM_LINES][i] : undefined);

// ---------------------------------------------------------------- context

class Ctx {
  constructor(opts) {
    this.stack = [];
    this.lines = [];
    this.findings = [];
    this.seq = 0;
    this.opts = opts;
  }
  line() { for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i]) return this.lines[i]; return null; }
  at(label, _value, fn, line) {
    this.stack.push(label);
    this.lines.push(line);
    try { fn(); } catch (e) {
      if (!(e instanceof Invalid)) throw e;
      this.error(e);
    } finally { this.stack.pop(); this.lines.pop(); }
  }
  error(e) {
    this.findings.push({
      seq: this.seq++, level: "error", source: "pre-commit", rule: e.rule || ruleFor(e.msg),
      line: this.line(), context: [...this.stack], message: e.msg,
      ...(e.detail ? { detail: e.detail } : {}), ...(e.crash ? { crash: true } : {}),
    });
  }
  warn(message, rule, line) {
    this.findings.push({ seq: this.seq++, level: "warning", source: "pre-commit", rule, line: line ?? this.line(), context: [...this.stack], message });
  }
  beyond(level, rule, message, line, fix) {
    this.findings.push({ seq: this.seq++, level, source: "beyond", rule, line: line ?? this.line(), context: [...this.stack], message, ...(fix ? { fix } : {}) });
  }
}

function ruleFor(msg) {
  if (msg.startsWith("Missing required key")) return "missing-key";
  if (msg.startsWith("Expected string got") || msg.startsWith("Expected bool got") || msg.startsWith("Expected dict got") || msg.startsWith("Expected array but got") || /^Expected a \w+ map but got/.test(msg)) return "wrong-type";
  if (msg.includes("is not a valid python regex")) return "bad-regex";
  if (msg.startsWith("Type tag")) return "unknown-type-tag";
  if (msg.startsWith("Expected one of")) return "not-allowed-value";
  if (msg.startsWith("pre-commit version")) return "min-version";
  if (msg.startsWith("Expected rev to be absent")) return "rev-not-allowed";
  if (msg.startsWith("Additional keys found")) return "unknown-language-key";
  if (msg.includes("cannot be overridden")) return "meta-entry";
  return "invalid";
}

// cfgv building blocks over a JS Map.
function keyLine(m, k) { return m instanceof Map && m[KEY_LINES] ? m[KEY_LINES].get(k) : undefined; }
function optional(ctx, m, key, fn) {
  if (!m.has(key)) return;
  ctx.at(`At key: ${key}`, m.get(key), () => fn(m.get(key), ctx), keyLine(m, key));
}
function required(ctx, m, key, fn) {
  if (!m.has(key)) { ctx.error(new Invalid(`Missing required key: ${key}`)); return; }
  optional(ctx, m, key, fn);
}
function mapCheck(ctx, v, objectName, idKey, body, line) {
  if (!(v instanceof Map)) throw new Invalid(`Expected a ${objectName} map but got a ${pyType(v)}`);
  const label = idKey === null ? `At ${objectName}()` : `At ${objectName}(${idKey}=${reprOrMissing(get(v, idKey))})`;
  ctx.at(label, v, () => body(v), line ?? v[LINE]);
}

// ------------------------------------------------------------ the schema

function stagesCheck(v, ctx) {
  checkArray(() => {})(v, ctx);
  checkArray(checkOneOf(STAGES))(v.map(transformStage), { at: (l, x, fn, line) => ctx.at(l, x, fn, line ?? itemLine(v, Number(l.slice(9)))) });
}

function regexWarnings(ctx, m, key, where) {
  if (!m.has(key) || typeof m.get(key) !== "string") return;
  const v = m.get(key);
  const line = keyLine(m, key);
  if (v.includes("/*")) {
    ctx.warn(where === "top"
      ? `The top-level '${key}' field is a regex, not a glob -- matching '/*' probably isn't what you want here`
      : `The '${key}' field in hook ${pyRepr(get(m, "id") === MISSING ? null : get(m, "id"))} is a regex, not a glob -- matching '/*' probably isn't what you want here`, "regex-not-glob", line);
  }
  for (const fwd of ["[\\\\/]", "[\\/]", "[/\\\\]"]) {
    if (v.includes(fwd)) {
      ctx.warn(where === "top"
        ? `pre-commit normalizes the slashes in the top-level '${key}' field to forward slashes, so you can use / instead of ${fwd}`
        : `pre-commit normalizes slashes in the '${key}' field in hook ${pyRepr(get(m, "id") === MISSING ? null : get(m, "id"))} to forward slashes, so you can use / instead of ${fwd}`, "backslash-class", line);
    }
  }
}

function deprecatedStagesWarning(ctx, m) {
  if (!m.has("stages")) return;
  const v = m.get("stages");
  const legacy = v.filter((s) => typeof s === "string" && s in LEGACY_STAGES);
  if (legacy.length) {
    ctx.warn(`hook id \`${pyStr(m.get("id"))}\` uses deprecated stage names (${legacy.join(", ")}) which will be removed in a future version.  run: \`pre-commit migrate-config\` to automatically fix this.`, "legacy-stage", keyLine(m, "stages"));
  }
}
const pyStr = (v) => (typeof v === "string" ? v : pyRepr(v));

function commonHookWarnings(ctx, m) {
  // OptionalSensibleRegexAtHook('files'/'exclude', check_string) re-checks
  // the type before warning.
  // Their type errors were already reported by the first check, so a
  // wrong type here only skips the warning.
  for (const key of ["files", "exclude"]) regexWarnings(ctx, m, key, "hook");
  if (Array.isArray(get(m, "stages"))) deprecatedStagesWarning(ctx, m);
}

function manifestValueCheck(key, installed) {
  switch (key) {
    case "minimum_pre_commit_version": return (v) => { checkString(v); checkMinVersion(installed)(v); };
    case "id": case "name": case "entry": case "alias": case "description": case "language_version": case "log_file": return checkString;
    case "files": case "exclude": return checkStringRegex;
    case "types": case "types_or": case "exclude_types": return checkArray(checkTypeTag);
    case "additional_dependencies": case "args": return checkArray(checkString);
    case "always_run": case "fail_fast": case "pass_filenames": case "require_serial": case "verbose": return checkBool;
    default: return null;
  }
}

function languageCheck(v) {
  if (Array.isArray(v) || v instanceof Map) {
    const e = new Invalid(`pre-commit crashes on this value: a ${pyType(v)} cannot be a language name`);
    e.crash = true;
    throw e;
  }
  checkOneOf(LANGUAGES)(translateLanguage(v));
}

function checkRemoteHook(ctx, h, installed) {
  required(ctx, h, "id", checkString);
  for (const key of MANIFEST_KEYS) {
    if (key === "id" || key === "stages" || key === "language") continue;
    optional(ctx, h, key, manifestValueCheck(key, installed));
  }
  optional(ctx, h, "stages", stagesCheck);
  optional(ctx, h, "language", languageCheck);
  commonHookWarnings(ctx, h);
}

function checkLocalHook(ctx, h, installed) {
  for (const key of MANIFEST_KEYS) {
    if (key === "language") {
      if (!h.has("language")) ctx.error(new Invalid("Missing required key: language"));
      else optional(ctx, h, "language", languageCheck);
      continue;
    }
    if (key === "stages") { optional(ctx, h, "stages", stagesCheck); continue; }
    const fn = manifestValueCheck(key, installed);
    if (key === "id" || key === "name" || key === "entry") required(ctx, h, key, fn);
    else optional(ctx, h, key, fn);
  }
  commonHookWarnings(ctx, h);
}

function checkMetaHook(ctx, h, installed) {
  required(ctx, h, "id", checkString);
  required(ctx, h, "id", checkOneOf(META_HOOK_IDS));
  optional(ctx, h, "language", checkOneOf(["unsupported"]));
  if (h.has("entry")) ctx.at("", null, () => { throw new Invalid("'entry' cannot be overridden"); }, keyLine(h, "entry"));
  for (const key of MANIFEST_KEYS) {
    if (key === "language") { optional(ctx, h, key, (v) => checkOneOf(LANGUAGES)(v)); continue; }
    if (key === "stages") { optional(ctx, h, "stages", stagesCheck); continue; }
    const fn = manifestValueCheck(key, installed);
    if (key === "id") required(ctx, h, key, fn);
    else optional(ctx, h, key, fn);
  }
  commonHookWarnings(ctx, h);
}

function hooksArray(ctx, repo, kind, installed) {
  return (hooks) => {
    if (!Array.isArray(hooks)) throw new Invalid(`Expected array but got '${pyType(hooks)}'`);
    hooks.forEach((h, i) => {
      ctx.at("", h, () => mapCheck(ctx, h, "Hook", "id", (m) => {
        if (kind === "local") checkLocalHook(ctx, m, installed);
        else if (kind === "meta") checkMetaHook(ctx, m, installed);
        else checkRemoteHook(ctx, m, installed);
        beyondHook(ctx, m);
      }, itemLine(hooks, i)), itemLine(hooks, i));
    });
  };
}

function checkRepo(ctx, r, installed) {
  required(ctx, r, "repo", checkString);
  const repo = get(r, "repo");
  const kind = repo === "local" ? "local" : repo === "meta" ? "meta" : repo === MISSING ? null : "remote";
  if (kind) required(ctx, r, "hooks", hooksArray(ctx, r, kind, installed));
  if (kind === "remote") {
    let ok = true;
    if (!r.has("rev")) { ctx.error(new Invalid("Missing required key: rev")); ok = false; }
    else ctx.at("At key: rev", r.get("rev"), () => { try { checkString(r.get("rev")); } catch (e) { ok = false; throw e; } }, keyLine(r, "rev"));
    if (ok) {
      const rev = r.get("rev");
      if (!rev.includes(".") && !/^[a-fA-F0-9]+$/.test(rev.replace(/\n$/, ""))) {
        ctx.warn(`The 'rev' field of repo ${pyRepr(repo)} appears to be a mutable reference (moving tag / branch).  Mutable references are never updated after first install and are not supported.  See https://pre-commit.com/#using-the-latest-version-for-a-repository for more details.  Hint: \`pre-commit autoupdate\` often fixes this.`, "mutable-rev", keyLine(r, "rev"));
      } else if (!/^[a-fA-F0-9]{40}$/.test(rev)) {
        ctx.beyond("info", "tag-not-sha", `rev ${pyRepr(rev)} is a tag. A tag can be moved to different code by whoever controls ${typeof repo === "string" ? repo : "the repo"}; a full commit SHA cannot. \`pre-commit autoupdate --freeze\` writes SHAs with the tag as a comment.`, keyLine(r, "rev"));
      }
    }
  } else if ((kind === "local" || kind === "meta") && r.has("rev")) {
    ctx.error(new Invalid(`Expected rev to be absent when repo is any of ('local', 'meta'), found rev: ${pyRepr(r.get("rev"))}`));
  }
  const extra = [...r.keys()].filter((k) => !["repo", "rev", "hooks"].includes(k)).map(keyName).sort();
  if (extra.length) {
    ctx.warn(`Unexpected key(s) present on ${pyStr(repo === MISSING ? null : repo)}: ${extra.join(", ")}`, "unknown-repo-key", keyLine(r, [...r.keys()].find((k) => keyName(k) === extra[0])));
    if (extra.includes("sha")) ctx.beyond("warning", "sha-key", "`sha:` was renamed `rev:` in pre-commit 1.7.0; pre-commit now ignores `sha:`. Run `pre-commit migrate-config`.", keyLine(r, "sha"));
  }
}

const keyName = (k) => (typeof k === "string" && k.startsWith("\u0000") ? k.slice(1) : k);

function checkConfig(ctx, cfg, installed) {
  optional(ctx, cfg, "minimum_pre_commit_version", (v) => { checkString(v); checkMinVersion(installed)(v); });
  if (!cfg.has("repos")) ctx.error(new Invalid("Missing required key: repos"));
  else optional(ctx, cfg, "repos", (repos) => {
    if (!Array.isArray(repos)) throw new Invalid(`Expected array but got '${pyType(repos)}'`);
    repos.forEach((r, i) => ctx.at("", r, () => mapCheck(ctx, r, "Repository", "repo", (m) => checkRepo(ctx, m, installed), itemLine(repos, i)), itemLine(repos, i)));
  });
  optional(ctx, cfg, "default_install_hook_types", checkArray(checkOneOf(HOOK_TYPES)));
  optional(ctx, cfg, "default_language_version", (v) => mapCheck(ctx, v, "DefaultLanguageVersion", null, (m) => {
    const extra = [...m.keys()].map(keyName).filter((k) => !LANGUAGES.includes(k)).sort();
    if (extra.length) ctx.error(new Invalid(`Additional keys found: ${extra.join(", ")}.  Only these keys are allowed: ${LANGUAGES.join(", ")}`));
    for (const lang of LANGUAGES) optional(ctx, m, lang, checkString);
  }));
  optional(ctx, cfg, "default_stages", stagesCheck);
  if (cfg.has("default_stages") && Array.isArray(cfg.get("default_stages"))) {
    const legacy = cfg.get("default_stages").filter((s) => typeof s === "string" && s in LEGACY_STAGES);
    if (legacy.length) ctx.warn(`top-level \`default_stages\` uses deprecated stage names (${legacy.join(", ")}) which will be removed in a future version.  run: \`pre-commit migrate-config\` to automatically fix this.`, "legacy-stage", keyLine(cfg, "default_stages"));
  }
  optional(ctx, cfg, "files", checkStringRegex);
  optional(ctx, cfg, "exclude", checkStringRegex);
  optional(ctx, cfg, "fail_fast", checkBool);
  const extra = [...cfg.keys()].map(keyName).filter((k) => !ROOT_KEYS.includes(k)).sort();
  if (extra.length) ctx.warn(`Unexpected key(s) present at root: ${extra.join(", ")}`, "unknown-root-key", keyLine(cfg, [...cfg.keys()].find((k) => keyName(k) === extra[0])));
  for (const k of extra) {
    if (PREK_ROOT_KEYS.includes(k)) ctx.beyond("info", "prek-key", `\`${k}\` is a prek key (prek ${PREK_VERSION} reads it); pre-commit warns about it and ignores it.`, keyLine(cfg, k));
    else { const near = closest(k, ROOT_KEYS); if (near) ctx.beyond("info", "root-key-typo", `did you mean \`${near}\`?`, keyLine(cfg, k)); }
  }
  for (const key of ["files", "exclude"]) regexWarnings(ctx, cfg, key, "top");
  optional(ctx, cfg, "ci", checkDict);
  beyondTop(ctx, cfg);
}

// ------------------------------------------------- beyond pre-commit itself

function closest(word, candidates) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const d = editDistance(String(word), c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(String(word).length / 3)) ? best : null;
}
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

function beyondHook(ctx, h) {
  for (const k of h.keys()) {
    const name = keyName(k);
    if (MANIFEST_KEYS.includes(name)) continue;
    if (PREK_HOOK_KEYS.includes(name)) {
      ctx.beyond("info", "prek-key", `\`${name}\` is a prek key (prek ${PREK_VERSION} reads it). pre-commit ignores it without a warning, so under pre-commit it does nothing.`, keyLine(h, k));
      continue;
    }
    const near = closest(name, MANIFEST_KEYS);
    ctx.beyond("warning", "unknown-hook-key",
      `pre-commit silently ignores the hook key \`${name}\`${near ? `; did you mean \`${near}\`?` : "."} Nothing it sets takes effect.`, keyLine(h, k));
  }
  dupKeys(ctx, h);
  const args = get(h, "args");
  if (Array.isArray(args)) {
    args.forEach((a, i) => {
      if (typeof a === "string" && /^--?[A-Za-z][\w.-]*\s+\S/.test(a) && !/^[^\s]*=/.test(a)) {
        const [flag, ...rest] = a.split(/\s+/);
        ctx.beyond("warning", "args-glued", `args item ${pyRepr(a)} reaches the tool as one argument, space included. Most command-line parsers then do not see the option \`${flag}\`. Write it as two items (${pyRepr(flag)}, ${pyRepr(rest.join(" "))}) or as ${pyRepr(flag + "=" + rest.join(" "))}.`, itemLine(args, i) ?? keyLine(h, "args"));
      }
    });
  }
  const lang = get(h, "language");
  if (lang === "system" || lang === "script") {
    ctx.beyond("info", "language-renamed", `pre-commit ${PRE_COMMIT_VERSION} reads \`language: ${lang}\` as \`${translateLanguage(lang)}\`, its newer name. Both work today.`, keyLine(h, "language"));
  }
  const stages = get(h, "stages");
  if (Array.isArray(stages) && stages.length && stages.every((s) => s === "manual")) {
    ctx.beyond("info", "manual-only", `hook ${pyRepr(get(h, "id") === MISSING ? null : get(h, "id"))} only runs with \`pre-commit run --hook-stage manual\`, never on commit.`, keyLine(h, "stages"));
  }
  for (const key of ["files", "exclude"]) {
    const v = get(h, key);
    if (typeof v === "string") regexNotes(ctx, v, keyLine(h, key), key);
  }
}

function regexNotes(ctx, v, line, key) {
  const r = checkPythonRegex(v);
  for (const note of pythonVersionNotes(r)) ctx.beyond("info", "python-version", `\`${key}\` ${note}.`, line);
}

function dupKeys(ctx, m) {
  if (!(m instanceof Map) || !m[DUP_KEYS]) return;
  for (const d of m[DUP_KEYS]) {
    ctx.beyond("warning", "duplicate-key", `\`${keyName(d.key)}\` appears twice in this mapping (lines ${d.firstLine} and ${d.line}). YAML keeps only the last one, so the first is ignored without a warning.`, d.line);
  }
}

function beyondTop(ctx, cfg) {
  dupKeys(ctx, cfg);
  const repos = get(cfg, "repos");
  if (Array.isArray(repos)) for (const r of repos) dupKeys(ctx, r);
  for (const key of ["files", "exclude"]) {
    const v = get(cfg, key);
    if (typeof v === "string") regexNotes(ctx, v, keyLine(cfg, key), key);
  }
}

// ------------------------------------------------------------ fix hints

const YAML_TYPE_WHY = {
  int: "YAML read an unquoted number as an integer",
  float: "YAML read an unquoted number with one dot as a float (so 6.0 and 3.10 lose their meaning: 3.10 becomes 3.1)",
  bool: "YAML 1.1, which pre-commit's loader uses, reads unquoted yes/no/on/off/true/false as a boolean",
  date: "YAML read an unquoted YYYY-MM-DD as a date",
  datetime: "YAML read an unquoted timestamp as a datetime",
  NoneType: "the value is empty (or ~ / null)",
};

/** A plain-English fix for a finding, or null. */
export function hintFor(f) {
  const m = /^Expected (string|bool) got (\w+)/.exec(f.message);
  if (m) {
    const [, want, got] = m;
    if (want === "string" && YAML_TYPE_WHY[got]) return `${YAML_TYPE_WHY[got]}. Put the value in quotes so it stays text, e.g. '100' or "6.0".`;
    if (want === "bool" && got === "str") return "Write true or false without quotes; a quoted \"false\" is text, not a boolean.";
    if (want === "bool") return "Write true or false.";
  }
  if (/^Expected array but got 'str'/.test(f.message)) return "This key takes a list. Write [value] or put each item on its own `- ` line.";
  if (f.rule === "bad-regex") {
    if (/^'\*/.test(f.message) || /'[^']*\*\*/.test(f.message)) return "`files` and `exclude` are Python regular expressions, not globs. `*.py` is written `\\.py$`; `docs/**` is written `^docs/`.";
    if (f.detail && f.detail.startsWith("unknown extension ?<")) return "Python spells a named group (?P<name>...), not (?<name>...).";
    if (f.detail && f.detail.startsWith("look-behind requires")) return "Python's look-behind must match a fixed number of characters; move the variable part outside it.";
    if (f.detail && f.detail.startsWith("bad escape")) return "Python rejects unknown backslash escapes. Escape a literal backslash as \\\\ or drop it.";
    return null;
  }
  if (f.rule === "yaml" && /undefined alias/.test(f.message)) return "A value that starts with * is a YAML alias. Quote it ('*.py'), and remember `files`/`exclude` are regexes: '\\.py$'.";
  if (f.rule === "yaml" && /found character '@'|'`'/.test(f.message)) return "Quote values that start with @ or `.";
  if (f.rule === "not-allowed-value" && /commit-msg/.test(f.message)) return "Stage names are the git hook names: pre-commit, pre-push, commit-msg, manual and so on.";
  if (f.rule === "unknown-type-tag") return "Type tags come from the identify library; `pre-commit` maps file names to tags such as python, yaml, markdown, shell, javascript.";
  if (f.rule === "missing-key" && /rev$/.test(f.message)) return "Every remote repo needs `rev:`, the tag or commit to install. `pre-commit autoupdate` fills it in.";
  if (f.rule === "missing-key") return "A `repo: local` hook must define id, name, entry and language itself.";
  if (f.rule === "mutable-rev") return "Pin a release tag or commit SHA, then let `pre-commit autoupdate` move it.";
  if (f.rule === "legacy-stage") return "Rename commit to pre-commit, push to pre-push, merge-commit to pre-merge-commit (`pre-commit migrate-config` does it).";
  if (f.rule === "old-list-format") return "Run `pre-commit migrate-config`.";
  return null;
}

// --------------------------------------------------------------- public

/**
 * Check a .pre-commit-config.yaml text.
 * Returns { ok, findings, firstError, preCommitWarnings, parsed }.
 *   ok: pre-commit would accept the file.
 *   firstError: the error pre-commit prints (it stops there), with its
 *     context chain, or null.
 *   preCommitWarnings: the warnings pre-commit itself logs (those raised
 *     before its first error).
 */
export function checkConfigText(text, { filename = ".pre-commit-config.yaml", installed = PRE_COMMIT_VERSION } = {}) {
  const ctx = new Ctx({ installed });
  let cfg;
  try {
    cfg = loadYaml(text);
  } catch (e) {
    if (!(e instanceof YamlError)) throw e;
    const f = { seq: 0, level: "error", source: "pre-commit", rule: "yaml", line: e.line ?? null, context: [`File ${filename}`], message: e.message };
    const h = hintFor(f);
    if (h) f.fix = h;
    return { ok: false, findings: [f], firstError: f, preCommitWarnings: [], parsed: false };
  }
  ctx.stack.push(`File ${filename}`);
  ctx.lines.push(null);
  try {
    mapCheck(ctx, cfg, "Config", null, (m) => checkConfig(ctx, m, installed), 1);
  } catch (e) {
    if (!(e instanceof Invalid)) throw e;
    if (Array.isArray(cfg)) e.rule = "old-list-format";
    ctx.error(e);
    if (Array.isArray(cfg)) {
      ctx.beyond("info", "old-list-format", "This is the old list-only format (before pre-commit 1.0). `pre-commit migrate-config` rewrites it under `repos:`.", 1);
    }
  }
  const findings = ctx.findings;
  for (const f of findings) { const h = hintFor(f); if (h && !f.fix) f.fix = h; }
  const errors = findings.filter((f) => f.level === "error" && f.source === "pre-commit");
  const firstError = errors[0] || null;
  const preCommitWarnings = findings.filter((f) => f.source === "pre-commit" && f.level === "warning" && (!firstError || f.seq < firstError.seq));
  return { ok: errors.length === 0, findings, firstError, preCommitWarnings, parsed: true };
}

/** pre-commit's own error text for a finding (cfgv's "==> ... =====>" form). */
export function formatLikePreCommit(f) {
  const lines = f.context.filter(Boolean).map((c) => `==> ${c}`);
  return `An error has occurred: InvalidConfigError: \n${lines.join("\n")}\n=====> ${f.message}`;
}

export function summarize(result) {
  const by = (lvl, src) => result.findings.filter((f) => f.level === lvl && (!src || f.source === src)).length;
  return {
    accepted: result.ok,
    errors: by("error"),
    warnings: by("warning"),
    info: by("info"),
  };
}

export { PyScalar };
