# Pages build, 2026-11-11: pass 2 runs 16 surfaces at a time

Perf track, item 3 of `prompts/perf/prompt-0.md` (the slowest local step a
session waits on). This is item 1 of the "not changed" lists in
[`pages-build-perf-2026-11-11-parallel-copy.md`](pages-build-perf-2026-11-11-parallel-copy.md)
and [`pages-build-perf-2026-11-11-concurrent-walks.md`](pages-build-perf-2026-11-11-concurrent-walks.md)
(PR #14702, the same day, changed other functions in the same file). Both open perf backlog
items (P063, P064) are still owner-gated, because they touch workflow files.

## Reading

Pass 2 of `buildSiteInner` (`platform/pages/build.mjs`) did one surface at a
time: `repairLinks`, then the generated `sitemap.xml`, the `llms.txt` (written
or dated), and the hub entry (meta, search tokens, page counts, and the
external-fetch scan). The parallel-copy note had measured about 1.2 s of CPU
in a pass that took 5.7 s, so most of it was waiting on file I/O one surface at
a time.

Timing: a temporary `performance.now()` pair around the pass, printing to
stderr (kept out of the commit). Full builds with a warm share-card cache,
`drop_caches` before each, before and after taking turns, 4 cores:

| pair | pass 2 before | pass 2 after | build before | build after |
|---|---:|---:|---:|---:|
| 1 | 7.07 s | 3.90 s | 80.3 s | 75.8 s |
| 2 | 6.35 s | 3.90 s | 78.1 s | 79.7 s |
| 3 | 6.23 s | 3.96 s | 79.2 s | 78.6 s |
| mean | 6.55 s | 3.92 s (−2.6 s, −40%) | 79.2 s | 78.0 s |

The whole-build column is noise at this size: the run-to-run spread is ±2 s,
about as large as the saving. The pass-2 timing is the figure to rely on.

## Change

Pass 2 is now two `mapLimit(discovered, 16, …)` passes (`share.mjs`):

- **2a** runs every surface's `repairLinks`. A repair rewrites HTML only
  inside its own surface and asks only whether a link target *exists*. Every
  file a repair can find was created in pass 1, so one repair cannot see
  another's work.
- **2b** does the rest of the per-surface work and returns each hub entry.
  Each surface reads and writes only under its own `outDir/<slug>` and its own
  source directory. `mapLimit` returns results in input order, so `surfaces`,
  `repairs` and the build log keep slug order.

One semantic difference, and why it doesn't change the output: 2b creates
files (each `sitemap.xml`, a generated `llms.txt`). Before, those files were
already on disk when surfaces later in slug order ran their repairs, and not
yet there for surfaces earlier in the order. Now no repair sees them. A repair
only rewrites a link whose target is missing from the site *and* present in
the repository at the source-relative path. A generated file is not in the
repository. So only a link to a file that sits in a venture's directory but
outside its published `site/` subdirectory could tell the difference. The
build output shows no such link today, and the order-independent rule is the
safer one anyway.

## Verification

- `diff -rq` of each before/after pair of full builds (25,262 files, 1,331
  tools): only `version.json` differs, and only in its `built_at` timestamp.
  Two "before" builds differ in that same file, so the build is otherwise
  deterministic. The build logs match line for line.
- `node --test build.test.mjs build-determinism.test.mjs custom-domain.test.mjs`
  (results in this run's record under `prompts/runs/`).

## Not changed, ranked for the next run

1. The whole-output passes that each walk the tree and then read every HTML
   file in a `for … await` loop (`markSponsorLinksIn`,
   `addNoscriptNoticesIn`): the same one-file-at-a-time pattern. Check
   whether they can share a single walk.
2. The LICENSE and `DOWNLOADABLE_CLI_FILES` copy loops between pass 1 and 2
   are serial, but small (an `existsSync` per surface).
3. P063 and P064, once the owner applies them.
