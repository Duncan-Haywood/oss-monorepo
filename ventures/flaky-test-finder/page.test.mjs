import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index links to the why-are-my-tests-flaky docs page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="why-are-my-tests-flaky-in-ci\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', async () => {
  const page = await readFile(
    new URL('./why-are-my-tests-flaky-in-ci.html', import.meta.url),
    'utf8',
  );
  assert.match(page, /href="index\.html"/);
});

// actions-runner-starvation-check answers whether a red check ever got a
// runner. Without a crawlable link on this hub, a crawler entering on the
// flaky finder never reaches that sibling in one hop — same one-way orphan
// class as #3639 / #3667.
test('index links to the related actions-runner-starvation-check', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/actions-runner-starvation-check\/"/,
    'index must link ../actions-runner-starvation-check/ so crawlers can reach the runner_id check',
  );
});

// coverage-drop-check covers the coverage-delta question after "are the tests
// stable?". Without a crawlable link on this hub, a crawler entering on the
// flaky finder never reaches that sibling in one hop — same one-way orphan
// class as #3639 / #3667 / #3677.
test('index links to the related coverage-drop-check', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/coverage-drop-check\/"/,
    'index must link ../coverage-drop-check/ so crawlers can reach the coverage-delta check',
  );
});
