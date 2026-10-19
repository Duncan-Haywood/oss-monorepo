# Original NSFG 2017–2019 analysis

Official landing page: https://www.cdc.gov/nchs/nsfg/nsfg_2017_2019_puf.htm
Codebooks: https://www.cdc.gov/nchs/nsfg/nsfg_2017_2019_codebooks.htm
Retrieved October 19, 2026. The download script records exact official sources. These files are the 2017–2019 release, not the newest NSFG release. This wave was selected for readily accessible marital-history recodes and full design variables. Direct downloads require no account.

## Reproduce

Run `sh download.sh`, then `python3 analyze.py` from this folder (Python 3 with pandas, numpy, scipy). `results.csv` contains estimates and confidence limits, `audit.json` sample counts, and `manifest.json` SHA-256 checksums. The original ASCII data and official dictionaries/codebooks are preserved.

## Population and estimands

Analyze people ages 25–49 at interview who have ever married: 2,609 female and 1,908 male respondents. Some respondents screened at age 49 were 50 at interview and are excluded. Full files contain 6,141 female and 5,206 male respondents; all respondents are retained for survey variance computation with zero influence outside each analytical domain.

Primary outcome: the fraction of ever-married respondents whose FIRST marriage had ended in divorce/annulment or separation by interview. MAREND01=1 or 2. This is **historical first-marriage dissolution prevalence at observation**, not lifetime cumulative divorce probability, not the percentage currently divorced, and not an annual rate. Remarried respondents remain counted if their first marriage dissolved. Death/widowhood is not counted as dissolution here and remains in the denominator. A second outcome counts only MAREND01=1 (divorced or annulled), excluding separation. Neither outcome counts someone whose first marriage ended in death but a later marriage ended in divorce. Legal divorce cannot be separated from annulment in this recode.

Exploratory outcome `four_year_dissolution_KM_approx`: a survey-weighted grouped Kaplan–Meier estimate of 1-S at 48 months of first marriage, events = divorce/annulment/separation. Public MAR1DISS is restricted to 0–12, 13–24, 25–36, 37–48, >48 months for both events and ongoing marriages. Events and censoring are placed at the end of their duration interval, with events occurring before tied censoring. This is an approximation; it treats death as censoring and hence is net failure probability rather than a competing-risk cumulative-incidence estimate. The tied interval censoring convention may bias results upward where early censoring is frequent. Current covariates are not baseline covariates, and independent censoring is an untested assumption. Use this only as exploratory duration-standardized context; do not headline it as exact four-year or lifetime divorce risk. Exact century-month marital dates are restricted; public MARDAT01/MARDIS01 retain calendar year only.

## Variables

HIEDUC: 5–8 less than high school; 9 high school/GED; 10 some college/no degree; 11 associate; 12 bachelor; 13 master; 14 doctorate; 15 professional. Degree is highest at interview, possibly earned AFTER divorce. Professional is a separate recode category, not a detailed MD/JD breakdown. Doctorate and professional subgroups are small.

ATTNDNOW: 1/2 weekly or more; 3/4 1–3 times monthly; 5/6 less than monthly; 7 never; refused/don't know excluded. This is current attendance, possibly changed following divorce. ATTND14 is NOT suitable for the full adult analysis: it is asked only to respondents screened under age 25. RELIGION: none/Catholic/Protestant/other at interview.

TOTINCR: prior-calendar-year combined FAMILY income, top category $100,000+. It is neither individual earnings nor pre-marital income; it cannot distinguish $100k, $200k, or $500k. A divorce can itself reduce family income or change who belongs to the family. LABORFOR: current employment status, including full/part time, temporary absence, looking for work, school, keeping house/caring, other. It does not measure stable full-time employment over the marriage. Thus neither table identifies an effect of high salary or work on divorce.

## Weights and uncertainty

Weight WGT2017_2019; strata SEST (18), PSUs SECU nested in strata (72). For each ratio estimate p, respondent influence is w_i D_i(y_i-p)/sum(w_i D_i). Sum influences within PSUs, then variance = sum over strata [m_h/(m_h-1) times sum over PSUs (PSU influence - stratum mean influence)^2]. This is the standard with-replacement Taylor linearization, with 54 design degrees of freedom. For grouped KM the code differentiates the product-limit estimator with respect to each respondent weight, then applies the same design variance. 95% intervals use logit transform and t(54). Confidence limits are not adjusted for multiple comparisons. `sparse=True` marks n<100 OR fewer than 20 unweighted outcome events; this is a transparent caution flag, not a claim to implement every NCHS publication reliability standard.

## Interpretive limits

