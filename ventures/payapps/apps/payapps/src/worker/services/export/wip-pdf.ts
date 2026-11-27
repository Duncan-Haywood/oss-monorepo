// The work-in-progress schedule as a PDF, laid out the way a surety, a bank or the company's CPA
// reads one: per active job the contract, estimated cost and gross profit at completion, cost to
// date, percent complete, earned revenue, billed to date, over and under billing, cost to complete
// and the revenue still to earn (backlog), with totals. Our own layout (no surety's form); the
// figures are the WIP report's (services/payapps/job-cost.ts, math in @shared/job-cost) and nothing
// is added here except sums and backlog = contract - earned.
//
// A job whose estimate waits for a budget prints with blanks and a note, and is left out of the
// totals, the same as on the screen. A review block (name, title, date, signature) closes the last
// page so the company can sign the schedule it sends; PayApps signs nothing.
import type { WipReportDto, WipRowDto } from "@shared/api/types";
import { mulDivRound } from "@shared/job-cost";
import { fmtAmount, fmtPct } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

// US Letter, landscape.
const W = 792;
const H = 612;
const M = 32;
const FOOTER_TOP = H - 40;

export const WIP_PDF_NOTICE =
  "Prepared with PayApps from the budgets, costs, revised estimates and sent pay applications " +
  "entered. Cost-to-cost percent complete; each job is worked as of its latest sent application's " +
  'period end; "re-estimated" lines use the project manager\'s cost to complete. A working ' +
  "schedule, not financial statements, an audit or a review; check it with your accountant before " +
  "sending it to a surety or lender.";

export interface WipPdfInput {
  report: WipReportDto;
  contractor: { name: string };
}

/** The numeric columns, left to right: header (two lines) and the value for a job. */
interface Column {
  head: [string, string];
  value: (r: WipRowDto) => number | null;
  /** The total over complete jobs; null prints blank. */
  total: (t: WipTotals) => number | null;
  pct?: boolean;
}

export interface WipTotals {
  contractCents: number;
  estimateAtCompletionCents: number;
  projectedGrossProfitCents: number;
  costToDateCents: number;
  earnedRevenueCents: number;
  billedToDateCents: number;
  overBilledCents: number;
  underBilledCents: number;
  costToCompleteCents: number;
  backlogCents: number;
  /** Total cost to date / total estimate, basis points; null when the estimate is 0. */
  percentCompleteBps: number | null;
}

/** A job's figures are complete when its estimate (and so earned revenue) could be worked out. */
export const isComplete = (r: WipRowDto) =>
  r.totals.estimateAtCompletionCents !== null && r.totals.earnedRevenueCents !== null;

export const backlogCents = (r: WipRowDto) =>
  r.totals.earnedRevenueCents === null
    ? null
    : r.totals.contractCents - r.totals.earnedRevenueCents;

/** Sums over the complete jobs (the incomplete ones are counted in `report.incompleteJobs`). */
export function wipTotals(rows: readonly WipRowDto[]): WipTotals {
  const t: WipTotals = {
    contractCents: 0,
    estimateAtCompletionCents: 0,
    projectedGrossProfitCents: 0,
    costToDateCents: 0,
    earnedRevenueCents: 0,
    billedToDateCents: 0,
    overBilledCents: 0,
    underBilledCents: 0,
    costToCompleteCents: 0,
    backlogCents: 0,
    percentCompleteBps: null,
  };
  for (const r of rows) {
    if (!isComplete(r)) continue;
    const j = r.totals;
    t.contractCents += j.contractCents;
    t.estimateAtCompletionCents += j.estimateAtCompletionCents ?? 0;
    t.projectedGrossProfitCents += j.projectedGrossProfitCents ?? 0;
    t.costToDateCents += j.costToDateCents;
    t.earnedRevenueCents += j.earnedRevenueCents ?? 0;
    t.billedToDateCents += j.billedToDateCents;
    const ou = j.overUnderBilledCents ?? 0;
    if (ou > 0) t.overBilledCents += ou;
    else t.underBilledCents += -ou;
    t.costToCompleteCents += j.costToCompleteCents ?? 0;
    t.backlogCents += j.contractCents - (j.earnedRevenueCents ?? 0);
  }
  if (t.estimateAtCompletionCents !== 0) {
    t.percentCompleteBps = mulDivRound(t.costToDateCents, 10_000, t.estimateAtCompletionCents);
  }
  return t;
}

