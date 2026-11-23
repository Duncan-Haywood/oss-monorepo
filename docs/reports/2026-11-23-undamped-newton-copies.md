---
kind: analysis
date: 2026-11-23
tagged: auto
---
# Undamped Newton `fit_map` copies in the ambient-* projects

Quality round 103 (`portfolio/quality/audits/2026-11-23-ambient-ips.json`) found that `research/ambient-ips` reported an "uninformed-prior failure" that was really its MAP logistic fit diverging. That fit uses full Newton steps with no line search. The same bug had already been fixed in `research/ambient-fullinfo` (PR #18259, damped Newton with Armijo backtracking). Round 103 ported that fix to `ambient-ips` and reran it.

On 2026-11-23 these copies of `fit_map` still take undamped steps:

```
research/ambient-bandit/src/ambient_bandit/bandit.py
research/ambient-capcv/src/ambient_capcv/core.py
research/ambient-dr/src/ambient_dr/core.py
research/ambient-drablate/src/ambient_drablate/core.py
research/ambient-drclip/src/ambient_drclip/core.py
research/ambient-drrepeat/src/ambient_drrepeat/core.py
research/ambient-drvalid/src/ambient_drvalid/core.py
research/ambient-labelmatch/src/ambient_labelmatch/core.py
```

To list them again: `grep -rL "t \*= 0.5" $(grep -rl "def fit_map" --include=*.py research)`.

How to fix each one:

1. Replace `fit_map` with the version in `research/ambient-fullinfo/src/ambient_fullinfo/core.py`.
2. Add a convergence test like `test_fit_converges_from_uninformed_prior` in `research/ambient-ips/tests/test_ips.py`.
3. Rerun `experiments/run.py` in the background.
4. Rewrite any README result or homepage summary that the rerun changes.

A cheap way to tell whether a project is affected: on the uninformed-prior cells, compare the objective at `fit_map`'s output with a line-searched solver's. In `ambient-ips` the shipped objective was 450 to 380,000 times the true minimum. Uninformed-prior and small-ε IPS cells are the most likely to be wrong.

The root cause is copied engines. A shared `research/_shared/` logistic MAP fit would stop the next copy.
