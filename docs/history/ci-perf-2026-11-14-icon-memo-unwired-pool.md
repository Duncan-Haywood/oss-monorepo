# CI perf 2026-11-14: icon memo and one pool for the unwired checks

Perf track. Both open perf backlog items (P063, P064) touch workflow files and
wait for the owner, so this run took a fresh pool reading (step 2 of the perf
prompt).

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --top 25` (2026-11-14 14:23Z to
14:54Z): 292 jobs, 284.9 job-minutes, checkout 112.0. ventures tests: 14 jobs,
33.4 min, heaviest step "node --test in each touched venture" (19.6 min).

That step's job log on main (run 43606574945, BASE 452e975da) showed the
venture suites themselves were small: einvoice-preflight 7.7 s and
ics-calendar-check 2.1 s, done by 14:49:22. The step ended at 14:50:32, so
**70 s of it went to `unwired_checks.run_everything()`** (161 unwired
checks, Python suites, node suites and `doc_index.py check`). That runs on every
PR that reaches ventures tests. The step was 77 to 117 s across the five runs
read.

A local bench (4 cores; scratch script wrapping each runner with a timer, phases
timed separately) gave the same total: **70.3 s**, phases checks 20.2 s,
suites 21.3 s, node suites 28.8 s, extra 0.1 s; item times summed to 305 s.
Top items: `platform/distribution/android.test.mjs` 28.8 s (this item alone
set the node phase's length), `test_concurrency_tax.py` 15.9 s,
`hub/content.test.mjs` 15.1 s, `desktop.test.mjs` 13.7 s,
`check_calendar_dates.py` 11.7 s.

## Profile

`node --cpu-prof` over `android.mjs`'s `plan()` (23.1 s, 1,284 ventures
qualify): self time `drawMark` 12.6 s, zlib `processChunkSync` 4.9 s,
`encodePng` 3.0 s, so about 21 s of the 23 s was drawing and encoding the
icon. `plan()` calls `buildAndroid` per venture, and each call renders
`renderIcon({ size: 512 })`, the same bytes every time. `desktop.test.mjs`
(profile via `NODE_OPTIONS=--cpu-prof`) was led by `markSample`/`drawMark`/zlib
too. `webext.mjs` (four sizes per venture) and `ios.mjs` (a 1024 px opaque icon
per venture) have the same pattern; `unwired_checks.NODE_SLOW` skipped
`ios.test.mjs` on every PR as "over 120 s".

## Change

1. `platform/pages/offline.mjs`: `renderIcon` caches each
   (size, maskable, opaque) variant in a module-level Map and returns
   `Buffer.from(cached)`, a fresh copy per call, so a caller that writes into its
   buffer cannot change the next caller's icon. `renderMarkIcon` reads nothing
   but its options. New test in `offline.test.mjs`: the memo returns the drawn
   bytes for each variant, and zeroing one copy leaves the next intact.
2. `platform/ci/unwired_checks.py`: `run_everything` puts all four kinds in one
   pool (`run_mixed`, each item with its own runner; a timeout is re-run alone
   with that runner, as before). Node suites and Python suites are submitted
   first, since the long items are there. `run_all` had no other caller and is
   gone; its test now mocks `run_mixed`, and a new test pins one pool, each
   runner kept, the solo re-run and `checks_only`.
3. `NODE_SLOW` is empty: `ios.test.mjs` runs on every PR again.

## Verification

- **Same bytes.** A scratch script hashed every file `buildAndroid`,
  `buildExtension` and `buildIos` produce for the first 150 ventures (sorted file
  names and contents, skips included), old `offline.mjs` against new: both
  `b1a76fec9c345317f94a42c96783b6e5770bae5c68df378543895a3541f959ff`. Time
  for that sample: 254.1 s old, 4.4 s new.
- Suites: `android.test.mjs` 6/6 pass, `desktop.test.mjs` 11/11,
  `ios.test.mjs` 8/8, `webext.test.mjs` 9/9, `offline.test.mjs` 13/13,
  `test_unwired_checks` 18/18.

## Numbers (4-core container, wall clock)

| | before | after |
|---|---|---|
| android.test.mjs | 23.4 s | 1.9 s |
| desktop.test.mjs | 10.2 s | 6.9 s |
| ios.test.mjs | over 724 s (7 of 8 tests done; the catalogue test stopped by hand) | 5.8 s (unskipped) |
| `run_everything()` | 70.3 s | 42.0 s and 42.8 s (two runs), ios.test.mjs now included |

Before was the per-phase bench above; after is `run_everything()` itself,
timed in-process, same container. The CI step should drop by a similar
share (runner: 4 vCPU).

## Not changed, ranked for the next run

1. **`platform/distribution/hub/content.test.mjs`** (13 to 15 s): self time in
   `norm` (2.6 s), `glen` (1.7 s) and `plain` (1.2 s) in `hub/content.mjs`,
   text normalisation over every post, most likely repeated per test.
2. **`test_concurrency_tax.py`** (15.9 s) and **`check_calendar_dates.py`**
   (11.7 s), both unprofiled.
3. **`test_research_homepage_publish.py`** (10 s), `test_no_dead_pages_base.py`
   (9.4 s), `test_browser_checks.py` (8.5 s).
4. P063 and P064 remain owner-gated (workflow files).
