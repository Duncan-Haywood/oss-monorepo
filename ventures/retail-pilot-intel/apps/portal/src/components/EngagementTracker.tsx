import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordEngagementEvent } from "../lib/engagement-log";

/**
 * Records one anonymous page_view per route change into the in-memory,
 * session-only engagement log (see lib/engagement-log.ts for why this is
 * in-tab memory rather than a server call). Renders nothing.
 */
export function EngagementTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    recordEngagementEvent({
      name: "page_view",
      path: pathname,
      createdAt: new Date().toISOString(),
    });
  }, [pathname]);

  return null;
}
