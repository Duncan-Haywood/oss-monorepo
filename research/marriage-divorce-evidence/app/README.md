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

## Run and test

```sh
python3 -m http.server 8080   # from research/marriage-divorce-evidence, then open /app/
node app/tests/engine.test.mjs && node app/tests/couple.test.mjs
python3 test_app.py           # the same tests via unittest
```

## Limits

An older U.S. cohort (born 1957–1964, observed 2000–2022); associations, not causes; no
relationship quality, fidelity, children, wealth or occupation; mortality not modelled. See
`../MODEL_CARD.md` and `ROADMAP.md` for what comes next (more datasets and model families).
