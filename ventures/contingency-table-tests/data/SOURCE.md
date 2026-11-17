# Example data

## `berkeley-admissions-1973.csv`

Applicants to the six largest graduate departments of the University of
California, Berkeley, in fall 1973, by department, gender and decision: the
data of Bickel, P. J., Hammel, E. A. and O'Connell, J. W. (1975), "Sex bias in
graduate admissions: data from Berkeley", *Science* 187(4175), 398-404,
<https://doi.org/10.1126/science.187.4175.398>, as distributed in R's
`datasets::UCBAdmissions`.

Retrieved 2026-11-17 from the Rdatasets collection,
<https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/datasets/UCBAdmissions.csv>
(columns `rownames,Admit,Gender,Dept,Freq`). Converted to
`department,gender,decision,applicants` with the same 24 counts; no value was
changed (SHA-256 of the converted file: `8bc8fd4a6456f6c801f5dcab041e2aa56e88b68cd941806b49629a4b3cd94913`). The counts are published facts from the paper; departments are
anonymised A to F as in the source.

## Tables in `example-data.mjs`

- **Twin convictions** (2x2): the `Convictions` table in R's `fisher.test`
  documentation, which cites Fisher (1962, 1970): of 17 dizygotic twins of
  convicted criminals 2 were convicted, of 13 monozygotic twins 10.
- **Job satisfaction by income** (4x4): the `Job` table in the same
  documentation, from Agresti (2002), *Categorical Data Analysis*, 2nd ed., p. 57.
- **Penicillin and rabbits** (used only in tests): the `Rabbits` table in R's
  `mantelhaen.test` documentation, from Agresti (1990), pp. 231-237.

R's documentation (`src/library/stats/man/fisher.test.Rd` and
`mantelhaen.test.Rd`, retrieved 2026-11-17 from the r-source mirror on GitHub)
is also the source of the published p-values the tests reproduce: 0.2429 (tea
tasting), 0.0004652 (twins, one-sided), 0.7827 (job satisfaction), and for the
rabbits 0.047 (CMH), 0.040 (exact) and 0.020 (exact, one-sided).
