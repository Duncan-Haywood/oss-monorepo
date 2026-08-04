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

Measured 2026-07-31. These are what the components actually have, not what the
principles document wants them to have. Writing 90 here before it was true
would have switched the gate off.

| Component | Lines | Functions | Branches | Scope |
| :--- | ---: | ---: | ---: | :--- |
| `print-atelier` | 91.70% | 87.46% | 79.31% | 49 files, 13 146 lines |
| `platform-ci` | 52.11% | 57.14% | 61.54% | `src/pipeline.mjs`, 639 lines |

`platform-ci` is the finding worth acting on. It is the engine that decides
whether every other component passes, and roughly half of it has never been
executed by a test — including, until commit `8d330b3`, the paths that reported
PASSED for a component that was never verified. Raising this is the priority;
`print-atelier`'s branch coverage is the next.

Neither number is a target. Both are starting points for the climb to the 90%
repository floor.

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

## Onboarding the remaining components

Both components measured today use Node's built-in
`--experimental-test-coverage`, which needs no dependency. The rest need a
coverage provider installed before they can be declared, and a component is
only added to the baseline once it has been **measured** — declaring one with
an invented number would reintroduce exactly the problem this replaced.

| Component | Runner | Blocker / Status | Owner |
| :--- | :--- | :--- | :--- |
| `ai-first-markets` | `node --test` | **Onboarded** (lines 100.00%, branches 97.96%) | duncan |
| `platform-ci` | `node --test` | **Onboarded & Ratcheted** (lines 76.88%, branches 89.47%) | duncan |
| `print-atelier` | `node --test` | **Onboarded** (lines 92.98%, branches 81.75%) | duncan |
| `quick-pick-survey` | vitest | **Onboarded & Ratcheted** (lines 74.21%, branches 59.18%) | duncan |
| `local-site-studio` | vitest | **Onboarded & Ratcheted** (lines 94.70%, branches 89.76%) | duncan |
| `retail-pilot-intel` | pnpm workspaces | per-package providers, needs a merged report | duncan |
| Python (`tests`, `portfolio`, `platform/ci`) | pytest | `pytest-cov` / `coverage` not installed | duncan |

`ai-first-markets` was onboarded on 2026-08-01 following resolution of its test suite imports and route auth posture contracts.


## Relationship to `engineering.coverage` in VENTURE.yaml

`platform/VENTURE.template.yaml` declares an `engineering.coverage` block with
90/90/90/85. No `VENTURE.yaml` carries it, and none should carry it until the
venture measures coverage: a target copied into metadata is the same
unenforced claim in a new location. The intended end state is that
`engineering.coverage` holds the venture's target and
`platform/coverage-baseline.yaml` holds what it currently measures, with the
gap being the visible, ownable work. Wiring those two together is not done.
