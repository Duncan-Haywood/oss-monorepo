import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

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

test('index links one hop to the actions-minutes-estimator sibling', async () => {
  // The reciprocal half of a deliberate pair: this tool answers "is the red
  // check real, or did GitHub never assign a runner?", and the answer
  // "starved" leaves the reader needing the cost attribution that one does.
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/actions-minutes-estimator\/"/,
    'index must link ../actions-minutes-estimator/ so crawlers reach it in one hop',
  );
});

test('index links to the re-running-the-job comparison page, and it links back', async () => {
  const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /href="vs-rerunning-the-job\.html"/);
  const page = await readFile(new URL('./vs-rerunning-the-job.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
});

test('the comparison page carries valid FAQPage JSON-LD matching its visible text', async () => {
  const page = await readFile(new URL('./vs-rerunning-the-job.html', import.meta.url), 'utf8');
  const faq = jsonLdBlocks(page).map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(page.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(page.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page carries the no-warranty clause and the privacy line', async () => {
  const page = await readFile(new URL('./vs-rerunning-the-job.html', import.meta.url), 'utf8');
  assert.match(page, /No warranty/);
  assert.match(page, /provided free and as-is, without warranty/);
  assert.match(page, /nothing you paste is uploaded/i);
});

test('the comparison page is listed in the venture sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /vs-rerunning-the-job\.html/);
});
