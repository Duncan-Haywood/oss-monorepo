# Conditional partner matching: feasibility and exploratory interaction audit

This analysis audits whether the existing couple model can support the question: given someone's own profile, does the lower-rate partner configuration change with that profile? It uses only the existing validated prospective NLSY79couple_profile_input.csv and does not alter the website or earlier analyses. Run `OPENBLAS_NUM_THREADS=1 python3 analyze_conditional.py` (numpy,pandas,scipy).

## Existing model and limitation

The existing model jointly includes husband and wife completed-schooling tiers, combined-wage quartile, earnings-role category, current age, marriage duration, marriage order, wave and respondent sex. It is additive on log rates. A partner schooling association is therefore constrained to be the same multiplicative association across the other spouse's schooling tier; combining two favorable marginal associations does not demonstrate compatibility. This is not a validated personalized forecast. The raw input contains34,359intervals,5,295respondents and592divorces.

## Prespecified broad extensions

High schooling means at least16completed years, not a verified bachelor's credential. Own schooling is the respondent's level and partner schooling is their spouse's level, oriented using respondent sex and validated husband/wife fields.

1. Additive reference: replicate the original30-column design and fit.
2. School interaction: add one both-spouses-high-schooling interaction beyond the detailed husband and wife schooling main effects(31columns).
3. School plus earnings interactions: retain the both-high term, add own-high-schooling main effect for model hierarchy, and add own-high-schooling×each of the four nonreference earnings roles(36columns). Because own high schooling is sex-oriented, its main effect is not already exactly represented by the original husband/wife/sex additive terms. It must be included rather than adding interactions alone.

The earnings interaction family is fitted only after checking broad own-high×role support: all10cells have at least100distinct respondents and10observed events. The high-schooling/wife-only cell has exactly10events and is fragile. A both-spouses-high×earnings-role interaction family is not fitted because high-high/husband-only and high-high/wife-only have8and5events. These support screens are exploratory design choices, not a preregistered confirmatory analysis.

## Support and uncertainty

conditional_support.csv reports four support grids: own×partner schooling; own schooling×earnings role; both-high×earnings role; respondentsex×own schooling×partner schooling×combined-wage quartile×earnings role. All160fine-grid configurations are observed, but only21meet the100-person/10-event screen. Hence broad marginal support does not justify arbitrary detailed partner recommendations. The same person can appear in several cells over follow-up; cell counts are not independent replicates.

Each fit uses baseline-wave survey weights and Poisson event likelihood with log exposure offset. Coefficient CIs and Wald tests use respondent-cluster robust covariance with the same finite-sample correction as the earlier couple model. They remain approximate, not full surveyPSU/strata inference, and do not adjust for missingness, original household dependence, selection into married positive-wage couples or unmeasured confounding. Joint Wald tests are reported for the1dfschool term and4dfown-schooling×role family. Individual interaction coefficients are retained, but searching them for a favorablep-value is inappropriate. No multiplicity correction is applied.

## Person-held-out comparison

Assign each respondent to one of5folds using fixed random seed20261019. Every interval for that person remains in the same fold, and their held-out predictions come from models fitted without any of their intervals. No variable or interaction family is selected by held-out performance. All three models are evaluated on exactly the same held-out rows using survey-weighted Poisson deviance divided by weighted person-years. Lower is better; positive improvement means smaller deviance than the additive model. Test data retain actual exposure, so evaluation compares predicted counts consistently rather than comparing raw rates for differently exposed intervals.

Confidence intervals for deviance improvement use2,000paired respondent bootstrap resamples of the saved cross-fitted loss differences(seed31982). The fitted fold models and folds are held fixed. These intervals describe uncertainty in these cross-fitted paired losses and do not propagate training/refitting variation or full survey design. They are not an external or contemporary validation, nor an assessment of individual probability calibration. Expected/observed weighted event totals in heldout_metrics.csv are repeated-wave weighted pseudo-counts, not national unique divorce counts.

## Fixed-own-profile problem

Holding combined wages and changing earnings role changes how those wages are split, generally changing the respondent's own wages. It therefore cannot answer 'given my fixed salary, which partner salary is associated with lower divorce incidence?' For that question, one would need to hold own wages fixed, vary partner wages, recompute total and share together within the relevant wave, check joint support, and validate the resulting prediction. Combined-wage quartiles are relative within-wave categories, not fixed dollar thresholds. Changing partner education can also correlate with total wages, role, marriage timing and other unmeasured traits; conditional model contrasts do not identify a causal matchmaking effect.

## Conclusions

The data support broad exploratory interaction checks, but provide no demonstrated predictive improvement from these proposed interactions. Lack of detected improvement is not proof that compatibility is irrelevant: schooling years and wage roles are coarse proxies, some cells are sparse, and religious/political values are absent from this model. No personal partner ranking, optimal wife/husband type or calibrated individualized divorce probability should be inferred.
