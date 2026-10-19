# Research log

## 2026-10-19 · App: the NSFG lens scores young couples from the wedding day

- The NSFG 2002 first-marriage bundle (workstream A) is now wired to the form through a per-lens adapter in `couple.js`, so the app can score couples NLSY79 cannot: newly-weds and wives who married at 15–39, for up to 24 years of marriage. New inputs: race-ethnicity, children from an earlier relationship, whether the wife grew up with both parents, and whether the couple lived together first.
- Honest refusals: no number when the wife was married before (first marriages only), a wedding age is outside the data, or the wife's race-ethnicity or family of origin is missing (the model has no "unknown" group for them). The refusal links to any lens that can score the couple. Weddings after 2002 are scored as 2002 weddings, with a note on the page.
- The duration-only curve is treated as a baseline, like the constant rate: it is shown, but not averaged into the estimate. For a 27/29 couple who lived together first, the two models give 74.8% no break-up by year 10 (74.2–75.4%), against 63.8% for all first marriages and 70.9% for wives who married at 25–29 in the survey's own weighted Kaplan–Meier curve.
- Couple-level what-ifs (living together first, marrying 2 or 5 years later) show the model range and agreement. Not cohabiting and marrying 5 years later each add about 2 points on average, but only the additive model moves; the tree is flat.
- Mortality: SSA, CDC and mortality.org still return HTTP 000, so "lifelong" stays labelled as no break-up through the horizon, if both partners live.

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
