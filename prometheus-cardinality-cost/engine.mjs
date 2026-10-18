// Zero-dependency, deterministic analysis of a Prometheus / OpenMetrics text
// exposition (what `curl host:port/metrics` prints): how many active time
// series each metric produces, which label is responsible, how many series
// dropping that label would remove (computed exactly, not guessed), and what
// that many series cost on a hosted metrics plan. Pure string in, report out --
// no filesystem or network here (cli.mjs and index.html supply the text).
//
// This is a calculator over ONE scrape, not a bill. It cannot see how many
// targets you run, how labels churn over time, or your negotiated price, so
// `targets` and the prices are inputs you set, labelled as such everywhere.

// ILLUSTRATIVE and dated: vendors reprice and count differently, so every
// number is overridable (`--prices file.json`, or the price boxes in the
// browser page). `perThousand` is USD per 1,000 active series per month and
// `free` is the series allowance deducted before billing.
export const PRICES_AS_OF = "2025-01 list prices; verify against the vendor's pricing page";
export const DEFAULT_PRICES = {
  "grafana-cloud": { label: "Grafana Cloud (active series)", perThousand: 8, free: 10000 },
  "datadog-custom": { label: "Datadog custom metrics (approx.; Datadog counts tag combinations and histogram aggregations its own way)", perThousand: 50, free: 0 },
};

// Label names that, on a service metric, almost always carry one value per
// request/user/object and therefore grow without bound.
const UNBOUNDED_NAMES = /^(?:user_?id|userid|user|session(?:_?id)?|request_?id|req_?id|trace_?id|span_?id|correlation_?id|uuid|guid|email|ip|client_?ip|remote_?addr|url|uri|full_?path|query|order_?id|customer_?id|account_?id|tenant_?id|device_?id|container_?id|pod_?uid|ts|timestamp)$/i;
const SPECIAL_LABELS = new Set(["le", "quantile"]); // part of histogram/summary shape, never "dropped"

export const DEFAULT_THRESHOLD = 50; // distinct values in one label before it is flagged

/**
 * Parses one exposition line's `name{labels} value [timestamp] [# exemplar]`.
 * Returns null for comments/blank/malformed lines. Handles quoted label values
 * containing commas, braces, `\"`, `\\` and `\n`.
 */
export function parseSampleLine(line) {
  const s = line.trim();
  if (!s || s.startsWith("#")) return null;
  const m = /^([A-Za-z_:][A-Za-z0-9_:]*)/.exec(s);
  if (!m) return null;
  const name = m[1];
  let i = name.length;
  const labels = [];
  if (s[i] === "{") {
    i += 1;
    while (i < s.length) {
      while (s[i] === " " || s[i] === ",") i += 1;
      if (s[i] === "}") { i += 1; break; }
      const km = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"/.exec(s.slice(i));
      if (!km) return null;
      i += km[0].length;
      let val = "";
      let closed = false;
      while (i < s.length) {
        const ch = s[i];
        if (ch === "\\" && i + 1 < s.length) { val += s[i + 1] === "n" ? "\n" : s[i + 1]; i += 2; continue; }
        if (ch === '"') { closed = true; i += 1; break; }
        val += ch; i += 1;
      }
      if (!closed) return null;
      labels.push([km[1], val]);
    }
  }
  const rest = s.slice(i).trim();
  if (!rest) return null; // a sample needs a value
  const valueTok = rest.split(/\s+/)[0];
  if (!/^[+-]?(?:\d|\.\d|Inf|NaN)/i.test(valueTok)) return null;
  return { name, labels };
}

function familyOf(name, types) {
  for (const suffix of ["_bucket", "_sum", "_count", "_total", "_created"]) {
    if (name.endsWith(suffix)) {
      const base = name.slice(0, -suffix.length);
      const t = types.get(base);
      if (t === "histogram" || t === "summary" || t === "gaugehistogram") return { family: base, type: t };
      if (suffix === "_total" && t === "counter") return { family: base, type: t };
    }
  }
  return { family: name, type: types.get(name) || "untyped" };
}

/** Parses a whole exposition into families of unique series. Duplicate series count once. */
export function parseExposition(text) {
  const types = new Map();
  const lines = String(text ?? "").split(/\r?\n/);
  for (const line of lines) {
    const m = /^#\s*TYPE\s+(\S+)\s+(\S+)/.exec(line);
    if (m) types.set(m[1], m[2].toLowerCase());
  }
  const families = new Map();
  let samples = 0;
  let skipped = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const p = parseSampleLine(line);
    if (!p) { skipped += 1; continue; }
    samples += 1;
    const { family, type } = familyOf(p.name, types);
    let fam = families.get(family);
    if (!fam) { fam = { name: family, type, series: new Map() }; families.set(family, fam); }
    const sorted = [...p.labels].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const key = `${p.name}\u0000${sorted.map(([k, v]) => `${k}=${v}`).join("\u0001")}`;
    if (!fam.series.has(key)) fam.series.set(key, { name: p.name, labels: sorted });
  }
  return { families: [...families.values()], samples, skipped };
}

