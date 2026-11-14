# Pages build, 2026-11-14: the title, sponsor/notice and share passes in one walk

Perf track. Both open perf backlog items (P063, P064) touch workflow files and
still wait for the owner. Took item 2 of "Not changed" in
[`pages-build-perf-2026-11-13-share-data-icon-scan.md`](pages-build-perf-2026-11-13-share-data-icon-scan.md)
("whole-page rewrites ... are still the larger lever").

## Pool reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-14 19:08Z to
20:11Z): 550 jobs, 452.5 job-minutes. Portfolio Pages is the largest workflow
(178.3 min over 115 jobs). `--steps 30` over 300 runs: "Test the site builder"
21.4 min (130 s median), "Build the site" 11.5 min over 14 jobs (54 s median).
Every one of those is a full build, and the site suite runs several more.

Also read this run, nothing to change: per-file `node --test` timings of 11
venture suites (434 files). All but one file took under 1.3 s; the outlier,
`babysitting-business-kit/e2e.test.mjs` (5.8 s), drives Chromium and skips on
CI's venture runner, which has no browser.

## Profile

Warm card cache (`PAGES_CARD_CACHE` in the scratchpad, as CI sets it), 4-core
container, ext4: a full build is 52 to 57 s. `node --cpu-prof` of one (56.1 s
sampled), self time by function, then the callers of the top one:

| | s |
|---|---:|
| `writeFileUtf8`, all callers | **8.11** |
| of which the share-tag pass (`addShareCards`) | 4.38 |
| of which the offline head injection (`rewritePagesSync`) | 2.23 |
| of which the sponsor/notice pass (`rewritePagesSync`) | 1.33 |
| idle | 5.01 |
| garbage collector | 3.92 |

The site has 9,784 HTML pages, 254 MB. Between the chrome pass and the
preloads, three passes each read every page: the sponsor/notice pass (and
wrote 9,780 of them), the title-clash check (`fixPostTitleClashes`, reads all,
rewrites the rare post that reused a tool's title), and the share-tag pass
(wrote 9,783). That is three full reads and two full writes of 254 MB.

## Change

`finishPagesInOneWalk` (`build.mjs`) loads the pages once (`loadPages`),
resolves title clashes on that map, and per page applies the retitle, the
sponsor marker, the notice and the share tags, writing the page only if the
result differs from what it read. Then it draws the planned cards. `share.mjs`
gains `shareTagsFor` (one page's share step, no file access) and
`drawPlannedCards`, which `addShareCards` now uses too; its CLI and the three
old functions are unchanged and still exported.

The order changed: the retitle used to run after the sponsor and notice pass.
The two commute. The retitle replaces `<title>` and `content="<old title>"`
values; the marker is an attribute on the Sponsors link and the notice is a
fixed `<noscript>` after `<body>`, and neither changes a title or an `<h1>`.
The returned `retitled[].html` is set to the post-notice page, as the old pass
reported it.

## Verification

- **Same bytes.** A full warm build before and after: `diff -rq` reports only
  `version.json` (build time; two unchanged builds differ the same way). The
  build logs match line for line.
- **The passes alone**, on a snapshot of the site taken just before them (an
  env-gated `cpSync`, reverted, not committed), copied fresh for each run,
  alternated: old 13.9, 15.5, 13.0 s; new 11.3, 11.6, 11.6 s. Median **13.9 s
  to 11.6 s**, 2.3 s per build. The old and new trees are identical
  (`diff -rq`), with the same counts (9,780 sponsored, 2,305 notices, 1
  retitle, 5,867 cards, 9,783 share-tag pages).
- New test in `noscript-notice.test.mjs`: a fixture with a title clash, sponsor
  links, scripted controls and one page on the site-wide card; the one walk
  and the three passes in turn give deep-equal results, the same log lines and
  identical files, card included. It caught the `retitled[].html` difference
  above before the fix.
- Full site suite: see the run record's `notes`.

The whole-build wall time is too noisy here (52 to 57 s between unchanged
builds) to show 2.3 s; the snapshot bench is the number to trust.

## Not changed, ranked for the next run

1. **The offline head injection** (2.2 s of writes): it reads and rewrites
   every page after `addModulePreloads`, which itself reads every page. It must
   hash the finished pages to name the cache, so folding it in means hashing
   in memory before the write; check `addOfflineSupport`'s ordering comments.
2. **`addModulePreloads` reads all 9,784 pages to rewrite 241.** The pages
   with a module script could be listed during the one walk and handed over;
   `moveAudioToCdn` runs between them when `--audio-cdn` is set, and rewrites
   pages, so the list has to survive or be refreshed.
3. Garbage collection is 3.9 s; holding the whole 254 MB site as strings in
   `loadPages` is part of it. Not measured separately.
4. P063 and P064 remain owner-gated (workflow files).
