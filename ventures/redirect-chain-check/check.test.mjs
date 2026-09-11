import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeWalk(hopsByUrl) {
  return async (target) => hopsByUrl(target);
}

test('runCheck reports ok for a clean chain', async () => {
  const walkChainFn = fakeWalk(() => ({
    hops: [
      { url: 'https://example.com/old', status: 301, error: null },
      { url: 'https://example.com/new', status: 200, error: null },
    ],
    truncated: false,
  }));
  const result = await runCheck('https://example.com/old', { walkChainFn });
  assert.equal(result.report.ok, true);
  assert.equal(result.target, 'https://example.com/old');
  assert.equal(result.hops.length, 2);
});

test('runCheck surfaces a truncated walk as an incomplete, non-ok report', async () => {
  const walkChainFn = fakeWalk(() => ({
    hops: [
      { url: 'https://example.com/a', status: 301, error: null },
      { url: 'https://example.com/b', status: 301, error: null },
    ],
    truncated: true,
  }));
  const result = await runCheck('https://example.com/a', { walkChainFn, maxHops: 2 });
  assert.equal(result.truncated, true);
  assert.equal(result.report.ok, false);
  assert.ok(result.report.findings.some((f) => f.id === 'chain-incomplete'));
});

test('runCheck passes recommendedMaxHops through to the classifier', async () => {
  const walkChainFn = fakeWalk(() => ({
    hops: [
      { url: 'https://example.com/1', status: 301, error: null },
      { url: 'https://example.com/2', status: 301, error: null },
      { url: 'https://example.com/3', status: 200, error: null },
    ],
    truncated: false,
  }));
  const strict = await runCheck('https://example.com/1', { walkChainFn, recommendedMaxHops: 1 });
  const lenient = await runCheck('https://example.com/1', { walkChainFn, recommendedMaxHops: 5 });
  assert.ok(strict.report.findings.some((f) => f.id === 'chain-too-long'));
  assert.ok(!lenient.report.findings.some((f) => f.id === 'chain-too-long'));
});

test('runCheck surfaces a hop fetch error as a failed report', async () => {
  const walkChainFn = fakeWalk(() => ({
    hops: [
      { url: 'https://example.com/a', status: 301, error: null },
      { url: 'https://example.com/b', status: null, error: 'timed out' },
    ],
    truncated: false,
  }));
  const result = await runCheck('https://example.com/a', { walkChainFn });
  assert.equal(result.report.ok, false);
  assert.equal(result.report.incomplete, true);
});
