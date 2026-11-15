# CI perf, 2026-11-15: open-tennis-robots integrators inlined, bit-identical, suite 160 s to 96 s

Perf track. Both open perf backlog items (P063, P064) touch workflow files and
wait for the owner, so this run took the slowest local step an agent waits on
for a venture with recent activity: `python3 platform/ci/run_venture_tests.py
open-tennis-robots` (the same commands `ventures-tests.yml` and
`open-tennis-robots-ci.yml` run, without build123d).

## Reading

This container, 4 cores, Python 3.13, no build123d (52 CAD tests skip), each
number one wall-clock run on an idle container; before was taken in a clean
worktree of `main` at e8fe62d86 right after the after-run of the first change.

| | before | after |
|---|---:|---:|
| `run_venture_tests.py open-tennis-robots` (262 tests, ok) | **159.6 s** | **95.5 s** |
| `cad/`: `python -m unittest discover -s tests` (128 tests) | 113.9 s | ~74 s |
| `tests/test_robots.py` README headline cell, `catcher.study(300, ...)` | 23.8 s | 9.3 s |

## Profile

- `tests/`: `cProfile` on `catcher.study(40, ...)`: 11.7 s of which 10.8 s in
  `ballistics._rk4`, 1.9 M `acceleration` calls each building tuples through
  `add`/`scale`/`norm`/`dot` (38 M function calls in all).
- `cad/`: a per-test timer over `unittest` (scratch script) put
  `FeederParamsTest.test_feed_rules_catch_bad_changes` at 23.5 s and
  `PrechargeStartupTest.test_enable_delay_shorter_than_pull_in_and_bounce_fails`
  at 22.3 s. `cProfile` on the first: `Feeder.contactor_bounce_train` 53.6 s
  cumulative under the profiler, 65 M calls to its inner `deriv`, and
  `precharge_bus` 18.9 s with 34 M calls to its inner `draw`.

All three are hand-written RK4 / midpoint loops whose time was Python call
overhead, not arithmetic.

## Change

- `ballistics._stepper(spin, dt, ball)`: `_rk4` + `acceleration` as one closure
  over scalars, with the spin norm, the drag/lift constant and the step
  fractions hoisted (spin is constant between bounces). `simulate` builds one
  per spin and rebuilds it when a bounce changes the spin. `_rk4` and
  `acceleration` stay as the reference (the tracker calls `acceleration`).
- `Feeder.contactor_bounce_train`: `deriv` written out in the RK4 loop, one loop
  for the precharge case and one for no resistor (where the precharge current
  is a literal `+ 0.0`, as `deriv` added it); `max(peak, i)` became
  `if i > peak`, which picks the same value.
- `Feeder.precharge_bus`: `draw` inlined; the loads drawing during a step are
  fixed for the step, so their watts are listed once per step and summed in the
  same order.

Every float operation keeps its order and grouping (`a * h / 2` stays
`(a * h) / 2`, the gravity vector's `0.0 +` is kept), so outputs are
bit-identical, not close.

## Verification

- New test `test_physics.test_simulate_stepper_is_bit_identical_to_rk4`:
  2,000 random states (no spin, no air, zero velocity, spin parallel to
  velocity) compare `repr` of `_stepper` against `_rk4`.
- Scratch checks against a copy of the old modules: 200,000 random RK4 steps
  and 3,000 random `simulate` flights (bounces, net, `stop_x`, three balls)
  with every state's `repr` equal; `precharge_bus`, `contactor_bounces`,
  random `contactor_bounce_train` calls and `check_inrush` `repr`-equal over
  eight Feeder configs, including both start-up loads switched on (each starts
  once) and `precharge_ohm=0`.
- The exact counts the suites already pin (274/300 caught, 32/8/0 and 8/32/0)
  pass unchanged; full runner ok.

## Not changed (ranked, for the next run)

1. `precharge_bus` is still ~16 s of the CAD suite under the profiler: the
   step is a 400th of the RC constant over the contactor delay, many thousand
   steps per call, 3,700 calls. Memoising on the frozen `Feeder` would help
   only where calls repeat; measure first.
2. `contactor_bounce_train`: 1,779 calls, 1,441 distinct, so a memo saves at
   most ~19%. The settle phase (20 x the slowest constant at a 60th of the
   fastest) is most of the steps; a closed form for that linear RLC phase
   would change the floats, so it needs a tolerance test rather than equality.
3. `_hose_curve_range_3d` / `_hose_curve_range` (~25 s under the profiler),
   already worked on 2026-11-14.
4. `catcher.study` at 9.3 s: what's left is the RK4 arithmetic itself.
