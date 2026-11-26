// Repeat parts: a job shop quotes the same part number again and again. The quote editor shows the
// shop's earlier quotes of a line's part number (services/quotes/history.ts) and can copy one's cost
// inputs (material, blank, operations, finishing, extras) onto the line. The copy keeps this line's
// quantities and is priced from today's rate card, never the old snapshot: rates move, and a machine
// or material retired since then becomes a blocking issue, not an old price.
import type { CostInputs } from "./costing";

/** At most this many earlier quotes are listed for one part number, newest first. */
export const MAX_PART_HISTORY = 10;

/**
 * The key two part numbers are compared by: trimmed, upper case, runs of spaces as one. "abc-100 "
 * and "ABC-100" are the same part; "ABC-100" and "ABC100" are not (a dash can be significant).
 */
export function partNumberKey(partNumber: string): string {
  return partNumber.trim().replace(/\s+/g, " ").toUpperCase();
}

/** True when a part number is worth looking up (not empty, not the editor's placeholder). */
export function isLookupablePartNumber(partNumber: string): boolean {
  const k = partNumberKey(partNumber);
  return k.length > 0 && k !== "NEW PART";
}

/** The past line's cost inputs with this line's quantity breaks. */
export function copyInputs(past: CostInputs, current: Pick<CostInputs, "quantities">): CostInputs {
  return structuredClone({ ...past, quantities: [...current.quantities] });
}

/** Revision match, compared like part numbers; null when either side has none. */
export function sameRevision(a: string | null, b: string | null): boolean | null {
  if (!a?.trim() || !b?.trim()) return null;
  return partNumberKey(a) === partNumberKey(b);
}

// ---- Repeat parts, part 2: pre-fill a new quote from the last won quote (opt-in per shop) -------

/** Where a pre-filled line's inputs came from: shown on the line so the estimator can check it. */
export interface PrefillSource {
  lineId: string;
  quoteId: string;
  quoteNumber: number;
  revNumber: number;
  customerCompany: string;
  /** The day the quote was marked won (ISO date), else null when it was never recorded. */
  wonOn: string | null;
}

/**
 * Revision match for pre-filling, stricter than `sameRevision`: both blank counts as the same part;
 * one blank and one not does not (a revision added since may mean a changed drawing).
 */
export function revisionMatchesForPrefill(a: string | null, b: string | null): boolean {
  const ka = a?.trim() ? partNumberKey(a) : "";
  const kb = b?.trim() ? partNumberKey(b) : "";
  return ka === kb;
}

/** A won line that could pre-fill a new one; the caller passes the shop's own rows only. */
export interface PrefillCandidate {
  lineId: string;
  quoteId: string;
  quoteNumber: number;
  revNumber: number;
  customerCompany: string;
  partNumber: string;
  revision: string | null;
  /** When the quote was marked won; null on rows from before that was recorded. */
  wonAt: Date | null;
  /** Orders candidates: won, else sent, else created. */
  decidedAt: Date;
  inputs: CostInputs;
}

/**
 * The last won line of the same part number and revision, or null. Newest decision first; on a tie
 * the higher quote number, then the higher revision. A part number the editor would not look up
 * (blank or "New part") never pre-fills.
 */
export function pickPrefillSource(
  part: { partNumber: string | null; revision: string | null },
  candidates: readonly PrefillCandidate[],
): PrefillCandidate | null {
  if (!part.partNumber || !isLookupablePartNumber(part.partNumber)) return null;
  const key = partNumberKey(part.partNumber);
  let best: PrefillCandidate | null = null;
  for (const c of candidates) {
    if (partNumberKey(c.partNumber) !== key) continue;
    if (!revisionMatchesForPrefill(c.revision, part.revision)) continue;
    if (
      !best ||
      c.decidedAt.getTime() > best.decidedAt.getTime() ||
      (c.decidedAt.getTime() === best.decidedAt.getTime() &&
        (c.quoteNumber > best.quoteNumber ||
          (c.quoteNumber === best.quoteNumber && c.revNumber > best.revNumber)))
    ) {
      best = c;
    }
  }
  return best;
}

/** The label stored on a pre-filled line. */
export function prefillSource(c: PrefillCandidate): PrefillSource {
  return {
    lineId: c.lineId,
    quoteId: c.quoteId,
    quoteNumber: c.quoteNumber,
    revNumber: c.revNumber,
    customerCompany: c.customerCompany,
    wonOn: c.wonAt ? c.wonAt.toISOString().slice(0, 10) : null,
  };
}

// ---- Repeat parts, part 3: pre-fill a line added by hand once it has a part number -------------

/**
 * True when a line carries nothing an estimator typed beyond its quantities: no material, no
 * operations, no finishing, no extras, and the customer-supplied box unticked. Only such a line is
 * pre-filled, so a pre-fill never overwrites work.
 */
export function hasNoCostInputs(inputs: CostInputs): boolean {
  return (
    inputs.material === null &&
    !inputs.customerSuppliedMaterial &&
    inputs.operations.length === 0 &&
    inputs.finishing.length === 0 &&
    inputs.extras.length === 0
  );
}

/**
 * Whether saving a line added by hand should pre-fill it (shop setting on): it was never pre-filled,
 * it still has no cost inputs, and the save gives it a part number it did not have before (adding
 * "New part" and then typing "BRK-1001" is the usual path). Re-saving the same part number does
 * not pre-fill again, so an estimator who cleared the inputs on purpose keeps a blank line.
 */
export function shouldPrefillOnSave(
  before: { partNumber: string; prefilled: boolean },
  after: { partNumber: string; inputs: CostInputs },
): boolean {
  if (before.prefilled || !hasNoCostInputs(after.inputs)) return false;
  if (!isLookupablePartNumber(after.partNumber)) return false;
  return partNumberKey(before.partNumber) !== partNumberKey(after.partNumber);
}

// ---- Repeat parts, part 4: a stale label, and a part won before at another revision ------------

/**
 * Whether a pre-filled line's "Pre-filled from" label stops being true after a save: the part
 * number or the revision changed (compared as for pre-filling), so the won quote it names was won
 * for a different part. The inputs stay (they are the estimator's to keep or clear); only the
 * label goes, so the line never claims a source it no longer has.
 */
export function prefillLabelStale(
  before: { partNumber: string; revision: string | null },
  after: { partNumber: string; revision: string | null },
): boolean {
  if (partNumberKey(before.partNumber) !== partNumberKey(after.partNumber)) return true;
  return !revisionMatchesForPrefill(before.revision, after.revision);
}

/** The parts of a part-history item `wonAtOtherRevision` reads. */
export interface RevisionHistoryItem {
  status: string;
  revision: string | null;
}

/**
 * The newest won quote of this part number at a different revision, when the part was never won
 * at this line's revision; null otherwise. The history is newest first (services/quotes/history.ts).
 * A line with no revision against a won line with one counts as different, as for pre-filling: a
 * revision added since may mean a changed drawing. A pre-filled line has its source already.
 */
export function wonAtOtherRevision<T extends RevisionHistoryItem>(
  line: { revision: string | null; prefilled: boolean },
  history: readonly T[],
): T | null {
  if (line.prefilled) return null;
  const won = history.filter((h) => h.status === "won");
  if (won.some((h) => revisionMatchesForPrefill(h.revision, line.revision))) return null;
  return won[0] ?? null;
}
