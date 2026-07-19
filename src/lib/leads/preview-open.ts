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
 * How far a client-supplied `openedAt` may sit ahead of server "now" before
 * it's treated as implausible (clock skew tolerance, not a hard protocol
 * bound like MAX_PREVIEW_OPENED_AT_LENGTH).
 */
export const MAX_PREVIEW_OPENED_AT_FUTURE_SKEW_MS = 5 * 60 * 1000;

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

/**
 * Whether the client beacon should fire for these (already-bounded) attrs /
 * in-pipeline stage. Mirrors PreviewOpenBeacon attribution checks.
 */
export function shouldFirePreviewOpenBeacon(input: {
  src?: string | null;
  utmSource?: string | null;
  trackByStage?: boolean;
}): boolean {
  const src = resolvePreviewOpenAttrParam(input.src);
  const utm = resolvePreviewOpenAttrParam(input.utmSource);
  if (src === OUTREACH_PREVIEW_SRC || src === "email") return true;
  if (utm === "email" || utm === "outreach" || utm === "resend") return true;
  return Boolean(input.trackByStage);
}

/**
 * Build the beacon POST path with length-bounded attribution query params.
 * Over-long src/utm_source are omitted (never echoed onto the fetch URL) —
 * page twin of the API route bound (preview-page-src-utm-field-length-cap).
 */
export function buildPreviewOpenBeaconPath(
  slug: string,
  input: {
    src?: string | null;
    utmSource?: string | null;
  },
): string {
  const src = resolvePreviewOpenAttrParam(input.src);
  const utmSource = resolvePreviewOpenAttrParam(input.utmSource);
  const params = new URLSearchParams();
  if (src) params.set("src", src);
  if (utmSource) params.set("utm_source", utmSource);
  const qs = params.toString();
  // encode-at-use lives in the client component (slug-path); callers that
  // already hold a path-safe slug may pass it through. Tests use plain slugs.
  return `/api/preview/${slug}/open${qs ? `?${qs}` : ""}`;
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
 * Missing, non-string, over-MAX, unparseable, or implausibly future-dated
 * (beyond MAX_PREVIEW_OPENED_AT_FUTURE_SKEW_MS past server now) → server now
 * (fall-back). Valid ISO-ish strings are normalized via
 * `new Date(...).toISOString()`.
 *
 * The future-skew guard exists because the resolved value both gates
 * shouldPersistPreviewOpen's debounce clock (route.ts derives `nowMs` from
 * it) and is persisted verbatim as lead.lastPreviewOpenAt. `/preview/[slug]`
 * is a public, unauthenticated URL keyed only by a leakable slug — an
 * unbounded future openedAt would let one spoofed request permanently mark
 * the lead "just opened" (instant quality-score engagement credit) while
 * silently debouncing away every real future open until server time catches
 * up to the spoofed date (preview-open-openedat-future-skew-guard).
 */
export function resolvePreviewOpenedAt(
  raw: unknown,
  nowIso: string = new Date().toISOString(),
): string {
  if (typeof raw !== "string") return nowIso;
  if (raw.length === 0 || raw.length > MAX_PREVIEW_OPENED_AT_LENGTH) return nowIso;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return nowIso;
  const nowMs = Date.parse(nowIso);
  if (!Number.isNaN(nowMs) && parsed > nowMs + MAX_PREVIEW_OPENED_AT_FUTURE_SKEW_MS) {
    return nowIso;
  }
  return new Date(parsed).toISOString();
}
