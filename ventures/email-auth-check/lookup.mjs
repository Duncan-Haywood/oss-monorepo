// The only file in this venture that makes a network call.
//
// Uses the platform's own global `fetch` -- a Node 18+ builtin (no npm
// install, so this stays zero-dependency the same way
// ventures/ai-crawler-access-check/cli.mjs's `fetchText` and
// ventures/cors-misconfig-check/probe.mjs's raw http/https client are
// zero-dependency) -- so the identical module runs unmodified from
// cli.mjs on the user's own machine and from index.html's
// <script type=module> in the visitor's own browser. Either way the
// request goes straight from that machine to Cloudflare's public
// DNS-over-HTTPS resolver; no server of ours sits in between, and nothing
// about the domain being checked is sent anywhere but Cloudflare.
//
// Cloudflare's DoH JSON API (https://developers.cloudflare.com/1.1.1.1/encrypted-dns/dns-over-https/make-api-requests/dns-json/)
// is public, free, needs no key, and answers CORS-enabled, so it is the one
// DNS lookup path reachable from a static page with no server of its own.

import {
  unquoteTxtData, selectSpfRecords, parseSpfMechanisms, walkSpfChain, normalizeDomainKey,
  analyzeDkim, analyzeDmarc, analyzeBimi, buildReport,
} from './analyze.mjs';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_SPF_FETCHES = 30;

/** The common/well-known DKIM selector names this tool checks. */
export const DKIM_SELECTORS = [
  'google', 'selector1', 'selector2', 'k1', 's1', 's2', 'default', 'dkim', 'mail',
];

/**
 * One DNS TXT query via Cloudflare's public DoH JSON API.
 *
 * @returns {{ok: boolean, records: string[]|null, error: string|null}}
 *   `records` is a list of already-dequoted TXT strings; `[]` is a genuine,
 *   reportable "this name has no TXT records" (including NXDOMAIN) answer.
 *   `records` is `null` only when `ok` is false -- a transport failure
 *   (timeout, network error, an unexpected RCODE) where the record's true
 *   state was never actually learned, which must never be read as "absent".
 */
export async function dohQueryTxt(name, opts = {}) {
  const r = await dohFetchAnswers(name, 'TXT', 16, opts);
  return r.ok ? { ok: true, records: r.answers.map((a) => unquoteTxtData(a.data)), error: null } : { ok: false, records: null, error: r.error };
}

/**
 * Same transport as dohQueryTxt, for record types where only "is there any
 * answer" matters (the SPF void-lookup check). `count` is 0 for NXDOMAIN or
 * an empty answer; `ok: false` is a transport failure, never read as empty.
 *
 * @returns {{ok: boolean, count: number|null, error: string|null}}
 */
export async function dohQueryCount(name, type, opts = {}) {
  const typeCode = { A: 1, AAAA: 28, MX: 15 }[type];
  const r = await dohFetchAnswers(name, type, typeCode, opts);
  return r.ok ? { ok: true, count: r.answers.length, error: null } : { ok: false, count: null, error: r.error };
}

