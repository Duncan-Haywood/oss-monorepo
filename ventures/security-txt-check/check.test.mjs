import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';
import { candidateUrls } from './fetch-url.mjs';

const NOW = new Date('2026-09-16T12:00:00Z');

const VALID = [
  'Contact: mailto:security@example.com',
  'Expires: 2027-01-31T23:59:00.000Z',
  'Canonical: https://example.com/.well-known/security.txt',
].join('\n');

/** A fake fetcher: a map of URL -> response. Anything unmapped 404s, which is
 * what a site without that file actually does. */
function fakeFetcher(responses) {
  const seen = [];
  const fn = async (url) => {
    seen.push(url);
    const r = responses[url];
    if (!r) return { ok: false, status: 404, url, body: null, contentType: null, error: null };
    return { ok: true, status: 200, url, contentType: 'text/plain; charset=utf-8', error: null, ...r };
  };
  fn.seen = seen;
  return fn;
}

test('candidateUrls tries the RFC location first, then the legacy one', () => {
  assert.deepEqual(candidateUrls('example.com').candidates, [
    'https://example.com/.well-known/security.txt',
    'https://example.com/security.txt',
  ]);
});

test('candidateUrls accepts a bare host, an origin, and a full URL alike', () => {
  const bare = candidateUrls('example.com').candidates[0];
  const origin = candidateUrls('https://example.com').candidates[0];
  const slash = candidateUrls('https://example.com/').candidates[0];
  assert.equal(bare, origin);
  assert.equal(origin, slash);
});

test('candidateUrls does not second-guess an explicit path', () => {
  const { candidates } = candidateUrls('https://example.com/custom/security.txt');
  assert.deepEqual(candidates, ['https://example.com/custom/security.txt']);
});

test('candidateUrls rejects a non-HTTP scheme and empty input', () => {
  assert.ok(candidateUrls('ftp://example.com').error);
  assert.ok(candidateUrls('   ').error);
});

test('a valid file at the RFC location passes and never tries the legacy path', async () => {
  const fetchFn = fakeFetcher({
    'https://example.com/.well-known/security.txt': { body: VALID },
  });
  const result = await runCheck('example.com', { fetchFn, now: NOW });

  assert.equal(result.fetchError, null);
  assert.equal(result.servedFrom, 'https://example.com/.well-known/security.txt');
  assert.equal(result.report.ok, true);
  assert.deepEqual(result.report.findings, []);
  assert.deepEqual(fetchFn.seen, ['https://example.com/.well-known/security.txt']);
});

test('a file only at the site root is found, and the location is reported', async () => {
  const fetchFn = fakeFetcher({
    'https://example.com/security.txt': { body: VALID },
  });
  const result = await runCheck('example.com', { fetchFn, now: NOW });

  assert.equal(result.servedFrom, 'https://example.com/security.txt');
  assert.ok(result.report.findings.some((f) => f.id === 'wrong-location'));
  assert.equal(result.report.ok, true, 'a legacy location is a notice, not a failure');
});

test('no security.txt anywhere is a fetch error, and both paths are recorded as tried', async () => {
  const result = await runCheck('example.com', { fetchFn: fakeFetcher({}), now: NOW });

  assert.match(result.fetchError, /no security\.txt found/);
  assert.equal(result.report, null);
  assert.deepEqual(result.triedUrls.map((t) => t.status), [404, 404]);
});

test('an empty body at the RFC location falls through to the legacy path', async () => {
  const fetchFn = fakeFetcher({
    'https://example.com/.well-known/security.txt': { body: '   \n' },
    'https://example.com/security.txt': { body: VALID },
  });
  const result = await runCheck('example.com', { fetchFn, now: NOW });
  assert.equal(result.servedFrom, 'https://example.com/security.txt');
});

test('an expired file fails the run', async () => {
  const fetchFn = fakeFetcher({
    'https://example.com/.well-known/security.txt': {
      body: 'Contact: mailto:s@example.com\nExpires: 2025-01-01T00:00:00Z',
    },
  });
  const result = await runCheck('example.com', { fetchFn, now: NOW });
  assert.equal(result.report.ok, false);
  assert.ok(result.report.findings.some((f) => f.id === 'expires-past'));
});

test('the served media type reaches the report', async () => {
  const fetchFn = fakeFetcher({
    'https://example.com/.well-known/security.txt': { body: VALID, contentType: 'text/html' },
  });
  const result = await runCheck('example.com', { fetchFn, now: NOW });
  assert.ok(result.report.findings.some((f) => f.id === 'content-type'));
});

test('an invalid target is reported without any fetch being attempted', async () => {
  const fetchFn = fakeFetcher({});
  const result = await runCheck('ftp://example.com', { fetchFn, now: NOW });
  assert.match(result.fetchError, /unsupported scheme/);
  assert.deepEqual(fetchFn.seen, []);
});

test('a transport error on one candidate does not stop the other being tried', async () => {
  const fetchFn = async (url) => {
    if (url.includes('.well-known')) {
      return { ok: false, status: null, url, body: null, contentType: null, error: 'timed out' };
    }
    return { ok: true, status: 200, url, body: VALID, contentType: 'text/plain; charset=utf-8', error: null };
  };
  const result = await runCheck('example.com', { fetchFn, now: NOW });
  assert.equal(result.servedFrom, 'https://example.com/security.txt');
  assert.equal(result.triedUrls[0].error, 'timed out');
});
