// CVSS v3.0 / v3.1 vector engine: parse, score, explain, diff, and audit pasted
// advisories for a stated score that does not match its own vector.
//
// The formulas and weights are the ones published in FIRST's "Common
// Vulnerability Scoring System v3.1: Specification Document" (section 7) and the
// v3.0 specification; the code is this repository's own. The scores are checked
// against an independent implementation (Red Hat's `cvss` Python package, used
// only as a test oracle, never vendored) on randomly generated vectors:
// see `oracle/` and the README.
//
// Pure module: no imports, no network, no clock, no randomness.

export const METRICS = [
  // [key, group, name, values: [[code, words, weight]]]
  ["AV", "base", "Attack Vector", [["N", "Network", 0.85], ["A", "Adjacent", 0.62], ["L", "Local", 0.55], ["P", "Physical", 0.2]]],
  ["AC", "base", "Attack Complexity", [["L", "Low", 0.77], ["H", "High", 0.44]]],
  ["PR", "base", "Privileges Required", [["N", "None", 0.85], ["L", "Low", 0.62], ["H", "High", 0.27]]],
  ["UI", "base", "User Interaction", [["N", "None", 0.85], ["R", "Required", 0.62]]],
  ["S", "base", "Scope", [["U", "Unchanged", null], ["C", "Changed", null]]],
  ["C", "base", "Confidentiality", [["H", "High", 0.56], ["L", "Low", 0.22], ["N", "None", 0]]],
  ["I", "base", "Integrity", [["H", "High", 0.56], ["L", "Low", 0.22], ["N", "None", 0]]],
  ["A", "base", "Availability", [["H", "High", 0.56], ["L", "Low", 0.22], ["N", "None", 0]]],
  ["E", "temporal", "Exploit Code Maturity", [["X", "Not Defined", 1], ["H", "High", 1], ["F", "Functional", 0.97], ["P", "Proof-of-Concept", 0.94], ["U", "Unproven", 0.91]]],
  ["RL", "temporal", "Remediation Level", [["X", "Not Defined", 1], ["U", "Unavailable", 1], ["W", "Workaround", 0.97], ["T", "Temporary Fix", 0.96], ["O", "Official Fix", 0.95]]],
  ["RC", "temporal", "Report Confidence", [["X", "Not Defined", 1], ["C", "Confirmed", 1], ["R", "Reasonable", 0.96], ["U", "Unknown", 0.92]]],
  ["CR", "environmental", "Confidentiality Requirement", [["X", "Not Defined", 1], ["H", "High", 1.5], ["M", "Medium", 1], ["L", "Low", 0.5]]],
  ["IR", "environmental", "Integrity Requirement", [["X", "Not Defined", 1], ["H", "High", 1.5], ["M", "Medium", 1], ["L", "Low", 0.5]]],
  ["AR", "environmental", "Availability Requirement", [["X", "Not Defined", 1], ["H", "High", 1.5], ["M", "Medium", 1], ["L", "Low", 0.5]]],
  ["MAV", "environmental", "Modified Attack Vector", [["X", "Not Defined"], ["N", "Network"], ["A", "Adjacent"], ["L", "Local"], ["P", "Physical"]]],
  ["MAC", "environmental", "Modified Attack Complexity", [["X", "Not Defined"], ["L", "Low"], ["H", "High"]]],
  ["MPR", "environmental", "Modified Privileges Required", [["X", "Not Defined"], ["N", "None"], ["L", "Low"], ["H", "High"]]],
  ["MUI", "environmental", "Modified User Interaction", [["X", "Not Defined"], ["N", "None"], ["R", "Required"]]],
  ["MS", "environmental", "Modified Scope", [["X", "Not Defined"], ["U", "Unchanged"], ["C", "Changed"]]],
  ["MC", "environmental", "Modified Confidentiality", [["X", "Not Defined"], ["H", "High"], ["L", "Low"], ["N", "None"]]],
  ["MI", "environmental", "Modified Integrity", [["X", "Not Defined"], ["H", "High"], ["L", "Low"], ["N", "None"]]],
  ["MA", "environmental", "Modified Availability", [["X", "Not Defined"], ["H", "High"], ["L", "Low"], ["N", "None"]]],
];