const COLUMNS: Column[] = [
  {
    head: ["Contract", "to date"],
    value: (r) => r.totals.contractCents,
    total: (t) => t.contractCents,
  },
  {
    head: ["Est. cost at", "completion"],
    value: (r) => r.totals.estimateAtCompletionCents,
    total: (t) => t.estimateAtCompletionCents,
  },
  {
    head: ["Est. gross", "profit"],
    value: (r) => r.totals.projectedGrossProfitCents,
    total: (t) => t.projectedGrossProfitCents,
  },
  {
    head: ["Cost", "to date"],
    value: (r) => r.totals.costToDateCents,
    total: (t) => t.costToDateCents,
  },
  {
    head: ["Percent", "complete"],
    value: (r) => r.totals.percentCompleteBps,
    total: (t) => t.percentCompleteBps,
    pct: true,
  },
  {
    head: ["Earned", "revenue"],
    value: (r) => r.totals.earnedRevenueCents,
    total: (t) => t.earnedRevenueCents,
  },
  {
    head: ["Billed", "to date"],
    value: (r) => r.totals.billedToDateCents,
    total: (t) => t.billedToDateCents,
  },
  {
    head: ["Over", "billed"],
    value: (r) => {
      const v = r.totals.overUnderBilledCents;
      return v === null ? null : Math.max(v, 0);
    },
    total: (t) => t.overBilledCents,
  },
  {
    head: ["Under", "billed"],
    value: (r) => {
      const v = r.totals.overUnderBilledCents;
      return v === null ? null : Math.max(-v, 0);
    },
    total: (t) => t.underBilledCents,
  },
  {
    head: ["Cost to", "complete"],
    value: (r) => r.totals.costToCompleteCents,
    total: (t) => t.costToCompleteCents,
  },
  { head: ["Revenue", "to earn"], value: backlogCents, total: (t) => t.backlogCents },
];

const JOB_W = 150;
const COL_W = (W - 2 * M - JOB_W) / COLUMNS.length;
const SIZE = 7;

const cell = (c: Column, v: number | null) => (v === null ? "" : c.pct ? fmtPct(v) : fmtAmount(v));

/** wip-schedule-2026-11-26.pdf */
export const wipPdfFileName = (r: WipReportDto) => `wip-schedule-${r.asOf}.pdf`;

