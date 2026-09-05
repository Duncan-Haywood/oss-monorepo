#!/usr/bin/env node
/**
 * Regenerate every committed artifact that the apex actually serves.
 *
 * ## Why this exists
 *
 * `gitops/prod/front-door*` is produced by **two** generators, not one:
 *
 *   - `front-door.mjs`       — the apex page, category pages, About, the
 *                              favicon and social card, `robots.txt`,
 *                              `sitemap.xml`, `feed.xml`, `llms.txt`,
 *                              `catalog.json`, the embed runtime.
 *   - `front-door-tools.mjs` — the mirrored tools themselves, as gzipped
 *                              ConfigMap shards, plus the kustomization that
 *                              lists them and the nginx alias map.
 *
 * Both read the same venture tree, so *any* edit to a venture page can
 * invalidate either or both. Nothing named the pair, and every staleness
 * assertion named only the generator that owned the file it checked. The
 * predictable thing happened on 2026-09-05: three sessions in three minutes
 * each fixed the half they were shown.
 *
 *   #3256 (02:18)  added ventures/einvoice-preflight/vs-avalara.html and ran
 *                  neither generator. `platform/pages/build.mjs` and
 *                  `check.mjs` both passed — they build the *other* site — so
 *                  nothing contradicted it.
 *   #3257 (02:20)  hit the mirror tests, ran `front-door-tools.mjs --write`.
 *   #3258 (02:21)  hit them again, ran `front-door-tools.mjs --write` again,
 *                  and reported "208/208 passing".
 *
 * `main` was then red on six tests, and the sitemap the apex serves was
 * missing the page #3256 had added — a page built, deployed and listed
 * nowhere, which is the SEO defect `check.mjs` exists to catch on the other
 * host. The single-generator fix hint is what made a half-fix look complete:
 * a session that ran the command it was handed, and saw its own test go
 * green, had no way to learn the other generator existed.
 *
 * So this runs *all* of them, and the staleness hints in both test files name
 * this script rather than either generator.
 *
 * ## It does not restate the generator list
 *
 * The set is discovered from the directory, not hardcoded. A third generator
 * added here is picked up with no edit to this file, and
 * `regen.test.mjs` fails if discovery ever comes back with fewer than the
 * generators actually present. CLAUDE.md records two separate occasions where
 * a copied constant went stale rather than being derived ("168 became 169");
 * this is the cheap version of that guard.
 *
 * ## Usage
 *
 *   node platform/marketing/regen.mjs            # regenerate everything
 *   node platform/marketing/regen.mjs --check    # list what would run
 *
 * Order does not matter: the two generators touch disjoint outputs apart from
 * `front-door/00-mirror-alias.conf` (written only by `front-door-tools.mjs`),
 * and running them in either order reaches the same tree. `regen.test.mjs`
 * pins that so a future generator that *does* depend on another's output
 * fails loudly here rather than producing a tree that depends on the order
 * someone happened to type.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.basename(fileURLToPath(import.meta.url));

/**
 * The convention every generator in this directory follows: a `--write` branch
 * behind an `isMain` guard. Detecting it from the source is what keeps the set
 * derived rather than restated — see the header.
 */
const WRITE_MODE = /process\.argv\.includes\(['"]--write['"]\)/;

/**
 * Every generator here that can write its artifact, sorted by filename so a
 * run is reproducible and a diff of the output is attributable.
 *
 * Exported so `regen.test.mjs` can assert this agrees with the directory
 * rather than re-deriving the same answer a second way.
 */
export async function discoverGenerators(dir = HERE) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.mjs')) continue;
    if (entry.name.endsWith('.test.mjs')) continue;
    if (entry.name === SELF) continue;
    const source = await fs.readFile(path.join(dir, entry.name), 'utf8');
    if (WRITE_MODE.test(source)) found.push(entry.name);
  }
  return found.sort();
}

/** Repo-relative, because that is how the fix hint has to read to be runnable. */
export const commandFor = (name) => `node platform/marketing/${name} --write`;

/** The one command every staleness assertion in this directory points at. */
export const REGENERATE_ALL = 'node platform/marketing/regen.mjs';

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const generators = await discoverGenerators();

  if (generators.length === 0) {
    // Discovery silently matching nothing would make this script a no-op that
    // reports success, which is worse than the problem it fixes.
    console.error(
      `regen: found no generator in ${HERE}. That is a bug in this script's ` +
        `detection, not an empty directory — see WRITE_MODE.`,
    );
    process.exit(1);
  }

  if (process.argv.includes('--check')) {
    console.log(`regen would run ${generators.length} generator(s):`);
    for (const name of generators) console.log(`  ${commandFor(name)}`);
    process.exit(0);
  }

  const repoRoot = path.resolve(HERE, '..', '..');
  for (const name of generators) {
    console.log(`\n=== ${commandFor(name)} ===`);
    const result = spawnSync(process.execPath, [path.join(HERE, name), '--write'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      console.error(`regen: ${name} exited ${result.status ?? 'on a signal'} — stopping.`);
      process.exit(result.status || 1);
    }
  }

  console.log(`\nregen: ${generators.length} generator(s) ran. The served surface is current.`);
}
