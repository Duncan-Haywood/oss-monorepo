# Research log

## 2026-10-19 · Browser app: couple divorce odds from five explainable models

- Exported the five saved NLSY79 couple models (two additive Poisson GLMs, a spline + pair-interaction GLM, depth-2 and depth-3 Poisson trees) to JSON and wrote a dependency-free JavaScript engine that reproduces scikit-learn's predictions to 10<sup>-9</sup> on 300 test predictions.
- New page `app/`: two profiles in, year-by-year divorce odds and the chance of no divorce by year 5–40 out, with the model range, exact per-input explanations, tree paths, ranked what-if changes with model agreement, and a partner-profile search.
- Honest limits built in: years outside the training ages (35–64) are shaded as extrapolation, same-sex couples get no number, mortality is not modelled, and every suggestion is labelled as an association. Held-out gain over a constant rate is 2.3–3.4%.
- Next: more datasets (NSFG marriage histories for young couples first) and model families; see `app/ROADMAP.md`. CDC, NLS, ICPSR and UCI hosts are blocked from cloud sessions as of today.
