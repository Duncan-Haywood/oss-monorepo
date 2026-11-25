# Meta-analysis: pool studies, measure how much they disagree, predict the next one

**Live:** https://marisstella.app/meta-analysis/

Paste one row per study and get a random-effects meta-analysis: the pooled effect, how much
the studies disagree, where the next study's true effect is likely to fall, whether small
studies tell a different story, and whether a study-level variable explains the differences.

- **Inputs:** 2x2 counts (events and non-events, or events and totals, in two groups), means
  with SDs and sizes, or any effect with a standard error, a variance, or a confidence interval
  (ratios such as OR, RR or HR are recognised and pooled on the log scale).
- **Measures:** risk ratio, odds ratio, risk difference, mean difference, Hedges' g.
- **Between-study variance:** REML (default), DerSimonian-Laird, Paule-Mandel, or none
  (common effect). Every estimator is shown side by side.
- **Intervals:** Wald and Hartung-Knapp for the pooled effect; a prediction interval for a new
  study; a Q-profile interval for tau-squared and I-squared.
- **Checks:** forest plot, funnel plot with Egger's test, leave-one-out.
- **Meta-regression** on one numeric moderator, with R-squared and a bubble plot.

Free to use and source available (FSL-1.1-MIT). Runs in the browser; nothing is uploaded. Zero dependencies.

**No warranty.** Statistical estimates from the study results you supply, not medical, legal,
tax, financial or professional advice. A pooled number is only as good as the studies and how
they were found; this does not search, screen or assess risk of bias, which a systematic review
(for example to the Cochrane Handbook or PRISMA) does.

## Use it

- Browser: open `index.html` (or the live page), paste a CSV, press *Pool the studies*.
- Command line: `node cli.mjs data/bcg-vaccine-trials.csv --moderator ablat`
  (`--help` lists the options; `--json` prints everything; `--columns ai=...,bi=...` names
  columns the matcher does not recognise).
- Agents: `node platform/agents/tools.mjs call meta-analysis analyze --input '{"csv":"study,yi,sei\nA,0.1,0.05\n..."}'`
  from the repository root, or the same through its MCP server.

## Example: BCG vaccine trials

The bundled data are the 13 BCG vaccine trials of Colditz et al. (1994) (`data/SOURCE.md`).
On the risk-ratio scale, with REML:

| | value |
| --- | --- |
| Pooled risk ratio | 0.489 (95% CI 0.344 to 0.696) |
| Hartung-Knapp 95% CI | 0.330 to 0.726 |
| tau-squared | 0.3132 (Q-profile 95% CI 0.120 to 1.111) |
| I-squared | 92.2% (81.9% to 97.7%) |
| 95% prediction interval | 0.134 to 1.785 |
| Egger's test | intercept -2.11, p = 0.189 |

On average the vaccine roughly halves the risk of tuberculosis, but the trials disagree far more
than chance allows, and the prediction interval runs past 1: in some settings it did nothing.
Absolute latitude explains most of the disagreement: in a REML meta-regression each degree
further from the equator multiplies the risk ratio by 0.971 (Wald p < 0.0001; Knapp-Hartung
p = 0.0046), and residual
tau-squared falls from 0.313 to 0.076 (R-squared 75.6%). Leaving out any one trial moves the
pooled risk ratio between 0.452 and 0.533.

## Verification

Run `node --test` in this directory (or
`python3 platform/ci/run_venture_tests.py meta-analysis` from the root).

