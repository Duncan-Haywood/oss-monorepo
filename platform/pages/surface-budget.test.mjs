import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  GENERIC_BUDGET_OVERRIDES,
  GENERIC_COMPARISON_BUDGET,
  angleOf,
  budgetFor,
  isGenericComparison,
  overBudget,
  surfacesByVenture,
} from './surface-budget.mjs';

const page = (h1, title = 'Some Title') =>
  `<!doctype html><html><head><title>${title}</title></head><body><h1>${h1}</h1></body></html>`;

/** A throwaway ventures/ tree, so the unit tests do not depend on the catalogue. */
async function fixture(spec) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'surface-budget-'));
  for (const [slug, files] of Object.entries(spec)) {
    await fs.mkdir(path.join(dir, slug), { recursive: true });
    for (const [name, html] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, slug, name), html);
    }
  }
  return dir;
}

test('the angle comes from the h1, falling back to the title and then the filename', () => {
  assert.equal(angleOf(page('This calculator vs. a spreadsheet'), 'vs-x.html'), 'This calculator vs. a spreadsheet');
  assert.equal(
    angleOf('<html><head><title>Only a title — Some Tool</title></head><body></body></html>', 'vs-x.html'),
    'Only a title',
  );
  assert.equal(angleOf('<html><body>nothing</body></html>', 'vs-x.html'), 'vs-x.html');
});

test('the angle decodes entities the same way the comparison index does', () => {
  // Not a cosmetic detail: `comparisonText` exists because an h1 spelling an
  // apostrophe as `&rsquo;` and a check comparing it against a straight quote
  // silently disagreed once already (see build.mjs's note on it).
  assert.equal(angleOf(page('Your title company&rsquo;s net sheet'), 'vs-x.html'), "Your title company's net sheet");
});

test('a generic-method page is one clauses.mjs exempts, not one guessed from its filename', () => {
  // The exemption set is keyed slug/relative. A page not in it is a
  // named-product comparison however generic its filename reads.
  assert.ok(isGenericComparison('overtime-pay-calculator', 'vs-spreadsheet.html'));
  assert.ok(!isGenericComparison('locksmith-bid-calculator', 'vs-jobber.html'));
  assert.ok(!isGenericComparison('made-up-venture', 'vs-spreadsheet.html'));
});

test('the default budget applies to a venture with no override', () => {
  assert.equal(budgetFor('locksmith-bid-calculator'), GENERIC_COMPARISON_BUDGET);
  assert.equal(budgetFor('a-venture-that-does-not-exist'), GENERIC_COMPARISON_BUDGET);
});

test('every override records a reason and a date, not just a number', () => {
  for (const [slug, row] of Object.entries(GENERIC_BUDGET_OVERRIDES)) {
    assert.ok(Number.isInteger(row.allowed) && row.allowed > GENERIC_COMPARISON_BUDGET, `${slug}: pointless override`);
    assert.ok(typeof row.why === 'string' && row.why.length > 80, `${slug}: override needs a real reason`);
    assert.match(row.why, /\b20\d\d-\d\d-\d\d\b/, `${slug}: override reason must carry the date it was recorded`);
  }
});

test('named-product comparisons are never budgeted, however many there are', async () => {
  // The case a naive per-venture count gets wrong: three pages against three
  // real competitors serve three different readers.
  const dir = await fixture({
    'locksmith-bid-calculator': {
      'index.html': page('Locksmith bid calculator'),
      'vs-jobber.html': page('This calculator vs. Jobber'),
      'vs-workiz.html': page('This calculator vs. Workiz'),
      'vs-housecall-pro.html': page('This calculator vs. Housecall Pro'),
    },
  });
  const bySlug = await surfacesByVenture(dir);
  assert.deepEqual(overBudget(bySlug), []);
  assert.equal(bySlug.get('locksmith-bid-calculator').filter((p) => p.generic).length, 0);
});

test('a second generic-method page on one venture goes over budget', () => {
  // Built directly rather than through the fixture, so this exercises the
  // budget arithmetic on a slug with no override -- the state every venture
  // except the recorded one is in. This is the exact shape #4768 and #4771
  // produced.
  const generic = (angle, file) => ({ file, comparison: true, generic: true, angle });
  const over = overBudget(
    new Map([
      [
        'some-calculator',
        [
          generic('This calculator vs. a spreadsheet', 'vs-spreadsheet.html'),
          generic('This calculator vs. doing it by hand', 'vs-doing-it-by-hand.html'),
        ],
      ],
    ]),
  );
  assert.equal(over.length, 1);
  assert.equal(over[0].slug, 'some-calculator');
  assert.equal(over[0].generic.length, 2);
  assert.equal(over[0].allowed, GENERIC_COMPARISON_BUDGET);
  // And it reports the angles, because "you are over budget" without them
  // does not help the reader decide which page to fold into which.
  assert.deepEqual(
    over[0].generic.map((g) => g.angle).sort(),
    ['This calculator vs. a spreadsheet', 'This calculator vs. doing it by hand'],
  );
});

