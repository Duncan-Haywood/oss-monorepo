// Pure public-register snapshot comparison logic — no network, no DOM, no
// filesystem. Ports the same rules as
// src/public_record_watch/report.py (the CLI this venture shipped with
// first) so the browser tool and the CLI agree on every verdict.
// Loadable as a plain <script> in the browser (defines globals, no bundler)
// and requireable under `node --test`.

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
  if (value.authorized !== true) {
    throw new Error(`The ${label} snapshot must declare "authorized": true.`);
  }
  if (typeof value.register !== "string" || !value.register.trim()) {
    throw new Error(`The ${label} snapshot must include a non-empty "register" name.`);
  }
  if (typeof value.source_url !== "string" || !/^https?:\/\//.test(value.source_url)) {
    throw new Error(`The ${label} snapshot's "source_url" must be an http(s) URL.`);
  }
  if (!Array.isArray(value.records)) {
    throw new Error(`The ${label} snapshot must include a "records" list.`);
  }
  const seen = new Set();
  for (const record of value.records) {
    if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id.trim()) {
      throw new Error(`Every record in the ${label} snapshot must have a non-empty "id".`);
    }
    if (seen.has(record.id)) {
      throw new Error(`The ${label} snapshot contains duplicate record ids ("${record.id}").`);
    }
    seen.add(record.id);
  }
  return value;
}

/** Value used for equality: every field except source_url, order-independent. */
function recordValue(record) {
  const value = {};
  for (const key of Object.keys(record).sort()) {
    if (key === "source_url") continue;
    value[key] = record[key];
  }
  return JSON.stringify(value);
}

/** Compares two validated snapshots. Mirrors report.py's build_report() exactly. */
function compare(before, after) {
  if (before.register !== after.register) {
    throw new Error("Both snapshots must describe the same register.");
  }
  if (before.source_url !== after.source_url) {
    throw new Error("Both snapshots must use the same source_url.");
  }
  const old = new Map(before.records.map((item) => [item.id, item]));
  const next = new Map(after.records.map((item) => [item.id, item]));
  const ids = [...new Set([...old.keys(), ...next.keys()])].sort();
  const findings = ids.map((id) => {
    const previous = old.get(id);
    const current = next.get(id);
    let status;
    if (previous === undefined) status = "added";
    else if (current === undefined) status = "removed";
    else if (recordValue(previous) !== recordValue(current)) status = "changed";
    else status = "unchanged";
    return { id, status, record: current ?? previous };
  });
  const findingCounts = {};
  for (const finding of findings) {
    findingCounts[finding.status] = (findingCounts[finding.status] || 0) + 1;
  }
  return {
    register: before.register,
    source_url: after.source_url,
    before_captured_at: before.captured_at ?? null,
    after_captured_at: after.captured_at ?? null,
    generated_at: new Date().toISOString(),
    finding_counts: findingCounts,
    findings,
    review_required: findings.some((finding) => finding.status !== "unchanged"),
    limitations: [
      "This reports differences between supplied snapshots; it does not establish that a register is complete or current.",
      "A source record is an observation, not a finding that a person is unsuitable, non-compliant, or unsafe.",
      "The customer must verify authorization, source accuracy, and any action before relying on this report.",
    ],
  };
}

/** Builds a report directly from raw before/after snapshot text. */
function buildReport(beforeText, afterText) {
  const before = parseSnapshot(beforeText, "before");
  const after = parseSnapshot(afterText, "after");
  return compare(before, after);
}

function toMarkdown(report) {
  const counts = report.finding_counts;
  const summary = ["added", "removed", "changed", "unchanged"]
    .map((key) => `**${key}:** ${counts[key] || 0}`)
    .join(" · ");
  const lines = [
    `# Public-record changes: \`${report.register}\``,
    "",
    `Source: ${report.source_url}`,
    "",
    "This is a source-linked observation record, not a suitability or compliance determination.",
    "",
    "## Summary",
    "",
    summary,
    "",
    "## Records",
    "",
    "| Record | Status |",
    "|---|---|",
  ];
  for (const finding of report.findings) {
    lines.push(`| \`${finding.id}\` | **${finding.status}** |`);
  }
  lines.push(
    "",
    "## Limits",
    "",
    ...report.limitations.map((item) => `- ${item}`),
    "",
    "**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, medical, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.",
  );
  return lines.join("\n") + "\n";
}

function toJson(report) {
  return JSON.stringify(report, null, 2) + "\n";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseSnapshot, recordValue, compare, buildReport, toMarkdown, toJson };
}