function distinctWithout(series, drop) {
  const seen = new Set();
  for (const s of series) {
    seen.add(`${s.name}\u0000${s.labels.filter(([k]) => k !== drop).map(([k, v]) => `${k}=${v}`).join("\u0001")}`);
  }
  return seen.size;
}

/** Per-family analysis: series count, label cardinalities, exact savings from dropping each label. */
export function analyze(parsed, { threshold = DEFAULT_THRESHOLD } = {}) {
  const families = [];
  const findings = [];
  for (const fam of parsed.families) {
    const series = [...fam.series.values()];
    const values = new Map();
    for (const s of series) for (const [k, v] of s.labels) {
      if (!values.has(k)) values.set(k, new Set());
      values.get(k).add(v);
    }
    const labels = [...values.entries()]
      .map(([name, set]) => ({ name, distinct: set.size, drop: null }))
      .sort((a, b) => b.distinct - a.distinct || (a.name < b.name ? -1 : 1));
    for (const l of labels) {
      if (SPECIAL_LABELS.has(l.name)) continue;
      const after = distinctWithout(series, l.name);
      l.drop = { remaining: after, saved: series.length - after };
    }
    const row = { name: fam.name, type: fam.type, series: series.length, labels };
    families.push(row);

    for (const l of labels) {
      if (SPECIAL_LABELS.has(l.name)) continue;
      if (UNBOUNDED_NAMES.test(l.name) && l.distinct > 1) {
        findings.push({ metric: fam.name, label: l.name, rule: "unbounded-label", severity: "warn", series: row.series,
          message: `label "${l.name}" has ${l.distinct} distinct values here and its name usually means one value per user/request/object, so the series count grows without bound; dropping it would remove ${l.drop.saved} of ${row.series} series` });
      } else if (l.distinct >= threshold) {
        findings.push({ metric: fam.name, label: l.name, rule: "high-cardinality-label", severity: "warn", series: row.series,
          message: `label "${l.name}" has ${l.distinct} distinct values (threshold ${threshold}); dropping or bucketing it would remove ${l.drop.saved} of ${row.series} series` });
      }
    }
    const buckets = labels.find((l) => l.name === "le");
    if ((fam.type === "histogram") && buckets && buckets.distinct >= 10 && row.series >= 500) {
      const classes = Math.round(row.series / (buckets.distinct + 2));
      findings.push({ metric: fam.name, label: "le", rule: "histogram-bucket-multiplier", severity: "info", series: row.series,
        message: `histogram with ${buckets.distinct} buckets over about ${classes} label combination(s): every combination costs ${buckets.distinct + 2} series (buckets plus _sum and _count); fewer buckets or fewer label combinations is a multiplier` });
    }
  }
  families.sort((a, b) => b.series - a.series || (a.name < b.name ? -1 : 1));
  const totalSeries = families.reduce((n, f) => n + f.series, 0);
  return { families, findings, totalSeries, samples: parsed.samples, skipped: parsed.skipped };
}

/** Monthly cost per price preset for `totalSeries x targets`. Arithmetic on the user's inputs only. */
export function estimateCost(totalSeries, { targets = 1 } = {}, prices = DEFAULT_PRICES) {
  const active = totalSeries * Math.max(0, targets);
  return Object.entries(prices).map(([key, p]) => ({
    key,
    label: p.label || key,
    activeSeries: active,
    billable: Math.max(0, active - (p.free || 0)),
    monthly: (Math.max(0, active - (p.free || 0)) / 1000) * p.perThousand,
  }));
}

/** The N largest single-label drops across all metrics: the shortest list of changes that cuts the bill. */
export function topSavings(report, n = 5) {
  const rows = [];
  for (const f of report.families) for (const l of f.labels) {
    if (l.drop && l.drop.saved > 0) rows.push({ metric: f.name, label: l.name, saved: l.drop.saved, of: f.series });
  }
  rows.sort((a, b) => b.saved - a.saved || (a.metric < b.metric ? -1 : 1));
  return rows.slice(0, n);
}

export function summarize(report, { maxSeries = null, targets = 1 } = {}) {
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const infos = report.findings.filter((f) => f.severity === "info").length;
  const active = report.totalSeries * targets;
  const overBudget = maxSeries != null && active > maxSeries;
  const errors = overBudget ? 1 : 0;
  if (report.totalSeries === 0) return { status: "none", errors, warns, infos, overBudget, text: "No metric samples recognised. Paste the output of curl <host>/metrics." };
  const status = errors ? "error" : warns ? "warn" : "ok";
  let text = `${report.totalSeries} series across ${report.families.length} metric(s) in this scrape; ${warns} warning(s), ${infos} note(s).`;
  if (overBudget) text += ` Over the ${maxSeries}-series budget: ${active} active (${report.totalSeries} x ${targets} target(s)).`;
  return { status, errors, warns, infos, overBudget, text };
}

export const EXPOSITION_NOTES = [
  { what: "Prometheus text format", detail: "name{label=\"value\"} 1.0 -- the output of any /metrics endpoint" },
  { what: "OpenMetrics", detail: "same samples; # EOF and exemplars are tolerated" },
  { what: "Histograms and summaries", detail: "_bucket / _sum / _count lines are grouped under one metric via its # TYPE line" },
];
