import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dohQueryTxt, resolveSpfChain, resolveDkim, resolveDmarc, resolveBimi, runFullCheck, DKIM_SELECTORS,
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
    'google._domainkey.example.com': ['v=DKIM1; p=abc123'],
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
