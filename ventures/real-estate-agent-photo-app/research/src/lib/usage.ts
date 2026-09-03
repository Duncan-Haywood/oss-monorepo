/**
 * Local-only, privacy-conscious usage counter for the photo-check tool.
 *
 * No photo, filename, or finding ever leaves the browser — this only
 * increments a same-origin localStorage counter so future sessions can see
 * whether the tool gets used at all, without collecting anything about who
 * used it or what they checked.
 */

const USAGE_KEY = "listing-lens-photo-check-usage-v1";
const USAGE_ENABLED_KEY = "listing-lens-photo-check-usage-enabled-v1";

type UsageEvent = {
  name: string;
  occurredAt: string;
};

export function recordUsageEvent(name: string): void {
  if (typeof window === "undefined") return;
  if (!isUsageEnabled()) return;

  try {
    const stored = window.localStorage.getItem(USAGE_KEY);
    const events: UsageEvent[] = stored ? JSON.parse(stored) : [];
    events.push({ name, occurredAt: new Date().toISOString() });
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(events.slice(-100)));
  } catch {
    // Usage tracking must never block the tool from working.
  }
}

export function isUsageEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (navigator.doNotTrack === "1" || privacyNavigator.globalPrivacyControl === true) return false;
  try {
    return window.localStorage.getItem(USAGE_ENABLED_KEY) !== "false";
  } catch {
    return false;
  }
}

export function setUsageEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USAGE_ENABLED_KEY, String(enabled));
  } catch {
    // Usage tracking must never block the checker.
  }
}

export function readUsageEvents(): UsageEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(USAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}
