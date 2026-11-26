// Procore's subcontractor invoice is typed in by hand: the invoice contact opens the commitment in
// Procore, clicks Create Invoice and enters, line by line, the amount of work completed this period
// and any materials stored. Procore offers no CSV import for it (its help pages cover exporting an
// invoice to CSV, and importing only the Subcontractor SOV). This builds the numbers to type from a
// pay application already made here, so the Procore invoice matches the G702/G703 the GC also gets.
//
// Wording from Procore's help pages "Create a New Subcontractor Invoice as an Invoice Contact"
// (searched 2026-11-26; support.procore.com could not be fetched from the build session, so the
// quotes come from the search index): "Enter an amount for the current billing period" in the "Work
// Completed This Period" column; the older form's "Materials Presently Stored" shows "the amount of
// the materials being stored during the current billing period"; the newer form's "New Materials
// Stored" asks for "the amount of any new materials being stored for the current billing period.
// Your entry should exclude any costs entered in the 'Work Completed this Period' column", and
// appears only when the GC turned on "Enable Billing Separately for Stored Materials".
//
// What we cannot know, and say instead of guessing: how much of this period's stored balance is newly
// delivered when stored materials were also installed (the balance fell or moved both ways), and
// which lines the GC's invoice lists (the commitment's SOV positions, or the subcontractor SOV detail).
import { centsToDecimal } from "../money";
import type { ContinuationLine } from "../payapp-math";

export const PROCORE_INVOICE_HELP_URL =
  "https://support.procore.com/products/online/user-guide/project-level/invoicing/tutorials/create-a-new-subcontractor-invoice-as-an-invoice-contact";

export interface ProcoreInvoiceRow {
  sovLineId: string;
  /** "itemNumber description", as the SSOV filler writes it, so the rows read like the SSOV. */
  description: string;
  changeOrder: boolean;
  scheduledValueCents: number;
  /** Column E: work completed this period, stored materials excluded. */
  workThisPeriodCents: number;
  /** Column F: the balance of materials stored and not yet installed, at this period's end. */
  storedNowCents: number;
  /** Column F on the previous application here; null when there is none to compare with. */
  storedBeforeCents: number | null;
  /** Column G: completed and stored to date. */
  completedAndStoredCents: number;
  /**
   * What to type as "New Materials Stored": the stored balance's rise when it only rose (or the whole
   * balance on the first application here). null when the balance fell: materials were installed,
   * and any delivered in the same period cannot be told apart from the balance alone.
   */
  newStoredCents: number | null;
  /** Column G / C as a percentage with two decimals, or null when C is 0. */
  percentComplete: string | null;
}

export interface ProcoreInvoiceSheet {
  rows: ProcoreInvoiceRow[];
  totals: {
    workThisPeriodCents: number;
    storedNowCents: number;
    /** null when any row's new stored amount is unknown. */
    newStoredCents: number | null;
  };
  /** Lines whose stored balance fell: the person decides what the GC's form wants there. */
  storedFell: ProcoreInvoiceRow[];
  /** True when this is the first application here and the job opened mid-way (no F to compare). */
  noPreviousStored: boolean;
  csv: string;
}

export interface ProcoreInvoiceInput {
  lines: readonly ContinuationLine[];
  /** The previous application's lines, or null when this is the first application here. */
  previousLines: readonly ContinuationLine[] | null;
  /** SOV line ids that came from change orders. */
  changeOrderLineIds: ReadonlySet<string>;
  /**
   * True when the job started here mid-way (an opening application from elsewhere): materials stored
   * on that last outside application are unknown, so a first application's F is not all new.
   */
  openedMidJob: boolean;
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

const pct = (l: ContinuationLine) =>
  l.percentCompleteBps === null ? null : (l.percentCompleteBps / 100).toFixed(2);

/**
 * The per-line numbers to type into the GC's Procore invoice. Lines with nothing this period and
 * nothing stored are kept (Procore lists every line; a 0 is still an answer).
 */
export function procoreInvoiceSheet(input: ProcoreInvoiceInput): ProcoreInvoiceSheet {
  const before = new Map((input.previousLines ?? []).map((l) => [l.sovLineId, l]));
  const firstHere = input.previousLines === null;
  const rows: ProcoreInvoiceRow[] = input.lines.map((l) => {
    const prev = before.get(l.sovLineId);
    const storedBefore = firstHere
      ? input.openedMidJob
        ? null
        : 0
      : (prev?.storedMaterialsCents ?? 0);
    const rise = storedBefore === null ? null : l.storedMaterialsCents - storedBefore;
    return {
      sovLineId: l.sovLineId,
      description: l.itemNumber ? `${l.itemNumber} ${l.description}` : l.description,
      changeOrder: input.changeOrderLineIds.has(l.sovLineId),
      scheduledValueCents: l.scheduledValueCents,
      workThisPeriodCents: l.thisPeriodCents,
      storedNowCents: l.storedMaterialsCents,
      storedBeforeCents: storedBefore,
      completedAndStoredCents: l.completedAndStoredCents,
      newStoredCents: rise === null || rise < 0 ? null : rise,
      percentComplete: pct(l),
    };
  });
  const storedFell = rows.filter(
    (r) => r.storedBeforeCents !== null && r.storedNowCents < r.storedBeforeCents,
  );
  const unknownNew = rows.some((r) => r.newStoredCents === null);
  const totals = {
    workThisPeriodCents: rows.reduce((s, r) => s + r.workThisPeriodCents, 0),
    storedNowCents: rows.reduce((s, r) => s + r.storedNowCents, 0),
    newStoredCents: unknownNew ? null : rows.reduce((s, r) => s + (r.newStoredCents ?? 0), 0),
  };
  const header = [
    "Description",
    "Change order",
    "Scheduled Value",
    "Work Completed This Period",
    "Materials Presently Stored",
    "New Materials Stored",
    "% Complete",
  ];
  const body = rows.map((r) => [
    r.description,
    r.changeOrder ? "yes" : "",
    centsToDecimal(r.scheduledValueCents),
    centsToDecimal(r.workThisPeriodCents),
    centsToDecimal(r.storedNowCents),
    r.newStoredCents === null ? "check" : centsToDecimal(r.newStoredCents),
    r.percentComplete ?? "",
  ]);
  const total = [
    "Total",
    "",
    centsToDecimal(rows.reduce((s, r) => s + r.scheduledValueCents, 0)),
    centsToDecimal(totals.workThisPeriodCents),
    centsToDecimal(totals.storedNowCents),
    totals.newStoredCents === null ? "check" : centsToDecimal(totals.newStoredCents),
    "",
  ];
  const csv = `${[header, ...body, total].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
  return {
    rows,
    totals,
    storedFell,
    noPreviousStored: firstHere && input.openedMidJob,
    csv,
  };
}
