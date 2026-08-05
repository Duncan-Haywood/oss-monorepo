# Coverage baseline ratchet

`ENGINEERING-PRINCIPLES.md` sets a 90% coverage floor. Until 2026-07-31 nothing
measured coverage anywhere in this repository.

The only automated check carrying the word "coverage" was
`scripts/ci/test-engineering-policy.sh`, which greps `ENGINEERING-PRINCIPLES.md`
for the sentence stating the floor. That check passes when the sentence is
present, which it is, and it passes equally well after every test in the
repository has been deleted. No coverage tool was installed (`@vitest/coverage-v8`,
`c8`, `nyc`, `pytest-cov` were all absent), no venture defined a `coverage`
script, and no `VENTURE.yaml` carried the `engineering.coverage` block that
`platform/VENTURE.template.yaml` declares. The number 90 was a claim about
intent, not a control.

This document describes what replaced it.

## What the gate does

`scripts/ci/coverage_ratchet.py` reads `platform/coverage-baseline.yaml`, runs
each declared component's coverage command, parses the lcov report it produces,
and compares the measured percentage against the declared baseline **in both
directions**:

| Condition | Result | Why |
| :--- | :--- | :--- |
| `measured < baseline - tolerance` | fail | A test was removed, disabled, or bypassed. |
| `measured > baseline + tolerance` | fail | The baseline is stale. Raise it deliberately. |
| within the band | pass | Incidental line churn, no review needed. |

The upward direction is the half that people usually leave out, and it is the
half that makes this a ratchet. A floor that is allowed to trail reality
records only the worst a component was ever permitted to be. It never rises,
because nothing ever forces anyone to look at it again.

This mirrors the `count` field in `platform/exception-register.yaml`, which
fails both when a suppression is added and when the register drifts above the
code it covers, and for the same reason.

## Why there is a tolerance when `count` has none

`count` is an exact integer. Coverage is a percentage over a changing
denominator: adding an unrelated source line moves it by a fraction of a point
without anyone touching a test.

A baseline that must be rewritten on every commit is a baseline nobody reads.
The edit becomes reflexive, and a reflexive edit is exactly how a genuine
regression gets waved through. The tolerance is the width of the band that
needs no review — not permission to regress. It is:

- declared per component and per metric, in the checked-in baseline file,
- capped at **2.0 percentage points** by the audit, and
- itself reviewable, because widening it is a diff.

## Current baselines

The declared floors live in `platform/coverage-baseline.yaml`, each beside the
date and runner it was measured on. The table in **Enrollment today** below is
the current reading; this section is not a second copy of those numbers, because
two places to write a measurement is one place for it to go stale.

These are what the components actually have, not what the principles document
wants them to have. Writing 90 into any of them before it is true would switch
the gate off.

`platform-ci` remains the entry worth acting on. It is the engine that decides
whether every other component passes, and until commit `8d330b3` the paths that
reported PASSED for a component that was never verified were among the
unexecuted ones. None of the figures is a target; all of them are starting
points for the climb to the 90% repository floor.

## How it fails closed

The failure this repository keeps rediscovering is a gate reporting success for
work it never did. Each of these is an **error**, never a skip:

- the coverage command's binary is missing (`coverage-tool-missing`)
- the suite exits non-zero (`coverage-command-failed`) — a failing suite has no
  meaningful coverage
- the command times out (`coverage-timeout`)
- no lcov report is written (`missing-lcov`)
- the report parses but measures zero lines (`empty-coverage-report`) — an
  empty report is otherwise indistinguishable from perfect coverage
- a declared component's directory does not exist (`missing-component-path`)
- `command` is a shell string rather than an argv list (`invalid-command`)

`tests/test_coverage_ratchet.py` asserts every one of these failing directions,
and no test in it is skipped or conditionally skipped.

## Which failure you are being told about

Every code above is an error and none of them is a skip, so they change no
verdict — only where they send you first. Sending you to the wrong repair is
its own cost, and two codes exist purely to avoid it:

