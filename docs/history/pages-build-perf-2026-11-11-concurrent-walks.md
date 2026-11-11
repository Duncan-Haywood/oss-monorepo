# Pages build, 2026-11-11: walk the built tree with concurrent `readdir`

Perf track, item 3 of `prompts/perf/prompt-0.md` (the slowest local step a
session waits on), taking item 2 of the "not changed" list in
[`pages-build-perf-2026-11-11-parallel-copy.md`](pages-build-perf-2026-11-11-parallel-copy.md).
Both open perf backlog items (P063, P064) are still owner-gated (workflow
files).

## Reading

`listFiles` (`platform/pages/build.mjs`), `publishedPages` (same file) and
`listHtml` (`platform/pages/share.mjs`) walked a tree with one `readdir`
awaited at a time: the same pattern the copy pass had, so three of libuv's
four I/O threads sat idle. A build calls them over the whole output about six
times (`markSponsorLinksIn`, `addNoscriptNoticesIn`, `addShareCards`,
`offlineCacheName`, `addOfflineSupport`, `addModulePreloads`) and over each
surface several more (`repairLinks`, `discoverGuides`, `addSiteChrome`,
`collectGuidePages`, `collectOfflineBundle`, clause pages).

## Change

Each walker reads its directory, then maps the entries through
`Promise.all`: a subdirectory recurses, a file becomes a one-element list,
then `.flat()`. `Promise.all` returns results in entry order, not finish
order, so the list is exactly the serial depth-first one. `publishedPages`
sorts its result as before. No concurrency limit: the walk is bounded by the
tree's fan-out, and libuv queues the `readdir` calls on its pool.

## Measurement

A full walk of the built site (25,196 files, 4 cores), serial vs concurrent,
same process, script in the PR's session scratchpad (`walk-bench.mjs`, a copy
of both functions):

| | serial | concurrent |
|---|---:|---:|
| warm page cache, three runs | 370, 377, 381 ms | 222, 194, 199 ms |
| page cache dropped | 774 ms | 268 ms |

Lists compared with `JSON.stringify` equality: identical.

So about 175 ms per full walk warm and about 500 ms cold, roughly 1 s (warm)
to 3 s (cold) across the six full-output walks of one build, plus the
per-surface walks. Whole build, one pair, run one after the other (noisy, the
second run had a warmer page cache): 141.2 s before, 128.3 s after. Do not
read the 13 s as this change's effect; the walk numbers above are the
measurement.

## Verification

- `diff -r` of a full build before and after: every page identical. The
  only differences are files derived from the new commit (`changelog/`,
  `updates/`, `version.json`, and `sw.js`'s cache name, which is keyed on
  the sha).
- `node --test preload.test.mjs share.test.mjs clauses.test.mjs`: 66 pass.
- `node --test build.test.mjs only-slugs.test.mjs offline.test.mjs`: 329 of
  329 pass (321 s).

## Not changed, ranked for the next run

1. Pass 2 of `buildSiteInner` (5.7 s cold), split as the parallel-copy note
   says: every `repairLinks` first, then sitemap and `llms.txt` writes.
2. The several passes that each walk the whole output and then read every
   HTML file (`markSponsorLinksIn`, `addNoscriptNoticesIn`, `addShareCards`,
   `addModulePreloads`) could share one walk; check whether each reads its
   files serially too (`addNoscriptNoticesIn` and `markSponsorLinksIn` use a
   `for … await` loop).
3. `optout.mjs` and `sideways.mjs` keep their own synchronous
   `publishedPages`; they are separate scripts, not on the build path.
4. P063 and P064, once the owner applies them.
