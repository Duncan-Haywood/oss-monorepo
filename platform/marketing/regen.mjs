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
 *   node platform/marketing/regen.mjs --verify   # is the commit current? exit 1 if not
 *
 * ## `--verify`, and why a third mode earns its place
 *
 * The authoritative answer to "is the committed surface stale?" already
 * existed, in `front-door-tools.test.mjs` and `front-door.test.mjs`. It costs
 * **86 seconds**, because it arrives inside a 262-assertion suite that also
 * re-derives the shard packing, the headroom, the alias map and every injected
 * tag. The *fix* costs 7 — the two generators are 3.5s each.
 *
 * That asymmetry is the whole defect. A session that has just made a one-line
 * edit to a venture page is choosing between a 86-second suite and skipping it,
 * and CLAUDE.md records which one gets picked: three separate instances on
 * 2026-09-17 alone (#5007, #5012 and #5020 each shipped a venture fix and left
 * the mirror carrying the pre-fix copy), on top of #3256-#3258 and #3324-#3326,
 * which that file records as having cost live product.
 *
 * `--verify` gives the same answer in about 7 seconds and says only the thing
 * you need: which artifacts are stale, and the one command that fixes them.
 *
 * It is also the mode that is safe to run **mid-change**. Bare `regen.mjs`
 * rewrites the tree, so a session part-way through unrelated work cannot ask
 * the question without mixing a thousand generated files into a diff it is not
 * ready to commit. `--verify` snapshots the artifact root, runs the generators,
 * compares, and puts the tree back byte-for-byte — so the answer costs nothing
 * but time, and the exit code is the point. CLAUDE.md makes this argument twice
 * already, for `pages_state.py --require-current` and `guard_state.py
 * --require-runnable`: a reminder competes with everything else in a long file,
 * and an exit code does not.
 *
 * What it deliberately does not do is *decide* for you. If it exits 1 the fix
 * is `node platform/marketing/regen.mjs`, committed — never a hand edit, for
 * the reason `resolve-mirror-merge.sh` documents at length.
 *
 * ## The one hazard, and it has already fired once
 *
 * "Puts the tree back" is not the same as "never touched it". For about seven
 * seconds `--verify` deletes and rewrites `gitops/prod/`, so **anything else
 * reading that directory at the same time reads a half-written tree.**
 *
 * That is not hypothetical. #5032 shipped an end-to-end test that ran this
 * mode as a subprocess, `node --test` runs the files in this directory in
 * parallel, and `front-door.test.mjs` and `front-door-tools.test.mjs` spend
 * their whole run reading committed artifacts out of `gitops/prod/`. `main`
 * went red within the hour: 3 of 266, then 4 of 266, on an unchanged commit,
 * while each file passed 111/111 and 101/101 on its own. #5032's own
 * verification run passed 266/266 and was simply lucky with the interleaving.
 *
 * So: run `--verify` on its own. Do not background it beside a test run, and
 * do not call it from a test — `regen.test.mjs` covers the restore against a
 * temp directory through `withSnapshot` for exactly that reason. The
 * checklist's ordering (verify, then the suites) is sequential and safe.
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
import os from 'node:os';
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
/**
 * Generators whose output is no longer committed. `front-door-tools.mjs` wrote
 * ~5.9k gzipped files for the k3s origin retired on 2026-10-01; every venture PR
 * that ran `regen` re-added them (process backlog P024). Its tests still build
 * the mirror into a temp dir (`--out`), so the module stays.
 */
const RETIRED_GENERATORS = new Set(['front-door-tools.mjs']);

export async function discoverGenerators(dir = HERE) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.mjs')) continue;
    if (entry.name.endsWith('.test.mjs')) continue;
    if (entry.name === SELF) continue;
    if (RETIRED_GENERATORS.has(entry.name)) continue;
    const source = await fs.readFile(path.join(dir, entry.name), 'utf8');
    if (WRITE_MODE.test(source)) found.push(entry.name);
  }
  return found.sort();
}

/** Repo-relative, because that is how the fix hint has to read to be runnable. */
export const commandFor = (name) => `node platform/marketing/${name} --write`;

/** The one command every staleness assertion in this directory points at. */
export const REGENERATE_ALL = 'node platform/marketing/regen.mjs';

