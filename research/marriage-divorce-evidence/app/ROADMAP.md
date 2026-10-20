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

## Network note (checked 2026-10-19 and 2026-10-20)

From cloud sessions, `www.cdc.gov`, `ftp.cdc.gov`, `nlsinfo.org`, ICPSR, Harvard Dataverse,
Zenodo, Kaggle, UCI, Hugging Face and `gss.norc.org` were blocked by the environment's
network policy; `github.com`, `raw.githubusercontent.com`, `api.github.com` (partly),
PyPI and npm were reachable. On 2026-10-20 SSA, CDC, UCI, GSS, NLS, Stanford and mortality.org were still blocked (HTTP 000). Re-check at the start of each run
(`curl -s -o /dev/null -w '%{http_code}' -m 15 <url>`): the owner may widen the allowlist.
Public mirrors on GitHub are acceptable only when they reproduce an official file you can
verify (checksum, row counts, codebook) and the licence allows it.

## Workstreams (ownership avoids merge conflicts)

### A. Datasets (owns `../reproducibility/<new dataset>/`, `../DATA_SOURCES.md`, new `models/<id>.json` bundles)

**Done (2026-10-19/20; details in each folder's `METHODS.md` and `../LOG.md`):**

| Dataset | Folder | What the app gets |
| --- | --- | --- |
| NSFG 2002 (Cycle 6) women's first marriages, 4,126 marriages and 1,492 dissolutions from the wedding day | `nsfg2002_first_marriage/` | Lens `models/nsfg2002_first_marriage.json`: duration-only, additive spline Poisson (held-out deviance gain 3.0%) and a depth-3 tree. Listed in `index.json` with **no form adapter yet** |
| Fair (1978) affairs surveys: Redbook 1974 (6,366 women) and Psychology Today 1969 (601 people) | `fair_affairs/` | Lenses `models/fair_redbook1974.json` and `fair_pt1969.json` (logistic AUC 0.744 and 0.691). The target is a reported affair, not divorce. **No adapter yet** |
| Thornes & Collard (1979) pre- and extramarital sex by divorce, 1,036 people | `thornes_collard_presex/` | Odds ratios only (case-control); no app number by design |
| UN WPP 2024 U.S. single-year death rates by sex, 2024–2100 | `un_wpp2024_mortality/` | `data/us_mortality_wpp2024.json` and `mortality.js` (`competingRisks`): divorce versus widowhood each year, for the lifelong estimate. **Not yet wired into the UI** |

**Hand-offs to C (app):**

- Write the form adapters for the NSFG 2002 lens (in progress in PR #8556; workstream B's
  extra NSFG model family merged in #8567): the wife's and husband's ages at the
  wedding, cohabited first, husband married before, husband has prior children,
  race-ethnicity, intact family, `marriage_years`; hold `wedding_year` at 2002 and label
  it. Abstain for a previously married wife, same-sex couples and inputs outside
  `support`.
- Write the adapters for the Fair lenses, which need a new "rate your marriage" input. Show
  them as affair risk, never as divorce odds.
- Replace "mortality not modelled" with `competingRisks()`: P(divorce first), P(widowhood
  first, the lifelong marriage) and the unresolved remainder past each lens's support.

**Remaining, highest value first:**

1. **More NSFG cycles** (2006–2010 through 2022–2023): bigger samples and recent weddings.
   Still blocked at CDC. The NSFG files on GitHub that were checked are 2002 only (the
   MarriageNSFG repository purged its raw data). Use a verifiable mirror if one appears.
2. **NLSY97** partner histories (nlsinfo.org blocked).
3. **HCMST 2017–2022** (Stanford, blocked): unmarried and same-sex couples with breakup
   follow-up, the only route to a number for same-sex couples.
4. **GSS 1972–2022** ever-divorced status (gss.norc.org blocked; cross-sectional).
5. **Divorce Predictors Scale** (Yöntem et al. 2019; UCI blocked). Not attempted from
   unofficial copies: none could be checked against UCI.
6. Official aggregate divorce rates (CDC/NCHS) for calibration (blocked).

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
- Compare options, i.e. scenarios (2026-10-20, `scenarios.js`, `scenarios-ui.js`): up to 50 saved form states, vary-one-thing copies, a per-lens grid and small multiples against "your current plan" (out of 100 couples like you, difference ranges, an explicit "cannot tell apart" when model ranges overlap) with model agreement, JSON/CSV export and import, and a share link without sensitive answers.
- Phone layout (390px) and dark mode with no horizontal scroll; focus outlines; titles, meta and
  share-card descriptions within the 160-character budget; JSON-LD; links between the app, the
  project README and the research page.

Remaining:

- Mortality refinements. Married people's lower death rates and the correlation between
  spouses' deaths are not modelled; the app says so under the lifelong tiles. Lifelong figures
  over long horizons also lean on years outside each lens's data (the page counts them).
- Fair's affairs lenses are listed but not scored. Their outcome is a reported affair, not
  divorce, and they need marriage-rating, religiousness and occupation inputs. If added, they
  belong in a separate "relationship quality" panel, not the divorce chart.
- Explanations for two-perspective lenses average the per-input log contributions of the two
  rows. That is exact for each row but only approximate for the averaged rate; show per-partner
  bars instead.
- Calibration plots and bootstrap intervals once workstream B ships them per bundle. Today's
  uncertainty is the spread across models only.
- Done 2026-10-20: every lens scored (adapters in `lens-adapters.js`), per-lens OOD (the NLSY79
  couples spec from `tools/nlsy79_reference.py`), reference conversion for every published shape,
  and the summary across lenses. Still open: OOD for NLSY79 individuals, GSS, SIPP and ACS (their
  bundles ship no spec); a GSS 4-year model export (the bundle has its reference but not the
  model); a validated satisfaction mapping for the newlywed lens (all 8 items on one scale now);
  joint partner profiles for NLSY97 just-me (the bundle publishes one trait at a time).
- A screen-reader pass with a real assistive technology. Only keyboard focus and contrast have
  been checked.
