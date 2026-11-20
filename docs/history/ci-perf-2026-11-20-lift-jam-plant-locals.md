# open-tennis-robots: the lift-jam plant's coupled step runs on locals (2026-11-20)

**Reading.** Perf track, prompt 0. Both open perf backlog items (P063, P064)
touch CODEOWNERS paths, so this run took step 3 (the slowest local step a
session waits on). Every `*.test.mjs` in einvoice-preflight, ids-model-check,
sales-agent, xer-schedule-check and trade-bid-studio (341 files, timed alone,
three at a time) finished in under 2 s, so the node side of the most-touched
ventures has nothing to win. The Python suites were next: photo-editing's 1,454
tests take 118 s with no test over 8.5 s; open-tennis-robots' `tests/` take
148 s, 112 s of it in `tests/test_host.py` (153 tests, timed alone).

**Profile.** `python3.13 -m cProfile -m pytest tests/test_host.py`, self time:
`lift_jam_sweep.Plant._step_coupled` 43.9 s (72.4 s cumulative, 2,915,000
calls), ahead of the ballistics RK4 (`acc` 30.0 s, already worked on
2026-11-15) and the firmware's drop fit (`_cmd_columns` 13.9 s, `dcol` 12.5 s).
It is a test-side plant (the ball lift's motor, jaw coupling, slip hub and
belt, at 12.5 us sub-steps, eight per call), so the time is the 16
`LiftJamTest` tests. Every sub-step read and wrote some 30 attributes on
`self`, called `coupler_torque()` and `belt_force()` as methods, and made
94 million `max` and `abs` calls over the file.

**Change.** `ventures/open-tennis-robots/tests/lift_jam_sweep.py`,
`_step_coupled` only: the state is read into locals once per call and written
back once; constants (`hood`, the gains, inertias) are hoisted out of the
eight sub-steps; `coupler_torque` and `belt_force` are inlined with the same
float operations in the same order; `max(0.0, x)` becomes `x if x > 0.0`
(max keeps its first argument on a tie, so NaN and -0.0 land the same way),
`max(a, b)` becomes `if b > a`, `abs(x) <= c` becomes `-c <= x <= c`, and the
coupling's peak torque is taken from the branch that already knows its sign.
The chain model's `_chain_step` reads `s` and `wb` from the plant, so they are
written back before it is called. Attributes the plant creates lazily
(`_slide_dir`) or only for the belt-stretch and chain variants are read and
written only when they exist, so the plant's attribute set is unchanged.

**Verification (same answers).** A pytest plugin
(scratch, not committed) wrapped `_step_coupled` and fed `repr` of every
numeric attribute of the plant after each call into a SHA-256 per test. Old and
new code, all 16 `LiftJamTest` tests: 7 tests reach the coupled plant,
2,915,000 calls in all, and the two JSON digest files are byte-identical
(`cmp`). `repr` of a float is exact, so this pins every intermediate state, not
only the tests' assertions. All 153 `tests/test_host.py` tests pass.

**Before / after** (this 4-core sandbox, quiet machine, `pytest -q -k LiftJam
tests/test_host.py`, wall seconds):

| run | before | after |
|---|---|---|
| 1 | 36.6 | 27.4 (locals only) |
| 2 | 34.7 | 27.1 |
| 3 | | 27.0 |

About 25% off the 16 tests (9 s), and `test_host.py` as a whole 112.4 s ->
105.4 s. The CLI sweeps that import the plant (`lift_jam_sweep.py`,
`lift_tooth_sweep.py`, `lift_sense_ripple_sweep.py`) get the same per-step
saving. Under the profiler `_step_coupled` went from 43.9 s to 24.2 s self.

**Not changed, ranked for the next run.**

1. **The firmware drop fit** (`controller.py` `drop_from_commands_steps`:
   `one` 70 s cumulative under the profiler over `test_host.py`, `_cmd_columns`
   13.9 s, `dcol` 12.5 s, `_solve_small` 10.7 s). It is board code that must
   stay MicroPython-friendly and its floats feed the fit, so any change needs
   the same per-call equality harness as above, run on the refit and survey
   tests. `dcol` recomputes `exp(-(b - t1) / tau)` for every row at every t0;
   per tau the row edges are fixed, so a per-tau table of `exp(-T[j] / tau)`
   would change rounding and needs a tolerance argument instead.
2. **`ballistics.simulate`** (70.5 s cumulative, 22,192 calls): the RK4 step is
   already scalar and inlined (2026-11-15); what repeats across calls (same
   launch, same spin) is the next thing to count.
3. **`Plant.step`** outside the coupled path (3.6 s self) and `_chain_step`
   (4.4 s self, 356,000 calls): same locals treatment, smaller prize.
4. P063 and P064 remain owner-gated (workflow files).
