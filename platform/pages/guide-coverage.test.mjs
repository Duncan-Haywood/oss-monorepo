// The reporter's contract: a surface is covered when it ships any published
// page beside its own index, and the row survives even when nothing does.
//
// The cases below are the ones that decided the shape of `coverage()`. Each
// is a reading someone could reasonably have implemented instead, and each
// would report a different backlog.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coverage } from './guide-coverage.mjs';

/** collectPages' shape: [`slug/relative/path.html`, html]. */
const pages = (...paths) => paths.map((p) => [p, '<!doctype html><html></html>']);

test('a surface with only an entry page is reported as missing', () => {
  const rows = coverage(pages('tender-radar/index.html'));
  assert.deepEqual(rows, [{ slug: 'tender-radar', entry: true, guides: [] }]);
});

test('a surface with a guide page beside its entry page is covered', () => {
  const rows = coverage(
    pages('tender-radar/index.html', 'tender-radar/which-tenders-are-worth-bidding-on.html'),
  );
  assert.deepEqual(rows, [
    {
      slug: 'tender-radar',
      entry: true,
      guides: ['which-tenders-are-worth-bidding-on.html'],
    },
  ]);
});

test('a nested second entry point counts as a guide page', () => {
  // `consent-change-record/tool/index.html` is a second page a visitor can
  // land on and link from, which is the property being measured. Treating a
  // nested index as "not a guide" would report that surface as bare when it
  // is not.
  const rows = coverage(pages('consent-change-record/index.html', 'consent-change-record/tool/index.html'));
  assert.deepEqual(rows[0].guides, ['tool/index.html']);
});

test('a filename that is not question-shaped still counts', () => {
  // The convention is question-shaped filenames, but the thing being measured
  // is whether the surface has depth at all. Pinning the convention here would
  // report `backup-verification-evidence/shrinking.html` as missing.
  const rows = coverage(pages('backup-verification-evidence/index.html', 'backup-verification-evidence/shrinking.html'));
  assert.deepEqual(rows[0].guides, ['shrinking.html']);
});

test('non-HTML assets beside a page are not counted as guides', () => {
  const rows = coverage(
    pages(
      'fifo-pick-evidence/index.html',
      'fifo-pick-evidence/app.js',
      'fifo-pick-evidence/style.css',
      'fifo-pick-evidence/examples/picks.csv',
    ),
  );
  assert.deepEqual(rows[0], { slug: 'fifo-pick-evidence', entry: true, guides: [] });
});

test('rows and their guides are sorted, so the output is stable across runs', () => {
  const rows = coverage(
    pages(
      'zebra/index.html',
      'zebra/second.html',
      'zebra/first.html',
      'alpha/index.html',
    ),
  );
  assert.deepEqual(rows.map((r) => r.slug), ['alpha', 'zebra']);
  assert.deepEqual(rows[1].guides, ['first.html', 'second.html']);
});

test('a surface reached only through a nested page still gets a row', () => {
  // Defensive: `entry` is recorded rather than assumed, so a surface whose
  // index is absent from the page list is reported instead of vanishing from
  // the denominator and silently improving the coverage number.
  const rows = coverage(pages('odd-one/deep/page.html'));
  assert.deepEqual(rows, [{ slug: 'odd-one', entry: false, guides: ['deep/page.html'] }]);
});
