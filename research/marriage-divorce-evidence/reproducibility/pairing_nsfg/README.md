# Education mismatch in historical first marriages (NSFG 2017–2019)

Original microdata analysis. Run `python3 analyze_mismatch.py` after reproducing ../nsfg downloads. Shared modules and original data are in ../nsfg; scripts reuse that work and refresh identical base tables. Outputs: `age_standardized_pairing_cells.csv`, `formal_contrasts_and_models.csv`, `run_log.txt`. Primary outcome is first marriage ended in divorce/annulment OR separation by interview, among female ever-married respondents25–49. This is historical prevalence, not an annual divorce rate or a lifetime risk.

Education levels, marriage outcome, first-husband scope and survey design have the definitions in ../nsfg/README.md. Valid education pairs n2,588; spouse refused/don'tknow excluded. Female degree at interview, husband highest completed current/past education, NOT education explicitly measured at wedding. First husband is identified by CHEDMARN verified questionnaire C-12 routing, not by substituting current second husband.

## What the 2x2 comparison says

Age-standardized (five-year age groups, common pooled female ever-married age25–49 standard): both below BA41.52%(36.66–46.54), wife below BA/husbandBA+32.07%(24.49–40.74), wifeBA+/husband below BA33.16%(28.07–38.68), bothBA+14.36%(10.86–18.76). Female n/events respectively1417/669,203/73,410/161,558/106.

Directional mismatches differ by only+1.09 percentage points (wife higher minus husband higher;95%CI -8.00 to10.18), so this analysis does not resolve a direction-specific difference at the broad BA threshold.

It is misleading to infer that matching itself protects from the large both-high versus both-low difference: both groups match. Within wives below BA, a BA+ husband is associated with9.45points LOWER dissolution than a below-BA husband (CI -19.83 to0.94); this direction does not imply matching is universally advantageous. Within wives BA+, a below-BA husband is associated with18.80points HIGHER dissolution than a BA+ husband (11.94–25.66). Education level and mismatch must be separated.

## Comparison with balanced education margins

We calculate mean(off-diagonal cell prevalences) minus mean(diagonal cell prevalences), weighting cells equally after age standardization. This balances each partner's marginal education distribution between matched and mismatched comparisons. It is a descriptive interaction contrast under this artificial equal-cell target, NOT the population average difference and NOT a causal effect of changing whether a couple matches.

At BA2x2: mismatch-minus-match =+4.68points (95%CI -2.07 to11.43). At below-BA/bachelor/graduate-professional3x3: +0.70points(-4.50 to5.90). These comparisons do not provide clear evidence of a generic mismatch penalty beyond the education marginal composition. They do not establish equivalence or exclude moderate differences. The3x3 table contains small/sparse cells (flagged); respondent graduate/professional combines master's/doctorate/professional to match spouse category6.

## Exploratory models, not the principal result

Fit survey-weighted binomial logit with five-year age indicators, categorical wife's education, categorical husband's education, then mismatch term(s). Newton updates solve weighted score equations. Full-sample respondent influence = weighted score times inverse weighted Hessian; survey variance sums influence within72PSUs nested18strata with stratum centering and m/(m-1) correction. Intervals use t54. No independent-respondent standard errors, and no multiplicity correction.

2x2 generic mismatch OR1.40(0.97–2.00). In3x3, wife-higher OR2.19(1.12–4.30), husband-higher OR0.65(0.35–1.21), each relative to matched under the model's education main effects. These estimates are functional-form dependent: mismatch is determined by partner education, so it cannot literally be varied while holding both degrees fixed. They measure departure from the imposed additive education log-odds structure and are sensitive to category thresholds and sparse cells. The stronger wife-higher3x3 model result should not be represented as a confirmed independent causal mismatch effect, especially given no clear2x2 directional contrast or balanced-margin average mismatch effect. Interview age adjustment does not control marital duration, age at wedding, cohort or unmeasured selection.

For standardized cell estimates, Taylor influence includes uncertainty in the shared age standard. All risk-difference contrasts use difference/linear combinations of full respondent influence vectors before variance calculation, preserving covariance. Individual prevalence CIs use logit transformation; differences use t54 on percentage-point scale.

## Why NSFG does not answer religion/earnings mismatch here

Complete public female/male dictionary keyword review found respondent religion/attendance, not first-spouse religion or attendance. RELRAISD is respondent religion raised, RELCURR current respondent affiliation, ATTNDNOW current respondent attendance. ATTND14 is only asked under25 at screening. Neither first-husband nor first-wife religious mismatch can be constructed from these fields.

SectionI SPWRKST/SPFTPTX describe CURRENT husband/cohabiting partner employment, with universe currently married/cohabiting, not former first spouses. SectionJ EARN asks respondent's own current/last-job gross earnings in categories; EARNTYPE week/month/year; neither spouse earning amounts nor first-spouse historical earnings are present. TOTINCR is combined family income for prior calendar year, not husband's personal income. Subtracting respondent grouped last-job earnings from family income would not identify spouse earnings: periods/categories differ, family may include other earners/income, and divorce may have changed family membership. Hence historical husband's-versus-wife's earning mismatch cannot defensibly be estimated here.

New official supporting source saved locally: female_sectionJ.pdf from https://www.cdc.gov/nchs/data/nsfg/2017-2019_NSFG_FemResp_SectionJ_Codebook-508.pdf . Current-spouse work universe is in ../nsfg/female_religion.pdf SectionI, pp15–16; EARN definition in female_sectionJ.pdf pp28–29. First-spouse education routing is in ../nsfg/female_marriage_questionnaire.pdf p13. No NLSY religion claims were inferred; that requires separate source verification.
