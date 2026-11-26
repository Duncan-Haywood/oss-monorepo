// Per-user, per-browser guide preferences (checklist dismissed, tours seen). localStorage can throw
// (private mode, blocked storage) or be missing (SSR/prerender), so every access is guarded and a
// failure just means "not stored": the guide still works, it may simply show again.
import * as React from "react";

const PREFIX = "ga.guide";
const CHANGE_EVENT = "ga:guide-storage";

export const guideKeys = {
  checklistDismissed: (userId: string, orgId: string) => `${PREFIX}.checklist.${userId}.${orgId}`,
  tourSeen: (userId: string, tourId: string) => `${PREFIX}.tour.${tourId}.${userId}`,
  /** "Don't show again" on any tour: no more automatic tours for this user. */
  toursOptOut: (userId: string) => `${PREFIX}.tours-optout.${userId}`,
};

export function readGuidePref(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeGuidePref(key: string, value: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: keep going without persistence.
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
  } catch {
    // No window (tests without DOM): nothing to notify.
  }
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** A stored preference that re-renders every component reading it when any of them writes it. */
export function useGuidePref(key: string | null): [string | null, (value: string | null) => void] {
  const value = React.useSyncExternalStore(
    subscribe,
    () => (key ? readGuidePref(key) : null),
    () => null,
  );
  const set = React.useCallback((v: string | null) => key && writeGuidePref(key, v), [key]);
  return [value, set];
}
