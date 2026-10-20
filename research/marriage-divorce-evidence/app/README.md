# Divorce odds calculator for couples (explainable ML in the browser)

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/marriage-divorce-evidence/app/

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

## Evidence lenses, sharing and suggestions

- **Lenses.** `models/index.json` lists every model bundle in `models/`; the app loads them
  all and shows each one's population, target, training size and best held-out gain. A
  bundle's `adapter` names the form mapping that scores it (`FORM_ADAPTERS` in `couple.js`);
  a lens without one is listed but gives no number. `tests/lenses.test.mjs` fails if a bundle
  in `models/` is missing from the manifest. To add a lens, add its bundle and one manifest
  line.
- **Adapters.** `couple.js` has one adapter per lens: it maps the form onto that bundle's
  rows, lists the perspectives averaged, the refusals, the what-ifs and the partner search
  grid. NLSY79 couples averages both partners as survey respondent; NLSY79 individuals
  averages each partner's own-trait rate (rows from `individuals.js`, currently-married
  population via `lensView`); NSFG 2002 uses the wife's report. "Every lens, side by side"
  shows each scorable lens's 10-year estimate for the same couple, never pooled. A model marked as a baseline (the NSFG duration-only curve) is shown as a reference
  row and kept out of averages, ranges and agreement counts. A couple a lens cannot speak to
  gets no number from that lens and a link to any lens that can.
- **Shareable scenarios.** Every input (and the lens) is mirrored into the URL fragment, e.g.
  `#a.sex=Woman&a.age=36&b.sex=Man&yearsMarried=3`. Browsers do not send the fragment to
  servers. Decoding accepts only known fields and allowed values.
- **Suggestions with uncertainty.** Each what-if change shows the average change in the
  10-year chance of no divorce, the smallest-to-largest change across models, and how many
  models move the same way. The partner search shows how many models score each profile
  above the partner as entered, how many of the 150 searched profiles the models cannot
  tell apart from the top one, and how many different profiles the models put first on
  their own. It never presents one ideal person.

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

## Classical model family on NSFG 2002 first marriages

`tools/train_nsfg2002_family.py` reuses the marriage-year intervals, person folds and
deviance from `../reproducibility/nsfg2002_first_marriage/train_models.py` (4,126 first
marriages, 1,492 dissolutions, 30,341 marriage-years). It fits four more model families and
compares everything held out by person against a constant rate. The intervals resample
women 1,000 times over the saved cross-fitted losses, with folds held fixed
(`../reproducibility/nsfg2002_first_marriage/family_heldout_comparison.csv`,
`family_heldout_calibration.csv`; bundle `models/nsfg2002_family.json`).

| Model | Held-out deviance gain vs constant (95% CI) | Observed / expected |
| --- | --- | --- |
| Marriage length only (A's baseline curve) | 0.4% (−0.1 to 0.9) | 1.00 |
| Additive spline Poisson (A's bundle) | 3.0% (2.0 to 4.1) | 0.99 |
| Discrete-time logistic hazard | 3.0% (1.9 to 4.1) | 1.02 |
| Poisson gradient boosting, 60 trees of depth 3 | 2.6% (1.6 to 3.7) | 0.97 |
| Random forest, 40 Poisson trees of depth 4 | 2.3% (1.5 to 3.0) | 0.98 |
| Categorical naive Bayes | 0.2% (−1.8 to 2.1) | 0.89 |

Flexible models do not beat the additive ones here, which matches the NLSY79 result.
Naive Bayes ranks marriages about as well as the others, but its independence assumption
makes it overconfident: in the top tenth of predicted risk it predicts 173 dissolutions per
1,000 marriage-years against 91 observed. The app should show it with that warning or leave
it out of averages.

Every family is explained exactly in `engine.js`:

- logistic and naive Bayes: per-input log-odds that sum, with the intercept, to the year's
  log-odds;
- forest and boosting: Saabas path attributions, where each split's change in node value is
  credited to the split's input. These sum exactly to the prediction, in rate units for the
  forest and log-rate units for boosting.

`contributions()` returns a `scale` field, and `rateFromContributions()` inverts it.
`tests/nsfg2002_family.test.mjs` matches 272 of 272 scikit-learn predictions to 10<sup>-9</sup>
and checks that every explanation reproduces its prediction to 10<sup>-12</sup>. Not yet
done: Cox/Weibull survival models (they need a survival library beyond scikit-learn) and
k-NN.

### Abstaining on couples unlike anyone in the data

Range checks catch one input at a time. `tools/ood.py` adds a joint check: the squared
Mahalanobis distance of a couple's fixed inputs (ages at marriage, wedding year, the six
categorical inputs) from the 4,126 NSFG marriages. `engine.oodScore(bundle.ood, row)` turns
that distance into a percentile among held-out women, so 99 means only 1% of real held-out
couples were as unusual. Above `abstain_above_percentile` (99) the app should give no
number. Examples: a typical couple (wife 24, husband 26, wed 1995) scores the 26th
percentile; a 38/40 couple wed in 2002, the 86th; a 17/45 couple, the 98.8th; a 16/60
couple, 99.1 (abstain). The quantiles are in
`../reproducibility/nsfg2002_first_marriage/family_ood_heldout_quantiles.csv`, and
`tests/ood.test.mjs` matches Python's distances on 68 rows to 10<sup>-9</sup>.

## Run and test

```sh
python3 -m http.server 8080   # from research/marriage-divorce-evidence, then open /app/
node --test app/tests/*.test.mjs
python3 test_app.py           # the same tests via unittest
```

## Limits

An older U.S. cohort (born 1957–1964, observed 2000–2022); associations, not causes; no
relationship quality, fidelity, children, wealth or occupation; mortality uses U.S.
population death rates (married people live longer, and spouses' deaths are correlated). See
`../MODEL_CARD.md` and `ROADMAP.md` for what comes next (more datasets and model families).
