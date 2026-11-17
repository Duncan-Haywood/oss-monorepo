# Example data: PHQ-9 answers from NHANES 2017-2018

`phq9-nhanes-2017-2018.csv` holds 1,500 adults' answers to the nine items of the
Patient Health Questionnaire depression screener (PHQ-9), one row per respondent:
`seqn` (the NHANES respondent number) and nine items scored 0 ("not at all") to
3 ("nearly every day"), each about the last two weeks.

- **Source:** National Center for Health Statistics, National Health and Nutrition
  Examination Survey (NHANES) 2017-2018, Mental Health - Depression Screener
  (`DPQ_J`), https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/DPQ_J.xpt
  (documentation: https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/DPQ_J.htm).
- **Licence:** a work of the US federal government, in the public domain in the
  United States (17 U.S.C. 105). NCHS asks users to cite the source and not to
  attempt to identify respondents; this file carries no information beyond the
  published public-use file, and the tool never asks who anyone is.
- **Retrieved:** 2026-11-17.
- **SHA-256:** input `DPQ_J.xpt` `1c075f332e79736bd2360b41b0c10ed526883417e0b5996c407b1c564b01ca24`;
  output `phq9-nhanes-2017-2018.csv` `a0a58926e30cf2003b64e510e11a8db791342598355a4590ce68af985c52a6fd`.

## What was changed

`build_example.py` (in this folder, standard library only, with its own SAS
XPORT reader) keeps the first 1,500 respondents by `SEQN` who answered at least
one of the nine items (5,533 rows in the file, 5,094 of them asked), drops
`DPQ100` (the difficulty question, not part of the nine-item score), writes codes
7 ("refused") and 9 ("don't know") as blanks, and renames the columns:

| Column | NHANES | Item (paraphrased) |
| --- | --- | --- |
| `interest` | DPQ010 | little interest or pleasure in doing things |
| `down` | DPQ020 | feeling down, depressed or hopeless |
| `sleep` | DPQ030 | trouble sleeping, or sleeping too much |
| `tired` | DPQ040 | feeling tired or having little energy |
| `appetite` | DPQ050 | poor appetite or overeating |
| `failure` | DPQ060 | feeling bad about yourself |
| `concentration` | DPQ070 | trouble concentrating |
| `slow_or_restless` | DPQ080 | moving or speaking slowly, or being fidgety or restless |
| `self_harm_thoughts` | DPQ090 | thoughts of being better off dead or of self-harm |

The output was cross-checked against pandas' `read_sas` of the same file: same
respondents, same values (2026-11-17). 6 of the 1,500 rows have at least one blank.

The unweighted sample is used, so the numbers describe these respondents, not the
US population (NHANES's survey weights are not applied). The PHQ-9 itself was
developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and
colleagues with an educational grant from Pfizer Inc.; no permission is required
to reproduce or use it. The item wording above is paraphrased.
