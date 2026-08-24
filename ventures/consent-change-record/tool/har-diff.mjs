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

function requestKey(row) {
  return `${row.method} ${row.url}`;
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
  return {
    added: afterRows.filter((row) => !beforeKeys.has(keyFn(row))),
    removed: beforeRows.filter((row) => !afterKeys.has(keyFn(row))),
  };
}

/**
 * Diffs two HAR captures. Returns added/removed requests (each tagged with a
 * disclosed, non-exhaustive tracker classification) and added/removed
 * response cookies. Throws if either capture is not a HAR log.
 */
export function diffHarCaptures(beforeHar, afterHar) {
  const beforeRequests = requestRows(beforeHar);
  const afterRequests = requestRows(afterHar);
  const { added: addedRequests, removed: removedRequests } = diffByKey(
    beforeRequests,
    afterRequests,
    requestKey,
  );

  const beforeCookies = cookieRows(beforeHar);
  const afterCookies = cookieRows(afterHar);
  const { added: addedCookies, removed: removedCookies } = diffByKey(
    beforeCookies,
    afterCookies,
    cookieKey,
  );

  const withClassification = (rows) =>
    rows.map((row) => ({ ...row, classification: classifyDomain(row.hostname) }));

  return {
    summary: {
      beforeRequestCount: beforeRequests.length,
      afterRequestCount: afterRequests.length,
      addedRequestCount: addedRequests.length,
      removedRequestCount: removedRequests.length,
      addedCookieCount: addedCookies.length,
      removedCookieCount: removedCookies.length,
    },
    addedRequests: withClassification(addedRequests),
    removedRequests: withClassification(removedRequests),
    addedCookies,
    removedCookies,
  };
}
