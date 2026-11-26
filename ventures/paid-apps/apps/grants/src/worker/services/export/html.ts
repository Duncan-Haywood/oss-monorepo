// Standalone, print-styled HTML ("Save as PDF" from the browser's print dialog). No scripts, no
// external resources; every piece of user text goes through escapeHtml.
import { formatCents } from "../submission/package";
import { BUDGET_CSS, budgetHtml } from "./budget";
import {
  buildExportModel,
  charCountLabel,
  type ExportInput,
  type ExportModel,
  type ExportOptions,
  type ExportRun,
  type ExportSection,
  paragraphsOf,
  wordCountLabel,
} from "./model";
import { escapeHtml as e, formatLongDate, slugify } from "./text";

export const HTML_CONTENT_TYPE = "text/html; charset=utf-8";

const STYLES = `
@page { size: letter; margin: 1in; }
* { box-sizing: border-box; }
html { color-scheme: light; }
body { margin: 0 auto; max-width: 8.5in; padding: 0.75in 1in; color: #1a1a1a; background: #fff;
  font: 11pt/1.45 Calibri, Carlito, "Segoe UI", "Helvetica Neue", Arial, sans-serif; }
h1, h2, h3 { font-family: "Calibri Light", Calibri, Carlito, "Segoe UI", Arial, sans-serif;
  font-weight: 400; color: #1f3864; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 16pt; margin: 0 0 6pt; }
h2 { font-size: 13pt; margin: 14pt 0 4pt; color: #2f5496; }
p { margin: 0 0 8pt; orphans: 3; widows: 3; }
.page { break-before: page; page-break-before: always; }
.title-page { padding-top: 1.5in; }
.title-page .title { font-size: 26pt; margin-bottom: 8pt; }
.title-page .subtitle { font-size: 14pt; color: #595959; margin: 0 0 28pt; }
.meta { border-collapse: collapse; }
.meta th { text-align: left; padding: 2pt 14pt 2pt 0; font-weight: 700; vertical-align: top; white-space: nowrap; }
.meta td { padding: 2pt 0; }
.prompt { font-style: italic; color: #404040; border-left: 3px solid #bfbfbf; padding-left: 10pt;
  margin: 0 0 10pt; break-after: avoid; page-break-after: avoid; }
.cite { color: #595959; font-size: 8.5pt; text-decoration: none; }
.count { color: #595959; font-size: 9pt; margin-top: 4pt; }
.over { color: #b00020; font-weight: 700; }
.gap { color: #9c5700; }
.internal { background: #fff2cc; color: #7f6000; font-weight: 700; padding: 6pt 8pt; }
ol.citations { list-style: none; padding: 0; }
ol.citations li { margin: 0 0 8pt; break-inside: avoid; page-break-inside: avoid;
  padding-left: 0.4in; text-indent: -0.4in; }
.quote { display: block; text-indent: 0; font-style: italic; color: #595959; font-size: 10pt; margin-top: 2pt; }
@media screen {
  body { box-shadow: 0 0 0 1px #e5e5e5; margin: 24px auto; }
  .page { border-top: 1px dashed #d0d0d0; margin-top: 0.6in; padding-top: 0.4in; }
}
@media print { body { padding: 0; max-width: none; } a { color: inherit; } }
${BUDGET_CSS}`;

function metaRow(label: string, value: string): string {
  return `<tr><th scope="row">${e(label)}</th><td>${e(value)}</td></tr>`;
}

function titlePage(m: ExportModel): string {
  const rows = [
    metaRow("Applicant", m.org.legalName + (m.org.dba ? ` (DBA ${m.org.dba})` : "")),
    metaRow("EIN", m.org.ein || "Not provided"),
    m.org.uei ? metaRow("UEI", m.org.uei) : "",
    metaRow("Funder", m.funderName),
    metaRow(
      "Opportunity",
      m.opportunityTitle + (m.opportunityNumber ? ` (${m.opportunityNumber})` : ""),
    ),
    metaRow("Deadline", formatLongDate(m.deadline)),
    m.requestedAmountCents !== null
      ? metaRow("Requested amount", formatCents(m.requestedAmountCents))
      : "",
    m.funder
      ? metaRow("Date", formatLongDate(m.generatedAt))
      : metaRow("Draft", `Version ${m.versionNumber}, exported ${formatLongDate(m.generatedAt)}`),
  ].join("");
  return (
    `<header class="title-page"><h1 class="title">${e(m.title)}</h1>` +
    `<p class="subtitle">Application to ${e(m.funderName)}</p>` +
    `<table class="meta"><tbody>${rows}</tbody></table></header>`
  );
}

