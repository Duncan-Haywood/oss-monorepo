# Shift Roster Builder page: seven importers load on first file pick; two league-search ideas measured and dropped (2026-11-24)

Perf track, version 0. Both open perf backlog items (P063, P064) touch workflow
files in `.github/CODEOWNERS` and wait for the owner. Under the new north star
(goals.md, "North star: $10k MRR") this run aimed at subscription products
(`portfolio/monetization/LICENSING_TRANSITION.md`: league-schedule-generator and
shift-roster-builder are two of the eight).

## Part 1: the league search (item 3), two dead ends

### Reading

`python3 platform/ci/run_venture_tests.py --times 25`: league-schedule-generator
(627 s) and shift-roster-builder (571 s) are the two slowest suites.
Run here alone, both suites passed: 5 min 58 s and 5 min 19 s wall, two at a time
on 4 cores. `python3 platform/ci/suite_file_times.py league-schedule-generator
--jobs 2`: `bowling.test.mjs` 106 s, `floor-priced.test.mjs` 100 s. Within
`floor-priced`, one test ("floorTable.balanced gives leastBreaks' balanced least
...") took 34.7 s. Phase timing showed 57.7 s of its work is 30 calls to
`carryOverTry(n, i, { seed: 1, weighted: 8 })` (n = 8, 9, 12, 13, 14; tries 0 to
5) and 56 ms everything else. So the cost is the season search itself, which the
page also runs.

Bench: those 30 tries, the results hashed (`c869bf4e8b7a5cad`). Per size:
8 teams 1.6 s, 9: 11.3 s, 12: 19.9 s, 13: 9.2 s, 14: 15.8 s. `node --cpu-prof`
on 9 and 12 (30.4 s): `coeOf` 10.3 s self, `mixed` 4.1 s, `anneal` 3.8 s,
`teamSwapRounds` 3.3 s; `withSearchMemo` around each try changed nothing, so
no try repeats a search.

### Idea 1: carry-over counted move by move (dropped)

A `coeTracker` held the pair counts of the current timetable and, per annealing
move, took away the old carry-over steps around the changed rounds and added
the new ones (byes and the cyclic wrap included). It was exact: the bench hash
was identical, and a random-move test matched `coeOf` on 12,800 moves, kept or
undone. It was also **2.4 times slower** (136 s against 58 s over the 30 tries;
`apply` alone 14 s on 9 teams). The reason: `coeOf` already stops early.
It passes the annealer's acceptance limit (`rand.peek`) and bails once the
remaining teams' least possible carry-over pushes the count over it. Most moves
are rejected after a few teams. At league sizes a season has about as many
rounds as teams (R = N − 1), so a team swap touches a few teams across most
rounds and a round swap touches every team. The delta then has as many
steps as a full count, plus the bookkeeping. The tracker would pay only where
R ≫ N, which the product does not run. The code is not in the tree.

### Idea 2: count carry-over before the venue pass (dropped)

In the break-weighted pass, `mixed` runs `greedyBreaks` on every move and then
`coeOf(…, limit − breaks)`. Breaks are never negative, so counting carry-over
first against the whole limit and skipping `greedyBreaks` when that alone is
over keeps every decision (same hash). It was **15% slower** on 9 and 12
teams (33.4 s against 29.1 s, run back to back). The tighter `limit − breaks`
stops `coeOf` much sooner than the full limit, and few moves are rejected on
carry-over alone, so the venue pass ran anyway.

## Part 2: the shift roster page (item 4), shipped

### Reading (before)

`node platform/perf/module-weight.mjs .`: shift-roster-builder is 178 kB gzip over
13 files. `calc.mjs` is 117 kB of that and is needed to build a roster. The page
statically imported seven schedule and staff importers (CSV, 7shifts, When I
Work, Square, Deputy, Deputy staff): **about 46 kB gzip, a quarter of the
script**. They are used only inside the two file inputs' `change` handlers.

Throttled load (`/tmp` bench script, below): local gzip server, Chromium,
150 ms RTT, 1.6 Mbit/s, CPU 4x slower, cache off, time to
`domContentLoadedEventEnd` (module scripts and their static imports have run).
7 runs, median: **1,731 ms** (1,757 ms in a second set), 14 files, 214 kB on
the wire. The local page has no `modulepreload` links; the Pages build adds
them for static imports, so the live page fetches these in parallel but still
downloads and parses them before the form works.

### Change (`ventures/shift-roster-builder/index.html`)

The seven static imports became two memoised loaders through the same
`onDemand` helper as the league and XER pages (a failed load clears the memo, so
picking the file again retries). The staff handler awaits the file texts and
`staffImporters()` together, and the shift handler does the same with
`shiftImporters()`. The shift loader's module stays in `shiftsMod` for the
location and family pickers, which re-read the file without another upload. A
failed load says so in the form status line.

Kept static, on purpose: `staffpack.mjs` (3 kB; the paid staff pack's button
calls `window.open`, and an `await` before it risks the popup blocker),
`licence.mjs` and `checkout.mjs` (under 1 kB each), `calc.mjs`.

### Verification

- **Same answers.** A Playwright script loaded the old page (`HEAD`'s
  `index.html` beside the same modules) and the new one, chose seven file sets,
  and compared the status line, both textareas and both pickers' options:
  staff CSV, Deputy staff JSON (3 files), shift CSV with two locations (then
  one location picked), 7shifts JSON (3), When I Work JSON (3, then a location
  picked), Square JSON (3), Deputy rosters JSON (2). **7 of 7 identical**, no
  page errors. Not driven: the 7shifts staff JSON path (`import7shiftsStaff`).
  It comes from `import-7shifts.mjs`, which the shift path above loaded through
  the same loader. The new test checks the name is exported.
- **Tests.** `page.test.mjs` pins the static import list without the importers,
  checks the dynamic imports are exactly the seven local modules, and checks
  every name the two handlers destructure is exported by the modules its loader
  fetches. It also checks no importer name is used anywhere else in the page.
  `python3 platform/ci/run_venture_tests.py shift-roster-builder`: see the run
  record's notes.

### After

| median of 7, throttled | before | after |
|---|---:|---:|
| static graph, gzip (`module-exclusive.mjs`) | 178 kB, 13 files | **133 kB, 6 files** |
| files fetched by load | 14 | **7** |
| bytes on the wire | 214 kB | **167 kB** |
| time to DOMContentLoaded | 1,731 ms | **1,404 ms (−19%)** |

The importers now cost one round trip on the first file pick (all seven,
parallel, about 46 kB), which happens once per visit and only for people
switching from another scheduler.

## Not changed, ranked for the next run

1. **`calc.mjs` is 117 kB gzip** and everything on the page reads it. The page
   could build on the worker (`roster-worker.mjs` exists) and load the
   report-only helpers (tip pool, ICS, messages, staff pack text) on demand.
   That means splitting a 6,000-line module, so it is a product change.
2. **League search**: neither the incremental count nor the reordered venue
   pass helps (above). What is left in `anneal` is `bestOpp = opp.map(…)` on
   each new best and the RNG. The 11 earlier passes and these two point the
   same way: the search is tight at these sizes, and suite time falls only by
   doing fewer searches.
3. **`floor-priced.test.mjs`'s balanced test** spends 34.7 s on 30 searched
   seasons that are only inputs to a 56 ms check. Stored fixtures would cut it
   to under a second. That changes how the test gets its inputs, so it needs
   someone to decide the fixtures stay representative.
4. P063 and P064 remain owner-gated (workflow files).

## Bench script (load)

`node load.cjs <dir> 7` serves `<dir>` with gzip on 127.0.0.1, aborts every
other host, sets CDP `Network.emulateNetworkConditions` (150 ms, 1.6 Mbit/s
down) and `Emulation.setCPUThrottlingRate` 4, cache disabled, and reads
`performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd` per
run. It is the method of `xer-schedule-check-page-perf-2026-11-23.md`, with
DOMContentLoaded in place of the example button, because this page builds no
roster on load.
