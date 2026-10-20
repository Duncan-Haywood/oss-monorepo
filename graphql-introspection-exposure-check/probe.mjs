// Sends the one real HTTP request this check depends on: a POST carrying a
// deliberately minimal introspection query (root type names and their field
// names, plus every named type and its kind -- not the full recursive schema
// with arguments, descriptions, deprecations, and interfaces) to a GraphQL
// endpoint URL you name. Uses the global `fetch`, deliberately, so this exact
// module runs unmodified from the CLI (Node 22's built-in fetch) and, when a
// target's own CORS policy allows it, directly from the browser page too.
//
// That "when allowed" is the real difference from ventures/cors-misconfig-check:
// this request needs no forbidden header -- Origin is never set by us, only
// an ordinary POST with a JSON body -- so a target whose GraphQL endpoint sets
// a permissive CORS policy (common: many public GraphQL APIs are designed to
// be called from arbitrary frontends) lets a visitor's own browser tab run
// this exact check with no server of ours in the middle. A target that does
// not is why check.mjs exists: fetch() from Node enforces no CORS policy at
// all -- CORS is a browser-only restriction -- so the CLI always gets a real
// answer regardless of the target's CORS headers, at the cost of needing the
// visitor to run it themselves rather than typing a URL into the page.
//
// This module only ever talks to the one endpoint URL a caller names, using
// only the headers that same caller supplies. The query it sends is
// read-only by construction -- GraphQL's introspection meta-fields
// (`__schema`, `__type`) cannot mutate anything -- and it reads no local
// files and makes no other network call.

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'graphql-introspection-exposure-check/1 (+https://duncan-haywood.github.io/monorepo-projects/graphql-introspection-exposure-check/)';

// Deliberately narrower than a client library's full introspection query:
// no arguments, no descriptions, no deprecations, no interfaces/possible
// types. Enough to prove introspection is enabled and to name every root
// field and named type -- the evidence this check reports -- without pulling
// a potentially very large schema document across the wire.
export const INTROSPECTION_QUERY = `query GraphQLIntrospectionExposureCheck {
  __schema {
    queryType { name fields { name } }
    mutationType { name fields { name } }
    subscriptionType { name fields { name } }
    types { name kind }
  }
}`;

/**
 * @param {string} endpointUrl
 * @param {{headers?: Record<string,string>, timeoutMs?: number, fetchImpl?: Function}} [opts]
 * @returns {Promise<{ok: boolean, status: number|null, body: unknown, error: string|null, parseError: string|null}>}
 *   `ok` is transport-level: true whenever a response was received at all,
 *   even a 4xx/5xx one -- a GraphQL server commonly answers a blocked
 *   introspection query with an ordinary error body rather than a network
 *   failure, and that is informative, not a failure to report as one.
 */
export async function sendIntrospectionQuery(endpointUrl, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    return { ok: false, status: null, body: null, error: 'no fetch implementation available in this environment', parseError: null };
  }

  let url;
  try {
    url = new URL(endpointUrl);
  } catch (err) {
    return { ok: false, status: null, body: null, error: `invalid URL: ${err.message}`, parseError: null };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, status: null, body: null, error: `unsupported scheme: ${url.protocol}`, parseError: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...headers,
      },
      body: JSON.stringify({ query: INTROSPECTION_QUERY, operationName: 'GraphQLIntrospectionExposureCheck' }),
      signal: controller.signal,
    });
    let body = null;
    let parseError = null;
    try {
      body = await res.json();
    } catch (err) {
      parseError = err.message ?? String(err);
    }
    return { ok: true, status: res.status, body, error: null, parseError };
  } catch (err) {
    return { ok: false, status: null, body: null, error: err.message ?? String(err), parseError: null };
  } finally {
    clearTimeout(timer);
  }
}
