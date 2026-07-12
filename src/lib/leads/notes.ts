/**
 * Operator free-text notes on a Lead — capture call outcomes without a full CRM.
 * Pure helpers so validation stays unit-testable (see /docs/process operator-lead-notes).
 */

/** Soft cap so a single row cannot bloat SQLite/Convex documents. */
export const MAX_OPERATOR_NOTES_LENGTH = 2000;

/**
 * Normalize operator notes for persistence: trim, collapse empty to undefined,
 * reject over-long input (caller should show the error).
 */
export function normalizeOperatorNotes(
  raw: string | undefined | null,
): { ok: true; notes: string | undefined } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, notes: undefined };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, notes: undefined };
  }
  if (trimmed.length > MAX_OPERATOR_NOTES_LENGTH) {
    return {
      ok: false,
      error: `Notes must be ${MAX_OPERATOR_NOTES_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, notes: trimmed };
}

export function leadHasNotes(notes: string | undefined | null): boolean {
  return Boolean(notes && notes.trim().length > 0);
}
