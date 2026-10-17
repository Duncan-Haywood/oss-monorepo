// Unit tests for the no-warranty clause checker.
//
// The checker is what stops a venture from reaching main with a published page
// that carries no warranty disclaimer, so the thing worth testing is not that
// it passes today -- it does -- but that it still fails on the markup that has
// actually shipped, and that it does not quietly pass a page it should catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NO_SLA_PATTERN } from './build.mjs';
import {
  NO_WARRANTY,
  NOT_AFFILIATED,
  collectPages,
  missingClauses,
  unknownVenture,
} from './clauses.mjs';

// A footer with the hosting clause and no warranty paragraph: the inverse of
// the failure that kept recurring, and the one injection does not cover.
const SLA_ONLY = `<footer>
  <p><strong>Best-effort hosting, no SLA.</strong> These tools are free and
  experimental, and may be slow, broken, moved, or taken offline without
  notice.</p>
</footer>`;

const BOTH = `${SLA_ONLY}
  <p><strong>No warranty.</strong> This tool is provided free and as-is, without
  warranty of any kind, express or implied. It is not plumbing, construction,
  legal, tax, or financial advice.</p>`;

test('a page with only the hosting clause is reported missing the warranty half', () => {
  assert.deepEqual(missingClauses([['calc/index.html', SLA_ONLY]]), [
    { page: 'calc/index.html', clause: 'no-warranty' },
  ]);
});

test('a page carrying the warranty clause reports nothing', () => {
  assert.deepEqual(missingClauses([['calc/index.html', BOTH]]), []);
});

test('every offending page is reported, not only the first', () => {
  // Reporting one at a time is how the second venture in #1747 survived the
  // first fix pass.
  const missing = missingClauses([
    ['a/index.html', SLA_ONLY],
    ['b/index.html', BOTH],
    ['c/index.html', SLA_ONLY],
  ]);
  assert.deepEqual(missing.map((m) => m.page), ['a/index.html', 'c/index.html']);
});

test('the no-warranty pattern matches the wordings ventures actually use', () => {
  for (const wording of [
    '<strong>No warranty.</strong> This tool is provided free and as-is.',
    'NO WARRANTY OF ANY KIND',
    'provided with no warranty, express or implied',
  ]) {
    assert.ok(NO_WARRANTY.test(wording), `not matched: ${wording}`);
  }
});

test('the no-warranty pattern does not match a page that merely mentions warranties', () => {
  // A false positive here is worse than a miss: it marks an uncovered page
  // green and retires the check that catches the real one.
  for (const wording of [
    'The manufacturer warranty is 10 years.',
    'Include the labour warranty in your bid.',
    'Best-effort hosting, no SLA.',
  ]) {
    assert.ok(!NO_WARRANTY.test(wording), `wrongly matched: ${wording}`);
  }
});

test('the no-SLA clause is deliberately not this checker\'s job', () => {
  // build.mjs injects it into every published page, so a source page without
  // it is correct, not broken. If that injection is ever removed, this test
  // and the checker's scope both have to be revisited -- asserting the
  // pattern still exists is what makes that removal visible here.
  assert.ok(NO_SLA_PATTERN instanceof RegExp, 'build.mjs still owns the hosting clause');
  assert.deepEqual(missingClauses([['calc/index.html', BOTH.replace(SLA_ONLY, '')]]), []);
});

