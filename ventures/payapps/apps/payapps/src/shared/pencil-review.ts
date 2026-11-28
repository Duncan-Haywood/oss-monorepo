// The pencil review: before the official pay application, many GCs ask each sub for a "pencil"
// (pencil draft, pencil copy) around the 20th to 25th of the month. The GC's PM walks the job, marks
// up the continuation sheet (this line is 40% done, not 55%; stored materials not on site yet) and
// sends the numbers back; the sub then submits the official application on the GC's figures, so it
// is not rejected after the cut-off. Pure and offline: the contractor types (or pastes) the GC's
// figures; nothing is sent.
//
// Three things here:
// - pencilDiff: the draft's own figures against the GC's, line by line, with what changed.
// - applyPencil: the draft's entries with the GC's figures in (what "Apply" saves).
// - pencilNote: a short note to the GC that lists the lines revised per the review, for the email
//   that carries the official application. Every figure in it is one the contractor entered.
// Line 8 (payment due) is not estimated here: retainage can run at per-line rates, so the page saves
// the revised entries and shows the server's own summary.

import { formatCents, parseDollarsToCents } from "./money";

export interface PencilLine {
  sovLineId: string;
  itemNumber: string;
  description: string;
  workThisPeriodCents: number;
  storedMaterialsCents: number;
  /** Unit-price lines: this period's quantity (thousandths); the GC's dollar figure then wins. */
  quantityThisPeriodMilli?: number | null;
}

/** The GC's figure for a line; an absent field means the GC left that figure as billed. */
export interface PencilMark {
  workThisPeriodCents?: number;
  storedMaterialsCents?: number;
}

export type PencilMarks = Record<string, PencilMark>;

export interface PencilDiffLine {
  sovLineId: string;
  itemNumber: string;
  description: string;
  oursWorkCents: number;
  gcWorkCents: number;
  oursStoredCents: number;
  gcStoredCents: number;
  /** GC minus ours, work and stored together (negative: the GC cut the line). */
  changeCents: number;
  changed: boolean;
}

export interface PencilDiff {
  lines: PencilDiffLine[];
  changedCount: number;
  oursTotalCents: number;
  gcTotalCents: number;
  /** GC's total minus ours, before retainage. */
  changeCents: number;
}

export function pencilDiff(lines: readonly PencilLine[], marks: PencilMarks): PencilDiff {
  const out: PencilDiffLine[] = lines.map((l) => {
    const m = marks[l.sovLineId] ?? {};
    const gcWork = m.workThisPeriodCents ?? l.workThisPeriodCents;
    const gcStored = m.storedMaterialsCents ?? l.storedMaterialsCents;
    const changeCents = gcWork + gcStored - l.workThisPeriodCents - l.storedMaterialsCents;
    return {
      sovLineId: l.sovLineId,
      itemNumber: l.itemNumber,
      description: l.description,
      oursWorkCents: l.workThisPeriodCents,
      gcWorkCents: gcWork,
      oursStoredCents: l.storedMaterialsCents,
      gcStoredCents: gcStored,
      changeCents,
      changed: gcWork !== l.workThisPeriodCents || gcStored !== l.storedMaterialsCents,
    };
  });
  const oursTotalCents = out.reduce((s, l) => s + l.oursWorkCents + l.oursStoredCents, 0);
  const gcTotalCents = out.reduce((s, l) => s + l.gcWorkCents + l.gcStoredCents, 0);
  return {
    lines: out,
    changedCount: out.filter((l) => l.changed).length,
    oursTotalCents,
    gcTotalCents,
    changeCents: gcTotalCents - oursTotalCents,
  };
}

export interface PencilEntry {
  workThisPeriodCents: number;
  storedMaterialsCents: number;
  retainageReleasedCents: number;
  quantityThisPeriodMilli: number | null;
}

/**
 * The draft's entries with the GC's figures in. A unit-price line whose work the GC changed is
 * saved in dollars (its quantity cleared): the GC marked a dollar figure, and the server only accepts
 * a quantity whose extension is exactly the dollars. Retainage released is never touched.
 */
