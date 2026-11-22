# The ambient-* MAP solver diverges in ten more projects

Found by quality round 94 (2026-11-22), audit
[`portfolio/quality/audits/2026-11-22-ambient-fullinfo.json`](../../portfolio/quality/audits/2026-11-22-ambient-fullinfo.json).

## What is wrong

`fit_map` (MAP logistic regression with a Gaussian prior) was copied into
each ambient project. It takes full Newton steps with no line search. The objective is strictly
convex, but from a poor start (the uninformed prior `PRIOR_W`, or heavy
inverse-propensity weights) full steps overshoot and the fit diverges. In
`ambient-fullinfo` the returned weights had an objective 450 to 360,000 times
the true minimum. That fit failure produced the README's main finding, that
the uninformed learner "fails entirely".

The bug was first found on 2026-11-17 in `ambient-crossfit`
(`portfolio/quality/audits/2026-11-17-ambient-crossfit.json`), which got a
damped Newton fit. The fix was not carried to the copies. `ambient-fullinfo`
was fixed on 2026-11-22 (PR #18259).

## Still undamped (`w -= step`, no line search) on 2026-11-22

- research/ambient-bandit/src/ambient_bandit/bandit.py
- research/ambient-ips/src/ambient_ips/ips.py
- research/ambient-capcv/src/ambient_capcv/core.py
- research/ambient-dr/src/ambient_dr/core.py
- research/ambient-drablate/src/ambient_drablate/core.py
- research/ambient-drclip/src/ambient_drclip/core.py
- research/ambient-drrepeat/src/ambient_drrepeat/core.py
- research/ambient-drvalid/src/ambient_drvalid/core.py
- research/ambient-exploreonly/src/ambient_exploreonly/core.py
- research/ambient-labelmatch/src/ambient_labelmatch/core.py

Re-list them with:
`for f in $(grep -rl "def fit_map" research --include=*.py); do grep -q "w -= step" $f && echo $f; done`

## What a fix run should do

For each project:

1. Port the damped Newton from `ambient-fullinfo/src/ambient_fullinfo/core.py`,
   or the one in `ambient-crossfit`, which also raises if it does not converge.
2. Add the stationarity test, `test_fit_map_reaches_the_minimum_from_a_poor_start`
   in `ambient-fullinfo/tests`. It fails on the undamped code.
3. Rerun `experiments/run.py`, diff `results.txt`, and rewrite any result that
   moves. Rows with the informed prior and small weights may not move. Rows
   with the uninformed prior or raw 1/epsilon weights are the likely ones to
   change.

A project whose rows do not move still needs the fix, so its numbers do not
rest on luck.

A better long-term fix is one shared, tested solver rather than ten copies.
The research brief makes each project self-contained, so that is a judgement
call for the next run.
