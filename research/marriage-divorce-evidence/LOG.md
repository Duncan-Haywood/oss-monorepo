# Research log

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
