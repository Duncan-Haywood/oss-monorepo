---
title: "Quality audit round 41: none of four sampled subjects meets the bar"
seo_title: "Quality audit round 41: none of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "None of four sampled subjects meets the bar. A bus-factor CLI never flagged an abandoned repository, and a reject-option result turned out to be a 2008 theorem."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence for each subject is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Every score below is from before any fix.

This round ran in mode `sample` with seed 2026-11-10, the same seed as rounds 39 and 40. A subject audited in the last 90 days is skipped, so the draw gave four subjects that had never been audited. No flagship or platform subject was drawn, because all of them were audited recently.

## The number

**0 of 4 sampled subjects meets the bar.** Across all sampled rounds, 28 of 178 meet it (Wilson 95% interval 11% to 22%). Four subjects are too few to say anything about this round on its own.

All four are finished (completeness 3). Each misses the bar on verification, on claims, or on a number.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/git-bus-factor-check | 2 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| ventures/tree-service-bid-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/intent-twin | 4 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/reject-surrogates | 3 | 3 | 2 | 3 | 2 | 1 | 2 | no |

Each subject's tests faced seeded bugs, and caught:

| subject | seeded bugs caught |
|---|---|
| git-bus-factor-check | 2 of 9 |
| tree-service-bid-calculator | 6 of 7 |
| intent-twin | 4 of 8 |
| reject-surrogates | 4 of 6 |

## Verdicts and worst defects

### git-bus-factor-check

**It fails on correctness, verification and claims.**

The tool is meant to find folders whose main contributor has gone quiet. A folder counts as orphaned when that person has made no commit in the last 90 days. The problem is how the command-line version measured "the last 90 days": from the newest commit in the repository, not from today (`busfactor.py:85`). So in a repository nobody has touched for a year, everyone looked active, and nothing was ever flagged.

The auditor built a real repository whose author last committed 113 days earlier. The CLI reported that author as silent for 0 days and the folder as single-owner. With `--now` set to the current time, the same folder came back orphaned, silent 113 days. `--fail-on-orphaned` is the flag meant to catch exactly this case in CI, and it could not.

- **The weighting itself is right.** A hand recomputation of the recency-weighted shares matched to four decimals: 0.53695 by hand, 0.5369 from the tool.
- **The tests missed most seeded bugs.** 7 of 9 survived. That includes every constant the page advertises: the 500-line cap, the 180-day half-life, the 90-day window, and both ownership thresholds.
- **One claim on the page was wrong.** It called Hercules a paid tool. Hercules is Apache-2.0 open source.

### tree-service-bid-calculator

**It fails on correctness and claims.**

The arithmetic is exact. An independent Python version reproduces the page's default two-tree job to the cent: 15.1616 on-site hours and a $6,855.67 price.

The defaults are the problem. The hour factors are fixed constants that the user cannot edit. At those defaults, a 24-inch, 60 ft backyard oak near the house, with the stump ground and the wood hauled, prices at $6,529.85. I worked the hours from `calc.mjs` by hand and got the same 14.4 on-site hours. That is several times the range published consumer cost guides give for a tree that size. The auditor could reach those guides only through search results, not a primary page, so read the size of the gap as approximate.

Stump grinding is billed at the whole-crew rate plus chipper and truck. Most shops price it per diameter inch.

The README's privacy section was also stale. It said the only thing stored was a usage tally, but the page also saves the open bid and the contractor's business details. The page's own FAQ already said so.

### intent-twin

**It fails on verification.**

Every number the auditor recomputed matched to the printed digits. The error and time figures were checked by solving the absorbing Markov chain exactly in fractions, and the calibration miss probabilities by enumerating them with `math.comb`. I repeated the calibration enumeration myself and got 0.3828, 0.4164 and 0.0402, the same as the auditor.

The weakness is in the tests. They could not tell when the calibration headline changed. Changing the Laplace estimator, the miss criterion, or the fallback when the estimate is ½ left all six tests green, and each change moves the headline. For example, the n = 10 miss probability goes from 0.38 to 0.15.

Results 1–3 are Wald's textbook error-rate and expected-time curves, evaluated away from the design value, and the paper did not say so. The human–robot interaction work on inferring how rational a human is was not cited.

### reject-surrogates

**It fails on verification and claims.**

Every number reproduces. `run.py` matches `results.txt` byte for byte, and an independent recomputation through the identity "logistic regret = KL" gives the same transfer ratios.

The headline is not new, though. The "linear regret transfer with constant exactly 2d" is Theorem 2 of Bartlett & Wegkamp (JMLR 2008), at δ = ½. I checked the theorem statement in the paper itself. The whitepaper listed that bound's proof as open.

Two other claims did not hold up:

- **The convergence rate was wrong.** The whitepaper said the logistic learner converges at rate 1/T. The measured exponent is about 0.4.
- **The negative SGD result is confounded.** The two learners use different step schedules. Giving them the same schedule halves the polyhedral learner's regret, though logistic still wins.

`sgd_scalar`, the function behind that result, had no test.

## Fixed in this round

PR #14597 carries every fix. The scores above are from before it.

**git-bus-factor-check**
- The CLI now measures silence from the current time when it runs `git log` itself. A new test builds a repository dated 2020 and checks that it is reported orphaned.
- The browser engine no longer passes 200,000 timestamps as arguments to `Math.max`, which threw a RangeError on large logs.
- The Hercules wording is corrected, and a page test pins it.
- New tests pin the 500-line cap, the 180-day half-life, the 90-day window, and the 50% and 80% thresholds. All seven mutations I re-ran against the new tests now fail them.
- The `.mailmap`, all-departed-team and non-ASCII path gaps are listed in the README.

**tree-service-bid-calculator**
- The README now lists every localStorage key and every usage event. A page test enforces both against `index.html`.
- The dead-tree premium, the one mutation that survived, now has a test.
- The default-hours and stump-grinding gaps are listed under Limitations. Making the factors editable is a product change, left for a venture run.

**intent-twin**
- Three calibration miss probabilities and the ½ fallback are pinned against the independent enumeration. All three surviving mutations now fail.
- "Doubles the error" became "2.2–2.7×", and "≤ 4%" became "0.4–4.0%", to match `results.txt`.
- Wald (1947), Fisac et al. (RSS 2018) and Bobu et al. (HRI 2020) are cited.

**reject-surrogates**
- R1 and R2 are credited to Bartlett & Wegkamp, Theorems 1–2.
- The 1/T claim is corrected.
- The step-schedule confound is disclosed.
- `sgd_scalar` is tested. The test catches a sign flip in either update. It does not catch a change of the polyhedral step schedule; that change makes the learner better, so it is not a bug.

## What is not at the bar

None of the four. The binding gates are the same as in the last several rounds: verification and claims. In three of the four subjects, a seeded change to core logic left every test green.

Two failure modes are worth naming:

- **A default that only works on the test data.** The bus-factor tool's "now" choice is right for a pasted snapshot and wrong for a live repository. The fixture behaved like a snapshot, so the tests never saw the difference.
- **A known theorem presented as a finding.** The reject-surrogates note grid-searched its way to a constant that was already a published theorem. No literature check ran before the claim was written.
