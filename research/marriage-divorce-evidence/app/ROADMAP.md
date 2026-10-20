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

## Network note (checked 2026-10-19 and 2026-10-20; widened 2026-10-20)

From cloud sessions, `www.cdc.gov`, `ftp.cdc.gov`, `nlsinfo.org`, ICPSR, Harvard Dataverse,
Zenodo, Kaggle, UCI, Hugging Face and `gss.norc.org` were blocked by the environment's
network policy; `github.com`, `raw.githubusercontent.com`, `api.github.com` (partly),
PyPI and npm were reachable. Early on 2026-10-20 SSA, CDC, UCI, GSS, NLS, Stanford and mortality.org were still blocked (HTTP 000). **Later on 2026-10-20 the allowlist was widened**: CDC, NLS, GSS, Stanford, UCI, Kaggle, OSF, Zenodo and Add Health returned 200, while ICPSR, PSID, Fragile Families, Understanding Society and SSA returned 403. Re-check at the start of each run
(`curl -s -o /dev/null -w '%{http_code}' -m 15 <url>`): the owner may widen the allowlist.
Public mirrors on GitHub are acceptable only when they reproduce an official file you can
verify (checksum, row counts, codebook) and the licence allows it.

## Workstreams (ownership avoids merge conflicts)

### A. Datasets (owns `../reproducibility/<new dataset>/`, `../DATA_SOURCES.md`, new `models/<id>.json` bundles)

**Direction from 2026-10-20: before the wedding.** The owner wants divorce risk *before*
marrying, for a couple or a potential partner. Datasets that measure people or couples before
they marry, and follow them into marriage, now rank first.

**On `main` (each folder's `METHODS.md` has the details; `../DATA_SOURCES.md` has sources and
licences):**

- **Before the wedding:**
  - `hcmst_dating_to_marriage/` follows 1,081 unmarried 2009 HCMST couples (dating or
    cohabiting, incl. same-sex) to 2017, with marriage versus break-up per period (lenses
    `hcmst_dating_marriage`, `hcmst_dating_breakup`). It is externally checked on 777 unmarried
    2017 couples (AUC 0.77–0.85).
  - `nlsy97_cohabitation_to_marriage/` follows 6,020 first cohabiting unions, moved in 1994–2023,
    to marrying the partner versus splitting (lenses `nlsy97_cohab_marriage`,
    `nlsy97_cohab_split`).
  - Workstream B's `prewedding/` is the harmonized wedding-day model.
- **From the wedding:** `nsfg2002_first_marriage/`, `nsfg_pooled_first_marriage/`,
  `nlsy79_full/`, `nlsy97_first_marriage/`, `sipp_marital_history/` and
  `canada_gss_family/`.
- **Married couples:** `ml_couples/`, `ml_individuals/`, `hcmst/`, `gss_panel/` and
  `newlywed_la_karney/`.
- **Relationship quality and context:** `fair_affairs/` (affairs, not divorce),
  `thornes_collard_presex/` (odds ratios only), `acs_pums_multiyear/` (subgroup baselines) and
  `literature_evidence/`.
- **Mortality:** `un_wpp2024_mortality/` (`mortality.js` `competingRisks`).

**Hand-offs to C (app):** adapters for the NLSY97 cohabitation lenses (inputs: age and
credential at move-in, sex, race-ethnicity, prior children, family at 12, parents' schooling,
AFQT, religion raised, move-in year, years together). Chain each into `nlsy97_first_marriage`
after the wedding. Also adapters for the two HCMST before-the-wedding lenses (#8713 already
places them under "Before the wedding"). Prefer each bundle's `additive_harmonized` model when
parents' view or religion is not given: it is the one checked on the 2017 cohort. They ask for
the 2009 HCMST inputs: relationship quality, living together, parents' view, couple type, ages,
schooling and how the couple met. Chain them into a marriage lens after the wedding, as
`how_to_combine` in each bundle describes.

**Remaining, highest value first (reachability checked 2026-10-20):**

1. ~~NLSY97 cohabitation histories~~ **Done 2026-10-20:** `nlsy97_cohabitation_to_marriage/`
   follows 6,020 first cohabiting unions to marrying the partner (2,109) or splitting first
   (3,481), with held-out deviance gains of 4.9% (marriage) and 9.3% (split). Partner-section
   traits are excluded because their recording depends on the outcome. Still open: dating
   relationships that never moved in together, which these monthly arrays do not cover.
2. **Add Health public-use waves I–V** (addhealth.cpc.unc.edu reachable): adolescents measured
   long before they marry. Check whether the public-use files and relationship histories can be
   downloaded without a contract.
3. ~~HCMST 2017–2022 unmarried couples~~ **Done 2026-10-20:** the 2009-trained harmonized
   dating models, scored on 777 unmarried 2017 couples, reach AUC 0.77–0.79 for marrying and
   0.84–0.85 for breaking up first by 2020 and 2022, with shares within 1.5 points
   (`hcmst_dating_to_marriage/external_validation_hcmst2017.csv`).