const BY_KEY = Object.fromEntries(METRICS.map(([key, group, name, values]) => [key, { key, group, name, values: Object.fromEntries(values.map(([c, w, wt]) => [c, { words: w, weight: wt }])) }]));
export const ORDER = METRICS.map((m) => m[0]);
export const BASE_KEYS = ORDER.slice(0, 8);
const PR_CHANGED = new Map([["N", 0.85], ["L", 0.68], ["H", 0.5]]);

/** CVSS v3.1 Roundup (spec Appendix A): integer arithmetic, so 4.000000000001 stays 4.0. */
export function roundup31(x) {
  const i = Math.round(x * 100000);
  if (i % 10000 === 0) return i / 100000;
  return (Math.floor(i / 10000) + 1) / 10;
}

/**
 * CVSS v3.0 Roundup: "the smallest number, specified to one decimal place,
 * that is equal to or higher than its input". Taken mathematically: the
 * floating-point noise in, say, 5.0 * 0.92 = 4.6000000000000005 is removed
 * before the ceiling, so the answer is 4.6 as the arithmetic intends.
 */
export function roundup30(x) {
  return Math.ceil(Number((x * 10).toFixed(9))) / 10;
}

/** The naive v3.0 Roundup, Math.ceil(x * 10) / 10, which turns 5.0 * 0.92 into 4.7. Some calculators shipped it. */
export function roundup30Naive(x) {
  return Math.ceil(x * 10) / 10;
}

export function severity(score) {
  if (score == null || Number.isNaN(score)) return null;
  if (score === 0) return "None";
  if (score < 4) return "Low";
  if (score < 7) return "Medium";
  if (score < 9) return "High";
  return "Critical";
}

const PREFIX = /^CVSS:(3\.[01])\/(.*)$/;

/**
 * Parse a CVSS v3.x vector. Never throws: returns { valid, version, metrics, errors, findings }.
 * `metrics` holds every metric, temporal and environmental ones defaulting to X.
 */
export function parseVector(input, { defaultVersion = "3.1" } = {}) {
  const raw = String(input ?? "").trim();
  const errors = [];
  const findings = [];
  let version = defaultVersion;
  let body = raw;
  const m = raw.match(PREFIX);
  if (m) {
    version = m[1];
    body = m[2];
  } else if (/^CVSS:/i.test(raw)) {
    const v = raw.slice(5).split("/")[0];
    errors.push(/^4/.test(v) ? `CVSS ${v} is not scored here: this tool covers CVSS v3.0 and v3.1.` : `Unknown prefix "${raw.split("/")[0]}": expected CVSS:3.0 or CVSS:3.1.`);
    return { valid: false, input: raw, version: null, metrics: {}, given: [], errors, findings };
  } else if (/\bAu:[MSN]\b/.test(raw) || /\bC:[NPC]\b/.test(raw)) {
    errors.push("This looks like a CVSS v2 vector (Au:, or C/I/A of N, P or C). This tool scores CVSS v3.0 and v3.1 only.");
    return { valid: false, input: raw, version: null, metrics: {}, given: [], errors, findings };
  } else if (raw) {
    findings.push({ severity: "low", code: "no-prefix", message: `No CVSS:3.x prefix, so it was scored as CVSS ${defaultVersion}. A vector without the prefix is not a valid v3 vector string; add "CVSS:${defaultVersion}/".` });
  }
  if (!body) {
    errors.push("Empty vector.");
    return { valid: false, input: raw, version, metrics: {}, given: [], errors, findings };
  }
  const metrics = {};
  const given = [];
  for (const part of body.split("/")) {
    if (part === "") {
      errors.push("Empty field (a doubled or trailing /).");
      continue;
    }
    const [k, v, ...rest] = part.split(":");
    const def = Object.hasOwn(BY_KEY, k) ? BY_KEY[k] : null;
    if (!def || v === undefined || rest.length) {
      errors.push(`"${part}" is not a CVSS v3 metric.`);
      continue;
    }
    if (!Object.hasOwn(def.values, v)) {
      errors.push(`${k}:${v} is not allowed; ${def.name} takes ${Object.keys(def.values).join(", ")}.`);
      continue;
    }
    if (Object.hasOwn(metrics, k)) {
      errors.push(`${k} appears twice (${k}:${metrics[k]} and ${k}:${v}); a metric may be given only once.`);
      continue;
    }
    metrics[k] = v;
    given.push(k);
  }
  const missing = BASE_KEYS.filter((k) => !(k in metrics));
  if (missing.length) errors.push(`Missing base metric${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. All eight base metrics are required.`);
  for (const k of ORDER) if (!(k in metrics) && BY_KEY[k].group !== "base") metrics[k] = "X";
  if (!errors.length) {
    const positions = given.map((k) => ORDER.indexOf(k));
    if (positions.some((p, i) => i && p < positions[i - 1])) {
      findings.push({ severity: "info", code: "order", message: `Metrics are not in the specification's order (${ORDER.filter((k) => given.includes(k)).join("/")}). The score is the same; some strict parsers and databases compare vectors as strings.`, canonical: canonicalVector({ version, metrics }) });
    }
    const explicitX = given.filter((k) => metrics[k] === "X");
    if (explicitX.length) findings.push({ severity: "info", code: "explicit-x", message: `${explicitX.join(", ")} ${explicitX.length > 1 ? "are" : "is"} written as X (Not Defined), which is the same as leaving ${explicitX.length > 1 ? "them" : "it"} out.` });
  }
  return { valid: errors.length === 0, input: raw, version, metrics, given, errors, findings };
}

