# ACS 2023 original microdata analysis

Source: U.S. Census Bureau, national 2023 1-year ACS public use microdata person files, psam_pusa.csv and psam_pusb.csv (United States, excludes Puerto Rico).

- Original ZIP: https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip
- Data dictionary: https://www2.census.gov/programs-surveys/acs/tech_docs/pums/data_dict/PUMS_Data_Dictionary_2023.pdf
- Weight method: https://www.census.gov/content/dam/Census/library/publications/2021/acs/acs_pums_handbook_2021.pdf

Run `python3 analyze_acs.py` (requires numpy, pandas, pyarrow). If the ZIP is absent, it downloads the original 569 MiB archive. The manifest records its SHA256. The analysis-ready parquet preserves all included age-30–64 persons, identifiers, detailed education, marital status/history variables, income, employment, demographic controls, and all 80 replicate weights. No personally identifying information is present beyond public-use record identifiers.

## Definitions

Education: SCHL <=15 below high school; 16–17 high school/GED; 18–19 some college; 20 associate; 21 bachelor's; 22 master's; 23 professional beyond bachelor's; 24 doctorate. Sex is Census SEX, male or female, not gender identity. Income is total personal income PINCP times ADJINC/1e6, in 2023 dollars, not household income, salary alone, or predissolution income. Employment ESR is measured near interview and is not employment stability or a longitudinal work history.

`annual_ever_married`: MARHD=1 numerator, MAR!=5 denominator. This estimates the percentage of currently ever-married age-30–64 people reporting divorce in the past 12 months. The rolling interview windows extend across parts of 2022 and 2023. It is not a calendar-year event rate, a marital hazard, a person-year incidence rate, or a lifetime probability. Its denominator includes previously divorced and widowed people, so it cannot be interpreted as the annual risk for an intact marriage.

`annual_all_adults`: MARHD=1 over all ages 30–64, including never-married persons. This is a population annual divorce-event prevalence, likewise not the risk of a marriage ending.

`current_divorced_ever_married`: MAR=3 over MAR!=5. This is current divorced marital-status prevalence, excluding people who remarried after divorce, and not cumulative ever-divorced prevalence.

## Weighting and uncertainty

All point estimates use PWGTP. Standard errors use Census successive difference replication with all 80 PWGTP1–PWGTP80: variance = 4/80 times sum of squared differences between replicate estimates and the full-weight estimate. Reported confidence intervals are 95% normal intervals, bounded to [0,1]. Census often publishes 90% margins; these outputs intentionally use 95%.

Age standardization uses seven 5-year bins, 30–34 through 60–64. For each outcome the standard is the pooled eligible U.S. population across both sexes and all education groups. Replicate estimates recompute both age-specific rates and standard age composition using the corresponding replicate weights. It does not control confounding beyond age. Raw rates are also retained.

## Spouse pairing

Pairing table matches each householder (RELSHIPP=20) to their co-resident spouse (21 or 23) by SERIALNO, with both spouses aged 30–64. It includes both opposite-sex and same-sex spouses, and excludes other married subfamilies. Each householder-spouse household is counted once with the householder's PWGTP and replicate weights. These estimates describe the distribution of current co-resident spouse education pairs, not divorce rates by pairing. Divorced couples have no former-spouse education record in these files; using current pairs to infer pair-specific divorce risk would condition on marriage survival. Householder person weights are used for this person-indexed descriptive subpopulation, not housing-unit weights; do not call these counts all U.S. married couples.

## Interpretation limitations

Cross-sectional associations do not show that higher earnings, degrees, or employment cause lower divorce. Divorce can change income/employment, and income is measured during the same 12-month period as divorce. Education may have been earned after marriage or divorce. Selection into marriage, remarriage, migration, mortality, age at marriage, marriage duration, wealth, childhood conditions, and unobserved characteristics remain. ACS does not collect religious practice. It cannot reconstruct each respondent's full divorce history or first-marriage survival to age 55. Allocation/imputation and top/bottom coding are part of released Census data; supplied FMARHDP and FSCHLP flags permit sensitivity analysis, but baseline estimates retain Census allocations. The tables are exploratory and confidence intervals are pointwise, not corrected for many comparisons.
