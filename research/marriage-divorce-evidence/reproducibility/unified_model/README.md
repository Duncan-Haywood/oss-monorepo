# Pooled multi-survey model: nine surveys in one Bayesian hazard, validated against each single-survey lens

**Status (2026-10-20): validation complete, not shipped to the app.** Held out by person, the
pooled model beats the single-survey lenses only in the small surveys (HCMST, the Los Angeles
newlyweds). It ties or loses in the large ones, so it is not wired into the calculator. This
folder holds the code, the aggregate validation tables and the open items.

## What it is

It is one discrete-time (piecewise-constant) hazard of marital dissolution, fitted jointly on
every survey in this project that has person-level records:

- NSFG 1995–2023: 43,336 first marriages
- NLSY79: 6,685
- NLSY97: 5,076
- SIPP marital histories: 175,840
- SIPP couples, one year ahead: 33,698 couple-years
- Statistics Canada GSS: 48,656
- GSS panels: 4,453 two-year transitions
- HCMST 2009: 3,009 couples, married and unmarried
- Los Angeles newlyweds: 368 couples

In total that is **321,121 units and 96,081 events**. ACS is not stacked: it stays a
cross-sectional baseline. `harmonize.py` reads each survey through its lens's committed
builder, so samples, timing and outcome definitions are the lenses' own. Person-level files
stay in scratch and are never committed to git.

* **Inputs.** There are 44 harmonised inputs: every input any survey measured before the
  outcome window.
  - Marriage and couple: age at marriage, wedding year, the spouses' age gap, race and ethnicity
    (5 levels), nativity, both spouses' education and an interracial-couple flag.
  - Family of origin: intact family of origin and mother's education.
  - Religion and politics: religion raised and religion now, attendance at full GSS resolution
    (including *more than once a week*), prayer, political views (7 points) and party.
  - Relationship history: cohabited first, earlier cohabitation with someone else, a premarital
    birth, either spouse married before, the spouse's children, and premarital sex years and
    partners.
  - The relationship itself: marriage happiness, newlywed satisfaction, hostility and observed
    negativity, and ever unfaithful.
  - Money and work: household income, own earnings, net worth, home ownership, both spouses
    working and occupational prestige.
  - Place and person: region (including Canada), urban, self-rated and mental health,
    self-esteem, AFQT and youth delinquency, plus sex, union type and same-sex couple.

  `measured_share_by_survey.csv` gives the share of units that answered each input in each survey.
  Coarsened answers are kept as bounds rather than discarded: NSFG's "BA by the wedding", the
  NLSY attendance bands and "non-Black non-Hispanic".
* **Model** (`glm.py`, `design.py`).
  - Survey baselines: a global duration curve, a survey level, a survey-specific shape shrunk
    towards the global curve, and a survey cohort slope.
  - Shared effects: 95 design columns, including a wedding-year spline.
  - Survey deviations: each input's primary contrast may differ by survey, with prior
    N(0, τ²). τ = 0.1 was chosen by the Laplace marginal likelihood; the log evidence was
    −328,822, −328,809, −328,844 and −328,907 at τ = 0.05, 0.1, 0.2 and 0.4.
  - Likelihood: exact-time follow-up contributes Poisson terms by duration band. Panel spells
    contribute a complementary log-log term for "the event fell somewhere in this spell".
  - Posterior: a Laplace approximation for each imputation, combined as an equal mixture over
    imputations. MCMC was not used: 321,000 units × 330 parameters × 14 validation fits would
    take days on four cores.
* **Inputs a survey never asked** (`mice.py`).
  - Multiple imputation by chained equations runs across the stacked surveys. It is proper (each
    conditional model is fitted to a bootstrap of the observed rows).
  - Numbers and ordered codes use predictive mean matching inside each unit's bounds.
    Categories use logistic and multinomial draws restricted to the allowed set.
  - Survey dummies cover the surveys that measured the input. Units from other surveys get the
    average of those surveys' intercepts.
  - The outcome (events and cumulative baseline hazard) enters only within the survey that
    measured the input. A first version applied one outcome coefficient across all surveys: it
    was learned in 2-year GSS windows and applied to 30-year NSFG histories. Its imputed values
    encoded the outcome, and held-out loss was over 1,000% worse than duration-only.
  - Held-out units are always imputed without their outcome, from models fitted on training
    units only.
  - In the analysis model, an input a survey never measured is held at that survey's mean for
    its units, a constant its baseline absorbs. So that survey **neither informs nor biases**
    the input's effect. The cost is that its other effects are not adjusted for that input.
  - Transportability assumption: an input relates to dissolution the same way in every survey
    that measured it, apart from the estimated deviations. Validation 2 below tests it by
    leaving whole surveys out.
