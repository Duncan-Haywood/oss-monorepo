// Platform-curated watchlist sources (orgId = null, shared read-only with every org).
//
// Intentionally EMPTY. Platform admins add funder / state-agency RFP pages only after verifying, for
// each one, that the URL is the funder's own official page, that its robots.txt allows our crawler
// and that the site's terms of use permit automated checks. URLs must never be guessed or invented
// here: a wrong page would feed fabricated or stale opportunities to every org.
import type { WatchSourceKind } from "../../db/schema/watchlist";

export interface SuggestedPlatformSource {
  url: string;
  label: string;
  funderName: string;
  kind: WatchSourceKind;
  checkIntervalHours?: number;
}

export const PLATFORM_SOURCES_SUGGESTED: SuggestedPlatformSource[] = [];
