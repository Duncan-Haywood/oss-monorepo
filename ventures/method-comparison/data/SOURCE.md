# Example data

## `nhanes-2017-2018-systolic.csv`

**Source:** U.S. Centers for Disease Control and Prevention, National Center for
Health Statistics, National Health and Nutrition Examination Survey (NHANES)
2017-2018. Public domain (U.S. government work). Files, downloaded 2026-11-17 from
`https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/`:

| File | SHA-256 |
| --- | --- |
| `BPX_J.xpt` (Blood Pressure, auscultatory) | `f98f1d9a4c18173e715c749b4294f6f1525140d5ad5751316bb17cc038fb3423` |
| `BPXO_J.xpt` (Blood Pressure, oscillometric) | `9a7f4b6d0e327282b0032c94ab85936c9b1027e5e4d410bcda6af23f188665c4` |
| `DEMO_J.xpt` (demographics, for age) | `c0b46e0345ea19404928656277c8b0d10b0cca348a9b2fe4fc3c67e8b7ee73ec` |

**What it is.** The BPXO_J documentation describes a blood-pressure methodology
study run in the 2017-2018 cycle: each participant had blood pressure measured
twice, by a physician with a mercury sphygmomanometer and stethoscope
(auscultatory, `BPXSY1-3`) and by a health technician with an Omron HEM-907XL
upper-arm oscillometric device (`BPXOSY1-3`), in randomly assigned order. The
documentation points to the NCHS Vital and Health Statistics Series 2 report on
the study (Ostchega et al., 2021) for its results; this tool does not reproduce
that report's numbers.

**What we did** (`eval/make_nhanes_bp.py`): kept adults (age 18 or over,
`RIDAGEYR`) with all three systolic readings by both methods (4,212 people), and
wrote the mean of the three readings for each method, rounded to 0.01 mmHg
(trailing `.00` dropped). `seqn` is the public NHANES respondent number. Not
weighted: these are the sample's people, not U.S. population estimates.

Columns: `seqn`, `mercury_sbp` (comparison method x), `oscillometric_sbp` (new
method y), both mmHg.

## `bland-altman-1986-peak-flow.csv`

**Source:** J. M. Bland and D. G. Altman (1986), "Statistical methods for
assessing agreement between two methods of clinical measurement", The Lancet
327(8476), 307-310, doi:10.1016/S0140-6736(86)90837-8, Table 1: peak
expiratory flow rate (l/min) of 17 people measured with a Wright peak flow
meter and a mini Wright meter; the first of the two readings by each meter.
Measurements published as facts in the paper. The tests check that they give
the paper's summary: mean difference (Wright minus mini) -2.1 l/min, SD 38.8,
limits (mean +/- 2 SD) -79.7 to 75.5. The tool reports new minus comparison
(mini minus Wright), so the same numbers with the sign flipped.

Columns: `subject`, `wright_l_min` (x), `mini_wright_l_min` (y).
