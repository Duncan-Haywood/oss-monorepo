# Research log: catholic-demography

Newest first. Hypotheses and planned analyses are written before the numbers are run.

## 2026-11-03 · Milestone 1 results: fertility gap reversed, retention diverges by ethnicity

Run: `experiments/m1_subgroups/run.py` (output `results.txt`, tables `t1`-`t4`). All figures
weighted by `wtssps`, 95% design-based intervals, n unweighted.

- **Check.** GSS 2024 Catholic share of adults 21.6% [19.3, 23.9] (n 3,269); Pew's 2023-24 RLS
  gives 19%, and 18-21% across Pew surveys since 2014. The GSS sits at the top of Pew's range;
  Pew's point estimate is just below the GSS interval. Recorded as a benchmark gap to explain in
  milestone 2 (question wording, weighting, web mode), not hidden.
- **H1a supported.** Catholic minus Protestant children ever born, ages 45-89, 2000-2024: +0.10
  [0.03, 0.18] overall, +0.05 [-0.03, 0.13] among non-Hispanic whites.
- **H1b mixed.** Non-Hispanic whites born 1945-64: +0.04 [-0.05, 0.14], within ±0.2 (supported).
  Born 1965-80: **-0.28 [-0.48, -0.09]**, Catholics now have *fewer* children than Protestants;
  the interval crosses -0.2, so not refuted as worded, but the planned "no gap" reading is wrong
  for this cohort: the gap reversed. (Ages 45-59 at interview; male fertility not quite complete.)
  Over 1972-2024 the gap goes +0.03 (born 1900-24), +0.25 (1925-44), +0.11 (1945-64), -0.13 (1965-80).
- **H1c supported.** Weekly-attending Catholics have more children: +0.60 [0.45, 0.75]
  (non-Hispanic white), +0.48 [0.07, 0.89] (Hispanic). Descriptive only.
- **H2 refuted for Hispanics.** Raised Catholic and still Catholic, cohorts 1945-64 / 1965-80 /
  1981-96: non-Hispanic white 66% / 63% / 55% (falling, supported); Hispanic 74% / 76% / 71%
  (not monotone, so refuted as stated; the drop is small and the intervals overlap). Pooled by
  survey period, retention fell from 84% (1972-79) to 62% (2021-24). Caveat: the GSS was
  English-only until 2006, so the early Hispanic sample is English-speaking.
- **Q3.** Weekly attendance, Hispanic minus non-Hispanic white Catholics: -0.3 points
  [-5.0, 4.4] in 2010-18, -5.8 [-10.4, -1.2] in 2021-24. Hispanic Catholics are not more
  likely to attend weekly; they are more likely to read the Bible literally (+13 to +22 points)
  and far less likely to be Republican (-25 to -30 points).
- **Composition.** Hispanics were 31% of US Catholics in 2000-09 and 37% [33, 40] in 2021-24;
  foreign-born Catholics 16% in the 1980s, 29% in 2010-18, 24% in 2021-24. Converts are 7-10% of
  Catholics in every period.
- **Next.** Milestone 2 (benchmarks, re-reading) and 3 (is the 24% -> 18% weekly attendance
  drop between 2010-18 and 2021-24 real or the web mode?).

## 2026-11-03 · Milestone 1 plan (written before running)

- Data: GSS 1972-2024 cumulative file, release 3a (NORC), checksum as in `data/SHA256SUMS`
  (same file the `marriage-divorce-evidence` project verified). Weight `wtssps`; design-based
  standard errors from `vstrat`/`vpsu` (1975 on). Ethnicity only from 2000 (the `hispanic`
  item starts then), so ethnic contrasts use the 2000-2024 surveys.
- **H1a (fertility, composition).** For respondents aged 45 to 89 interviewed 2000-2024, the
  Catholic minus Protestant gap in number of children ever born is smaller among non-Hispanic
  whites than among all respondents. Refuted if the non-Hispanic white gap is at least as large.
- **H1b (fertility, the "end of Catholic fertility").** Among non-Hispanic whites born 1945-64 and
  born 1965-80, the Catholic minus Protestant gap is within ±0.2 children. Refuted if the 95%
  interval lies wholly outside ±0.2.
- **H1c (attendance, not label).** Among Catholics aged 45-89, weekly attenders have more children
  than the rest, in both non-Hispanic white and Hispanic groups. Refuted if either gap's interval
  includes zero or is negative. (Descriptive: attendance is measured at the interview, after the
  births, so this is not a causal claim.)
- **H2 (retention).** Among respondents raised Catholic and interviewed 2000-2024, the share still
  Catholic falls across birth cohorts 1945-64, 1965-80, 1981-96 within both non-Hispanic whites and
  Hispanics. Refuted if either group's sequence is not decreasing.
- **Q3 (no directional prior).** Weekly Mass attendance of Hispanic and non-Hispanic white
  Catholics, 2010-2024: report the gap and its interval.
- **Check.** The weighted Catholic share of US adults, 2024, against an outside estimate
  (Pew Religious Landscape Study 2023-24).