- **Against statsmodels and scipy.** `eval/reference.py` computes the bundled trials' effect
  sizes by formula, pools them with statsmodels 0.15.0 (`combine_effects`: DerSimonian-Laird,
  Paule-Mandel, Q, I-squared, the Hartung-Knapp interval), finds REML by maximising the
  restricted likelihood directly with scipy (the engine uses Fisher scoring), and does the same
  for the meta-regression on latitude with all three estimators, the Q-profile interval (scipy
  `brentq`), Egger's test (statsmodels OLS), DL leave-one-out, the zero-cell correction and
  Hedges' g (statsmodels `effectsize_smd`). `engine.test.mjs` requires agreement to 1e-9 for
  closed-form results and 1e-6 for the iterative ones (the references' own tolerances).
- **Against metafor's printed output.** metafor's README fits these trials with
  `rma(yi, vi, test = "knha")`; the tests assert tau-squared 0.3132, I-squared 92.22%,
  Q = 152.2330, estimate -0.7145, se 0.1808, t -3.9522, p 0.0019 and interval -1.1084 to -0.3206,
  every digit it prints. It also fits the latitude meta-regression with `mods = ~ ablat`
  (tau-squared 0.0764, residual I-squared 68.39%, R-squared 75.62%, QE 30.7331, slope -0.0291 with
  Knapp-Hartung se 0.0082, t -3.5483, p 0.0046). The tests check each of those to within 1.5
  units of its last printed digit: REML here converges to tau-squared 0.076348, the value scipy's
  direct maximisation gives, while metafor's iterations stop at their own convergence threshold, so a few of its
  figures differ in the last digit (75.63% and t -3.5484 here).
- **Coverage by simulation.** `node eval/coverage.mjs 2000` (seeded; output in
  `eval/coverage.json`) draws 2000 meta-analyses per setting, true mean 0, within-study variances
  uniform on [0.01, 0.25]:

  | studies | tau-squared | mean I² | DL Wald | REML Wald | REML Hartung-Knapp | HK width / Wald | prediction interval holds |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | 5 | 0.05 | 28% | 90.8% | 90.8% | 93.3% | 1.31 | 93.4% |
  | 5 | 0.20 | 52% | 87.2% | 87.5% | 93.2% | 1.38 | 90.5% |
  | 10 | 0.05 | 29% | 92.3% | 92.4% | 93.5% | 1.12 | 85.1% |
  | 10 | 0.20 | 60% | 91.1% | 90.8% | 93.8% | 1.15 | 89.7% |
  | 20 | 0.05 | 33% | 92.7% | 92.7% | 93.5% | 1.06 | 85.1% |
  | 20 | 0.20 | 67% | 93.6% | 93.8% | 95.5% | 1.07 | 92.6% |

  With 2000 draws the standard error of a coverage near 95% is about 0.5 points. The Wald
  interval falls 2 to 8 points short of 95%, worst with five studies and real heterogeneity;
  Hartung-Knapp is within about 2 points everywhere. The prediction interval holds less than 95%
  of the true study effects when heterogeneity is modest (85%), because REML often estimates
  tau-squared near zero there, and the interval then shrinks to little more than the confidence
  interval.
- **Properties.** Tests check study-order invariance, shift equivariance, that every estimator
  collapses to the common effect when studies agree exactly, that REML's answer is a likelihood
  maximum, and that the events-and-totals, estimate-and-interval and effect-and-SE layouts
  reproduce the 2x2 answer.
- Page tests check the disclaimer, labels, JSON-LD against the visible FAQ, no network calls,
  that every id the script uses exists, that the example is the bundled file verbatim, that every
  paper in `PAPERS` has BibTeX on the page, and that the coverage figures quoted on the page are
  the ones in `eval/coverage.json`.

## Conventions, and where other software differs

- **I-squared** is tau-squared / (tau-squared + s²), s² the typical within-study variance
  (Higgins & Thompson 2002), as in metafor. For DL it equals (Q - df)/Q; the Q-based value is
  also in the JSON (`I2fromQ`).
- **Prediction interval** uses t on k - 2 df, as Riley, Higgins & Deeks (2011) suggest. metafor's default uses the normal quantile, or t on k - 1 df with
  `test = "knha"`, so its BCG interval (0.14 to 1.76) is a little narrower than this one
  (0.134 to 1.785).
- **Egger's test** is the original OLS regression of y/SE on 1/SE (Egger et al. 1997). metafor's
  `regtest()` defaults to a mixed-effects meta-regression on the SE, a different test (on these
  trials it gives p = 0.45 against 0.19 here).
- **Hartung-Knapp** is not truncated at 1 (no "ad hoc" variant), matching statsmodels and
  metafor's default.
- **Zero cells**: 0.5 is added to all four cells of a table with a zero, for OR and RR only;
  studies with no events in either group are left out of ratio analyses, and named.
- **Hedges' g** uses J = 1 - 3/(4df - 1) and the variance J² [(n1+n2)/(n1 n2) + d²/(2(n1+n2))]
  (Borenstein et al. 2009, ch. 4). statsmodels' `effectsize_smd` uses the same g but a slightly
  different variance (N - 3.94 in the denominator).

## Method

DerSimonian & Laird (1986); REML by Fisher scoring (Viechtbauer 2005); Paule & Mandel (1982);
Knapp & Hartung (2003); Higgins & Thompson (2002); Riley, Higgins & Deeks (2011);
the Q-profile interval (Viechtbauer 2007); Egger et al. (1997); Hedges (1981). Full references
are in `engine.mjs` (`PAPERS`) and on the page with BibTeX. Implemented from the papers'
mathematics; no third-party code was ported.

Not modelled: dependent effect sizes within a study, network meta-analysis, individual
participant data, Mantel-Haenszel and Peto pooling, trim-and-fill and selection models,
categorical subgroup tests, and Bayesian estimators.

## Files

`engine.mjs` (all statistics), `cli.mjs`, `index.html`, `example-data.mjs` (the CSV, verbatim),
`usage.mjs` (local-only counters with an opt-out), `data/`, `eval/`.