export function applyPencil(
  entries: Readonly<Record<string, PencilEntry>>,
  marks: PencilMarks,
): Record<string, PencilEntry> {
  const out: Record<string, PencilEntry> = { ...entries };
  for (const [id, m] of Object.entries(marks)) {
    const e = entries[id] ?? {
      workThisPeriodCents: 0,
      storedMaterialsCents: 0,
      retainageReleasedCents: 0,
      quantityThisPeriodMilli: null,
    };
    const work = m.workThisPeriodCents ?? e.workThisPeriodCents;
    const stored = m.storedMaterialsCents ?? e.storedMaterialsCents;
    if (work === e.workThisPeriodCents && stored === e.storedMaterialsCents) continue;
    out[id] = {
      ...e,
      workThisPeriodCents: work,
      storedMaterialsCents: stored,
      quantityThisPeriodMilli: work === e.workThisPeriodCents ? e.quantityThisPeriodMilli : null,
    };
  }
  return out;
}

export interface PastedColumn {
  /** Amounts in line order; null where the cell was blank (left as billed). */
  amounts: (number | null)[];
  /** 1-based rows that are neither blank nor an amount. */
  badRows: number[];
}

/**
 * A column of amounts pasted from the GC's spreadsheet (one per line, in the continuation sheet's
 * order). "-" and blank cells mean "as billed"; a cell with a tab keeps its last field, so a pasted
 * "item, description, amount" row still reads.
 */
export function parsePastedColumn(text: string): PastedColumn {
  const rows = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const amounts: (number | null)[] = [];
  const badRows: number[] = [];
  rows.forEach((row, i) => {
    const cell = (row.split("\t").pop() ?? "").trim();
    if (cell === "" || cell === "-" || cell === "—") {
      amounts.push(null);
      return;
    }
    const cents = parseDollarsToCents(cell);
    if (cents === null) badRows.push(i + 1);
    amounts.push(cents);
  });
  return { amounts, badRows };
}

export interface PencilNoteInput {
  gcContactName?: string | null;
  jobName: string;
  applicationNumber: number;
  periodTo: string;
  /** The day the GC returned the pencil (YYYY-MM-DD), if the contractor entered it. */
  reviewedOn?: string | null;
  diff: PencilDiff;
  contractorName: string;
}

/** A short cover note for the official application, listing the lines revised per the pencil. */
export function pencilNote(n: PencilNoteInput): string {
  const greeting = n.gcContactName?.trim() ? `Hi ${n.gcContactName.trim()},` : "Hello,";
  const when = n.reviewedOn ? ` of ${n.reviewedOn}` : "";
  const head = `Attached is pay application #${n.applicationNumber} for ${n.jobName}, period to ${n.periodTo}.`;
  const changed = n.diff.lines.filter((l) => l.changed);
  const body =
    changed.length === 0
      ? `It matches the pencil draft as reviewed${when}; no lines were changed.`
      : [
          `It is revised per your pencil review${when}:`,
          ...changed.map((l) => {
            const parts: string[] = [];
            if (l.gcWorkCents !== l.oursWorkCents)
              parts.push(
                `work this period ${formatCents(l.oursWorkCents)} to ${formatCents(l.gcWorkCents)}`,
              );
            if (l.gcStoredCents !== l.oursStoredCents)
              parts.push(
                `stored materials ${formatCents(l.oursStoredCents)} to ${formatCents(l.gcStoredCents)}`,
              );
            return `- Item ${l.itemNumber} ${l.description}: ${parts.join("; ")}`;
          }),
          `This period's work and stored materials total ${formatCents(n.diff.gcTotalCents)} (pencil draft: ${formatCents(n.diff.oursTotalCents)}).`,
        ].join("\n");
  return [greeting, "", head, body, "", "Thank you,", n.contractorName].join("\n");
}