- `component-dependencies-missing` — the component declares npm dependencies,
  has no `node_modules`, and the command died resolving an import. Install and
  re-run; the suite is not the bug. Both halves of that evidence are required,
  because `platform/ci` declares a dependency it does not need installed.
- `coverage-measured-dirty-tree` — the component held uncommitted changes when
  the command ran, so the failure may not exist at `HEAD`. Re-run against a
  clean checkout before believing it.

The second one is here because roughly twenty agent sessions share one working
tree in this repository, which makes measuring a component mid-edit ordinary
rather than exceptional. On 2026-08-04 the gate reported
`coverage-command-failed` for `print-atelier` while its suite was entirely
healthy: another session had a not-yet-passing test file on disk for the length
of one red-green cycle, and by the time anyone read the report the file no
longer existed. The recorded failure and the commit it was blamed on were both
clean, and establishing that cost a full diagnosis.

The tree is read *before* the command runs, not after, because the run itself
writes inside the component it measures — reading afterwards would report every
failure as dirty, which is the same as reporting none. In CI the checkout is
clean, nothing is listed, and the wording is unchanged. A dirty tree never
excuses a failure and never creates one; it only says the failure has not been
reproduced anywhere it can be trusted yet.

`tests/test_coverage_ratchet_diagnosis.py` covers these separately from the
pass/fail directions, because a gate can hold the right verdict and still send
every reader to the wrong file.

## Running it

```bash
python3 scripts/ci/coverage_ratchet.py
```

Other modes:

```bash
python3 scripts/ci/coverage_ratchet.py --report            # measure, always exit 0
python3 scripts/ci/coverage_ratchet.py --component platform-ci
python3 scripts/ci/coverage_ratchet.py --no-measure        # validate the file only, ~0.2s
python3 scripts/ci/coverage_ratchet.py --json              # machine-readable
```

It runs in CI twice, deliberately: as the named `Coverage Baseline Ratchet`
gate in `scripts/test-ci.sh`, and as a repository contract test under pytest
via `tests/test_coverage_ratchet.py`. The named gate is for visibility in the
run log; the contract test is what makes it impossible to quietly drop.

## Raising a baseline

When coverage improves, the gate fails with `baseline-stale` and tells you the
number to write:

```
ERROR [baseline-stale] platform-ci: lines coverage is 61.40%, above the
       52.11% baseline (tolerance 0.5 pt)
    -> Raise baseline.lines to 61.40 in platform/coverage-baseline.yaml.
```

Edit `platform/coverage-baseline.yaml`, and say in the commit message what you
covered. Lowering a baseline needs the same review as any other reduction in a
control, and the reason belongs in the commit message, not in a widened
tolerance.

## The enrollment contract

Everything above holds the components that are *in* the baseline file. Until
2026-08-05 nothing held the ones that were not, and that was the larger hole.

The baseline declared two components. Only one of them — `print-atelier` — is in
`VENTURE_CATALOG` in `platform/ci/src/pipeline.mjs`, the registry CI verifies.
So **one of sixteen** catalog components had a coverage floor, and deleting
every test in the other fifteen turned no gate red anywhere. The ratchet
reported "every component matches its declared baseline", which was true, and
said nothing about the five sixths of the catalog it had never been pointed at.

The table below this section used to say otherwise. It listed
`ai-first-markets`, `quick-pick-survey` and `local-site-studio` as "Onboarded"
or "Onboarded & Ratcheted" with figures 20-30 points above what they measure.
None of the three had ever appeared in `platform/coverage-baseline.yaml`.

`scripts/ci/coverage_ratchet.py` now also audits **enrollment**, on the pattern
`scripts/ci/cap_ratchet.py` already applies to declared budgets: every candidate
is either watched or registered as exempt with a reason, and a candidate that is
neither is a failure.

- The candidate set is parsed from `VENTURE_CATALOG` rather than retyped, and a
  parse that yields nothing raises rather than returning an empty list. A
  candidate set that matches nothing exits 0 and looks exactly like a gate that
  passed.
