# Model card

**Task:** prospective recorded legal-divorce incidence per observed married respondent-year. Not fidelity, relationship quality, causal effects or lifetime risk.

**Couple panel:**40,818intervals/5,735respondents/726events; baseline co-resident opposite-sex marriages in NLSY79. Both partners’ schooling and wages plus available respondent characteristics. Positive, zero and missing wages are distinct.

**Individual panels:**45,977legally-married/separated intervals with1,463events; currently-married sensitivity42,259intervals/854events. The first split in the inclusive tree is already-separated status.

**Evaluation:** fixed fivefold respondent-held-out cross-validation, training-only preprocessing, survey/exposure-weighted Poisson loss and calibration. The couple temporal test is a sensitivity with repeated people and frozen training cutpoints, not independent external validation.

**Performance:** couple enriched additive model≈3.4%loss reduction vsconstant; more flexible splines/trees did not improve on it. Currently-married individual additive≈1.94%; inclusive models≈13%largely reflect preexisting separation. These are not classification accuracy percentages.

**Uncertainty/limits:** older1957–1964birth cohort, incomplete/full-survey-design uncertainty, unobserved wealth/business income and relationship quality, survivor/attrition selection. Own attendance is not paired faith compatibility. Fine pair cells are sparse. No validated individual forecast for current partner search. See feature_manifest.json, model_artifact_manifest.json and independent_verification/verification files in each ML folder.

**Use:** methodological reproduction, broad exploratory associations and model comparison. Do not optimize a prospective spouse’s characteristics against these models as if they identified causal or personalized safety.
