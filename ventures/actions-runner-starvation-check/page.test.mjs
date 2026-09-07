import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The docs page answers the search phrase a starved-CI visitor actually types.
// It already linked back to the tool; the index shipped without a crawlable
// link the other way, so a visitor (or crawler) on the tool never reached it.
test('index links to the why-is-my-check-red docs page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="why-is-my-github-actions-check-red-in-seconds\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', async () => {
  const page = await readFile(
    new URL('./why-is-my-github-actions-check-red-in-seconds.html', import.meta.url),
    'utf8',
  );
  assert.match(page, /href="\.\/"/);
});

// flaky-test-finder covers the next question after "did a runner run?": which
// tests actually flipped. Without a crawlable link on this hub, a crawler
// entering on starvation-check never reaches that sibling in one hop — same
// one-way orphan class as #3639 / #3667.
test('index links to the related flaky-test-finder', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/flaky-test-finder\/"/,
    'index must link ../flaky-test-finder/ so crawlers can reach the JUnit flaky classifier',
  );
});

// coverage-drop-check covers the other next question after "did a runner
// run?": did line coverage fall on this PR. The flaky edge of this triangle
// already has reciprocal hub links; without this one, a crawler entering on
// starvation-check still needs two hops to reach the coverage tool — same
// one-hop orphan class as #3677 / #3685.
test('index links to the related coverage-drop-check', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/coverage-drop-check\/"/,
    'index must link ../coverage-drop-check/ so crawlers can reach the coverage-delta checker',
  );
});
