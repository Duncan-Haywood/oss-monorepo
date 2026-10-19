# Independent review of adjusted ACS models

Reviewed work/model_acs.py and adjusted_models.csv. No mathematical implementation error found. Grouping identical covariate profiles and aggregating weighted successes/denominators preserves the survey-weighted Bernoulli log-likelihood. Newton score and Hessian signs are consistent; model references align with emitted terms; full and 80 replicate weight fits use the same design matrix. SDR variance 4/80 times sum of squared replicate coefficient deviations, followed by log-scale Wald intervals and exponentiation, is correct for the specified fitted parameter.

Independent alternative design construction and scipy trust-exact optimization reproduce all four full-weight models: largest absolute coefficient discrepancy 1.35e-9, normalized score residuals below 7e-18. All four independent fits report optimizer convergence. See check_adjusted_models.py and adjusted_model_independent_checks.json.

Interpretation restrictions:

- Odds ratios concern reporting divorce in the preceding 12 months among currently ever-married persons aged 30–64; they are not marriage-level annual hazards or lifetime risks.
- Models adjust age (seven 5-year categories), education and broad race/ethnicity. Income and employment are fitted in separate models, so income estimates are not adjusted for employment and employment estimates are not adjusted for income.
- Cross-sectional income, employment and divorce are contemporaneous; divorce can change earnings and labor participation. Conditioning does not establish causation and may introduce bias through consequences of divorce or selection.
- The models omit age at marriage, marital duration, marriage order and many other confounders. Coarse age bins leave residual age variation. Main effects assume covariate odds-ratio homogeneity within sex; fitted adjustment is not a flexible causal model.
- Odds ratios differ from probability ratios; avoid calling them percent changes in divorce risk. Their numerical similarity for uncommon outcomes does not change the estimand.
- The women's master's coefficient is below one with a pointwise 95% interval excluding one in both fitted models, while the direct age-standardized master's-minus-BA difference includes zero. These are different adjusted estimands, not contradictory results. Neither supports a universal advanced-degree hierarchy.
- Subgroup intervals and model coefficient intervals are pointwise exploratory intervals; many comparisons are made without multiplicity correction. Non-rejection is not evidence of equality.
- Sparse armed-forces outcomes and age-standardized military strata deserve particular caution; do not highlight their point estimates.

# Matched-replicate degree comparisons

degree_contrasts.py uses the original age-cell weighted totals to reconstruct all 81 age-standardized annual ever-married proportions. It subtracts the BA estimate within the same sex and same replicate, preserving covariance (including estimated common age-standard composition), and computes SDR 95% confidence intervals on differences in percentage points. None of the six master's/professional/doctorate versus BA differences excludes zero. The intervals allow modest differences in either direction; this is not an equivalence test.
