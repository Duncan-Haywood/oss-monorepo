// How a quote is named to the customer and in the app. Rev 1 is the original quote and carries no
// suffix, so every quote sent before revisions existed keeps its name.

/** "Q-1001" for the original, "Q-1001 Rev 2" for its first revision. */
export const quoteLabel = (quoteNumber: number, revNumber = 1) =>
  revNumber > 1 ? `Q-${quoteNumber} Rev ${revNumber}` : `Q-${quoteNumber}`;

/** File-name form: "Q-1001", "Q-1001-R2". */
export const quoteFileLabel = (quoteNumber: number, revNumber = 1) =>
  revNumber > 1 ? `Q-${quoteNumber}-R${revNumber}` : `Q-${quoteNumber}`;

/** Statuses a quote can be revised from: sent and not yet won, or lost, or expired. */
export const REVISABLE_STATUSES = ["sent", "lost", "expired"] as const;

export function isRevisable(status: string): boolean {
  return (REVISABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether a sent quote's validity has run out on `today` (both ISO days, YYYY-MM-DD). A quote valid
 * until the 25th is still good all of the 25th.
 */
export function isPastValidity(validUntil: string | null, today: string): boolean {
  return validUntil !== null && /^\d{4}-\d{2}-\d{2}$/.test(validUntil) && validUntil < today;
}
