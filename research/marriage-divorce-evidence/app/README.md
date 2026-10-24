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

## Profile report (decision aid)

`report.js` (pure; `tests/report.test.mjs`) and `report-ui.js` add the "Profile report" tab, run
for you and, separately, for the person you are looking at, on the selected lens:
"date everyone" (every partner type of your sex in the lens's `partner_distribution`, pooled over
all conditioning cells and weighted by their marriages; for women the husband's race-ethnicity
follows all husbands, assumed independent of the other traits), "likely partners" (the cell for
people like you, as `population.js` `justMe`), each as N in 100 with the model range and a 95%
interval from Dirichlet resampling of the mix shares; percentiles against `population_reference`;
the lowest-risk partner profiles from `dashboard.js` `partnerDashboard` with model disagreement;
factor impact (spread across each trait's levels) with grades from `data/decision_evidence.json`;
and the biggest predicted drops from `whatIfs`. Lenses without a partner distribution say so.
`satisfaction.js` charts `data/satisfaction_by_duration.json`
(`../reproducibility/satisfaction_by_duration/`) and `dating-length.js` shows
`data/dating_length.json` (`../reproducibility/dating_length/`). The report adds nothing to the
link beyond `view=report`.

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

## Every lens scored: adapters, horizons and the summary across lenses (2026-10-20)

- **Adapters for the newer lenses** live in `lens-adapters.js` (merged into `couple.js`'s
  `ADAPTERS`): HCMST couples, GSS panels, NLSY79 and NLSY97 first marriages, NSFG 1995–2023
  (wife's report, and the both-sexes models as a second view of the same bundle via
  `expandLens`), Statistics Canada GSS, the Los Angeles newlyweds, SIPP first marriages, SIPP
  couples and ACS. Each maps the form onto its bundle's `inputs` exactly; an input with no
  "unknown" level that is left blank means no number from that lens, with the question named;
  documented imputations are listed in the lens notes.
- **Time.** `kind: 'rate'` lenses project year by year; `'periods'` lenses (HCMST, newlyweds)
  multiply per-period probabilities, advancing ages and years together by `time_offsets`;
  `'fixed'` lenses (GSS 2 years, SIPP couples and ACS 1 year) give one window. `lensHorizons()`,
  `primaryHorizon()` and `stepAt()` drive every table; nothing is shown beyond a lens's follow-up,
  and short lenses have no lifelong figure and no literature adjustment.
- **Out of distribution.** `typicality()` scores the adapter's own rows (every perspective; the
  most unusual counts) with the bundle's `ood` spec. Inputs not given are set to the training
  mode or median for the distance only, and listed.
- **Population references** in every published shape are converted by `referenceFor()` in
  `population.js` (see its header); the couple is compared on the reference's own model and
  quantity, from the wedding or from today as the reference counts.
- **Summary across lenses** (`summary.js`): per lens, the estimate at each supported horizon
  with the model range, the population percentile, held-out skill (`modelSkill`, `lensSkill`) and
  data fit; then a synthesis of agreement on relative risk and the most relevant lens. No number
  is pooled. **ACS baselines** (`baselines.js`): the published cells each partner matches, most
  specific first, with 95% intervals.
