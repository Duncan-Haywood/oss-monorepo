// A small, manually curated, non-exhaustive list of well-known tracking and
// advertising domains, used only to *group* results for a human reviewer.
// Absence from this list is not evidence that a domain does not track — it
// only means this list has not been updated to include it. Every unmatched
// domain still appears in the diff report as "unclassified", never dropped.

const CATEGORIZED_SUFFIXES = [
  ["google-analytics.com", "analytics"],
  ["analytics.google.com", "analytics"],
  ["googletagmanager.com", "analytics"],
  ["doubleclick.net", "advertising"],
  ["googlesyndication.com", "advertising"],
  ["googleadservices.com", "advertising"],
  ["facebook.net", "advertising"],
  ["facebook.com", "advertising"],
  ["ads-twitter.com", "advertising"],
  ["analytics.twitter.com", "analytics"],
  ["linkedin.com", "advertising"],
  ["bat.bing.com", "advertising"],
  ["hotjar.com", "session-recording"],
  ["fullstory.com", "session-recording"],
  ["clarity.ms", "session-recording"],
  ["mouseflow.com", "session-recording"],
  ["mixpanel.com", "analytics"],
  ["segment.io", "analytics"],
  ["segment.com", "analytics"],
  ["amplitude.com", "analytics"],
  ["hubspot.com", "advertising"],
  ["hs-analytics.net", "analytics"],
  ["criteo.com", "advertising"],
  ["adroll.com", "advertising"],
  ["taboola.com", "advertising"],
  ["outbrain.com", "advertising"],
  ["tiktok.com", "advertising"],
  ["snapchat.com", "advertising"],
  ["pinterest.com", "advertising"],
  ["yandex.ru", "analytics"],
  ["quantserve.com", "analytics"],
  ["scorecardresearch.com", "analytics"],
];

/**
 * Classifies a hostname by suffix match against the curated list above.
 * Returns `{ known: true, category }` or `{ known: false, category:
 * "unclassified" }`. `known: false` must never be read as "not tracking" —
 * it means "not in this list", and the caller is responsible for showing
 * unclassified rows rather than hiding them.
 */
export function classifyDomain(hostname) {
  if (!hostname) return { known: false, category: "unclassified" };
  const lower = hostname.toLowerCase();
  for (const [suffix, category] of CATEGORIZED_SUFFIXES) {
    if (lower === suffix || lower.endsWith(`.${suffix}`)) {
      return { known: true, category };
    }
  }
  return { known: false, category: "unclassified" };
}

export const KNOWN_TRACKER_DOMAIN_COUNT = CATEGORIZED_SUFFIXES.length;
