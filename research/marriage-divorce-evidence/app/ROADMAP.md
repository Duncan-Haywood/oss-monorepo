# Couple divorce-odds app: roadmap and work split

The owner asked (2026-10-19) for a web app where two people enter their profiles and get,
from several explainable classical ML models running in the browser: divorce odds for each
year of marriage, the chance of a lifelong marriage, and suggestions (partner profiles the
models score well, and changes to oneself the models link to lower risk), with as many real
datasets as can be gathered, all written up as research.

Version 1 (this directory) runs five NLSY79 couple models exported from
`reproducibility/ml_couples`. See `README.md` here for how it works.

## Rules every session follows

- **Real data only.** Never synthesize, simulate or "illustrate" records and present them as
  evidence. A dataset you cannot download is a blocker to report, not a gap to fill.
- **Licence first.** Record each dataset's source URL, licence/terms, citation, version and
  SHA-256 in `../DATA_SOURCES.md`. Commit raw records only when the terms allow
  redistribution and the file is small (< 5 MB); otherwise commit a download script plus
  checksums, and commit only derived model JSON and aggregate tables.
- **One target per model bundle.** Do not pool incompatible outcomes (annual hazard,
  ever-divorced status, retrospective first-marriage survival, relationship-scale
  classification). Each dataset gets its own bundle in `models/` and appears in the app as
  its own "evidence lens", labelled with its population, years and target.
- **Held-out evaluation by person**, calibration, and a constant/baseline model in every
  comparison. Report the improvement over baseline honestly, even when it is small.
- **Explainable and exact in the browser.** Export fitted parameters to JSON (no pickles in
  the browser), extend `engine.js` for any new model family, and add a Python-generated
  test-vector file plus a parity test in `tests/` (tolerance 1e-9 relative).
- **Refuse unsupported profiles.** Out-of-range inputs are flagged; profiles the data cannot
  speak to at all (e.g. same-sex couples for NLSY79) get no number.
- **Associations, not causes.** Suggestions are labelled as model associations, with how many
  models agree.
- Every session: add a dated entry to `../LOG.md`, open a PR, verify, merge it (root
  `CLAUDE.md`, "Every session lands its own work"). Check open PRs touching
  `research/marriage-divorce-evidence` first and build on them instead of duplicating.

## Network note (checked 2026-10-19)

From cloud sessions, `www.cdc.gov`, `ftp.cdc.gov`, `nlsinfo.org`, ICPSR, Harvard Dataverse,
Zenodo, Kaggle, UCI, Hugging Face and `gss.norc.org` were blocked by the environment's
network policy; `github.com`, `raw.githubusercontent.com`, `api.github.com` (partly),
PyPI and npm were reachable. Re-check at the start of each run
(`curl -s -o /dev/null -w '%{http_code}' -m 15 <url>`): the owner may widen the allowlist.
Public mirrors on GitHub are acceptable only when they reproduce an official file you can
verify (checksum, row counts, codebook) and the licence allows it.

## Workstreams (ownership avoids merge conflicts)

### A. Datasets (owns `../reproducibility/<new dataset>/`, `../DATA_SOURCES.md`, new `models/<id>.json` bundles)

Candidates, highest value first:

1. **NSFG 2006–2010 / 2011–2013 / 2013–2015 / 2015–2017 / 2017–2019 / 2022–2023** respondent
   files: marriage histories from the wedding date for ages 15–49. This is the dataset that
   lets the app speak to young and newly married couples (per-year first-marriage survival
   by age at marriage, education, cohabitation before marriage, religion, parents'
   marital history, etc.). CDC hosts it; look for verifiable mirrors if blocked.
2. **NLSY97** (younger cohort, born 1980–84): partner histories. nlsinfo.org.
3. **HCMST 2017–2022** (How Couples Meet and Stay Together, Stanford): couple-level data
   including unmarried and same-sex couples with follow-up breakup outcomes.
4. **GSS 1972–2022**: ever-divorced status with rich attitudes (cross-sectional; label it so).
5. **Fair's extramarital affairs data** (Rdatasets mirror on GitHub; 601 rows) and the
   **Divorce Predictors Scale** (Yöntem et al. 2019, UCI, CC BY 4.0; 170 couples, 54
   relationship-attitude items). Small and non-representative, but they add the
   relationship-quality dimension the surveys lack. Label populations plainly.
6. Official aggregate rates (CDC/NCHS marriage and divorce rates by year and state;
   ACS marital events) for calibration and context, not person-level training.

### B. Models (owns `tools/`, `engine.js`, `tests/`, model sections of `README.md`)

