// Pure vendor-snapshot comparison logic — no network, no DOM, no filesystem.
// Ports the same rules as src/vendor_change.py (the CLI this venture shipped
// with first) so the browser tool and the CLI agree on every verdict.
// Loadable as a plain <script> in the browser (defines globals, no bundler)
// and requireable under `node --test`.

const REQUIRED = ["url", "captured_at", "fetch_status", "text"];

/** Parses and validates one snapshot object. Throws a visitor-facing message. */
function parseSnapshot(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`The ${label} snapshot is not valid JSON.`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`The ${label} snapshot is not valid JSON.`);
  }
  for (const key of REQUIRED) {
    if (!(key in value)) {
      throw new Error(`The ${label} snapshot is missing "${key}". Snapshots need url, captured_at, fetch_status, and text.`);
    }
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      throw new Error(`The ${label} snapshot's "${key}" must be a non-empty string.`);
    }
  }
  if (Number.isNaN(Date.parse(value.captured_at))) {
    throw new Error(`The ${label} snapshot's "captured_at" must be an ISO 8601 timestamp.`);
  }
  return value;
}

/** Compares two validated snapshots. Mirrors vendor_change.py's compare() exactly. */
function compare(before, after) {
  const beforeTime = Date.parse(before.captured_at);
  const afterTime = Date.parse(after.captured_at);
  const metadata = {
    url_before: before.url,
    url_after: after.url,
    captured_before: before.captured_at,
    captured_after: after.captured_at,
    fetch_status_before: before.fetch_status,
    fetch_status_after: after.fetch_status,
  };
  const changes = [];
  if (before.url !== after.url) {
    changes.push({ kind: "source_changed", before: before.url, after: after.url });
  }
  if (before.fetch_status !== "ok" || after.fetch_status !== "ok") {
    changes.push({ kind: "fetch_inconclusive", before: before.fetch_status, after: after.fetch_status });
  }
  if (before.text !== after.text) {
    changes.push({ kind: "content_changed", before_length: before.text.length, after_length: after.text.length });
  }
  if (afterTime < beforeTime) {
    changes.push({ kind: "capture_order_invalid" });
  }
  const inconclusive = changes.some((item) => item.kind === "fetch_inconclusive" || item.kind === "capture_order_invalid");
  const status = inconclusive ? "inconclusive" : changes.length ? "changed" : "unchanged";
  return {
    status,
    metadata,
    changes,
    review_required: changes.length > 0,
    evidence_boundary: "Reports observations; the customer decides contractual or security significance.",
  };
}

/** Builds a report directly from raw before/after snapshot text. */
function buildReport(beforeText, afterText) {
  const before = parseSnapshot(beforeText, "before");
  const after = parseSnapshot(afterText, "after");
  return compare(before, after);
}

function toMarkdown(report) {
  const lines = [
    "# Vendor snapshot review",
    "",
    `**Status:** \`${report.status}\``,
    "",
    `**Review required:** ${report.review_required ? "yes" : "no"}`,
    "",
    `- Before: \`${report.metadata.url_before}\` captured ${report.metadata.captured_before} (fetch: ${report.metadata.fetch_status_before})`,
    `- After: \`${report.metadata.url_after}\` captured ${report.metadata.captured_after} (fetch: ${report.metadata.fetch_status_after})`,
    "",
    "## Changes",
    "",
  ];
  if (report.changes.length === 0) {
    lines.push("- none observed");
  } else {
    for (const change of report.changes) lines.push(`- \`${change.kind}\``);
  }
  lines.push(
    "",
    `> ${report.evidence_boundary}`,
    "",
    "**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, security, or compliance advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.",
  );
  return lines.join("\n") + "\n";
}

function toJson(report) {
  return JSON.stringify(report, null, 2) + "\n";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseSnapshot, compare, buildReport, toMarkdown, toJson, REQUIRED };
}
