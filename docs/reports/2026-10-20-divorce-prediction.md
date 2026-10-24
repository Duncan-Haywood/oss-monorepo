# Predicting divorce from public survey data: what more data, more inputs and more flexible models bought

**Date:** 2026-10-20. **Asked by:** the owner, who wanted the
[marriage and divorce calculator](/research/marriage-divorce-evidence/) to become a decision
aid. The asks were: more data, more inputs, better models, comparisons with the population,
partner what-ifs, and a report conditioned on your own profile.
**Method:** the analyses in [`research/marriage-divorce-evidence/`](/research/marriage-divorce-evidence/).
Every number below is held out by person or couple, and every interval is a 95% bootstrap
interval over people or couples, unless marked otherwise. Only aggregate tables are in git.
The action items left open are in
[`NEXT.md`](/research/marriage-divorce-evidence/NEXT.md).

## The short version

- **The data are now broad.** The calculator has more than a dozen survey "lenses":
  - NSFG 1995–2023, NLSY79 and NLSY97;
  - the GSS panels and HCMST;
  - SIPP, ACS 2008–2024 and the Statistics Canada GSS;
  - a 12-year Los Angeles newlywed study.

  Each lens is fitted and validated on its own data, with no pooling. The outcome is the chance
  of a marriage ending, or for HCMST a couple breaking up.
- **More inputs did not help prediction.** Seven lenses were refitted with every richer
  pre-outcome input their data hold: finer race and ethnicity, family of origin, religious
  attendance at nine levels (including "more than once a week"), prayer, denomination,
  political views and party, occupation, and wealth. No block added held-out skill with an
  interval excluding zero. The best was religion plus politics in the GSS: +0.51 points
  (−0.62 to +1.56).
- **More flexible models did not help either.** On five lenses, tuned LightGBM, gradient
  boosting, forests, extra trees, an EBM, an elastic net with pairwise interactions and a stack
  all failed to beat the lens's own additive model with an interval above zero.
- **Pooling nine surveys in one Bayesian model helped only where data are thin.** It improved
  HCMST by +4.8 points (1.9 to 7.8) and the newlyweds by +1.8 (0.6 to 3.2). It was slightly
  worse in the large surveys.
- **The limit is the outcome, not the method.** Learning curves level off after about three
  quarters of the data, and two to eight inputs carry most of the skill. What survey answers
  can say about a particular marriage has been mostly used up.
- **What changed for users** is the decision aid around the models:
  - a profile report showing who people like you marry and what that implies;
  - a "date everyone" baseline;
  - factors ranked by impact, with evidence grades;
  - satisfaction by years married;
  - a predictor atlas of 1,159 traced associations.

## 1. Does adding inputs improve prediction?

Each extended model was compared with the lens's current model on the same folds. Gain is the
held-out loss reduction in percentage points, with a paired bootstrap interval.

| Lens | Block added | Gain vs current (95% CI) |
| --- | --- | --- |
| GSS panels | religion (attendance at 9 levels, prayer, strength, fundamentalism, denomination) | +0.10 (−0.62 to +0.80) |
| GSS panels | political views and party | +0.24 (−0.56 to +0.96) |
| GSS panels | religion + politics | +0.51 (−0.62 to +1.56) |
| GSS panels | occupation and prestige | −0.38 |
| GSS panels | all new blocks | −1.39 |
| SIPP couples | both spouses' occupations | +0.11 (−0.08 to +0.30) |
| SIPP couples | wealth components | −0.35 (−0.83 to +0.16) |
| NLSY97, NLSY79, NSFG | each block | within ±0.12 |

Several of these variables still sort risk on their own; they just add nothing once the
models' existing inputs are known:

| Factor | Ratio (95% CI) | Source |
| --- | --- | --- |
| Parents never married each other, vs both parents | rate ratio 1.59 (1.31–2.13) | Canada 2017 |
| Parents divorced or separated, vs both parents | rate ratio 1.30 (1.11–1.57) | Canada 2017 |
| A parent died, vs both parents | rate ratio 1.01 (0.80–1.29) | Canada 2017 |
| Stepfamily | rate ratio 1.52 (1.35–1.68) | NSFG |
| Each extra $100k of net worth before the wedding | rate ratio 0.90 (0.80–0.99) | NLSY79 |

The ACS divorce rates over one year, per 1,000 married people, also vary widely by group:

| Group | Divorces per 1,000 |
| --- | --- |
| Asian | 8.3 |
| White | 12.3 |
| Hispanic | 15.3 |
| Black | 23.6 |
| Asian Indian | 5.2 |
| Vietnamese | 14.4 |
| Household income under $25k | 31.7 |
| Household income $200k or more | 6.3 |

These ACS rates are measured after any divorce, so they describe groups and are not
predictors.

## 2. Do flexible models beat additive ones?

Models were tuned with nested, grouped cross-validation, using each lens's widest feature set.

| Lens | Additive gain % | Best flexible | Difference (95% CI) | AUC/C, additive → best |
| --- | --- | --- | --- | --- |
| GSS panels | 8.56 | random forest | +0.42 (−1.55 to 2.25) | 0.726 → 0.730 |
| HCMST | 27.00 | GLM + LightGBM stack | +0.65 (−0.11 to 1.43) | 0.878 → 0.879 |
| LA newlyweds* | 9.62 | elastic net + pairs | +2.15 (−1.91 to 5.45) | 0.635 → 0.702 |
| SIPP couples* | 5.77 | EBM | +1.01 (−0.52 to 2.95) | 0.695 → 0.710 |
| NLSY79 couples* | 3.40 | stack | +0.13 (−0.10 to 0.38) | 0.666 → 0.665 |

