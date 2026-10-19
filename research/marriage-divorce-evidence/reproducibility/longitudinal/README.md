# NLSY79 original microdata analysis

Official archive: https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip
Official landing page: https://www.nlsinfo.org/content/access-data-investigator/accessing-data-cohorts
Downloaded 2026-10-19. Archive size: 450,128,335 bytes. Release page says updated 2025-01-21. Source comprises data through round 30, nominal survey year 2022 (some interviews occurred in 2023).

Run `python3 extract_nlsy79.py` then `python3 analyze_nlsy79.py`. Extraction requires Python standard library only, reads the 6.7GB CSV from the compressed archive without saving the full CSV, and writes a compact public-use respondent extract plus selected variable codebook. The extraction script downloads the archive if absent.

## Estimand and population

Among respondents with positive 2022 sampling weight and valid 2022 marital status who have ever married, estimate the weighted fraction ever recorded as legally divorced through 2022/23. Baseline pre-1979 most recent divorce year, every annual/biennial created marital-status variable, and marital transition codes supplement one another, including divorces followed by remarriage between interviews. Outcome is cumulative recorded divorce occurrence by interview, not current divorced prevalence, an annual rate, fixed-duration first-marriage risk, or complete lifetime risk. Respondents were born 1957–64; age and marital exposure differ. This does not exactly reproduce the BLS age-55 analysis, which uses a different selected sample and custom weights.

Education uses HIGHEST_DEGREE_EVER and HGC_EVER, measured at latest available report. BA/BS combined; masters, PhD and professional degrees remain separate. High school-equivalent degree with >=13 grades becomes some college. A skipped degree with <12 grades is classified less than high school; other skipped/unknown degree values remain separately labeled. Education may have been completed after a divorce and is an association, not a baseline treatment.

## Uncertainty

2022 SAMPWEIGHT is divided by 100 (scaling cancels in ratios). CIs are 95% normal/logit intervals using independent-person linearization of the weighted ratio: n/(n-1)*sum[w_i^2*(y_i-p)^2]/sum(w_i)^2. Effective n = sum(w)^2/sum(w^2). These are **weight-only approximate CIs, not complex-survey design CIs**. The archive did not include recognizable PSU/stratum identifiers. Clustering, original sample stratification, and uncertainty in weights are not represented. Sparse degree-by-sex cells must not be treated as precise rankings.

## Prospective supplemental association

Restrict to respondents married in 2000 and retained with positive weight/valid marital status in 2022. Relate 1999 family income (nominal dollars) and 1999 annual respondent work hours to any divorce transition recorded in survey rounds 2002–2022. Thus income/employment precede the outcome interval. This is cumulative recorded follow-up occurrence conditional on retention, not an annual divorce rate or marriage-specific survival estimate. A divorce followed by remarriage still counts. Widowhood is not coded divorce, but not treated as a competing event. Current 2022 weights are used; they do not remove every selection bias associated with this retained historical subgroup. Income is combined family income, not the respondent's salary, and is topcoded as documented in the codebook. Hours worked may be incomplete. Associations are unadjusted and cannot establish causality.

## Source access notes

NLSY79 public-use full archive is directly accessible without credentials. This run did NOT use Investigator credentials or restricted geography. PSID's official page https://simba.isr.umich.edu/data/data.aspx says first-time downloaders must complete free registration with username/password; this run did not create an account. It is an access/setup requirement, not evidence that PSID data are confidential or unavailable.

BLS benchmark source: https://www.bls.gov/mlr/2024/article/patterns-of-marriage-and-divorce-from-ages-15-to-55-evidence-from-the-nlsy79.htm . Its 70.5% figure is among **ever-married men with bachelor's or higher**, not all college-educated men, not both-college spouse pairs, and not evidence about pay. The corresponding ever-married percentage is 88.6%, so the all-men-in-category first-marriage share is approximately 62.5%. Remaining out of a first marriage includes widowhood, so 100 minus first-marriage retention is not automatically divorce risk.

## Coverage and coding audit

Birth-year field R00005.00 is stored as two-digit 57–64; verified retained respondents span 1957–1964. Nominal 2022 age is 58–65; actual 2023 interviews can reach 66. Interview-date variables were not selected, so no exact interview-age claim is made.

Of the 5,562 ever-married analyzed respondents, 3,529 have valid marital-status reports in all 30 survey rounds. There are 2,681 without a recorded divorce; 893 of these have at least one missing marital-status wave. Missing interviews are NOT proof of no divorce: a transition may be recovered retrospectively at later interviews, but some events can remain unreported. Therefore `ever_divorce=0` means **no recorded divorce**, not verified never divorced. Estimates can undercount divorce histories and are expressly labeled recorded occurrence. The companion `nlsy79_complete_waves_sensitivity.csv` restricts to all 30 valid status reports (it is selective and does not replace proper missing-history or attrition modeling).

The women masters result was verified against direct highest-degree code 5, not a grade proxy: n=263, 142 recorded divorces, weighted 50.97%. Women BA/BS codes 3/4: n=497, 210 recorded divorces, weighted 39.97%. In the all-30-round sensitivity sample, these become 48.25% (n=200) and 37.28% (n=366). This persistence rules out the simple hypothesis that the entire observed difference came from missing interview waves, but not age-at-marriage, cohort, selection, or other confounding.

Baseline source codes were separately verified: R70065.00 is TNFI_TRUNC, total net family income in 1999; R70076.00 is HRSWK-PCY, annual respondent hours worked in the prior calendar year, fielded 2000. Its codebook warns hours can be valid despite some unaccounted time; the percentage-missing-time variable was not extracted, so work-hour results are exploratory. R70070.00 MARSTAT-KEY code 1 means married in 2000. T99001.00 HIGHEST_DEGREE_EVER code 5 means masters, 6 PhD, 7 professional.