/** The vector with metrics in specification order and Not Defined (X) metrics dropped. */
export function canonicalVector({ version, metrics }) {
  return `CVSS:${version}/` + ORDER.filter((k) => metrics[k] && (BY_KEY[k].group === "base" || metrics[k] !== "X")).map((k) => `${k}:${metrics[k]}`).join("/");
}

const w = (k, v) => BY_KEY[k].values[v].weight;

/** All three scores and their parts for parsed metrics, under one version's formulas. */
export function scoreMetrics(metrics, version = "3.1", { naiveRoundup = false } = {}) {
  const roundup = version === "3.0" ? (naiveRoundup ? roundup30Naive : roundup30) : roundup31;
  const M = metrics;
  // Base
  const changed = M.S === "C";
  const iss = 1 - (1 - w("C", M.C)) * (1 - w("I", M.I)) * (1 - w("A", M.A));
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  const pr = changed ? PR_CHANGED.get(M.PR) : w("PR", M.PR);
  const exploitability = 8.22 * w("AV", M.AV) * w("AC", M.AC) * pr * w("UI", M.UI);
  const base = impact <= 0 ? 0 : roundup(Math.min((changed ? 1.08 : 1) * (impact + exploitability), 10));
  // Temporal
  const tmult = w("E", M.E) * w("RL", M.RL) * w("RC", M.RC);
  const temporal = roundup(base * tmult);
  // Environmental: a modified metric left at X takes the base value.
  const mod = (k) => (M["M" + k] && M["M" + k] !== "X" ? M["M" + k] : M[k]);
  const mChanged = mod("S") === "C";
  const req = (k) => w(k, M[k]);
  const miss = Math.min(1 - (1 - req("CR") * w("C", mod("C"))) * (1 - req("IR") * w("I", mod("I"))) * (1 - req("AR") * w("A", mod("A"))), 0.915);
  const mImpact = mChanged
    ? version === "3.0"
      ? 7.52 * (miss - 0.029) - 3.25 * Math.pow(miss - 0.02, 15)
      : 7.52 * (miss - 0.029) - 3.25 * Math.pow(miss * 0.9731 - 0.02, 13)
    : 6.42 * miss;
  const mpr = mChanged ? PR_CHANGED.get(mod("PR")) : w("PR", mod("PR"));
  const mExploitability = 8.22 * w("AV", mod("AV")) * w("AC", mod("AC")) * mpr * w("UI", mod("UI"));
  const environmental = mImpact <= 0 ? 0 : roundup(roundup(Math.min((mChanged ? 1.08 : 1) * (mImpact + mExploitability), 10)) * tmult);
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    version,
    base, temporal, environmental,
    baseSeverity: severity(base), temporalSeverity: severity(temporal), environmentalSeverity: severity(environmental),
    impact: impact <= 0 ? 0 : r1(impact), exploitability: r1(exploitability),
    modifiedImpact: mImpact <= 0 ? 0 : r1(mImpact), modifiedExploitability: r1(mExploitability),
    iss, miss,
  };
}

const hasGroup = (p, group) => p.given.some((k) => BY_KEY[k].group === group && p.metrics[k] !== "X");

