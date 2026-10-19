# Research log

## 2026-10-19 · Second model lens: individual-level NLSY79 models exported to the browser

- Exported the eight saved individual-level pipelines (additive Poisson, spline additive Poisson, depth-2 and depth-3 Poisson trees; currently married and including-separated populations) to `app/models/nlsy79_individuals.json` with held-out gains, person-bootstrap intervals and calibration tables. The JS engine now handles the imputer's missing-value indicator and matches 640 of 640 scikit-learn predictions to 10<sup>-9</sup>.
- New `app/individuals.js` scores both partners from their own traits, averages the rates, and gives exact explanations (tree splits now shown in years, e.g. age 49.5 and 52.5, with each leaf's training support) and what-if changes with model agreement. For a 40/38-year-old couple married 5 years it gives 90.7% no divorce over the next 10 years (model range 89.5–92.1%), close to the couple models' 90.1%.
- Held out by person, among currently married people the additive models beat a constant rate by 1.9% (95% CI 1.2–2.7%) and the trees by 0.4–0.7%, with intervals that include zero. Including already-separated people lifts every model to 12.6–13.1%, which reflects separation, not partner traits. Next: wire the lens into the page (workstream C) and an out-of-distribution score.

## 2026-10-19 · Browser app: couple divorce odds from five explainable models

- Exported the five saved NLSY79 couple models (two additive Poisson GLMs, a spline + pair-interaction GLM, depth-2 and depth-3 Poisson trees) to JSON and wrote a dependency-free JavaScript engine that reproduces scikit-learn's predictions to 10<sup>-9</sup> on 300 test predictions.
- New page `app/`: two profiles in, year-by-year divorce odds and the chance of no divorce by year 5–40 out, with the model range, exact per-input explanations, tree paths, ranked what-if changes with model agreement, and a partner-profile search.
- Honest limits built in: years outside the training ages (35–64) are shaded as extrapolation, same-sex couples get no number, mortality is not modelled, and every suggestion is labelled as an association. Held-out gain over a constant rate is 2.3–3.4%.
- Next: more datasets (NSFG marriage histories for young couples first) and model families; see `app/ROADMAP.md`. CDC, NLS, ICPSR and UCI hosts are blocked from cloud sessions as of today.
