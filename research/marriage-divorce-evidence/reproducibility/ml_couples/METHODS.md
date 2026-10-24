# Interpretable prospective couple prediction

The full baseline co-resident married panel contains40,818intervals,5,735respondents,726divorces and82,039person-years. It retains both-zero and unknown earnings separately; neither is silently converted to positive wages. Predictors precede outcome intervals.

Six candidates are compared on exactly the same five respondent-held-out folds. All rows from one respondent stay in one fold. Training-wave wage/family-income cutpoints, imputation, encoding and splines are fit on training data only. Poisson frequency targets are event/exposure with training weight baseline survey weight multiplied by exposure. Hyperparameters were fixed rather than tuned against the reported held-out scores; tree support constraints use training support only.

Core inputs are both schooling tiers, combined-wage position, earnings role, age, current marriage duration/order, wave and respondent sex. Enrichment adds own credential, work hours, earlier religious attendance, first-marriage age, family income, wife share and individual wage bands. Religious attendance is baseline2000 until refreshed from2012 onward, not a full spouse-belief history. Occupation, wealth, business valuation, relationship quality and fidelity are absent.

The enriched additive candidate has the lowest held-out point loss; greater flexibility does not improve on it here. Selecting the best among tested candidates remains exploratory. Calibration and loss do not establish a personal future probability, causal effect or contemporary external validity. The forward calendar check uses repeated respondents and frozen latest-training-wave cutpoints/encoding; it is a temporal sensitivity.

Survey weights are used for fitting/scoring, but complete survey PSU/stratum uncertainty is absent. Saved joblib models contain trained pipelines plus transformation metadata; use the versions and hashes in feature_manifest.json and final_fit_audit.json. Only load artifacts whose provenance you trust. Reproduction: python3 train_models.py; python3 religion_adjustment_sensitivity.py; python3 verify_and_manifest.py. Compact input or the upstream paired baseline pipeline is required.

The own-attendance sensitivity is separate explanatory regression. profile_religion_sensitivity_* retains the original profile specification on the attendance-complete subset. Other religion_sensitivity_* files use the expanded specification; do not mislabel those as the unchanged original profile model.
