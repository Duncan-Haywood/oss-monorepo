// A pay application as one Excel workbook: the application summary and the continuation sheet, the
// two pages GCs ask for "in Excel". Amounts are numbers (not text), and the columns that are sums of
// other columns are live formulas (G = D + E + F, % = G / C, H = C - G, the totals, summary lines 3,
// 4, 5, 6, 8 and 9), each saved with the figure PayApps computed, so a reader that does not calculate
// sees the same numbers as one that does. A formula is written only where PayApps' own figure equals
// it to the cent; anywhere it does not (it should not happen), the cell holds PayApps' figure as a
// plain number, so the workbook never disagrees with the PDF.

import {
  colName,
  writeXlsxBook,
  type XlsxRichCell,
  type XlsxSheet,
} from "@shared/gc-export/xlsx-write";
import { lineRatesNote } from "@shared/payapp-math";
import { quantityDecimal, unitPriceDecimal } from "@shared/unit-price";
import { type ApplicationDocumentData, NOT_AIA_NOTICE, SAMPLE_APPLICATION_MARK } from "./model";

export const SUMMARY_SHEET = "Application summary";
export const CONTINUATION_SHEET = "Continuation sheet";

const money = (cents: number) => cents / 100;
const num = (cents: number, bold = false): XlsxRichCell => ({ number: money(cents), bold });
const bold = (text: string): XlsxRichCell => ({ text, bold: true });

/** A formula cell when `holds` (PayApps' figure equals the formula to the cent), else the figure. */
function sum(formula: string, cents: number, holds: boolean, isBold = false): XlsxRichCell {
  return holds
    ? { formula, value: money(cents), bold: isBold }
    : { number: money(cents), bold: isBold };
}

const sheetRef = (name: string) => `'${name.replace(/'/g, "''")}'`;

interface ContinuationLayout {
  sheet: XlsxSheet;
  /** 1-based row of the totals and the letters of the G and C columns, for the summary's line 4. */
  totalsRow: number;
}

