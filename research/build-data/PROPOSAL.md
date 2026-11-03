# build-data: do open permit records predict permit and build duration across cities?

Status: proposal (session 1, 2026-10-31). AI-assisted work; no affiliation with
any city, agency or journal is implied. Not legal, engineering or financial advice.

## Question

Do public building-permit records from several cities, loaded onto one open
schema, predict how long a permit takes to issue, and how long the build behind
it takes to complete, better than each city's own historical averages, and which
fields carry the signal? It is open because most published duration models use
one agency's private or proprietary project data, and no open, multi-city,
reproducible benchmark with calibrated intervals appears to exist (checked below,
to be re-checked at submission).

## Why it matters

Homeowners, small contractors and lenders plan around a number the permit office
does not publish as a forecast. A calibrated interval ("80% of comparable
permits issue in 9 to 41 days") is more useful than a mean. The same table is the
first fact table of the repository's construction data warehouse
(`ventures/wall-framing-takeoff` and tracks 12 and 20 need duration priors). If
cross-city transfer fails, that is also a result: it says a national tool must
carry per-city models.

## Related work

Checked with `research/_shared/cite_check.py` (see `LOG.md`, session 1).

Construction duration and delay prediction
1. Gondia, Siam, El-Dakhakhni and Nassar (2020), "Machine Learning Algorithms for Construction Projects Delay Risk Prediction", *J. Constr. Eng. Manag.* 146(1), doi:10.1061/(ASCE)CO.1943-7862.0001736. Classifies delay risk from project-level survey features; one data source, no calibrated intervals, no public data.
2. Flyvbjerg (2006), "From Nobel Prize to Project Management: Getting Risks Right", *Project Management Journal* 37(3), doi:10.1177/875697280603700302. Reference-class forecasting: use the distribution of comparable past projects. Our baselines are the permit-feed version of this idea; it does not say how to pick the class.

Tabular learning
3. Chen and Guestrin (2016), "XGBoost: A Scalable Tree Boosting System", arXiv:1603.02754. Strong default for tabular regression.
4. Prokhorenkova et al. (2018), "CatBoost: unbiased boosting with categorical features", arXiv:1706.09516. Handles the high-cardinality categorical fields (permit type, work description, contractor) permits are full of.
5. Grinsztajn, Oyallon and Varoquaux (2022), "Why do tree-based models still outperform deep learning on tabular data?", arXiv:2207.08815. Justifies trees as the baseline to beat, on benchmarks that are not permits.
6. Shwartz-Ziv and Armon (2022), "Tabular Data: Deep Learning is Not All You Need", arXiv:2106.03253. Same direction, with ensembles.

Uncertainty and scoring
7. Romano, Patterson and Candes (2019), "Conformalized Quantile Regression", arXiv:1905.03222. Intervals with finite-sample coverage under exchangeability; permits drift over time, so exchangeability is the assumption we test.
8. Angelopoulos and Bates (2021), "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification", arXiv:2107.07511. Coverage definitions and diagnostics we report.
9. Gneiting and Raftery (2007), "Strictly Proper Scoring Rules, Prediction, and Estimation", *JASA* 102(477), doi:10.1198/016214506000001437. Why we score with pinball loss and CRPS, not RMSE.
10. Koenker and Bassett (1978), "Regression Quantiles", *Econometrica* 46(1), doi:10.2307/1913643. The quantile loss under the interval models.

Attribution and data practice
11. Lundberg and Lee (2017), "A Unified Approach to Interpreting Model Predictions", arXiv:1705.07874. Field attribution for "which fields carry the signal"; we add a permutation test because SHAP is not a causal claim.
12. Gebru et al. (2018), "Datasheets for Datasets", arXiv:1803.09010. Each city's feed gets a datasheet (licence, censoring, definitions).

Our own earlier work: `ventures/wall-framing-takeoff` (quantity side of the same
buildings); no earlier research project here models permit durations
(`platform/ci/research_idea_dupe.py permit` finds none).

## Gap

Claim, narrowly: on open permit feeds from at least three US cities, mapped to one
schema with documented field definitions, (a) a gradient-boosted quantile model
beats the per-city, per-permit-type empirical-quantile baseline on pinball loss,
(b) conformalised intervals keep their nominal coverage under a forward-in-time
split, and (c) the gain is concentrated in a small set of fields. We do not claim
a causal effect of any field, nor that models transfer across cities; transfer is
a hypothesis we test.

Data facts found so far (session 1 probe, 2026-10-31, row counts from each feed's
API): Chicago `ydr8-5enu` has 851,778 rows, every one with an issue date, so it
contains only issued permits and cannot show permits that were never issued
(right-censoring and survivorship bias). San Francisco `i98e-djp9` has 1,297,657
rows, 1,233,195 issued and 750,188 completed. Austin `3syk-w9eu` has 2,382,939
rows, 2,184,191 with a completed date. Licences from the dataset metadata:
Chicago "See Terms of Use", San Francisco ODC PDDL, Austin US-government public
domain; NYC DOB NOW `w9ak-ipjd` states none and is excluded until checked.

## Hypotheses

- H1. A LightGBM or CatBoost quantile model beats the per-city, per-type empirical quantile baseline on mean pinball loss at q = 0.1, 0.5, 0.9 on a held-out final year. Refuted if the paired bootstrap interval of the loss difference includes zero in two of three cities.
- H2. Split-conformal intervals calibrated on the year before the test year cover within 3 points of nominal 80% on the test year. Refuted if coverage is outside that band in any city, which would mean drift breaks exchangeability.
- H3. At most five fields account for 80% of the gain over the baseline (by permutation importance). Refuted if more are needed.
- H4. A model trained on two cities and tested on the third is no better than that city's own baseline. Refuted if it is better, which would favour a pooled national model.

## Method

Experiments only; no theory claim beyond the cited coverage guarantee.
1. Loader per city: SoQL pulls with a pinned snapshot date, stored as parquet outside git, with the pull script and a row-count manifest in git.
2. One schema: permit id, city, permit type, work class, estimated cost, applied, issued, completed dates, parcel/area, contractor id (hashed), and a documented null policy. Datasheet per feed.
3. Targets: days applied to issued (all cities with both dates), days issued to completed (SF, Austin). Report censoring explicitly; Chicago excluded from survivorship-sensitive claims.
4. Cost fields are reported in the feed's own units and left unadjusted; where a feed lacks a field, the cell is missing, not imputed silently.

## Evaluation

Baselines: per-city, per-type empirical quantiles (the reference-class forecast); a linear quantile regression; XGBoost, LightGBM and CatBoost quantile models; one tabular neural net, so the "trees win" prior is tested rather than assumed. Split by time (train to year Y-2, calibrate Y-1, test Y), never random. Metrics: pinball loss, CRPS from a quantile grid, interval coverage and width. Five random-seed repeats for stochastic models; 95% intervals by paired block bootstrap over weeks; Wilcoxon signed-rank on per-week losses. Ablations: drop each field group; drop cost; pooled versus per-city.

## Milestones

1. Loaders, schema and datasheets for Chicago, SF, Austin; row-count manifest (one PR).
2. Baselines and the quantile-loss harness with the forward-in-time split (one PR).
3. Boosted models and H1, with `LOG.md` hypotheses written before the run.
4. Conformal calibration and H2, including a drift diagnostic.
5. Importance and ablations, H3.
6. Cross-city transfer, H4, and a fourth city once its licence is checked.
7. `paper/` in the target venue's format; the repository's permit-duration prior published as a data file for the ventures.

## Target venue

*Automation in Construction* (Elsevier, full article, data-in-brief companion
possible) or ASCE *Journal of Construction Engineering and Management*. Aim, not
a claim of acceptance; submitting is an owner step.