Status at 2026-10-20 (three workstream-B rounds: PRs #8536, #8567 and the out-of-distribution PR).

Done:

- **NLSY79 individual lens** (#8536). Eight saved `ml_individuals` pipelines (additive and
  spline Poisson, depth-2/3 trees, two populations) are exported to
  `models/nlsy79_individuals.json` with held-out gains, person-bootstrap CIs and calibration.
  `individuals.js` scores both partners. The engine gained the imputer's missing indicator
  and raw-unit tree thresholds. Parity: 640/640.
- **Classical family on NSFG 2002** (#8567). Discrete-time logistic hazard, categorical naive
  Bayes, random forest and Poisson gradient boosting, compared held out by person (A's folds)
  against a constant rate, with person-bootstrap CIs and decile calibration
  (`models/nsfg2002_family.json`, `tools/train_nsfg2002_family.py`). Every family has exact
  explanations: log-odds terms, and Saabas path attributions for ensembles.
  `contributions()` reports its `scale`. Parity: 272/272.
- **Out-of-distribution score** (third round). `tools/ood.py` computes a squared Mahalanobis
  distance on a couple's fixed inputs, as a percentile among held-out people. It ships as
  `ood` in the NSFG family bundle, and `engine.oodScore()` matches Python on 68/68 rows.
  The suggested rule is to abstain above the 99th percentile. It complements the per-input
  range checks and does not replace them: an ellipsoid misses holes inside the range.

Remains:

- **Wire into the page (needs C).** Show the individual lens through `individuals.js`, give
  the NSFG family bundle the `nsfg2002_first_marriage` adapter from #8556 (same inputs), and
  call `oodScore()` before showing a number. Treat `scale` when rendering forest
  (rate-unit) and boosted (log-rate) attributions. Keep naive Bayes out of averages or label
  it overconfident.
- **Cox PH / Weibull AFT and stratified Kaplan–Meier exports.** These need `lifelines` or
  `scikit-survival` pinned beside scikit-learn 1.7.2. The duration spline already plays the
  baseline-hazard role.
- **k-NN models and k-NN distance.** Both need person-level rows in the browser. NSFG
  public-use data allows it, but weigh page size and re-identification first.
- **OOD for the NLSY79 lenses.** The person-level extracts are not in git, so only range
  checks apply until they are restored (`scripts/restore_inputs.py`).
- **The family protocol for every new bundle A lands** (Fair, and later NSFG cycles). Run
  `tools/train_nsfg2002_family.py`'s pattern on each.
- **Conformal or bootstrap intervals on individual predictions.** Current intervals are on
  held-out skill, not on a single couple's rate.

### C. App and write-up (owns `index.html`, `app.js`, `couple.js`, `style.css`, `../README.md`, `../LOG.md` headline)

Done (2026-10-19/20, PRs #8537, #8556 and the round-3 PR):

- Lens selector over every bundle in `models/index.json`, showing population, target, training
  size and best held-out gain. A test fails if a bundle is missing from the manifest.
- Per-lens adapters in `couple.js`, so one projection, explanation, what-if and partner-search
  path serves every lens. Three lenses are scorable: NLSY79 couples, NLSY79 individuals (parity
  with `individuals.js` to 1e-15), NSFG 2002 first marriages, and B's NSFG classical family
  through the same adapter. Baseline models (duration-only) and naive Bayes (overconfident)
  are shown with the reason but kept out of averages. Explanations use each model's own scale.
- Abstention on unusual couples: B's `oodScore()` runs before any NSFG number, the page
  shows the couple's typicality percentile, and it refuses above the 99th.
- Refusals with reasons (same-sex couples; for NSFG a previously married wife, wedding ages
  outside the data, missing required inputs), and links to a lens that can score the couple
  inside its data. An "every lens, side by side" table, never pooled.
- Shareable scenarios in the URL fragment, decoded against a whitelist.
- Self-change, couple-level (cohabitation, wedding timing, family income) and partner-profile
  searches. Each shows the model range, direction agreement, ties with the top profile and each
  model's own top pick; the app never presents a single ideal partner.
- Phone layout (390px) and dark mode with no horizontal scroll; focus outlines; titles, meta and
  share-card descriptions within the 160-character budget; JSON-LD; links between the app, the
  project README and the research page.

Remaining:

- Lifelong estimate with competing mortality: SSA, CDC/NCHS and mortality.org were unreachable
  (HTTP 000) on every check on 2026-10-19/20. The app keeps the "mortality not modelled" label.
  Once a life table is reachable, multiply each year's no-divorce chance by both partners' joint
  survival, and test that it reduces to today's numbers when mortality is zero.
- Fair's affairs lenses are listed but not scored. Their outcome is a reported affair, not
  divorce, and they need marriage-rating, religiousness and occupation inputs. If added, they
  belong in a separate "relationship quality" panel, not the divorce chart.
- Explanations for two-perspective lenses average the per-input log contributions of the two
  rows. That is exact for each row but only approximate for the averaged rate; show per-partner
  bars instead.
- Calibration plots and bootstrap intervals once workstream B ships them per bundle. Today's
  uncertainty is the spread across models only.
- Out-of-distribution abstention for the NLSY79 lenses, once B can compute a spec (the
  person-level extracts are not in git); today they use per-input range checks only.
- A screen-reader pass with a real assistive technology. Only keyboard focus and contrast have
  been checked.
