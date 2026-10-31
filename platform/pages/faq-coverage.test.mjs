// The reporter's contract: it counts what the *builder* derives, not what a
// page happens to be wrapped in. The wrapper-counting mistake it exists to
// prevent is the first case below — a page with no `id="faq"` anywhere that
// nonetheless ships full schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coverage } from './faq-coverage.mjs';

const page = (body) => `<!doctype html><html><body><main>${body}</main></body></html>`;

// Deliberately free of camelCase identifiers: the builder rejects an answer
// containing one as a maintainer note rather than an answer, and a fixture
// that trips that rule would fail for a reason unrelated to what is under test.
const ANSWER =
  '<p>A real answer with enough prose in it that the builder treats it as an ' +
  'answer to the question above rather than a caption under a number.</p>';

test('counts a page with no id="faq" wrapper as covered', () => {
  const html = page(`<h2>Common questions</h2><h3>Does this count?</h3>${ANSWER}`);
  assert.deepEqual(coverage([['x/index.html', html]]), [{ slug: 'x', entries: 1 }]);
});

test('counts a page whose questions sit inside a wrapper the same way', () => {
  const html = page(`<section id="faq"><h3>Does this count?</h3>${ANSWER}</section>`);
  assert.deepEqual(coverage([['x/index.html', html]]), [{ slug: 'x', entries: 1 }]);
});

test('an empty id="faq" wrapper is not coverage', () => {
  // The inverse of the mistake: present wrapper, nothing derivable from it.
  const html = page('<section id="faq"><h2>Common questions</h2></section>');
  assert.deepEqual(coverage([['x/index.html', html]]), [{ slug: 'x', entries: 0 }]);
});

test('a heading that is not a question does not count', () => {
  const html = page(`<h3>What this checks</h3>${ANSWER}`);
  assert.deepEqual(coverage([['x/index.html', html]]), [{ slug: 'x', entries: 0 }]);
});

test('ignores secondary landing pages, which author their own schema', () => {
  const html = page(`<h3>Does this count?</h3>${ANSWER}`);
  assert.deepEqual(
    coverage([
      ['x/index.html', html],
      ['x/should-i-do-the-thing.html', html],
    ]),
    [{ slug: 'x', entries: 1 }],
  );
});

test('reports every entry page, sorted, so two runs are comparable', () => {
  const withFaq = page(`<h3>Does this count?</h3>${ANSWER}`);
  const without = page('<h2>Result</h2><p>No questions here.</p>');
  assert.deepEqual(
    coverage([
      ['zebra/index.html', without],
      ['alpha/index.html', withFaq],
    ]),
    [
      { slug: 'alpha', entries: 1 },
      { slug: 'zebra', entries: 0 },
    ],
  );
});

// --- CLI contract (added by the 2026-10-31 red-team run) --------------------
// main() was unguarded: seeded mutants flipping argv slicing, the missing
// filter, the JSON indent, the exit code and the --quiet gate all survived.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectPages } from './clauses.mjs';

const CLI = fileURLToPath(new URL('./faq-coverage.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('CLI --json reports exactly the pages coverage() finds empty, indented 2, exit 0', async () => {
  const r = run('--json');
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  const { pages } = await collectPages({});
  const rows = coverage(pages);
  const missing = rows.filter((row) => row.entries === 0).map((row) => row.slug);
  assert.deepEqual(out, { total: rows.length, covered: rows.length - missing.length, missing });
  assert.ok(r.stdout.startsWith('{\n  "total"'), 'two-space indent');
});

test('CLI summary line matches the JSON, exits 0 even with a backlog', () => {
  const json = JSON.parse(run('--json').stdout);
  const r = run();
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes(`FAQPage coverage: ${json.covered} of ${json.total} entry page(s)`));
  if (json.missing.length > 0) {
    assert.ok(r.stdout.includes(`${json.missing.length} entry page(s) with no question-shaped heading:`));
    assert.ok(r.stdout.includes(`  ${json.missing[0]}\n`));
  }
});

test('CLI --quiet prints the summary without the missing list', () => {
  const r = run('--quiet');
  assert.equal(r.status, 0);
  assert.ok(r.stdout.startsWith('FAQPage coverage:'));
  assert.ok(!r.stdout.includes('no question-shaped heading'));
});

test('CLI exits 1 for an unknown venture', () => {
  assert.equal(run('no-such-venture-xyz').status, 1);
});

