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
 * Looks up the CAA record set that governs certificate issuance for
 * `hostname`, per RFC 8659 section 3 (RelevantCAASet): a CA checks CAA at the
 * name itself, and if nothing is there, at each parent label in turn --
 * `app.staging.example.com` -> `staging.example.com` -> `example.com` ->
 * `com` -- stopping at the first name with a non-empty CAA record set.
 *
 * Aliases: CAA(X) is an ordinary DNS lookup, so when X is a CNAME the answer
 * is the CAA record set at X's target, and only at that target. The search
 * does NOT climb the target's own parents; it goes on to X's parent. (RFC
 * 6844 climbed the target's tree; RFC 8659 dropped that.) The resolver
 * follows aliases on every CAA query, so a CNAME at an ancestor label is
 * covered too. For the typed name this module also asks for the CNAME
 * explicitly and, if the CAA answer came back empty, queries the target's CAA
 * once more, so the alias is reported and a resolver that does not chase it
 * still gives the RFC answer.
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

  // The typed name's CNAME target, if any: reported to the user, and queried
  // for CAA (exactly, not its parents) if the typed name's own answer is empty.
  let canonicalName = queriedName;
  const cnameResult = await dohQueryFn(queriedName, CNAME_TYPE, opts);
  if (cnameResult.ok && !cnameResult.nxdomain) {
    const cname = cnameResult.answers.find((a) => a && a.type === CNAME_TYPE);
    if (cname) canonicalName = stripTrailingDot(cname.data).toLowerCase();
  }

  const walkedNames = [];
  const fail = (error) => ({ ok: false, queriedName, canonicalName, foundAtName: null, records: [], walkedNames, error });
  const caaAt = async (name) => {
    walkedNames.push(name);
    const result = await dohQueryFn(name, CAA_TYPE, opts);
    if (!result.ok) return { error: result.error };
    const caaAnswers = result.answers.filter((a) => a && a.type === CAA_TYPE);
    if (!caaAnswers.length) return { records: null };
    // A resolver that followed an alias labels the records with the target.
    const owner = caaAnswers[0].name ? stripTrailingDot(caaAnswers[0].name).toLowerCase() : name;
    return { records: caaAnswers.map((a) => parseCaaData(String(a.data))), owner };
  };

  // Climb the typed name's own labels (never the alias target's).
  const labels = queriedName.split('.').filter(Boolean);
  for (let dropped = 0; dropped <= Math.min(labels.length - 1, MAX_TREE_WALK_LABELS); dropped++) {
    const name = labels.slice(dropped).join('.');
    if (!name) break;
    let found = await caaAt(name);
    if (found.error) return fail(found.error);
    if (!found.records && dropped === 0 && canonicalName !== queriedName) {
      found = await caaAt(canonicalName);
      if (found.error) return fail(found.error);
    }
    if (found.records) {
      return { ok: true, queriedName, canonicalName, foundAtName: found.owner, records: found.records, walkedNames, error: null };
    }
    // Empty answer at this name: per RFC 8659, keep walking up. Reaching the
    // top-level domain with nothing found means no CAA record exists
    // anywhere in the tree, so every CA is authorized.
  }
  return { ok: true, queriedName, canonicalName, foundAtName: null, records: [], walkedNames, error: null };
}