- **Form.** New questions are grouped in collapsible sections, each listing the lenses it feeds.
  Hostility, abuse, substance use, low mood and adverse childhood experiences are never written
  to the link (`SENSITIVE` in `couple.js`). Batch CSV accepts the new answers as optional columns
  (`satisfaction` and `hostility` as the study's sums).

## Compare with the population, just me, many people, many couples, a dashboard and scenarios

Six views sit above the form (tabs; arrow keys move between them). Every view scores each
lens separately through its own adapter and never pools lenses.

- **Me + one person** (the couple view) gains a population panel: where the couple's predicted
  break-up risk at 5, 10 and 20 years sits among the lens's own surveyed marriages, overall
  and within each subgroup the couple belongs to, with the subgroup's median risk.
  "Every lens, side by side" adds each lens's 10-year percentile.
- **Just me** scores your profile alone, married now, averaged over the partners that people
  like you actually married (the bundle's `partner_distribution`), next to your percentiles.
- **Me + many people** ranks candidate partners for you: add, duplicate, edit and remove
  cards, copy the partner from the form, or load a CSV (up to 200). Per lens: chance of no
  divorce at 5/10/20 years with the model range (min–max over the lens's scoring models),
  the lifelong split counting mortality (`mortality.js` `competingRisks`, 40 years), the
  population percentile, abstentions with their reason (listed last), and an
  "indistinguishable from the top" flag when a candidate's model range overlaps the top
  candidate's. Nobody is called ideal.
- **Your dashboard** (`dashboard.js`, built on `couple.js`'s adapters, `rankPartners` and
  projection): summary cards (your estimate, your percentile, the top tier's range), a ranked
  table of partner trait profiles over the traits the lens models (adapter `partnerTraits`,
  capped at 600 profiles; traits that would exceed the cap are held at the partner in the
  form and named), a one-trait-at-a-time view, and what-ifs for your own changeable traits
  (5/10/20-year change, model range, agreement, how many models do not move, and whether
  those are trees that never split on the input), plus "all helpful changes together".
  Profiles whose model range overlaps the best one's form a single top tier. **Non-negotiables:**
  lock your own traits (never changed in what-ifs), lock partner traits (held at the form),
  exclude partner values, and cap the age gap. Rules live in the `#` fragment
  (`lock=a.degree,b.religion&ex.b.religion=Never&gap=5`), decoded against a whitelist.
- **Many couples (CSV)** scores up to 10,000 couples in the browser with a progress bar, shows
  row-level errors and a preview, and downloads a results CSV. **Nothing is uploaded**: the
  file is read with the File API and results download from a local Blob. Batch data never go
  in the URL; only single-couple scenarios do.

### Compare options (`scenarios.js`, `scenarios-ui.js`)

The sixth tab, "Compare options", saves full form states (scenarios, called options on the
page) and compares them lens by lens against the one marked "your current plan" (the baseline). A scenario is
`{ name, fields, lit }`: `fields` uses the form's own field names (`a.age`, `b.quality`,
`yearsMarried`, `a.hostTo3`, …) with cleaned string values, blanks left out, and `lit` holds the
published-evidence answers. `inputsFromFields()` is the single mapping from fields to the
`{ a, b, couple }` every adapter scores (the live form uses it too), and every number comes from
`summary.js` `summariseLens()`, so there is no second scoring path.

- **Actions.** Save the form (named, or "Scenario N"), rename in place, duplicate, delete, move
  up or down, load into the form and "Save changes", and **vary one thing** (`VARY_FIELDS`):
  copies of a scenario (or of the form, saved first) with one answer changed to each other
  allowed value, at most 12 per click; the starting scenario becomes the baseline. Age at the
  wedding moves the age today with years married fixed; years married moves both ages so the
  wedding ages stay put. Sensitive answers are never varied. Age, timing and family background (`fixed` in
  `VARY_FIELDS`) are listed apart as "to understand the models, not to change"; race, sex and age
  today are never varied. At most 50 scenarios.
- **Comparison.** Pick lenses and a horizon for each (defaults: the three most relevant to the
  baseline by `relevance()`); every option is shown at that one horizon. Per lens and option:
  break-ups out of 100 couples like you and the chance of a break-up (1 − the lens's mean
  survival) with the model range, change from the current plan in points (with the smallest to
  largest change across the models) and as a ratio, and a **paired verdict** (`pairedVerdict`,
  `diffVsBaseline`) from each scoring model's own difference (option minus current plan) at the
  horizon: `agree` when every model moves the same way and the smallest move is at least 1 point;
  `majority` when a strict majority do and their median move is at least 1 point; `split` ("cannot
  tell apart: models disagree on the direction") when no strict majority agrees; `tiny` ("cannot
  tell apart: too small to matter") when every move, or the majority's median, is under 1 point.
  Overlap of the min–max ranges is not used: it measures how much the models disagree on the
  level, not uncertainty about the difference. When a lens's horizon carries posterior `draws`
  (none does yet), `probLower` is the share of draws in which the option's risk is lower. Also: the overall population percentile at that horizon (or of the annual rate now),
  "outside its data" when a projected step is outside the training range, and "unusual" when the
  couple is more unusual than 90% of the lens's people. A lens that refuses gives the reason.
  Small multiples draw each lens on its own scale. Numbers are never summed or averaged across
  lenses.
- **Where they live.** In memory; in `localStorage` (`divorce-odds-scenarios-v1`, wrapped in
  try/catch, without the sensitive answers; the page works without it); in files; and in a share
  link `#view=scenarios&sc=…&sc=…&scb=<baseline>`. Each `sc` is a query string `n=<name>` plus the
  fields `encodeScenario` allows and the non-sensitive `lit.*` answers; scenarios after the first carry only
  what differs from the first (an empty value removes an answer). Decoding goes through
  `decodeScenario` and `decodeLiterature`, so hostility, abuse, substance use, low mood,
  childhood adversity and the sensitive published-evidence answers can never arrive by link, and the link is removed from the address after
  import.

JSON file (`divorce_odds_scenarios.json`):

```json
{"format": "divorce-odds-scenarios", "version": 1, "includes_sensitive_answers": false,
 "baseline": 0,
 "scenarios": [{"name": "Us today", "fields": {"a.sex": "Woman", "a.age": "28", "cohabitedFirst": "Yes"},
                "literature": {"prior_cohabitations_other_partners": "1"}}],
 "selection": {"lenses": ["hcmst_couples"], "horizons": {"hcmst_couples": 8.4}}}
```

Sensitive fields (`a.substance`, `a.lowMood`, `a.ace`, `a.abuse`, `a.hostTo1`–`7`,
`a.hostBy1`–`7`, and the same for `b.`) and the sensitive published-evidence answers
(`LIT_SENSITIVE` in `literature-ui.js`: `depression`, `alcohol_problem`,
`destructive_conflict_wife`, `destructive_conflict_husband`, `neuroticism_wife`,
`neuroticism_husband`) are written only when "include sensitive answers" is ticked; browser
storage never holds them. On import, any unknown key, field name, value outside the form's allowed values, or
unknown literature factor rejects the whole file with a list of problems; a file with more
scenarios than the room left imports up to the cap and says how many were not imported.

CSV file (`divorce_odds_scenarios.csv`), one row per scenario × chosen lens × each horizon the
lens supports: `scenario, is_baseline, lens, horizon_years, status (ok | abstain |
not_scorable), breakup_chance, model_min, model_max, population_percentile, percentile_of,
outside_data_steps, typicality_percentile, abstain_reason, diff_points_vs_baseline,
diff_min_points, diff_max_points, ratio_vs_baseline, verdict (agree | majority | split |
tiny), models_same_direction, models, prob_lower` (blank until a lens publishes draws). It contains no answers, only names and
results; cells that start with `=`, `+`, `-` or `@` are prefixed with `'`. Tests:
`tests/scenarios.test.mjs`.

### Population reference (`population.js`, `tools/population_reference.py`)

A bundle may carry `population_reference`: `{horizons, overall: {n, quantiles: {p1..p99}},
subgroups: {<var>: {<level>: {n, quantiles}}}, subgroup_defs}` of survey-weighted predicted
cumulative dissolution. A `pK` value may be a list aligned to `horizons` (what the tool
writes), a number (one horizon), or `quantiles` may be keyed by horizon. A couple's
percentile is interpolated linearly between neighbouring quantiles, a flat run of equal
quantiles gives its midpoint, and values outside p1..p99 read "below p1" / "above p99".
Subgroup membership uses `subgroup_defs` (bins on a numeric column, or a categorical column),
or else the adapter row's attribute named like the variable; "Unknown" is never a subgroup.
A married couple is compared as of its wedding day (ages and calendar year rewound).

For both NSFG 2002 lenses, `tools/population_reference.py` refits each lens's scoring models
on `train_models.py`'s five person folds (it checks the refit reproduces the published
held-out deviance gains: additive spline 3.024%, tree 0.914%, logistic 2.982%, forest 2.262%,
boosting 2.588%), scores each of the 4,126 women at her wedding with her own inputs and real
wedding year, and writes weighted quantiles of the lens's mean 5/10/20-year dissolution,
overall and by wife's age at marriage, cohabited first, husband married before, husband's
prior children, wife's race-ethnicity, intact family of origin and wedding decade (cells of
at least 100 unweighted marriages; `n` recorded). Nothing person-level is written, and every
other byte of each bundle is unchanged (the tool asserts it). Medians of predicted
dissolution (A's lens): 20.2% at 5 years, 33.7% at 10, 48.5% at 20; p10–p90 at 10 years is
21.5–52.2%. The survey's own Kaplan–Meier gives 36.2% dissolved by 10 years. The NLSY79
lenses show "no population reference": their person-level extracts are not in the repository.

`partner_distribution` (same tool, both NSFG bundles): weighted joint frequencies of the
partner's traits given your own coarse traits, both directions (given the wife's age band and
race-ethnicity: husband's age gap, earlier marriage, children from before, same or different
race-ethnicity, cohabited first; given the husband's: wife's age gap, race-ethnicity, family
of origin, cohabited first). Conditioning cells need at least 30 marriages and a listed
profile at least 10; shares are renormalised and `coverage` records the weighted share
covered. The app uses a cell only when coverage is at least 50%, and says so otherwise.
Age gaps are scored at the weighted median gap of their bin (−1, 1, 4, 7 and 13 years).

### CSV formats

Couples file: one row per couple. `id` (unique; blank = row number), then for each partner
`a_` and `b_` prefixed:

| Column | Meaning | Allowed values |
| --- | --- | --- |
| `sex` | required | `Woman`, `Man` |
| `age` | age today, required | 16–100 |
| `school` | years of schooling | `<12 years`, `12 years`, `13–15 years`, `16–17 years`, `18+ years` |
| `degree` | highest degree | `Less than high school`, `High school`, `Some college`, `Associate`, `Bachelor`, `Master`, `PhD`, `Professional` |
| `wages` | wages last year, $ | 0–10,000,000 |
| `work` | work hours last year | `No work hours`, `1–1,999 hours`, `2,000+ hours` |
| `religion` | service attendance | `Never`, `Less than weekly`, `Weekly or more` |
| `prior_marriage` | married before | `Yes`, `No` (blank = No) |
| `first_marriage_age` | age at first marriage | 13–80 (blank = this marriage) |
| `race_eth` | race-ethnicity | `Hispanic`, `White`, `Black`, `Other` |
| `prior_children` | children from before | `Yes`, `No` |
| `intact_family` | lived with both parents to 18 | `Yes`, `No` |

then `years_married` (0–60, blank = 0), `family_income` (0–100,000,000, blank = both wages)
and `cohabited_first` (`Yes`, `No`). Blank means unknown; values must match exactly, except
that an ASCII hyphen may stand for the en dash (`13-15 years`). Unknown or missing required
columns stop the file; bad cells are reported by line and column and those rows skipped.
The candidates file has `name` plus the person columns without a prefix. Templates download
from the page.

Results file (long format): `id, lens, horizon_years, no_divorce, model_min, model_max,
population_percentile, status, abstain_reason, years_outside_data`, one row per couple, lens
and horizon (5, 10, 20). `status` is `ok`, `abstain` (with the lens's reason) or
`not_scorable`. Cells that start with `=`, `+`, `-` or `@` are prefixed with `'` so a
spreadsheet does not run them.

Tests: `tests/population.test.mjs` (percentile edges, formats, subgroup selection, the shipped
blocks, just me), `tests/batch.test.mjs` (CSV parse/validate/round-trip, abstention
passthrough, ranking and overlap flag, no pooling) and `tests/dashboard.test.mjs`
(constraints and URL round-trip, locked or excluded fields never vary, the cap, tiers,
what-if signs and order).

## Published evidence and population baselines (couple view)

- **What the surveys don't measure** (`literature.js`, `literature-ui.js`). Optional questions
  for factors no lens's survey has: the wife's destructive conflict (1–4), depression and
  alcohol abuse before marriage, each partner's neuroticism (−2 to +2 SD), the wife's earlier
  cohabiting partners, and at least one spouse having no religion. Each has "prefer not to say".
  Whether each partner grew up with both parents is taken from the profile, not asked again.
  `questionsFor(lens)` drops factors the selected lens already models (listed as "already in
  this lens"); the husband's destructive conflict (record withheld: its hazard ratio varies
  over time in the published model) and religious mismatch (no verified primary number) are
  listed with the reason. `adjust()` shifts the lens's mean curve by published hazard ratios
  (S<sup>HR</sup>), drawing each log HR from its published interval plus a transport SD of 0.10
  and shrinking stacked adjustments for overlap, over 4,000 seeded draws. The page shows the
  5/10/20-year chance of no divorce from the lens next to the literature-based median and 95%
  interval, then each applied adjustment with citation, DOI link, locator, verbatim quote and
  how its uncertainty was set, and everything refused or skipped with the reason. Answers live
  in the page; the `#` fragment carries only the non-sensitive ones (earlier cohabitations, no
  religion) as `lit.<factor>=<value>`, decoded against a whitelist of factors and allowed values
  (`encodeLiterature` / `decodeLiterature`). Conflict, depression, alcohol and neuroticism
  answers (`LIT_SENSITIVE`) are never written to or read from a link.
- **About Gottman's accuracy claims**: a collapsible explainer with the base-rate table from
  `../reproducibility/literature_evidence/EVIDENCE.md`.
- **Population baselines (CDC/NCHS)** (`renderNchs`, `nchsMatches`): the official life-table
  rows that match the couple (wife's age at marriage, race-ethnicity, education, family of
  origin, living together first, age gap, race difference, the spouse's earlier marriage and
  children; men's rows for the husband), with 5/10/15/20-year disruption and SEs as printed,
  labelled by survey (NSFG 1995, NSFG 2006–2010). A previously married wife gets the
  second-marriage table. A newly-wed couple also sees this lens's own from-the-wedding figures
  in the same table.

Data files: `data/literature_evidence.json` (the 10 records the layer can read, exported by
`../reproducibility/literature_evidence/scripts/export_app_evidence.py`; 9 usable) and
`data/nchs_disruption_tables.json` (Bramlett & Mosher 2002 Tables 21, 22, 41; Copen et al.
2012 Tables 5–7; public domain; built by `parse_nchs_tables.py`). Tests:
`tests/literature.test.mjs` (the adjustment) and `tests/literature_ui.test.mjs` (fragment
round-trip and validation, lens-modelled factors never asked, NCHS matching and "*" cells).

## Before the wedding: the harmonized pre-wedding lens (`models/prewedding_harmonized.json`)

The model behind the question "how likely is this marriage to end, judged only from facts
knowable on the wedding day?". `tools/export_prewedding.py` fits the additive spline Poisson
model on the harmonized pre-wedding features of 43,336 NSFG 1995–2023 first marriages (see
`../reproducibility/prewedding/README.md`). Its inputs are both partners' ages at the
wedding and the age gap, wedding year, whether the other partner was married before, children
before the wedding, living together first, race/ethnicity, intact family and religion raised,
all from the scored partner's point of view. Score both partners and average them. The
bundle is 26 KB.

| Tested on | C | AUC 10y | Observed / expected 10y |
| --- | --- | --- | --- |
| NSFG, held out by person | 0.661 | 0.656 | 1.03 |
| NLSY97 (born 1980–84) | 0.647 | 0.643 | 0.99 |
| NLSY79 (born 1957–64) | 0.621 | 0.659 | 1.07 |
| SIPP 2001–2025 | 0.626 | 0.656 | 0.85 |
| Statistics Canada GSS | 0.611 | 0.622 | 0.58 |

Design choices the engine reproduces exactly (`tests/prewedding.test.mjs`, 60 of 60 rows to
10<sup>-9</sup>, explanations to 10<sup>-12</sup>, out-of-distribution distances to
10<sup>-9</sup>):

- An Unknown answer takes the training mode (`categorical.impute`) and a missing number the
  training median. No input has an Unknown level, because in these surveys whether a spouse
  trait is known can depend on how the marriage went.
- Splines are constant beyond the training range (`extrapolation: 'constant'`), so a
  wedding year after 2021 is held at the edge rather than extrapolated. Extrapolating
  wedding year cost one model 31–38% of its skill on other cohorts.
- `ood` gives a percentile among held-out NSFG marriages, `population_reference` gives
  cross-fitted 5/10/20-year dissolution quantiles (median 28% by year 10), and `external`
  gives the four rows above. The predicted level is U.S. survey-specific: in Canada,
  observed divorce is about 0.58 times the prediction.

**Per-couple uncertainty.** `models[0].bootstrap` holds 50 person-bootstrap refits of the
coefficients (spline knots and scaling held at the full fit). `engine.cumulativeRisk(model,
rowAt, horizon)` returns the point estimate and a 95% interval for the chance the marriage has
ended by `horizon` years. Across 2,000 sampled NSFG marriages the 10-year interval is 5.2
points wide at the median (9.4 at the 90th percentile). It is the
model's sampling uncertainty. It does not include the chance element in one marriage (which
an individual probability already is) or the error of applying a U.S. survey model elsewhere,
which is larger: the observed/expected ratio is 0.85–1.07 on the other U.S. surveys. The
bundle is now 48 KB.

Workstream C can make it the default lens (#8713 prefers it once an adapter exists).

## Train the models yourself, in the browser (`train/`)

The "Train the models yourself" panel retrains the NSFG 1995–2023 lens from survey records on
the visitor's own device. No server is involved and nothing has to be installed.

- **Data.** `train/nsfg_pooled_women.json.gz` (374 KB) holds the lens's 29,202 women's first
  marriages and 10,529 dissolutions from eight NSFG cycles, one row per marriage. Each row has
  the months to dissolution or interview, the event, the cycle-normalised survey weight, the
  person-held-out fold and the 18 inputs fixed at or before the wedding. It has no cycle, no
  design variables and nothing measured at interview. `train/tools/build_extract.py` writes it from
  the official CDC files, with the checksums in
  `../reproducibility/nsfg_pooled_first_marriage/SHA256SUMS`. The source files are U.S.
  government works and not under copyright (17 U.S.C. 105). The NCHS data-use terms travel
  with the extract and are recorded in its `licence` field: statistical use only, no attempt
  to identify anyone, no linking to other data.
- **Training.** `train/worker.js` is a module worker. It fetches the file, unpacks it with
  `DecompressionStream`, builds the 249,868 marriage-years and runs the five-fold person-held-out
  comparison from `train_pooled.py`. `train/fit.js` (plain JavaScript, no dependencies) fits
  five models:
  - a constant rate;
  - the duration-only spline GLM;
  - the additive spline Poisson GLM, solved by Newton's method with an L2 penalty and a Hessian
    accumulated per person and per marriage year;
  - a depth-4 Poisson tree;
  - Poisson gradient boosting on histogram trees, with 250 rounds, depth 3 and learning rate
    0.05 as in Python.

  The worker reports progress. Cancelling terminates it, and the page's main thread is never
  blocked: the longest gap measured in headless Chromium during a run was 68 ms. After the
  comparison it refits the models on every marriage, so a visitor can score a profile.
- **Results next to Python.** The panel shows held-out deviance gain, Harrell's C, O/E and
  decile calibration for each model. Beside them it shows the shipped lens's Python numbers and
  scikit-learn 1.7.2 refitted on this exact extract (`train/sklearn_reference.json`, written by
  `train/tools/sklearn_reference.py`).

| Model | Browser (JS) deviance gain, C | scikit-learn on the extract | Shipped lens |
| --- | --- | --- | --- |
| Marriage length only | 0.645%, 0.497 | 0.645%, 0.497 | 0.645% |
| Additive spline GLM | 5.688%, 0.6947 | 5.688%, 0.6947 | 5.688%, 0.6947 |
| Poisson tree, depth 4 | 3.333%, 0.6512 | 3.333%, 0.6512 | 3.333%, 0.6512 |
| Poisson gradient boosting | 6.298%, 0.7029 | 6.297%, 0.7028 | 6.289%, 0.7029 |

**Parallel folds (2026-10-20).** The page runs a pool of module workers, by default one per
spare core (`navigator.hardwareConcurrency − 1`, at most five, fewer when
`navigator.deviceMemory` reports 4 GB or less), and a visitor can pick 1–5 threads.

- Each worker loads the extract once and takes tasks from a shared queue: the five held-out
  folds first, then the refits on all marriages, biggest first.
- When the last fold arrives, the next free worker merges the folds and computes the metrics
  (`foldPredictions`, `mergeFolds` and `summarize` in `fit.js`), so the page's own thread only
  routes messages.
- Typed arrays are transferred between threads, not copied.

All five models at the Python settings, in headless Chromium on a 4-core cloud machine:

| Threads | Wall time | Longest main-thread stall |
| --- | --- | --- |
| 1 | 45.5 s | 93 ms |
| 3 | 18.8 s | 57 ms |
| 4 | 17.6 s | 62 ms |
| 5 | 17.5 s | 86 ms |

Every thread count gives identical metrics. `tests/train_parallel.test.mjs` computes the folds
in scrambled order through structured cloning and checks the merged result equals the
single-thread one to 10<sup>−12</sup>.

**How much a profile's score depends on the sample (2026-10-20).** Each fold returns its
fitted model with its predictions. The scorer then shows, beside the full-data estimate, the
year-10 range across the five fold models, each trained on a different four-fifths of the
women. For the default profile the ranges are:

| Model | Full-data estimate | Range across fold models |
| --- | --- | --- |
| Constant rate | 31.6% | 31.5–31.6% |
| GLM | 21.3% | 18.6–22.9% |
| Depth-4 tree | 34.2% | 26.5–34.6% |
| Boosting | 18.7% | 15.0–23.1% |

For a wife married at 19, the ranges are 33.9–41.7%, 41.5–51.2% and 26.1–40.7%. The flexible
models move most. This covers sampling only, not what the survey never measured.
`tests/train_parallel.test.mjs` checks each structured-cloned fold model reproduces its fold's
held-out predictions to 10<sup>−12</sup>.

`tests/train.test.mjs` takes about 40 s. It requires the JS GLM's coefficients to match
scikit-learn's within 10<sup>−6</sup>; they agree to 4×10<sup>−14</sup>, on fold 0's training
set and on all data. It also requires the held-out gains to agree within 0.001 points for the
GLMs and the tree and within 0.15 points for boosting, whose binning and summation order differ
slightly. A full run of all five models took 35 s in Node and 44 s in headless Chromium on a
cloud machine. With 25 boosting rounds it took 13 s, but boosting's gain fell to 3.85%. No real
phone has been timed yet.

## Run and test

```sh
python3 -m http.server 8080   # from research/marriage-divorce-evidence, then open /app/
node --test app/tests/*.test.mjs   # Node 22 needs the glob, not the directory
python3 test_app.py           # the same tests via unittest
```

## Limits

An older U.S. cohort (born 1957–1964, observed 2000–2022); associations, not causes; no
relationship quality, fidelity, children, wealth or occupation; mortality uses U.S.
population death rates (married people live longer, and spouses' deaths are correlated). See
`../MODEL_CARD.md` and `ROADMAP.md` for what comes next (more datasets and model families).