test('the real venture tree is walked and every page carries the clause', async () => {
  const { pages, surfaces } = await collectPages();

  // A silently-empty walk would make every assertion above free, which is the
  // failure mode that lets a broken checker sit green for weeks.
  assert.ok(surfaces.length > 40, `only ${surfaces.length} surface(s) discovered`);
  assert.ok(pages.length > 100, `only ${pages.length} page(s) collected`);
  assert.deepEqual(
    missingClauses(pages),
    [],
    'a published page is missing the no-warranty clause; run `node platform/pages/clauses.mjs`',
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
  // The fixture must be a real venture that ships no browser surface -- this
  // used to be asserted with a made-up slug, which is the conflation the
  // `known` flag below exists to undo.
  //
  // Twice now the fixture has been a venture that later grew one, and the test
  // failed on the day someone shipped product: `cra-evidence-desk` gained a
  // `site/` on 2026-09-03, and `vendor-change-watch` -- a CLI -- gained an
  // `index.html` on 2026-09-05. Both were picked because they had no page
  // *yet*, which is a fact about the day rather than about the venture.
  //
  // So the fixture is now `local-site-studio`, a Next.js app with no static
  // build target here. (It was `quick-pick-survey` until 2026-10-15 when that app got a static landing page, and before that `garmin-world-traveler-watchface`, a Connect IQ
  // watchface, until 2026-10-15 when that venture got a static landing page.) Keep that property when changing it -- a native-only
  // venture (a watchface, a Swift app) is stable here; a CLI is not, because a
  // CLI growing a browser page is a thing this portfolio actively does.
  const { pages, surfaces, known } = await collectPages({ slug: 'local-site-studio' });
  assert.deepEqual(surfaces, []);
  assert.deepEqual(pages, []);
  assert.equal(known, true);
});

test('a slug that names no venture is reported as unknown, not as empty', async () => {
  // The two cases produce identical pages/surfaces, so without `known` a
  // mistyped slug is indistinguishable from a CLI venture and every tool that
  // takes one reports "nothing to measure" and exits 0 for a typo.
  const { pages, surfaces, known } = await collectPages({ slug: 'amazon-fba-calculater' });
  assert.deepEqual(surfaces, []);
  assert.deepEqual(pages, []);
  assert.equal(known, false);
});

test('a real venture with a browser surface is known', async () => {
  const { known } = await collectPages({ slug: 'sewer-line-replace-bid-calculator' });
  assert.equal(known, true);
});

test('a whole-portfolio walk is never "unknown"', async () => {
  const { known } = await collectPages();
  assert.equal(known, true);
});

test('a slug that is a path cannot reach outside the ventures tree', async () => {
  // `known` stats `venturesDir/<slug>`, so a slug carrying separators would
  // otherwise probe an arbitrary directory and report it as a venture.
  for (const slug of ['../platform', 'foo/../../platform', '/etc']) {
    const { known } = await collectPages({ slug });
    assert.equal(known, false, slug);
  }
});

test('an unknown venture exits non-zero while saying nothing was measured', () => {
  const lines = [];
  const code = unknownVenture('amazon-fba-calculater', { log: (m) => lines.push(m) });
  assert.equal(code, 1);
  assert.match(lines.join('\n'), /no such venture/);
  assert.match(lines.join('\n'), /Nothing was measured/);
});

// PRODUCT_PLAYBOOK.md 5f: a vs-<competitor> page names a trademark, so it has
// to disclose it isn't that product's own page.

test('a vs- page with no disclaimer is reported missing not-affiliated', () => {
  assert.deepEqual(missingClauses([['calc/vs-jobber.html', BOTH]]), [
    { page: 'calc/vs-jobber.html', clause: 'not-affiliated' },
  ]);
});

test('a vs- page carrying the disclaimer reports nothing', () => {
  const withDisclaimer = `${BOTH}\n<p>Not affiliated with Jobber.</p>`;
  assert.deepEqual(missingClauses([['calc/vs-jobber.html', withDisclaimer]]), []);
});

test('an ordinary page with no vs- filename is never checked for the disclaimer', () => {
  // BOTH carries no disclaimer at all; only the no-warranty clause applies.
  assert.deepEqual(missingClauses([['calc/index.html', BOTH]]), []);
});

test('the exempt generic comparison page is not flagged even with no disclaimer', () => {
  assert.deepEqual(
    missingClauses([['seller-net-sheet/vs-title-company-net-sheet.html', BOTH]]),
    [],
  );
});

test('the not-affiliated pattern matches the wordings ventures actually use', () => {
  for (const wording of [
    'Not affiliated with ServiceMonster.',
    'not affiliated with, endorsed by, or sponsored by ServiceMonster',
    'This site is NOT AFFILIATED WITH Jobber in any way.',
  ]) {
    assert.ok(NOT_AFFILIATED.test(wording), `not matched: ${wording}`);
  }
});

test('the not-affiliated pattern does not match a page that never disclaims', () => {
  for (const wording of [
    'Compare against ServiceMonster and Jobber before you decide.',
    'Best-effort hosting, no SLA.',
  ]) {
    assert.ok(!NOT_AFFILIATED.test(wording), `wrongly matched: ${wording}`);
  }
});

test('every vs- page in the real venture tree carries the disclaimer or is exempt', async () => {
  const { pages } = await collectPages();
  const comparisonPages = pages.filter(([page]) => /(?:^|\/)vs-[^/]+\.html$/i.test(page));

  // A silently-empty filter would make the assertion below free.
  assert.ok(comparisonPages.length > 100, `only ${comparisonPages.length} comparison page(s) found`);
  assert.deepEqual(
    missingClauses(comparisonPages).filter((m) => m.clause === 'not-affiliated'),
    [],
    'a vs-<competitor> page is missing its trademark disclaimer; run `node platform/pages/clauses.mjs`',
  );
});
