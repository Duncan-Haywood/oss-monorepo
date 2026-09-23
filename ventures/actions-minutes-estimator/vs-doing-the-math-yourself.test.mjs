import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-doing-the-math-yourself.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, accounting, or tax advice/);
});

test('names no runner-hosting vendor other than GitHub itself', () => {
  // This page compares against a generic habit (doing the math by hand),
  // not a named competing product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no competing company to
  // disclaim a relationship with. "GitHub" appears only descriptively, the
  // same way vs-manually-checking-settings.html names GitHub's own Settings
  // page without a disclaimer, because it is the platform being measured,
  // not a compared product.
  assert.doesNotMatch(html, /CircleCI|Buildkite|Travis|GitLab CI|Jenkins/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-doing-the-math-yourself\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const acceptedAnswer = question.acceptedAnswer;
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the macOS multiplier worked example matches estimate() on the shipped numbers', async () => {
  const { readWorkflow, estimate, RUNNER_CLASSES } = await import('./estimate.mjs');

  assert.equal(RUNNER_CLASSES.macos.multiplier, 10);

  const workflow = readWorkflow(
    { on: { workflow_dispatch: null }, jobs: { build: { 'runs-on': 'macos-latest', steps: [] } } },
    'build-mac.yml',
  );
  const result = estimate([workflow], {
    minutesPerJob: 15,
    manualRunsPerMonth: 1,
    pushRunsPerMonth: 0,
    pullRequestRunsPerMonth: 0,
    otherEventRunsPerMonth: 0,
  });
  const row = result.rows[0];
  assert.equal(row.wallMinutes, 15);
  assert.equal(row.includedMinutes, 150);

  assert.match(html, /15 wall-clock minutes a month/);
  assert.match(html, /Wall-clock minutes: <strong>15<\/strong>/);
  assert.match(html, /<strong>150<\/strong> -- ten times the naive figure/);
});

test('the matrix rounding worked example matches estimate() on the shipped numbers', async () => {
  const { readWorkflow, estimate } = await import('./estimate.mjs');

  const shards = Array.from({ length: 12 }, (_, i) => i + 1);
  const workflow = readWorkflow(
    {
      on: { workflow_dispatch: null },
      jobs: { test: { 'runs-on': 'ubuntu-latest', strategy: { matrix: { shard: shards } }, steps: [] } },
    },
    'shard-tests.yml',
  );
  const result = estimate([workflow], {
    minutesPerJob: 0.5,
    manualRunsPerMonth: 1,
    pushRunsPerMonth: 0,
    pullRequestRunsPerMonth: 0,
    otherEventRunsPerMonth: 0,
  });
  const row = result.rows[0];
  assert.equal(row.matrixJobs, 12);
  assert.equal(row.wallMinutes, 6);
  assert.equal(row.billedMinutes, 12);

  assert.match(html, /12-shard test matrix, each shard finishing in 30 seconds/);
  assert.match(html, /Wall-clock minutes: <strong>6<\/strong>/);
  assert.match(html, /Billed minutes: <strong>12<\/strong> -- exactly double/);
});

test('the larger-runner worked example matches estimate() on the shipped numbers', async () => {
  const { readWorkflow, estimate, classifyRunner, RUNNER_CLASSES } = await import('./estimate.mjs');

  const runner = classifyRunner('ubuntu-latest-8-cores');
  assert.equal(runner.kind, 'larger');
  assert.equal(runner.cores, 8);
  assert.equal(RUNNER_CLASSES.linux.perCoreMinuteUsd, 0.004);

  const workflow = readWorkflow(
    { on: { push: null }, jobs: { test: { 'runs-on': 'ubuntu-latest-8-cores', steps: [] } } },
    'big-runner.yml',
  );
  const result = estimate([workflow], {
    minutesPerJob: 6,
    pushRunsPerMonth: 120,
    pullRequestRunsPerMonth: 0,
    manualRunsPerMonth: 0,
    otherEventRunsPerMonth: 0,
  });
  const row = result.rows[0];
  assert.equal(row.wallMinutes, 720);
  assert.equal(row.includedMinutes, 0);
  assert.equal(row.costUsd, 23.04);
  assert.equal(result.totals.includedMinutes, 0);

  assert.match(html, /Total wall-clock minutes: <strong>720<\/strong>/);
  assert.match(html, /Included-allowance minutes drawn: <strong>0<\/strong>/);
  assert.match(html, /Direct cost: <strong>\$23\.04<\/strong> a month/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-doing-the-math-yourself\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-doing-the-math-yourself\.html/);
});

test('the comparison page links back to the estimator and to the billing-page comparison', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="vs-billing-page\.html"/);
});