function coverPage(cover: NonNullable<ExportModel["cover"]>): string {
  const summary = paragraphsOf(cover.executiveSummary);
  return (
    `<section class="page cover" aria-label="Reviewer cover page"><h1>Reviewer cover page</h1>` +
    `<p class="internal">Internal: for reviewers only. Remove this page before submitting.</p>` +
    `<h2>Executive summary</h2>` +
    (summary.length
      ? summary.map((p) => `<p>${e(p)}</p>`).join("")
      : `<p class="gap">No executive summary.</p>`) +
    `<h2>Key points</h2>` +
    (cover.keyPoints.length
      ? `<ul>${cover.keyPoints.map((k) => `<li>${e(k)}</li>`).join("")}</ul>`
      : `<p class="gap">No key points.</p>`) +
    `</section>`
  );
}

const withBreaks = (text: string) => e(text).replace(/\n/g, "<br>");

function claimsHtml(runs: ExportRun[]): string {
  return runs
    .map(
      (r) =>
        withBreaks(r.text) +
        r.cites.map((n) => `<a class="cite" href="#cite-${n}">[${n}]</a>`).join(""),
    )
    .join(" ");
}

function sectionHtml(s: ExportSection, funder: boolean): string {
  if (funder) {
    return (
      `<section class="page section" id="section-${slugify(s.key)}"><h1>${e(s.title)}</h1>` +
      (s.prompt ? `<p class="prompt">${withBreaks(s.prompt)}</p>` : "") +
      s.paragraphs.map((runs) => `<p>${claimsHtml(runs)}</p>`).join("") +
      `</section>`
    );
  }
  const over = s.overWordLimit || s.overCharLimit;
  const counts = [wordCountLabel(s), charCountLabel(s)].filter(Boolean).join(" · ");
  return (
    `<section class="page section" id="section-${slugify(s.key)}"><h1>${e(s.title)}</h1>` +
    (s.prompt ? `<p class="prompt">${withBreaks(s.prompt)}</p>` : "") +
    (s.paragraphs.length
      ? s.paragraphs.map((runs) => `<p>${claimsHtml(runs)}</p>`).join("")
      : `<p class="gap">No answer drafted for this section yet.</p>`) +
    (s.gaps.length
      ? `<p class="gap"><strong>Still needed before submitting:</strong></p><ul class="gap">${s.gaps
          .map((g) => `<li>${e(g)}</li>`)
          .join("")}</ul>`
      : "") +
    `<p class="count">${e(counts)}${over ? ' <span class="over">— over limit</span>' : ""}</p>` +
    `</section>`
  );
}

function citationsHtml(m: ExportModel): string {
  const items = (m.citations ?? [])
    .map(
      (c) =>
        `<li id="cite-${c.n}"><strong>[${c.n}]</strong>&nbsp;&nbsp;` +
        e(c.statement ?? `Fact ${c.factId} is no longer available.`) +
        (c.sourceQuote ? `<span class="quote">Source: “${e(c.sourceQuote)}”</span>` : "") +
        `</li>`,
    )
    .join("");
  return (
    `<section class="page citations-appendix"><h1>Citations</h1>` +
    `<p class="count">Each [n] marker cites a fact from ${e(m.org.legalName || "the organization")}'s fact base.</p>` +
    (items ? `<ol class="citations">${items}</ol>` : `<p class="gap">No claims cite facts.</p>`) +
    `</section>`
  );
}

export function renderApplicationHtml(m: ExportModel): string {
  const docTitle = [m.title, m.org.legalName].filter(Boolean).join(" — ");
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
    `<meta name="robots" content="noindex">` +
    `<title>${e(docTitle)}</title><style>${STYLES}</style></head><body>` +
    titlePage(m) +
    (m.cover ? coverPage(m.cover) : "") +
    m.sections.map((s) => sectionHtml(s, m.funder)).join("") +
    (m.budget ? budgetHtml(m.budget, m.funder) : "") +
    (m.citations ? citationsHtml(m) : "") +
    `</body></html>\n`
  );
}

/** The printable HTML document for one application version. */
export function buildApplicationHtml(input: ExportInput, options: ExportOptions = {}): string {
  return renderApplicationHtml(buildExportModel(input, options));
}