/** Parse and score one vector, with words for every metric and the other version's scores beside it. */
export function explain(vector, opts = {}) {
  const p = parseVector(vector, opts);
  if (!p.valid) return { ...p, scores: null };
  const scores = scoreMetrics(p.metrics, p.version);
  const other = p.version === "3.1" ? "3.0" : "3.1";
  const alt = scoreMetrics(p.metrics, other);
  const findings = [...p.findings];
  for (const k of ["base", "temporal", "environmental"]) {
    if (alt[k] !== scores[k] && (k === "base" || hasGroup(p, k))) {
      findings.push({ severity: "info", code: "version-diff", message: `Under CVSS ${other} the ${k} score would be ${alt[k].toFixed(1)}, not ${scores[k].toFixed(1)}. ${k === "environmental" && (p.metrics.MS === "C" || (p.metrics.MS === "X" && p.metrics.S === "C")) ? "v3.1 changed the Modified Impact formula for a changed scope (and redefined Roundup)." : "v3.1 redefined Roundup to remove floating-point error."}}` });
    }
  }
  const metrics = ORDER.map((k) => ({ key: k, group: BY_KEY[k].group, name: BY_KEY[k].name, value: p.metrics[k], words: BY_KEY[k].values[p.metrics[k]].words, given: p.given.includes(k) }));
  return { valid: true, input: p.input, version: p.version, vector: canonicalVector(p), metrics, scores, otherVersion: alt, hasTemporal: hasGroup(p, "temporal"), hasEnvironmental: hasGroup(p, "environmental"), errors: [], findings };
}

/** The scores of a vector with every base metric set to each of its other values in turn. */
export function sensitivity(vector, opts = {}) {
  const p = parseVector(vector, opts);
  if (!p.valid) return { valid: false, errors: p.errors, rows: [] };
  const now = scoreMetrics(p.metrics, p.version).base;
  const rows = [];
  for (const k of BASE_KEYS) {
    for (const v of Object.keys(BY_KEY[k].values)) {
      if (v === p.metrics[k]) continue;
      const base = scoreMetrics({ ...p.metrics, [k]: v }, p.version).base;
      rows.push({ metric: k, name: BY_KEY[k].name, from: p.metrics[k], to: v, words: BY_KEY[k].values[v].words, base, delta: Math.round((base - now) * 10) / 10, severity: severity(base), crossesBand: severity(base) !== severity(now) });
    }
  }
  return { valid: true, base: now, severity: severity(now), rows };
}

/**
 * Compare two vectors: every metric that differs, and what each difference
 * alone does to A's scores. CVSS is not additive, so the steps need not sum.
 */
export function diffVectors(a, b, opts = {}) {
  const pa = parseVector(a, opts);
  const pb = parseVector(b, opts);
  if (!pa.valid || !pb.valid) return { valid: false, errors: [...pa.errors.map((e) => `A: ${e}`), ...pb.errors.map((e) => `B: ${e}`)] };
  const version = pa.version;
  const sa = scoreMetrics(pa.metrics, version);
  const sb = scoreMetrics(pb.metrics, version);
  const differences = [];
  for (const k of ORDER) {
    if (pa.metrics[k] === pb.metrics[k]) continue;
    const alone = scoreMetrics({ ...pa.metrics, [k]: pb.metrics[k] }, version);
    differences.push({
      metric: k, name: BY_KEY[k].name, group: BY_KEY[k].group,
      a: pa.metrics[k], b: pb.metrics[k], aWords: BY_KEY[k].values[pa.metrics[k]].words, bWords: BY_KEY[k].values[pb.metrics[k]].words,
      alone: { base: alone.base, temporal: alone.temporal, environmental: alone.environmental },
      baseDelta: Math.round((alone.base - sa.base) * 10) / 10,
    });
  }
  differences.sort((x, y) => Math.abs(y.baseDelta) - Math.abs(x.baseDelta) || ORDER.indexOf(x.metric) - ORDER.indexOf(y.metric));
  const notes = [];
  if (pa.version !== pb.version) notes.push(`A is CVSS ${pa.version} and B is CVSS ${pb.version}; both were scored with ${version} formulas here. B under its own version scores ${scoreMetrics(pb.metrics, pb.version).base.toFixed(1)}.`);
  const sum = Math.round(differences.reduce((s, d) => s + d.baseDelta, 0) * 10) / 10;
  const total = Math.round((sb.base - sa.base) * 10) / 10;
  if (differences.length > 1 && sum !== total) notes.push(`The one-at-a-time steps add up to ${sum >= 0 ? "+" : ""}${sum.toFixed(1)} but the whole change is ${total >= 0 ? "+" : ""}${total.toFixed(1)}: CVSS multiplies its factors, so metrics interact.`);
  return { valid: true, version, a: { vector: canonicalVector(pa), scores: sa }, b: { vector: canonicalVector({ version: pb.version, metrics: pb.metrics }), scores: sb }, differences, baseDelta: total, notes, same: differences.length === 0 };
}