- A component is enrolled by having a baseline entry, and 0/0/0 does not count
  (`enrolled-at-no-floor`) — that is enrollment with nothing under it.
- A component is excused by an `EnrollmentExemption` in `UNMEASURED_COMPONENTS`,
  which names **one** catalog id. No directories, no wildcards, no runner
  families: a region-shaped exemption is a region in which "every component has
  a floor" may be untrue while every count stays green.
- Each exemption names a `predicate` from `ENROLLMENT_PREDICATES`, re-evaluated
  against the tree on every run. When the blocker clears — a Python coverage
  provider appears in a requirements file, a Swift component is re-typed, a
  suite moves to `node --test` — the predicate stops holding and the gate goes
  red until the component is measured. That is what stops the reason from
  quietly going false, which is what prose-only registers here have done.

`tests/test_coverage_enrollment.py` enforces it under pytest and asserts each
failing direction. One test takes every catalog component in turn, removes its
registration, and requires a finding naming it — a component the contract
tolerates fails there.

## Enrollment today

Measured 2026-08-05 on Node 22.22.3. Percentages are the ratchet's own output;
`unexercised` is the count of declared source files no test loads, which is the
number a percentage cannot express.

| Component | Runner | Lines | Branches | Unexercised |
| :--- | :--- | ---: | ---: | ---: |
| `print-atelier` | `node --test` | 88.70% | 83.28% | 49 of 143 |
| `local-site-studio` | vitest | 65.47% | 61.45% | 64 of 173 |
| `quick-pick-survey` | vitest | 53.90% | 45.63% | 58 of 112 |
| `ai-first-markets` | `node --test` | 98.37% | 89.26% | 24 of 31 |
| `photo-editing-docs-site` | `node --test` | 23.33% | 100.00% | 25 of 26 |
| `platform-ci` (not in the catalog) | `node --test` | 86.06% | 88.00% | 0 of 2 |

`ai-first-markets` is the entry worth reading twice. Its percentages are the
best in the file and they are computed over the seven source files a test loads;
the other twenty-four — every API route, every page — are absent from the report
and therefore absent from the ratio.

The eleven catalog components without a floor are registered in
`UNMEASURED_COMPONENTS` with the blocker each is waiting on:

| Component | Predicate | Blocker |
| :--- | :--- | :--- |
| `mat-470-real-analysis` | `python-coverage-provider-undeclared` | `pytest-cov` in `requirements-ci.txt` |
| `photos-import-tools` | `python-coverage-provider-undeclared` | same |
| `photo-editing` | `python-coverage-provider-undeclared` | same |
| `ubuntu-agent-server` | `python-coverage-provider-undeclared` | same |
| `portfolio-router` | `python-coverage-provider-undeclared` | same |
| `range-coach` | `runner-outside-lcov-toolchain` | `llvm-cov export -format=lcov` step |
| `platform-terraform` | `runner-outside-lcov-toolchain` | none; terraform has no coverage notion |
| `ai-engineering-academy-site` | `no-coverage-capable-runner` | port `test.mjs` to `node --test` |
| `real-estate-agent-photo-app` | `no-coverage-capable-runner` | one `node --test` run, and a decision on the shell half |
| `retail-pilot-intel` | `pnpm-workspace-needs-merged-report` | merged lcov, or one entry per package |
| `marisstella-homepage` | `source-executed-through-vm` | an importable entry point for `app.js` |

Nothing in that register is a verdict. Five of the eleven clear on one line in
`requirements-ci.txt` plus a measurement, and the predicate will say so.


## Relationship to `engineering.coverage` in VENTURE.yaml

`platform/VENTURE.template.yaml` declares an `engineering.coverage` block with
90/90/90/85. No `VENTURE.yaml` carries it, and none should carry it until the
venture measures coverage: a target copied into metadata is the same
unenforced claim in a new location. The intended end state is that
`engineering.coverage` holds the venture's target and
`platform/coverage-baseline.yaml` holds what it currently measures, with the
gap being the visible, ownable work. Wiring those two together is not done.
