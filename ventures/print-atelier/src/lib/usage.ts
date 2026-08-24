const USAGE_KEY = "print-atelier-usage-v1";

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
    // Product usage must never block an artist workflow.
  }
}
