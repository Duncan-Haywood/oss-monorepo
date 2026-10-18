// Real HTTP fetch of a podcast feed URL, for the CLI. Uses the global
// `fetch()` Node 18+ ships built in -- not an npm dependency -- and lets it
// follow ordinary redirects itself, since (unlike redirect-chain-check) this
// tool only needs the feed body at wherever it ends up, not the intermediate
// hops.
//
// This module only ever talks to the one URL a caller names. It makes no
// other network call, reads no local file, and sends nothing anywhere else.

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB: generous for any real RSS feed
const USER_AGENT =
  'podcast-feed-check/1 (+https://duncan-haywood.github.io/monorepo-projects/podcast-feed-check/)';

/**
 * Fetches `url` and returns its body text, or an error -- never throws.
 *
 * @returns {Promise<{ok: boolean, status: number|null, body: string|null, error: string|null}>}
 */
export async function fetchFeedXml(url, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, fetchFn = fetch } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return { ok: false, status: null, body: null, error: `invalid URL: ${err.message}` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: null, body: null, error: `unsupported scheme: ${parsed.protocol}` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetchFn(parsed, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml, text/xml, */*' },
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err?.name === 'AbortError' ? 'timed out' : err.message;
      return { ok: false, status: null, body: null, error: reason };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, body: null, error: `HTTP ${res.status}` };
    }

    const contentLength = Number(res.headers.get('content-length') ?? '0');
    if (contentLength && contentLength > maxBytes) {
      return { ok: false, status: res.status, body: null, error: `feed too large to check (Content-Length ${contentLength} bytes exceeds the ${maxBytes}-byte cap)` };
    }

    const body = await res.text();
    if (body.length > maxBytes) {
      return { ok: false, status: res.status, body: null, error: `feed too large to check (${body.length} bytes exceeds the ${maxBytes}-byte cap)` };
    }

    return { ok: true, status: res.status, body, error: null };
  } finally {
    clearTimeout(timer);
  }
}
