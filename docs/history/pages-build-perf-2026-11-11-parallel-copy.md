# Pages build, 2026-11-11: copy the 1,331 venture trees 16 at a time

Perf track, item 3 of `prompts/perf/prompt-0.md` (the slowest local step a
session waits on). Both open perf backlog items (P063, P064) are still
owner-gated, since they touch workflow files.

## Reading

One cold full build (`node --cpu-prof build.mjs --out=<dir>`, empty
`PAGES_CARD_CACHE`, 4 cores, fresh container): 136.7 s wall, 4 m 9 s user.
The main thread was idle for 77.8 s of its 136.6 s profile. Using
`(idle)` share per 5 s window and the time span each function stays on the
stack (scripts kept out of the tree, described here):

| span | what | main-thread CPU |
|---|---|---:|
| 1.1 to 14.4 s | pass 1, `copyTree` over every surface, one at a time | 0.8 s |
| 14.6 to 20.3 s | pass 2, `repairLinks` and the rest, one surface at a time | about 1.2 s |
| 44.8 to 56 s, 85 to 120 s | share-card worker pool (`share.mjs` `next`) | about 0 |

The card-pool stretches are the cold card cache. CI restores
`test-share-cards-*`, and a warm build skips most of that work. The two pass
spans are the main thread waiting for single file reads and writes, each
awaited in turn, so only one libuv I/O thread is busy at a time.

## Change

`buildSiteInner` pass 1 now runs `copyTree` through the existing
`mapLimit(items, 16, fn)` from `share.mjs`, not a `for … await` loop.
Each surface writes only under `outDir/<slug>`, and slugs are directory names,
so the trees are disjoint. Pass 1 reads nothing that another surface writes,
so the finished tree does not depend on the order.

Pass 2 stays serial on purpose. `repairLinks` decides a link is internal by
whether its target exists on disk, and pass 2 writes `sitemap.xml` and
`llms.txt` into each surface. Run concurrently, a link from one venture to
another's generated `llms.txt` could resolve differently from run to run.

## Measurement

The copy pass alone (`discoverSurfaces`, then every `copyTree`, into a scratch
directory, warm page cache except where noted):

| | sequential | 16 at a time | 32 | 64 |
|---|---:|---:|---:|---:|
| cold page cache (`drop_caches`), two runs | 5.98, 6.27 s | 2.43, 2.35 s | 2.38, 2.17 s | 2.18, 2.37 s |
| warm page cache | 4.37 s | 2.23 s | 2.82 s | |

Widths above 16 make no consistent difference, which fits libuv's default
pool of 4 threads. The output of the sequential and pooled runs is the same
under `diff -r`.

Whole build: warm card cache, page cache dropped before each run, before and
after built one after the other:

| pair | before | after |
|---|---:|---:|
| 1 | 70.6 s | 66.0 s |
| 2 | 79.6 s | 74.6 s |
| 3 | 77.6 s | 74.2 s |
| mean | 75.9 s | 71.6 s (−4.3 s, −5.7%) |

`diff -r` of the before and after trees: one file differs, `version.json`,
and only in its `built_at` timestamp.

The site-builder tests do three full real-site builds per CI run
(`build.test.mjs` once, `build-determinism.test.mjs` twice in child
processes), and the deploy builds once more. That is roughly 4 s off each.

## Verification

`node --test build.test.mjs build-determinism.test.mjs custom-domain.test.mjs`
(results in this run's record, `prompts/runs/`). The `copyTree` unit tests
(dot-directory caches, `.ics` folding) exercise the function, which is
unchanged.

## Not changed, ranked for the next run

1. Pass 2 (5.7 s cold, about 1.2 s of it CPU). To make it concurrent safely,
   split it: run every `repairLinks` first (it only rewrites HTML inside its
   own surface), then the sitemap and `llms.txt` writes. Before relying on
   that, show that no repaired link points at a generated file.
2. `listFiles`, `listHtml` and `publishedPages` walk the tree with one
   `readdir` awaited at a time. They are smaller, but the same pattern.
3. P063 and P064, once the owner applies them.
