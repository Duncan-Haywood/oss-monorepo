# Research log: catholic-demography

Newest first. Hypotheses and planned analyses are written before the numbers are run.


## 2026-11-04 · Milestone 5a results: the inflow of people raised Catholic held the share up; falling retention pulled it down

Run: `experiments/m5a_decomp/run.py` (output `results.txt`, tables `t11`, `t12`; run under a Python with
numpy and pandas, data per `data/download.sh`). Adults 18+, weights `wtssps`, intervals from a 500-draw
stratified PSU bootstrap (seed 1). Identity S = R r + (1-R) c (share Catholic = share raised Catholic x
retention + share not raised Catholic x conversion in), changes split by the midpoint rule; the three terms
sum to the change exactly (asserted in the code). The plan was fixed before running: no directional prior,
except that H4's "immigration holds the share up" implies the raised-Catholic term is positive.

- **Levels.** Raised Catholic 30.7% (1990-99), 33.4%, 34.5% (2010-18), 33.7% (2021-24). Retention 77.7%,
  73.8%, 66.7%, 61.3%. Conversion in 3.6%, 3.3%, 3.0%, 2.3%.
- **1990-99 to 2010-18** (share 26.4% to 25.0%, -1.4 points [-2.7, -0.0]): inflow of those raised Catholic
  **+2.6 [+1.6, +3.6]**, retention **-3.6 [-4.2, -3.0]**, conversion in -0.4 [-0.7, -0.1]. The Catholic share
  was roughly stable only because a larger share of children were raised Catholic offset a steady loss of
  them. 
- **To 2021-24** (22.2%): retention -5.3 [-5.9, -4.6] and conversion -0.9; inflow +2.0. Between 2010-18 and
  2021-24 the inflow term is -0.5 [-1.4, +0.4], so the offset has stopped. Caveat from milestone 3: web-mode
  2021-24 data may understate retention (the Model B period term, -0.22 log-odds), so the last step is the
  least firm.
- **Immigration, descriptively.** Foreign-born share of Catholics 19.8% (1990s), 27.6%, 28.7% (2010-18),
  23.8% (2021-24). Consistent with an immigrant contribution to the inflow term, but this decomposition
  cannot split inflow into fertility and immigration, so **H4 stays untested**.
- **Next.** Milestone 5b: split the inflow term with NCHS births by ethnicity and ACS/Census immigration
  (both hosts answered 200 through the proxy this session), then the H5 projection score.

## 2026-11-04 · Milestone 4 results: the cohort fall is real for white Catholics, and Hispanic retention diverges significantly

Run: `experiments/m4_retention/run.py` (output `results.txt`, tables `t8`-`t10`; estimator `survey.logit`
with tests). Sample: raised Catholic, non-Hispanic white or Hispanic, age 30+, interviewed 2000-2024,
born 1945-96 (n = 7,155). The plan above (reference group) said "white"; the first run had the
reference as all non-Hispanics, which a fitted-vs-cell-share check caught (0.6107 vs 0.6086); the
domain now excludes NH Black and NH other and the check matches exactly.

- **H2' supported for white Catholics.** Retention by cohort 66.1% / 60.9% / 47.7% (1945-64 /
  1965-80 / 1981-96; 1981-96 interval [42.0, 53.4]). Logit coefficients -0.23 [-0.39, -0.07] and
  -0.76 [-1.01, -0.52]; Wald test of both cohort terms p < 0.0001. Both negative, so not refuted.
- **Hispanics differ.** Retention 73.6% / 75.5% / 69.5%. Cohort x Hispanic interaction: Wald chi2 =
  8.3, df 2, p = 0.015. Hispanic cohort effect is flat then a small, wide-interval fall.
  (Hispanic 1981-96 interval [63.3, 75.6] excludes the white 1945-64 level 66% only barely.)
- **H2'' supported.** With sex, BA, survey period added: first-generation (foreign-born) Catholics
  retain more than third-plus generation, +0.34 log-odds [0.14, 0.54] (OR 1.41); second generation
  +0.14 [-0.07, 0.35]. Standardised retention 71.6% / 67.4% / 64.3% (1st / 2nd / 3rd+). BA+ is
  -0.17 [-0.31, -0.04]; the 2021-24 surveys are -0.22 [-0.36, -0.08], which is the mode caveat of
  milestone 3 acting on retention too, not necessarily a fall.
- **Generation absorbs the Hispanic main effect** (0.36 [0.14, 0.57] in A, 0.11 [-0.12, 0.34] in B)
  but not the cohort interaction (1981-96: +0.51 [0.09, 0.94]). So much of the Hispanic retention
  advantage is an immigrant effect; the slower decline across cohorts is not explained by it.
- **Limits.** Cohort 1981-96 is observed only at ages 30-43, so its final retention may differ
  (returners and later leavers); the 1981-96 Hispanic cell has 385 respondents. Inference is
  design-based but the model is not weighted for GSS nonresponse beyond `wtssps`.
- **Next.** Milestone 5 (cohort-component accounting, H4, H5) needs outside fertility and
  immigration series, which is a data-access step; milestone 2 (Hout reproduction, Pew subgroups)
  is still open.

