// The application budget in exports: a line-item table, the SF-424A-style category summary
// (request / match / other columns) and the cost-share summary. Values come from the saved budget
// only (lines verbatim, totals recomputed in @shared/budget). The funder copy leaves out $0
// "needs your input" placeholders and internal notes. Pure functions only.
import {
  BUDGET_CATEGORY_LABEL,
  type BudgetLine,
  computeTotals,
  FUNDING_SOURCE_LABEL,
  formatBudgetCents as money,
} from "@shared/budget";
import { cleanText, escapeHtml, escapeXml } from "./text";

/** What loadExportInput passes (the saved budget). */
export interface ExportBudgetInput {
  lines: BudgetLine[];
  notes: string;
}

export interface ExportBudget {
  rows: {
    category: string;
    description: string;
    quantity: string;
    unitCost: string;
    total: string;
    funding: string;
    needsInput: boolean;
  }[];
  /** SF-424A Section B rows: [label, request, match, other, total]. */
  summary: [string, string, string, string, string][];
  match: { label: string; value: string }[];
  notes: string;
}

const LETTERS = "abcdefgh";

export function buildExportBudget(
  b: ExportBudgetInput | null | undefined,
  funder: boolean,
): ExportBudget | null {
  const lines = (b?.lines ?? []).filter((l) => !funder || l.totalCents > 0);
  if (lines.length === 0) return null;
  const t = computeTotals(lines);
  const cols = (c: {
    requestCents: number;
    matchCents: number;
    otherCents: number;
    totalCents: number;
  }) =>
    [money(c.requestCents), money(c.matchCents), money(c.otherCents), money(c.totalCents)] as const;
  const direct = t.categories.rows.filter((r) => r.category !== "indirect");
  const m = t.match;
  return {
    rows: lines.map((l) => ({
      category: BUDGET_CATEGORY_LABEL[l.category],
      description: cleanText(l.description).trim() || "—",
      quantity: String(Math.round(l.quantity * 100) / 100),
      unitCost: money(l.unitCostCents),
      total: money(l.totalCents),
      funding: FUNDING_SOURCE_LABEL[l.fundingSource],
      needsInput: l.totalCents === 0,
    })),
    summary: [
      ...direct.map(
        (r, i) =>
          [`${LETTERS[i]}. ${BUDGET_CATEGORY_LABEL[r.category]}`, ...cols(r)] as [
            string,
            string,
            string,
            string,
            string,
          ],
      ),
      ["i. Total direct charges", ...cols(t.categories.totalDirect)],
      ["j. Indirect charges", ...cols(t.categories.indirect)],
      ["k. Totals", ...cols(t.categories.total)],
    ],
    match: [
      { label: "Requested from the funder", value: money(m.requestCents) },
      {
        label: "Match (cost share)",
        value:
          money(m.matchCents) +
          (m.matchPercentOfTotal !== null ? ` (${m.matchPercentOfTotal}% of total)` : ""),
      },
      { label: "Other funds", value: money(m.otherCents) },
      { label: "Total project cost", value: money(m.totalProjectCents) },
    ],
    notes: funder ? "" : cleanText(b?.notes).trim(),
  };
}

// ------------------------------------------------------------------------------- DOCX

const W_TABLE = 9360; // 6.5" text width in twentieths of a point
const LINE_COLS = [1500, 3060, 700, 1300, 1400, 1400];
const SUMMARY_COLS = [2760, 1650, 1650, 1650, 1650];
const BORDER = '<w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>';
const BORDERS = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((s) => BORDER.replace("top", s))
  .join("")}</w:tblBorders>`;

const r = (text: string, bold = false) =>
  `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
const p = (runs: string, style?: string, right = false) =>
  `<w:p>${style || right ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${right ? '<w:jc w:val="right"/>' : ""}</w:pPr>` : ""}${runs}</w:p>`;

function tc(
  width: number,
  text: string,
  opts: { bold?: boolean; right?: boolean; shade?: boolean } = {},
) {
  const shd = opts.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shd}</w:tcPr>${p(r(text, opts.bold), undefined, opts.right)}</w:tc>`;
}

