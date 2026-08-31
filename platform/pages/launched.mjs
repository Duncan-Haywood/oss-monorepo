/**
 * When each published tool first appeared, and the Atom feed built from it.
 *
 * ## Why the dates are a committed file rather than a `git log`
 *
 * The obvious source for "when did this tool ship" is history:
 * `git log --diff-filter=A -- ventures/<slug>` gives the commit that added it.
 * The in-cluster build cannot ask that question. `gitops/prod/portfolio-site.yaml`
 * clones with `--depth 1` on every pod start — deliberately, because a full
 * clone of this repository is ~64 MiB and the site rebuilds on every restart —
 * so the build container has exactly one commit and no history to read.
 *
 * So the answer is derived once, on a machine that has the history, and
 * committed. `refreshLaunchDates` below is that derivation; `node
 * platform/pages/launched.mjs --write` runs it. New tools get a date the first
 * time someone runs it after they land, and `check.mjs` fails the build if a
 * published surface has no date at all — otherwise a tool would quietly ship
 * missing from the feed, which is the one failure mode that leaves no trace on
 * any page.
 *
 * ## Why the dates never move once written
 *
 * The refresh only *adds*. A slug already in `launched.json` keeps the date it
 * has, even if history now says otherwise (a rename, a directory moved between
 * ventures, a squashed rewrite). A feed whose entries change date retroactively
 * is a feed that re-notifies every subscriber about tools they have already
 * seen, and the whole value of publishing one is that it is quiet when nothing
 * is new.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LAUNCHED_FILE = path.join(HERE, 'launched.json');
const REPO_ROOT = path.resolve(HERE, '..', '..');

/**
 * How many entries the feed carries. A reader that has been away for a month
 * should see everything they missed; one that has never subscribed does not
 * need 184 entries of history in a document every poll re-downloads.
 */
export const FEED_MAX_ENTRIES = 40;

/** `{ slug: 'YYYY-MM-DD' }`, or `{}` when the file has not been generated. */
export async function loadLaunchDates(file = LAUNCHED_FILE) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    // Tolerate — but do not trust — a hand-edited file. A malformed value is
    // dropped rather than published as a broken `<updated>`, which would make
    // the whole feed unparseable for every reader at once.
    return Object.fromEntries(
      Object.entries(parsed?.launched ?? {}).filter(([slug, date]) => isIsoDate(date) && slug),
    );
  } catch {
    return {};
  }
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * The author date of the commit that first added `ventures/<slug>/`, as
 * `YYYY-MM-DD` in UTC, or null when history does not know (a shallow clone, a
 * directory that was never committed).
 */
export async function firstCommitDate(slug, { cwd = REPO_ROOT } = {}) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      // `--reverse` with `--diff-filter=A` lists every add of the path; the
      // first line is the original one. A tool deleted and restored keeps its
      // original launch date, which is the honest answer.
      ['log', '--reverse', '--diff-filter=A', '--format=%aI', '--', `ventures/${slug}`],
      { cwd, maxBuffer: 8 * 1024 * 1024 },
    );
    const first = stdout.split('\n').find((line) => line.trim());
    if (!first) return null;
    const parsed = new Date(first.trim());
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Add a date for every slug that has none. Returns the merged map and the list
 * of slugs it learned, so a caller can report the delta rather than diffing
 * JSON.
 *
 * Existing entries are never overwritten — see the module comment.
 */
export async function refreshLaunchDates(slugs, { existing = {}, cwd = REPO_ROOT, today = null } = {}) {
  const merged = { ...existing };
  const added = [];
  for (const slug of slugs) {
    if (merged[slug]) continue;
    // A slug with no history at all is one added in the working tree and not
    // yet committed. Dating it today is right: it is launching now.
    const date = (await firstCommitDate(slug, { cwd })) ?? today ?? new Date().toISOString().slice(0, 10);
    merged[slug] = date;
    added.push(slug);
  }
  return { launched: sortByKey(merged), added };
}

function sortByKey(map) {
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Newest first, then slug so the order is total and a rebuild of the same
 * commit produces a byte-identical feed. Surfaces with no known date sort last
 * rather than being dropped: `check.mjs` is what refuses to publish them, and
 * a renderer that silently omitted them would hide the thing the check exists
 * to catch.
 */
export function orderForFeed(surfaces, launched) {
  return [...surfaces].sort((a, b) => {
    const da = launched[a.slug] ?? '';
    const db = launched[b.slug] ?? '';
    if (da !== db) return db.localeCompare(da);
    return a.slug.localeCompare(b.slug);
  });
}

/**
 * The feed's own `<updated>`: the newest entry date. Deliberately *not* the
 * build time — the site rebuilds on every pod restart and on a nightly
 * CronJob, and a feed whose `<updated>` moved every night would tell every
 * aggregator that something changed when nothing had.
 */
export function feedUpdatedAt(surfaces, launched) {
  const dates = surfaces.map((s) => launched[s.slug]).filter(isIsoDate).sort();
  return dates.length ? `${dates[dates.length - 1]}T00:00:00Z` : null;
}

/**
 * `node platform/pages/launched.mjs [--write]`
 *
 * Deliberately *not* a top-level await. `build.mjs` imports this module, so
 * awaiting `import('./build.mjs')` at the top level deadlocks: this module's
 * evaluation blocks on build.mjs, which blocks on this module finishing
 * evaluating. Node reports it as "Detected unsettled top-level await" and the
 * process exits having done nothing — silently, with status 13. Starting the
 * work in a function instead lets this module finish evaluating first, which
 * is all the cycle needs to resolve.
 */
async function main(argv) {
  const { discoverSurfaces } = await import('./build.mjs');
  const surfaces = await discoverSurfaces(path.join(REPO_ROOT, 'ventures'));
  const existing = await loadLaunchDates();
  const { launched, added } = await refreshLaunchDates(
    surfaces.map((s) => s.slug),
    { existing },
  );
  if (argv.includes('--write')) {
    await fs.writeFile(LAUNCHED_FILE, `${JSON.stringify({ launched }, null, 2)}\n`);
    console.log(`launched.json: ${Object.keys(launched).length} tools, ${added.length} added`);
  } else {
    console.log(`${Object.keys(launched).length} tools, ${added.length} would be added:`);
    for (const slug of added) console.log(`  ${slug}  ${launched[slug]}`);
  }
  return added;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
