# CI perf, 2026-11-19: wall-framing-takeoff's exact lumber DP keeps one copy of each cut

Perf track. Both open backlog perf items (P063, P064) touch `.github/workflows/`
(owner-only under CODEOWNERS), so this run took "the slowest local step an agent
session waits on".

## Reading

`platform/ci/venture_suite_times.json` (2026-11-17) ranks the suites; the three
slowest (league-schedule-generator, shift-roster-builder, shed-designer) have had
many passes. `suite_file_times.py` on the next tier, 4 at a time on 4 cores:

| suite | wall | slowest file |
|---|---:|---|
| einvoice-preflight | 11.0 s | zatca-stamp 1.2 s (270 files, flat; startup-bound) |
| wall-framing-takeoff | 17.0 s | engine.test.mjs 7.3 s |
| wasserstein-distance | 7.7 s | engine.test.mjs 7.7 s (two passes already) |
| gitignore-explainer | 5.1 s | gitignore.diff.test.mjs 5.1 s |

In wall-framing's `engine.test.mjs` the spec reporter put 3.1 s of 5.4 s in two
seeded sweeps: two-course sheathing on 300 walls (1.60 s) and horizontal
sheathing on 200 walls (1.52 s). A script replaying both loops spent 2.2 s in
`takeoff` and 1.0 s in `sheathe`; under `node --cpu-prof`, 2.48 s of self time
was in one function, `exactStock` (`engine.mjs`), the exact cheapest-lumber DP
that `solveStock` calls when neither the LP rounding nor first-fit meets the LP
bound.

Instrumented: 553 calls, 485,014 patterns in all. Each board size enumerates
every cut that fits it, so a cut that fits an 8 ft board also appears for the
precut stud, 10, 12, 14 and 16 ft boards, each at a higher price. Only 117,441
of the patterns (24%) were distinct count vectors.

## Change (`ventures/wall-framing-takeoff/engine.mjs`, `exactStock` only)

After the work-limit check, keep for each count vector only its cheapest copy
(the first on a price tie, using the DP loop's own 1e-12 rule). Two copies with
the same counts reach the same remainder state, so the dearer one's value is
exactly a price step higher and it can never become the state's argmin. The
work limit still counts every copy, so which instances get solved exactly, and
which return `null`, is unchanged.

## Verification

- New `exact-stock-twins.test.mjs` keeps the plain DP over every board's
  patterns (the old pattern list and a plain `j` loop) and asserts the same
  `null`-ness, cost and bars (board, pieces, order) on 300 seeded instances:
  cent prices, equal prices on every board, boards listed dearest first, and an
  extra precut-style board. The dedupe fired on 298 of them. It passes before
  and after the change; 0.1 s.
- The replay script's SHA-256 over `JSON.stringify` of all 500 sheathing results:
  `99fd7a4339982b44…` before and after.
- `takeoff(samplePlan())` JSON: `cmp` identical. `node bench.mjs`: identical
  except its `ms` column.
- `python3 platform/ci/run_venture_tests.py wall-framing-takeoff`: ok, 1,214 tests.

## Numbers (this 4-core container)

| measure | before | after |
|---|---:|---|
| patterns in the 553 DP calls | 485,014 | 117,441 |
| replay script, takeoff + sheathe | 3.3 s | 1.7 s |
| `node --test engine.test.mjs`, median of 3 | 5.49 s | 3.89 s |
| two-course sheathing sweep | 1.60 s | 0.73 s |
| horizontal sheathing sweep | 1.52 s | 0.78 s |
| engine-fuzz / sheathing-fuzz / drawings-fuzz | 2.04 / 3.24 / 2.24 s | 1.80 / 2.99 / 2.08 s |

The page also runs the takeoff on every keystroke, so a user's edit that needs
the exact solver gets about twice as fast in the same way.

## Not changed, ranked for the next run

1. Same-board dominance (a cut whose counts are under another's on the same
   board, both fitting). The DP's value is then never lower for the smaller cut
   (f is monotone), but it can tie and win on index, so dropping it changes
   which bars come out. Needs a decision that a different equal-cost order is
   acceptable, not a perf run's call.
2. `cli-sweep.test.mjs` (6.2 s, 4 tests): process spawns, looked at on 2026-11-13.
3. `gitignore.diff.test.mjs` (5.1 s): differential against real `git`; spawn-bound
   by the look of it, not profiled.
4. einvoice-preflight: 270 files at ~0.1 s each; only fewer processes would help.
