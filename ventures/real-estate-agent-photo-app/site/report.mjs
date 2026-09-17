/**
 * The three things an agent actually leaves with: a Markdown record for the
 * file, a plain-text summary to paste into a thread with the photographer, and
 * the machine-readable evidence JSON.
 *
 * Ported from `../research/src/components/PhotoCheckTool.tsx`, where these
 * lived inside a React component and so could not be tested or reused apart
 * from it. Nothing here touches the DOM.
 *
 * Every one of them repeats the limitation, deliberately. A record that
 * travels — pasted into an email, attached to a delivery, filed against a
 * listing — gets read by someone who never saw the page it came from, and a
 * clean findings table is very easy to mistake for an acceptance guarantee.
 * It is not one: see UNIMPLEMENTED_RULES.
 */

import { SPEC_DATE, SPEC_ID, UNIMPLEMENTED_RULES, createEvidenceReport } from "./photo-spec.mjs";

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function countFindings(reports) {
  const total = reports.reduce((count, report) => count + report.findings.length, 0);
  const blocking = reports.reduce(
    (count, report) => count + report.findings.filter((finding) => finding.severity === "blocking").length,
    0,
  );
  return { total, blocking };
}

/** The dated Markdown record. `run` is `{ reports, skipped, checkedAt }`. */
export function reportMarkdown(run) {
  const { total: findingCount, blocking: blockingCount } = countFindings(run.reports);
  const rows = run.reports.flatMap((report) => {
    if (report.findings.length === 0) {
      return [`| ${markdownCell(report.info.name)} | No findings | pass | File header checks passed |`];
    }
    return report.findings.map(
      (finding) =>
        `| ${markdownCell(report.info.name)} | ${markdownCell(finding.rule)} | ${finding.severity} | ${markdownCell(finding.detail)} |`,
    );
  });

  return [
    "# Listing Lens photo preflight record",
    "",
    `- Checked at: ${run.checkedAt}`,
    `- Spec: ${SPEC_ID} (${SPEC_DATE})`,
    `- Photos checked: ${run.reports.length}`,
    `- Findings: ${findingCount} (${blockingCount} blocking)`,
    `- Non-photo files skipped: ${run.skipped.length}`,
    "",
    "## Findings",
    "",
    "| File | Rule | Severity | Detail |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    ...(run.skipped.length > 0
      ? ["## Skipped files", "", ...run.skipped.map((name) => `- ${markdownCell(name)}`), ""]
      : []),
    "## Scope and limitations",
    "",
    `This record checks file headers and filenames only: format, byte size, long edge, aspect ratio, branding/watermark filename tokens, and staged-photo pairing. It does not check ${UNIMPLEMENTED_RULES.join(", ")}. Those require a human review or the specific MLS board's rules.`,
    "",
    "A clean findings table is not a warranty that a board or portal will accept these photos. Review and verify this record before relying on it.",
    "",
  ].join("\n");
}

/** Plain-text handoff for email or a photographer thread. Filenames and rule ids only. */
export function formatHandoffSummary(run) {
  const { blocking } = countFindings(run.reports);
  const status = blocking === 0 ? "No blocking findings" : `${blocking} blocking finding${blocking === 1 ? "" : "s"}`;
  const lines = [
    `Listing Lens photo preflight | ${status}`,
    `Checked ${run.reports.length} photo${run.reports.length === 1 ? "" : "s"} against ${SPEC_ID}`,
    `Checked at: ${new Date(run.checkedAt).toISOString()}`,
    "",
  ];
  for (const report of run.reports) {
    lines.push(
      `${report.info.name}: ${
        report.findings.length === 0
          ? "no findings"
          : report.findings.map((finding) => `${finding.rule} (${finding.severity})`).join(", ")
      }`,
    );
  }
  if (run.skipped.length > 0) lines.push("", `Skipped non-photo files: ${run.skipped.join(", ")}`);
  lines.push(
    "",
    "Evidence only: review this report against the destination MLS board's current rules before relying on it.",
  );
  return lines.join("\n");
}

/** The evidence JSON, pretty-printed the way it downloads. */
export function evidenceJson(run) {
  return JSON.stringify(createEvidenceReport(run.reports, run.skipped, run.checkedAt), null, 2);
}

/**
 * A filename that sorts by run and says what it is, because these land in a
 * downloads folder next to a hundred other files.
 */
export function recordFileName(checkedAt, extension) {
  const stamp = new Date(checkedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `listing-lens-preflight-${stamp}.${extension}`;
}

export function photoReadErrorMessage(error) {
  const detail = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "The browser could not read one or more files.";
  return `Could not read the selected photos. ${detail} Try selecting them again.`;
}
