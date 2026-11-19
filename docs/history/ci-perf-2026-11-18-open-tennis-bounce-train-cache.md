# CI perf, 2026-11-18: open-tennis-robots bounce trains cached by the numbers they read

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` and wait for the owner, so this run took the largest non-workflow
consumer after the Pages builder and the shared venture tests.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-18, about
23:40 UTC; 562 jobs, 661 job-minutes):

| workflow | jobs | job-min | median | heaviest step |
|---|---:|---:|---:|---|
| Portfolio Pages | 111 | 208.9 | 136 s | Test the site builder (77.9 m) |
| ventures tests | 28 | 108.3 | 172 s | node --test in each touched venture (79.5 m) |
| Portfolio validate | 35 | 95.4 | 196 s | workflow-runner unit tests (4.6 m) |
| open-tennis-robots CI | 10 | 44.8 | 260 s | CAD checks and committed-package freshness (19.7 m) |

## Profile

`python3 -m unittest discover -s tests` in `ventures/open-tennis-robots/cad`
(build123d absent, so the 58 geometry tests skip; the remaining 83 are the
ones that spend time): **74.0 s** before.

Under `cProfile` (150 s with profiler overhead), cumulative:

| function | calls | tottime | cumtime |
|---|---:|---:|---:|
| `contactor_bounce_train` | 1,899 | 57.2 s | 78.5 s |
| `contactor_inrush` (mostly `precharge_bus`) | 2,201 | 0.0 s | 26.7 s |

So the bounce trains were half the suite, and 21 s of their cumulative time
was `contactor_inrush`, called once per train: `contactor_bounces` asks for
24 trains per load on the same Feeder and each one recomputed it.

The 2026-11-15 note ranked "memoise on the frozen Feeder" as worth at most
15% (1,585 of 1,875 Feeders distinct). Keyed on the numbers the train
actually reads instead (R, L, C, pack voltage, precharge resistor and
residual, bounce window, load, n, open fraction), an instrumented run found
**569 distinct inputs in 1,899 calls**: the rules-catch-bad-changes tests
mutate one field at a time, and almost none of those fields reach the
contactor loop.

## Change

`ventures/open-tennis-robots/cad/otr_cad/params.py`:

- `contactor_bounce_train` calls `_bounce_train(contactor_inrush(), ...)`;
  `contactor_bounces` calls `contactor_inrush()` once and passes it to all
  its trains.
- `_bounce_train` keys a module dict on those ten inputs (floats by
  `float.hex()`, so `0.0` and `-0.0` stay separate keys), runs the unchanged
  integrator on a miss, and returns a `copy.deepcopy` so no caller can edit
  another's result. The dict clears at 4,096 entries.

The integrator body is untouched.

## Verification

- Every one of the suite's 39 `contactor_bounces()` results, re-run on a
  fresh import of the old `params.py` from `HEAD` with the same Feeder
  fields: `repr`-identical (39 of 39).
- New test `test_cached_bounce_trains_match_the_reference_and_stay_private`:
  a cached hit equals the existing bit-exact reference integrator, a caller
  editing its copy does not change the next result, a Feeder differing only in
  a field the train never reads reuses the entry, one differing in the bounce
  window gets its own entry and its own reference answer, and
  `contactor_bounces`' trains equal the reference.
- Whole suite: 141 tests, OK (58 skipped, as before).

## After

Same command, same container: **46.5 s and 47.7 s** (from 74.0 s), a 36%
cut. On CI the step was about 2 min a job, so roughly 45 s a job back.

## Not changed, ranked for the next run

1. **`sleeve_take_up_design` / `_ranges_from`** (29.9 s under the profiler,
   22,907 `_ranges_from` calls) and `az_hose_torque_nm` (1,458 calls) in
   `test_feed_rules_catch_bad_changes`: the same keyed-on-what-it-reads
   count is the first thing to measure.
2. **`precharge_bus`** (19.3 s self, 3,975 calls): now called less often
   through `contactor_inrush`; its remaining callers may repeat inputs too.
3. **`_hose_curve_range_3d` / `_hose_curve_range`** (13.4 s + 6.3 s self).
4. The shut phases themselves: the 2026-11-15 note's matrix-power idea still
   changes floats and needs a tolerance test.
5. P063 and P064 remain owner-gated (workflow files).
