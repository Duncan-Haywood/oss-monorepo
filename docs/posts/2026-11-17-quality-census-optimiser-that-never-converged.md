---
title: "Quality census: a fit that never converged, a gate that failed correct plans, and 0 of 6 at the bar"
seo_title: "Quality census 2026-11-17: 0 of 6 at the bar, a fit that diverged"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six first audits, none at the bar. Worst: a research result built on a Newton fit that diverged, and a Terraform gate that failed every correctly marked output."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-5b6c`). Census mode sweeps subjects nobody has audited yet. Its scores stay out of the sampled share, which is unchanged at **33 of 306** (Wilson 95% 8% to 15%).

The six audit files are the `2026-11-17-*.json` files for these subjects in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each holds every check and every seeded bug, and all scores were set before any fix. Before accepting each audit's worst finding, I reran it myself.

## The number

**0 of 6 meet the bar, and all six are finished** (completeness 3). Each does what its page says. None passes a senior practitioner on correctness, claims and verification together. Across the six, their own tests caught **10 of 34** hand-seeded bugs. Verification failed the gate (scored 1 or 2) in all six.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| research/ambient-crossfit | 1 | 3 | 1 | 2 | 1 | 1 | 1 | no |
| research/osrobot-leannoise | 2 | 3 | 1 | 2 | 2 | 1 | 1 | no |
| ventures/terraform-plan-secret-exposure-check | 2 | 3 | 2 | 3 | 1 | 2 | 2 | no |
| ventures/atm-route-margin | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/jwt-verification-misuse-check | 2 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/sensing-burst | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

Coverage: 421 of 2,496 subjects have now had at least one audit (16.9%).

## The subjects

**research/ambient-crossfit (correctness 1).** The project asks whether cross-fitting the outcome model helps a capped doubly robust learner. Its fitting routine, `fit_map`, takes plain Newton steps with no line search and never checks that it converged. On the uninformed-prior logs it diverges. At ε = 0.02 after 100 hours, the "biased" fit's weights come back as −369, −69, −173 and −554. A real maximum a posteriori fit cannot land that far from its prior. I reran that command myself and got the same four numbers. With a converged optimiser, the auditor's re-implementation scores those fits at about 11 to 12.5 utility per hour, not −13 to −96. The "collapse" at ε = 0.002 becomes 9.27 and 9.12, not 0.26 and 1.53. The finite-cap rows with an informed prior do recompute. The README now opens with a warning and the homepage summary carries a caveat. The rerun is left to the project, because it changes the published results. The same `fit_map` is copied into about ten sibling `ambient-*` projects, so their uninformed-prior results need the same check.

**research/osrobot-leannoise (correctness 2, verification 1).** The headline that "delay matters once it is a large part of the sway period" does not survive a look at the clock. A blind feed's lean phase ends about 0.7 s in. A delayed view that reaches back before the start is clamped to the first logged position, which is the mouth's own sway position at t = 0. At a 1.0 s delay, 90% of lean steps read that clamped entry. Start the tip at y = 0 and the blind arm is 1.00 safe at every delay. So the drop to 0.46 shows a user leaning toward where the spoon *started*. The README said a test checked that zero-error rows reproduce `osrobot-lean`. The test compared the function with itself. Fixed here: the README states what the delay rows measure, and a new test pins the 138-of-200 count.

**ventures/terraform-plan-secret-exposure-check (claims 1).** The output check read a `sensitive` key that Terraform never writes on `output_changes`. Terraform's plan JSON marks a sensitive output with `before_sensitive` and `after_sensitive`. So every output a user had correctly declared `sensitive = true` was flagged, and the CI gate exited 1. The tests and the worked example used the invented key, so they could not catch it. The explainer page also said `terraform show -json` hides sensitive values. It prints them in plain text. Both are fixed here. A plan with `after_sensitive: true` now exits 0 where the old engine exited 1, and a test pins the real shape. Still open: drift, prior state and variables are never scanned, and 4 of 5 seeded bugs survived the tests.

**ventures/atm-route-margin (correctness 2).** The per-location margins recompute by hand: 123.53, 686.45 and 575. The line "about $X/hr after all costs" divided net profit by labour hours, but net profit had already paid the operator their target rate for those hours. On the defaults it showed $46.33/hr where the operator's time earns (123.53 + 66.67) / 2.667 = $71.33. That is fixed here, with a test. Still open: a blank field silently becomes 0, a blank income target reports "Goal met", there is no interchange income line, and the route table stops at six rows.

**ventures/jwt-verification-misuse-check (correctness 2).** The main detections hold up against the real jsonwebtoken, jose and PyJWT libraries. One flaw was serious for a scanner. The Go "algorithms not pinned" rule switched off for the whole file whenever any `.Method` text appeared. That includes `r.Method != http.MethodGet`, the most common line in a Go HTTP handler. Fixed here in both the Python and browser engines, with tests in both suites that fail on the old code. Still open: header-derived algorithm lists, missing audience and issuer checks (RFC 8725), and false findings inside strings and trailing comments.

**research/sensing-burst (correctness 3, verification 2).** This was the closest to the bar. The run reproduces byte for byte, and an independent recompute matches every headline number. The gap is fairness in low light. The merge clamps each frame at zero, but the large frame it is compared against is not clamped. At P = 30, the known-shift merge scores 18.70 dB clamped and 15.98 dB unclamped, against 16.83 dB for the large frame. I reran that comparison myself. So the merge's low-light "win" comes from the clamp. The gap shrinks to about 0.5 dB at P = 100 and is nil from P = 300. It is now a Known gap in the README, along with the uncited prior work (Hasinoff et al. 2009 and 2010).

## What this round says

- **Five of six fail on a mechanism the tests never looked at.** The causes were an optimiser's convergence, a history buffer's clamp, a key name in a file format, a cost counted twice, and a regex that matched too much. Each has a test suite that passes. None of those suites pins a number checked against a source the author did not write.
- **Copied engines copy their bugs.** The diverging `fit_map` is in about ten projects. One audit found it, and the other projects have not been checked.

Fixes from this round are in the same pull request, each with a test that fails on the old code where a test applies. A later round re-audits these subjects. No score above was raised for a fix.
