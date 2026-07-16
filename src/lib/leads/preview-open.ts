/**
 * Preview open-tracking helpers — pure URL + attribution rules shared by
 * outreach emails, the preview beacon, and scoring.
 * See /docs/process (outreach-open-tracking).
 */

export const OUTREACH_PREVIEW_SRC = "outreach";

/**
 * Optional beacon body.openedAt ceiling. A genuine `Date.toISOString()` is 24
 * chars; allow modest timezone/fraction variants under 64. Over-long values are
 * treated as missing (server now) — soft-cap would change the timestamp;
 * hard-reject 400 would strand a fire-and-forget beacon (preview-open-openedAt-field-length-cap).
 */
export const MAX_PREVIEW_OPENED_AT_LENGTH = 64;

/**
 * Optional attribution query params (`src` / `utm_source`) ceiling. Genuine
 * values are short tokens (`outreach`, `email`, `resend`). Over-long probes are
 * treated as missing — soft-cap would invent a truncated attribution token;
 * hard-reject 400 would strand a fire-and-forget beacon
 * (preview-open-src-utm-field-length-cap).
 */
export const MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH = 32;

/**
 * Resolve optional preview-open attribution query params before
 * shouldRecordPreviewOpen. Missing / empty / over-MAX → null (fall-back).
 */
export function resolvePreviewOpenAttrParam(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH) {
    return null;
  }
  return raw;
}

/** Append ?src=outreach (or merge) so preview opens attribute to email. */
export function previewUrlWithOutreachTracking(basePreviewUrl: string): string {
  try {
    const url = new URL(basePreviewUrl);
    if (!url.searchParams.get("src")) {
      url.searchParams.set("src", OUTREACH_PREVIEW_SRC);
    }
    return url.toString();
  } catch {
    const join = basePreviewUrl.includes("?") ? "&" : "?";
    if (/[?&]src=/.test(basePreviewUrl)) return basePreviewUrl;
    return `${basePreviewUrl}${join}src=${OUTREACH_PREVIEW_SRC}`;
  }
}

/**
 * Whether this preview visit should record an open.
 * Prefer explicit outreach attribution; also accept in-pipeline stages when
 * the operator or prospect revisits without the query param.
 */
export function shouldRecordPreviewOpen(input: {
  src?: string | null;
  utmSource?: string | null;
  stage?: string | null;
}): boolean {
  const src = (input.src ?? "").toLowerCase().trim();
  const utm = (input.utmSource ?? "").toLowerCase().trim();
  if (src === OUTREACH_PREVIEW_SRC || src === "email") return true;
  if (utm === "email" || utm === "outreach" || utm === "resend") return true;
  return input.stage === "outreach_sent" || input.stage === "discovery_call";
}

/** Minimum gap between recorded opens for the same lead (noise / bot control). */
export const PREVIEW_OPEN_DEBOUNCE_MS = 30 * 60 * 1000;

export function shouldPersistPreviewOpen(
  lastPreviewOpenAt: string | undefined,
  nowMs: number,
  debounceMs: number = PREVIEW_OPEN_DEBOUNCE_MS,
): boolean {
  if (!lastPreviewOpenAt) return true;
  const last = Date.parse(lastPreviewOpenAt);
  if (Number.isNaN(last)) return true;
  return nowMs - last >= debounceMs;
}

/**
 * Resolve optional beacon `openedAt` before Date.parse / persist.
 * Missing, non-string, over-MAX, or unparseable → server now (fall-back).
 * Valid ISO-ish strings are normalized via `new Date(...).toISOString()`.
 */
export function resolvePreviewOpenedAt(
  raw: unknown,
  nowIso: string = new Date().toISOString(),
): string {
  if (typeof raw !== "string") return nowIso;
  if (raw.length === 0 || raw.length > MAX_PREVIEW_OPENED_AT_LENGTH) return nowIso;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return nowIso;
  return new Date(parsed).toISOString();
}
