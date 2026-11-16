import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dohQueryTxt, dohQueryCount, resolveSpfChain, resolveDkim, resolveDmarc, resolveBimi, runFullCheck, DKIM_SELECTORS,
} from './lookup.mjs';

// Every test in this file injects a fake `fetchImpl`/`fetchTxt` -- nothing
// here makes a real network call, matching the rest of this portfolio's
// convention for a network-layer module (see cors-misconfig-check's
// probe.test.mjs, which stands up a loopback-only HTTP server instead;
// mocking fetch directly is simpler here and just as real a test of this
// module's own parsing/error-classification logic).

function fakeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}

function dohJsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

test('dohQueryTxt parses a successful NOERROR answer into dequoted TXT strings', async () => {
  const fetchImpl = fakeFetch(async () =>
    dohJsonResponse({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 -all"' }] }));
  const result = await dohQueryTxt('example.com', { fetchImpl });
  assert.equal(result.ok, true);
  assert.deepEqual(result.records, ['v=spf1 -all']);
  assert.equal(result.error, null);
});

test('dohQueryTxt only keeps TXT (type 16) answers, ignoring anything else in the answer set', async () => {
  const fetchImpl = fakeFetch(async () =>
    dohJsonResponse({ Status: 0, Answer: [{ type: 5, data: 'cname-target.example.com' }, { type: 16, data: '"hello"' }] }));
  const result = await dohQueryTxt('example.com', { fetchImpl });
  assert.deepEqual(result.records, ['hello']);
});

test('dohQueryTxt treats NXDOMAIN (RCODE 3) as a real, empty answer -- not a transport error', async () => {
  const fetchImpl = fakeFetch(async () => dohJsonResponse({ Status: 3, Answer: [] }));
  const result = await dohQueryTxt('nonexistent.invalid', { fetchImpl });
  assert.equal(result.ok, true);
  assert.deepEqual(result.records, []);
});

test('dohQueryTxt reports an HTTP error from the resolver as a transport failure', async () => {
  const fetchImpl = fakeFetch(async () => dohJsonResponse({}, { ok: false, status: 503 }));
  const result = await dohQueryTxt('example.com', { fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.records, null);
  assert.match(result.error, /503/);
});

test('dohQueryTxt reports an unexpected RCODE (e.g. SERVFAIL) as a transport failure', async () => {
  const fetchImpl = fakeFetch(async () => dohJsonResponse({ Status: 2 }));
  const result = await dohQueryTxt('example.com', { fetchImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /RCODE 2/);
});

test('dohQueryTxt reports a thrown network error as a transport failure', async () => {
  const fetchImpl = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  const result = await dohQueryTxt('example.com', { fetchImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /ENOTFOUND/);
});

test('dohQueryTxt reports a timeout distinctly', async () => {
  const fetchImpl = async (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const result = await dohQueryTxt('example.com', { fetchImpl, timeoutMs: 5 });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'timed out');
});

test('dohQueryTxt is not an error when no fetch implementation exists in this runtime', async () => {
  // `null`, not `undefined` -- a default parameter only kicks in on
  // `undefined`, and the point of this test is to exercise the runtime
  // genuinely having no `fetch` rather than falling through to this
  // sandbox's real (proxied) one.
  const result = await dohQueryTxt('example.com', { fetchImpl: null });
  assert.equal(result.ok, false);
  assert.match(result.error, /fetch/);
});

// A real 2048-bit RSA SubjectPublicKeyInfo, generated for these fixtures.
const KEY_2048 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs3RRsQ+XR0yBvYuIEVsLTafn0dS6TJNTVJm0v2RFmb5re8QfScXDWj4Qfply8QSCWlFhpurSGTlizKt4xb6xmTB4Dowfv5831ZZaegt/QzcGs1C/Z0q11Ostet1J3tfJLV2teRon2zScjMEVDuGU7INx14uieYR+12MPJSz+nTkirv30d3YWngBxGhbfrq3A89tHmL+1VaYXqa/MC+hwHOThbPylGbcLzFyfIuVXRXn/hIu3rHNfE3I+4cTAoMBEb53WzzNfqZxPJ+0bBaebFP4H8CEos46k/pOIgS0QP0nPBEC19SNLRrps9aftgubevMfrKrAW5GtyIGChZu3O7QIDAQAB';

// ---------------------------------------------------------------------------
// resolveSpfChain: BFS-fetches the whole include:/redirect= closure
// ---------------------------------------------------------------------------

function domainMap(map) {
  return async (name) => {
    const key = name.toLowerCase();
    if (!(key in map)) return { ok: true, records: [], error: null };
    return { ok: true, records: map[key], error: null };
  };
}

test('resolveSpfChain fetches the root and every included domain it discovers', async () => {
  const seen = [];
  const fetchTxt = async (name, opts) => {
    seen.push(name);
    return domainMap({
      'example.com': ['v=spf1 include:esp.example.net -all'],
      'esp.example.net': ['v=spf1 ip4:203.0.113.0/24 -all'],
    })(name, opts);
  };
  const { walk, error } = await resolveSpfChain('example.com', { fetchTxt });
  assert.equal(error, null);
  assert.equal(walk.totalLookups, 1);
  assert.deepEqual(seen.sort(), ['esp.example.net', 'example.com'].sort());
});

test('resolveSpfChain records a transport error on the root domain as `error`, not a false "no SPF"', async () => {
  const fetchTxt = async () => ({ ok: false, records: null, error: 'timed out' });
  const { walk, error } = await resolveSpfChain('example.com', { fetchTxt });
  assert.equal(error, 'timed out');
  assert.equal(walk.truncated, true);
});

test('resolveSpfChain does not re-fetch a domain reached by two different includes', async () => {
  let calls = 0;
  const fetchTxt = async (name) => {
    calls += 1;
    const map = {
      'example.com': ['v=spf1 include:a.example.net include:b.example.net -all'],
      'a.example.net': ['v=spf1 include:shared.example.net -all'],
      'b.example.net': ['v=spf1 include:shared.example.net -all'],
      'shared.example.net': ['v=spf1 -all'],
    };
    return { ok: true, records: map[name] ?? [], error: null };
  };
  const { walk } = await resolveSpfChain('example.com', { fetchTxt });
  assert.equal(calls, 4); // example.com, a, b, shared -- shared fetched once, not twice
  // Fetching is deduplicated (4 network calls), but counting is not: SPF's
  // lookup budget charges each `include:` mechanism that references shared
  // once, per RFC 7208, even when both point at the same target domain --
  // root's 2 includes (a, b) + a's 1 include (shared) + b's 1 include
  // (shared) = 4. Silently deduping the *count* here would under-report the
  // real cost of stacking the same ESP under two different parent records.
  assert.equal(walk.totalLookups, 4);
});

// ---------------------------------------------------------------------------
// resolveDkim / resolveDmarc / resolveBimi
// ---------------------------------------------------------------------------

test('resolveDkim queries every selector at <selector>._domainkey.<domain>', async () => {
  const seen = [];
  const fetchTxt = async (name) => { seen.push(name); return { ok: true, records: name.startsWith('google.') ? ['v=DKIM1; p=abc'] : [], error: null }; };
  const { selectorResults } = await resolveDkim('example.com', { fetchTxt });
  assert.equal(selectorResults.length, DKIM_SELECTORS.length);
  assert.ok(seen.includes('google._domainkey.example.com'));
  const google = selectorResults.find((r) => r.selector === 'google');
  assert.deepEqual(google.txtRecords, ['v=DKIM1; p=abc']);
});

test('resolveDkim reports a per-selector transport failure without failing the whole run', async () => {
  const fetchTxt = async (name) =>
    name.startsWith('google.') ? { ok: false, records: null, error: 'timed out' } : { ok: true, records: [], error: null };
  const { selectorResults, errors } = await resolveDkim('example.com', { fetchTxt });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].selector, 'google');
  assert.equal(selectorResults.find((r) => r.selector === 'google').txtRecords, null);
});

test('resolveDmarc queries _dmarc.<domain>', async () => {
  const fetchTxt = async (name) => ({ ok: true, records: name === '_dmarc.example.com' ? ['v=DMARC1; p=reject'] : [], error: null });
  const { records, error } = await resolveDmarc('example.com', { fetchTxt });
  assert.deepEqual(records, ['v=DMARC1; p=reject']);
  assert.equal(error, null);
});

test('resolveDmarc falls back to the parent when the subdomain has no DMARC record (RFC 7489 s6.6.3)', async () => {
  const asked = [];
  const map = { '_dmarc.zendesk.com': ['v=DMARC1; p=reject; rua=mailto:d@zendesk.com'] };
  const fetchTxt = async (name) => { asked.push(name); return { ok: true, records: map[name] ?? [], error: null }; };
  const r = await resolveDmarc('mail.zendesk.com', { fetchTxt });
  assert.deepEqual(asked, ['_dmarc.mail.zendesk.com', '_dmarc.zendesk.com']);
  assert.equal(r.foundAt, 'zendesk.com');
  assert.deepEqual(r.records, map['_dmarc.zendesk.com']);
});

test('resolveDmarc never queries the bare TLD, and an unrelated TXT record does not stop the walk', async () => {
  const asked = [];
  const map = { '_dmarc.a.b.example.com': ['google-site-verification=x'] };
  const fetchTxt = async (name) => { asked.push(name); return { ok: true, records: map[name] ?? [], error: null }; };
  const r = await resolveDmarc('a.b.example.com', { fetchTxt });
  assert.deepEqual(asked, ['_dmarc.a.b.example.com', '_dmarc.b.example.com', '_dmarc.example.com']);
  assert.equal(r.foundAt, null);
  assert.equal(r.error, null);
});

test('resolveDmarc stops at a name with several DMARC records instead of walking past it', async () => {
  const map = { '_dmarc.sub.example.com': ['v=DMARC1; p=none', 'v=DMARC1; p=reject'], '_dmarc.example.com': ['v=DMARC1; p=reject'] };
  const fetchTxt = async (name) => ({ ok: true, records: map[name] ?? [], error: null });
  const r = await resolveDmarc('sub.example.com', { fetchTxt });
  assert.equal(r.foundAt, 'sub.example.com');
  assert.equal(r.records.length, 2);
});

test('resolveDmarc reports a transport failure during the walk as an error, not as absent', async () => {
  const fetchTxt = async (name) => (name === '_dmarc.example.com' ? { ok: false, records: null, error: 'timed out' } : { ok: true, records: [], error: null });
  const r = await resolveDmarc('sub.example.com', { fetchTxt });
  assert.equal(r.error, 'timed out');
});

test('resolveDmarc caps a deep name at 8 queries, shortening to 7 labels first (DMARCbis tree walk)', async () => {
  const asked = [];
  const fetchTxt = async (name) => { asked.push(name); return { ok: true, records: [], error: null }; };
  await resolveDmarc('a.b.c.d.e.f.g.h.i.example.com', { fetchTxt });
  assert.ok(asked.length <= 8);
  assert.equal(asked[0], '_dmarc.a.b.c.d.e.f.g.h.i.example.com');
  assert.equal(asked[1], '_dmarc.e.f.g.h.i.example.com');
  assert.equal(asked.at(-1), '_dmarc.example.com');
});

test('runFullCheck: a subdomain covered by its parent p=reject is not reported as spoofable', async () => {
  const map = {
    'mail.zendesk.com': ['v=spf1 -all'],
    '_dmarc.zendesk.com': ['v=DMARC1; p=reject; pct=100; rua=mailto:d@zendesk.com'],
  };
  const fetchTxt = async (name) => ({ ok: true, records: map[name] ?? [], error: null });
  const report = await runFullCheck('mail.zendesk.com', { fetchTxt, queryCount: async () => ({ ok: true, count: 1, error: null }) });
  const ids = report.findings.map((f) => f.id);
  assert.ok(!ids.includes('dmarc-missing'), ids.join(','));
  assert.ok(ids.includes('dmarc-inherited'));
  assert.ok(ids.includes('dmarc-policy-reject'));
  assert.equal(report.dangerCount, 0);
});

test('resolveBimi queries default._bimi.<domain>', async () => {
  const fetchTxt = async (name) => ({ ok: true, records: name === 'default._bimi.example.com' ? ['v=BIMI1; l=https://example.com/logo.svg'] : [], error: null });
  const { records } = await resolveBimi('example.com', { fetchTxt });
  assert.deepEqual(records, ['v=BIMI1; l=https://example.com/logo.svg']);
});

// ---------------------------------------------------------------------------
// runFullCheck: the single entry point cli.mjs and index.html both call
// ---------------------------------------------------------------------------

test('runFullCheck assembles a full report from one injected fetchTxt', async () => {
  const map = {
    'example.com': ['v=spf1 -all'],
    'google._domainkey.example.com': ['v=DKIM1; p=' + KEY_2048],
    '_dmarc.example.com': ['v=DMARC1; p=reject; pct=100; rua=mailto:dmarc@example.com'],
  };
  const fetchTxt = async (name) => ({ ok: true, records: map[name] ?? [], error: null });

  const report = await runFullCheck('example.com', { fetchTxt });
  assert.equal(report.domain, 'example.com');
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.ok(report.findings.some((f) => f.id === 'dkim-valid-key'));
});

test('runFullCheck rejects an empty domain rather than making any request', async () => {
  await assert.rejects(() => runFullCheck('', {}), /domain is required/);
});

// ---------------------------------------------------------------------------
// void lookups (RFC 7208 s4.6.4: more than 2 empty a/mx/exists lookups)
// ---------------------------------------------------------------------------

function countStub(map, calls = []) {
  return async (name, type) => {
    calls.push(`${type}:${name}`);
    return { ok: true, count: (map[`${type}:${name}`] || 0), error: null };
  };
}

test('resolveSpfChain counts a/mx/exists terms whose targets answer empty as void lookups', async () => {
  const fetchTxt = domainMap({ 'example.com': ['v=spf1 a:gone.example.net mx:old.example.net exists:nx.example.net a -all'] });
  const calls = [];
  const queryCount = countStub({ 'A:example.com': 1 }, calls);
  const { walk } = await resolveSpfChain('example.com', { fetchTxt, queryCount });
  assert.deepEqual(walk.voidLookups.map((v) => `${v.mechanism}:${v.target}`), ['a:gone.example.net', 'mx:old.example.net', 'exists:nx.example.net']);
  assert.equal(walk.voidUnchecked, 0);
});

test('an a term is not void when only AAAA exists; macros are skipped; transport errors are unchecked, not void', async () => {
  const fetchTxt = domainMap({ 'example.com': ['v=spf1 a:v6.example.net exists:%{i}.bl.example.net mx:flaky.example.net -all'] });
  const queryCount = async (name, type) => {
    if (name === 'flaky.example.net') return { ok: false, count: null, error: 'timed out' };
    return { ok: true, count: type === 'AAAA' ? 1 : 0, error: null };
  };
  const { walk } = await resolveSpfChain('example.com', { fetchTxt, queryCount });
  assert.deepEqual(walk.voidLookups, []);
  assert.equal(walk.voidUnchecked, 1);
});

test('dohQueryCount: empty answer and NXDOMAIN are count 0, transport failure is not ok', async () => {
  const mk = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => body });
  assert.deepEqual(await dohQueryCount('x.example', 'A', { fetchImpl: mk({ Status: 3 }) }), { ok: true, count: 0, error: null });
  assert.deepEqual(await dohQueryCount('x.example', 'MX', { fetchImpl: mk({ Status: 0, Answer: [{ type: 15, data: '10 m.example.' }] }) }), { ok: true, count: 1, error: null });
  assert.equal((await dohQueryCount('x.example', 'A', { fetchImpl: mk({}, false) })).ok, false);
});
