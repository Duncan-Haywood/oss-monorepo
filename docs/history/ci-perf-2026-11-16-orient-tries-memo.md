# CI perf, 2026-11-16: league-schedule-generator orient tests, 45.3 s to 39.7 s, and where the suite's repeated searches come from

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/`, which CODEOWNERS holds for the owner. The slowest venture suite in
`platform/ci/venture_suite_times.json` is still league-schedule-generator
(626.8 s under the four-suite pool, taken 2026-11-16T03:01Z).

## Reading

Each `*.test.mjs` timed alone with `node --test <file>`, four files at a
time, on this 4-core container, main at `9aaa9c5e0`: floor-priced 92.2 s,
starter 49.6, orient 47.4, carryover 46.6, capped-breaks 38.8, doubleheader
35.7, best-of-k 26.3, fuzz-build 25.1, frontier-pick 22.5, polish 22.3,
squeeze 13.8, calc 13.6, the other 13 at 5 s or less each.

ai-bookkeeper (115.6 s, fifth) was read first and left alone: 97 s summed
over about 370 files, the slowest 3.9 s. It is process start per file, and
only `--experimental-test-isolation=none` would cut that (already listed in
`ci-perf-2026-11-15-shed-auto-probe-peak-warning.md`).

### Where the league time goes: `carryOverTry`

A temporary log line in `carryOverTry` (`carryover.mjs`; the file was
restored and `git status` was clean afterwards) recorded every call with its
arguments, process and milliseconds while all 25 files ran. That was 390
calls. Seconds inside `carryOverTry`, per file:

| file | s in `carryOverTry` | file wall s |
|---|---:|---:|
| floor-priced | 86.8 | 92.2 |
| orient | 44.4 | 47.4 |
| capped-breaks | 35.1 | 38.8 |
| best-of-k | 24.4 | 26.3 |
| polish | 20.4 | 22.3 |
| frontier-pick | 20.3 | 22.5 |
| carryover | 11.6 | 46.6 |
| squeeze | 4.4 | 13.8 |

Calls with the same arguments in the same process, beyond the first, add up
to about 48 s: frontier-pick 12.9, floor-priced 12.1, capped-breaks 7.2,
best-of-k 7.2, orient 5.3, polish 2.4, squeeze 1.0. Outside orient, every
repeat comes from inside `bestCarryOverRounds` or `buildSchedule`, the
functions those tests exist to check: serial against pooled, a pick against
no pick, the same settings run twice to show they give the same answer.
Sharing those would turn a check into a lookup, so they were left alone.

orient is different. `orient.mjs` (the break programme) is what it tests, and
the tries are only its inputs: 44.4 of 47.4 s builds timetables, and the
programme itself takes about 3 s. Two inputs were built twice:

| try | first use | second use | s each |
|---|---|---|---:|
| 14 teams, try 3, home and away, seed 1, weighted 8 | pairLeastBreaks MaxSAT proofs | polishSeasonVenues regrounds 1,014 / 46 | 4.4 |
| 20 teams, try 0, seed 1, weighted 8 | 360 timetable: 50 breaks | polishSeasonVenues 18 and 20 teams | 0.9 |

## Change

`orient.test.mjs`'s `carryOverTry` wrapper (which already rebuilds the
14-team tries without `TIMETABLES[14]`) keeps a file-local `Map` keyed on
`n`, `i` and the options as JSON. Each caller gets a `structuredClone` of the
stored try, so a test that changes its rounds or venues cannot change another
test's input. Nothing in `orient.mjs`, `carryover.mjs` or any assertion
changed.

## Verification

`node --test orient.test.mjs`, twice each, one file alone, same container:

| | run 1 | run 2 | tests |
|---|---:|---:|---|
| before (`git stash`) | 45.1 s | 45.5 s | 18 pass, 0 fail |
| after | 40.0 s | 39.5 s | 18 pass, 0 fail |

That is 5.6 s (12%) off this file. The two shared tries were the only
repeats in it, and 5.3 s of repeated search is what the log measured.

## Not changed, ranked for the next run

1. **orient's remaining 39 s of input tries.** The big ones: 12 teams try 0
   home and away (5.6 s), 14 teams tries 3 and 7 home and away (4.4 s each),
   9 teams try 0 home and away (3.0 s), 10 teams (2.3 s), 18 teams (2.1 s). Committed timetables
   (`eval/orient-maxsat-dump.mjs` already writes them) would take the file
   to about 4 s. But the tests also assert each try's carry-over and breaks
   (`t.coe === 1014`, `t.breaks === 46`), which pins the search as well as
   the input. A fixture drops that pin unless a test elsewhere keeps it, so
   it needs a decision about where the search's seeded output is pinned, not
   only a perf change.
2. **The 48 s of same-argument tries in other files.** They are the subjects
   (see above). A memo inside `carryOverTry` would remove them, but the page
   already caches tries by settings (`index.html`, "cached by the settings
   it depends on"), so users gain nothing, and the determinism checks would
   pass trivially.
3. ai-bookkeeper's per-file process start (see Reading).
4. P063 and P064 are still owner-gated.