/**
 * Where every generator in this directory puts its output.
 *
 * This is the one coarse fact `--verify` states rather than derives, and the
 * choice is deliberate. Both generators already export every output path as a
 * constant — `OUTPUT_DIR`, `FRONT_DOOR_DIR`, `FRONT_DOOR_DEPLOYMENT`,
 * `OUTPUT_FILE`, `SITEMAP_OUTPUT_FILE` and a dozen more — so a derived list is
 * *available*, but deriving it means guessing from export names which
 * constants are outputs and which are inputs (`VENTURES_DIR`, `LAUNCHED_FILE`
 * are exported the same way). A guess that silently admits an input would make
 * the snapshot root the whole repository; a guess that silently drops an output
 * would make `--verify` report current while an artifact is stale, which is the
 * exact failure it exists to catch.
 *
 * So: one coarse root, and two mechanical guards instead of a clever list.
 * `regen.test.mjs` asserts that every absolute path constant either generator
 * exports that lives under `gitops/` lives under *this* directory — so a future
 * generator writing somewhere else fails there, by name. And `--verify` itself
 * checks `git status` either side of its run and refuses (exit 2) if a
 * generator dirtied anything outside this root, because a file it did not
 * snapshot is a file it cannot put back.
 */
export const ARTIFACT_ROOT = path.resolve(HERE, '..', '..', 'gitops', 'prod');

/**
 * Every file under `dir`, keyed by its path relative to `dir`, valued by a
 * hash of its contents.
 *
 * Hashes rather than bytes because the mirror is 15MB across 2,184 files and
 * the only question asked of them is equality. The bytes needed to *restore*
 * the tree live in a temp copy on disk, not here.
 */
export async function hashTree(dir) {
  const { createHash } = await import('node:crypto');
  const seen = new Map();
  async function walk(current, prefix) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, rel);
        continue;
      }
      if (!entry.isFile()) continue;
      seen.set(rel, createHash('sha256').update(await fs.readFile(full)).digest('hex'));
    }
  }
  await walk(dir, '');
  return seen;
}

/**
 * What changed between two `hashTree` readings, as three sorted lists.
 *
 * Kept separate from the I/O so `regen.test.mjs` can exercise the comparison
 * on synthetic maps without a 7-second generator run.
 */
export function compareTrees(before, after) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const [rel, hash] of after) {
    if (!before.has(rel)) added.push(rel);
    else if (before.get(rel) !== hash) changed.push(rel);
  }
  for (const rel of before.keys()) if (!after.has(rel)) removed.push(rel);
  changed.sort();
  added.sort();
  removed.sort();
  return { changed, added, removed, stale: changed.length + added.length + removed.length };
}

/** Repo-relative paths git currently reports as not matching the index. */
function dirtyPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  // No git, or not a checkout: the outside-the-root guard below degrades to a
  // printed caveat rather than a refusal. `--verify` still answers correctly
  // about the artifact root, which is the question.
  if (result.status !== 0) return null;
  return new Set(
    result.stdout
      .split('\0')
      .filter(Boolean)
      // Porcelain v1 is `XY <path>`, and a rename is `XY <to>\0<from>`; taking
      // everything after the first space of each record covers both well enough
      // for a set-difference that only ever *adds* caution.
      .map((record) => record.slice(3))
      .filter(Boolean),
  );
}

const outsideRoot = (paths, rootRel) =>
  [...(paths ?? [])].filter((p) => !p.startsWith(`${rootRel}/`)).sort();

/**
 * Run `body`, then put `dir` back exactly as it was found.
 *
 * Extracted from `verifyCurrent` so the risky half — the restore — is testable
 * against a temp directory rather than only against the real artifact root.
 * `regen.test.mjs` exercises it with a body that changes, deletes and adds
 * files, which is the shape a generator run takes (`writeMirror` starts with
 * `fs.rm(outputDir, { recursive: true })`).
 *
 * The restore is in a `finally`, deliberately: `--verify` promising a
 * byte-identical tree and then leaving 2,184 rewritten files behind on an
 * error would be worse than not offering the mode.
 */
export async function withSnapshot(dir, body) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'regen-snapshot-'));
  const saved = path.join(scratch, 'snapshot');
  await fs.cp(dir, saved, { recursive: true });
  try {
    return await body();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.cp(saved, dir, { recursive: true });
    await fs.rm(scratch, { recursive: true, force: true });
  }
}

/**
 * Static pages the front-door mirror holds out for a fixable reason (a link it
 * cannot follow, an unroutable filename). CLIs and build-step apps are not
 * listed: they can never be pages. Before this, a venture that lost its apex
 * copy to a stray `href="../"` or a png asset was reported by nothing, and
 * `--verify` said current (process backlog P008).
 */
async function fixableExclusions() {
  const { explainIneligible } = await import('./front-door-tools.mjs');
  return (await explainIneligible()).filter((e) => e.kind !== 'not-a-page');
}

function reportExclusions(list, print) {
  if (!list.length) return;
  print(`\n${list.length} venture page(s) the mirror silently drops, each fixable in the venture:`);
  for (const { slug, kind, reason } of list) print(`  ${slug} [${kind}]: ${reason}`);
}

/**
 * Run every generator and report whether the committed artifacts already match
 * what they produce, leaving the tree exactly as it was found.
 *
 * Returns `{ stale, changed, added, removed }`. Throws on anything that would
 * leave the tree modified — the caller turns that into exit 2, never exit 1,
 * because "I could not answer" and "your commit is stale" are different
 * results and collapsing them is the costume CLAUDE.md warns about.
 */
