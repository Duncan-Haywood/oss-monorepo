# Pages build perf, 2026-11-12: three per-page recomputations in the blog renderer

Perf track. Takes item 1 of "Not changed" in
[`pages-test-perf-2026-11-12-shared-walk-memo.md`](pages-test-perf-2026-11-12-shared-walk-memo.md):
the shared build is about 80% of `build.test.mjs`, so profile `buildSite`
itself with `node --cpu-prof` on a warm cache. Both open perf backlog items
(P063, P064) touch workflow files and still wait for the owner.

## Reading and profile (before)

`node platform/pages/build.mjs --out=<dir>` in this container (4 cores),
once cold to warm the caches, then once under `--cpu-prof`. Self time summed
per function (a 20-line script over the `.cpuprofile`):

| self ms | function |
|---:|---|
| 52,934 | (idle: child processes, workers, I/O) |
| 3,994 | `linkSiblings` (`writing.mjs`) |
| 2,961 | `esc` (`devlog/markdown.mjs`) |
| 2,155 | `dayNumber` (`writing.mjs`) |
| 1,955 | `longDate` (`writing.mjs`) |
| 1,513 | RegExp `[&<>"']` (inside `esc`) |

Busy (non-idle) time 53.9 s of 106.9 s wall. The four `writing.mjs` rows
(about 12.6 s together) were the largest pieces of our own code, and all were
the same work redone on every one of about 3,700 post pages:

1. **`linkSiblings`** rebuilt its source-to-page map from the whole posts
   array for every post page: 3,700 x 3,700 entries, each with two `esc`
   calls (about 27 million). The map depends only on the posts array.
2. **`relatedPosts`** sorts by distance in days, and its comparator parsed
   both posts' dates with `Date.parse` on every comparison. The fill step
   sorts the whole topic (and the rest of the catalogue) when fewer than five
   posts share a tag or word.
3. **`longDate`** called `toLocaleDateString` (a fresh Intl formatter) for
   every date on every index entry and every related link: a few hundred
   distinct dates, formatted tens of thousands of times.

## Change (`platform/pages/writing.mjs`)

- `siblingTargets(posts)` builds the map once per posts array (a `WeakMap`,
  as `relatedIndex` already does), rebuilt if the array's length changes.
- `relatedIndex` also stores each post's day number by index; the comparator
  reads `days[i]` (falling back to parsing if an index is missing).
- `longDate` memoises its result per date string.

Same inputs, same outputs: no ordering, tie-break or text changed.

## After

- Profiled, warm, run right after: **91.6 s** wall (106.9 s before); busy
  time **39.5 s** (53.9 s before). None of the four rows is in the top 40 now.
- Unprofiled, interleaved old/new/old/new on the same warm cache:
  108.9, **97.7**, 115.3, **104.2** s. Mean 112.1 s to 100.9 s, **-11 s
  (-10%)** per build. Every Pages build and the shared build in
  `build.test.mjs` pay this.

## Verification

- `diff -rq` of the whole output (26,332 files) before vs after, twice (the
  profiled pair and the unprofiled pair): only `version.json` differs, by its
  `built_at` timestamp.
- `node --test writing.test.mjs writing-backlog.test.mjs`: 41 of 41 pass.

## Not changed, ranked for the next run

1. **Idle is now 57% of the profile** (52 s of 91.5 s). That is the build
   waiting on child processes (`spawnSync` 2.7 s of self time alone), worker
   threads and file I/O. Phase timestamps around `buildSite`'s awaits would
   say which wait is longest; the profile cannot.
2. `openFileHandle` + `close` + `read` + `fstat` (about 8 s together): the
   promise-API per-file overhead measured in
   [`pages-build-perf-2026-11-12-cache-name-sync-reads.md`](pages-build-perf-2026-11-12-cache-name-sync-reads.md).
   The `mapLimit(..., fs.readFile ...)` passes in `rewriteHtmlIn`,
   `markSponsorsAndNoscriptIn` and the offline head injection are the
   candidates; they also write, so measure before switching to sync reads.
3. `metaContent` (`share.mjs`, 1.0 s) and the data-URI favicon regex (0.9 s).
4. P063 and P064 remain owner-gated (workflow files).
