// Dependabot config checker. Pure functions, no I/O, no network, no YAML
// library: the browser page and the CLI (cli.mjs) import this one file, so
// the two can never disagree about what a config means.
//
// It parses only the subset of YAML a dependabot.yml uses (block maps, block
// sequences, flow lists, quoted and plain scalars, comments). Anything it
// cannot read is reported as a parse error rather than guessed at.

export const KNOWN_ECOSYSTEMS = new Set([
  "bun", "bundler", "cargo", "composer", "conda", "devcontainers", "docker",
  "docker-compose", "dotnet-sdk", "elm", "github-actions", "gitsubmodule",
  "gomod", "gradle", "helm", "julia", "maven", "mix", "npm", "nuget",
  "opentofu", "pip", "pub", "rust-toolchain", "swift", "terraform", "uv",
  "vcpkg",
]);

const INTERVALS = new Set(["daily", "weekly", "monthly", "quarterly", "semiannually", "yearly", "cron"]);

// Ecosystems where one PR per dependency is the normal source of noise.
const NOISY = new Set(["npm", "pip", "bundler", "cargo", "gomod", "maven", "gradle", "composer", "nuget", "mix", "uv", "bun", "pub", "swift"]);

// An entry for either member of a pair satisfies a manifest of the other.
const ALIASES = { pip: ["pip", "uv"], uv: ["pip", "uv"], npm: ["npm", "bun"], bun: ["npm", "bun"], terraform: ["terraform", "opentofu"], opentofu: ["terraform", "opentofu"] };

const LINES = Symbol("lines");

export class ParseError extends Error {
  constructor(message, line) { super(message); this.line = line; }
}

