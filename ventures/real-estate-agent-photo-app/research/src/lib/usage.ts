/**
 * Local-only, privacy-conscious usage counter for the photo-check tool.
 *
 * No photo, filename, or finding ever leaves the browser — this only
 * increments a same-origin localStorage counter so future sessions can see
 * whether the tool gets used at all, without collecting anything about who
 * used it or what they checked.
 */

const USAGE_KEY = "listing-lens-photo-check-usage-v1";

type UsageEvent = {
  name: string;
  occurredAt: string;
};

export function recordUsageEvent(name: string): void {
  if (typeof window === "undefined") return;

  try {
    const stored = window.localStorage.getItem(USAGE_KEY);
    const events: UsageEvent[] = stored ? JSON.parse(stored) : [];
    events.push({ name, occurredAt: new Date().toISOString() });
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(events.slice(-100)));
  } catch {
    // Usage tracking must never block the tool from working.
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