export function wipPdf({ report, contractor }: WipPdfInput): Uint8Array {
  const pdf = new PdfDocument({ title: `Work-in-progress schedule ${report.asOf}` });
  const totals = wipTotals(report.rows);
  let page: PdfPage = pdf.addPage(W, H);
  let y = 0;
  const colRight = (i: number) => M + JOB_W + COL_W * (i + 1) - 3;

  const tableHead = () => {
    page.rect(M, y, W - 2 * M, 22, { fill: 0.92, stroke: false });
    page.text(M + 4, y + 9, "Job", { size: SIZE, font: "bold" });
    page.text(M + 4, y + 18, "GC / billed through", { size: SIZE, font: "bold" });
    COLUMNS.forEach((c, i) => {
      page.text(colRight(i), y + 9, c.head[0], { size: SIZE, font: "bold", align: "right" });
      page.text(colRight(i), y + 18, c.head[1], { size: SIZE, font: "bold", align: "right" });
    });
    y += 22;
  };
  const newPage = (first: boolean) => {
    if (!first) page = pdf.addPage(W, H);
    page.text(M, 36, fitText(contractor.name, 400, first ? 14 : 10, "bold"), {
      size: first ? 14 : 10,
      font: "bold",
    });
    page.text(W - M, 36, "Work-in-progress schedule", {
      size: first ? 14 : 10,
      font: "bold",
      align: "right",
    });
    page.text(W - M, 48, `Prepared ${report.asOf}`, { size: 8, align: "right" });
    y = 58;
    if (first) {
      page.text(
        M,
        50,
        "Active jobs, in US dollars, each as of its latest sent pay application. Over billed: billings in excess of earned revenue; under billed: earned revenue in excess of billings.",
        { size: 8 },
      );
      y = 64;
    }
    tableHead();
  };
  newPage(true);

  const ROW_H = 21;
  for (const r of report.rows) {
    const ctc = r.totals.costToCompleteLines;
    const rowH = ctc > 0 ? ROW_H + 8 : ROW_H;
    if (y + rowH > FOOTER_TOP - 60) newPage(false);
    const name = r.projectNumber ? `${r.projectName} (${r.projectNumber})` : r.projectName;
    page.text(M + 4, y + 9, fitText(name, JOB_W - 8, SIZE + 0.5, "bold"), {
      size: SIZE + 0.5,
      font: "bold",
    });
    const through = r.billedThrough
      ? `#${r.billedThrough.number} to ${r.billedThrough.periodTo}`
      : "not billed yet";
    page.text(M + 4, y + 18, fitText(`${r.gcName} - ${through}`, JOB_W - 8, SIZE - 0.5), {
      size: SIZE - 0.5,
    });
    if (ctc > 0) {
      page.text(M + 4, y + 26, `${ctc} line${ctc === 1 ? "" : "s"} re-estimated by the PM`, {
        size: SIZE - 0.5,
      });
    }
    if (isComplete(r)) {
      COLUMNS.forEach((c, i) => {
        page.text(colRight(i), y + 12, cell(c, c.value(r)), { size: SIZE, align: "right" });
      });
    } else {
      page.text(
        M + JOB_W + 4,
        y + 12,
        `Not worked out: ${r.missingBudgets} line${r.missingBudgets === 1 ? "" : "s"} with no cost ` +
          `budget. Contract to date ${fmtAmount(r.totals.contractCents)}, cost to date ` +
          `${fmtAmount(r.totals.costToDateCents)}, billed to date ${fmtAmount(r.totals.billedToDateCents)}. ` +
          "Left out of the totals.",
        { size: SIZE },
      );
    }
    y += rowH;
    page.line(M, y, W - M, y, 0.2);
  }
  if (report.rows.length === 0) {
    page.text(M + 4, y + 14, "No active jobs.", { size: 8 });
    y += 22;
  }

  // Totals.
  page.line(M, y + 1, W - M, y + 1, 0.8);
  page.text(M + 4, y + 13, "Totals", { size: SIZE + 0.5, font: "bold" });
  COLUMNS.forEach((c, i) => {
    page.text(colRight(i), y + 13, cell(c, c.total(totals)), {
      size: SIZE,
      font: "bold",
      align: "right",
    });
  });
  y += 20;
  const complete = report.rows.length - report.incompleteJobs;
  page.text(
    M + 4,
    y + 6,
    `${complete} job${complete === 1 ? "" : "s"} in the totals` +
      (report.incompleteJobs > 0
        ? `; ${report.incompleteJobs} left out until every line has a cost budget.`
        : "."),
    { size: 7.5 },
  );
  y += 12;
  if (totals.overBilledCents || totals.underBilledCents) {
    page.text(
      M + 4,
      y + 6,
      `Net ${totals.overBilledCents >= totals.underBilledCents ? "over" : "under"} billed: ` +
        fmtAmount(Math.abs(totals.overBilledCents - totals.underBilledCents)),
      { size: 7.5 },
    );
    y += 12;
  }

  // Review block for the company (PayApps does not sign or certify).
  if (y + 56 > FOOTER_TOP - 4) newPage(false);
  y += 18;
  const third = (W - 2 * M) / 4;
  ["Reviewed by (name)", "Title", "Date", "Signature"].forEach((label, i) => {
    const x = M + third * i;
    page.line(x + 4, y + 14, x + third - 12, y + 14, 0.4);
    page.text(x + 4, y + 23, label, { size: 7 });
  });

  // Footers: the notice and page numbers.
  const notice = wrapText(WIP_PDF_NOTICE, W - 2 * M - 80, 6.5);
  pdf.pages.forEach((p, i) => {
    notice.forEach((l, k) => {
      p.text(M, FOOTER_TOP + 10 + k * 8, l, { size: 6.5 });
    });
    p.text(W - M, FOOTER_TOP + 10, `Page ${i + 1} of ${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}
