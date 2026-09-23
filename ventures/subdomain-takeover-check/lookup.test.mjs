import test from 'node:test';
import assert from 'node:assert/strict';
import { dohQueryCname, resolveCnameChain } from './lookup.mjs';

// Every test in this file injects a fake `fetchImpl`/`fetchTxt` -- nothing
// here makes a real network call, matching this portfolio's convention for a
// DNS-layer module (see ventures/email-auth-check/lookup.test.mjs).

function fakeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}

function dohJsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

test('dohQueryCname parses a successful NOERROR answer into a target with the trailing dot stripped', async () => {
  const fetchImpl = fakeFetch(async () =>
    dohJsonResponse({ Status: 0, Answer: [{ type: 5, data: 'old-app.herokuapp.com.' }] }));
  const result = await dohQueryCname('blog.example.com', { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.target, 'old-app.herokuapp.com');
  assert.equal(result.error, null);
});

test('dohQueryCname only keeps CNAME (type 5) answers, ignoring anything else in the answer set', async () => {
  const fetchImpl = fakeFetch(async () =>
    dohJsonResponse({ Status: 0, Answer: [{ type: 16, data: '"hello"' }, { type: 5, data: 'target.example.net.' }] }));
  const result = await dohQueryCname('example.com', { fetchImpl });
  assert.equal(result.target, 'target.example.net');
});

test('dohQueryCname treats a NOERROR answer with no CNAME record as a real, reportable absence', async () => {
  const fetchImpl = fakeFetch(async () => dohJsonResponse({ Status: 0, Answer: [] }));
  const result = await dohQueryCname('example.com', { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.target, null);
});

test('dohQueryCname treats NXDOMAIN (RCODE 3) as a real, empty answer -- not a transport error', async () => {
  const fetchImpl = fakeFetch(async () => dohJsonResponse({ Status: 3, Answer: [] }));
  const result = await dohQueryCname('nonexistent.invalid', { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.target, null);
});

test('dohQueryCname reports an HTTP error from the resolver as a transport failure', async () => {
  const fetchImpl = fakeFetch(async () => dohJsonResponse({}, { ok: false, status: 503 }));
  const result = await dohQueryCname('example.com', { fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.target, null);
  assert.match(result.error, /503/);
});

test('dohQueryCname reports an unexpected RCODE (e.g. SERVFAIL) as a transport failure', async () => {
  const fetchImpl = fakeFetch(async () => dohJsonResponse({ Status: 2 }));
  const result = await dohQueryCname('example.com', { fetchImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /RCODE 2/);
});

test('dohQueryCname reports a thrown network error as a transport failure', async () => {
  const fetchImpl = async () => { throw new Error('boom'); };
  const result = await dohQueryCname('example.com', { fetchImpl });
  assert.equal(result.ok, false);
  assert.match(result.error, /boom/);
});

test('dohQueryCname reports a missing fetch implementation clearly', async () => {
  // Passing a non-function explicitly forces the branch without falling
  // back to the real global fetch (which the default parameter would do for
  // an explicit `undefined`).
  const result = await dohQueryCname('example.com', { fetchImpl: null });
  assert.equal(result.ok, false);
  assert.match(result.error, /no fetch implementation/);
});

// --- resolveCnameChain ------------------------------------------------

function chainResolver(map) {
  return async (name) => {
    const target = map[name.toLowerCase()];
    if (target === undefined) return { ok: true, target: null, error: null };
    return { ok: true, target, error: null };
  };
}

test('resolveCnameChain returns a single-element chain when the hostname has no CNAME', async () => {
  const result = await resolveCnameChain('example.com', { fetchTxt: chainResolver({}) });
  assert.deepEqual(result.chain, ['example.com']);
  assert.equal(result.finalTarget, null);
  assert.equal(result.truncated, false);
});

test('resolveCnameChain follows a single hop to its real end', async () => {
  const result = await resolveCnameChain('blog.example.com', {
    fetchTxt: chainResolver({ 'blog.example.com': 'old-app.herokuapp.com' }),
  });
  assert.deepEqual(result.chain, ['blog.example.com', 'old-app.herokuapp.com']);
  assert.equal(result.finalTarget, 'old-app.herokuapp.com');
});

test('resolveCnameChain follows a multi-hop chain to its real end', async () => {
  const result = await resolveCnameChain('a.example.com', {
    fetchTxt: chainResolver({
      'a.example.com': 'b.example.net',
      'b.example.net': 'c.example.org',
    }),
  });
  assert.deepEqual(result.chain, ['a.example.com', 'b.example.net', 'c.example.org']);
  assert.equal(result.finalTarget, 'c.example.org');
});

test('resolveCnameChain stops at maxHops and reports truncated', async () => {
  const map = {};
  for (let i = 0; i < 20; i++) map[`h${i}.example.com`] = `h${i + 1}.example.com`;
  const result = await resolveCnameChain('h0.example.com', { fetchTxt: chainResolver(map), maxHops: 3 });
  assert.equal(result.chain.length, 4); // root + 3 hops
  assert.equal(result.truncated, true);
});

test('resolveCnameChain stops and reports truncated on a CNAME loop rather than spinning forever', async () => {
  const result = await resolveCnameChain('a.example.com', {
    fetchTxt: chainResolver({
      'a.example.com': 'b.example.com',
      'b.example.com': 'a.example.com',
    }),
  });
  assert.equal(result.truncated, true);
  assert.equal(result.error, null);
});

test('resolveCnameChain reports a lookup error at the root without a partial chain being misread as complete', async () => {
  const result = await resolveCnameChain('example.com', {
    fetchTxt: async () => ({ ok: false, target: null, error: 'timed out' }),
  });
  assert.equal(result.error, 'timed out');
  assert.equal(result.finalTarget, null);
});

test('resolveCnameChain returns what it resolved so far when a later hop fails', async () => {
  const result = await resolveCnameChain('a.example.com', {
    fetchTxt: async (name) => {
      if (name === 'a.example.com') return { ok: true, target: 'b.example.com', error: null };
      return { ok: false, target: null, error: 'timed out' };
    },
  });
  assert.equal(result.error, 'timed out');
  assert.equal(result.finalTarget, 'b.example.com');
  assert.deepEqual(result.chain, ['a.example.com', 'b.example.com']);
});
