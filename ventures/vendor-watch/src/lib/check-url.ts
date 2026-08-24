import { createHash } from "node:crypto";
import { diffWords, type DiffOp } from "./diff";
import { getSnapshot, saveSnapshot } from "./watch-store";

export type CheckOutcome = "first_snapshot" | "unchanged" | "changed" | "inconclusive";

export type SnapshotRef = { fetchedAt: string; httpStatus: number | null };

export type CheckResult = {
  outcome: CheckOutcome;
  url: string;
  fetchedAt: string;
  httpStatus: number | null;
  errorMessage?: string;
  previous?: SnapshotRef;
  diff?: DiffOp[];
};

const FETCH_TIMEOUT_MS = 8000;
// Cap normalized text length so the store and the diff stay bounded — this
// is a demo tool, not an archival service. Very long pages are truncated.
const MAX_TEXT_LENGTH = 20_000;

export function isPlausibleHttpUrl(input: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

export function normalizeHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  const collapsed = decoded.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_TEXT_LENGTH);
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch a URL, compare it against the previously stored snapshot (if any),
 * and return what happened. Never reports "no change" for a failed or
 * blocked fetch — that outcome is always "inconclusive".
 *
 * Caller is expected to have already validated the URL with
 * isPlausibleHttpUrl(); this function assumes a well-formed http(s) URL.
 */
export async function checkUrl(url: string, fetchImpl: FetchFn = fetch): Promise<CheckResult> {
  const now = new Date();
  const previousSnapshot = getSnapshot(url);
  const previousRef: SnapshotRef | undefined = previousSnapshot
    ? { fetchedAt: previousSnapshot.fetchedAt, httpStatus: previousSnapshot.httpStatus }
    : undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: controller.signal, redirect: "follow" });
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? `Fetch timed out after ${FETCH_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : "Unknown fetch error";
      return {
        outcome: "inconclusive",
        url,
        fetchedAt: now.toISOString(),
        httpStatus: null,
        errorMessage: message,
        previous: previousRef,
      };
    }

    const status = response.status;
    if (status < 200 || status >= 300) {
      return {
        outcome: "inconclusive",
        url,
        fetchedAt: now.toISOString(),
        httpStatus: status,
        errorMessage: `Fetch returned HTTP ${status}`,
        previous: previousRef,
      };
    }

    const body = await response.text();
    const normalizedText = normalizeHtmlToText(body);
    const hash = createHash("sha256").update(normalizedText).digest("hex");
    const fetchedAt = now.toISOString();

    if (!previousSnapshot) {
      saveSnapshot({ url, normalizedText, hash, fetchedAt, httpStatus: status });
      return { outcome: "first_snapshot", url, fetchedAt, httpStatus: status };
    }

    if (previousSnapshot.hash === hash) {
      saveSnapshot({ url, normalizedText, hash, fetchedAt, httpStatus: status });
      return { outcome: "unchanged", url, fetchedAt, httpStatus: status, previous: previousRef };
    }

    const diff = diffWords(previousSnapshot.normalizedText, normalizedText);
    saveSnapshot({ url, normalizedText, hash, fetchedAt, httpStatus: status });
    return { outcome: "changed", url, fetchedAt, httpStatus: status, previous: previousRef, diff };
  } finally {
    clearTimeout(timeout);
  }
}
