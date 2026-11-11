# Pages build perf, 2026-11-11: title-clash and module-preload passes read concurrently

Perf track, prompt 0. Item 1 of the "not changed" list in
[`pages-build-perf-2026-11-11-sponsor-noscript-one-walk.md`](pages-build-perf-2026-11-11-sponsor-noscript-one-walk.md):
time the other whole-output passes that read every page after the chrome pass.
Both open perf backlog items (P063, P064) are still owner-gated (workflow
files), so this run took the slowest local step instead. PR #14702 (concurrent
`listFiles`/`listHtml` walks) is open from another session; this change does
not touch `listFiles`.

## Reading

Two passes near the end of `buildSiteInner` read the whole output one file at
a time:

- `fixPostTitleClashes` (`platform/pages/page-identity.mjs`) calls
  `loadPages`, which walked the tree and awaited each `readFile` in turn:
  8,496 pages. `check.mjs` (the site check) uses the same `loadPages`.
- `addModulePreloads` (`platform/pages/preload.mjs`) read every HTML page in a
  `for … await` loop, tested it for a module script, and for the 231 pages
  with an import chain at least two deep, wrote the preload links back.

`fixPostTitleClashes` and `addShareCards` were the other two candidates in
that list; the share-card pass is already concurrent.

## Measurement

Bench (`node bench.mjs <old|new> <preload|identity> <tree>`, kept in the
session scratchpad): imports the committed `HEAD` copy of each module (old) or
the working copy (new) and times the pass with `performance.now()`. 4 cores,
old and new taking turns, page cache warm (`drop_caches` is not writable in
this container).

- **preload**: input is a full build with every
  `<link rel="modulepreload" …>` line stripped, copied fresh before each run.
- **identity**: `loadPages` plus `resolvePostTitleClashes` on the finished
  build (read-only).

| pair | preload old | preload new | identity old | identity new |
|---|---:|---:|---:|---:|
| 1 | 3.61 s | 2.81 s | 2.51 s | 1.99 s |
| 2 | 3.80 s | 2.92 s | 2.58 s | 2.04 s |
| 3 | 3.73 s | 2.50 s | 2.55 s | 2.03 s |
| mean | 3.71 s | 2.74 s (−0.97 s, −26%) | 2.55 s | 2.02 s (−0.53 s, −21%) |

Outputs: in every preload pair the old and new trees were identical
(`diff -rq`) and the totals matched (1,661 links on 231 pages, deepest chain
11). In every identity pair the page count (8,496), the joined key list and
the number of clashes matched.

About 1.5 s off a 2-minute build. Small, because on a warm page cache most of
these passes is CPU (regex tests and `readFile` decoding of 1.1 GB of HTML),
not waiting. On a cold runner the share of waiting is larger, as the earlier
notes in this series found, so the CI saving is likely bigger; not measured
here.

## Change

- `loadPages`: the walk still lists paths in the same order; the reads then
  run 32 at a time through `mapLimit` (`share.mjs`, keeps input order), and
  the Map is filled in walk order, so callers see the same keys in the same
  order.
- `addModulePreloads`: pages are read, graphed and rewritten 32 at a time.
  Each task reads and writes only its own page and reads only `.js`/`.mjs`
  files, which no task writes. The shared module cache may read one module
  twice when two pages ask at once; both reads give the same imports. The
  totals are sums and a max, so finishing order cannot change them.

Pinned by two new tests:

- `page-identity.test.mjs`: 80 pages in nested directories, `loadPages`
  entries equal a serial walk-and-read, in order. A mutation that fills the
  Map in finishing order fails it (checked).
- `preload.test.mjs`: 60 pages with shared modules and chains of different
  depths; bytes and totals equal a serial reference built from
  `moduleGraph` and `injectPreloads`.

## Whole-build check

Two full builds, `node platform/pages/build.mjs --out=<dir>`: baseline from
`HEAD` (2 m 22 s) and with the change (2 m 05 s; the first build warmed caches,
so the bench above is the number to rely on). `diff -rq` over the two 1.1 GB
trees reports one file, `version.json` (the build timestamp). Logged counts
match: the same one retitled post, 1,661 preload links on 231 pages.

## Not changed, ranked for the next run

1. `addModulePreloads` still regex-tests every one of the ~8,500 pages for a
   module script though only ~231 have a deep graph. If an earlier pass
   already knows which pages carry module scripts, handing that list over
   would skip ~8,000 reads. Check the ordering comment first: preloads run
   after every pass that adds module scripts.
2. `fixPostTitleClashes` only rewrites `writing/` pages but loads every page
   to find titles they clash with. Titles could be collected in the chrome
   pass instead, if that pass sees final titles.
3. The offline layer's hashing pass (`build.mjs`, `mapLimit(files, 32, …)` at
   the digests step) is already concurrent; not timed.
4. P063 and P064, once the owner applies them.
