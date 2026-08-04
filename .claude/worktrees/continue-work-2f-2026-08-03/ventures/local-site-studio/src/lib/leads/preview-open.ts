/**
 * Preview open-tracking helpers — pure URL + attribution rules shared by
 * outreach emails, the preview beacon, and scoring.
 * See /docs/process (outreach-open-tracking).
 */

export const OUTREACH_PREVIEW_SRC = "outreach";

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
