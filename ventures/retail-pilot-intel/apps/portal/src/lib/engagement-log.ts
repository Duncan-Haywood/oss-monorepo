/**
 * First-party, anonymous, bounded engagement log for the sales demo portal.
 *
 * The portal is a static single-page app with no server component (see
 * root README "Hosting docs (private)" — it ships as static files to
 * GitHub Pages / Vercel / nginx, not a long-running Node process), so
 * there is no request-scoped server memory to record events into the way
 * a Next.js API route (e.g. ventures/print-atelier's /api/usage) would.
 * The equivalently lightweight fit here is a bounded, module-level array
 * that lives for the lifetime of the browser tab: no PII, no third-party
 * trackers, nothing persisted beyond this session, nothing sent over the
 * network. It resets on reload — see EngagementSummary's disclaimer copy.
 */

export type EngagementEventName =
  | "page_view"
  | "owner_value_cta_click"
  | "presenter_guide_toggle"
  | "kpis_live_viewed"
  | "kpis_api_unreachable";

export type EngagementEvent = {
  name: EngagementEventName;
  path: string;
  createdAt: string;
};

const MAX_EVENTS = 200;

const events: EngagementEvent[] = [];

export function recordEngagementEvent(event: EngagementEvent): EngagementEvent {
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  return event;
}

/** The portal's demo-tour sections, in presenter walkthrough order. */
export const TOUR_PATHS = ["/value", "/", "/funnel", "/products", "/experiments", "/trust"] as const;

export type EngagementSummary = {
  totalEvents: number;
  pageViewCount: number;
  ctaClicks: number;
  sectionsVisited: number;
  sectionsTotal: number;
  visitedPaths: string[];
  recentEvents: EngagementEvent[];
};

export function getEngagementSummary(): EngagementSummary {
  const pageViews = events.filter((event) => event.name === "page_view");
  const visitedPaths = new Set(pageViews.map((event) => event.path));

  return {
    totalEvents: events.length,
    pageViewCount: pageViews.length,
    ctaClicks: events.filter(
      (event) => event.name === "owner_value_cta_click" || event.name === "presenter_guide_toggle",
    ).length,
    sectionsVisited: TOUR_PATHS.filter((path) => visitedPaths.has(path)).length,
    sectionsTotal: TOUR_PATHS.length,
    visitedPaths: Array.from(visitedPaths),
    recentEvents: events.slice(0, 20),
  };
}

export function clearEngagementLogForTests(): void {
  events.length = 0;
}
