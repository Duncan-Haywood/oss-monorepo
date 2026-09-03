// Pure HAR (HTTP Archive) diffing logic — no DOM, no network. Given two
// parsed HAR captures taken before and after a consent choice, reports which
// requests and response cookies appeared or disappeared. Classification
// against trackers.mjs's known-domain list is a disclosed heuristic for
// grouping results, not a determination that an unmatched domain is safe.

import { classifyDomain } from "./trackers.mjs";

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function entriesOf(har) {
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) {
    throw new Error("Not a HAR file: expected a log.entries array");
  }
  return entries;
}

/** One row per request in a HAR capture. */
function requestRows(har) {
  return entriesOf(har).map((entry, index) => {
    const url = entry.request?.url;
    if (!url) throw new Error(`HAR entry ${index} is missing request.url`);
    return {
      url,
      method: entry.request?.method || "GET",
      hostname: hostnameOf(url),
      startedDateTime: entry.startedDateTime || null,
    };
  });
}

/** Method + origin + path. Query strings and hashes rotate on tracker hits. */
function requestKey(row) {
  try {
    const parsed = new URL(row.url);
    return `${row.method} ${parsed.origin}${parsed.pathname}`;
  } catch {
    return `${row.method} ${row.url}`;
  }
}

/** Cookie names set via Set-Cookie in HAR responses, one row per (hostname, cookie name). */
function cookieRows(har) {
  const rows = [];
  for (const entry of entriesOf(har)) {
    const hostname = hostnameOf(entry.request?.url);
    const cookies = entry.response?.cookies;
    if (!Array.isArray(cookies)) continue;
    for (const cookie of cookies) {
      if (!cookie?.name) continue;
      rows.push({ hostname, name: cookie.name });
    }
  }
  return rows;
}

function cookieKey(row) {
  return `${row.hostname ?? "(unknown host)"}::${row.name}`;
}

function diffByKey(beforeRows, afterRows, keyFn) {
  const beforeKeys = new Set(beforeRows.map(keyFn));
  const afterKeys = new Set(afterRows.map(keyFn));
  // `persisting` is taken from the after-capture and de-duplicated by key: a
  // tracker that fires four times after the consent choice is one finding, not
  // four. It is reported from the after side because that is the capture the
  // user is asking about ("is this still happening now that I rejected?").
  const seen = new Set();
  const persisting = afterRows.filter((row) => {
    const key = keyFn(row);
    if (!beforeKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    added: afterRows.filter((row) => !beforeKeys.has(keyFn(row))),
    removed: beforeRows.filter((row) => !afterKeys.has(keyFn(row))),
    persisting,
  };
}

/**
 * The document host of a capture, used only to separate "the site's own
 * requests" from third-party ones in the persisting list. Heuristic: the first
 * entry in a HAR is conventionally the top-level document. If that cannot be
 * determined, nothing is treated as first-party, so no row is ever demoted on
 * a guess.
 */
function firstPartyHostname(har) {
  const first = har?.log?.entries?.[0];
  return hostnameOf(first?.request?.url);
}

/**
 * Diffs two HAR captures. Returns added/removed requests (each tagged with a
 * disclosed, non-exhaustive tracker classification), added/removed response
 * cookies, and — the signal a consent check actually turns on — the requests
 * and cookies present in *both* captures, i.e. what carried on unchanged
 * across the consent choice. Throws if either capture is not a HAR log.
 */
export function diffHarCaptures(beforeHar, afterHar) {
  const beforeRequests = requestRows(beforeHar);
  const afterRequests = requestRows(afterHar);
  const {
    added: addedRequests,
    removed: removedRequests,
    persisting: persistingRequests,
  } = diffByKey(beforeRequests, afterRequests, requestKey);

  const beforeCookies = cookieRows(beforeHar);
  const afterCookies = cookieRows(afterHar);
  const {
    added: addedCookies,
    removed: removedCookies,
    persisting: persistingCookies,
  } = diffByKey(beforeCookies, afterCookies, cookieKey);

  const withClassification = (rows) =>
    rows.map((row) => ({ ...row, classification: classifyDomain(row.hostname) }));

  // Third-party is decided per capture-pair, not per row, so that a site whose
  // own host happens to sit on a tracker list is still reported as first-party.
  const documentHost = firstPartyHostname(afterHar) ?? firstPartyHostname(beforeHar);
  const withParty = (rows) =>
    rows.map((row) => ({
      ...row,
      thirdParty: row.hostname != null && row.hostname !== documentHost,
    }));

  const classifiedPersistingRequests = withParty(withClassification(persistingRequests));
  const persistingThirdParty = classifiedPersistingRequests.filter((r) => r.thirdParty);
  const persistingCookiesWithParty = withParty(persistingCookies);

  return {
    summary: {
      beforeRequestCount: beforeRequests.length,
      afterRequestCount: afterRequests.length,
      addedRequestCount: addedRequests.length,
      removedRequestCount: removedRequests.length,
      // Counted on the de-duplicated persisting list, so repeated beacons to
      // the same endpoint do not inflate the headline number.
      persistingRequestCount: classifiedPersistingRequests.length,
      persistingThirdPartyRequestCount: persistingThirdParty.length,
      persistingKnownTrackerRequestCount: persistingThirdParty.filter(
        (r) => r.classification.known,
      ).length,
      addedCookieCount: addedCookies.length,
      removedCookieCount: removedCookies.length,
      persistingCookieCount: persistingCookiesWithParty.length,
    },
    addedRequests: withClassification(addedRequests),
    removedRequests: withClassification(removedRequests),
    persistingRequests: classifiedPersistingRequests,
    addedCookies,
    removedCookies,
    persistingCookies: persistingCookiesWithParty,
    documentHost,
  };
}