function continuationSheet(data: ApplicationDocumentData): ContinuationLayout {
  const { computed } = data;
  const quantities = data.quantities ?? {};
  const withQty = Object.keys(quantities).length > 0;
  const rows: XlsxRichCell[][] = [];
  if (data.project.sample) rows.push([bold(SAMPLE_APPLICATION_MARK)]);
  rows.push([bold("Continuation sheet")]);
  rows.push(["Contractor", data.contractor.name]);
  rows.push(["Project", data.project.name]);
  if (data.project.number) rows.push(["Project number", data.project.number]);
  rows.push(["Application no.", { number: data.payApp.number, format: "plain" }]);
  rows.push(["Period to", data.payApp.periodTo]);
  rows.push([]);
  // The columns, lettered as on the standard form (A item ... I retainage), plus the release column
  // and, on a unit-price job, the quantities after them so a sheet read by position is unaffected.
  rows.push([
    bold("A. Item"),
    bold("B. Description of work"),
    bold("C. Scheduled value"),
    bold("D. From previous application"),
    bold("E. This period"),
    bold("F. Materials presently stored"),
    bold("G. Completed and stored to date"),
    bold("% (G/C)"),
    bold("H. Balance to finish"),
    bold("I. Retainage"),
    bold("Retainage released this period"),
    ...(withQty
      ? [
          bold("Unit"),
          bold("Unit price"),
          bold("Contract quantity"),
          bold("Quantity this period"),
          bold("Quantity to date"),
        ]
      : []),
  ]);
  const first = rows.length + 1;
  for (const l of computed.lines) {
    const r = rows.length + 1;
    const q = withQty && l.sovLineId ? quantities[l.sovLineId] : undefined;
    rows.push([
      l.itemNumber,
      l.description,
      num(l.scheduledValueCents),
      num(l.fromPreviousCents),
      num(l.thisPeriodCents),
      num(l.storedMaterialsCents),
      sum(
        `D${r}+E${r}+F${r}`,
        l.completedAndStoredCents,
        l.fromPreviousCents + l.thisPeriodCents + l.storedMaterialsCents ===
          l.completedAndStoredCents,
      ),
      l.scheduledValueCents === 0
        ? null
        : {
            formula: `IF(C${r}=0,"",G${r}/C${r})`,
            value: l.completedAndStoredCents / l.scheduledValueCents,
            format: "percent",
          },
      sum(
        `C${r}-G${r}`,
        l.balanceToFinishCents,
        l.scheduledValueCents - l.completedAndStoredCents === l.balanceToFinishCents,
      ),
      num(l.retainageCents),
      num(l.retainageReleasedThisPeriodCents),
      ...(withQty
        ? q
          ? [
              q.unit,
              { number: Number(unitPriceDecimal(q.unitPriceMicros)), format: "plain" as const },
              q.contractQuantityMilli === null
                ? null
                : {
                    number: Number(quantityDecimal(q.contractQuantityMilli)),
                    format: "plain" as const,
                  },
              q.thisPeriodMilli === null
                ? null
                : { number: Number(quantityDecimal(q.thisPeriodMilli)), format: "plain" as const },
              // An approximate figure (part of the work entered in dollars) is marked, never passed as exact.
              q.exact
                ? { number: Number(quantityDecimal(q.toDateMilli)), format: "plain" as const }
                : `about ${quantityDecimal(q.toDateMilli)}`,
            ]
          : [null, null, null, null, null]
        : []),
    ]);
  }
  const last = rows.length;
  const totalsRow = last + 1;
  const t = computed.totals;
  const lines = computed.lines;
  const total = (col: string, cents: number, pick: (l: (typeof lines)[number]) => number) =>
    lines.length === 0
      ? num(cents, true)
      : sum(
          `SUM(${col}${first}:${col}${last})`,
          cents,
          lines.reduce((s, l) => s + pick(l), 0) === cents,
          true,
        );
  rows.push([
    null,
    bold("TOTALS"),
    total("C", t.scheduledValueCents, (l) => l.scheduledValueCents),
    total("D", t.fromPreviousCents, (l) => l.fromPreviousCents),
    total("E", t.thisPeriodCents, (l) => l.thisPeriodCents),
    total("F", t.storedMaterialsCents, (l) => l.storedMaterialsCents),
    total("G", t.completedAndStoredCents, (l) => l.completedAndStoredCents),
    t.scheduledValueCents === 0
      ? null
      : {
          formula: `IF(C${totalsRow}=0,"",G${totalsRow}/C${totalsRow})`,
          value: t.completedAndStoredCents / t.scheduledValueCents,
          format: "percent",
          bold: true,
        },
    total("H", t.balanceToFinishCents, (l) => l.balanceToFinishCents),
    total("I", t.retainageCents, (l) => l.retainageCents),
    total(
      colName(10),
      lines.reduce((s, l) => s + l.retainageReleasedThisPeriodCents, 0),
      (l) => l.retainageReleasedThisPeriodCents,
    ),
  ]);
  rows.push([]);
  rows.push([NOT_AIA_NOTICE]);
  return {
    sheet: {
      name: CONTINUATION_SHEET,
      rows,
      widths: [10, 40, 16, 16, 16, 16, 18, 10, 16, 16, 16, ...(withQty ? [8, 12, 12, 12, 12] : [])],
    },
    totalsRow,
  };
}