* **Flexible competitor:** Poisson gradient boosting on the stacked unit × band rows. It uses
  the raw inputs with missing values handled natively, and the survey as a categorical input.

## Validation 1: held out by person within each survey

Each survey is split into five person (household) folds. Each fold imputes (5 chains) and fits
on the training units of every survey, then predicts the held-out units. On the same held-out
units the comparison also includes:

- the survey's own duration-only baseline;
- a single-survey Bayesian GLM: the same model, fitted on that survey alone with the inputs it
  measured, using the lenses' median fill and missing indicators (the lens analogue);
- single-survey gradient boosting;
- pooled gradient boosting.

Definitions:

- Gain = 1 − deviance ÷ duration-only deviance, weighted by survey weights.
- C = Harrell's C of the 10-year cumulative hazard.
- Slope = the calibration slope over every unit-band.
- 95% confidence intervals come from 200 cluster bootstrap resamples. For C they come from 100
  resamples of at most 6,000 units.

All models were fitted unweighted. Weighted O/E below 1 in NSFG and Canada (0.83 for
duration-only) is therefore shared by every model, duration-only included. It measures the gap
between the sample and the weighted population, not a difference between models.

| Survey | Model | Gain % (95% CI) | C-index (95% CI) | AUC 5y | O/E (95% CI) | Slope |
|---|---|---|---|---|---|---|
| nsfg | Single-survey GLM | 5.50 (5.17 to 5.89) | 0.686 (0.671–0.702) | 0.707 | 0.845 (0.822–0.866) | 1.08 |
| nsfg | Single-survey boosting | 6.27 (5.84 to 6.73) | 0.696 (0.676–0.710) | 0.716 | 0.809 (0.789–0.828) | 1.01 |
| nsfg | **Pooled Bayesian GLM** | 4.66 (4.31 to 4.98) | 0.674 (0.659–0.693) | 0.692 | 0.847 (0.825–0.868) | 1.08 |
| nsfg | Pooled boosting | 6.49 (6.11 to 6.87) | 0.697 (0.682–0.710) | 0.718 | 0.824 (0.801–0.842) | 1.06 |
| nlsy79 | Single-survey GLM | 3.96 (3.32 to 4.63) | 0.657 (0.647–0.674) |  | 0.987 (0.940–1.032) | 1.03 |
| nlsy79 | Single-survey boosting | 1.07 (-0.13 to 2.14) | 0.638 (0.625–0.652) |  | 0.826 (0.782–0.869) | 0.71 |
| nlsy79 | **Pooled Bayesian GLM** | 3.46 (2.83 to 4.11) | 0.649 (0.636–0.662) |  | 0.990 (0.943–1.039) | 1.02 |
| nlsy79 | Pooled boosting | 4.37 (3.48 to 5.20) | 0.658 (0.644–0.672) |  | 0.970 (0.923–1.022) | 0.98 |
| nlsy97 | Single-survey GLM | 5.30 (4.59 to 6.08) | 0.680 (0.666–0.692) | 0.703 | 0.988 (0.937–1.039) | 0.95 |
| nlsy97 | Single-survey boosting | 0.74 (-0.75 to 2.19) | 0.662 (0.649–0.678) | 0.686 | 0.811 (0.767–0.860) | 0.56 |
| nlsy97 | **Pooled Bayesian GLM** | 4.96 (4.24 to 5.79) | 0.672 (0.658–0.686) | 0.693 | 0.994 (0.946–1.047) | 0.96 |
| nlsy97 | Pooled boosting | 5.35 (4.49 to 6.23) | 0.679 (0.665–0.690) | 0.707 | 0.931 (0.886–0.976) | 0.89 |
| sipp_retro | Single-survey GLM | 2.93 (2.82 to 3.05) | 0.640 (0.616–0.644) | 0.660 | 1.006 (0.996–1.015) | 0.99 |
| sipp_retro | Single-survey boosting | 4.46 (4.33 to 4.60) | 0.644 (0.617–0.650) | 0.676 | 1.004 (0.995–1.013) | 1.01 |
| sipp_retro | **Pooled Bayesian GLM** | 2.90 (2.78 to 3.03) | 0.639 (0.618–0.646) | 0.657 | 1.006 (0.996–1.015) | 1.00 |
| sipp_retro | Pooled boosting | 4.26 (4.13 to 4.39) | 0.644 (0.621–0.650) | 0.674 | 1.006 (0.997–1.015) | 1.04 |
| sipp_couples | Single-survey GLM | 3.62 (0.97 to 6.71) | 0.824 (0.769–0.876) |  | 1.042 (0.930–1.155) | 0.72 |
| sipp_couples | Single-survey boosting | -11.98 (-15.62 to -8.48) | 0.741 (0.651–0.813) |  | 1.617 (1.428–1.830) | 0.31 |
| sipp_couples | **Pooled Bayesian GLM** | 3.23 (1.68 to 5.12) | 0.847 (0.796–0.897) |  | 1.026 (0.912–1.152) | 0.81 |
| sipp_couples | Pooled boosting | 2.55 (0.87 to 4.31) | 0.839 (0.766–0.884) |  | 1.031 (0.917–1.155) | 0.73 |
| canada_gss | Single-survey GLM | 3.15 (2.87 to 3.39) | 0.655 (0.636–0.671) | 0.698 | 0.811 (0.792–0.828) | 1.05 |
| canada_gss | Single-survey boosting | 3.40 (3.06 to 3.72) | 0.659 (0.653–0.682) | 0.703 | 0.798 (0.781–0.814) | 0.98 |
| canada_gss | **Pooled Bayesian GLM** | 2.74 (2.46 to 2.97) | 0.645 (0.636–0.666) | 0.680 | 0.816 (0.798–0.832) | 1.07 |
| canada_gss | Pooled boosting | 3.90 (3.58 to 4.16) | 0.661 (0.647–0.678) | 0.706 | 0.811 (0.793–0.828) | 1.09 |
| gss_panel | Single-survey GLM | 5.61 (1.10 to 10.42) | 0.838 (0.809–0.864) |  | 0.999 (0.835–1.161) | 0.66 |
| gss_panel | Single-survey boosting | -0.84 (-5.14 to 4.86) | 0.808 (0.773–0.835) |  | 1.351 (1.133–1.588) | 0.53 |
| gss_panel | **Pooled Bayesian GLM** | 7.31 (3.08 to 11.72) | 0.842 (0.810–0.872) |  | 0.979 (0.806–1.128) | 0.78 |
| gss_panel | Pooled boosting | 8.31 (4.77 to 11.84) | 0.854 (0.810–0.885) |  | 1.046 (0.864–1.221) | 0.90 |
| hcmst | Single-survey GLM | 12.92 (8.54 to 18.01) | 0.878 (0.865–0.896) |  | 0.898 (0.801–0.991) | 0.81 |
| hcmst | Single-survey boosting | 12.15 (7.33 to 16.83) | 0.887 (0.870–0.900) |  | 1.034 (0.887–1.166) | 0.75 |
| hcmst | **Pooled Bayesian GLM** | 17.73 (13.58 to 21.43) | 0.901 (0.890–0.912) |  | 0.953 (0.847–1.054) | 0.87 |
| hcmst | Pooled boosting | 15.81 (12.34 to 19.19) | 0.903 (0.891–0.914) |  | 1.024 (0.911–1.126) | 0.99 |
| la_newlyweds | Single-survey GLM | 2.12 (-0.82 to 5.04) | 0.621 (0.578–0.684) |  | 0.986 (0.848–1.135) | 0.57 |
| la_newlyweds | Single-survey boosting | -4.17 (-10.03 to 0.04) | 0.594 (0.550–0.649) |  | 0.961 (0.811–1.157) | 0.29 |
| la_newlyweds | **Pooled Bayesian GLM** | 3.89 (1.77 to 6.50) | 0.642 (0.594–0.694) |  | 0.992 (0.859–1.141) | 0.77 |
| la_newlyweds | Pooled boosting | 2.94 (0.10 to 5.54) | 0.628 (0.570–0.683) |  | 1.022 (0.887–1.170) | 0.69 |