// ---------------------------------------------------------------------------
// Audit: find every vector in pasted text or JSON and check its stated score.

const VECTOR_RE = /CVSS:3\.[01](?:\/[A-Z]{1,3}:[A-Z])+/g;
const SCORE_KEY = /^(base_?score|cvss_?(v3_?)?score|cvss3_?score|score)$/i;
const SEVERITY_KEY = /^(base_?severity|severity|cvss_?severity)$/i;
const SEVERITY_WORD = /\b(critical|high|medium|moderate|low|none)\b/i;
const normalSeverity = (s) => {
  const t = String(s).toLowerCase();
  if (t === "moderate") return "Medium";
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function fromJson(value, path, out) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => fromJson(v, `${path}[${i}]`, out));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") for (const m of value.matchAll(VECTOR_RE)) out.push({ vector: m[0], where: path || "$", stated: null, statedSeverity: null });
    return;
  }
  let vecKey = null;
  for (const [k, v] of Object.entries(value)) if (typeof v === "string" && /^CVSS:3\.[01]\//.test(v.trim())) { vecKey = k; break; }
  if (vecKey) {
    let stated = null, statedKey = null, statedSeverity = null;
    for (const [k, v] of Object.entries(value)) {
      if (k === vecKey) continue;
      if (stated == null && SCORE_KEY.test(k)) {
        const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,2}(\.\d+)?$/.test(v.trim()) ? Number(v) : null;
        if (n != null && n >= 0 && n <= 10) { stated = n; statedKey = k; }
      }
      if (statedSeverity == null && SEVERITY_KEY.test(k) && typeof v === "string" && SEVERITY_WORD.test(v) && v.trim().split(/\s+/).length === 1) statedSeverity = normalSeverity(v.trim());
    }
    out.push({ vector: value[vecKey].trim(), where: `${path || "$"}.${vecKey}`, stated, statedKey, statedSeverity });
  }
  for (const [k, v] of Object.entries(value)) if (k !== vecKey) fromJson(v, `${path || "$"}.${k}`, out);
}

function fromText(text, out) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const vectors = [...line.matchAll(VECTOR_RE)];
    vectors.forEach((m, j) => {
      // Only text outside every vector on the line, and between this vector and its neighbours, can be its score.
      const lo = j ? vectors[j - 1].index + vectors[j - 1][0].length : 0;
      const hi = j + 1 < vectors.length ? vectors[j + 1].index : line.length;
      const left = line.slice(lo, m.index);
      const right = line.slice(m.index + m[0].length, hi);
      const nums = [];
      for (const n of left.matchAll(/(?<![\w.:\/-])(10\.0|10|\d\.\d)(?![\w.:\/-]|\.\d)/g)) nums.push({ v: Number(n[1]), d: left.length - n.index });
      for (const n of right.matchAll(/(?<![\w.:\/-])(10\.0|10|\d\.\d)(?![\w.:\/-]|\.\d)/g)) nums.push({ v: Number(n[1]), d: n.index });
      nums.sort((x, y) => x.d - y.d);
      const sev = (left + " " + right).match(new RegExp(SEVERITY_WORD.source, "gi"));
      out.push({ vector: m[0], where: `line ${i + 1}`, stated: nums.length ? nums[0].v : null, statedSeverity: sev && sev.length === 1 ? normalSeverity(sev[0]) : null });
    });
  });
}

