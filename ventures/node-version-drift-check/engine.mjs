// Zero-dependency, deterministic Node.js version-drift detector. Pure text
// analysis -- no YAML/semver library, no network call, nothing here ever runs
// `node`, `npm`, `nvm` or `docker`. Shared by the CLI and the browser page so
// there is exactly one implementation to keep correct.
//
// It reads the places a repo declares which Node.js it wants:
//   - package.json            engines.node (a semver range) and volta.node
//   - .nvmrc / .node-version  one version or alias
//   - .tool-versions          the `nodejs` line (asdf)
//   - Dockerfile              FROM node:<tag> (ARG defaults are resolved)
//   - GitHub Actions          actions/setup-node node-version (scalar, matrix
//                             list, ${{ matrix.x }}) and node-version-file
// and reports four documented kinds of drift:
//   1. pin-violates-engines  a pinned version no version of which satisfies
//                            engines.node
//   2. major-disagreement    non-matrix pins that name different majors
//   3. eol-node              a pinned major past its end-of-life date, using
//                            the dated table below (plus an `eol-soon` notice)
//   4. engines-unbounded     engines.node has no upper bound and nothing in
//                            the repo pins a Node version at all
//
// What this does not do: resolve `lts/*`, `latest` or `node` aliases (they
// change over time -- reported as notices, not guessed), execute any build,
// or know which registry versions exist. A pin like `20` is treated as "any
// 20.x", so it only violates engines.node when NO 20.x could satisfy it.

// ---------------------------------------------------------------- EOL table
// Source: https://nodejs.org/en/about/previous-releases . Even majors get
// "Maintenance" until April 30 of their third year; odd-numbered majors are
// never LTS and end about six months after release (dates marked approx).
// This is a static snapshot labelled with TABLE_DATE: a major newer than the
// table is reported as unknown, never as supported.
export const TABLE_DATE = "2026-10-11";
export const EOL_TABLE = Object.freeze({
  8: { eol: "2019-12-31" },
  9: { eol: "2018-06-30", approx: true },
  10: { eol: "2021-04-30" },
  11: { eol: "2019-06-01", approx: true },
  12: { eol: "2022-04-30" },
  13: { eol: "2020-06-01", approx: true },
  14: { eol: "2023-04-30" },
  15: { eol: "2021-06-01", approx: true },
  16: { eol: "2023-09-11" },
  17: { eol: "2022-06-01", approx: true },
  18: { eol: "2025-04-30" },
  19: { eol: "2023-06-01", approx: true },
  20: { eol: "2026-04-30" },
  21: { eol: "2024-06-01", approx: true },
  22: { eol: "2027-04-30" },
  23: { eol: "2025-06-01", approx: true },
  24: { eol: "2028-04-30" },
  25: { eol: "2026-06-01", approx: true },
});
export const EOL_SOON_DAYS = 90;

/** EOL entry for a major, or null if the table does not know it. Majors below
 * 8 predate the table and are all long past end-of-life. */
export function eolFor(major) {
  if (EOL_TABLE[major]) return EOL_TABLE[major];
  if (Number.isInteger(major) && major < 8) return { eol: "before 2019-12-31", long: true };
  return null;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
}

// ------------------------------------------------------------ semver ranges
// A range is a list of intervals (OR of ANDs collapsed to intervals), each
// {lo, loInc, hi, hiInc} over [major, minor, patch] tuples. Supports ^ ~ >=
// > <= < = , x-ranges, hyphen ranges, space-separated AND and ||. Prerelease
// and build tags are ignored (a prerelease is treated as its release).
const INF = Infinity;
const ANY = Object.freeze({ lo: [0, 0, 0], loInc: true, hi: [INF, INF, INF], hiInc: false });

