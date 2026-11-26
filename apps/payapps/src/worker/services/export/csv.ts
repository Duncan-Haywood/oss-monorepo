// CSV exports of a pay application: the continuation sheet (one row per schedule-of-values line) and
// the application summary. RFC 4180 quoting; text cells that a spreadsheet would run as a formula are
// prefixed with an apostrophe.
import { centsToDecimal } from "@shared/money";
import { lineRatesNote } from "@shared/payapp-math";
import { type ApplicationDocumentData, NOT_AIA_NOTICE, SAMPLE_APPLICATION_MARK } from "./model";

export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: (string | number | null)[]) => cells.map(csvCell).join(",");
const amt = (cents: number) => Number(centsToDecimal(cents));
const pct = (bps: number | null) => (bps === null ? null : Number((bps / 100).toFixed(2)));

export function continuationCsv(data: ApplicationDocumentData): string {
  const { computed } = data;
  const lines = [
    row([
      "Item",
      "Description",
      "Scheduled value",
      "From previous application",
      "This period",
      "Materials presently stored",
      "Completed and stored to date",
      "% (G/C)",
      "Balance to finish",
      "Retainage",
      "Retainage released this period",
    ]),
    ...computed.lines.map((l) =>
      row([
        l.itemNumber,
        l.description,
        amt(l.scheduledValueCents),
        amt(l.fromPreviousCents),
        amt(l.thisPeriodCents),
        amt(l.storedMaterialsCents),
        amt(l.completedAndStoredCents),
        pct(l.percentCompleteBps),
        amt(l.balanceToFinishCents),
        amt(l.retainageCents),
        amt(l.retainageReleasedThisPeriodCents),
      ]),
    ),
    row([
      "",
      "TOTALS",
      amt(computed.totals.scheduledValueCents),
      amt(computed.totals.fromPreviousCents),
      amt(computed.totals.thisPeriodCents),
      amt(computed.totals.storedMaterialsCents),
      amt(computed.totals.completedAndStoredCents),
      computed.totals.scheduledValueCents === 0
        ? null
        : pct(
            Math.round(
              (computed.totals.completedAndStoredCents * 10_000) /
                computed.totals.scheduledValueCents,
            ),
          ),
      amt(computed.totals.balanceToFinishCents),
      amt(computed.totals.retainageCents),
      null,
    ]),
    // The sample job's sheet says so in a row of its own, below the totals, so a spreadsheet that
    // reads the table is unaffected and a person who opens it sees it.
    ...(data.project.sample ? [row(["", SAMPLE_APPLICATION_MARK])] : []),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function summaryCsv(data: ApplicationDocumentData): string {
  const s = data.computed.summary;
  const rows: [string, string | number | null][] = [
    ["Contractor", data.contractor.name],
    ["General contractor", data.project.gcName],
    ["Project", data.project.name],
    ["Project number", data.project.number],
    ["Application number", data.payApp.number],
    ["Period from", data.payApp.periodFrom],
    ["Period to", data.payApp.periodTo],
    ["Application date", data.payApp.applicationDate],
    ["Status", data.payApp.status],
    ["1. Original contract sum", amt(s.originalContractSumCents)],
    ["2. Net change by change orders", amt(s.netChangeByChangeOrdersCents)],
    ["3. Contract sum to date", amt(s.contractSumToDateCents)],
    ["4. Total completed and stored to date", amt(s.totalCompletedAndStoredCents)],
    ["5a. Retainage on completed work", amt(s.retainageOnCompletedWorkCents)],
    ["5b. Retainage on stored materials", amt(s.retainageOnStoredMaterialsCents)],
    ["5. Total retainage", amt(s.totalRetainageCents)],
    ["6. Total earned less retainage", amt(s.totalEarnedLessRetainageCents)],
    ["7. Less previous certificates for payment", amt(s.lessPreviousCertificatesCents)],
    ["8. Current payment due", amt(s.currentPaymentDueCents)],
    ["9. Balance to finish, including retainage", amt(s.balanceToFinishIncludingRetainageCents)],
    ["Retainage % on completed work", pct(s.retainagePctBps)],
    ["Retainage % on stored materials", pct(s.storedRetainagePctBps)],
    ["Lines held at their own retainage rate", lineRatesNote(s.lineRates) || "none"],
    [
      "Change orders approved in previous applications: additions",
      amt(s.changeOrders.previousAdditionsCents),
    ],
    [
      "Change orders approved in previous applications: deductions",
      amt(s.changeOrders.previousDeductionsCents),
    ],
    ["Change orders approved this period: additions", amt(s.changeOrders.thisPeriodAdditionsCents)],
    [
      "Change orders approved this period: deductions",
      amt(s.changeOrders.thisPeriodDeductionsCents),
    ],
    ["Notice", NOT_AIA_NOTICE],
    ...(data.project.sample ? [["Sample", SAMPLE_APPLICATION_MARK] as [string, string]] : []),
  ];
  return `${[row(["Field", "Value"]), ...rows.map(([k, v]) => row([k, v]))].join("\r\n")}\r\n`;
}
