// The only file in this venture that makes a DNS call, over Cloudflare's
// public DNS-over-HTTPS resolver -- the same shape and endpoint
// ventures/subdomain-takeover-check/lookup.mjs and
// ventures/email-auth-check/lookup.mjs already document. Zero-dependency:
// this module runs unmodified from check.mjs on the user's own machine and
// from index.html's <script type=module> in the visitor's own browser. No
// server of ours sits in between, and this tool never sends a request to the
// domain being checked at all -- only to the public resolver, reading DNS
// data the domain owner already published for anyone to see.

import { parseCaaData } from './parse.mjs';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const DEFAULT_TIMEOUT_MS = 8000;
const CAA_TYPE = 257;
const CNAME_TYPE = 5;
const MAX_TREE_WALK_LABELS = 20;

function stripTrailingDot(name) {
  return String(name).replace(/\.$/, '');
}

/** One raw DNS query (CAA or CNAME) via Cloudflare's public DoH JSON API. */
async function dohQuery(name, type, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'no fetch implementation available in this runtime' };
  }
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      headers: { accept: 'application/dns-json' },
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} from the DNS resolver` };
    const body = await res.json();
    if (body.Status === 3) return { ok: true, nxdomain: true, answers: [] }; // NXDOMAIN
    if (body.Status !== 0) return { ok: false, error: `DNS resolver returned RCODE ${body.Status}` };
    return { ok: true, nxdomain: false, answers: body.Answer || [] };
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    return { ok: false, error: timedOut ? 'timed out' : String((err && err.message) || err || 'unknown error') };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Looks up the CAA record set that actually governs certificate issuance for
 * `hostname`, per RFC 8659's tree-walk: a CA does not stop at the exact name
 * you point it at. It (1) follows a CNAME at the exact name once, since CAA
 * for an aliased name is evaluated at the alias's target, and (2) if the
 * resulting name carries no CAA records of its own, walks up one label at a
 * time -- `app.staging.example.com` -> `staging.example.com` ->
 * `example.com` -> `com` -- stopping at the first name that has ANY CAA
 * record set (even an empty, disallow-nothing one is still "found here" if
 * a zero-record answer at that exact name is distinguishable... in practice
 * DNS cannot distinguish "no CAA records" from "domain doesn't publish CAA",
 * so this keeps walking until it gets a non-empty answer or runs out of
 * labels, exactly matching what a real CA's own resolver does).
 *
 * Most simple "CAA lookup" tools query only the exact name you type and stop
 * -- which reports "no CAA record" (and therefore "any CA may issue") for a
 * subdomain whose *parent* domain actually restricts issuance, the single
 * most common source of the "why does my subdomain suddenly fail to renew"
 * confusion on Let's Encrypt's own community forum.
 *
 * @returns {{
 *   ok: boolean,
 *   queriedName: string,
 *   canonicalName: string,
 *   foundAtName: string|null,
 *   records: Array<{ok: true, flag:number, critical:boolean, tag:string, value:string} | {ok:false, error:string, raw:string}>,
 *   walkedNames: string[],
 *   error: string|null,
 * }}
 */
export async function resolveCaaSet(hostname, { fetchImpl, timeoutMs, dohQueryFn = dohQuery } = {}) {
  const queriedName = stripTrailingDot(hostname).toLowerCase();
  const opts = { fetchImpl, timeoutMs };

  // Step 1: a single CNAME hop at the exact name. A chain of CNAMEs pointing
  // through several aliases is rare for the name someone types into this
  // tool (that shape is CDN/load-balancer territory, not a bare "does my
  // domain have a working CAA record" question), so one hop covers the
  // common case -- a redirect to a hosting provider's own name -- without
  // this tool's tree-walk needing full loop protection on top of it.
  let canonicalName = queriedName;
  const cnameResult = await dohQueryFn(queriedName, CNAME_TYPE, opts);
  if (cnameResult.ok && !cnameResult.nxdomain) {
    const cname = cnameResult.answers.find((a) => a && a.type === CNAME_TYPE);
    if (cname) canonicalName = stripTrailingDot(cname.data).toLowerCase();
  }

  // Step 2: walk up from the canonical name until a non-empty CAA answer.
  const labels = canonicalName.split('.').filter(Boolean);
  const walkedNames = [];
  for (let dropped = 0; dropped <= Math.min(labels.length - 1, MAX_TREE_WALK_LABELS); dropped++) {
    const name = labels.slice(dropped).join('.');
    if (!name) break;
    walkedNames.push(name);
    const result = await dohQueryFn(name, CAA_TYPE, opts);
    if (!result.ok) {
      return { ok: false, queriedName, canonicalName, foundAtName: null, records: [], walkedNames, error: result.error };
    }
    const caaAnswers = result.answers.filter((a) => a && a.type === CAA_TYPE);
    if (caaAnswers.length > 0) {
      const records = caaAnswers.map((a) => parseCaaData(String(a.data)));
      return { ok: true, queriedName, canonicalName, foundAtName: name, records, walkedNames, error: null };
    }
    // Empty answer at this name: per RFC 8659, keep walking up. Reaching the
    // top-level domain with nothing found means no CAA record exists
    // anywhere in the tree, so every CA is authorized.
  }
  return { ok: true, queriedName, canonicalName, foundAtName: null, records: [], walkedNames, error: null };
}
