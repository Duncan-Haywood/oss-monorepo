// The duplicate-FAQ guard, checked against the two shapes that actually
// reached a branch: the auto-resolved double section from two concurrent FAQ
// batches, and the drifted hand-maintained twin on `no-show-fee-calculator`.
//
// The last test is the portfolio sweep. It is the one that matters day to day:
// the defect it guards is created by a *merge*, not by anyone editing a page,
// so no per-venture test would ever be the one to run.
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

import { duplicates, normalize, sectionHeadings } from './faq-duplicate.mjs';
import { main } from './faq-duplicate.mjs';

/** The shape `git merge` produced on contractor-bid-readiness: two whole sections. */
const DOUBLED_SECTION = `<main>
  <section id="faq"><h2>Common questions</h2>
    <h3>Does this replace a lawyer?</h3><p>No.</p>
  </section>
  <section id="faq"><h2>Common questions</h2>
    <h3>Does this replace a lawyer?</h3><p>No.</p>
  </section>
</main>`;

/** The shape no-show-fee-calculator shipped: one section in `main`, a twin after it. */
const DRIFTED_TWIN = `<main>
  <section><h2>Common questions</h2>
    <h3>Is a cancellation fee legal?</h3><p>Generally, when disclosed in advance.</p>
  </section>
</main>
<h2>Common questions</h2>
<h3>Is a cancellation fee legal?</h3><p>Usually, if clients agree up front.</p>`;

const CLEAN = `<main>
  <section><h2>Common questions</h2>
    <h3>How much should I charge?</h3><p>It depends on your own costs.</p>
    <h3>Is my data uploaded anywhere?</h3><p>No.</p>
  </section>
</main>`;

test('normalize ignores case, punctuation and HTML entities', () => {
  assert.equal(normalize('Is a no&#45;show fee legal?'), 'is a no show fee legal');
  assert.equal(normalize('<em>Common</em> Questions'), 'common questions');
});

test('sectionHeadings finds FAQ labels and not questions', () => {
  assert.deepEqual(sectionHeadings(CLEAN), ['common questions']);
  assert.deepEqual(sectionHeadings('<h2>Frequently asked questions</h2>'), [
    'frequently asked questions',
  ]);
  assert.deepEqual(sectionHeadings('<h2>Your numbers</h2>'), []);
});

test('a clean page reports nothing', () => {
  assert.deepEqual(duplicates(CLEAN), []);
});

test('two merged FAQ sections are caught by both heading and question', () => {
  const found = duplicates(DOUBLED_SECTION);
  assert.ok(
    found.some((row) => row.kind === 'section' && row.detail === 'common questions'),
    'expected the repeated section heading',
  );
  assert.ok(
    found.some((row) => row.kind === 'question' && row.count === 2),
    'expected the repeated question',
  );
});

test('a drifted twin outside <main> is caught by its repeated section heading', () => {
  const found = duplicates(DRIFTED_TWIN);
  assert.deepEqual(
    found.filter((row) => row.kind === 'section'),
    [{ kind: 'section', detail: 'common questions', count: 2 }],
  );
});

// Two questions that share a stem are not duplicates. Several ventures pair a
// short in-page `<details>` question with a longer search-worded heading, and
// the landing pages ask a general question beside a narrower variant. Flagging
// those would make the gate noise, and a noisy gate gets removed.
test('a longer variant of the same stem is not a duplicate', () => {
  const variants = `<h3>How much to charge to replace a well pump?</h3><p>Depends.</p>
    <h3>How much to charge to replace a well pump and pressure tank?</h3><p>More.</p>`;
  assert.deepEqual(duplicates(variants), []);
});

test('every published page is free of duplicated FAQ sections and questions', async () => {
  assert.equal(await main([]), 0);
});

test('sectionHeadings reads an h1 label closed by its own tag', () => {
  assert.deepEqual(sectionHeadings('<h1>Common questions</h1><p>x</p>'), ['common questions']);
});

test('sectionHeadings does not close an h3 with an h4', () => {
  assert.deepEqual(sectionHeadings('<h3>Common questions</h4><p>x</p>'), []);
});

test('a two-letter repeated question is still a duplicate', () => {
  const twice = '<h3>Ok?</h3><p>a</p><h3>Ok?</h3><p>b</p>';
  assert.deepEqual(duplicates(twice), [{ kind: 'question', detail: 'ok', count: 2 }]);
});

test('a mistyped venture slug exits non-zero instead of reporting a clean sweep', async () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => lines.push(line);
  try {
    assert.equal(await main(['no-such-venture-xyz']), 1);
  } finally {
    console.error = original;
  }
  assert.match(lines.join('\n'), /no such venture/);
});

test('the command line passes its first argument as the slug', () => {
  const run = spawnSync(process.execPath, [new URL('./faq-duplicate.mjs', import.meta.url).pathname, 'no-such-venture-xyz']);
  assert.equal(run.status, 1);
});

test('normalize keeps every digit, so questions differing in a number stay distinct', () => {
  assert.equal(normalize('Is 25% or 9 enough?'), 'is 25 or 9 enough');
});

test('a one-character repeated question is ignored', () => {
  assert.deepEqual(duplicates('<h3>Q?</h3><p>a</p><h3>Q?</h3><p>b</p>'), []);
});
