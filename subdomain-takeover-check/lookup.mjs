// The only file in this venture that makes a DNS call. Uses the platform's
// own global `fetch` -- zero-dependency, so this module runs unmodified from
// check.mjs on the user's own machine and from index.html's
// <script type=module> in the visitor's own browser -- the same shape
// ventures/email-auth-check/lookup.mjs documents. Either way the request
// goes straight from that machine to Cloudflare's public DNS-over-HTTPS
// resolver; no server of ours sits in between, and nothing about the
// hostname being checked is sent anywhere but Cloudflare.
//
// Cloudflare's DoH JSON API
// (https://developers.cloudflare.com/1.1.1.1/encrypted-dns/dns-over-https/make-api-requests/dns-json/)
// is public, free, needs no key, and answers CORS-enabled, so it is the one
// DNS lookup path reachable from a static page with no server of its own.

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_HOPS = 8;

/**
 * One DNS CNAME query via Cloudflare's public DoH JSON API.
 *
 * @returns {{ok: boolean, target: string|null, error: string|null}}
 *   `target` is the CNAME's target hostname with the trailing root dot
 *   stripped, or `null` when the name genuinely has no CNAME record
 *   (including NXDOMAIN) -- a real, reportable "not CNAME-based" answer.
 *   `target` is only meaningfully `null` when `ok` is true; `ok: false`
 *   means the record's true state was never learned (a transport failure)
 *   and must never be read as "no CNAME".
 */
export async function dohQueryCname(name, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, target: null, error: 'no fetch implementation available in this runtime' };
  }
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=CNAME`;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      headers: { accept: 'application/dns-json' },
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) {
      return { ok: false, target: null, error: `HTTP ${res.status} from the DNS resolver` };
    }
    const body = await res.json();
    // RFC 1035 RCODEs, as Cloudflare's JSON API reports them in `Status`.
    if (body.Status === 3) return { ok: true, target: null, error: null }; // NXDOMAIN: real, reportable absence
    if (body.Status !== 0) {
      return { ok: false, target: null, error: `DNS resolver returned RCODE ${body.Status}` };
    }
    const cnameAnswer = (body.Answer || []).find((a) => a && a.type === 5); // 5 = CNAME
    const target = cnameAnswer ? String(cnameAnswer.data).replace(/\.$/, '') : null;
    return { ok: true, target, error: null };
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    return {
      ok: false,
      target: null,
      error: timedOut ? 'timed out' : String((err && err.message) || err || 'unknown error'),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Follows a hostname's CNAME chain to its end: `blog.example.com` ->
 * `old-app.herokuapp.com` -> (no further CNAME). Stops at the first name
 * with no CNAME record (real end of the chain, whether or not it then
 * resolves to an A/AAAA record -- this tool never checks those), at
 * `maxHops`, or at a repeated name (a CNAME loop, which is a DNS
 * misconfiguration of its own and never a takeover finding this tool makes).
 *
 * @returns {{chain: string[], finalTarget: string|null, truncated: boolean, error: string|null}}
 *   `chain` always starts with the hostname itself. `finalTarget` is the
 *   last CNAME target found (`null` when the root hostname itself has no
 *   CNAME at all -- see analyze.mjs's `no-cname` category).
 */
export async function resolveCnameChain(hostname, { fetchTxt = dohQueryCname, timeoutMs, maxHops = DEFAULT_MAX_HOPS } = {}) {
  const chain = [hostname];
  const seen = new Set([hostname.toLowerCase()]);
  let current = hostname;
  let finalTarget = null;
  let truncated = false;

  for (let hop = 0; hop < maxHops; hop++) {
    const result = await fetchTxt(current, { timeoutMs });
    if (!result.ok) {
      return { chain, finalTarget, truncated: false, error: result.error };
    }
    if (!result.target) break; // real end of the chain
    if (seen.has(result.target.toLowerCase())) {
      truncated = true; // a CNAME loop -- stop rather than spin forever
      break;
    }
    finalTarget = result.target;
    chain.push(result.target);
    seen.add(result.target.toLowerCase());
    current = result.target;
    if (hop === maxHops - 1) truncated = true;
  }

  return { chain, finalTarget, truncated, error: null };
}