function tbl(
  widths: number[],
  header: string[],
  rows: string[][],
  numericFrom: number,
  boldLast = 0,
) {
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${header
    .map((h, i) => tc(widths[i] ?? 0, h, { bold: true, shade: true, right: i >= numericFrom }))
    .join("")}</w:tr>`;
  const body = rows
    .map(
      (row, ri) =>
        `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row
          .map((cell, i) =>
            tc(widths[i] ?? 0, cell, {
              right: i >= numericFrom,
              bold: ri >= rows.length - boldLast,
            }),
          )
          .join("")}</w:tr>`,
    )
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${W_TABLE}" w:type="dxa"/>${BORDERS}<w:tblLayout w:type="fixed"/></w:tblPr>${grid}${head}${body}</w:tbl>`;
}

/** Body XML for the budget page (Heading1 + tables), placed after the sections. */
export function budgetDocx(b: ExportBudget, funder: boolean): string[] {
  const out = [
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr>${r("Budget")}</w:p>`,
    p(r("Line items"), "Heading2"),
    tbl(
      LINE_COLS,
      ["Category", "Description", "Qty", "Unit cost", "Total", "Funding"],
      b.rows.map((x) => [
        x.category,
        x.needsInput && !funder ? `${x.description} (needs your input)` : x.description,
        x.quantity,
        x.unitCost,
        x.total,
        x.funding,
      ]),
      2,
    ),
    p(""),
    p(r("Budget summary by category"), "Heading2"),
    tbl(SUMMARY_COLS, ["Object class", "Request", "Match", "Other", "Total"], b.summary, 1, 3),
    p(""),
    p(r("Cost share"), "Heading2"),
    ...b.match.map((m) => p(r(`${m.label}: `, true) + r(m.value), "Meta")),
  ];
  if (b.notes) out.push(p(r("Notes"), "Heading2"), p(r(b.notes)));
  return out;
}

// ------------------------------------------------------------------------------- HTML

export const BUDGET_CSS = `
table.budget { border-collapse: collapse; width: 100%; margin: 0 0 12pt; font-size: 10pt; }
table.budget th, table.budget td { border: 1px solid #bfbfbf; padding: 3pt 5pt; vertical-align: top; }
table.budget th { background: #f2f2f2; text-align: left; }
table.budget .num { text-align: right; white-space: nowrap; }
table.budget tr.total td { font-weight: 700; }
table.budget tr { break-inside: avoid; page-break-inside: avoid; }
`;

const e = escapeHtml;

export function budgetHtml(b: ExportBudget, funder: boolean): string {
  const lineRows = b.rows
    .map(
      (x) =>
        `<tr><td>${e(x.category)}</td><td>${e(x.description)}${
          x.needsInput && !funder ? ' <span class="gap">(needs your input)</span>' : ""
        }</td><td class="num">${e(x.quantity)}</td><td class="num">${e(x.unitCost)}</td><td class="num">${e(x.total)}</td><td>${e(x.funding)}</td></tr>`,
    )
    .join("");
  const summaryRows = b.summary
    .map(
      (row, i) =>
        `<tr${i >= b.summary.length - 3 ? ' class="total"' : ""}><td>${e(row[0])}</td>${row
          .slice(1)
          .map((v) => `<td class="num">${e(v)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return (
    `<section class="page budget-section" id="budget"><h1>Budget</h1>` +
    `<h2>Line items</h2><table class="budget"><thead><tr><th>Category</th><th>Description</th>` +
    `<th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Total</th><th>Funding</th></tr></thead>` +
    `<tbody>${lineRows}</tbody></table>` +
    `<h2>Budget summary by category</h2><table class="budget"><thead><tr><th>Object class</th>` +
    `<th class="num">Request</th><th class="num">Match</th><th class="num">Other</th><th class="num">Total</th></tr></thead>` +
    `<tbody>${summaryRows}</tbody></table>` +
    `<h2>Cost share</h2><table class="meta"><tbody>${b.match
      .map((m) => `<tr><th scope="row">${e(m.label)}</th><td>${e(m.value)}</td></tr>`)
      .join("")}</tbody></table>` +
    (b.notes ? `<h2>Notes</h2><p>${e(b.notes).replace(/\n/g, "<br>")}</p>` : "") +
    `</section>`
  );
}
