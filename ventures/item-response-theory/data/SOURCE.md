# Data

## lsat6.csv

Law School Admission Test, Section 6: the response patterns of 1,000
examinees to 5 right/wrong questions, as counts per pattern (30 of the 32
possible patterns occur).

- Source: Bock, R. D. & Lieberman, M. (1970). Fitting a response model for n
  dichotomously scored items. *Psychometrika*, 35(2), 179-197.
  doi:10.1007/BF02291262.
- Taken from the `LSAT` data set of the R package ltm (Rizopoulos 2006,
  doi:10.18637/jss.v017.i05), file `data/LSAT.rda` in ltm 1.2-0 on CRAN,
  read with the Python package rdata and tabulated by pattern. Only the
  30 pattern counts are reproduced here (factual data from a 1970 journal
  article, reprinted in many textbooks); none of ltm's code is.
- Item proportions correct: 0.924, 0.709, 0.553, 0.763, 0.870.

## SAT12 (not in this repository)

`eval/sat12.py` downloads the R package mirt's source from CRAN and writes
its `SAT12` data (600 students, 32 multiple-choice science questions, from
the TESTFACT manual, Wood et al. 2003) to a path you give, with the key
from mirt's documentation. It is not committed because it comes from a
commercial software manual. `eval/sat12.json` holds only the statistics the
page and the post quote.