test('the recorded override is what keeps the live collision out of the red', async () => {
  // The honest version of the test above against the real tree: this venture
  // does carry two generic-method pages, and only its override row makes the
  // check exit 0. Fails if either the pages or the row quietly change.
  const pages = (await surfacesByVenture()).get('overtime-pay-calculator');
  assert.ok(pages, 'overtime-pay-calculator should still be a published venture');
  assert.equal(pages.filter((p) => p.generic).length, 2);
  assert.equal(budgetFor('overtime-pay-calculator'), 2);
  assert.ok(GENERIC_BUDGET_OVERRIDES['overtime-pay-calculator']);
});

test('guide pages are counted and printed but never budgeted', async () => {
  const dir = await fixture({
    'cron-dst-drift-check': {
      'index.html': page('Cron DST drift check'),
      'why-cron-jobs-break-across-dst.html': page('Why cron jobs break across daylight saving'),
    },
  });
  const pages = (await surfacesByVenture(dir)).get('cron-dst-drift-check');
  assert.equal(pages.length, 1, 'index.html is the tool, not a marketing surface');
  assert.equal(pages[0].comparison, false);
  assert.equal(pages[0].generic, false);
  assert.deepEqual(overBudget(await surfacesByVenture(dir)), []);
});

test('the live catalogue is within budget', async () => {
  // The check this file guards has to pass on `main`, or it is a red nobody
  // can act on. If this fails, either a new generic-method page needs folding
  // into its sibling or its override row is missing.
  const over = overBudget(await surfacesByVenture());
  assert.deepEqual(
    over.map((o) => `${o.slug} (${o.generic.length} > ${o.allowed})`),
    [],
  );
});

test('every override is still needed, so a stale one cannot sit here forever', async () => {
  // An override that no longer describes the tree is a licence nobody is
  // using, and the next session reads it as precedent. Fails if a venture was
  // consolidated but its row was left behind.
  const bySlug = await surfacesByVenture();
  for (const slug of Object.keys(GENERIC_BUDGET_OVERRIDES)) {
    const pages = bySlug.get(slug);
    assert.ok(pages, `override for ${slug}, which is not a venture with a published entry point`);
    assert.ok(
      pages.filter((p) => p.generic).length > GENERIC_COMPARISON_BUDGET,
      `${slug} is back within the default budget -- remove its GENERIC_BUDGET_OVERRIDES row`,
    );
  }
});

const SCRIPT = fileURLToPath(new URL('./surface-budget.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('an override is tight: it allows exactly what the live tree has, not one more', async () => {
  // A row allowing one page too many lets the next duplicate through silently.
  const bySlug = await surfacesByVenture();
  for (const [slug, row] of Object.entries(GENERIC_BUDGET_OVERRIDES)) {
    assert.equal(bySlug.get(slug).filter((p) => p.generic).length, row.allowed, `${slug} override is looser than the tree`);
  }
});

test('--check exits 0 on the live tree and its per-venture totals match the tree', async () => {
  const r = cli('--check');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no venture is over/);
  const expected = new Map();
  for (const pages of (await surfacesByVenture()).values()) {
    const n = pages.filter((p) => p.generic).length;
    expected.set(n, (expected.get(n) ?? 0) + 1);
  }
  const shape = [...expected].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${c} with ${n}`).join(', ');
  assert.ok(r.stdout.includes(`generic-method pages per venture: ${shape}`), r.stdout);
});

test('--for reports the budget state for a venture at its limit and exits 0', () => {
  const slug = Object.keys(GENERIC_BUDGET_OVERRIDES)[0];
  const r = cli('--for', slug);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /At or over the generic-method budget/);
});

test('--for takes the slug that follows it, and rejects a missing or unknown one with exit 2', () => {
  const missing = cli('--for');
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /needs a venture slug/);
  const unknown = cli('--for', 'no-such-venture-xyz');
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /no venture with a published entry point: no-such-venture-xyz/);
});

test('running the script directly prints the per-venture listing', () => {
  const r = cli();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /budget: \d+ generic-method page/);
});
