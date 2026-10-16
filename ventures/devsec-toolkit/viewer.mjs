// Report viewer logic for index.html: read a devsec-toolkit JSON or SARIF
// report, normalise it, filter it. Pure functions, no DOM, no network.

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };
const FROM_SARIF_LEVEL = { error: "high", warning: "medium", note: "low", none: "low" };

/** Parse report text into { tool, version, findings, checks, counts }. Throws on anything else. */
export function parseReport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That is not JSON. Run devsec with --format json or --format sarif and open the file it writes.");
  }
  if (data && data.tool === "devsec-toolkit" && Array.isArray(data.findings)) return fromDevsec(data);
  if (data && Array.isArray(data.runs)) return fromSarif(data);
  throw new Error("Not a devsec-toolkit report: expected the JSON or SARIF that `devsec.py scan` writes.");
}

function finding(f) {
  const severity = SEVERITY_RANK[f.severity] ? f.severity : "low";
  return {
    severity,
    check: String(f.check || ""),
    rule: String(f.rule || ""),
    category: String(f.category || ""),
    file: String(f.file || ""),
    line: Number.isInteger(f.line) && f.line > 0 ? f.line : null,
    message: String(f.message || ""),
    fix: String(f.fix || ""),
  };
}

function fromDevsec(data) {
  const findings = data.findings.map(finding);
  return {
    tool: "devsec-toolkit",
    version: String(data.version || ""),
    findings: sortFindings(findings),
    checks: Array.isArray(data.checks) ? data.checks.map((c) => ({ id: String(c.id), status: String(c.status), error: c.error ? String(c.error) : "" })) : [],
    baselined: Number(data.summary?.baselined) || 0,
    counts: countBySeverity(findings),
  };
}

function fromSarif(data) {
  const findings = [];
  let version = "";
  for (const run of data.runs) {
    version ||= String(run.tool?.driver?.version || "");
    const rules = run.tool?.driver?.rules || [];
    for (const r of run.results || []) {
      const ruleId = String(r.ruleId || rules[r.ruleIndex]?.id || "");
      const slash = ruleId.indexOf("/");
      const loc = r.locations?.[0]?.physicalLocation;
      const [message, ...fix] = String(r.message?.text || "").split("\nFix: ");
      const rule = rules[r.ruleIndex];
      findings.push(finding({
        severity: FROM_SARIF_LEVEL[r.level || rule?.defaultConfiguration?.level] || "low",
        check: slash > 0 ? ruleId.slice(0, slash) : ruleId,
        rule: slash > 0 ? ruleId.slice(slash + 1) : ruleId,
        category: (rule?.properties?.tags || []).find((t) => t !== "security") || "",
        file: loc?.artifactLocation?.uri || "",
        line: loc?.region?.startLine ?? null,
        message,
        fix: fix.join("\nFix: "),
      }));
    }
  }
  return { tool: "sarif", version, findings: sortFindings(findings), checks: [], baselined: 0, counts: countBySeverity(findings) };
}

export function countBySeverity(findings) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function sortFindings(findings) {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0),
  );
}

/** Keep findings at or above `minSeverity`, in `check` (if given), matching `text` (if given). */
export function filterFindings(findings, { minSeverity = "low", check = "", text = "" } = {}) {
  const floor = SEVERITY_RANK[minSeverity] || 1;
  const needle = text.trim().toLowerCase();
  return findings.filter(
    (f) =>
      SEVERITY_RANK[f.severity] >= floor &&
      (!check || f.check === check) &&
      (!needle || `${f.file} ${f.check} ${f.rule} ${f.message}`.toLowerCase().includes(needle)),
  );
}

/** Findings per file, most findings first: where to start fixing. */
export function hotspots(findings, limit = 5) {
  const byFile = new Map();
  for (const f of findings) {
    const entry = byFile.get(f.file) || { file: f.file, high: 0, total: 0 };
    entry.total += 1;
    if (f.severity === "high") entry.high += 1;
    byFile.set(f.file, entry);
  }
  return [...byFile.values()].sort((a, b) => b.high - a.high || b.total - a.total || a.file.localeCompare(b.file)).slice(0, limit);
}

export function location(f) {
  return f.line ? `${f.file}:${f.line}` : f.file || "(repository)";
}