## 2026-11-04 · Milestone 4 plan (written before running)

- Sample: raised Catholic (`relig16`), age 30+ at interview, surveys 2000-2024 (ethnicity exists from
  2000; age 30+ so the main switching ages are behind everyone). Outcome: still Catholic. Weight
  `wtssps`; sandwich variance by stratum/PSU, subpopulation kept in the design.
- **H2' (refines H2).** Model A: logit of retention on birth cohort (1945-64 ref, 1965-80, 1981-96),
  Hispanic, and cohort x Hispanic. Refuted (for white Catholics) if the 1965-80 and 1981-96 cohort
  coefficients are not both negative; for Hispanics, the interaction Wald test says whether the
  cohort pattern differs from whites (no prior; p reported).
- **H2'' (generation).** Model B adds immigrant generation, sex, BA and survey period. Prior: first-
  generation Catholics retain more than third-plus generation at equal cohort and ethnicity. Refuted
  if the 1st-gen coefficient interval includes zero or is negative.
- **Checks.** The logit is tested against the weighted mean (intercept-only) and a simulated
  recovery; the Model A cohort contrasts are compared with the milestone 1 weighted shares.

## 2026-11-04 · Milestone 3b: the randomised `modesequence` contrast (the item left "not done" above)

Run: `experiments/m3b_randomised/run.py` (tables `t5`-`t7`). The 2022 and 2024 GSS randomly assigned
cases to face-to-face-first (`modesequence` 1) or mail-push-to-web-first (2); codebook p. 27-28.
Unlike completed `mode`, this is an experiment, so it measures the effect of the collection system
without the self-selection caveat. Plan was written before the numbers: no directional prior for the
arm contrast; arm 1 vs 2018 as the worded H3.

- **Arm contrast (Catholics, weekly, 2022+24).** F2F-first 19.4%, web-first 17.1%: +2.2 points
  [-3.1, 7.5] (n 630 / 757). 2022 -1.1 [-7.9, 5.8]; 2024 +5.4 [-2.3, 13.1]. Non-Catholics -2.7
  [-5.3, -0.0]. Arms balanced on Catholic share (+1.0 [-1.9, 3.9]), Hispanic share, age and BA share.
- **F2F-first arm minus 2018:** -3.4 [-9.3, 2.5]; minus 2014-18: -3.9 [-8.3, 0.5]; minus 2010-18:
  **-4.6 [-8.9, -0.4]** (of a total -6.3 [-9.9, -2.6], about 73%).
- **Reading, against the entry above.** The completed-mode gap (-9 points web vs in person) is
  selection plus mode; the randomised contrast, which removes selection, is much smaller (+2.2 for the
  face-to-face-first arm, interval -3 to +8) and consistent with zero. So the "about half or more is
  mode" reading rests on an effect the randomised arms neither show nor exclude. Both are
  underpowered (about 1,400 Catholics in 2022+24); the honest summary is that mode explains between
  none and about half of the fall, and a trend claim needs the panel or an outside series.

## 2026-11-04 · Milestone 3 results: most of the apparent attendance drop is mode, but the test is underpowered

Run: `experiments/m3_mode/run.py` (tests in `test_cathdem.py`; output `results.txt`, tables `t0`-`t3`).
GSS `mode` codes 1 in person, 2 phone, 3 video, 4 web (the .dta has no value labels; the reading
fits the counts: 3,521 of 4,032 in 2021 are code 4; 2010-18 have only 1 and 2). Weekly attendance
of Catholics, weighted, 95% design-based intervals.

- **Raw drop.** 2021-24 minus 2016-18: -5.5 points [-9.3, -1.6]; non-Catholics: -5.7 [-8.1, -3.4].
  The drop is not specific to Catholics.
- **H3 as worded (refuted if in-person Catholics show no lower attendance than 2018): refuted.**
  In person 2022-24 minus in person 2016-18: -2.2 [-8.9, +4.5]; 2022 vs 2018: -0.9 [-10.5, +8.6];
  2024 vs 2018: -3.3 [-12.0, +5.5]. All intervals include zero.
- **But "no detectable drop" is not "no drop".** The in-person Catholic samples are small (315 and
  227) and the intervals cannot rule out a real fall of 9 to 12 points. The point estimate (about
  -2) is less than half the raw drop (-5.5).
- **Mode gap.** Within 2022-24, web minus in person: -9.1 points [-15.9, -2.4] (Catholics),
  -6.4 [-10.3, -2.5] (others). Adjusting for age, sex, ethnicity and degree leaves it unchanged
  (-9.8 [-16.6, -3.1]). Caveat: web respondents in 2022 and 2024 are partly nonrespondents to the
  in-person attempt, so this is mode plus selection, not a pure measurement effect.
- **Reading.** About half or more of the 2010-18 to 2021-24 fall is better explained by mode than by
  behaviour, but a residual real decline of a few points is compatible with the data. Milestone 4
  and the paper treat 2021-24 attendance levels as not comparable with earlier years unless
  stated; a trend claim needs the 2016-20 panel or an outside series.
- **Not done.** `modesequence` (initial contact mode) as a randomised-design contrast, and the
  Pew/Gallup attendance series as an outside check.

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