function cmp(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

function parsePartial(text) {
  const s = text.trim().replace(/^v/i, "").replace(/^=\s*/, "");
  if (s === "") return { M: null, m: null, p: null };
  const m = /^(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(s);
  if (!m) return null;
  const num = (g) => (g === undefined || /^[xX*]$/.test(g) ? null : Number(g));
  const out = { M: num(m[1]), m: num(m[2]), p: num(m[3]) };
  if (out.M === null) out.m = out.p = null;
  if (out.m === null) out.p = null;
  return out;
}

const fill = (v) => [v.M ?? 0, v.m ?? 0, v.p ?? 0];
const isExact = (v) => v.M !== null && v.m !== null && v.p !== null;
function bump(v) {
  if (v.M === null) return [INF, INF, INF];
  if (v.m === null) return [v.M + 1, 0, 0];
  return [v.M, v.m + 1, 0];
}

function tokenIntervals(op, v) {
  const lo = fill(v);
  if (op === "" || op === "=") {
    if (v.M === null) return [ANY];
    if (isExact(v)) return [{ lo, loInc: true, hi: lo, hiInc: true }];
    return [{ lo, loInc: true, hi: bump(v), hiInc: false }];
  }
  if (op === ">=") return v.M === null ? [ANY] : [{ lo, loInc: true, hi: [INF, INF, INF], hiInc: false }];
  if (op === ">") {
    if (v.M === null) return [];
    return isExact(v)
      ? [{ lo, loInc: false, hi: [INF, INF, INF], hiInc: false }]
      : [{ lo: bump(v), loInc: true, hi: [INF, INF, INF], hiInc: false }];
  }
  if (op === "<") return v.M === null ? [] : [{ lo: [0, 0, 0], loInc: true, hi: lo, hiInc: false }];
  if (op === "<=") {
    if (v.M === null) return [ANY];
    return isExact(v)
      ? [{ lo: [0, 0, 0], loInc: true, hi: lo, hiInc: true }]
      : [{ lo: [0, 0, 0], loInc: true, hi: bump(v), hiInc: false }];
  }
  if (op === "~" || op === "~>") {
    if (v.M === null) return [ANY];
    return [{ lo, loInc: true, hi: v.m === null ? [v.M + 1, 0, 0] : [v.M, v.m + 1, 0], hiInc: false }];
  }
  if (op === "^") {
    if (v.M === null) return [ANY];
    let hi;
    if (v.M > 0) hi = [v.M + 1, 0, 0];
    else if (v.m === null) hi = [1, 0, 0];
    else if (v.m > 0) hi = [0, v.m + 1, 0];
    else if (v.p === null) hi = [0, 1, 0];
    else hi = [0, 0, v.p + 1];
    return [{ lo, loInc: true, hi, hiInc: false }];
  }
  return null;
}

function intersectOne(a, b) {
  let lo = a.lo, loInc = a.loInc;
  const c1 = cmp(b.lo, a.lo);
  if (c1 > 0 || (c1 === 0 && !b.loInc)) { lo = b.lo; loInc = b.loInc && (c1 > 0 || a.loInc); }
  let hi = a.hi, hiInc = a.hiInc;
  const c2 = cmp(b.hi, a.hi);
  if (c2 < 0 || (c2 === 0 && !b.hiInc)) { hi = b.hi; hiInc = b.hiInc && (c2 < 0 || a.hiInc); }
  const c = cmp(lo, hi);
  if (c > 0 || (c === 0 && !(loInc && hiInc))) return null;
  return { lo, loInc, hi, hiInc };
}

function intersectLists(A, B) {
  const out = [];
  for (const a of A) for (const b of B) {
    const x = intersectOne(a, b);
    if (x) out.push(x);
  }
  return out;
}

/** Parse an npm-style range into intervals, or null if it is not a range this
 * parser understands. An empty string means "any version", as in npm. */
export function parseRange(input) {
  if (typeof input !== "string") return null;
  const result = [];
  for (const rawPart of input.split("||")) {
    const part = rawPart.trim();
    let cur = [ANY];
    const hy = /^(\S+)\s+-\s+(\S+)$/.exec(part);
    if (hy) {
      const a = parsePartial(hy[1]), b = parsePartial(hy[2]);
      if (!a || !b) return null;
      cur = intersectLists(tokenIntervals(">=", a), tokenIntervals("<=", b));
    } else if (part !== "") {
      const tokens = part.replace(/(>=|<=|>|<|=|\^|~>|~)\s+/g, "$1").split(/\s+/);
      for (const tok of tokens) {
        const m = /^(>=|<=|>|<|=|\^|~>|~)?(.*)$/.exec(tok);
        const v = parsePartial(m[2]);
        if (!v) return null;
        const ivs = tokenIntervals(m[1] || "", v);
        if (!ivs) return null;
        cur = intersectLists(cur, ivs);
      }
    }
    result.push(...cur);
  }
  return result;
}

function parseVersion(s) {
  const v = parsePartial(s);
  return v && isExact(v) ? fill(v) : null;
}

function inInterval(v, iv) {
  const a = cmp(v, iv.lo), b = cmp(v, iv.hi);
  return (a > 0 || (a === 0 && iv.loInc)) && (b < 0 || (b === 0 && iv.hiInc));
}

/** Does the exact version satisfy the range? Both are strings. */
export function satisfies(version, range) {
  const v = parseVersion(version);
  const r = parseRange(range);
  if (!v || !r) return false;
  return r.some((iv) => inInterval(v, iv));
}

/** Can ANY version satisfy both ranges (given as parsed interval lists)? */
export function intervalsIntersect(A, B) {
  return intersectLists(A, B).length > 0;
}

/** Does every alternative of the range have a finite upper bound? */
export function hasUpperBound(intervals) {
  return intervals.length > 0 && intervals.every((iv) => iv.hi[0] !== INF);
}

/** The single major a range is confined to, or null. */
export function confinedMajor(intervals) {
  if (intervals.length !== 1) return null;
  const { lo, hi, hiInc } = intervals[0];
  if (lo[0] === INF) return null;
  if (hi[0] === lo[0]) return lo[0];
  if (!hiInc && hi[0] === lo[0] + 1 && hi[1] === 0 && hi[2] === 0) return lo[0];
  return null;
}

function lowestMajor(intervals) {
  if (!intervals.length) return null;
  return Math.min(...intervals.map((iv) => iv.lo[0]));
}

// ------------------------------------------------------------ pin sources
const LTS_NAMES = {
  argon: 4, boron: 6, carbon: 8, dubnium: 10, erbium: 12, fermium: 14,
  gallium: 16, hydrogen: 18, iron: 20, jod: 22, krypton: 24,
};

/** Turn a version-file / tool-versions value into a range spec, or null for an
 * alias this tool will not guess at (`lts/*`, `node`, `latest`, ...). */
function specFromVersionText(text) {
  const t = text.trim().replace(/^v/i, "");
  const lts = /^lts\/([a-z]+)$/i.exec(t);
  if (lts && LTS_NAMES[lts[1].toLowerCase()] !== undefined) return String(LTS_NAMES[lts[1].toLowerCase()]);
  return /^\d/.test(t) ? t : null;
}

function stripComment(line) {
  return line.replace(/(^|\s)#.*$/, "$1").trimEnd();
}

function unquote(s) {
  const t = s.trim();
  const m = /^(['"])(.*)\1$/.exec(t);
  return m ? m[2] : t;
}

function parseVersionFile(text) {
  for (const line of text.split(/\r?\n/)) {
    const t = stripComment(line).trim();
    if (t) return t;
  }
  return "";
}

function parseToolVersions(text) {
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(nodejs|node)\s+(\S+)/.exec(stripComment(line));
    if (m) return m[2];
  }
  return null;
}

function dockerLogicalLines(text) {
  const out = [];
  let buf = "";
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*#/.test(raw) && buf === "") continue;
    if (/\\\s*$/.test(raw)) { buf += raw.replace(/\\\s*$/, " "); continue; }
    out.push((buf + raw).trim());
    buf = "";
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Every `FROM node:<tag>` as {raw, spec|null, reason}. */
function parseDockerfile(text) {
  const args = {};
  const out = [];
  for (const line of dockerLogicalLines(text)) {
    const a = /^ARG\s+([A-Za-z_]\w*)=(.*)$/i.exec(line);
    if (a) { args[a[1]] = unquote(a[2]); continue; }
    const f = /^FROM\s+(?:--\S+\s+)*(\S+)/i.exec(line);
    if (!f) continue;
    let ref = f[1].replace(/@sha256:\S+$/i, "");
    ref = ref.replace(/\$\{(\w+)(?::?-([^}]*))?\}|\$(\w+)/g, (all, n1, dflt, n2) => args[n1 || n2] ?? dflt ?? all);
    const slash = ref.lastIndexOf("/");
    const colon = ref.indexOf(":", slash + 1);
    const name = colon === -1 ? ref : ref.slice(0, colon);
    const tag = colon === -1 ? null : ref.slice(colon + 1);
    if (!/^(?:(?:docker\.io|index\.docker\.io)\/)?(?:library\/)?node$/i.test(name)) continue;
    if (tag === null) { out.push({ raw: ref, spec: null, reason: "an untagged `node` image means `latest`" }); continue; }
    if (tag.includes("$")) { out.push({ raw: ref, spec: null, reason: "the tag uses a variable with no ARG default" }); continue; }
    const m = /^v?(\d+(?:\.\d+){0,2})(?:$|-)/.exec(tag);
    out.push(m ? { raw: ref, spec: m[1] } : { raw: ref, spec: null, reason: `tag \`${tag}\` is a moving alias` });
  }
  return out;
}

function splitFlow(v) {
  return v.replace(/^\[/, "").replace(/\]\s*$/, "").split(",").map(unquote).filter((x) => x !== "");
}

function indentOf(line) {
  return line.match(/^\s*/)[0].length;
}

/** Values of `matrix.<key>` in a workflow: flow lists, block lists and
 * `include:` entries, all read from inside a `matrix:` mapping. */
function matrixValues(lines, key) {
  const out = [];
  const keyRe = new RegExp(`^(?:-\\s+)?${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.*)$`);
  for (let i = 0; i < lines.length; i += 1) {
    const mm = /^(\s*)matrix:\s*$/.exec(stripComment(lines[i]));
    if (!mm) continue;
    const base = mm[1].length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const l = stripComment(lines[j]);
      if (!l.trim()) continue;
      if (indentOf(l) <= base) break;
      const km = keyRe.exec(l.trim());
      if (!km) continue;
      const v = km[1].trim();
      if (v.startsWith("[")) out.push(...splitFlow(v));
      else if (v) out.push(unquote(v));
      else {
        for (let k = j + 1; k < lines.length; k += 1) {
          const lk = stripComment(lines[k]);
          if (!lk.trim()) continue;
          const im = /^\s*-\s+([^:]+?)\s*$/.exec(lk);
          if (!im) break;
          out.push(unquote(im[1]));
        }
      }
    }
  }
  return out;
}

/** Every actions/setup-node step's node-version / node-version-file. */
function parseWorkflow(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  const STEP_KEYS = /^-\s+(name|uses|run|id|if|env|with|shell|working-directory|continue-on-error|timeout-minutes):/;
  let isSetupNode = false;
  for (let i = 0; i < lines.length; i += 1) {
    const l = stripComment(lines[i]);
    const t = l.trim();
    if (STEP_KEYS.test(t)) isSetupNode = false;
    if (/^(?:-\s+)?uses:\s*['"]?actions\/setup-node@/.test(t)) isSetupNode = true;
    if (!isSetupNode) continue;
    const nv = /^(?:-\s+)?node-version:\s*(.*)$/.exec(t);
    const nf = /^(?:-\s+)?node-version-file:\s*(.*)$/.exec(t);
    if (nf) { out.push({ file: unquote(nf[1]) }); continue; }
    if (!nv) continue;
    const v = nv[1].trim();
    if (v === "") continue;
    if (v.startsWith("[")) { for (const x of splitFlow(v)) out.push({ raw: x, matrix: true }); continue; }
    const expr = /^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$/.exec(unquote(v));
    if (expr) {
      const vals = matrixValues(lines, expr[1]);
      if (vals.length) for (const x of vals) out.push({ raw: x, matrix: true });
      else out.push({ raw: unquote(v), unresolved: "the matrix values could not be read" });
      continue;
    }
    out.push({ raw: unquote(v) });
  }
  return out;
}

// ----------------------------------------------------------------- analysis
export const FINDING_KINDS = Object.freeze({
  PIN_VIOLATES_ENGINES: "pin-violates-engines",
  MAJOR_DISAGREEMENT: "major-disagreement",
  EOL_NODE: "eol-node",
  ENGINES_UNBOUNDED: "engines-unbounded",
  EOL_SOON: "eol-soon",
  ENGINES_ALLOWS_EOL: "engines-allows-eol",
  UNRESOLVED_PIN: "unresolved-pin",
  UNREADABLE: "unreadable-input",
});
// Notices are shown but never trip --fail-on-risk.
export const NOTICE_KINDS = new Set([
  FINDING_KINDS.EOL_SOON, FINDING_KINDS.ENGINES_ALLOWS_EOL, FINDING_KINDS.UNRESOLVED_PIN, FINDING_KINDS.UNREADABLE,
]);

const label = (pin) => (pin.source === baseOf(pin.file) ? pin.file : `${pin.file} (${pin.source})`);
const norm = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "");
const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p) => p.slice(p.lastIndexOf("/") + 1);

function classify(p) {
  const base = baseOf(p);
  if (p.split("/").includes("node_modules")) return null;
  if (base === "package.json") return "package";
  if (base === ".nvmrc") return "nvmrc";
  if (base === ".node-version") return "node-version";
  if (base === ".tool-versions") return "tool-versions";
  if (base.startsWith("Dockerfile") || base.toLowerCase().endsWith(".dockerfile")) return "dockerfile";
  if (/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) return "workflow";
  return null;
}

/** Analyze files: [{path, text}] -> {findings, pins, engines, today, tableDate}. */
export function analyze(files, { today = isoToday() } = {}) {
  const findings = [];
  const pkgs = new Map(); // dir -> {file, engines, intervals}
  const pins = [];
  const notice = (kind, file, message) => findings.push({ kind, severity: "notice", file, message });
  const entries = files.map((f) => ({ path: norm(f.path), text: f.text })).map((f) => ({ ...f, type: classify(f.path) }));
  const byPath = new Map(entries.map((e) => [e.path, e]));

  const addPin = (file, source, raw, spec, extra = {}) => {
    const intervals = spec === null ? null : parseRange(spec);
    if (spec !== null && (!intervals || !intervals.length)) {
      notice(FINDING_KINDS.UNRESOLVED_PIN, file, `${file}: ${source} value \`${raw}\` is not a version or range this tool can read, so it was not checked.`);
      return;
    }
    if (spec === null) {
      notice(FINDING_KINDS.UNRESOLVED_PIN, file, `${file}: ${source} value \`${raw}\` ${extra.reason ? `(${extra.reason})` : "is a moving alias"}, so it was not checked.`);
      return;
    }
    pins.push({ file, source, raw, spec, intervals, major: confinedMajor(intervals), matrix: Boolean(extra.matrix) });
  };

  for (const e of entries) {
    if (e.type === "package") {
      let json;
      try { json = JSON.parse(e.text); } catch {
        notice(FINDING_KINDS.UNREADABLE, e.path, `${e.path} is not valid JSON, so its engines.node and volta.node were not read.`);
        continue;
      }
      const eng = json && json.engines && typeof json.engines === "object" ? json.engines.node : undefined;
      let intervals = null;
      if (typeof eng === "string") {
        intervals = parseRange(eng);
        if (!intervals) notice(FINDING_KINDS.UNREADABLE, e.path, `${e.path}: engines.node \`${eng}\` is not a semver range this tool understands, so it was not checked.`);
      }
      pkgs.set(dirOf(e.path), { file: e.path, engines: typeof eng === "string" ? eng : null, intervals });
      const volta = json && json.volta && typeof json.volta === "object" ? json.volta.node : undefined;
      if (typeof volta === "string") addPin(e.path, "volta.node", volta, volta);
    }
  }

  for (const e of entries) {
    if (e.type === "nvmrc" || e.type === "node-version") {
      const raw = parseVersionFile(e.text);
      if (!raw) continue;
      addPin(e.path, baseOf(e.path), raw, specFromVersionText(raw));
    } else if (e.type === "tool-versions") {
      const raw = parseToolVersions(e.text);
      if (raw) addPin(e.path, ".tool-versions nodejs", raw, specFromVersionText(raw));
    } else if (e.type === "dockerfile") {
      for (const d of parseDockerfile(e.text)) addPin(e.path, "FROM", d.raw, d.spec, { reason: d.reason });
    } else if (e.type === "workflow") {
      for (const w of parseWorkflow(e.text)) {
        if (w.file !== undefined) {
          const target = norm(w.file);
          if (!byPath.has(target) && !/package\.json$/.test(target)) {
            notice(FINDING_KINDS.UNRESOLVED_PIN, e.path, `${e.path}: setup-node reads node-version-file \`${w.file}\`, which was not among the files given, so that pin was not checked.`);
          }
          continue;
        }
        if (w.unresolved) { notice(FINDING_KINDS.UNRESOLVED_PIN, e.path, `${e.path}: setup-node node-version \`${w.raw}\` (${w.unresolved}) so it was not checked.`); continue; }
        const raw = w.raw;
        if (/\$\{\{/.test(raw)) { notice(FINDING_KINDS.UNRESOLVED_PIN, e.path, `${e.path}: setup-node node-version \`${raw}\` is an expression this tool does not evaluate, so it was not checked.`); continue; }
        addPin(e.path, "setup-node", raw, specFromVersionText(raw) ?? (/^[<>=^~*xX]/.test(raw) ? raw : null), { matrix: w.matrix });
      }
    }
  }

  // The package.json that governs a path: workflows govern the root one;
  // everything else the nearest ancestor.
  const governing = (file, needEngines) => {
    let dir = /(^|\/)\.github\/workflows\//.test(file) ? "" : dirOf(file);
    for (;;) {
      const p = pkgs.get(dir);
      if (p && (!needEngines || p.intervals)) return { dir, pkg: p };
      if (dir === "") return { dir: pkgs.has("") ? "" : null, pkg: pkgs.get("") && (!needEngines || pkgs.get("").intervals) ? pkgs.get("") : null };
      dir = dirOf(dir);
    }
  };

  // 1. pins that cannot satisfy engines.node
  for (const pin of pins) {
    const { pkg } = governing(pin.file, true);
    if (!pkg || intervalsIntersect(pin.intervals, pkg.intervals)) continue;
    findings.push({
      kind: FINDING_KINDS.PIN_VIOLATES_ENGINES, severity: "risk", file: pin.file,
      message: `${label(pin)} pins Node.js \`${pin.raw}\`, but ${pkg.file} engines.node is \`${pkg.engines}\` -- no version matching the pin satisfies it.`,
    });
  }

  // 2. non-matrix pins that disagree on major, grouped per governing package
  const groups = new Map();
  for (const pin of pins) {
    if (pin.matrix || pin.major === null) continue;
    const key = governing(pin.file, false).dir ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pin);
  }
  for (const [, group] of groups) {
    const majors = [...new Set(group.map((p) => p.major))].sort((a, b) => a - b);
    if (majors.length < 2) continue;
    const detail = majors.map((m) => `Node ${m}: ${group.filter((p) => p.major === m).map((p) => `${label(p)} \`${p.raw}\``).join(", ")}`).join("; ");
    findings.push({
      kind: FINDING_KINDS.MAJOR_DISAGREEMENT, severity: "risk", file: group[0].file,
      message: `Pins disagree on the Node.js major version -- ${detail}.`,
    });
  }

  // 3. end-of-life majors (matrix entries included)
  for (const pin of pins) {
    if (pin.major === null) continue;
    const row = eolFor(pin.major);
    if (!row) continue;
    const dated = /^\d/.test(row.eol);
    if (!dated || today >= row.eol) {
      findings.push({
        kind: FINDING_KINDS.EOL_NODE, severity: "risk", file: pin.file,
        message: `${label(pin)} uses Node.js ${pin.major} (\`${pin.raw}\`), which reached end-of-life ${row.approx ? "about " : ""}${row.eol} (per the table dated ${TABLE_DATE}; check nodejs.org for the current schedule).`,
      });
    } else if (daysBetween(today, row.eol) <= EOL_SOON_DAYS) {
      findings.push({
        kind: FINDING_KINDS.EOL_SOON, severity: "notice", file: pin.file,
        message: `${label(pin)} uses Node.js ${pin.major} (\`${pin.raw}\`), which reaches end-of-life ${row.approx ? "about " : ""}${row.eol} -- ${daysBetween(today, row.eol)} day(s) from ${today}.`,
      });
    }
  }

  // 4. engines.node with no upper bound and nothing pinned; plus the notice
  // when its lower bound already allows an end-of-life major.
  for (const pkg of pkgs.values()) {
    if (!pkg.intervals) continue;
    const pinned = pins.some((p) => governing(p.file, true).pkg === pkg);
    if (!hasUpperBound(pkg.intervals) && !pinned) {
      findings.push({
        kind: FINDING_KINDS.ENGINES_UNBOUNDED, severity: "risk", file: pkg.file,
        message: `${pkg.file}: engines.node \`${pkg.engines}\` has no upper bound and no .nvmrc, .node-version, .tool-versions, Dockerfile, Volta or setup-node pin was found, so any future Node.js major satisfies it untested.`,
      });
    }
    const low = lowestMajor(pkg.intervals);
    const row = low === null ? null : eolFor(low);
    if (row && (!/^\d/.test(row.eol) || today >= row.eol)) {
      notice(FINDING_KINDS.ENGINES_ALLOWS_EOL, pkg.file, `${pkg.file}: engines.node \`${pkg.engines}\` still allows Node.js ${low}, which reached end-of-life ${row.eol}.`);
    }
  }

  const order = { risk: 0, notice: 1 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
  return {
    today, tableDate: TABLE_DATE,
    engines: [...pkgs.values()].filter((p) => p.engines).map((p) => ({ file: p.file, range: p.engines })),
    pins: pins.map(({ file, source, raw, major, matrix }) => ({ file, source, raw, major, matrix })),
    findings,
  };
}

export function hasRisk(report) {
  const list = Array.isArray(report) ? report : report.findings;
  return list.some((f) => f.severity === "risk");
}

export function describeFinding(f) {
  return `${f.severity === "risk" ? "[risk]" : "[note]"} ${f.kind}: ${f.message}`;
}

export function summarize(report) {
  const risks = report.findings.filter((f) => f.severity === "risk").length;
  const notes = report.findings.length - risks;
  const seen = `${report.engines.length} engines.node range(s) and ${report.pins.length} Node.js pin(s)`;
  if (risks === 0) {
    return `No Node.js version drift found across ${seen}${notes ? ` (${notes} notice(s))` : ""}. EOL table dated ${report.tableDate}, evaluated as of ${report.today}.`;
  }
  return `${risks} drift finding(s)${notes ? ` and ${notes} notice(s)` : ""} across ${seen}. EOL table dated ${report.tableDate}, evaluated as of ${report.today}.`;
}
