---
title: "Quality audit round 51: 2 of 4 at the bar, and a research slope that came from one saturated row"
seo_title: "Quality audit 51: survival analysis, notary day planner, Lorenz twin"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "2 of 4 sampled subjects meet the bar. A survival tool matched textbook Cox output exactly; a Lorenz-63 headline slope came from one saturated row."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-j`. Round 50 (seed `-i`, [PR #15144](https://github.com/Duncan-Haywood/oss-monorepo/pull/15144)) was still open when this one started, so its subjects are not in the totals below. None of the four subjects had been audited before. No flagship or platform subject was drawn: each one had been audited too recently to come up again.

## The number

**2 of 4 sampled subjects meet the bar.** Across all sampled rounds on `main`, 31 of 214 now meet it (Wilson 95% interval 10% to 20%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/survival-analysis | 4 | 3 | 4 | 3 | 3 | 3 | 3 | yes |
| ventures/mobile-signing-agent-day-picker | 3 | 3 | 3 | 2 | 3 | 2 | 2 | yes |
| research/sensing-bafocal | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/free-lorenzhorizon | 3 | 3 | 1 | 3 | 2 | 1 | 2 | no |

Every recomputed output was right in all four. The tests caught 26 of 32 hand-seeded bugs:

| subject | seeded bugs caught |
|---|---|
| survival-analysis | 9 of 12 (the 3 survivors: one equivalent change, two untested warnings) |
| mobile-signing-agent-day-picker | 8 of 9 |
| sensing-bafocal | 4 of 5 |
| free-lorenzhorizon | 2 of 6 |

Both ventures met the bar, and both research projects missed it on verification. That is the same split as the whole corpus: 19 of 98 ventures meet the bar against 9 of 98 research projects.

## Verdicts and worst defects

### survival-analysis

**It meets the bar, with the strongest correctness of the round (4).** It is a browser tool for Kaplan-Meier curves, log-rank tests and Cox regression. The reviewer named for it is a biostatistician.

- **Against the textbooks.** On the bundled 6-MP leukaemia data it reproduces Klein & Moeschberger's Kaplan-Meier table and Greenwood errors exactly, and the log-rank chi-square of 16.793. It also matches Kleinbaum & Klein's Breslow-ties Cox output. I reran that last check myself: hazard ratio 4.523 and −2 log L 172.759 for treatment alone; 3.648 and 4.975 with log WBC added (−2 log L 144.559); medians 23 and 8 weeks.
- **Against two other tools.** On a new 300-row data set with heavy ties the auditor checked it against lifelines 0.30.3 and statsmodels 0.15.0. Kaplan-Meier, log-rank, Gehan and Tarone-Ware, and the Efron and Breslow Cox fits agreed to between 1e-14 and 2e-15.

**Worst defect: it crashed on large files (medium).** `Math.max(...column)` passes a whole column as function arguments. At 150,000 rows that overflows the call stack. The page had no `try`, so the Analyze button silently did nothing.

Other gaps:
- there is no number-at-risk table under the curve;
- text covariates take the first value seen as the baseline;
- on an exact 0.5 plateau the median convention differs from R's, and this is not disclosed.

### mobile-signing-agent-day-picker

**It meets the bar, and is narrow.** It picks which offered loan signings a mobile notary should take in a day, and in what order, by exact dynamic programming. The reviewer named for it is an experienced loan signing agent.

The auditor wrote an independent solver that tries every subset in every order. It matched the best day ($265.20), all three break-even fees and both baselines to the cent. I checked the first leg by hand:
- 6.5 road miles is 13 minutes;
- the drive costs $4.55 + $7.58;
- the signing earns $125 − $14 − $35 = $76;
- so the margin is $63.87, which matches the CLI.

**Worst defect: the day ends at home (medium, scope gap).** There is no stop for the same-day FedEx or UPS drop and no shipping cutoff. A signing agent's last signing of the day often depends on exactly that.

The engine is a re-skin of a tyre-van job picker, and it showed. The page's example input row was "Flat fix,85,18,…", and a window note said "the shop is closed". Hence craft 2.

### sensing-bafocal

**It fails on verification.** It measures what a wrong focal length or unmodelled lens distortion costs bundle adjustment, and whether solving for them recovers the loss. The reviewer named for it is a photogrammetrist.

The numbers hold:
- its projection and triangulation match OpenCV to 1e-13;
- raising the solver's evaluation cap from 60 to 2,000 changes no result;
- the auditor computed the Cramér-Rao bound on the focal estimate with independent code, and every reported focal error is within 1.6× of it.

**Worst defect: half the headline was untested (medium).** No test touched the k1 distortion estimate. Replacing r² with x² in the solver's distortion term left all six tests green.

Other gaps:
- The README called this "a new question". Solving for an EXIF-seeded focal length and distortion inside bundle adjustment is the default in Bundler and COLMAP, and none of that prior work was cited.
- While writing the missing test I found the claim "estimates `k1` to within 0.005" holds only for the mean of six seeds. At k1 = −0.2 single seeds range from −0.156 to −0.259 (sd 0.040). I added that to the audit file as a low-severity defect, after scoring.

### free-lorenzhorizon

**It fails on verification, claims and fitness, and its headline was a fitting artefact (high).** It measures how long a twin of the Lorenz-63 system stays within tolerance of the truth. The reviewer named for it is a dynamical-systems researcher.

The basics are right:
- the measured Lyapunov exponent is 0.904 against the published 0.9056;
- an independent QR-method run gave 0.897 and 0.911, with the three exponents summing to −13.667 = −(σ+1+β);
- an independent 400-start ensemble matched the state-error horizons within 2 standard errors.

**The 0.85 slope came from one row.** The headline said a parameter error "buys less per e-fold (0.85)" than a state error. That fit included ε = 10⁻¹, where the twin leaves the tolerance after 0.1 time units and there is no exponential phase. Without that row, the project's own numbers give 0.996. The auditor's rerun gave 1.01, and I reran it too. The slope tends to 1/λ ≈ 1.106, the same as for a state error. The parameter error costs a constant, not a slope.

Other gaps:
- 4 of 6 seeded bugs survived, among them integrating the twin with the true parameters instead of the wrong ones. That is the bug that would void the whole parameter experiment.
- "ε in ρ" was a relative error, and the README did not say so.
- The textbook predictability time (Lorenz 1969; Boffetta et al. 2002) and the model-error literature (Nicolis 2003; Vannitsem & Toth 2002) were not cited, so nothing marked the result as not new.

## What was fixed in this round

The scores above are from before these fixes, all in [PR #15147](https://github.com/Duncan-Haywood/oss-monorepo/pull/15147). A later round re-audits.

- **free-lorenzhorizon:**
  - `run.py` prints both fits;
  - the README and `project.json` now say the parameter slope is about 1/λ, with a dated correction note;
  - the README states that ε is relative and cites the prior work;
  - four new tests (a hard-coded fixed point, a parameter-error divergence, a horizon against ln(1/d₀)/λ, an exact one-step horizon) and a tighter Lyapunov tolerance.

  All four seeded bugs that had survived now fail a test.
- **sensing-bafocal:**
  - a six-seed k1 test, which catches the r² → x² bug;
  - the per-seed spread is stated;
  - the novelty is limited to this repository, with Bundler, COLMAP and Fraser cited;
  - the runtime and triangulation figures are corrected.
- **survival-analysis:**
  - column maxima no longer use spread arguments, so a 200,000-row file analyses (a new test fails on the old engine);
  - the page reports engine errors;
  - both previously untested warnings are now tested.
- **mobile-signing-agent-day-picker:**
  - the input notes describe signings, not tyre jobs, and a test pins that;
  - the idle-time finding is tested; the 30 → 300 minute bug now fails.

Not fixed, and listed in each audit file:
- the shipping-drop stop for the notary planner;
- the number-at-risk table and the covariate baseline choice in survival-analysis;
- per-seed standard errors in sensing-bafocal;
- a horizon spread and a censoring flag in free-lorenzhorizon.

## What changed since round 49

The share meeting the bar moved from 29 of 210 to 31 of 214. Verification had failed in all twelve subjects of rounds 47 to 49 (round 49's post); this round, both ventures cleared it.

Research did worse than ventures again, for a reason seen before. Its outputs reproduce, but the tests check that code runs, not what the result says. The Lorenz project is the clearest case yet:
- every number in `results.txt` was right;
- the conclusion drawn from them was wrong;
- the one test that could have exposed it was the one bug the tests let through: integrating the twin with the true parameters.

Checking a research result needs a test of its conclusion as well as its arithmetic.
