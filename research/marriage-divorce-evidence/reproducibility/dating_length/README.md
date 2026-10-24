# Does dating longer before marriage predict fewer divorces?

**Headline: not measurably, held out.** Among 1,928 U.S. married couples in the Stanford *How
Couples Meet and Stay Together* survey (HCMST 2009, followed to 2017; 1,686 with follow-up, 118
break-ups), the share broken up by 2017 was almost identical whether the couple had dated under a
year (8.7%), 1–2 years (8.3%) or 3+ years (8.4%) before the wedding. Added to the HCMST lens's
inputs, dating length changed held-out log-loss gain by **−0.12 points (95% CI −0.90 to
+0.72)** and Harrell's C by −0.001 (−0.007 to +0.006); dating length in bands, and years known
before marrying, did no better. The one verified published estimate, Francis-Tan & Mialon (2015),
reports a lower divorce hazard after dating 3+ years before the proposal (HR 0.764, 95% CI
0.627–0.931, against under a year), but it comes from an opt-in online retrospective survey that
this project's evidence review marks not usable in the app. So dating length is **shown as
evidence and not applied** to any lens's number.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/marriage-divorce-evidence/app/ (the "Profile report" tab shows it, with your own dating length from the form).

## What measures it

| Dataset | Measure | Used here |
| --- | --- | --- |
| HCMST 2009 (Stanford) | age when first met (Q21A), when the romance began (Q21B), at marriage (Q21D), all in whole years | yes: dating length = Q21D − Q21B; time known = Q21D − Q21A |
| NLSY97 | months living together before the wedding | already an input of the NLSY97 lens (four years of living together first goes with 0.68 times the dissolution rate; `../nlsy97_first_marriage/`) |
| NSFG 1995–2023, Statistics Canada GSS | whether the couple lived together first (and cohabitation dates) | already inputs (cohabited first) of those lenses; not courtship length |
| GSS, SIPP, ACS | no courtship-length item in the files this project uses | — |

## Method

Same machinery as the HCMST couples lens (`../hcmst/train_models.py`, imported, not copied):
discrete-time logistic hazard over the five follow-up periods 2009–2017, its spline + one-hot
additive pipeline with the L2 strength chosen once by grouped CV, grouped 5-fold cross-validation
by couple repeated 5 times, held-out log loss against a constant rate and Harrell's C on the
cumulative risk with risk sets by period, and a paired couple bootstrap (1,000 resamples) of the
difference from the core model. Married couples only; "married" is dropped from the inputs.
Relationship years (since the romance began) are already a core input, so adding dating length
amounts to splitting them into years dated and years married.

| Model | Held-out gain vs constant (95% CI) | Δ vs core | Harrell's C | Δ C vs core |
| --- | --- | --- | --- | --- |
| core (lens inputs) | 17.21% (11.93–21.95) | — | 0.833 (0.793–0.869) | — |
| core + dating length (spline) | 17.09% (11.95–21.64) | −0.12 (−0.90 to +0.72) | 0.832 | −0.001 (−0.007 to +0.006) |
| core + dating band (<1, 1–2, 3+ years) | 16.83% (11.57–21.50) | −0.39 (−0.90 to +0.12) | 0.830 | −0.002 (−0.006 to +0.001) |
| core + years known before marrying | 16.89% (11.45–21.51) | −0.33 (−1.14 to +0.42) | 0.831 | −0.002 (−0.008 to +0.004) |
| period + dating length only | −0.19% (−1.44 to +1.05) | — | 0.457 (0.422–0.497) | — |

Outputs: [`heldout_comparison.csv`](heldout_comparison.csv), [`dating_bands.csv`](dating_bands.csv)
(weighted discrete-time break-up by 2017 per band), [`sample_audit.json`](sample_audit.json) and
`app/data/dating_length.json` (with the two verified literature records). The C-index for dating
length alone falls below 0.5: the pattern a fold's training couples show does not carry to its
held-out couples, and the log-loss gain is indistinguishable from zero.

## Caveats

- **Power.** 118 break-ups among married couples: an effect of the size Francis-Tan & Mialon report
  (HR 0.76 for 3+ years) would move the held-out gain by well under a point, which this test cannot
  rule out. The result is "no detectable predictive gain", not "no association".
- **Measurement.** Ages are whole years, so dating length is accurate to about a year, and it is
  reported retrospectively by one partner, years after the wedding for long marriages.
- **Survivor bias.** HCMST interviewed couples still married in 2009; marriages that ended before then
  are not in the sample.
- **Not causal.** Couples who date longer differ in age, schooling and circumstances.

## Reproduce

```sh
sh ../hcmst/download.sh                                 # official files; raw data stay out of git
HCMST_RAW=../hcmst/raw python3 scripts/heldout.py       # ~10 min (DL_REPEATS, DL_BOOT to shorten)
python3 scripts/export_app.py                           # stdlib only
```

Needs numpy, pandas, scikit-learn 1.7.2 and pyreadstat (as `../hcmst/requirements.txt`).