\* Preliminary: one repeat with reduced tuning.

Overfitting is the reason:
- **Training versus held out.** On GSS, LightGBM scored 44.5% on training folds and 7.4% held
  out. The GLM scored 17% and 8.6%.
- **Calibration.** On the small lenses, tree models' calibration slopes fell to 0.55–0.81. A
  slope below 1 means the predictions are too extreme.
- **Shuffled outcomes.** With outcomes shuffled, every model scored at or below zero, so the
  pipeline is not inventing skill.
- **More inputs in the same GLM** made it worse held out in four of five lenses.

The six largest lenses (NSFG pooled, NLSY79, NLSY97, Canada, SIPP retrospective, ACS) did not
finish. That is where boosting earlier showed small edges, such as ACS AUC 0.700 against 0.678,
so it is the main open question.

## 3. Does pooling surveys help?

A Bayesian discrete-time hazard model was fitted on nine surveys together: 321,121 units,
96,081 events and 44 inputs.
- **Pooling:** each survey keeps its own duration baseline and cohort trend, and effects are
  partially pooled.
- **Missing inputs:** inputs a survey never asked are handled by chained-equation imputation,
  with outcome information kept inside the survey that measured the input.

| Survey | Pooled − own model, points (95% CI) |
| --- | --- |
| HCMST | **+4.81 (1.88 to 7.79)** |
| LA newlyweds | **+1.78 (0.60 to 3.16)** |
| GSS panels | +1.70 (−1.02 to 4.68) |
| NLSY97 | −0.34 (−0.73 to 0.09) |
| Canada | −0.40 (−0.51 to −0.30) |
| NLSY79 | −0.50 (−0.73 to −0.20) |
| NSFG | −0.85 (−1.00 to −0.71) |

**Leaving a whole survey out.** The model was fitted on eight surveys and used to predict the
ninth. With the ninth survey's baseline re-estimated, the model keeps half to nine-tenths of
that survey's own skill. Without it, the predicted level is badly off (observed/expected 0.22
to 1.70).

The lesson for a calculator is that effects transfer between surveys and baselines do not.
That is why the app shows lenses side by side instead of one blended number.

**Interval coverage.** The 90% intervals covered 85% of held-out groups, but only 62–64% in
NSFG and SIPP histories, where they are too narrow.

## 4. What the decision aid now shows

**Profile report.** For you and, separately, for the person you are looking at:
- the risk with that partner;
- the average over the partners people like you actually marry, taken from the survey's
  record of who married whom;
- the average if you "dated everyone";
- your population percentile;
- the lowest-risk partner profiles, flagged where the models disagree;
- factors ranked by how much they move the risk, labelled changeable or fixed, with an
  evidence grade;
- the changes with the biggest predicted drop, labelled as associations unless trials or
  natural experiments support them.

For the demo profile (a woman aged 36) on the NSFG 1995–2023 lens, the 10-year break-up risk
is about 5 in 100 with the entered partner. It is 6 in 100 with likely partners (models
range 3–9) and 5 in 100 if she dated everyone.

**Marital satisfaction by years married.**
- **GSS, cross-sectional (13,959 people in intact first marriages):** 75% said "very happy" at
  0–2 years married, 61% at 16–20 years and 68% at 41 years or more.
- **HCMST, the same couples in 2009 and 2013:** ratings fell 0.14 on a 1–5 scale (−0.19 to
  −0.09), most in the first two years of marriage.
- **The late rise is partly survivorship.** 71% of couples who stayed together had rated
  their relationship "excellent", against 17% of those who broke up.

**Dating length.** On HCMST held out, adding how long a couple dated before marrying changed
gain by −0.12 points (−0.90 to +0.72). Break-up rates were 8.7%, 8.3% and 8.4% for under one
year, one to two years, and three or more. It is shown as published evidence, with its grade,
and not used as an input.

## What this means

For someone deciding whether to marry, the surveys give dependable population-level facts:
- base rates;
- how much risk varies between groups;
- which differences are large, such as age at marriage, schooling and relationship quality,
  and which are small.

They cannot say much more about one particular couple, however many questions are added or
however flexible the model. Where they do add information, it comes from a direct measure of
the relationship: the HCMST lens, built around a relationship-quality rating (C-index 0.84
among married couples), and the GSS marriage-happiness question. Better prediction for an individual couple would need richer
measurement of the relationship itself, not more demographics or more model.

## Limits

- **These are associations in past cohorts.** Only changes graded as backed by trials or natural
  experiments have evidence that changing them changes the outcome.
- **Unweighted fits.** Every model was fitted unweighted, so its level describes the survey
  sample. In NSFG and Canada the weighted observed/expected is about 0.83.
- **Outcomes differ by lens:** legal divorce, any separation, or a break-up within a window.
  The app labels each one.
- **The flexible-model and pooled-model runs stopped early** at the owner's request. Their
  unrun parts are listed in [`NEXT.md`](/research/marriage-divorce-evidence/NEXT.md).

*Produced with AI assistance (Claude). Methods, code and per-lens results are in
[`research/marriage-divorce-evidence/`](/research/marriage-divorce-evidence/), including
[`flexible_models/`](/research/marriage-divorce-evidence/flexible_models/README.md) and
[`reproducibility/unified_model/`](/research/marriage-divorce-evidence/reproducibility/unified_model/README.md).*
