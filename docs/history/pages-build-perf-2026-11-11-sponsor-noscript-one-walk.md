# Pages build perf, 2026-11-11: the sponsor and noscript passes share one walk

Perf track, prompt 0. Item 1 of the "not changed" list in
[`pages-build-perf-2026-11-11-pass-two-concurrent.md`](pages-build-perf-2026-11-11-pass-two-concurrent.md).
Both open perf backlog items (P063, P064) are still owner-gated (workflow
files), so this run took the slowest local step instead.

## Reading

After the chrome pass, `buildSiteInner` (`platform/pages/build.mjs`) ran two
whole-output passes in a row:

- `markSponsorLinksIn`: walk the tree, read every HTML page one at a time,
  tag the Sponsors anchors, write the page back;
- `addNoscriptNoticesIn`: walk the tree again, read every HTML page again one
  at a time, insert the "needs JavaScript" notice, write it back.

On today's tree that is about 8,450 HTML pages (1.1 GB output), each read
twice with one file request in flight at a time.

## Measurement

The bench (`node bench.mjs <old|new> <tree>`, kept in the session scratchpad,
not committed) imports `build.mjs` and runs either the old two serial passes,
copied verbatim, or the new `markSponsorsAndNoscriptIn`, timing them with
`performance.now()`. Input: the output of a full build with the sponsor marker
(` data-pf-sponsor>` → `>`) and `NOSCRIPT_NOTICE` stripped back out, copied
fresh for each run. Old and new took turns, 4 cores. (`drop_caches` is not
writable in this container, so the page cache was whatever the fresh copy
left.)

| pair | old (two serial walks) | new (one walk, 32 in flight) | output tree | changed-file lists |
|---|---:|---:|---|---|
| 1 | 14.88 s | 4.55 s | identical (`diff -rq`) | identical (`cmp`) |
| 2 | 15.44 s | 4.73 s | identical | identical |
| 3 | 15.58 s | 5.09 s | identical | identical |
| mean | 15.30 s | 4.79 s (−10.5 s, −69%) | | |

Each run rewrote 8,451 pages for the sponsor marker and 6,784 for the notice.
(The real build reports 2,149 notices. The stripped tree is a finished build,
so later passes had already changed pages, and stripping the exact notice
string also removed copies that the notice pass had not added. The count is
the same for old and new, which is what this comparison needs.)

Full build with the change, against the baseline build from the same commit:
see "Whole-build check" below.

## Change

- `markSponsorsAndNoscriptIn(outDir)`: one `listFiles` walk, then
  `mapLimit(files, 32, …)`. Each page is read once, then `markSponsorLinks`
  then `addNoscriptNotice` run on it, and it is written once if either
  changed. It returns `{ sponsored, noscripted }` in `listFiles` order, the
  same lists the two passes returned.
- `markSponsorLinksIn` and `addNoscriptNoticesIn` stay exported (same
  results), now through a shared `rewriteHtmlIn` helper that is also
  concurrent.
- The build calls the merged function.

Why one read gives the same bytes as two passes in turn: the notice looks only
for `<noscript>`, a non-JSON `<script>`, form controls and `<body>`. The
sponsor marker is one attribute added inside a Sponsors `<a>` tag, so it
cannot add or remove any of those. Each page is read and written only by its
own task, so the order tasks finish in cannot change any file.

Pinned by a new test in `platform/pages/noscript-notice.test.mjs`: the two old
passes on one copy of a fixture tree and the merged walk on another give
byte-identical files and identical lists.

## Whole-build check

Two full builds from this commit, `node platform/pages/build.mjs --out=<dir>`:
the baseline (old passes) and one with the change. `diff -rq` over the two
1.1 GB trees reports one differing file, `version.json`, which carries the
build timestamp. The logged counts match (8,451 sponsor-marked, 2,149
notices). Wall time was 2 m 50 s before and 2 m 30 s after. That difference is
mostly not this change: the first build also warmed caches the second one
used, so the paired pass timing above is the number to rely on.

## Not changed, ranked for the next run

1. Other whole-output passes after the chrome pass that each do their own
   `listFiles`/`listHtml` walk and read every page (`fixPostTitleClashes`,
   `addShareCards`, `addModulePreloads`, the offline layer's hashing). The
   share-card pass is already concurrent. The others are worth timing the same
   way. One shared in-memory list of HTML paths after the chrome pass would
   save the walks. Folding the passes together would also save the reads, but
   each one has an ordering comment that must hold first.
2. P063 and P064, once the owner applies them.
