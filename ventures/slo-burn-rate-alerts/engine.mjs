// SLO error budgets and multi-window, multi-burn-rate alert rules.
// Pure functions, no dependencies, no network. Shared by cli.mjs and index.html.
//
// Method: Google SRE Workbook, "Alerting on SLOs" (multiwindow, multi-burn-rate).
// An alert policy is "page when X% of the period's error budget would be spent
// within the long window"; the burn rate that corresponds to that is
//   burn = fraction * period / longWindow
// and the alert fires only while BOTH the long and the short window exceed
// burn * (1 - slo). The short window makes the alert reset quickly once the
// problem is fixed.

export const DEFAULT_POLICY = [
  { fraction: 0.02, long: 3600, short: 300, severity: "page" },
  { fraction: 0.05, long: 21600, short: 1800, severity: "page" },
  { fraction: 0.1, long: 86400, short: 7200, severity: "ticket" },
  { fraction: 0.1, long: 259200, short: 21600, severity: "ticket" },
];

export const METHOD_NOTE =
  "Windows and budget fractions follow the Google SRE Workbook chapter 'Alerting on SLOs' (multiwindow, multi-burn-rate). Rules are generated from your inputs; review them before loading them into Prometheus.";

const DAY = 86400;

export function validateInputs({ slo, periodDays }) {
  const errors = [];
  if (!(typeof slo === "number" && Number.isFinite(slo) && slo > 0 && slo < 100)) errors.push("SLO must be a percentage strictly between 0 and 100, e.g. 99.9.");
  if (!(typeof periodDays === "number" && Number.isFinite(periodDays) && periodDays >= 1 && periodDays <= 366)) errors.push("Period must be between 1 and 366 days.");
  return errors;
}

export function errorRate(slo) {
  // 99.9 -> 0.001, rounded to kill float noise (100 - 99.9 = 0.0999999...).
  return Number(((100 - slo) / 100).toPrecision(12));
}

export function fmtDuration(seconds) {
  if (!Number.isFinite(seconds)) return "never";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const parts = [];
  let rest = s;
  for (const [unit, size] of [["d", DAY], ["h", 3600], ["m", 60], ["s", 1]]) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n) parts.push(`${n}${unit}`);
  }
  return parts.slice(0, 3).join(" ");
}