// ---------------------------------------------------------------- YAML subset

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { if (i === 0 || /[\s:\[,{-]/.test(s[i - 1])) q = c; continue; }
    if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

function tokenize(text) {
  const toks = [];
  text.replace(/\r\n?/g, "\n").split("\n").forEach((raw, i) => {
    if (/^\t/.test(raw)) { if (raw.trim() && !raw.trim().startsWith("#")) throw new ParseError("tab indentation is not valid YAML", i + 1); }
    const body = stripComment(raw).replace(/\s+$/, "");
    if (!body.trim() || body.trim() === "---" || body.trim() === "...") return;
    toks.push({ indent: body.length - body.trimStart().length, content: body.trim(), line: i + 1 });
  });
  return toks;
}

function scalar(s) {
  s = s.trim();
  if (s === "" || s === "~" || s === "null") return null;
  if (/^"(.*)"$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"');
  if (/^'(.*)'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

function splitFlow(s) {
  const out = []; let depth = 0, q = null, cur = "";
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === "[" || c === "{") depth++;
    if (c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function value(s, line) {
  s = s.trim();
  if (s.startsWith("[")) {
    if (!s.endsWith("]")) throw new ParseError("flow list spans several lines; put it on one line or use a block list", line);
    return splitFlow(s.slice(1, -1)).map((x) => value(x, line));
  }
  if (s.startsWith("{")) {
    if (!s.endsWith("}")) throw new ParseError("flow map spans several lines; use a block map", line);
    const o = {}; o[LINES] = {};
    for (const part of splitFlow(s.slice(1, -1))) {
      const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(part);
      if (!m) throw new ParseError(`cannot read "${part.trim()}"`, line);
      o[scalar(m[1])] = value(m[2], line); o[LINES][scalar(m[1])] = line;
    }
    return o;
  }
  return scalar(s);
}

const KEY_RE = /^("[^"]*"|'[^']*'|[^\s:#][^:]*?)\s*:(?:\s+(.*))?$/;

function parseNode(toks, i, indent) {
  if (i >= toks.length) return [null, i];
  if (toks[i].content === "-" || toks[i].content.startsWith("- ")) return parseSeq(toks, i, toks[i].indent);
  return parseMap(toks, i, toks[i].indent);
}

function parseSeq(toks, i, indent) {
  const arr = []; arr[LINES] = [];
  while (i < toks.length && toks[i].indent === indent && (toks[i].content === "-" || toks[i].content.startsWith("- "))) {
    const t = toks[i];
    const rest = t.content === "-" ? "" : t.content.slice(2).trimStart();
    arr[LINES].push(t.line);
    if (!rest) {
      if (i + 1 < toks.length && toks[i + 1].indent > indent) { const [v, n] = parseNode(toks, i + 1, toks[i + 1].indent); arr.push(v); i = n; }
      else { arr.push(null); i += 1; }
    } else if (KEY_RE.test(rest) && !/^["'\[{]/.test(rest)) {
      // "- key: v" opens a map whose keys sit two columns right of the dash.
      const inner = indent + (t.content.length - rest.length);
      const copy = toks.slice(); copy[i] = { indent: inner, content: rest, line: t.line };
      const [v, n] = parseMap(copy, i, inner); arr.push(v); i = n;
    } else { arr.push(value(rest, t.line)); i += 1; }
  }
  return [arr, i];
}

function parseMap(toks, i, indent) {
  const obj = {}; obj[LINES] = {};
  while (i < toks.length && toks[i].indent === indent) {
    const t = toks[i];
    if (t.content.startsWith("- ")) break;
    const m = KEY_RE.exec(t.content);
    if (!m) throw new ParseError(`cannot read "${t.content}" as a key: value pair`, t.line);
    const key = scalar(m[1]); const rest = (m[2] ?? "").trim();
    obj[LINES][key] = t.line;
    if (rest) { obj[key] = value(rest, t.line); i += 1; continue; }
    const next = toks[i + 1];
    if (next && (next.indent > indent || (next.indent === indent && next.content.startsWith("- ")))) {
      const [v, n] = parseNode(toks, i + 1, next.indent); obj[key] = v; i = n;
    } else { obj[key] = null; i += 1; }
  }
  return [obj, i];
}

export function parseYaml(text) {
  const toks = tokenize(text);
  if (!toks.length) return null;
  const [v, n] = parseNode(toks, 0, toks[0].indent);
  if (n < toks.length) throw new ParseError(`unexpected indentation near "${toks[n].content}"`, toks[n].line);
  return v;
}

// ------------------------------------------------------------ manifest scan

const SKIP_DIR = /(^|\/)(node_modules|vendor|third_party|\.git|dist|build|\.venv|venv|target|__pycache__)(\/|$)/;

const MANIFESTS = [
  [/^package\.json$/, "npm"], [/^(requirements[^/]*\.txt|Pipfile|pyproject\.toml|setup\.py|setup\.cfg)$/, "pip"],
  [/^uv\.lock$/, "uv"], [/^bun\.lockb?$/, "bun"],
  [/^go\.mod$/, "gomod"], [/^Cargo\.toml$/, "cargo"], [/^Gemfile$/, "bundler"], [/^pom\.xml$/, "maven"],
  [/^build\.gradle(\.kts)?$/, "gradle"], [/^composer\.json$/, "composer"], [/^mix\.exs$/, "mix"],
  [/^Package\.swift$/, "swift"], [/\.(cs|fs|vb)proj$|^packages\.config$/, "nuget"],
  [/^(Dockerfile(\..+)?|.+\.Dockerfile)$/, "docker"], [/^(docker-)?compose(\.[^/]+)?\.ya?ml$/, "docker-compose"],
  [/\.tf$/, "terraform"], [/^\.gitmodules$/, "gitsubmodule"], [/^Chart\.yaml$/, "helm"],
  [/^pubspec\.yaml$/, "pub"], [/^elm\.json$/, "elm"], [/^rust-toolchain(\.toml)?$/, "rust-toolchain"],
  [/^(environment|conda)\.ya?ml$/, "conda"], [/^global\.json$/, "dotnet-sdk"], [/^vcpkg\.json$/, "vcpkg"],
  [/^Project\.toml$/, "julia"],
];

/** From a list of repo paths, returns [{ecosystem, directory, file}] with one
 * row per (ecosystem, directory), directory rooted with "/". */
export function detectManifests(paths) {
  const seen = new Map();
  for (let p of paths) {
    p = p.trim().replace(/^\.?\//, "");
    if (!p || SKIP_DIR.test(p)) continue;
    const slash = p.lastIndexOf("/");
    const dir = slash < 0 ? "/" : "/" + p.slice(0, slash);
    const base = p.slice(slash + 1);
    let eco = null;
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) { eco = "github-actions"; addRow(seen, eco, "/", p); continue; }
    if (p === ".devcontainer/devcontainer.json" || /^\.devcontainer\/[^/]+\/devcontainer\.json$/.test(p)) { addRow(seen, "devcontainers", "/", p); continue; }
    for (const [re, e] of MANIFESTS) if (re.test(base)) { eco = e; break; }
    if (!eco) continue;
    // uv.lock and bun.lock only matter beside a manifest that already counted.
    if (eco === "uv" || eco === "bun") continue;
    addRow(seen, eco, dir, p);
  }
  return [...seen.values()];
}
function addRow(map, ecosystem, directory, file) {
  const k = ecosystem + " " + directory;
  if (!map.has(k)) map.set(k, { ecosystem, directory, file });
}

function globToRe(g) {
  const src = g.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp("^" + src + "$");
}
function dirs(entry) {
  const out = [];
  if (typeof entry.directory === "string") out.push(entry.directory);
  if (Array.isArray(entry.directories)) for (const d of entry.directories) if (typeof d === "string") out.push(d);
  return out;
}
function entryCovers(entry, m) {
  const eco = ALIASES[m.ecosystem] || [m.ecosystem];
  if (!eco.includes(entry["package-ecosystem"])) return false;
  return dirs(entry).some((d) => globToRe("/" + d.replace(/^\/+|\/+$/g, "")).test(m.directory) || (d === "/" && m.directory === "/"));
}

// ----------------------------------------------------------------- analysis

function finding(severity, rule, line, message, fix) { return { severity, rule, line: line || 1, message, fix: fix || "" }; }

/** analyze(configText, paths?) -> {findings, parseError, entries, manifests}
 * `paths` (optional) is a list of repo file paths; without it the
 * uncovered/stale-entry checks are skipped and only the config is linted. */
export function analyze(configText, paths = null) {
  const findings = [];
  let doc;
  try { doc = parseYaml(configText); }
  catch (e) {
    if (!(e instanceof ParseError)) throw e;
    return { findings: [finding("error", "yaml-parse", e.line, e.message, "Fix the YAML syntax; GitHub rejects the whole file when it does not parse.")], parseError: true, entries: [], manifests: [] };
  }
  if (!doc || Array.isArray(doc) || typeof doc !== "object") {
    return { findings: [finding("error", "empty-config", 1, "The file is empty or is not a mapping.", "Start from `version: 2` and an `updates:` list.")], parseError: true, entries: [], manifests: [] };
  }
  const L = doc[LINES] || {};
  if (doc.version !== 2) findings.push(finding("error", "version", L.version, doc.version === undefined ? "`version: 2` is missing." : `version is ${JSON.stringify(doc.version)}; Dependabot only accepts 2.`, "Add `version: 2` as the first line."));
  const entries = Array.isArray(doc.updates) ? doc.updates : [];
  if (!entries.length) {
    findings.push(finding("error", "no-updates", L.updates, "`updates:` is missing or empty, so Dependabot version updates never run.", "Add at least one entry with package-ecosystem, directory and schedule.interval."));
  }
  const seen = new Map();
  entries.forEach((e, i) => {
    const line = (doc.updates[LINES] || [])[i];
    if (!e || typeof e !== "object" || Array.isArray(e)) { findings.push(finding("error", "bad-entry", line, `updates[${i}] is not a mapping.`)); return; }
    const EL = e[LINES] || {};
    const eco = e["package-ecosystem"];
    const tag = `updates[${i}]${typeof eco === "string" ? ` (${eco})` : ""}`;
    if (typeof eco !== "string") findings.push(finding("error", "missing-ecosystem", line, `${tag} has no package-ecosystem.`));
    else if (!KNOWN_ECOSYSTEMS.has(eco)) findings.push(finding("error", "unknown-ecosystem", EL["package-ecosystem"], `${tag}: "${eco}" is not a Dependabot ecosystem.`, `Valid values include ${["npm", "pip", "docker", "github-actions", "gomod", "cargo", "bundler", "maven", "gradle", "composer", "nuget", "terraform"].join(", ")}. Note it is "gomod", "bundler" and "docker", not "go", "ruby" or "dockerfile".`));
    const ds = dirs(e);
    if (!ds.length) findings.push(finding("error", "missing-directory", line, `${tag} has neither directory nor directories.`, 'Add `directory: "/"` (or `directories:`).'));
    for (const d of ds) if (!d.startsWith("/")) findings.push(finding("warn", "relative-directory", EL.directory || EL.directories, `${tag}: directory "${d}" does not start with "/".`, `Write it as "/${d.replace(/^\.?\/*/, "")}".`));
    const sched = e.schedule;
    if (!sched || typeof sched !== "object") findings.push(finding("error", "missing-schedule", line, `${tag} has no schedule.`, "Add `schedule:\\n  interval: weekly`."));
    else if (!sched.interval) findings.push(finding("error", "missing-interval", EL.schedule, `${tag} has a schedule with no interval.`, "Add `interval: weekly`."));
    else if (!INTERVALS.has(sched.interval)) findings.push(finding("error", "bad-interval", (sched[LINES] || {}).interval, `${tag}: interval "${sched.interval}" is not valid.`, "Use daily, weekly, monthly, quarterly, semiannually, yearly, or cron with a cronjob."));
    if (e["open-pull-requests-limit"] === 0) findings.push(finding("warn", "pr-limit-zero", EL["open-pull-requests-limit"], `${tag}: open-pull-requests-limit: 0 turns off version updates for this entry (only security updates still open PRs).`, "Remove the line, or set it to the number of PRs you will actually review at once."));
    if (typeof eco === "string" && KNOWN_ECOSYSTEMS.has(eco) && !e.groups) {
      const noisy = NOISY.has(eco);
      findings.push(finding(noisy ? "warn" : "info", "no-groups", line, `${tag} has no groups, so every dependency bump is its own pull request.`, "Add\n    groups:\n      minor-and-patch:\n        update-types: [minor, patch]"));
    }
    if (typeof eco === "string" && KNOWN_ECOSYSTEMS.has(eco) && !e.cooldown) findings.push(finding("info", "no-cooldown", line, `${tag} has no cooldown, so a release published an hour ago can be proposed immediately.`, "Add\n    cooldown:\n      default-days: 7\n  Security updates ignore cooldown, so this only delays routine bumps."));
    for (const d of ds) {
      const key = [eco, d.replace(/\/+$/, "") || "/", e["target-branch"] || ""].join("|");
      if (seen.has(key)) findings.push(finding("error", "duplicate-entry", line, `${tag} repeats package-ecosystem + directory of updates[${seen.get(key)}]; GitHub rejects the file.`, "Merge the two entries, or give one a different target-branch."));
      else seen.set(key, i);
    }
  });

  let manifests = [];
  if (paths) {
    manifests = detectManifests(paths);
    for (const m of manifests) {
      if (!entries.some((e) => e && typeof e === "object" && entryCovers(e, m))) {
        findings.push(finding("warn", "uncovered-ecosystem", 1, `${m.ecosystem} manifest at ${m.file} has no update entry covering ${m.directory}, so it never gets version updates.`, `Add\n  - package-ecosystem: "${m.ecosystem}"\n    directory: "${m.directory}"\n    schedule:\n      interval: weekly`));
      }
    }
    entries.forEach((e, i) => {
      if (!e || typeof e !== "object" || typeof e["package-ecosystem"] !== "string" || !KNOWN_ECOSYSTEMS.has(e["package-ecosystem"])) return;
      if (!dirs(e).length) return;
      if (!manifests.some((m) => entryCovers(e, m))) findings.push(finding("info", "stale-entry", (doc.updates[LINES] || [])[i], `updates[${i}] (${e["package-ecosystem"]}, ${dirs(e).join(", ")}) matches no manifest in the file list you gave.`, "Remove it if the manifest is gone; ignore if your file list was partial."));
    });
  }
  const order = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);
  return { findings, parseError: false, entries, manifests };
}

/** Builds a starter dependabot.yml from a list of repo paths. */
export function generateConfig(paths) {
  const ms = detectManifests(paths);
  if (!ms.length) return "";
  const by = new Map();
  for (const m of ms) { if (!by.has(m.ecosystem)) by.set(m.ecosystem, []); by.get(m.ecosystem).push(m.directory); }
  const out = ["version: 2", "updates:"];
  for (const [eco, ds] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`  - package-ecosystem: "${eco}"`);
    if (ds.length === 1) out.push(`    directory: "${ds[0]}"`);
    else { out.push("    directories:"); for (const d of ds.sort()) out.push(`      - "${d}"`); }
    out.push("    schedule:", "      interval: weekly", "    cooldown:", "      default-days: 7");
    out.push("    groups:", "      minor-and-patch:", '        update-types: ["minor", "patch"]');
  }
  return out.join("\n") + "\n";
}

export function summary(result) {
  const c = { error: 0, warn: 0, info: 0 };
  for (const f of result.findings) c[f.severity]++;
  if (!result.findings.length) return "No findings.";
  return `${c.error} error${c.error === 1 ? "" : "s"}, ${c.warn} warning${c.warn === 1 ? "" : "s"}, ${c.info} suggestion${c.info === 1 ? "" : "s"}.`;
}

export function hasRisk(result) { return result.findings.some((f) => f.severity !== "info"); }
