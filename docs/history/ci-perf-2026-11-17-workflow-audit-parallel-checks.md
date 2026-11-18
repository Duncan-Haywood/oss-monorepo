# workflow-audit: run the twelve checks at once (2026-11-17)

Perf track run. Both open `perf:` backlog items (P063, P064) touch
CODEOWNERS paths and wait for the owner, so this run took a venture suite.

## Reading

`python3 platform/ci/run_venture_tests.py --times 25` ranks suites by the
06:13Z full run. The top five carry 14 to 26 perf write-ups each. Among the
untouched ones, `python3 platform/ci/suite_file_times.py <slug>` (one file at
a time, idle 4-core container):

| suite | slowest file | seconds |
|---|---|---:|
| workflow-audit | test_audit.py | 8.3 |
| support-agent | eval.test.mjs | 7.2 |
| gaussian-process-regression | cli.test.mjs | 5.2 |
| wasserstein-distance | cli.test.mjs | 1.1 |

`workflow-audit` had no earlier pass on record.

## Profile

`audit.audit()` ran its twelve vendored checkers (`checks/*.py`) one after
another, each as its own `python3` subprocess so one failing never hides the
rest. Timed one by one on the suite's `BAD` fixture: every checker took 27 to
32 ms, almost all of it interpreter start-up, so one audit cost 0.34 s of
serial waiting. The suite calls `audit()` (directly or via `main`) about two
dozen times, which is the 8 s.

## Change

`audit()` now runs the checkers through a `ThreadPoolExecutor`
(`min(12, cpu_count)` workers). `pool.map` returns results in `CHECKS` order,
so findings, errors, de-duplication and sorting are exactly as before. Each
check is still its own subprocess; the isolation is unchanged.

## Verification

- `python3 audit.py ../.. --format json` on this repository's workflows,
  before and after: `cmp` reports the two outputs byte-identical (10,432 bytes).
- New test `test_parallel_checks_match_a_serial_run` pins `audit()` against
  the old serial loop on a fixture with findings.
- `python3 platform/ci/run_venture_tests.py workflow-audit`: ok, 33 tests.

## Numbers (`time python3 -m unittest -q test_audit`, three runs each, 4 cores)

| | before | after |
|---|---:|---:|
| test_audit.py (18 tests; 19 after) | 8.14 to 8.43 s | 2.44 to 2.56 s (2.79 s with the new test) |
| `audit.py .` on this repo | 0.63 s | 0.25 s |

The second row is also what `.github/workflows/workflow-self-audit.yml`
runs twice per trigger, and what every user of the composite action waits on.

## Not changed, ranked

1. `support-agent` `eval.test.mjs` (7.2 s alone): no earlier pass; next pick.
2. `gaussian-process-regression` `cli.test.mjs` (5.2 s): two earlier passes on the engine, not the CLI test.
3. Importing the checkers in-process would cut the remaining ~0.1 s per
   audit further, but gives up the crash isolation the module docstring
   promises; not worth it.