**Head to head with each survey's own GLM, on the same people.** Each row is the pooled
Bayesian GLM's gain minus the single-survey GLM's gain, in percentage points, with a paired
bootstrap 95% CI. Positive means pooled is better. `head_to_head.csv` also compares against
both boosting models.

| Survey | Pooled GLM − own GLM (95% CI) | C difference | Verdict |
|---|---|---|---|
| nsfg | −0.85 (−1.00 to −0.71) | −0.012 | pooled worse |
| nlsy79 | −0.50 (−0.73 to −0.20) | −0.008 | pooled worse |
| nlsy97 | −0.34 (−0.73 to +0.09) | −0.007 | tie |
| sipp_retro | −0.03 (−0.04 to −0.01) | −0.001 | pooled worse (negligible) |
| sipp_couples | −0.39 (−2.88 to +1.77) | +0.022 | tie |
| canada_gss | −0.40 (−0.51 to −0.30) | −0.010 | pooled worse |
| gss_panel | +1.70 (−1.02 to +4.68) | +0.004 | tie |
| hcmst | **+4.81 (+1.88 to +7.79)** | +0.023 | pooled better |
| la_newlyweds | **+1.78 (+0.60 to +3.16)** | +0.021 | pooled better |

**Reading.**

- Pooling helps where a survey is small and the inputs it measured are shared with large
  surveys: HCMST and the Los Angeles newlyweds.
