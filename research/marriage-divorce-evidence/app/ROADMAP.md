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

- Export `../reproducibility/ml_individuals` models (individual-level, NLSY79) as a second
  lens.
- For every new dataset: a family of classical models with a shared, person-held-out
  protocol: constant baseline; logistic / discrete-time hazard; Poisson GLM; Cox PH and
  Weibull AFT; stratified Kaplan–Meier; naive Bayes; k-NN; shallow decision trees; random
  forest and gradient boosting with small exported trees; an additive spline (GAM/EBM-style)
  model. Exact per-feature contributions for additive models; path or SHAP-style
  attributions for trees.
- Calibration plots and uncertainty (bootstrap or conformal intervals) shipped as JSON.
- Out-of-distribution scoring beyond range checks (e.g. Mahalanobis or k-NN distance to the
  training data) so the app can abstain.

### C. App and write-up (owns `index.html`, `app.js`, `couple.js`, `style.css`, `../README.md`, `../LOG.md` headline)

- Dataset/lens selector; show each lens's population, target and held-out skill.
- "Lifelong" estimate with competing mortality from an official life table (SSA or CDC/NCHS)
  once one is sourced; until then the app says mortality is not modelled.
- Shareable scenarios via the URL hash (no server; nothing stored).
- Partner-profile and self-change search: constrain to realistic changes, show uncertainty
  and model agreement, never present a single "ideal" person.
- Accessibility, phone layout, SEO (title, description, JSON-LD, links from the research
  page and README).
- A research write-up section in `../README.md` summarising what each dataset adds.
