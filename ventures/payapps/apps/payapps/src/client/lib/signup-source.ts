// Keeps the `from` of the "Start free" link a visitor arrived on until they are signed in, then the
// layout posts it once (POST /api/me/signup-source). Sign-up usually ends in another tab, through
// the confirmation email, so the value waits in this browser's local storage, never in a cookie.
// First page wins: a second visit from another page before signing in does not replace it.
import { SIGNUP_SOURCE_WINDOW_DAYS, signupSourceFromSearch } from "@shared/signup-source";

export const SIGNUP_SOURCE_KEY = "payapps.signupSource";
const DAY_MS = 86_400_000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Local storage, or null where it is blocked (private windows, strict settings). */
export function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Remember the page this visit came from, unless one is already waiting. */
export function rememberSignupSource(search: string, store: Store | null, now = Date.now()): void {
  const source = signupSourceFromSearch(search);
  if (!source || !store) return;
  try {
    if (pendingSignupSource(store, now)) return;
    store.setItem(SIGNUP_SOURCE_KEY, JSON.stringify({ source, at: now }));
  } catch {
    // Storage full or blocked: the account simply has no source.
  }
}

/** The waiting source, or null (an old or unreadable entry is dropped). */
export function pendingSignupSource(store: Store | null, now = Date.now()): string | null {
  if (!store) return null;
  try {
    const raw = store.getItem(SIGNUP_SOURCE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { source?: unknown; at?: unknown };
    if (
      typeof v.source === "string" &&
      typeof v.at === "number" &&
      now - v.at <= SIGNUP_SOURCE_WINDOW_DAYS * DAY_MS
    ) {
      return v.source;
    }
    store.removeItem(SIGNUP_SOURCE_KEY);
  } catch {
    try {
      store.removeItem(SIGNUP_SOURCE_KEY);
    } catch {}
  }
  return null;
}

export function clearSignupSource(store: Store | null): void {
  try {
    store?.removeItem(SIGNUP_SOURCE_KEY);
  } catch {}
}
