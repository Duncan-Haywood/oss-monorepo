# Sources, inputs and redistribution

- ACS2023one-year national person PUMS: https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip . Official dictionary and weighting documentation are recorded under reproducibility/acs. All80replicate weights are used where specified.
- NSFG2017–2019male/female public files: https://www.cdc.gov/nchs/nsfg/nsfg_2017_2019_puf.htm . Official strata/PSUs/weights and questionnaires establish domains and spouse question routing.
- NLSY79through2022: https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip . Exact source SHA256 and selected codebooks are recorded under longitudinal and derivative modules.

Analysis scripts acquire original files and stream compact extracts. Individual respondent IDs are survey IDs, not identified spouses; no record linkage to real identities is performed. Git excludes person-level analytical records and archives. The full local handoff retains the existing analytical subsets and raw NSFG files so you can rerun without downloading everything. Data-provider terms apply to the original public microdata; this repository’s MIT license applies to authored project code, not a new license on government/provider datasets.

Never substitute wealth for wage income, current occupation for pre-divorce occupation, current divorced status for ever divorced, or a retrospective history for an annual hazard. See source-specific methods for complete denominators and missingness.
