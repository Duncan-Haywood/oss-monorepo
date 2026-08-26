export type UsageEventName =
  | "page_view"
  | "catalog_cta"
  | "room_visualizer_cta"
  | "storefront_search"
  | "checkout_add"
  | "checkout_remove"
  | "checkout_quantity_change"
  | "preflight_completed"
  | "preflight_exported"
  | "preflight_compared";

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
    searches: events.filter((event) => event.name === "storefront_search").length,
    featureEvents: events.filter((event) => event.name !== "page_view").length,
    recentEvents: events.slice(0, 20),
  };
}

export function clearUsageEventsForTests(): void {
  events.length = 0;
}
