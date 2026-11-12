# Pages build: whole-site HTML passes with sync reads, and two negative league-scheduler results (2026-11-12)

Perf track. Both open perf backlog items (P063, P064) touch workflow files and
wait for the owner, so the run took ranked "Not changed" items from today's
history docs: first item 1 of
[`ci-perf-2026-11-12-carry-over-scratch.md`](ci-perf-2026-11-12-carry-over-scratch.md)
(an incremental carry-over delta in the league scheduler's `anneal`), which
measured as a loss and was not landed, then item 1 of
[`pages-build-perf-2026-11-12-cache-name-sync-reads.md`](pages-build-perf-2026-11-12-cache-name-sync-reads.md)
(the other whole-site passes in `build.mjs` that read every page through
`fs.promises`), which landed.

## 1. Landed: the sponsor/notice pass and the offline head injection read and write sync

### Reading (before)

A full build in this container (4 cores): `node platform/pages/build.mjs
--out=<dir>`, **158 s**, 8,784 HTML pages, 1.2 GB.

A scratch script (not committed) copies that finished tree and times each pass
as `build.mjs` runs it, `mapLimit(files, 32, async … fs.readFile …
fs.writeFile …)`, against the same work with `readFileSync`/`writeFileSync` one
file after another. Two runs each, ms, listing included in both:

| pass over 8,784 pages | `fs.promises`, 32 in flight | sync, one at a time |
|---|---:|---:|
| `markSponsorLinks` + `addNoscriptNotice` (reads all, writes few) | 2,988 / 2,930 | **1,686 / 1,642** |
| `injectOfflineSupport` (reads all) | 1,826 / 2,066 | **1,003 / 1,146** |
| a stand-in rewrite that writes every page | 2,671 / 2,680 | 1,990 / 2,257 |

Same cause as `offlineCacheName` this morning: the promise API's per-file
overhead on mostly small files, not the disk. The trees after both forms hash
the same (`347b35269d2b3d9b` over every HTML page).

### Change (`platform/pages/build.mjs`)

- New `rewritePagesSync(files, rewrite)`: reads each file, writes it back only
  when the rewrite changed it, returns the files written, in input order.
- `markSponsorsAndNoscriptIn`, `rewriteHtmlIn` (behind `markSponsorLinksIn`
  and `addNoscriptNoticesIn`) and the head-injection loop in
  `addOfflineSupport` use it. The returned lists and the injected count are the
  same as before (input order, `listFiles` order). The one behaviour change: a
  page whose injection reports `injected` but returns identical bytes is no
  longer rewritten with the same bytes.
- `buildSite` awaits these passes one after another with nothing in flight
  beside them, so blocking the event loop for a second holds nothing up.

### After and verification

- **Same output.** A second full build with the change, `diff -rq` against the
  before build: the only differing file is `version.json` (the build time).
  Every page, `sw.js` and its cache name are byte-identical.
- Full build 158 s to **153 s** (one run each; build-to-build noise here is a
  few seconds, so the pass-level numbers above are the reliable measure:
  about 2.2 s saved per build, every Pages deploy and every test run that
  builds the site).
- Tests: `node --test noscript-notice.test.mjs offline.test.mjs` exit 0;
  `node --test build.test.mjs` exit 0 (307 s wall, this container).

## 2. Not landed: an incremental carry-over delta in `anneal` (league scheduler)

The previous doc ranked it "biggest lever left". Built and measured, it is a
loss at every league size, so it was reverted.

- **What was tried.** A `coeTracker` holding the pair counts: before each move
  the steps of the touched teams' seasons next to a changed cell are taken
  out, after the move they are put back (a step whose rounds include no
  changed cell is the same before and after, byes included). `anneal` got a
  `coe: { n, cyclic }` option and cost closures of the form
  `(coe, opp) => coe + …`, keeping the same random draws and the same float
  expressions.
- **Same answers:** yes. A workload script (32 eight-team tries single and
  double, `lowCarryOverRounds` at 5 to 14 teams plain and weighted, cyclic and
  not, doubles at 5 to 11 teams, six 12-team double tries) hashed
  `1ba26969c8dddf41` before and after.
- **Slower:** the workload went from 75.5 s to 175 s with a closure-based
  tracker, and a tight typed-array version still lost (four 8-team tries 1.5 s
  to 2.7 s). Per league size, `lowCarryOverRounds` plain plus weighted,
  `field: false`, before / after, s: 10 teams 1.12 / 1.98, 14 1.07 / 1.73,
  18 1.39 / 1.32, 22 1.47 / 1.55, 30 1.69 / 1.76, 40 3.06 / 2.87.
- **Why.** The iteration budget is `4e7 / N²`, so each step's full recount is
  about `N²` cheap reads by design. A delta has to find each touched team's
  neighbouring real games (skipping byes) for every changed cell, twice per
  move and four times on a rejected one; a round swap touches every team. At
  8 to 14 teams that bookkeeping costs more than the recount it replaces, and
  at 40 teams it only breaks even.
- **Also tried:** `coeOf` round by round instead of team by team (each round's
  array read once). Same hash, 76.7 s mean against 74.9 s: no gain, reverted.

## Not changed, ranked for the next run

1. **The shared build is still most of `build.test.mjs`.** Profile `buildSite`
   with `node --cpu-prof` on a warm share-card cache (this run did not).
2. Other `fs.promises` loops over many small files in `build.mjs` and
   `share.mjs` (`addShareCards` reads every page through `mapLimit`): the
   same per-file overhead probably applies; measure each before changing it.
3. League scheduler: drop the incremental delta idea. What is left in the
   profile is spread across `assignVenuesOnce`, `greedyBreaks`,
   `teamSwapRounds` and `anneal` itself, none over about 15%.
4. P063 and P064 remain owner-gated.
