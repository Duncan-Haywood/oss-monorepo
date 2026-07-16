/**
 * Soft-caps for LLM-produced marketing / client-voice pack variant fields.
 * Operator INPUT free-text (notes, inquiry reply, SKU, create-path, dataSource)
 * is already bounded; these caps close the sold OUTPUT sink before upsert +
 * skipSuppression email delivery. Soft-cap (never hard-reject) so a long but
 * usable model response still ships a truncated pack rather than failing generate.
 */

/** Soft-cap — titles/subjects stay scannable in pack email + dashboard. */
export const MAX_PACK_VARIANT_TITLE_LENGTH = 200;
/**
 * Soft-cap — pack bodies land in skipSuppression client email HTML.
 * Well above stub/typical LLM output; below multi-KB persist/email abuse.
 */
export const MAX_PACK_VARIANT_BODY_LENGTH = 8000;
/** Soft-cap — CTAs are short action lines. */
export const MAX_PACK_VARIANT_CTA_LENGTH = 300;
/** Soft-cap per hashtag string (count still sliced to 8 at parse). */
export const MAX_PACK_HASHTAG_LENGTH = 64;

export function softCapPackField(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Trim + soft-cap; empty/whitespace → undefined (optional title/cta/hashtag). */
export function softCapOptionalPackField(
  raw: unknown,
  max: number,
): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  return softCapPackField(trimmed, max);
}

/** Soft-cap a required body after trim; caller still rejects empty. */
export function softCapPackBody(trimmedBody: string): string {
  return softCapPackField(trimmedBody, MAX_PACK_VARIANT_BODY_LENGTH);
}

/** Filter/soft-cap hashtag strings; keep at most `maxCount` non-empty tags. */
export function softCapPackHashtags(
  raw: unknown,
  maxCount = 8,
): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const tags = raw
    .filter((h): h is string => typeof h === "string")
    .map((h) => softCapOptionalPackField(h, MAX_PACK_HASHTAG_LENGTH))
    .filter((h): h is string => Boolean(h))
    .slice(0, maxCount);
  return tags.length > 0 ? tags : undefined;
}
