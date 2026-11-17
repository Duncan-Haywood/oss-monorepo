# Pages build, 2026-11-12: phase timings on a warm build, and three main-thread waits removed

Perf track. Takes item 1 of "Not changed" in
[`pages-build-perf-2026-11-12-writing-per-page-memos.md`](pages-build-perf-2026-11-12-writing-per-page-memos.md)
("idle is 57% of the profile ... phase timestamps around `buildSite`'s awaits
would say which wait is longest"). Both open perf backlog items (P063, P064)
touch workflow files and still wait for the owner.

## Reading: where a build's time goes

A scratch wrapper called `buildSite` with a `log` that prints elapsed time and
`performance.eventLoopUtilization()` (ELU, the share of wall time the main
thread was busy) since the previous line, and a throwaway copy of
`build.mjs` logged a line before every top-level statement of
`buildSiteInner`. 4-core sandbox, Node 22.23.

**The idle in the earlier profile was a cold share-card cache, not the build.**
Without `PAGES_CARD_CACHE` (what a bare local run does), a full build was
88.6 s at 43% ELU, and two phases held the idle: `addShareCards` 43.8 s at 18%
busy and the category/tool `renderCards` 11.9 s at 3% busy, both waiting on the
card worker pool. CI sets `PAGES_CARD_CACHE` on every Pages job
(`portfolio-pages.yml`), so CI does not pay that. With the cache warm the same
build is **38.9 s at 93% ELU**: CPU-bound, no wait worth chasing. Warm phases
over 0.6 s:

| phase | s | busy |
|---|---:|---:|
| `addOfflineSupport` (cache name, icons, head injection, bundle sizes) | 8.2 | 88% |
| `addShareCards` (zero cards to draw; share-tag regex work) | 6.8 | 99% |
| `addSiteChrome` | 6.3 | 99% |
| buildWriting | 3.0 | 79% |
| pass 2b per-surface work | 2.4 | 99% |
| `markSponsorsAndNoscriptIn` | 2.1 | 92% |
| pass 1 copy | 2.1 | 99% |
| `buildResearchPage` (Python, `execFileSync`) | 1.8 | 100%* |
| `addModulePreloads` | 1.1 | 84% |

\* ELU counts a blocking `execFileSync` as busy: the main thread sits in the
call while Python works on another core.

A `node --cpu-prof` of the warm build (40.1 s) then named three costs a
small change removes without changing any output:

- `gzipBytesOf` in `addOfflineSupport`, **1.95 s**: `zlib.gzipSync` at level 9
  over every file in every offline bundle, one after another on the main
  thread.
- `spawnSync` **2.7 s** of self time, of which the research builder is 1.86 s:
  a blocking Python child in the middle of the build.
- One regex in `completeShareTags` (`share.mjs`), **0.88 s** of self time:
  `\s*<link ... href="data:...">` with `/gi`. Its leading `\s*` makes the
  engine try a match from every whitespace run of every page, and almost no
  page has a `data:` URI.

## Change

- **Bundle sizes**: each file's gzipped size is computed once with async
  `zlib.gzip` (libuv's thread pool), 8 files in flight, into a map; the
  per-category sums read the map. Same level, same files, same sums.
- **Research builder**: `buildResearchPage` spawns Python with `spawn` and
  returns a promise; `buildSiteInner` starts it right after creating `outDir`
  and awaits it just before reading `research/`, so it runs beside pass 1, pass
  2 and the hub instead of blocking them. A non-zero exit still fails the
  build, with stderr passed through. Checked before moving it: the builder
  reads only `research/` sources and the chrome file (`researchChromeTemplate`
  is static; the counter and feedback URLs are set before `buildSiteInner`
  starts), and no statement between the start and the await reads or writes
  under `outDir/research/` (no venture is named `research`). If an earlier pass
  throws, `buildSite`'s `finally` waits for the child before returning, so a
  test's cleanup cannot race a Python process still writing.
- **Favicon regex**: run only when `/data:/i` matches the page. The pattern
  cannot match without `data:` (case-insensitive), so the result is identical.

## After

Byte-identical output: `diff -rq` of the before and after trees (warm cache)
differs only in `version.json` (its `built_at` changes every run); the offline
cache name is `portfolio-b453e0d89278` in both, and that name hashes every file.

Wall time, same wrapper, warm cache, three alternating before/after pairs
(the sandbox slowed over the series, so the pairs matter more than the
levels):

| pair | before s | after s | saved s |
|---|---:|---:|---:|
| 1 | 44.0 | 35.5 | 8.5 |
| 2 | 46.2 | 41.1 | 5.1 |
| 3 | 48.8 | 43.8 | 5.0 |

Two earlier after runs, right after the 38.9 s before reading: 35.1 s and
35.2 s. So about **4 to 5 s off a 39 to 46 s warm build (10 to 12%)**, every
time the site is built: each Pages deploy, the Pages test step's shared build,
and its child determinism build.

## Verification

See the run record (`prompts/runs/`) for the test command and its output:
`build.test.mjs`, `offline.test.mjs` and `share.test.mjs`, warm cache.

## Not changed, ranked for the next run

1. **Whole-page rewrites.** `writeFileUtf8` is 4.0 s of self time: the chrome,
   sponsor, share-tag, preload and offline passes each read and rewrite all
   ~4,500 pages (97 MB). Fusing two adjacent passes (share tags and preloads
   both run after the chrome) would remove one full read+write; each pass's
   ordering comment says what it must follow, so check those first.
2. `addShareCards` with nothing to draw is 6.8 s of regex: `setContent` in
   `completeShareTags` compiles a `new RegExp` inside the `replace` callback,
   once per meta tag per call; hoisting it is safe and small. `metaContent`
   rescans after every `setContent`.
3. The offline icons (`renderIcon` → `drawMark`, 0.9 s) are drawn on every
   build from fixed geometry; the share-card cache could hold them.
4. `decision_queue.py` runs three times per build (engineering, queue and
   updates pages, about 0.2 to 0.6 s each); one run passed to all three.
5. P063 and P064 remain owner-gated (workflow files).
