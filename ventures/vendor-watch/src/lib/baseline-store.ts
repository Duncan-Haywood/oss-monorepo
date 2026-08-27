// Per-visitor snapshot baselines, held in the visitor's own browser.
//
// The server-side store in watch-store.ts is a shared, in-memory cap that
// resets on every deploy. That is fine as a demo fallback and wrong as the
// thing the product's promise rests on: "check again later to see what
// changed" only pays off if the baseline is still there later, and if it is
// *your* baseline rather than whoever last checked the same URL.
//
// So the browser keeps its own. It survives restarts and deploys, it is never
// sent to another visitor, and it costs nothing to run. The trade is that a
// baseline is per-browser: clearing site data or switching devices starts the
// watch over, which the page says plainly rather than implying an archive.

export type Baseline = {
  url: string;
  normalizedText: string;
  hash: string;
  fetchedAt: string;
  httpStatus: number;
};

export const BASELINE_STORAGE_KEY = "vendor-watch:baselines:v1";

// Each baseline holds up to MAX_TEXT_LENGTH (20k) characters of normalized
// text, so this cap keeps the whole store to a few megabytes at worst —
// inside every browser's localStorage budget with room to spare.
export const MAX_TRACKED_URLS = 50;

// Minimal shape of the Storage API this module needs, so tests can pass a
// plain object and so a page rendered on the server (no localStorage) can
// pass null and get empty results rather than throwing.
export type BaselineStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isBaseline(value: unknown): value is Baseline {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.url === "string" &&
    candidate.url.length > 0 &&
    typeof candidate.normalizedText === "string" &&
    typeof candidate.hash === "string" &&
    candidate.hash.length > 0 &&
    typeof candidate.fetchedAt === "string" &&
    typeof candidate.httpStatus === "number"
  );
}

/**
 * Every stored baseline, newest first. Anything that does not re-validate as
 * a Baseline is dropped rather than trusted: the value is hand-editable, and
 * an older build of this page may have written a different shape.
 */
export function listBaselines(storage: BaselineStorage | null): Baseline[] {
  if (!storage) return [];
  let raw: string | null;
  try {
    raw = storage.getItem(BASELINE_STORAGE_KEY);
  } catch {
    // Private mode, or a browser configured to block site data.
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isBaseline)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
}

export function getBaseline(
  storage: BaselineStorage | null,
  url: string,
): Baseline | null {
  return listBaselines(storage).find((entry) => entry.url === url) ?? null;
}

function write(storage: BaselineStorage, entries: Baseline[]): boolean {
  try {
    storage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    // Quota exceeded, or site data blocked. The check itself still worked and
    // the visitor still sees the diff; only the baseline fails to persist.
    return false;
  }
}

/**
 * Store a baseline, replacing any existing one for the same URL. When the cap
 * is reached the least recently fetched URL is evicted, so an active watch is
 * never dropped in favour of one the visitor stopped checking.
 *
 * Returns false when the browser refused the write.
 */
export function saveBaseline(
  storage: BaselineStorage | null,
  baseline: Baseline,
): boolean {
  if (!storage || !isBaseline(baseline)) return false;
  const others = listBaselines(storage).filter((entry) => entry.url !== baseline.url);
  const next = [baseline, ...others].slice(0, MAX_TRACKED_URLS);
  return write(storage, next);
}

export function removeBaseline(storage: BaselineStorage | null, url: string): boolean {
  if (!storage) return false;
  const remaining = listBaselines(storage).filter((entry) => entry.url !== url);
  return write(storage, remaining);
}

export function clearBaselines(storage: BaselineStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(BASELINE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * localStorage when this is running in a browser that allows it, otherwise
 * null. Reading the property itself throws in some configurations, which is
 * why this is a function with a try rather than a module-level constant.
 */
export function browserBaselineStorage(): BaselineStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}
