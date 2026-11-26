// Portal copy-paste format: each section's funder prompt, the answer exactly as it should be pasted
// (no markup), and the word / character counts a portal will check.
import { formatCents } from "../submission/package";
import {
  buildExportModel,
  type ExportInput,
  type ExportModel,
  type ExportOptions,
  type ExportSection,
  markerText,
  paragraphsOf,
} from "./model";
import { formatLongDate } from "./text";

export const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

const RULE = "=".repeat(72);
const THIN = "-".repeat(72);

function limitText(count: number, limit: number | null, unit: string): string {
  if (limit === null) return `${count.toLocaleString("en-US")} ${unit}`;
  const over = count > limit ? ` (OVER LIMIT by ${(count - limit).toLocaleString("en-US")})` : "";
  return `${count.toLocaleString("en-US")} / ${limit.toLocaleString("en-US")} ${unit}${over}`;
}

/** Funder copy: the section's question and answer, nothing else. */
function funderSectionText(s: ExportSection, index: number): string[] {
  const out = [RULE, `${index + 1}. ${s.title}`, RULE, ""];
  if (s.prompt) out.push(`Question: ${s.prompt}`, "");
  if (s.text) out.push(s.text, "");
  return out;
}

function sectionText(s: ExportSection, index: number, withMarkers: boolean): string[] {
  const answer = withMarkers
    ? s.paragraphs
        .map((runs) => runs.map((r) => r.text + markerText(r.cites)).join(" "))
        .join("\n\n")
    : s.text;
  const out = [RULE, `${index + 1}. ${s.title}`, RULE, ""];
  if (s.prompt) out.push("PROMPT:", s.prompt, "");
  out.push("ANSWER:", answer || "(No answer drafted for this section yet.)", "");
  out.push(
    `Words: ${limitText(s.wordCount, s.wordLimit, "words")}`,
    `Characters (with spaces): ${limitText(s.charCount, s.charLimit, "characters")}`,
  );
  if (withMarkers) out.push("(Counts exclude the [n] citation markers.)");
  if (s.gaps.length) {
    out.push("", "STILL NEEDED BEFORE SUBMITTING:", ...s.gaps.map((g) => `  - ${g}`));
  }
  out.push("");
  return out;
}

export function renderApplicationText(m: ExportModel): string {
  const out: string[] = [m.title, ""];
  out.push(
    `Applicant: ${m.org.legalName}${m.org.dba ? ` (DBA ${m.org.dba})` : ""}`,
    `EIN: ${m.org.ein || "Not provided"}`,
  );
  if (m.org.uei) out.push(`UEI: ${m.org.uei}`);
  out.push(
    `Funder: ${m.funderName}`,
    `Opportunity: ${m.opportunityTitle}${m.opportunityNumber ? ` (${m.opportunityNumber})` : ""}`,
    `Deadline: ${formatLongDate(m.deadline)}`,
  );
  if (m.requestedAmountCents !== null) {
    out.push(`Requested amount: ${formatCents(m.requestedAmountCents)}`);
  }
  out.push(
    m.funder
      ? `Date: ${formatLongDate(m.generatedAt)}`
      : `Draft: version ${m.versionNumber}, exported ${formatLongDate(m.generatedAt)}`,
    "",
  );

  if (m.cover) {
    out.push(THIN, "REVIEWER NOTES (internal, do not paste into the portal)", THIN, "");
    out.push("Executive summary:", ...paragraphsOf(m.cover.executiveSummary), "");
    if (m.cover.keyPoints.length) {
      out.push("Key points:", ...m.cover.keyPoints.map((k) => `  - ${k}`), "");
    }
  }

  m.sections.forEach((s, i) => {
    out.push(...(m.funder ? funderSectionText(s, i) : sectionText(s, i, m.citations !== null)));
  });

  if (m.citations) {
    out.push(THIN, "CITATIONS (internal, do not paste into the portal)", THIN, "");
    if (m.citations.length === 0) out.push("No claims cite facts.");
    for (const c of m.citations) {
      out.push(`[${c.n}] ${c.statement ?? `Fact ${c.factId} is no longer available.`}`);
      if (c.sourceQuote) out.push(`    Source: "${c.sourceQuote}"`);
    }
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** Plain text for pasting into a funder portal, section by section. */
export function buildApplicationText(input: ExportInput, options: ExportOptions = {}): string {
  return renderApplicationText(buildExportModel(input, options));
}
