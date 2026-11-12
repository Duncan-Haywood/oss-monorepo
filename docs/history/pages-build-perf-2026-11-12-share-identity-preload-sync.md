# Pages build, 2026-11-12: share cards, title clashes and module preloads read pages sync

Perf track. Takes item 2 of "Not changed" in
[`pages-build-perf-2026-11-12-html-passes-sync.md`](pages-build-perf-2026-11-12-html-passes-sync.md):
the other `fs.promises` loops over every page. Both open perf backlog items
(P063, P064) touch workflow files and still wait for the owner.

## Reading (before)

Full build in this container (4 cores, Node v22.23.4, warm caches):
`node platform/pages/build.mjs --out=<dir>`, 8,831 HTML pages.

Three passes in `buildSite` still walked the site with `fs.promises.readdir`
and read every page with `mapLimit(files, 32, fs.readFile)`:

- `loadPages` (`page-identity.mjs`), behind `fixPostTitleClashes`;
- `addShareCards` (`share.mjs`), including its own recursive `listHtml`;
- `addModulePreloads` (`preload.mjs`), page reads and module reads.

A scratch script walking and reading the same 8,831 pages: promise walk + 32
reads in flight 1,562 / 1,672 / 1,733 ms; `readdirSync` + `readFileSync`
721 / 955 / 645 ms; the same paths in the same order, same content hash.

## Change

Each of the three passes reads (and, where it rewrites, writes) one page after
another with `readdirSync` / `readFileSync` / `writeFileSync`. Walk order,
result order and the returned values are unchanged (`loadPages` still returns
a Map in walk order and stays `async` to its callers; `addModulePreloads`
still returns the same sums and max). `buildSite` awaits each pass with
nothing in flight beside it, so blocking the event loop holds nothing up.
`moduleGraph` still `await`s `readModule`, which now returns synchronously.

## After

Each pass, old module vs new, on the same finished tree, three runs each, ms:

| pass | before | after |
|---|---:|---:|
| `loadPages` | 1,429 / 1,511 / 1,550 | **720 / 654 / 630** |
| `addShareCards` | 4,719 / 4,592 / 4,423 | **3,526 / 3,498 / 3,431** |
| `addModulePreloads` | 1,998 / 1,749 / 1,996 | **938 / 982 / 1,008** |

About 2.9 s a build. Full builds, interleaved new/old/new/old with a `git
stash` between: **88.6**, 91.5, **88.3**, 91.6 s; mean 91.5 s to 88.4 s
(-3.1 s, -3.4%). Every Pages deploy and the shared build in `build.test.mjs`
pay this.

## Verification

- `diff -rq` of the second old and second new builds: only `version.json`
  differs (its `built_at`).
- `node --test page-identity.test.mjs preload.test.mjs share.test.mjs`:
  49 of 49 pass.
- `node --test build.test.mjs`: 311 of 311 pass (220 s wall). A first run
  (with `check.test.mjs`, 408 tests) failed one, `an identical build produces
  an identical cache name`, because this run created a post in `docs/posts/`
  while the in-process and child builds were reading the repository; the
  test alone passed on both old and new code, and the full file passed on a
  quiet tree. Don't edit the tree while that suite runs.

## Not changed, ranked for the next run

1. **`addShareCards` is still ~3.5 s with zero cards to draw**: the time is
   now CPU in `pageCardPlan` / `completeShareTags` (regex work per page).
   Profile it with `--cpu-prof` on a finished tree.
2. `listFiles` in `build.mjs` (used by `addModulePreloads` and the
   sponsor/offline passes) is still a promise walk; PR #14702 (open) makes it
   concurrent instead. Measure a sync walk against it before choosing.
3. The `renderCards` cache copy loop (`fs.copyFile` + `fs.utimes`, 32 in
   flight) only matters on a build that draws many cards; not measured.
4. P063 and P064 remain owner-gated (workflow files).
