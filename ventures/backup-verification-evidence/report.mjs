/** Browser port of backup_evidence.report — classify runs and flag shrinking nights. */

export const STATUS_VERIFIED = "verified";
export const STATUS_SUSPICIOUS = "suspicious";
export const STATUS_FAILED = "failed";
export const STATUS_INCONCLUSIVE = "inconclusive";
export const DEFAULT_SHRINK_RATIO = 0.2;

const REQUIRED_FIELDS = ["tool", "exit_code", "finished_at"];
const STATUS_SEVERITY = {
  [STATUS_VERIFIED]: 0,
  [STATUS_INCONCLUSIVE]: 1,
  [STATUS_SUSPICIOUS]: 2,
  [STATUS_FAILED]: 3,
};

function parseTimestamp(value) {
  const parsed = new Date(String(value).replace("Z", "+00:00"));
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`finished_at is not a parseable timestamp: ${value}`);
  }
  return parsed;
}

function finding(status, record, reasons, extra = {}) {
  return {
    status,
    reasons,
    tool: record.tool ?? null,
    finished_at: record.finished_at ?? null,
    ...extra,
  };
}

export function classifyRun(record, { requireIntegrity = false } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      status: STATUS_INCONCLUSIVE,
      reasons: ["run record is missing required field(s): tool, exit_code, finished_at"],
      tool: null,
      finished_at: null,
    };
  }
  const missing = REQUIRED_FIELDS.filter((field) => record[field] == null || record[field] === "");
  if (missing.length) {
    return finding(STATUS_INCONCLUSIVE, record, [
      `run record is missing required field(s): ${missing.join(", ")}`,
    ]);
  }

  try {
    parseTimestamp(record.finished_at);
  } catch (error) {
    return finding(STATUS_INCONCLUSIVE, record, [
      `finished_at is not a parseable timestamp: ${error.message}`,
    ]);
  }

  const exitCode = record.exit_code;
  if (!Number.isInteger(exitCode)) {
    return finding(STATUS_INCONCLUSIVE, record, [
      `exit_code is ${JSON.stringify(exitCode)}, expected an integer`,
    ]);
  }
  if (exitCode !== 0) {
    return finding(STATUS_FAILED, record, [`${record.tool} exited ${exitCode}`]);
  }

  const artifact = record.artifact;
  if (artifact == null) {
    return finding(STATUS_INCONCLUSIVE, record, [
      "exit code was 0 but no artifact was reported to check against it",
    ]);
  }
  if (!artifact.exists) {
    return finding(STATUS_SUSPICIOUS, record, [
      `${record.tool} exited 0 but the expected artifact does not exist`,
    ]);
  }

  const integrity = artifact.integrity || {};
  const reasons = [];
  if (integrity.result === "corrupt") {
    return finding(
      STATUS_FAILED,
      record,
      [
        `${record.tool} exited 0 but the artifact is not intact: ${
          integrity.detail || "the integrity check failed"
        }`,
      ],
      { integrity },
    );
  }
  if (integrity.result === "inconclusive") {
    reasons.push(
      `the artifact's integrity could not be established: ${
        integrity.detail || "the integrity check did not complete"
      }`,
    );
  }

  if (requireIntegrity && integrity.result !== "intact") {
    const reason = integrity.result === "unsupported"
      ? "the artifact format is unsupported by this tool"
      : integrity.result === "inconclusive"
        ? "the integrity read did not reach a conclusive end"
        : "no end-to-end integrity check was recorded";
    return finding(
      STATUS_INCONCLUSIVE,
      record,
      [`integrity is required, but ${reason}`],
      { integrity },
    );
  }

  const expected = record.expected || {};
  const sizeBytes = artifact.size_bytes;
  const minSize = expected.min_size_bytes;
  if (minSize != null && (sizeBytes == null || sizeBytes < minSize)) {
    reasons.push(
      `artifact is ${sizeBytes == null ? "an unknown number of" : sizeBytes} bytes, below the expected minimum of ${minSize}`,
    );
  }

  let parsedModifiedAt = null;
  if (artifact.modified_at) {
    try {
      parsedModifiedAt = parseTimestamp(artifact.modified_at);
    } catch (error) {
      reasons.push(`artifact.modified_at is not a parseable timestamp: ${error.message}`);
    }
  }

  const finishedAt = parseTimestamp(record.finished_at);
  const maxAgeHours = expected.max_age_hours;
  if (maxAgeHours != null) {
    if (!artifact.modified_at) {
      reasons.push("expected.max_age_hours was set but the artifact has no modified_at to check");
    } else if (parsedModifiedAt) {
      const ageHours = (finishedAt.getTime() - parsedModifiedAt.getTime()) / 3_600_000;
      if (ageHours < 0) {
        reasons.push(
          `artifact.modified_at is ${Math.abs(ageHours).toFixed(1)}h after finished_at -- clock skew or a mismatched record`,
        );
      } else if (ageHours > maxAgeHours) {
        reasons.push(
          `artifact is ${ageHours.toFixed(1)}h old, older than the expected ${maxAgeHours}h -- this run may have reused a stale file rather than writing a fresh one`,
        );
      }
    }
  }

  if (record.started_at && parsedModifiedAt) {
    try {
      const startedAt = parseTimestamp(record.started_at);
      if (parsedModifiedAt.getTime() < startedAt.getTime()) {
        reasons.push(
          `artifact.modified_at (${artifact.modified_at}) is before this run's started_at (${record.started_at}) -- the artifact was not written during this run and may be reused from an earlier one`,
        );
      }
    } catch (error) {
      reasons.push(`started_at is not a parseable timestamp: ${error.message}`);
    }
  }

  if (reasons.length) {
    return finding(STATUS_SUSPICIOUS, record, reasons, { integrity });
  }

  let verifiedReason = "exit code 0, artifact exists, and size/age expectations (if any) were met";
  if (integrity.result === "intact") {
    verifiedReason += `; the artifact was also read end-to-end and is structurally intact (${integrity.detail || ""})`;
  } else if (integrity.result === "unsupported") {
    verifiedReason += `; structural integrity was not checked -- ${integrity.detail || ""}`;
  } else {
    verifiedReason += "; the artifact's contents were not opened or checked";
  }
  return finding(STATUS_VERIFIED, record, [verifiedReason], { integrity });
}

