/**
 * The apex tool mirror is committed, so a venture edit that does not
 * regenerate it leaves the apex serving the previous bytes. The guard against
 * that is the "Check the apex tool mirror is not stale" step in
 * `portfolio-validate.yml` — but a workflow only runs when one of its `paths:`
 * filters matches, so the guard is only as wide as that list.
 *
 * That list restates `SERVABLE_EXTENSIONS` and `SERVABLE_NAMES` in a second
 * place, in a second language, and nothing checked the two agreed. Adding a
 * servable extension without adding its filter does not fail anything: it
 * silently removes CI's ability to notice a whole file type going stale.
 *
 * This has already happened twice on the same shape of bug:
 *
 * - `.css`/`.js` were mirrored from the day the mirror shipped but had no path
 *   filter in either workflow, so editing a venture's stylesheet or script
 *   triggered no run of the staleness check at all (fixed 2026-09-02).
 * - `venturePageRoot` copied `build.mjs`'s entry-point candidates instead of
 *   importing them, froze while `build.mjs` grew `ENTRY_OVERRIDES`, and left
 *   seven finished pages public nowhere. CLAUDE.md records that as the second
 *   time a restated constant cost live product.
 *
 * On 2026-09-04 the cost was paid a third time from the other direction: #3105
 * edited a mirrored venture page and dropped the regeneration, concluding the
 * venture was not mirrored because it is absent from `STARTER_SET`.
 * `STARTER_SET` is only the mirror's *ordering* — `mirrorSlugs()` is
 * `STARTER_SET` plus every other eligible venture — so the page was mirrored,
 * `main` went red, and the apex served the stale copy until it was noticed.
 * The path filters happened to be correct that day. Nothing was checking.
 *
 * So this file imports both sets and asserts CI actually watches every file
 * the mirror can serve. It fails at the moment the constant changes, which is
 * the only moment anyone is in a position to fix it cheaply.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { SERVABLE_EXTENSIONS, SERVABLE_NAMES } from './front-door-tools.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The workflow carrying the staleness step for *venture* edits.
 *
 * `hetzner-gitops-ci.yml` runs the same suite but triggers on `gitops/**` and
 * `platform/marketing/**`, neither of which a venture edit touches — so it is
 * deliberately not a second line of defence here, and asserting against it
 * would only encode a coincidence.
 */
const WORKFLOW = '.github/workflows/portfolio-validate.yml';

/** The step whose absence from a run is the failure this file guards. */
const STALENESS_STEP = 'platform/marketing/*.test.mjs';

/**
 * The `paths:` list under each event in a workflow's `on:` block.
 *
 * Hand-rolled rather than pulled from a YAML parser because this repo's CI
 * installs no YAML dependency for Node, and the shape being read is narrow and
 * fixed: two-space-indented event keys, a `paths:` sequence of quoted scalars.
 * It returns a map so a missing event is a visible absence rather than an
 * empty list that silently passes every assertion below.
 */
function pathFiltersByEvent(source) {
  const lines = source.split('\n');
  const events = new Map();

  let event = null;
  let inPaths = false;

  for (const line of lines) {
    if (/^on:/.test(line)) {
      event = null;
      inPaths = false;
      continue;
    }
    // A top-level key ends the `on:` block entirely.
    if (/^\S/.test(line) && !/^on:/.test(line)) {
      if (events.size > 0) break;
      continue;
    }

    const eventMatch = /^ {2}(\w+):/.exec(line);
    if (eventMatch) {
      event = eventMatch[1];
      inPaths = false;
      if (!events.has(event)) events.set(event, []);
      continue;
    }

    if (/^ {4}paths:/.test(line)) {
      inPaths = true;
      continue;
    }
    // Any other four-space key (`branches:`, say) closes the paths sequence.
    if (/^ {4}\w[\w-]*:/.test(line)) {
      inPaths = false;
      continue;
    }

    if (inPaths && event) {
      const entry = /^ {6}- ["']?(.+?)["']?\s*$/.exec(line);
      if (entry) events.get(event).push(entry[1]);
    }
  }

  return events;
}

const source = fs.readFileSync(path.join(REPO_ROOT, WORKFLOW), 'utf8');
const filtersByEvent = pathFiltersByEvent(source);

test('the workflow parsed here really does run the staleness check', () => {
  // Without this, every assertion below could pass against a workflow that had
  // quietly stopped running the step they exist to protect.
  assert.ok(
    source.includes(STALENESS_STEP),
    `${WORKFLOW} no longer runs ${STALENESS_STEP}; this file is guarding the wrong workflow`,
  );
});

test('the parser found both events, with non-empty path filters', () => {
  // A parser that silently returned nothing would make the coverage assertions
  // below vacuous, which is the failure mode this whole file exists to avoid.
  for (const event of ['push', 'pull_request']) {
    const filters = filtersByEvent.get(event);
    assert.ok(filters, `no ${event}: event parsed out of ${WORKFLOW}`);
    assert.ok(filters.length > 0, `${event}: parsed with an empty paths list`);
  }
});

test('every extension the mirror serves is watched on both events', () => {
  // The mirror is regenerated from whole venture directories, so a file type
  // it serves but CI does not watch goes stale with nothing failing.
  for (const [event, filters] of filtersByEvent) {
    if (!['push', 'pull_request'].includes(event)) continue;
    for (const ext of SERVABLE_EXTENSIONS) {
      assert.ok(
        filters.includes(`ventures/**/*${ext}`),
        `${WORKFLOW} ${event}: no path filter for ${ext}, which the mirror serves — ` +
          `add "ventures/**/*${ext}" or the staleness check cannot fire on it`,
      );
    }
  }
});

test('every bare filename the mirror serves is watched on both events', () => {
  for (const [event, filters] of filtersByEvent) {
    if (!['push', 'pull_request'].includes(event)) continue;
    for (const name of SERVABLE_NAMES) {
      assert.ok(
        filters.includes(`ventures/**/${name}`),
        `${WORKFLOW} ${event}: no path filter for ${name}, which the mirror serves — ` +
          `add "ventures/**/${name}" or the staleness check cannot fire on it`,
      );
    }
  }
});
