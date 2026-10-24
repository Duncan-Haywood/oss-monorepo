# Individual-feature predictive model comparison

For currently married respondents, these baseline factors improve held-out prediction modestly: the additive model reduces weighted Poisson deviance by1.94%against a constant rate. A spline additive model is similar; shallow trees perform worse. Including people already separated increases predictive gains substantially, largely reflecting a marital breakdown already underway.

| Model | Legally married including separated: held-out deviance/PY | Currently married only: held-out deviance/PY |
|---|---:|---:|
| Constant |0.125240|0.087026|
| Additive regularized Poisson |0.109513|0.085333|
| Depth2Poisson tree |0.108884|0.086441|
| Depth3Poisson tree |0.109120|0.086705|
| Spline additive Poisson |0.109474|0.085399|

Lower is better; compare within a column. Full sample has6,238respondents/1,463divorces; currently married sensitivity has5,899respondents/854divorces. All validation folds hold out entire respondents. There is no clear full-sample winner among the better models: depth2tree improvement over additive is0.000628deviance/PY, paired approximate95%interval−0.000119to0.001392. In currently married observations, additive beats depth2tree by0.001108(0.000661–0.001571); spline-versus-additive difference remains uncertain.

The final full-sample depth2tree first splits on baseline separation, then current age. Separation is already a stage of marital breakdown; this model should not be sold as identifying better partner traits. Final tree leaves are training descriptions and are separate from the cross-fitted evaluation. Their age thresholds are fitted approximations, not real-world cliffs.

## Held-out grouped calibration, currently married additive model

| Prediction group | Observed divorces | Observed rate per1,000PY | Predicted rate per1,000PY |
|---|---:|---:|---:|
| Lowest quintile |70|4.41|4.79|
| Second |124|7.27|6.69|
| Third |141|7.80|8.81|
| Fourth |203|11.14|11.20|
| Highest |316|16.08|15.24|
| All |854|9.34|9.35|

These are repeated-person, cohort-specific aggregate rate checks. They do not establish accurate probabilities for an individual or a new generation. Counts, person-years and approximate clusteredCIs are retained in calibration.csv.

## Inspectable deliverables

- Eight final trained .joblibpipelines, with fitted preprocessing, plus two constant-rateJSONfiles.
- CoefficientJSONexports for additive models; readable tree paths and exact original-unit thresholds; tree leaf support counts.
- Feature and version manifests; person-fold cross-fitted predictions; performance, paired comparisons, calibration and missingness tables.
- Verification that no person's rows cross validation folds, all held-out predictions are complete, and saved models reload with valid finite predictions. Final training expected/observed event totals agree to relative error below5×10⁻⁷.

Religion here is own attendance measured2000, not spouse compatibility. Assets and business wealth are absent. Current-age support is35–64, so this study cannot supply a validated personal forecast for a27-year-old self-employed individual or map net worth into an income quartile.