/** Every CVSS v3 vector in `text` (JSON or plain text), rescored, with stated scores and labels checked. */
export function audit(text) {
  const src = String(text ?? "");
  const found = [];
  let format = "text";
  const trimmed = src.trim();
  if (/^[\[{]/.test(trimmed)) {
    try {
      fromJson(JSON.parse(trimmed), "$", found);
      format = "json";
    } catch {
      found.length = 0;
    }
  }
  if (format === "text") fromText(src, found);
  const rows = found.map((f) => {
    const x = explain(f.vector);
    const row = { where: f.where, vector: f.vector, stated: f.stated, statedSeverity: f.statedSeverity, valid: x.valid, errors: x.errors, status: "ok", problems: [] };
    if (!x.valid) {
      row.status = "invalid";
      row.problems.push(...x.errors);
      return row;
    }
    Object.assign(row, { version: x.version, base: x.scores.base, temporal: x.scores.temporal, environmental: x.scores.environmental, severity: x.scores.baseSeverity, otherVersionBase: x.otherVersion.base });
    if (f.stated != null && Math.abs(f.stated - x.scores.base) > 1e-9) {
      const explainers = [];
      if (x.hasTemporal && f.stated === x.scores.temporal) explainers.push("it equals the temporal score");
      if (x.hasEnvironmental && f.stated === x.scores.environmental) explainers.push("it equals the environmental score");
      if (x.version === "3.0") {
        const naive = scoreMetrics(parseVector(f.vector).metrics, "3.0", { naiveRoundup: true });
        const which = ["base", "temporal", "environmental"].find((k) => naive[k] !== x.scores[k] && f.stated === naive[k] && (k === "base" || (k === "temporal" ? x.hasTemporal : x.hasEnvironmental)));
        if (which) explainers.push(`it equals the ${which} score a floating-point Math.ceil Roundup gives (exact: ${x.scores[which].toFixed(1)})`);
      }
      if (f.stated === x.otherVersion.base) explainers.push(`it equals the CVSS ${x.version === "3.1" ? "3.0" : "3.1"} base score`);
      row.status = explainers.length ? "explained" : "mismatch";
      row.problems.push(`Stated score ${f.stated.toFixed(1)} but the vector's ${x.version} base score is ${x.scores.base.toFixed(1)}${explainers.length ? `; ${explainers.join(" and ")}` : ""}.`);
    }
    if (f.statedSeverity) {
      const expect = f.stated != null ? severity(f.stated) : x.scores.baseSeverity;
      if (f.statedSeverity !== expect) {
        if (row.status === "ok") row.status = "mismatch";
        row.problems.push(f.stated != null ? `Labelled ${f.statedSeverity}, but a score of ${f.stated.toFixed(1)} is ${expect}.` : `Labelled ${f.statedSeverity}, but the vector's base score ${x.scores.base.toFixed(1)} is ${expect}.`);
      } else if (f.stated != null && f.statedSeverity !== x.scores.baseSeverity) {
        row.problems.push(`The label ${f.statedSeverity} fits the stated score but not the vector, whose base score ${x.scores.base.toFixed(1)} is ${x.scores.baseSeverity}.`);
      }
    }
    if (x.findings.some((g) => g.code === "order")) row.problems.push("Metrics out of specification order.");
    return row;
  });
  const count = (s) => rows.filter((r) => r.status === s).length;
  return {
    format,
    rows,
    totals: { vectors: rows.length, withStatedScore: rows.filter((r) => r.stated != null).length, ok: count("ok"), mismatch: count("mismatch"), explained: count("explained"), invalid: count("invalid") },
  };
}

const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The audit as CSV, with spreadsheet formula characters neutralised. */
export function auditCsv(result) {
  const head = ["where", "vector", "version", "stated_score", "stated_severity", "base", "temporal", "environmental", "severity", "status", "problems"];
  const lines = [head.join(",")];
  for (const r of result.rows) lines.push([r.where, r.vector, r.version, r.stated, r.statedSeverity, r.base, r.temporal, r.environmental, r.severity, r.status, r.problems.join(" ")].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

/** One entry point for agents and the page: `vector`, optional `compare`, optional `text` to audit. */
export function analyze({ vector = "", compare = "", text = "" } = {}) {
  const out = {};
  if (String(vector).trim()) {
    out.explain = explain(vector);
    if (out.explain.valid) out.sensitivity = sensitivity(vector);
    if (String(compare).trim()) out.diff = diffVectors(vector, compare);
  }
  if (String(text).trim()) out.audit = audit(text);
  return out;
}

export const EXAMPLE = {
  vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
  compare: "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:H",
  text: [
    "ID,Package,Vector,Score,Severity",
    "ADV-1,libexample,CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H,9.8,Critical",
    "ADV-2,parser-kit,CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N,6.4,Medium",
    "ADV-3,img-tools,CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H,7.8,Medium",
    "ADV-4,net-utils,CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C,8.8,High",
    "ADV-5,auth-lib,CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N,7.5,High",
  ].join("\n"),
};
