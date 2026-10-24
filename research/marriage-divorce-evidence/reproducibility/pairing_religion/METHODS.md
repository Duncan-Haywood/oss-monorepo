# Baseline2000 couple religion and future legal divorce

Original analysis of public NLSY79 data. Use `extract_religion.py` on the shared official1979–2022archive, then `analyze_religion.py`. Original archive: https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip . Annual endpoints are inherited from sibling annual_nlsy analysis and its documented extraction/audit. This is a small two-year prospective analysis, not a contemporary cross-section or lifetime probability study.

Official religion documentation: https://www.nlsinfo.org/content/cohorts/nlsy79/topical-guide/family-background/introduction . Official2000questionnaire with the exact questions/codes: https://www.nlsinfo.org/sites/default/files/attachments/121210/3.Marital%20History.html . Codes and original questions are preserved in selected_codebook.json.

## Baseline variables

All four variables are from the same2000interview, before follow-up outcomes. Respondent affiliation R6533500, attendance R6533600; spouse affiliation R6538600, attendance R6538700. Spouse information is reported by the respondent, not an independent spouse interview.

Affiliation codes1Protestant/Christian/nondenominational/unspecified;2Baptist;3Episcopalian;4Lutheran;5Methodist;6Presbyterian;7Roman Catholic;8Jewish;9other;10none. Code1is a broad heterogeneous category, so identical codes do not establish identical detailed beliefs or denominations. Code9is likewise heterogeneous. Named Protestant denomination comparison is restricted to codes2–6for both spouses, excluding unspecified/other codes.

Attendance code1more than weekly,2weekly,3two/three times monthly,4monthly,5several times/year or less,6never. Codes3–4are combined into monthly1–3times because code3has very few observations. More-than-weekly and weekly remain separate; never and several-times/year remain separate. Both spouses' levels and all observed cells are reported, without selecting the minimum as an optimum.

## Prospective outcome and denominator

Restrict the existing prospective interval dataset to start_wave2000: respondent married at baseline, observed valid2002follow-up, valid2000survey weight and interview/event dates. This is4,336respondents and105legal divorces before religion-specific complete-case restrictions. Follow each person's baseline marriage only from2000interview to first legal divorce, widowhood, or2002interview. Exposure uses event/interview months, and widowhood censors. A divorce/remarriage within the interval counts the first divorce; a first widowhood stops follow-up before a subsequent marriage's divorce. Baseline religion is never applied to a replacement spouse in later intervals. Missing outcomes/date histories are excluded as documented in the shared annual analysis.

Rates are weighted legal divorces divided by weighted person-years, multiplied by1,000. They are annual incidence rates, not percentages of marriages ending in a fixed year, cumulative first-marriage risk, or lifetime prevalence. Baseline year2000cohort members are approximately36–43years old; estimates do not generalize to all current U.S. couples or newlyweds. Existing marriages have already survived to baseline. Religion can change after baseline. Nonresponse, mortality, immigration and selection into/out of marriage are not fully repaired by weighting.

## Weights and uncertainty

Use existing baseline2000SAMPWEIGHT/100. This weight adjusts the original complex sampling and baseline nonresponse; it is not a purpose-built two-wave religion-complete-case longitudinal weight. No correction for subsequent attrition or religion missingness is applied. Rate CIs use respondent-level weighted-ratio sandwich linearization, with log intervals when events>0. Each respondent contributes one interval. Full original surveyPSU/strata design variance is unavailable in this extract, so these are APPROXIMATE CIs and may understate uncertainty. Zero-event groups have missing CIs rather than zero-width certainty; do not infer zero risk. Fewer-than10event cells are explicitly flagged.

Models fit weighted Poisson log rates with an exposure offset, and use independent-respondent robust sandwich CIs. Adjustment includes baseline respondent sex, age and age at first marriage. The joint attendance model includes BOTH spouses' five-level attendance categories. The coded-affiliation mismatch model includes mismatch plus both spouses' broad affiliation levels(Protestant/Christian,Catholic,None,Jewish/Other). It does not fully adjust each detailed denomination or education/income/employment. The weekly pair model estimates each observed pair category relative to bothweekly+, rather than pretending mismatch can change while holding both exact attendance levels fixed. These are exploratory associations, not causal effects. One interval, about100events and up to12parameters limit precision; no multiplicity correction is applied.

Adjusted margins average model-predicted annual rates over the weighted eligible respondents' other baseline covariates. Their delta-method CIs condition on the empirical target distribution and use coefficient sandwich covariance; they are approximate, not full survey or bootstrap intervals. Pair categories and finer religion strata can lack overlap. Model linearity/additivity and unmeasured confounding remain. Conditional mismatch terms can involve model extrapolation; prefer presenting direct observed pair cells alongside adjusted results.

Husband/wife attendance labels infer opposite-sex spouse roles from respondent sex. This is appropriate to the legal-marriage context of the2000baseline but is not a measured spouse-sex variable. For strongest provenance use respondent/spouse attendance tables stratified by respondentsex; do not generalize directional sparse cells into a husband-versus-wife rule.

## Principal results

Different coded affiliations:1,038respondents/25events,12.51divorces per1,000person-years(approx95%CI8.05–19.44). Same coded affiliation:3,261respondents/77events,11.88(9.17–15.38). Adjusted mismatch rate ratio0.989(0.590–1.658). This does not establish equivalence; the interval permits meaningful associations in either direction.

Different named Protestant denominations:85respondents and ZEROevents; there is insufficient event support for estimating a denomination-mismatch effect. Same named denomination:1,185respondents/25events. This is not evidence that mismatching denominations protects marriages.

Respondent more-than-weekly versus weekly attendance, controlling spouse attendance and age/sex/first-marriageage:RR1.70(0.65–4.44). The interval is wide and does not support a monotonic more-attendance-is-better claim. Full category results are retained. The only-wife-weekly+cell contains75respondents and6events and should not be promoted as a substantive directional finding.
