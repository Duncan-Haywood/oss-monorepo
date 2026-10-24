# Interpretable individual-feature annual divorce prediction audit

This is a model comparison on one existing prospective NLSY79 target. It does not pool ACS/NSFG outcomes and does not create a personally validated risk calculator. Run `OPENBLAS_NUM_THREADS=1 python3 analyze_ml.py` and `OPENBLAS_NUM_THREADS=1 python3 compare_models.py` with numpy,pandas,scikit-learn,scipy,joblib. Saved pipelines include training-only imputers/encoders and final fitted estimators; manifests and transparent coefficient/tree exports permit inspection.

## Population, time and target

Input: sibling annual_nlsy/legally_married_primary/nlsy_annual_intervals.csv, documented in that analysis. Original NLSY79respondents born1957–1964, baseline waves2000–2020, ages35–64observed here, followed to the next interview through2022. Each row starts legally married(currently married OR separated). Outcome is first subsequent legal divorce, with month-resolved exposure until divorce, widowhood(censor) or next interview. Features precede the prospective interval outcome. Subsequent new marriages are not counted after the row's first terminal event. This is an annual legal-divorce event RATE per person-year, not a calibrated annual probability, lifetime risk, or first-marriage survival curve.

Full sample45,977intervals/6,238respondents/1,463events; currently-married sensitivity42,259intervals/5,899respondents/854events. Repeated-wave survey-weighted pseudo-counts are not national counts of unique divorces. Missing histories/outcomes excluded upstream remain a selection limitation.

## Features and missingness

Baseline own current age, age at first marriage, respondent sex, education_model, prior-year work-hours category, baseline family-income quartile, baseline marital status and baseline wave. Religion is OWN respondent attendance measured2000, potentially20years stale in later intervals. It is not both spouses' attendance, denomination agreement, current religious practice, politics or values. Graduate credentials are pooled in education_model. Income is family-income quartile, not a personal salary, business value, business profit, net worth or assets. The data do not represent all factors that influence marriage, and no missing partner trait is inferred.

All otherwise eligible intervals are retained. Categorical missingness is an explicit Unknown category; unseen test categories are ignored by the training-fitted encoder. Numeric missing first-marriage age is imputed with the TRAINING-fold median and an indicator is preserved. Current age has no missing observations here. No target or held-out median is used for preprocessing. Detailed missingness counts and weighted person-year shares are saved, including all6,626missing family-income intervals in the full sample. Missingness can still be informative and does not become harmless by imputation.

## Candidate models and exposure

Fixed models: training-constant annual rate; additive regularized Poisson regression; depth2Poisson tree; depth3Poisson tree; additive Poisson with spline transformations of ages. The target supplied to scikit-learn is event/exposure, with sample weight=baseline survey weight×exposure. This yields the intended exposure-weighted Poisson count likelihood up to constants. Predictions are annual rates lambda; held-out count expectation is exposure×lambda. Survey weights are normalized within training for numerical fitting. Poisson regressors use alpha0.001and max_iter500; numeric features are standardized. Spline basis uses4knots, degree3and linear extrapolation. Missingness indicators are also transformed through that pipeline, which is regularized and not interpreted as a standalone age coefficient.

Trees use criterionPoisson, max_depth2or3, minimum500rows per leaf and minimum2%of training weighted person-time per leaf, random seed20261019. An initial5%person-time feasibility threshold excluded a pure separated leaf because separated rows comprise only4.53%of full weighted person-time; this constraint was corrected to2%based on covariate support. Alpha values were aligned across additive candidates. No hyperparameter grid or held-out best-threshold search was used. These final settings are exploratory choices, not preregistered confirmation. A different regularization strength or tree support constraint could change comparative performance.

## Strict person-held-out comparison

Assign each of6,238respondents to one of5folds using seed20261019. All of a person's intervals remain in one fold; no person is in both training and test. The currently-married sensitivity reuses the same mapping. Every imputer, encoder, scaler, spline and model is fitted only on the training folds. This guards against reusing the same person's stable characteristics across folds. It does not control possible dependence between related respondents/household members, and is not a temporal or external-cohort validation.

Evaluate survey-weighted held-out Poisson deviance divided by weighted person-years. Lower is better; relative improvement is1−candidate_deviance/constant_deviance within the same sample. Full versus married-only scores are on different populations and must not be directly treated as causal separation effects. Compare models on identical rows within each sample.

Paired improvement intervals resample respondents2,000times from saved cross-fitted loss differences, holding fitted folds fixed. They do not propagate model-training uncertainty or full surveyPSU/stratum design, and are exploratory. Intervals versus both constant and additive reference are retained. Do not select a winner from tiny score differences with overlapping paired uncertainty.

## Calibration and interpretability

Each candidate's held-out predictions are grouped by weighted-person-time quintiles; cutpoints use predicted rates, not outcomes. Constant-model calibration is only reported overall, since tiny fold-specific constant differences do not form substantive risk strata. Each group reports intervals, distinct respondents, observed events, person-years, observed annual rate, expected rate and approximate respondent-cluster observed-rateCI. These are internal grouped rate-calibration checks, not proof of individual calibration. They can conceal subgroup and period errors. Models are evaluated for all held-out observations as well.

Final shallow trees are REFITTED ON ALL selected observations for readable paths and saved artifacts. Their leaf support counts, fitted/observed rates and CIs are TRAINING descriptions, selected by the fitted tree; they are not independent held-out estimates for those exact leaves. Cross-fitted calibration and performance are saved separately. Tree split thresholds(49.5years, for example) are sample-dependent approximations, not biological or causal cliffs. A low training leaf is not a recommended personal profile. One-hot tests such as education is notBachelor combine multiple categories and must not be read as proof other degrees are worse.

Saved .joblibpipelines produce rates for technically valid inputs, but have not been validated for young adults, self-employed business/wealth profiles, or new generations. The observed current-age support starts35; a27year-old is outside it. Assets/net worth are absent. A high net worth cannot be mapped into a wage/family-income quartile. These artifacts are for reproducibility and inspection, not personalized deployment.

## Important limitations

Separation is already part of a marital breakdown process. Including it can improve prediction of subsequent legal paperwork while saying little about partner selection or preventing breakdown. Hence the currently-married sensitivity is essential. Observational prediction does not establish which behaviors, degrees, income changes, religions or partner choices cause lower divorce. Attrition, imputation, survey design, cohort/period change and unmeasured relationship quality remain. No fairness or subgroup calibration guarantee, current-population probability estimate, or personalized partner ranking is asserted.