export async function verifyCurrent({ generators, repoRoot, log = () => {} } = {}) {
  const rootRel = path.relative(repoRoot, ARTIFACT_ROOT).split(path.sep).join('/');
  const dirtyBefore = dirtyPaths(repoRoot);

  try {
    return await withSnapshot(ARTIFACT_ROOT, async () => {
      log(`snapshotted ${rootRel}/ — running the generators`);
      const before = await hashTree(ARTIFACT_ROOT);

      for (const name of generators) {
        log(`  ${commandFor(name)}`);
        const result = spawnSync(process.execPath, [path.join(HERE, name), '--write'], {
          cwd: repoRoot,
          encoding: 'utf8',
        });
        if (result.status !== 0) {
          throw new Error(
            `${name} exited ${result.status ?? 'on a signal'} during --verify. ` +
              `That is a broken generator, not a stale commit:\n${result.stderr || result.stdout}`,
          );
        }
      }

      return compareTrees(before, await hashTree(ARTIFACT_ROOT));
    });
  } finally {
    const dirtyAfter = dirtyPaths(repoRoot);
    if (dirtyBefore && dirtyAfter) {
      const leaked = outsideRoot(dirtyAfter, rootRel).filter(
        (p) => !outsideRoot(dirtyBefore, rootRel).includes(p),
      );
      const unrestored = [...dirtyAfter].filter((p) => !dirtyBefore.has(p));
      if (leaked.length) {
        throw new Error(
          `a generator wrote outside ${rootRel}/, which --verify did not snapshot ` +
            `and therefore cannot put back:\n  ${leaked.join('\n  ')}\n` +
            `Run \`git status\` and restore these by hand. Then widen ARTIFACT_ROOT ` +
            `in ${SELF} — this is a bug here, not in your branch.`,
        );
      }
      if (unrestored.length) {
        throw new Error(
          `--verify did not restore ${rootRel}/ cleanly. These paths differ from ` +
            `how it found them:\n  ${unrestored.join('\n  ')}\n` +
            `\`git checkout -- ${rootRel}\` puts them back if they were committed.`,
        );
      }
    }
  }
}

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

  const repoRoot = path.resolve(HERE, '..', '..');

  if (process.argv.includes('--check')) {
    console.log(`regen would run ${generators.length} generator(s):`);
    for (const name of generators) console.log(`  ${commandFor(name)}`);
    process.exit(0);
  }

  if (process.argv.includes('--verify')) {
    const rootRel = path.relative(repoRoot, ARTIFACT_ROOT).split(path.sep).join('/');
    let report;
    try {
      report = await verifyCurrent({
        generators,
        repoRoot,
        log: (line) => console.log(`regen --verify: ${line}`),
      });
    } catch (error) {
      // Exit 2, never 1. A run that could not answer must not read as a stale
      // commit: the whole value of this mode is that its exit 1 means one
      // specific, actionable thing.
      console.error(`\nregen --verify could not answer:\n${error.message}`);
      process.exit(2);
    }

    if (!report.stale) {
      console.log(
        `\nregen --verify: ${rootRel}/ matches what ${generators.length} generator(s) produce. ` +
          `The committed surface is current.`,
      );
      const dropped = await fixableExclusions().catch(() => []);
      if (dropped.length) {
        reportExclusions(dropped, (line) => console.error(line));
        process.exit(1);
      }
      process.exit(0);
    }

    const show = (label, list) => {
      if (!list.length) return;
      console.error(`\n  ${list.length} ${label}:`);
      for (const rel of list.slice(0, 20)) console.error(`    ${rootRel}/${rel}`);
      if (list.length > 20) console.error(`    … and ${list.length - 20} more`);
    };

    console.error(
      `\nregen --verify: the committed surface is STALE — ${report.stale} artifact(s) ` +
        `do not match what the generators produce.`,
    );
    show('changed', report.changed);
    show('missing from the commit', report.added);
    show('committed but no longer generated', report.removed);
    console.error(
      `\nThe apex serves these files, so this is what a visitor would get: the ` +
        `pre-change copy of a page whose own sitemap.xml advertises the new one.\n` +
        `Fix, in one command, and commit what it rewrites:\n\n  ${REGENERATE_ALL}\n\n` +
        `Never hand-edit them — see platform/marketing/resolve-mirror-merge.sh for why ` +
        `picking a side is always wrong here.`,
    );
    reportExclusions(await fixableExclusions().catch(() => []), (line) => console.error(line));
    process.exit(1);
  }
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

  reportExclusions(await fixableExclusions().catch(() => []), (line) => console.log(line));
  console.log(`\nregen: ${generators.length} generator(s) ran. The served surface is current.`);
}