function orderedRecords(records) {
  return [...records].sort((left, right) => {
    const leftStamp = String(left?.finished_at ?? "");
    const rightStamp = String(right?.finished_at ?? "");
    const leftTime = new Date(leftStamp).getTime();
    const rightTime = new Date(rightStamp).getTime();
    const leftOk = !Number.isNaN(leftTime);
    const rightOk = !Number.isNaN(rightTime);
    if (leftOk !== rightOk) return leftOk ? -1 : 1;
    // Sort by the actual instant, not the raw string: two timestamps at
    // different UTC offsets (e.g. "...T01:00:00+03:00" and "...T23:00:00Z",
    // an hour apart) can compare backwards as strings even though one is
    // unambiguously earlier. Falls back to string order only when neither
    // side parses, so unparseable timestamps still sort deterministically
    // (classifyRun reports them inconclusive regardless of position).
    if (leftOk && rightOk) return leftTime - rightTime;
    return leftStamp < rightStamp ? -1 : leftStamp > rightStamp ? 1 : 0;
  });
}

function artifactSizeBytes(record) {
  const size = record?.artifact?.size_bytes;
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return null;
  return Math.trunc(size);
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  if (ordered.length % 2) return ordered[mid];
  return (ordered[mid - 1] + ordered[mid]) / 2;
}

export function parseRunPayload(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (Array.isArray(data)) {
    if (!data.length) throw new Error("The JSON array did not contain any run records.");
    return data;
  }
  if (data && typeof data === "object") {
    if (Array.isArray(data.records)) {
      if (!data.records.length) throw new Error("The records list is empty.");
      return data.records;
    }
    if ("exit_code" in data || "tool" in data || "finished_at" in data) return [data];
  }
  throw new Error("JSON must be a run record, an array of run records, or {records: [...]}.");
}

