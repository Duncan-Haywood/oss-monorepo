# Divorce odds calculator for couples (explainable ML in the browser)

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/marriage-divorce-evidence/app/

Enter your profile and your partner's; five interpretable models trained on the NLSY79
estimate the divorce rate for each year of your marriage, turn it into the chance of no
divorce by year 5, 10, 20, 30 and 40, explain each estimate, and show which changes (to you,
or to a partner's profile) the models associate with lower risk. Nothing you type leaves the
browser.

## How it works

- `tools/export_nlsy79_couples.py` loads the saved scikit-learn pipelines from
  `../reproducibility/ml_couples/` (pinned sklearn 1.7.2) and writes their fitted
  parameters to `models/nlsy79_couples.json`: imputer medians, spline knots, scaler
  statistics, one-hot categories, Poisson coefficients and tree arrays. It also writes
  Python predictions for 60 test rows.
- `engine.js` re-implements those transforms and models in ~150 lines of dependency-free
  JavaScript. `tests/engine.test.mjs` checks it reproduces every Python prediction to a
  relative error below 10<sup>-9</sup> (it does: 300 of 300).
- `couple.js` maps two people to model rows. The survey interviewed one spouse, so the couple
  is scored from both partners' points of view and averaged. Each future year advances ages
  and marriage duration; P(divorce in year k) = 1 − exp(−rate<sub>k</sub>) and the chance of
  still being married multiplies the years together.
- Years where either partner is outside the training ages (35–64) or marriage lengths
  (0–49 years) are flagged and shaded. Same-sex couples get no number: they were not in the
  training data.

## Models

| Model | Held-out deviance improvement vs a constant rate |
| --- | --- |
| Additive Poisson (core) | 3.1% |
| Additive Poisson (enriched) | 3.4% |
| Spline + pair-interaction Poisson | 2.9% |
| Poisson tree, depth 2 | 2.4% |
| Poisson tree, depth 3 | 2.3% |

Five-fold respondent-held-out Poisson deviance on 40,818 intervals, 5,735 respondents and 726
divorces (`../reproducibility/ml_couples/heldout_model_comparison.csv`). The gains are
small: most of what predicts divorce is not in these data.

## Second lens: individual-level NLSY79 models (engine and layer ready; UI wiring next)

`tools/export_nlsy79_individuals.py` exports the eight saved pipelines in
`../reproducibility/ml_individuals/` (four models × two populations) to
`models/nlsy79_individuals.json`, with each model's held-out deviance gain, its paired
person-bootstrap 95% interval and its five-group calibration table. These models score one
married person from their own traits (age, age at first marriage, sex, degree, work hours,
family-income quartile, religious attendance reported in 2000); the spouse's traits are not
inputs. `individuals.js` maps the same profile fields `couple.js` uses, scores both partners,
averages the two rates, and gives exact explanations (additive contributions, or the tree
path in years plus the leaf's training support) and what-if changes with model agreement.
`engine.js` gained the one new transform these pipelines use, the imputer's missing-value
indicator; `tests/individuals_engine.test.mjs` matches 640 of 640 Python predictions to
10<sup>-9</sup>, including ages outside training (spline extrapolation), missing first-marriage
ages and an unseen category.

| Population | Model | Held-out deviance gain vs constant (95% CI) |
| --- | --- | --- |
| Currently married (5,899 people, 854 divorces) | Additive Poisson | 1.9% (1.2 to 2.7) |
| | Spline additive Poisson | 1.9% (1.1 to 2.6) |
| | Poisson tree, depth 2 | 0.7% (−0.1 to 1.4) |
| | Poisson tree, depth 3 | 0.4% (−0.5 to 1.2) |
| Including already separated (6,238 people, 1,463 divorces) | Additive Poisson | 12.6% (11.2 to 14.1) |
| | Spline additive Poisson | 12.6% (11.2 to 14.1) |
| | Poisson tree, depth 2 | 13.1% (11.3 to 14.9) |
| | Poisson tree, depth 3 | 12.9% (11.1 to 14.8) |

Five-fold respondent-held-out survey-weighted Poisson deviance
(`../reproducibility/ml_individuals/heldout_metrics.csv`, `heldout_improvement.csv`; the
interval resamples people over saved cross-fitted losses with folds held fixed). For couples
who are not separated, the trees do not reliably beat a constant rate, and the additive
models gain about 2%. The large gain in the second population comes from already being
separated, which is part of a breakdown already under way, not a trait to choose a partner by.

## Run and test

```sh
python3 -m http.server 8080   # from research/marriage-divorce-evidence, then open /app/
node --test app/tests/*.test.mjs
python3 test_app.py           # the same tests via unittest
```

## Limits

An older U.S. cohort (born 1957–1964, observed 2000–2022); associations, not causes; no
relationship quality, fidelity, children, wealth or occupation; mortality not modelled. See
`../MODEL_CARD.md` and `ROADMAP.md` for what comes next (more datasets and model families).
