export type UsageEventName =
  | "page_view"
  | "catalog_cta"
  | "room_visualizer_cta"
  | "storefront_search"
  | "b2b_search"
  | "b2b_add_to_project"
  | "b2b_submit_order";

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
    searches: events.filter(
      (event) => event.name === "storefront_search" || event.name === "b2b_search",
    ).length,
    storefrontSearches: events.filter((event) => event.name === "storefront_search").length,
    b2bSearches: events.filter((event) => event.name === "b2b_search").length,
    b2bProjectAdds: events.filter((event) => event.name === "b2b_add_to_project").length,
    b2bOrdersSubmitted: events.filter((event) => event.name === "b2b_submit_order").length,
    featureEvents: events.filter((event) => event.name !== "page_view").length,
    recentEvents: events.slice(0, 20),
  };
}

export function clearUsageEventsForTests(): void {
  events.length = 0;
}
