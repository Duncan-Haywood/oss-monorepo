// Unit tests for the liability-clause checker.
//
// The checker is what stops a venture from reaching main with a hosted page
// that carries no availability statement, so the thing worth testing is not
// that it passes today -- it does -- but that it still fails on the exact
// markup that got through twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NO_SLA, NO_WARRANTY, collectPages, missingClauses } from './clauses.mjs';

// The footer artificial-turf and asphalt-driveway-pave (#1747) and then
// sewer-line-replace shipped with: the warranty half, and nothing about
// hosting.
const WARRANTY_ONLY = `<footer>
  <p><strong>No warranty.</strong> This tool is provided free and as-is, without
  warranty of any kind, express or implied. To the maximum extent permitted by
  law, the authors accept no liability for any loss or damage arising from its
  use.</p>
  <p><strong>Nothing leaves your browser.</strong> Every number stays here.</p>
</footer>`;

const BOTH = `${WARRANTY_ONLY}
  <p><strong>Best-effort hosting, no SLA.</strong> This tool is free and
  experimental, and may be slow, broken, moved, or taken offline without
  notice.</p>`;

test('a page with only the warranty clause is reported missing the no-SLA half', () => {
  assert.deepEqual(missingClauses([['calc/index.html', WARRANTY_ONLY]]), [
    { page: 'calc/index.html', clause: 'no-SLA' },
  ]);
});

test('a page carrying both clauses reports nothing', () => {
  assert.deepEqual(missingClauses([['calc/index.html', BOTH]]), []);
});

test('a page missing both clauses reports both, not just the first', () => {
  // Reporting one at a time is how the second venture in #1747 survived the
  // first fix pass.
  assert.deepEqual(missingClauses([['calc/index.html', '<p>Hello.</p>']]), [
    { page: 'calc/index.html', clause: 'no-warranty' },
    { page: 'calc/index.html', clause: 'no-SLA' },
  ]);
});

test('every offending page is reported, not only the first', () => {
  const missing = missingClauses([
    ['a/index.html', WARRANTY_ONLY],
    ['b/index.html', BOTH],
    ['c/index.html', WARRANTY_ONLY],
  ]);
  assert.deepEqual(missing.map((m) => m.page), ['a/index.html', 'c/index.html']);
});

test('the no-SLA clause is matched in the wordings ventures actually use', () => {
  // Several ventures word it in their own voice. Demanding the playbook's
  // exact prose would fail correct pages instead of catching missing ones.
  for (const wording of [
    'Best-effort hosting, no SLA.',
    'It is hosted best-effort with no SLA: it may be slow.',
    'Hosted URLs, when they exist, carry no availability SLA.',
    'may be moved or taken offline without notice',
    'There is no availability SLA.',
  ]) {
    assert.ok(NO_SLA.test(wording), `not matched: ${wording}`);
  }
});

test('the no-SLA pattern does not match a page that merely mentions hosting', () => {
  // A false positive here is worse than a miss: it would mark an
  // uncovered page green and retire the check that catches the real one.
  for (const wording of [
    'This tool is hosted on GitHub Pages.',
    'Self-hosting instructions are in the README.',
    'No warranty of any kind.',
  ]) {
    assert.ok(!NO_SLA.test(wording), `wrongly matched: ${wording}`);
  }
});

test('the no-warranty pattern is case-insensitive', () => {
  assert.ok(NO_WARRANTY.test('NO WARRANTY'));
  assert.ok(NO_WARRANTY.test('provided with no warranty'));
  assert.ok(!NO_WARRANTY.test('This carries a warranty.'));
});

test('the real venture tree is walked and every page passes', async () => {
  const { pages, surfaces } = await collectPages();

  // A silently-empty walk would make every assertion above free, which is the
  // failure mode that lets a broken checker sit green for weeks.
  assert.ok(surfaces.length > 40, `only ${surfaces.length} surface(s) discovered`);
  assert.ok(pages.length > 100, `only ${pages.length} page(s) collected`);
  assert.deepEqual(
    missingClauses(pages),
    [],
    'a published page is missing a liability clause; run `node platform/pages/clauses.mjs`',
  );
});

test('a slug narrows the walk to one venture', async () => {
  const { pages, surfaces } = await collectPages({ slug: 'sewer-line-replace-bid-calculator' });
  assert.equal(surfaces.length, 1);
  assert.ok(pages.length >= 2, `only ${pages.length} page(s)`);
  assert.ok(pages.every(([page]) => page.startsWith('sewer-line-replace-bid-calculator/')));
});

test('a venture with no browser surface yields no pages rather than throwing', async () => {
  // Venture CI passes its slug unconditionally, including for CLIs and
  // libraries. Throwing there would turn those workflows red for no defect.
  const { pages, surfaces } = await collectPages({ slug: 'not-a-real-venture-slug' });
  assert.deepEqual(surfaces, []);
  assert.deepEqual(pages, []);
});