export function promDuration(seconds) {
  if (seconds % DAY === 0) return `${seconds / DAY}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

// How much downtime the SLO allows, over several windows.
export function budgetTable(slo, periodDays = 30) {
  const e = errorRate(slo);
  const windows = [["Per day", DAY], ["Per week", 7 * DAY], [`Per ${periodDays}-day period`, periodDays * DAY], ["Per year", 365 * DAY]];
  return { errorRate: e, rows: windows.map(([label, secs]) => ({ label, seconds: secs, allowedDowntime: secs * e })) };
}

// The alert policy with concrete thresholds for this SLO and period.
export function buildPolicy(slo, periodDays = 30, base = DEFAULT_POLICY) {
  const e = errorRate(slo);
  const period = periodDays * DAY;
  return base.map((p) => {
    const burn = Number(((p.fraction * period) / p.long).toFixed(3));
    const threshold = Number((burn * e).toPrecision(10));
    return {
      ...p,
      burnRate: burn,
      errorRatioThreshold: threshold,
      reachable: threshold < 1,
      // Time to exhaust the whole budget if the burn rate stays at this level.
      timeToExhaust: period / burn,
    };
  });
}

// How long until this alert fires, if the service starts failing `errorRatio`
// of requests (constant traffic). Both windows must exceed the threshold; with
// constant traffic the long window is the slower one.
export function detectionTime(policyRow, errorRatio) {
  if (!(errorRatio > 0) || errorRatio < policyRow.errorRatioThreshold) return Infinity;
  const longT = (policyRow.long * policyRow.errorRatioThreshold) / errorRatio;
  const shortT = (policyRow.short * policyRow.errorRatioThreshold) / errorRatio;
  return Math.max(longT, shortT);
}

// Findings a reviewer would want before loading the rules.
export function lint(slo, periodDays, { rps = null } = {}) {
  const findings = [];
  const policy = buildPolicy(slo, periodDays);
  const e = errorRate(slo);
  for (const p of policy) {
    if (!p.reachable) {
      findings.push({
        rule: "unreachable-threshold", severity: "error", window: promDuration(p.long),
        message: `The ${promDuration(p.long)} alert needs an error ratio above ${(p.errorRatioThreshold * 100).toFixed(1)}%, which can never happen. With a ${slo}% SLO this alert will never fire; use a longer long-window or a smaller budget fraction.`,
      });
    }
    if (rps !== null && rps > 0 && p.reachable) {
      const expectedErrors = rps * p.short * p.errorRatioThreshold;
      if (expectedErrors < 1) {
        findings.push({
          rule: "low-traffic", severity: "warn", window: promDuration(p.short),
          message: `At ${rps} req/s, the ${promDuration(p.short)} short window sees about ${expectedErrors.toFixed(2)} failing request(s) at the ${promDuration(p.long)} threshold, so a single error can flip it. Consider a longer short window or a synthetic probe.`,
        });
      }
    }
  }
  if (e < 1e-6) findings.push({ rule: "extreme-target", severity: "warn", window: "-", message: `A ${slo}% SLO allows ${fmtDuration(periodDays * DAY * e)} of downtime per period; measurement error in the SLI is likely larger than that.` });
  if (periodDays < 7) findings.push({ rule: "short-period", severity: "info", window: "-", message: "Periods under 7 days give the 3-day ticket alert more budget than the period holds; long-window alerts are less meaningful." });
  return findings;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,62}$/;

export function sliWindows(policy) {
  return [...new Set(policy.flatMap((p) => [p.long, p.short]))].sort((a, b) => a - b);
}

const q = (s) => JSON.stringify(s);

// Prometheus rule file: recording rules for the error ratio at each window and
// one alert per policy row. `errors` and `total` are selectors such as
// http_requests_total{job="api",code=~"5.."}.
export function generateRules({ name, slo, periodDays = 30, errors, total }) {
  if (!NAME_RE.test(name || "")) throw new Error("name must start with a letter and use only letters, digits, _ . -");
  const bad = validateInputs({ slo, periodDays });
  if (bad.length) throw new Error(bad.join(" "));
  for (const [k, v] of [["errors", errors], ["total", total]]) {
    if (!v || !String(v).trim() || /[\n\r]/.test(v)) throw new Error(`${k} must be a single-line metric selector, e.g. http_requests_total{job="api"}.`);
  }
  const policy = buildPolicy(slo, periodDays);
  const rec = (w) => `slo:sli_error:ratio_rate${promDuration(w)}`;
  const lines = [
    `# Generated by slo-burn-rate-alerts for SLO "${name}" at ${slo}% over ${periodDays} days.`,
    "# " + METHOD_NOTE,
    "groups:",
    `  - name: slo-${name}-sli-recordings`,
    "    rules:",
  ];
  for (const w of sliWindows(policy)) {
    const expr = `sum(rate(${errors}[${promDuration(w)}])) / sum(rate(${total}[${promDuration(w)}]))`;
    lines.push(`      - record: ${rec(w)}`, `        expr: ${q(expr)}`, "        labels:", `          slo: ${q(name)}`);
  }
  lines.push(`  - name: slo-${name}-burn-rate-alerts`, "    rules:");
  for (const p of policy) {
    const thr = `${p.burnRate} * ${errorRate(slo)}`;
    const cond = `${rec(p.long)}{slo=${q(name)}} > (${thr}) and ${rec(p.short)}{slo=${q(name)}} > (${thr})`;
    lines.push(
      `      - alert: ${name.replace(/[^A-Za-z0-9_]/g, "_")}_ErrorBudgetBurn_${promDuration(p.long)}`,
      `        expr: ${q(cond)}`,
      `        for: 0m`,
      "        labels:",
      `          severity: ${p.severity}`,
      `          slo: ${q(name)}`,
      "        annotations:",
      `          summary: ${q(`${name}: burning error budget at ${p.burnRate}x over ${promDuration(p.long)} and ${promDuration(p.short)}`)}`,
      `          description: ${q(`At this rate ${(p.fraction * 100).toFixed(0)}% of the ${periodDays}-day budget is spent in ${promDuration(p.long)}; the whole budget lasts ${fmtDuration(p.timeToExhaust)}.`)}`,
    );
  }
  return lines.join("\n") + "\n";
}

// Plain-language summary used by both surfaces.
export function summarize(slo, periodDays, opts = {}) {
  const findings = lint(slo, periodDays, opts);
  const errs = findings.filter((f) => f.severity === "error").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  const budget = budgetTable(slo, periodDays);
  const period = budget.rows[2];
  const status = errs ? "error" : warns ? "warn" : "ok";
  return {
    status,
    text: `${slo}% over ${periodDays} days allows ${fmtDuration(period.allowedDowntime)} of full downtime (error ratio ${(budget.errorRate * 100).toPrecision(3)}%). ${errs} error(s), ${warns} warning(s).`,
    findings,
  };
}
