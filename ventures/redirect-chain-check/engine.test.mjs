import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChain, normalizeForLoopCheck, parseHopsText } from './engine.mjs';

test('empty input reports inputError and not-ok', () => {
  const r = classifyChain([]);
  assert.equal(r.ok, false);
  assert.ok(r.inputError);
});

test('a clean single-hop 301 -> 200 chain is ok with no findings', () => {
  const r = classifyChain([
    { url: 'https://example.com/old', status: 301 },
    { url: 'https://example.com/new', status: 200 },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.findings.length, 0);
  assert.equal(r.hopCount, 1);
  assert.equal(r.finalStatus, 200);
});

test('a direct 200 with no redirect at all is ok', () => {
  const r = classifyChain([{ url: 'https://example.com/', status: 200 }]);
  assert.equal(r.ok, true);
  assert.equal(r.hopCount, 0);
});

test('detects a redirect loop', () => {
  const r = classifyChain([
    { url: 'https://example.com/a', status: 301 },
    { url: 'https://example.com/b', status: 301 },
    { url: 'https://example.com/a', status: 301 },
  ]);
  assert.equal(r.ok, false);
  const f = r.findings.find((x) => x.id === 'redirect-loop');
  assert.ok(f, 'expected a redirect-loop finding');
  assert.match(f.title, /loop/i);
});

test('loop check ignores a trailing fragment difference', () => {
  assert.equal(
    normalizeForLoopCheck('https://example.com/a#section'),
    normalizeForLoopCheck('https://example.com/a'),
  );
});

test('flags a chain longer than the recommended hop count', () => {
  const r = classifyChain([
    { url: 'https://example.com/1', status: 301 },
    { url: 'https://example.com/2', status: 301 },
    { url: 'https://example.com/3', status: 301 },
    { url: 'https://example.com/4', status: 200 },
  ]);
  const f = r.findings.find((x) => x.id === 'chain-too-long');
  assert.ok(f, 'expected a chain-too-long finding');
  assert.match(f.title, /3 hops/);
});

test('a two-hop chain does not trip chain-too-long when recommendedMaxHops is raised', () => {
  const r = classifyChain([
    { url: 'https://example.com/1', status: 301 },
    { url: 'https://example.com/2', status: 301 },
    { url: 'https://example.com/3', status: 200 },
  ], { recommendedMaxHops: 2 });
  assert.ok(!r.findings.some((x) => x.id === 'chain-too-long'));
});

test('flags an HTTPS-to-HTTP protocol downgrade', () => {
  const r = classifyChain([
    { url: 'https://example.com/a', status: 302 },
    { url: 'http://example.com/b', status: 200 },
  ]);
  const f = r.findings.find((x) => x.id === 'protocol-downgrade');
  assert.ok(f, 'expected a protocol-downgrade finding');
  assert.equal(f.severity, 'danger');
});

test('does not flag an HTTP-to-HTTPS upgrade as a downgrade', () => {
  const r = classifyChain([
    { url: 'http://example.com/a', status: 301 },
    { url: 'https://example.com/a', status: 200 },
  ]);
  assert.ok(!r.findings.some((x) => x.id === 'protocol-downgrade'));
});

test('flags a scheme-normalization redirect that uses a temporary status', () => {
  const r = classifyChain([
    { url: 'http://example.com/pricing', status: 302 },
    { url: 'https://example.com/pricing', status: 200 },
  ]);
  const f = r.findings.find((x) => x.id === 'temporary-redirect-for-permanent-move');
  assert.ok(f, 'expected a temporary-redirect-for-permanent-move finding');
  assert.equal(f.severity, 'notice');
});

test('does not flag the same normalization when it uses 301', () => {
  const r = classifyChain([
    { url: 'http://example.com/pricing', status: 301 },
    { url: 'https://example.com/pricing', status: 200 },
  ]);
  assert.ok(!r.findings.some((x) => x.id === 'temporary-redirect-for-permanent-move'));
});

test('flags a www-normalization redirect on a temporary status', () => {
  const r = classifyChain([
    { url: 'https://www.example.com/about', status: 302 },
    { url: 'https://example.com/about', status: 200 },
  ]);
  const f = r.findings.find((x) => x.id === 'temporary-redirect-for-permanent-move');
  assert.ok(f);
});

test('does not flag a redirect that also changes the path as a "move" pattern', () => {
  const r = classifyChain([
    { url: 'http://example.com/old-page', status: 302 },
    { url: 'https://example.com/brand-new-page', status: 200 },
  ]);
  assert.ok(!r.findings.some((x) => x.id === 'temporary-redirect-for-permanent-move'));
});

test('flags a chain ending in a 404', () => {
  const r = classifyChain([
    { url: 'https://example.com/a', status: 301 },
    { url: 'https://example.com/b', status: 404 },
  ]);
  const f = r.findings.find((x) => x.id === 'chain-ends-in-error');
  assert.ok(f);
  assert.equal(r.finalStatus, 404);
});

test('flags a chain ending in a 500', () => {
  const r = classifyChain([{ url: 'https://example.com/a', status: 500 }]);
  const f = r.findings.find((x) => x.id === 'chain-ends-in-error');
  assert.ok(f);
});

test('flags an incomplete chain (last hop is itself still a redirect)', () => {
  const r = classifyChain([
    { url: 'https://example.com/a', status: 301 },
    { url: 'https://example.com/b', status: 302 },
  ]);
  const f = r.findings.find((x) => x.id === 'chain-incomplete');
  assert.ok(f);
  assert.equal(r.ok, false);
});

test('flags a hop fetch error and marks the report incomplete', () => {
  const r = classifyChain([
    { url: 'https://example.com/a', status: 301 },
    { url: 'https://example.com/b', status: null, error: 'timed out' },
  ]);
  assert.equal(r.incomplete, true);
  assert.equal(r.ok, false);
  const f = r.findings.find((x) => x.id === 'hop-fetch-error');
  assert.ok(f);
  assert.match(f.detail, /timed out/);
});

test('does not run final-status checks past a fetch error', () => {
  const r = classifyChain([
    { url: 'https://example.com/a', status: null, error: 'DNS failure' },
  ]);
  assert.ok(!r.findings.some((x) => x.id === 'chain-ends-in-error'));
  assert.ok(!r.findings.some((x) => x.id === 'chain-incomplete'));
  assert.equal(r.finalStatus, null);
});

test('flags an invalid hop URL', () => {
  const r = classifyChain([{ url: 'not a url', status: 200 }]);
  const f = r.findings.find((x) => x.id === 'invalid-hop-url');
  assert.ok(f);
});

test('flags an unexpected non-redirect status followed by another hop', () => {
  const r = classifyChain([
    { url: 'https://example.com/a', status: 200 },
    { url: 'https://example.com/b', status: 200 },
  ]);
  const f = r.findings.find((x) => x.id === 'unexpected-non-redirect-mid-chain');
  assert.ok(f);
});

test('parseHopsText parses "<status> <url>" lines, ignoring blanks and comments', () => {
  const { hops, errors } = parseHopsText(`
    # a comment
    301 https://example.com/old

    200 https://example.com/new
  `);
  assert.equal(errors.length, 0);
  assert.deepEqual(hops, [
    { url: 'https://example.com/old', status: 301, error: null },
    { url: 'https://example.com/new', status: 200, error: null },
  ]);
});

test('parseHopsText reports a malformed line rather than silently dropping it', () => {
  const { hops, errors } = parseHopsText('301 https://example.com/old\nnot a valid line\n200 https://example.com/new');
  assert.equal(hops.length, 2);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Line 2/);
});

test('a real-shaped worked example: http -> www upgrade (temporary) -> loop', () => {
  const r = classifyChain([
    { url: 'http://example.com/', status: 302 },
    { url: 'https://www.example.com/', status: 301 },
    { url: 'https://example.com/', status: 301 },
    { url: 'http://example.com/', status: 301 },
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.id === 'redirect-loop'));
  assert.ok(r.findings.some((f) => f.id === 'protocol-downgrade'));
  assert.ok(r.findings.some((f) => f.id === 'chain-too-long'));
});
