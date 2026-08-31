export type UsageEventName =
  | "page_view"
  | "check_started"
  | "check_first_snapshot"
  | "check_unchanged"
  | "check_changed"
  | "check_inconclusive";

export type UsageEvent = {
  name: UsageEventName;
  path: string;
  createdAt: string;
};

const events: UsageEvent[] = [];

export function recordUsageEvent(event: UsageEvent): UsageEvent {
  events.unshift(event);
  if (events.length > 500) events.length = 500;
  return event;
}

export function getUsageEventSummary() {
  return {
    totalEvents: events.length,
    pageViews: events.filter((event) => event.name === "page_view").length,
    featureEvents: events.filter((event) => event.name !== "page_view").length,
    recentEvents: events.slice(0, 20),
  };
}

export function clearUsageEventsForTests(): void {
  events.length = 0;
}
