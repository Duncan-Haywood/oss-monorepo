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