- It ties in NLSY97, SIPP couples and the GSS panels.
- It costs 0.4–0.9 points in the large surveys. Their own data already pin their effects down,
  and the pooled model shrinks away their survey-specific structure: only one primary contrast
  per input may differ by survey.
- Pooled boosting is the most accurate model in the large surveys (NSFG 6.49% against 5.50%
  for the single-survey GLM).
- Single-survey boosting overfits the small surveys (SIPP couples −12%).

## Validation 2: leave one survey out

The model is fitted on the other eight surveys, imputation included, and predicts every unit of
the left-out survey in two ways:

- (a) with no information about that survey: the global duration curve plus the average survey
  level;
- (b) with its baseline re-estimated from its own other folds, effects held fixed.

Both are compared on the same units with the survey's own GLM and with the full pooled model.

| Survey | Left out, average baseline: gain % (95% CI), O/E | Left out, own baseline re-estimated: gain % (95% CI), O/E | Own single-survey GLM | Pooled GLM (survey included) | Pooled boosting, left out |
|---|---|---|---|---|---|
| nsfg | 1.80 (1.33 to 2.19), 1.47 | 3.72 (3.45 to 3.98), 0.84 | 5.50 | 4.66 | 1.99 |
| nlsy79 | 2.65 (2.14 to 3.18), 0.99 | 2.88 (2.36 to 3.41), 1.02 | 3.96 | 3.46 | 2.58 |
| nlsy97 | 3.98 (3.18 to 4.77), 0.98 | 4.34 (3.52 to 5.15), 1.02 | 5.30 | 4.96 | 2.58 |
| sipp_retro | −2.49 (−2.64 to −2.34), 1.70 | 1.80 (1.69 to 1.93), 0.99 | 2.93 | 2.90 | −2.08 |
| sipp_couples | 1.36 (−0.39 to 2.96), 0.74 | 1.77 (0.26 to 3.02), 1.02 | 3.62 | 3.23 | 1.28 |
| canada_gss | 2.44 (2.20 to 2.64), 0.94 | 2.05 (1.83 to 2.23), 0.82 | 3.15 | 2.74 | −1.89 |
| gss_panel | −63.55 (−83.90 to −45.41), 0.22 | 7.37 (4.18 to 11.39), 0.99 | 5.61 | 7.31 | 5.61 |
| hcmst | −9.16 (−15.94 to −1.41), 0.76 | 4.43 (−0.46 to 8.87), 0.98 | 12.92 | 17.73 | −12.08 |
| la_newlyweds | 1.69 (−0.25 to 3.94), 1.30 | 1.91 (0.48 to 3.19), 1.07 | 2.12 | 3.89 | 0.68 |