4. **Pre-marital relationship-quality studies** with open data on OSF or Zenodo (both
   reachable), for example engaged-couple or premarital-inventory studies.
5. **PSID, Fragile Families / Future of Families and Understanding Society**: their hosts
   returned 403 on 2026-10-20. ICPSR also returned 403.

### B. Models (owns `tools/`, `engine.js`, `tests/`, model sections of `README.md`)

Status at 2026-10-20 (workstream-B PRs #8536, #8567, #8573, #8660, #8684 and the per-couple
interval PR).

Done:

- **Before the wedding** (#8660, #8684). A leakage audit of the five first-marriage lenses
  with refits, a harmonized pre-wedding feature set, the classical family within each survey
  and across all 20 survey pairs (`../reproducibility/prewedding/`). The exported lens is
  `models/prewedding_harmonized.json`: the NSFG additive model with external validation, a
  population reference and an OOD score. `engine.js` gained constant spline extrapolation
  and Unknown→mode imputation.
- **Per-couple intervals.** 50 bootstrap coefficient replicates in the pre-wedding bundle, and
  `engine.cumulativeRisk()` gives a point estimate and a 95% interval at any horizon (median
  10-year width 5.2 points).

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
- **Intervals for the other lenses.** Only the pre-wedding bundle carries bootstrap replicates
  so far; the pattern in `tools/export_prewedding.py` applies to any Poisson GLM bundle.
- **Pooled multi-survey pre-wedding model.** Train on several U.S. surveys with a survey level
  and test on the one left out. Survey-specific missing inputs (SIPP has no cohabitation;
  Canada has no race) need care, so that imputation does not stand in for an effect.
- **Recalibration to a target population.** U.S. models put Canada's level 1.5–2.2 times too
  high. A per-country intercept from official tables would fix the level but not the ranking.

### D. In-browser training (owns `train/`, `tests/train*.test.mjs`; hooks in `index.html` are one `<section id="trainPanel">` and one script tag)

Status at 2026-10-20 (PRs #8678, #8766 and the fold-range PR):

Done:

- **Data.** A 374 KB gzipped public extract of the NSFG 1995–2023 women's first marriages
  (29,202 marriages, pre-wedding inputs only; U.S. government work, NCHS data-use terms
  recorded), built by `train/tools/build_extract.py`.
- **Models, in plain JavaScript.** A constant rate, a duration-only GLM, the additive spline
  Poisson GLM (Newton's method), a depth-4 Poisson tree and Poisson gradient boosting.
- **The held-out test.** The Python pipeline's person-held-out five folds, shown beside the
  shipped Python results.
- **Parity with scikit-learn.** GLM coefficients agree to 4e-14 and held-out gains to 0.001
  points (boosting 0.002), checked by `tests/train.test.mjs`.
- **Parallel folds.** A pool of workers, one per spare core by default, took a full run from
  45.5 s on one thread to 18.8 s on three (4-core machine, headless Chromium). The page's
  thread only routes messages: the longest stall was 57 ms. Covered by
  `tests/train_parallel.test.mjs`.
- **Scoring a profile.** Visitors score a profile with the models refitted on every
  marriage, next to the range across the five fold models. For the default profile, the
  10-year range is 18.6–22.9% for the GLM, 26.5–34.6% for the tree and 15.0–23.1% for
  boosting.

Remaining, most useful first:

1. Time a run on real phones and report it. Only headless Chromium on a cloud machine has been
   timed.
2. Train on the harmonized pre-wedding features (`models/prewedding_harmonized.json`, workstream
   B), so the trained model scores the same inputs as the default "before the wedding" lens.
   That needs its person-level rows as a licence-checked extract, as here.
3. Fill the scorer from the calculator's own form ("use my answers above"), through an adapter
   agreed with workstream C. The panel has its own form today, so it never touches C's files.
4. Add a both-sexes extract (would retrain `models_both_sexes`), and other lenses whose terms
   allow person-level rows: SIPP, ACS and Statistics Canada PUMFs. Check each licence first.
5. Add person-bootstrap intervals for the browser-trained gains.
6. Let a visitor download a trained model, or share it in a link.

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
- Lifelong estimate with competing mortality: `lifelong()` in `couple.js` runs A's
  `competingRisks()` (UN WPP 2024 U.S. death rates) once per scoring model and shows divorce,
  widowhood (the lifelong marriage) and still-married-both-alive shares, each with the model
  range. A test checks that zero mortality reproduces the no-divorce projection exactly.
- Population comparison, "just me", candidates, batch CSV and a dashboard with
  non-negotiables (`population.js`, `batch.js`, `dashboard.js`, `compare-ui.js`): percentiles
  among each lens's own held-out predictions overall and by subgroup (NSFG 2002 lenses, built by
  `tools/population_reference.py`; NLSY79 lenses have none until their extracts are restored),
  per-lens candidate ranking with overlap tiers, client-side CSV scoring with downloadable
  results, partner-trait search and what-ifs that respect locked and excluded values.
- Published-evidence layer (2026-10-20): optional questions for factors no lens measures (`literature.js`, `literature-ui.js`), applied as a labelled literature-based adjustment from 9 verified primary records with intervals, citations and refusals; factors a lens already models are not asked. Plus a CDC/NCHS population-baseline table and a Gottman base-rate explainer (`../reproducibility/literature_evidence/EVIDENCE.md`).
- Compare options, i.e. scenarios (2026-10-20, `scenarios.js`, `scenarios-ui.js`): up to 50 saved form states, vary-one-thing copies, a per-lens grid and small multiples against "your current plan" (out of 100 couples like you, difference ranges, a paired per-model verdict: agree, most agree, or cannot tell apart with the reason) with model agreement, JSON/CSV export and import, and a share link without sensitive answers.
- Phone layout (390px) and dark mode with no horizontal scroll; focus outlines; titles, meta and
  share-card descriptions within the 160-character budget; JSON-LD; links between the app, the
  project README and the research page.

- Before the wedding (2026-10-20, owner's refocus): a stage switch, "Before the wedding" by
  default and "Already married". Before the wedding, the lens list, the summary across lenses,
  "just me" and the candidate comparison use only lenses whose clock starts at the wedding
  (`lensStage` in `couple.js`). The projection starts on the wedding day, ages are ages at the
  wedding, and question groups only married lenses read are hidden. Old links to a married lens
  open the married view. Title, meta, JSON-LD and lede now answer "will my marriage last".
- B's harmonized before-the-wedding lens (`prewedding_harmonized`, #8684) is the default
  pre-wedding lens: an adapter in `lens-adapters.js` (`preweddingRow`) scores both partners as
  the surveyed spouse and averages; unanswered inputs take the survey's most common answer and
  are named on the page; second marriages, same-sex couples and out-of-data ages are refused;
  B's typicality score runs before any number (`tests/prewedding_app.test.mjs`).
- Not engaged yet: `dating.js` chains A's two HCMST dating-couple models (marry each other vs
  break up first) by the bundles' `how_to_combine`, per partner rating, for both additive models
  (the full one and the harmonized one A checked on the 2017 cohort) with their range, and hands over to the
  selected before-the-wedding lens for the years after a wedding (a labelled approximation that
  joins two surveys). Shown only before the wedding; relationship questions are visible there
  and the relationship status follows the stage (`tests/dating.test.mjs`).
- Per-partner explanations: a two-perspective lens shows one bar set per partner, each exact for
  that perspective's rate, and states that the couple's rate is their average
  (`tests/explain_rows.test.mjs`). Default ages follow the stage: 28 and 30 before the wedding
  (about the recent U.S. median ages at first marriage), 36 and 38 in the married view (inside
  NLSY79's 35–64); a typed age is never changed.

Remaining:

- Before the wedding, next: B's per-couple uncertainty intervals for the harmonized lens
  (#8736, still a draft) shown on the tiles once merged; a joint (not two separately fitted)
  marry/break-up model if workstream A refits HCMST.
- Mortality refinements. Married people's lower death rates and the correlation between
  spouses' deaths are not modelled; the app says so under the lifelong tiles. Lifelong figures
  over long horizons also lean on years outside each lens's data (the page counts them).
- Fair's affairs lenses are listed but not scored. Their outcome is a reported affair, not
  divorce, and they need marriage-rating, religiousness and occupation inputs. If added, they
  belong in a separate "relationship quality" panel, not the divorce chart.
- Calibration plots and bootstrap intervals once workstream B ships them per bundle. Today's
  uncertainty is the spread across models only.
- Done 2026-10-20: every lens scored (adapters in `lens-adapters.js`), per-lens OOD (the NLSY79
  couples spec from `tools/nlsy79_reference.py`), reference conversion for every published shape,
  and the summary across lenses. Still open: OOD for NLSY79 individuals, GSS, SIPP and ACS (their
  bundles ship no spec); a GSS 4-year model export (the bundle has its reference but not the
  model); a validated satisfaction mapping for the newlywed lens (all 8 items on one scale now);
  joint partner profiles for NLSY97 just-me (the bundle publishes one trait at a time).
- The candidates view's "indistinguishable from the top" flag and the dashboard's top tier still
  use overlap of model ranges (`rankPartners` in `couple.js`, shared by the partner search,
  dashboard tiers and their tests). Moving them to the paired rule `scenarios.js` uses is a
  separate change.
- A screen-reader pass with a real assistive technology. Only keyboard focus and contrast have
  been checked.