async function dohFetchAnswers(name, type, typeCode, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, answers: null, error: 'no fetch implementation available in this runtime' };
  }
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      headers: { accept: 'application/dns-json' },
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) {
      return { ok: false, answers: null, error: `HTTP ${res.status} from the DNS resolver` };
    }
    const body = await res.json();
    // RFC 1035 RCODEs, as Cloudflare's JSON API reports them in `Status`.
    if (body.Status === 3) return { ok: true, answers: [], error: null }; // NXDOMAIN: real, reportable absence
    if (body.Status !== 0) {
      return { ok: false, answers: null, error: `DNS resolver returned RCODE ${body.Status}` };
    }
    return { ok: true, answers: (body.Answer || []).filter((a) => a && a.type === typeCode), error: null };
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    return {
      ok: false,
      answers: null,
      error: timedOut ? 'timed out' : String((err && err.message) || err || 'unknown error'),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetches a domain's SPF record and recursively follows every include:/
 * redirect= mechanism it references (up to `maxFetches` distinct names),
 * then hands the fully-fetched closure to `walkSpfChain` (analyze.mjs,
 * pure) to count the total RFC 7208 lookup budget across the whole chain --
 * not just the root record's own mechanisms.
 */
export async function resolveSpfChain(domain, { fetchTxt = dohQueryTxt, queryCount = dohQueryCount, timeoutMs, maxFetches = DEFAULT_MAX_SPF_FETCHES } = {}) {
  const rootKey = normalizeDomainKey(domain);
  const recordsByDomain = new Map();
  const queued = new Set([rootKey]);
  const queue = [rootKey];
  let rootError = null;
  let fetchedCount = 0;

  while (queue.length && fetchedCount < maxFetches) {
    const name = queue.shift();
    fetchedCount += 1;
    const result = await fetchTxt(name, { timeoutMs });
    if (!result.ok) {
      // Leave this name absent from the map -- walkSpfChain reads that as
      // "not fetched" (truncated) rather than the very different "fetched
      // and genuinely has no SPF record".
      if (name === rootKey) rootError = result.error;
      continue;
    }
    recordsByDomain.set(name, result.records);
    const spfRecords = selectSpfRecords(result.records);
    if (!spfRecords.length) continue;
    const parsed = parseSpfMechanisms(spfRecords[0]);
    for (const term of parsed.lookupTerms) {
      if (term.mechanism !== 'include' || !term.domain) continue;
      const key = normalizeDomainKey(term.domain);
      if (key && !queued.has(key)) {
        queued.add(key);
        queue.push(key);
      }
    }
    if (parsed.redirect) {
      const key = normalizeDomainKey(parsed.redirect);
      if (key && !queued.has(key)) {
        queued.add(key);
        queue.push(key);
      }
    }
  }

  const walk = walkSpfChain(rootKey, recordsByDomain, { maxVisits: maxFetches });
  Object.assign(walk, await findVoidLookups(walk, { queryCount, timeoutMs }));
  return { walk, error: rootError };
}

const MAX_VOID_QUERIES = 20;

/**
 * RFC 7208 s4.6.4 also caps "void lookups" -- a/mx/exists (and include/
 * redirect) lookups that return nothing -- at 2; a third is a PermError. A
 * stale `a:` or `mx:` left over from a retired vendor is the usual cause.
 * This resolves the A/AAAA (or MX) target of each a/mx/exists term in the
 * chain and counts every term occurrence whose target answers empty.
 * Terms with macros (%{...}) can't be resolved without a sender, so they
 * are skipped; lookups that fail in transport are reported unchecked, never
 * counted as void.
 */
export async function findVoidLookups(walk, { queryCount = dohQueryCount, timeoutMs } = {}) {
  const terms = [];
  for (const entry of walk.chain) {
    if (!entry.found || !entry.record) continue;
    for (const t of parseSpfMechanisms(entry.record).lookupTerms) {
      if (t.mechanism !== 'a' && t.mechanism !== 'mx' && t.mechanism !== 'exists') continue;
      const target = normalizeDomainKey(t.domain || entry.domain);
      if (!target || target.includes('%')) continue;
      terms.push({ domain: entry.domain, mechanism: t.mechanism, target });
    }
  }
  const cache = new Map();
  let queries = 0;
  let unchecked = 0;
  async function isVoid(mechanism, target) {
    const types = mechanism === 'mx' ? ['MX'] : ['A', 'AAAA'];
    const key = `${types[0]}:${target}`;
    if (!cache.has(key)) {
      if (queries >= MAX_VOID_QUERIES) {
        cache.set(key, null);
      } else {
        queries += types.length;
        const results = await Promise.all(types.map((ty) => queryCount(target, ty, { timeoutMs })));
        cache.set(key, results.some((r) => !r.ok) ? null : results.every((r) => r.count === 0));
      }
    }
    return cache.get(key);
  }
  const voidLookups = [];
  for (const t of terms) {
    const v = await isVoid(t.mechanism, t.target);
    if (v === null) unchecked += 1;
    else if (v) voidLookups.push(t);
  }
  return { voidLookups, voidUnchecked: unchecked };
}

/** Looks up every common DKIM selector in parallel -- nine small requests,
 * each independent and read-only, straight from this machine to Cloudflare. */
export async function resolveDkim(domain, { fetchTxt = dohQueryTxt, timeoutMs, selectors = DKIM_SELECTORS } = {}) {
  const key = normalizeDomainKey(domain);
  const settled = await Promise.all(
    selectors.map(async (selector) => {
      const result = await fetchTxt(`${selector}._domainkey.${key}`, { timeoutMs });
      return { selector, result };
    }),
  );
  const selectorResults = [];
  const errors = [];
  for (const { selector, result } of settled) {
    if (!result.ok) {
      errors.push({ selector, error: result.error });
      selectorResults.push({ selector, txtRecords: null });
      continue;
    }
    selectorResults.push({ selector, txtRecords: result.records });
  }
  return { selectorResults, errors };
}

export async function resolveDmarc(domain, { fetchTxt = dohQueryTxt, timeoutMs } = {}) {
  const result = await fetchTxt(`_dmarc.${normalizeDomainKey(domain)}`, { timeoutMs });
  return result.ok ? { records: result.records, error: null } : { records: [], error: result.error };
}

export async function resolveBimi(domain, { fetchTxt = dohQueryTxt, timeoutMs } = {}) {
  const result = await fetchTxt(`default._bimi.${normalizeDomainKey(domain)}`, { timeoutMs });
  return result.ok ? { records: result.records, error: null } : { records: [], error: result.error };
}

/**
 * The single entry point both cli.mjs and index.html call: runs all four
 * lookups (SPF's chain, all nine DKIM selectors, DMARC, BIMI) in parallel
 * and returns the finished evidence-first report from analyze.mjs.
 */
export async function runFullCheck(domain, opts = {}) {
  const key = normalizeDomainKey(domain);
  if (!key) throw new Error('A domain is required.');

  const [spf, dkimRaw, dmarcRaw, bimiRaw] = await Promise.all([
    resolveSpfChain(key, opts),
    resolveDkim(key, opts),
    resolveDmarc(key, opts),
    resolveBimi(key, opts),
  ]);

  const dkim = analyzeDkim(dkimRaw.selectorResults);
  const dmarc = analyzeDmarc(dmarcRaw.records);
  const bimi = analyzeBimi(bimiRaw.records, dmarc);

  return buildReport(key, {
    spfWalk: spf.walk,
    spfError: spf.error,
    dkim,
    dkimErrors: dkimRaw.errors,
    dmarc,
    dmarcError: dmarcRaw.error,
    bimi,
    bimiError: bimiRaw.error,
  });
}