function summarySheet(data: ApplicationDocumentData, continuationTotalsRow: number): XlsxSheet {
  const s = data.computed.summary;
  const co = s.changeOrders;
  const rows: XlsxRichCell[][] = [];
  if (data.project.sample) rows.push([bold(SAMPLE_APPLICATION_MARK)]);
  rows.push([bold("Application and certificate for payment")]);
  rows.push(["Contractor", data.contractor.name]);
  rows.push(["General contractor", data.project.gcName]);
  if (data.project.gcAddress) rows.push(["General contractor address", data.project.gcAddress]);
  rows.push(["Project", data.project.name]);
  if (data.project.number) rows.push(["Project number", data.project.number]);
  if (data.project.location) rows.push(["Project location", data.project.location]);
  if (data.project.ownerName) rows.push(["Owner", data.project.ownerName]);
  if (data.project.architectName) rows.push(["Architect", data.project.architectName]);
  if (data.project.contractDate) rows.push(["Contract date", data.project.contractDate]);
  rows.push(["Application no.", { number: data.payApp.number, format: "plain" }]);
  rows.push(["Period from", data.payApp.periodFrom]);
  rows.push(["Period to", data.payApp.periodTo]);
  rows.push(["Application date", data.payApp.applicationDate]);
  rows.push(["Status", data.payApp.status]);
  rows.push([]);
  // Lines 1 to 9 in column B; each line's row is kept so the formulas can name it.
  const at: Record<string, number> = {};
  const line = (key: string, label: string, cell: XlsxRichCell) => {
    rows.push([label, cell]);
    at[key] = rows.length;
  };
  const cellOf = (key: string) => `B${at[key]}`;
  line("1", "1. Original contract sum", num(s.originalContractSumCents));
  line("2", "2. Net change by change orders", num(s.netChangeByChangeOrdersCents));
  line(
    "3",
    "3. Contract sum to date (line 1 + 2)",
    sum(
      `${cellOf("1")}+${cellOf("2")}`,
      s.contractSumToDateCents,
      s.originalContractSumCents + s.netChangeByChangeOrdersCents === s.contractSumToDateCents,
    ),
  );
  line(
    "4",
    "4. Total completed and stored to date (column G on the continuation sheet)",
    sum(
      `${sheetRef(CONTINUATION_SHEET)}!G${continuationTotalsRow}`,
      s.totalCompletedAndStoredCents,
      data.computed.totals.completedAndStoredCents === s.totalCompletedAndStoredCents,
    ),
  );
  line("5a", "5a. Retainage on completed work", num(s.retainageOnCompletedWorkCents));
  line("5b", "5b. Retainage on stored materials", num(s.retainageOnStoredMaterialsCents));
  line(
    "5",
    "5. Total retainage (line 5a + 5b)",
    sum(
      `${cellOf("5a")}+${cellOf("5b")}`,
      s.totalRetainageCents,
      s.retainageOnCompletedWorkCents + s.retainageOnStoredMaterialsCents === s.totalRetainageCents,
    ),
  );
  line(
    "6",
    "6. Total earned less retainage (line 4 less line 5)",
    sum(
      `${cellOf("4")}-${cellOf("5")}`,
      s.totalEarnedLessRetainageCents,
      s.totalCompletedAndStoredCents - s.totalRetainageCents === s.totalEarnedLessRetainageCents,
    ),
  );
  line(
    "7",
    "7. Less previous certificates for payment (line 6 from prior certificate)",
    num(s.lessPreviousCertificatesCents),
  );
  line(
    "8",
    "8. Current payment due",
    sum(
      `${cellOf("6")}-${cellOf("7")}`,
      s.currentPaymentDueCents,
      s.totalEarnedLessRetainageCents - s.lessPreviousCertificatesCents ===
        s.currentPaymentDueCents,
      true,
    ),
  );
  rows[rows.length - 1] = [bold("8. Current payment due"), rows[rows.length - 1]?.[1] ?? null];
  line(
    "9",
    "9. Balance to finish, including retainage (line 3 less line 6)",
    sum(
      `${cellOf("3")}-${cellOf("6")}`,
      s.balanceToFinishIncludingRetainageCents,
      s.contractSumToDateCents - s.totalEarnedLessRetainageCents ===
        s.balanceToFinishIncludingRetainageCents,
    ),
  );
  rows.push([]);
  rows.push([
    "Retainage % on completed work",
    { number: s.retainagePctBps / 10_000, format: "percent" },
  ]);
  rows.push([
    "Retainage % on stored materials",
    { number: s.storedRetainagePctBps / 10_000, format: "percent" },
  ]);
  rows.push(["Lines held at their own retainage rate", lineRatesNote(s.lineRates) || "none"]);
  rows.push([]);
  rows.push([bold("Change order summary"), bold("Additions"), bold("Deductions")]);
  rows.push([
    "Approved in previous applications",
    num(co.previousAdditionsCents),
    num(co.previousDeductionsCents),
  ]);
  rows.push([
    "Approved this period",
    num(co.thisPeriodAdditionsCents),
    num(co.thisPeriodDeductionsCents),
  ]);
  rows.push([]);
  rows.push([NOT_AIA_NOTICE]);
  return { name: SUMMARY_SHEET, rows, widths: [62, 18, 18] };
}

/** The workbook: the application summary first, then the continuation sheet. */
export function payApplicationXlsx(data: ApplicationDocumentData): Uint8Array {
  const continuation = continuationSheet(data);
  return writeXlsxBook([summarySheet(data, continuation.totalsRow), continuation.sheet]);
}