export function buildTrend(records, shrinkRatio = DEFAULT_SHRINK_RATIO, { requireIntegrity = false } = {}) {
  const ratio =
    typeof shrinkRatio === "number" && shrinkRatio > 0 && shrinkRatio < 1
      ? shrinkRatio
      : DEFAULT_SHRINK_RATIO;
  const ordered = orderedRecords(records);
  const findings = ordered.map((record) => classifyRun(record, { requireIntegrity }));
  const rows = [];
  const alerts = [];
  let previousSize = null;
  let previousStatus = null;
  let previousFinished = null;
  const priorSizes = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const record = ordered[index];
    const current = findings[index];
    const size = artifactSizeBytes(record);
    let sizeChangePct = null;
    let shrinkingVsPrevious = false;
    let shrinkingVsMedian = false;
    let statusRegression = false;

    if (previousSize != null && size != null && previousSize > 0) {
      sizeChangePct = Math.round(((size - previousSize) / previousSize) * 1000) / 10;
      if (size <= previousSize * (1 - ratio)) {
        shrinkingVsPrevious = true;
        alerts.push({
          kind: "shrinking_vs_previous",
          finished_at: current.finished_at,
          detail: `${current.finished_at} is ${Math.abs(sizeChangePct).toFixed(1)}% smaller than the previous run (${previousFinished}) -- ${previousSize} bytes to ${size} bytes`,
        });
      }
    }

    if (size != null && priorSizes.length >= 3) {
      const priorMedian = median(priorSizes);
      if (priorMedian > 0 && size <= priorMedian * (1 - ratio)) {
        const dropPct = Math.round(((priorMedian - size) / priorMedian) * 1000) / 10;
        shrinkingVsMedian = true;
        alerts.push({
          kind: "shrinking_vs_median",
          finished_at: current.finished_at,
          detail: `${current.finished_at} is ${dropPct.toFixed(1)}% below the median of the previous ${priorSizes.length} night(s) (${Math.trunc(priorMedian)} bytes to ${size} bytes)`,
        });
      }
    }

    const previousSeverity = STATUS_SEVERITY[previousStatus] ?? -1;
    const currentSeverity = STATUS_SEVERITY[current.status] ?? 0;
    if (previousStatus != null && currentSeverity > previousSeverity) {
      statusRegression = true;
      alerts.push({
        kind: "status_regression",
        finished_at: current.finished_at,
        detail: `${current.finished_at} worsened from ${previousStatus} to ${current.status}`,
      });
    }

    rows.push({
      finished_at: current.finished_at,
      tool: current.tool,
      status: current.status,
      size_bytes: size,
      previous_size_bytes: previousSize,
      size_change_pct: sizeChangePct,
      shrinking_vs_previous: shrinkingVsPrevious,
      shrinking_vs_median: shrinkingVsMedian,
      status_regression: statusRegression,
    });

    if (size != null) {
      priorSizes.push(size);
      previousSize = size;
    }
    previousStatus = current.status;
    previousFinished = current.finished_at;
  }

  return {
    shrink_ratio: ratio,
    require_integrity: requireIntegrity,
    row_count: rows.length,
    alert_count: alerts.length,
    latest: rows.length ? rows[rows.length - 1] : null,
    rows,
    alerts,
    limitations: [
      "A size drop is an observation, not a determination that data was lost.",
      "Incremental backups and retention pruning can shrink a repository on purpose.",
      `Only drops of ${Math.round(ratio * 100)}% or more versus the previous night or the prior-night median are flagged.`,
      requireIntegrity
        ? "Requiring integrity means a night with no end-to-end artifact read reports inconclusive here even if its exit code and size/age all checked out."
        : "A night reports verified from its exit code and artifact stat alone unless its own run record already carries an integrity result; this page never opens the archive itself.",
      "This does not replace a test restore.",
    ],
  };
}

export function formatBytes(size) {
  if (size == null) return "unknown";
  if (size >= 1_000_000_000) return `${(size / 1_000_000_000).toFixed(1)} GB`;
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)} MB`;
  if (size >= 1_000) return `${(size / 1_000).toFixed(1)} KB`;
  return `${size} bytes`;
}

export function trendSummary(trend) {
  if (!trend.row_count) {
    return "Drop one or more backup-evidence run records to compare nights.";
  }
  if (!trend.alert_count) {
    return `No night dropped ${Math.round(trend.shrink_ratio * 100)}% or more, and no status worsened.`;
  }
  const shrinks = trend.alerts.filter((alert) => alert.kind.startsWith("shrinking")).length;
  const regressions = trend.alerts.filter((alert) => alert.kind === "status_regression").length;
  const parts = [];
  if (shrinks) parts.push(`${shrinks} size-drop alert${shrinks === 1 ? "" : "s"}`);
  if (regressions) parts.push(`${regressions} status regression${regressions === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function markdownTrend(trend) {
  const lines = ["# Backup verification trend", "", "This is an observation record, not a guarantee that your data is safe or restorable.", ""];
  if (trend.alerts.length) {
    lines.push("## Alerts", "");
    for (const alert of trend.alerts) lines.push(`- ${alert.detail}`);
    lines.push("");
  } else {
    lines.push("No size drop or status regression crossed the trend threshold.", "");
  }
  lines.push("| Finished at | Status | Size | vs previous | Flags |", "|---|---|---|---|---|");
  for (const row of trend.rows) {
    const size = row.size_bytes == null ? "unknown" : `${row.size_bytes} bytes`;
    const change = row.size_change_pct == null ? "—" : `${row.size_change_pct > 0 ? "+" : ""}${row.size_change_pct.toFixed(1)}%`;
    const flags = [
      row.shrinking_vs_previous ? "smaller than previous" : "",
      row.shrinking_vs_median ? "below prior median" : "",
      row.status_regression ? "status worsened" : "",
    ].filter(Boolean);
    lines.push(`| ${row.finished_at} | **${row.status}** | ${size} | ${change} | ${flags.join(", ") || "—"} |`);
  }
  lines.push("", "## Limits", "");
  for (const limit of trend.limitations) lines.push(`- ${limit}`);
  return `${lines.join("\n")}\n`;
}