Unadjusted descriptive associations: age, birth cohort, age at marriage, time since marriage, selection into marriage, race/ethnicity, health and other factors differ across groups. Education/religion/income/employment are measured after many observed dissolutions. Confounding and reverse causality prevent causal interpretation. These male/female samples are not spouses of one another; differences cannot be interpreted as sex effects within a matched marriage. Survey is household civilian noninstitutionalized and limited to reproductive-age respondents; it cannot estimate lifetime outcomes through age 55. Coverage, nonresponse, recall, and survey imputation remain limitations. MAREND01 counts match official codebooks exactly (female 873 divorced/annulled, 177 separated, 45 widowed; male 579,120,19), validating parsing. No interaction, contrast, or association is declared statistically significant solely from separate confidence intervals.

## Age standardization and compact dataset

Run `python3 standardize.py` after downloading. This also reruns the base analysis, and writes `age_standardized.csv` plus `analysis_extract.csv.gz` (only selected fields, all 11,347 records). The standardized estimates use five-year interview-age groups 25–29,30–34,35–39,40–44,45–49. Within each sex, the target is the weighted age distribution of ALL ever-married age25–49 respondents. The estimator is sum_b T_b p_group,b. Taylor influence includes both the group-specific prevalence and estimation of target proportions, preserving their covariance: w_i [I_base,b(p_b-q)/N + T_b I_group,b(y_i-p_b)/B_b], summed over bins. Same 18-stratum/72-PSU variance, 54 df, logit t intervals. Cells with no group observations in an age bin are omitted; min_age_cell_n<10 is also flagged sparse. Age standardization removes this coarse interview-age composition difference only; it does not control age at marriage, marital duration, or reverse causality. Sex-specific standards are not identical distributions and estimates are intended for within-sex comparisons.

Verified identical female/male ATTNDNOW mappings in respective Section I/J codebooks. TOTINCR is fully imputed in the recode and has no missing values across the 11,347 records (all in 1–15); degree values likewise complete (5–15). Attendance codes8/9 are excluded rather than coded never. Census-style household income should not be substituted for the NSFG family-income definition.

## Historical spouse pairing (female respondents only)

Run `python3 pairing.py` for `female_first_spouse_pairing.csv` and `female_pairing_extract.csv.gz`. CHEDMARN (column244) reports first husband's highest completed education. The Section C codebook universe prose is incomplete: questionnaire flow check C-12, page13, explicitly asks this for the FIRST husband OR current/separated husband. The questionnaire uses past tense for a former first husband. Actual data have CHEDMARN nonmissing for all 2,722 ever-married women, including 873 divorced/annulled and 177 separated first marriages; this agrees with questionnaire routing. Verify source https://www.cdc.gov/nchs/data/nsfg/NSFG-PUF2017-2019-FemC-CRQ-508.pdf .

Spouse categories:1 less than HS,2 HS/GED,3 some college,4 associate,5 bachelor,6 graduate/professional,8 refused,9 don't know. Exclude8/9 (21 of2,609 eligible women), leaving n2,588. Produce 2x2 BA-or-higher pairing and 3x3 below-BA/bachelor/graduate-professional pairing. Respondent education is at interview; husband's report uses current/past highest level, NOT explicitly wedding-date attainment. These are retrospectively observed first-marriage outcomes by reported education pairing, not prospective risks from wedding baseline. They are unadjusted for interview age or marital duration and cannot distinguish husband master's, doctorate and professional degree. Male public dictionary provides only current-wife/partner education CWPEDUCN; no analogous former-first-wife educational variable was identified, so do not treat the female pairing results as a matched male/female sample.

Original 2x2 weighted first-marriage divorce/annulment/separation prevalence: both BA+14.49%(95%CI10.95–18.93); wife BA+/husband below BA33.90%(27.97–40.38); wife below BA/husband BA+33.06%(25.27–41.92); both below BA40.89%(36.13–45.83). Associations and temporal caveats apply.

## Formal age-standardized contrasts

Run `python3 contrasts.py` for separate `age_standardized_contrasts.csv` (crude results retained). Female 2x2 spouse pairing is standardized to the same female all-ever-married age25–49 distribution, including target-estimation influence. Each formal difference uses the DIFFERENCE of respondent influence vectors before survey variance computation, retaining covariance between estimates, including their shared target. Differences use untransformed t(54) confidence intervals in percentage points; individual prevalence estimates use logit intervals. These are exploratory, unadjusted-for-multiple-comparison contrasts.

Age-standardized female pairing: both BA+14.36%(10.86–18.76), wife BA+/husband below BA33.16%(28.07–38.68), wife below BA/husband BA+32.07%(24.49–40.74), both below BA41.52%(36.66–46.54). Both BA+ minus both below BA = -27.15 percentage points (95%CI -33.57 to -20.74).

Age-standardized attendance NEVER minus weekly-or-more = +15.69 percentage points (9.30–22.09) in women, +12.70 (3.00–22.40) in men. These contrasts use design covariance rather than inferring a difference from marginal CI overlap.
