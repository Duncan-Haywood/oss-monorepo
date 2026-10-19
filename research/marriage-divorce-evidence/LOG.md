# Research log

## 2026-10-19 · Second model lens: individual-level NLSY79 models exported to the browser

- Exported the eight saved individual-level pipelines (additive Poisson, spline additive Poisson, depth-2 and depth-3 Poisson trees; currently married and including-separated populations) to `app/models/nlsy79_individuals.json` with held-out gains, person-bootstrap intervals and calibration tables. The JS engine now handles the imputer's missing-value indicator and matches 640 of 640 scikit-learn predictions to 10<sup>-9</sup>.
- New `app/individuals.js` scores both partners from their own traits, averages the rates, and gives exact explanations (tree splits now shown in years, e.g. age 49.5 and 52.5, with each leaf's training support) and what-if changes with model agreement. For a 40/38-year-old couple married 5 years it gives 90.7% no divorce over the next 10 years (model range 89.5–92.1%), close to the couple models' 90.1%.
- Held out by person, among currently married people the additive models beat a constant rate by 1.9% (95% CI 1.2–2.7%) and the trees by 0.4–0.7%, with intervals that include zero. Including already-separated people lifts every model to 12.6–13.1%, which reflects separation, not partner traits. Next: wire the lens into the page (workstream C) and an out-of-distribution score.

## 2026-10-19 · Relationship-quality lenses: Fair's affairs surveys and Thornes & Collard

- New data: Ray Fair's two affairs surveys, *Redbook* 1974 (6,366 married women, 2,053 reporting an affair) and *Psychology Today* 1969 (601 men and women, 150). They come from statsmodels v0.14.4 on GitHub. The 601-person file matches an independent R (AER) copy row by row. They add the input the government surveys lack: self-rated marriage happiness. The outcome is a reported affair, not divorce (`reproducibility/fair_affairs/`).
- Redbook, share reporting an affair by marriage rating: 74.7% "very poor", 55.1% "fair", 18.1% "very good". Held out (5×5-fold): rating alone gives AUC 0.687 (8.6% log-loss gain); the additive logistic on all inputs AUC 0.744 (13.2%); a depth-3 tree 0.722 (11.3%). Psychology Today is weaker and noisy: additive logistic AUC 0.691, fold gains −3% to +15%.
- Odds ratios (associations, cross-sectional, direction unknown): 0.49 per rating point and 0.69 per religiousness point in Redbook; 1.30 for men and 1.46 with children in Psychology Today.
- Thornes & Collard (1979, 1,036 British people, via `vcd::PreSex`): odds of being divorced rather than married are 2.88 (2.10–3.96) with premarital sex and 5.73 (3.55–9.24) with extramarital sex, gender-adjusted. The sample is case-control-style (48% divorced), so it gives odds ratios only and no app number (`reproducibility/thornes_collard_presex/`).
- Engine: added a `logistic_glm` model kind (probability output; contributions on the log-odds scale). Both Fair bundles are listed in `models/index.json` without an adapter. Parity: 300 of 300 Python predictions are reproduced to 10<sup>-9</sup> (`app/tests/fair.test.mjs`). The exporter moved to `reproducibility/bundle_export.py`; the NSFG bundle regenerates byte-identical.
- Still blocked today: CDC, UCI, GSS, NLS and Stanford HCMST (HTTP 000).

## 2026-10-19 · NSFG 2002 lens: first-marriage dissolution from the wedding day

- New dataset: NSFG 2002 (Cycle 6) women's first marriages. These are 4,126 ever-married women aged 15–44 with month-exact wedding and dissolution dates, 1,492 divorces, annulments or separations, and 30,341 person-years. CDC is still blocked, so the file comes from Allen Downey's ThinkStats2 copy on GitHub, checked against the official record count (7,643) and weighted total (61.56 million) (`reproducibility/nsfg2002_first_marriage/`).
- Survey-weighted Kaplan–Meier: 78.0% of first marriages are still intact at 5 years, 63.8% at 10 and 49.3% at 20. Among wives who married under 20, 68.7% are intact at 5 years, against 87.2% for wives who married at 25–29.
- Person-held-out (5-fold) Poisson deviance gain over a constant rate: duration-only curve 0.38%, additive spline Poisson 3.02% (folds 2.30–4.13%; 2.65% over the duration curve), depth-3 Poisson tree 0.91%. Held-out calibration runs from 1.3% to 9.5% a year observed, against 1.6% to 10.3% predicted.
- Associations from the additive model, holding everything else fixed: wife married at 17 versus 22, rate ratio 1.63; premarital cohabitation 1.24; husband previously married 1.29; husband with children from a prior relationship 1.47; same race-ethnicity 0.72; wife from an intact family 0.70. These are not causes.
- Exported as `app/models/nsfg2002_first_marriage.json`, in the same `poisson_glm`/`tree` schema as the NLSY79 bundle plus `inputs`, `abstain` and `weighted_survival` fields. The engine reproduces 180 of 180 Python predictions to 10<sup>-9</sup> (`app/tests/nsfg2002.test.mjs`). The husband's education was left out because it is recorded only for women still married to that husband, so it would leak the outcome.
- Still blocked from cloud sessions today: CDC, NLS, ICPSR, UCI, Stanford (HCMST), GSS, Hugging Face, Zenodo and Dataverse. Next for workstream A: Fair's affairs (Rdatasets, reachable) and later NSFG cycles if a verifiable mirror turns up.

## 2026-10-19 · App: evidence lenses, shareable links, suggestions with model agreement

- The app now loads every model bundle listed in `app/models/index.json` as an "evidence lens" and shows its population, target, training size and best held-out gain (NLSY79 couples: 5,735 people, 726 divorces, best gain 3.4%). Lenses are never pooled. New datasets plug in with one manifest line, and a test fails if a bundle is left out.
- Scenarios can be shared as a link: inputs live in the URL `#` fragment (never sent to a server), and decoding accepts only known fields and allowed values.
- Suggestions now show uncertainty. For the default couple (woman 36 with a bachelor's degree, man 38 with some college, newly married), the 10-year chance of no divorce is 88.6% (models 84.9–92.4%). All 150 searched partner profiles overlap the top one's model range (91.6% top, 84.0% lowest), and the models put two different profiles first, so the app says plainly there is no single ideal partner. The man's largest self-change, a professional degree, averages +2.6 points, but the models range from 0.0 to 4.6 and both trees give 0.
- Lifelong estimate: SSA and CDC life tables were still unreachable (HTTP 000 from this session), so mortality stays explicitly unmodelled.

## 2026-10-19 · Browser app: couple divorce odds from five explainable models

- Exported the five saved NLSY79 couple models (two additive Poisson GLMs, a spline + pair-interaction GLM, depth-2 and depth-3 Poisson trees) to JSON and wrote a dependency-free JavaScript engine that reproduces scikit-learn's predictions to 10<sup>-9</sup> on 300 test predictions.
- New page `app/`: two profiles in, year-by-year divorce odds and the chance of no divorce by year 5–40 out, with the model range, exact per-input explanations, tree paths, ranked what-if changes with model agreement, and a partner-profile search.
- Honest limits built in: years outside the training ages (35–64) are shaded as extrapolation, same-sex couples get no number, mortality is not modelled, and every suggestion is labelled as an association. Held-out gain over a constant rate is 2.3–3.4%.
- Next: more datasets (NSFG marriage histories for young couples first) and model families; see `app/ROADMAP.md`. CDC, NLS, ICPSR and UCI hosts are blocked from cloud sessions as of today.
