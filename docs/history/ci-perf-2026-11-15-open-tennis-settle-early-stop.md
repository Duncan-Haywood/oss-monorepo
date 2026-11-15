# CI perf, 2026-11-15: open-tennis-robots bounce trains stop settling once the peak is proven

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/` and wait for the owner, so this run took the third-largest
consumer in a fresh pool reading that is not a workflow edit.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25 --steps 30`
(2026-11-15, about 23:10 UTC):

| workflow / job | step | runs | job-min | median |
|---|---|---|---|---|
| Portfolio Pages / test | Test the site builder | 26 | 59.3 | 139 s |
| ventures tests / changed-ventures | node --test in each touched venture | 35 | 48.2 | 69 s |
| open-tennis-robots CI / cad | CAD checks and committed-package freshness | 7 | 29.1 | 282 s |
| Portfolio Pages / build | Build the site | 32 | 23.4 | 48 s |
| open-tennis-robots CI / test | Python tests | 7 | 8.0 | 59 s |

The Pages builder has had more than twenty perf passes this month. The
open-tennis-robots CAD suite had two (`ci-perf-2026-11-14-open-tennis-hose-curve.md`,
`ci-perf-2026-11-15-open-tennis-inline-integrators.md`), and the venture is
getting several product PRs a day.

## Profile

`python3 -m cProfile -m unittest discover -s tests` in `cad/` (this
container, 4 cores, Python 3.11, no build123d, so the 50 solid-building
tests skip): 149 s under the profiler, of which
**`Feeder.contactor_bounce_train` is 91 s cumulative and 73 s self** over
1,875 calls (1,585 distinct argument sets). Next were `sleeve_take_up_design`
(26 s), `contactor_inrush` (23 s), `precharge_bus` (17 s) and
`_hose_curve_range_3d` (14 s).

The 2026-11-15 pass had already inlined the RK4 loop, so the time was the
step count, not call overhead. Per train with the default Feeder: the shut
phases total about 11,000 to 45,000 steps (by open fraction), then a
**settle phase of 16,590 steps** (20 times the slowest time constant at a
60th of the fastest). That phase's end state is never used: the function
breaks out after it and keeps only its peak current. In a traced settle the
peak lands at step 178.

## Change (`cad/otr_cad/params.py`)

The settle phase now runs in blocks of 64 steps and stops once the current
provably cannot reach its peak again.

- In the scaled state `(sqrt(C) v, sqrt(L) i)` the closed-contact ODE is a
  skew part plus damping (`-1/(Rp C)` and `-R/L` on the diagonal), so the
  energy `C ev^2 + L ei^2` of the deviation from equilibrium never grows in
  the ODE. `_settle_contracts` forms the RK4 step matrix
  `I + X + X^2/2 + X^3/6 + X^4/24` (`X = hA`) and checks that its largest
  singular value is at most `1 - 1e-12` (default Feeder: `1 - 1.6e-5` with
  the precharge resistor, `1 - 2.8e-8` without). If it is not, the phase
  runs in full as before.
- While it holds, `|i - i_eq| <= sqrt(C/L ev^2 + ei^2)` at every later step.
  After each block the loop stops if
  `i_eq + sqrt(C/L ev^2 + ei^2) (1 + 1e-6) + 1e-6 (1 + |peak|) < peak`.
  The equilibrium `i_eq = load / (1 + R/Rp)` is RK4's fixed point too.
  Rounding per step is about 1e-15 in the scaled norm, so about 1e-8 A
  over a whole settle phase. The margin is 100 times that.
- The steps that do run are the same code as before. Same operations, same
  order, so every float computed is the same; only steps whose result could
  not change `peak` are skipped. The shut phases, whose end state is used,
  run every step.

The default settle now stops at about step 1,200 of 16,590.

## Verification

- **Every call the suite makes:** a wrapper recorded all 1,875
  `contactor_bounce_train` calls (1,585 distinct Feeder and argument sets)
  during a full `cad/tests` run. Old module (a copy of `main`) and new gave
  equal `repr`s for all of them, and for 600 random off-default configs
  (precharge off in about two thirds, bounce window 0.5 to 20 ms, idle load
  0 to 8 A, contactor resistance, pack inductance, ESC capacitance and pack
  volts scaled, 1 to 17 bounces): **2,185 cases, 0 mismatches**.
- **New test** `BrakesAndBouncesInARowTest.test_settle_stops_early_with_the_same_bits`:
  a plain copy of the old full-settle integrator lives in the test file and
  must match `repr` for three Feeders (default, no precharge, short window
  with a 4 A idle), two loads and four bounce patterns. It also checks the
  fast path is taken and refused for a step 400 times too long.
- **Red check:** with the stop condition replaced by `True` (stop after the
  first block), the new test fails (14.46 A against 19.29 A). Restored, it
  passes. The test **cannot** tell the energy bound from a naive
  `i_eq + |ei| < peak`: a second-order step response from rest never comes back
  above its first peak, so both give the same bits on every case tried. The
  energy bound's correctness rests on the argument above, not on this test.
- Full `cad/tests` ok apart from the fix below; `run_venture_tests.py
  open-tennis-robots` result is in the run record.

### Also fixed: `LiftCadTest` ran without build123d

`LiftCadTest` (added with PR #16362) imports `otr_cad.feeder` in
`setUpClass` but had no `skipUnless(HAVE_CAD)`. Every other solid-building
class has one, so without build123d the suite failed with
`ModuleNotFoundError` (1 error, before and after this change). It now
carries the same decorator.

## Before and after

Same container, back to back, wall clock, `python3 -m unittest discover -s
tests` in `cad/` with no build123d:

| | before | after |
|---|---:|---:|
| `cad/tests` (130 tests) | **75.5 s** | **63.4 s** (-16%) |
| the 2,185 recorded and random bounce trains | 64.4 s | 46.2 s (-28%) |
| one default train, 1 bounce, 100% open | settle 16,590 steps | about 1,200 steps |

The CI `cad` job also builds the packages with build123d, so its saving is
the same 12 s or so in absolute terms, a smaller share of its 282 s.

## Not changed, ranked for the next run

1. **The shut phases** (now most of `contactor_bounce_train`, about 46 s
   over the 2,185 cases): their end state feeds the next bounce, so no
   step can be skipped. The RK4 map is linear with constant coefficients,
   so `M^n` by squaring would make each phase O(log n), but that changes the
   floats and needs a tolerance test, not equality.
2. **Memoise `contactor_bounce_train`** on the frozen Feeder: 1,585 of
   1,875 calls are distinct, so at most 15%.
3. **`sleeve_take_up_design` / `_ranges_from`** (26 s under the profiler)
   and **`contactor_inrush`** (23 s, 2,152 calls): measure what repeats.
4. **`precharge_bus`** (17 s, 3,909 calls), already inlined 2026-11-15.
5. P063 and P064 remain owner-gated (workflow files).