**Reading.**

- With its own baseline re-estimated, a survey the model never saw is predicted at about half
  to nine-tenths of its own model's skill (HCMST is the exception at about a third):
  - NLSY97: 4.34% against 5.30%.
  - NSFG: 3.72% against 5.50%.
  - SIPP histories: 1.80% against 2.93%.
  - HCMST: 4.43% against 12.92%. Relationship quality and union type are measured almost only
    in HCMST.
  - GSS panels: 7.37% against 5.61%, better than its own model.
- With no baseline information, level errors dominate wherever a survey's design differs. The
  GSS panels give O/E 0.22: they are two-year windows of mostly long marriages. SIPP histories
  give 1.70 and NSFG 1.47.
- The effects transport across surveys; the baselines do not.

## Validation 3: interval coverage

The groups are each survey × tenth of predicted risk × fold: 450 groups of held-out units. For
each group, the 90% posterior predictive interval of the event count (200 posterior draws plus
Poisson noise) contained the observed count in **85.3%** of groups. The 50% intervals contained
it in 57.6%.

By survey, the 90% intervals covered 84–96% of groups in the seven smaller surveys, but only
**64% in NSFG and 62% in SIPP histories**. Those groups hold hundreds to thousands of events, so
small miscalibrations (including the gap between unweighted fit and weighted population) exceed
the posterior's sampling uncertainty. The intervals are too narrow there. Data:
`coverage_by_group.csv`, `validation_summary.json`, `heldout_calibration_deciles.csv`.

## Action items for a later run

1. **The final fit and export were not run.** `export.py` is written and passed a smoke run with
   2 imputations, but was stopped before the final run. It does the following:
   - fits 10 imputations on all units;
   - writes a coefficient table with each coefficient's fraction of missing information and the
     surveys that inform it, plus the survey deviations;
   - runs a posterior predictive check by survey × band;
   - estimates the outcome-definition layer (legal divorce against any separation);
   - checks the Gaussian treatment of blank inputs against multiple imputation;
   - builds the OOD block and population references;
   - writes `app/models/unified_multisurvey.json` and synthetic parity vectors.

   First add the planned weighted re-levelling of the survey × band baselines, so the baselines
   describe the weighted population rather than the sample.
2. **The browser scorer is not wired.** `unified.js.pending` (to become `app/unified.js`)
   mirrors `score.py` loop for loop: posterior draws, Gaussian integration over blank inputs,
   and population, outcome and window selection. `unified.test.mjs.pending` is its parity test
   (1e-9 against Python). Neither is in the app: the model does not beat the single-survey
   lenses held out in the large surveys, and there is no exported bundle yet. The UI work it
   would then need:
   - the new inputs, each showing which surveys measured it (`measured_in`);
   - a population, outcome and window selector;
   - a display of the 90% interval.
3. **Improve the pooled model where it loses.**
   - Let every design column deviate by survey in the large surveys, not one contrast per input
     (or use hierarchical boosting), then re-run validation.
   - Pooled boosting already beats the single-survey GLM in NSFG, NLSY79, NLSY97, SIPP histories
     and Canada, but transports poorly when a whole survey is left out.
4. **Test transportability further.** Refit with the systematically missing inputs dropped, and
   compare each effect across the surveys that measured it.
5. **Reuse the other harmonised extracts** in the shared scratch area (`harmonized/`): NSFG
   attendance at 14 for the 2006–2019 cycles, and the GSS occupation group and wealth band.
6. **Finish the documentation once the bundle exists.** Write METHODS with the final
   coefficients, then add a project README section, a LOG entry and a DATA_SOURCES note.

## Reproduce

```sh
python3 -I harmonize.py WORK    # paths to each lens's built files: environment variables in harmonize.py
python3 -I validate.py tau WORK
for t in cv:0 cv:1 cv:2 cv:3 cv:4 loso:nsfg loso:nlsy79 loso:nlsy97 loso:sipp_retro \
         loso:sipp_couples loso:canada_gss loso:gss_panel loso:hcmst loso:la_newlyweds; do
  python3 -I validate.py task WORK $t; done   # 14-30 min each, about 3 GB RAM; OMP_NUM_THREADS=1
python3 -I report.py WORK
```
