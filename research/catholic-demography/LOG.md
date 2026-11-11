# Research log: catholic-demography

Newest first. Hypotheses and planned analyses are written before the numbers are run.


## 2026-11-11 · Milestone 5b, eighth GSS-only step: the same people asked twice. Upbringing reports are stable; the web attendance gap is who chooses web

Run: `experiments/m5i_panel/run.py` (output `results.txt`, tables `t27`, `t28`). **Order of events:** the script, with the
predictions in its docstring, was committed (76640d50) before its first run; the first run completed without changes.
**Data source:** gss.norc.org returned 403 through this session's proxy, so this run reads the GSS files from the gssr R
package (Healy, GitHub, pinned commit, checksums in `data/SHA256SUMS.gssr`, `data/download_gssr.sh`); `recode.load` now
falls back to it. Check: `experiments/m1_subgroups/run.py` from the gssr cumulative file reproduces every estimate and n in
all eight m1 tables built from NORC's R3a .dta; one standard error differs in the fourth decimal (0.0540 vs 0.0541).
Weights `wtpannr12`/`wtpannr123` (2006-10) and `wtssnr_2` (2016-20); the 2008 panel file has no design codes in gssr, so
its people are treated as their own PSUs (intervals for the pooled panels are slightly too narrow).

- **A1 supported (two years).** Of 4,633 people asked their religion at 16 in 2006/08/10 and again two years later, 95.4%
  of first-wave "raised Catholic" say so again; gross disagreement 3.0% [2.4, 3.6]; kappa 0.933; net change **-0.06 points
  [-0.65, +0.53]**. Over four years (n 3,843) the net change is **-0.77 [-1.44, -0.11]**, under the 1-point line the
  prediction set, so not refuted as worded, but not zero: the drift is downward.
- **Where the drift is.** People who are Catholic at wave 1 report a Catholic upbringing less often later: 91.7% to 89.4%
  over four years (-2.21 [-3.86, -0.56]); people not Catholic at wave 1 show no drift (-0.37 [-1.06, +0.32]). So answers
  about upbringing drift toward *not* raised Catholic, the wrong sign to produce the within-cohort rise of the
  raised-Catholic share in 5e. Recall noise is ruled out as its explanation, leaving the web-mode selection of 5f/5g.
- **A2 supported.** Current Catholic is less stable than raised Catholic: gross disagreement 5.1% [4.3, 5.9] over two
  years, net -1.04 [-1.88, -0.20]; over four years net -1.87 [-2.72, -1.02] (about 0.5 points of the adult share a year
  leaving, in people who stay in the panel).
- **Phone vs in person (within person, 2006-10).** Gross disagreement on raised Catholic +1.57 points [-0.02, +3.16] by
  phone at wave 2, not at wave 3 (-0.32); net differences are near zero (+0.22, +0.30). No sign that an interviewer mode
  moves the answer.
- **B1 not refuted, and the main finding is elsewhere.** 2016-20 panel, first wave in person, 2020 by web (n 1,110) or
  phone (n 449). Web completers already reported **11.1 points less weekly attendance [-17.9, -4.2] at the first wave,
  when they too were interviewed in person**. Their within-person change to 2020 differs from phone completers' by only
  **-1.56 points [-8.50, +5.38]** (Catholics +1.38 [-11.3, +14.0], n 239/95). So nearly all of a cross-sectional web
  gap of the m3 size (-9 to -11 points) is who chooses web, not what web does to the answer; a mode effect of up to
  about 8 points is not excluded.
- **Limits.** The 2020 contrast is web vs phone, not web vs face to face; mode was chosen, so time-varying differences
  between the two groups remain; 2020-21 fieldwork fell in the pandemic. The gssr panel20 file has `relig` and `relig16`
  empty for 2020, so part A cannot be repeated across the web switch. Panel attrition: the weights adjust for it, they
  do not remove it.
- **Implication for the programme.** Both measurement routes now point the same way: the 2021-24 web respondents are a
  different slice of people (5f, 5g, this step), and their answers are about as reliable as in-person ones. For the
  paper, 2021-24 estimates need a nonresponse-composition adjustment, not a measurement correction.
- **Next.** H5 (score Skirbekk et al. 2010) or milestone 2 (Hout 2016 table, Pew benchmark), when the paper and Pew hosts
  are reachable; a composition reweighting of 2021-24 web respondents to the in-person profile.

## 2026-11-11 · Milestone 5b, seventh GSS-only step: immigration, not fertility, held the Catholic share up in 1990-2018 (H4 supported)

Run: `experiments/m5h_fertility/run.py` (output `results.txt`, tables `t24` to `t26`; 500-draw stratified PSU bootstrap over the
whole file, seed 1, so the uncertainty in the fertility ratio is carried through). **Order of events:** the script, with the
method and the prediction in its docstring, was committed (b0cadee) before its first run; the first run crashed on a pandas
NA comparison before printing any result past the fertility ratio table, and was fixed without changing the method. The model
check (`t26`), the upper-bound specification and the move of the inversion formula into `cathdem/accounting.py` (unit-tested) were added after a 3-draw
trial; point estimates are identical.

Method. Counterfactual reweighting. *Fertility:* US-born adults raised Catholic are reweighted to the share they would be
if Catholic and other mothers had had equal completed fertility, R' = R / (R + rho (1 - R)), with rho the Catholic /
non-Catholic ratio of children ever born among GSS women aged 45+ in a 10-year window centred 28 years before the adult's
birth year. *Immigration:* the Catholic share among US-born adults only (and among third-plus generation only). Contribution
= actual minus counterfactual, for levels and for changes.

- **rho by mothers' cohort (`t24`).** 1.10 to 1.13 for women born about 1925-1960 (all ethnicities pooled), dipping to
  0.97 around 1915 and 0.94 around 1970. Pooled over ethnicity the Catholic excess does not vanish for post-1945 mothers,
  unlike the non-Hispanic white gap in m1, because Hispanic Catholic mothers are in the pool.
- **Levels.** The fertility channel adds 1.17 points [0.76, 1.55] to the adult Catholic share in 1990-99, 0.81 [0.57, 1.02]
  in 2010-18 and 0.66 [0.44, 0.87] in 2021-24. First-generation immigrants add 2.30 [1.94, 2.71], 3.37 [2.91, 3.83] and
  1.98 [1.43, 2.50]; first and second generation together 4.7, 5.6 and 4.0.
- **H4 test, 1990-99 to 2010-18** (share 26.4% to 25.0%, -1.39 [-2.67, -0.14]): immigration (1st gen) **+1.07 [+0.52, +1.68]**,
  fertility **-0.37 [-0.69, -0.02]**; immigration minus fertility **+1.44 [+0.74, +2.10]**. **H4 is supported**, and the
  prediction holds: fertility contributed about 1 point to the level in both periods and its contribution fell, so it
  pulled the change down slightly; immigration pushed it up. The sign and size survive every sensitivity (g 24 or 32,
  fertility of women and men, mothers' religion as raised rather than current, US-born mothers only: difference +1.34 to
  +1.52).
- **2010-18 to 2021-24** (-2.76 [-4.08, -1.38]): immigration -1.38 [-2.05, -0.77], fertility -0.15. The fall in the
  foreign-born Catholic share (m5b) is the larger channel here, with the 2021-24 mode caveat of m5f and m5g.
- **Model check (`t26`), only partly passed.** The mothers' Catholic share the model implies for each 5-year cohort of
  US-born adults is above the share of women in the mothers' cohort who are Catholic now for every cohort born 1925-69, by
  2.4 to 4.2 points (largest for 1945-49 and 1955-59), and lies between the "Catholic now" and "raised Catholic" shares of
  the mothers' cohort for 1970-99. So for mid-century cohorts more children were raised Catholic than mothers' religion
  and measured fertility explain. That residual could be fertility the ratio misses (survivors, religion at interview), or
  Catholic upbringing in mixed marriages; if it were all fertility, the fertility channel's level would be up to about 4
  points larger.
- **Upper bound (added after the model check, point estimate).** Crediting that whole residual to fertility (the
  counterfactual raised share set to the Catholic share of women in the mothers' cohort) raises the fertility channel's
  level to 2.2 points in 1990-99, 2000-09 and 2010-18 and 2.5 in 2021-24, but flat, so its contribution to the 1990-99 to
  2010-18 change is **+0.01**, against immigration's +1.07. H4 survives the bound.
- **Limits.** The immigration counterfactual is a composition contrast (it drops immigrants; it does not model what the
  native population would have done without them). The fertility channel takes mothers' fertility from GSS respondents
  who survived to be interviewed, measures their religion at interview rather than at childbearing, and assumes children
  take the mother's religion; mixed marriages and fathers are not modelled. Mothers born before about 1890 (9.4% of
  US-born weight in 1990-99, under 0.5% from 2010) take the earliest covered window's ratio. No NCHS or ACS series is used:
  this answers H4 from the GSS alone; the outside series remain the check.
- **Next.** H5 (score the Skirbekk et al. 2010 projection against 2020s GSS and Pew) or milestone 2 (reproduce a Hout 2016
  table, Pew benchmark).

## 2026-11-10 · Milestone 5b, sixth GSS-only step: the randomised mode arms do not move the raised-Catholic share

Run: `experiments/m5g_randomised/run.py` (output `results.txt`, table `t23`). **Order of events:** the prediction was written
into the script's docstring before it ran: if the web-minus-in-person gap of 5f were a measurement effect of mode, the
web-first arm of the 2022 and 2024 randomised design (`modesequence` 1 face-to-face-first, 2 mail-push-to-web-first, as in
m3b) would show a higher raised-Catholic share; if it reflects who chooses to answer by web, the arm difference would be near
zero. Design-based intervals (stratified PSU linearisation), not the bootstrap of 5a to 5f.

- **Randomised arms, 2022+2024, F2F-first minus web-first.** All adults: 33.9% vs 33.4%, **+0.5 points [-2.6, +3.6]**
  (n=2,864 and 3,600). Third-plus-generation non-Hispanic whites (the 5e/5f population): 29.9% vs 28.0%, **+2.0 [-2.0, +5.9]**
  (n=1,568 and 2,041). Each year alone is the same sign with intervals that include zero.
- **Completed mode, same years (not randomised).** Third-plus NH white, in person minus web: **-4.7 points [-9.0, -0.5]**;
  all adults -1.3 [-4.9, +2.3].
- **My prediction is supported:** assigning the web-first sequence does not raise raised-Catholic (point estimate is the
  other way), while the gap by completed mode is the 5f gap. So the 2021-24 web/in-person difference looks like who ends up
  answering by web, not a pure effect of the mode on the answer.
- **Limits.** The arm difference is imprecise: the 95% interval for the third-plus NH white arm contrast spans about -2 to +6
  points, so a mode effect of the 5f size (about 5) is not excluded. The arms differ in response patterns and mixing, so
  this is an intention-to-treat contrast, and 2021 (all web) has no randomised arm. This does not say the 2021-24 rise is
  real: if web respondents are a different slice, the pooled 2021-24 series still has a composition problem that weights
  do not fix. H4 stays undecided.
- **Next.** NCHS births and ACS immigration series (5b proper), the fertility channel H4 needs.

## 2026-11-09 · Milestone 5b, fifth GSS-only step: the within-cohort rise is a web-interview effect

Run: `experiments/m5f_mode/run.py` (output `results.txt`, tables `t21`, `t22`; same weights and 500-draw PSU bootstrap,
seed 1, as 5a to 5e). **Order of events:** the prediction was written into the script's docstring before it ran: if the
+1.33 within-cohort term of 5e came from who answers by web, the in-person-only 2021-24 sample would show a within-cohort term
near zero and the web minus in-person gap would be positive in most cohorts. Population as 5e; 2021-24 split by GSS `mode`
(1 in person n=1,279; 4 web n=4,048; telephone and video, n=611, are in the pooled series only).

- **Raised-Catholic share, 2021-24.** In person 25.7% [23.0, 28.1], web 31.0% [29.5, 32.8]; 2000-09 was 27.0%.
- **Within-cohort term against 2000-09.** In person **-2.53 [-5.35, -0.17]**, web **+3.05 [+0.99, +4.88]**; replacement is
  the same sign and size in both (+1.20 and +0.96). Web minus in person within 2021-24: R +5.34 [+2.45, +8.28], almost all
  within-cohort (+5.71 [+2.85, +8.69]). Web exceeds in person in each of the four cohorts present (1930-44 +10.5 points,
  1945-59 +3.7, 1960-74 +8.7, 1975+ +4.3).
- **My prediction is supported, more strongly than I stated it:** the in-person term is not near zero but negative, so the
  pooled +1.33 is a mixture of a falling in-person series and a rising web series. Cohort replacement (about +1 point) is the
  only component that agrees across modes.
- **Limits.** Mode is not randomised: web respondents differ in who they are (and the 2021 wave was a web push), so this is a
  mode-by-respondent difference, not a pure measurement effect; m3b used the 2022 split-ballot design for attendance and the
  same test is open here. In person after 2020 is a small sample (n=117 to 468 per cohort). Weights are not mode-adjusted.
  Reading the 2021-24 rise in raised-Catholic as real would need that check first. H4 stays undecided.
- **Next.** Check the 2022 randomised mode comparison for `rel16`, then NCHS/ACS series (5b proper).

## 2026-11-09 · Milestone 5b, fourth GSS-only step: about half the third-plus non-Hispanic white rise is cohort replacement, the rest is not separable from zero

Run: `experiments/m5e_cohort/run.py` (output `results.txt`, tables `t19`, `t20`; same weights and 500-draw PSU
bootstrap, seed 1, as 5a to 5d). **Order of events:** the prediction was written into the script's docstring before it
ran: raised-Catholic is fixed at age 16, so a genuine flow cannot rise within a birth cohort; I expected most of the rise
to be cohort replacement and the within-cohort terms near zero. Population: third-plus generation non-Hispanic whites,
2000 onward, five birth cohorts, exact midpoint split into replacement plus one within-cohort term per cohort (asserted).
A first run dropped the pre-1930 cohort (empty in 2021-24) from the totals and gave a wrong start (25.8%); fixed so an
empty cohort takes the other period's rate, and the totals now match 5d (27.0% to 29.4%).

- **Levels.** Raised-Catholic share by cohort rises with recency up to 1975: before 1930 16.2%, 1930-44 23.4%,
  1945-59 28.6%, 1960-74 28.8%, 1975+ 29.8% (2000-09). In 2021-24 the 1975+ cohort is 26.7% (n=2,315) and the cohort
  is 43% of the group, up from 19%.
- **2000-09 to 2021-24** (+2.40 points [+0.73, +4.37]): replacement **+1.07 [+0.64, +1.54]**, within-cohort **+1.33
  [-0.27, +3.23]**. By cohort: 1945-59 **+1.05 [+0.20, +1.88]**, 1930-44 +0.55 [0.00, +1.08], 1960-74 +0.68
  [-0.06, +1.50], 1975+ **-0.94 [-1.84, +0.08]**.
- **My prediction is only partly supported.** Replacement is positive and clear, but it is about 45% of the rise, not
  most of it, and the within-cohort term (55%) has an interval that includes zero, so the data neither show nor rule out a
  within-cohort rise. The one cohort that rises clearly is 1945-59 (aged 41 to 79 across the span), while the youngest
  cohort's rate fell.
- **Limits.** The within-cohort rise in older cohorts is what recall error, differential mortality (Catholic-raised
  people dying later or earlier) or a change in who answers by web would produce; none of these is tested here. No fertility
  measure, so H4 stays undecided.
- **Next.** NCHS births and ACS immigration series (5b proper), or the 2016-2020 panel to check whether the same people
  report the same religion at 16 across waves (recall stability).

## 2026-11-08 · Milestone 5b, third GSS-only step: the third-plus-generation rise is among non-Hispanic whites, not Hispanics

Run: `experiments/m5d_ethnicity/run.py` (output `results.txt`, tables `t17`, `t18`; same weights and 500-draw PSU
bootstrap, seed 1, as 5a to 5c). **Order of events:** the entry below ended with a hypothesis, that the Hispanic share
of the third-plus group would matter; it was written before this script ran. Ethnicity exists from 2000, so periods
are 2000-09, 2010-18 and 2021-24. Five groups (foreign-born, second generation, third-plus NH white, Hispanic,
Black/other); exact midpoint split, summing to the change (asserted).

- **Levels.** Third-plus NH white raised Catholic 27.0%, 28.5%, 29.4% (62.1%, 58.6%, 58.5% of adults). Third-plus
  Hispanic 67.6%, 66.9%, 59.4%, with their share of adults rising 3.0% to 4.3%. Third-plus Black/other 7.8%, 11.0%, 10.4%.
- **2000-09 to 2021-24** (R 33.4% to 33.8%, +0.40 [-0.95, +1.93]): composition +0.97 [+0.45, +1.52], foreign-born
  rate **-1.78 [-2.37, -1.08]**, third-plus NH white rate **+1.46 [+0.38, +2.48]**, third-plus Hispanic rate
  **-0.30 [-0.57, -0.03]**, Black/other +0.27 [+0.03, +0.50].
- **My hypothesis is not supported as stated:** the domestic rate rise is among third-plus non-Hispanic whites, and
  the third-plus Hispanic rate term is flat to negative (their raised-Catholic share fell to 59% by 2021-24). The
  Hispanic contribution runs through composition (a larger share of adults), which is inside the composition term, not
  separated here.
- **Limits.** n is small for third-plus Hispanic (367 to 462); intervals on the 2000-09 to 2010-18 total include zero.
  Recalled religion at 16 and a rising share among NH whites could be recall or cohort replacement; no fertility
  measure yet, so H4 stays undecided.
- **Next.** NCHS birth and ACS immigration series (5b proper), and a cohort split of the NH white third-plus rise.

## 2026-11-05 · Milestone 5b, second GSS-only step: the rise in the raised-Catholic share sits in the third-plus generation

Run: `experiments/m5c_generation/run.py` (output `results.txt`, tables `t15`, `t16`; same samples, weights and
500-draw PSU bootstrap, seed 1, as 5a/5b). **Order of events:** the entry above named this split as the next
step; no directional prediction was written down beforehand. The prior from 5b's caveat was that the US-born
rise would be partly the second generation (children of 1980s-90s immigrants). Identity R = sum over
generation of f_g R_g, midpoint split into a composition term and one rate term per generation, summing exactly
to the change (asserted).

- **Levels (1990-99 to 2021-24).** Second generation is 8.6% to 10.4% of adults and stays about 53% raised
  Catholic throughout (52.3, 55.1, 52.8, 52.8). Third-plus generation: 79.2% to 73.3% of adults, raised
  Catholic **25.2%, 26.0%, 27.6%, 28.5%**. Foreign-born: 51.1, 56.7, 53.4, 45.6.
- **1990-99 to 2010-18** (+3.84 points [+2.37, +5.27]): composition +1.63 [+1.25, +2.00], foreign-born rate
  +0.34 [-0.22, +0.93], **second-generation rate +0.05 [-0.29, +0.34]**, **third-plus rate +1.83 [+0.70, +2.93]**.
  Everything tied to immigrant families (composition plus first and second generation rates) is +2.01
  [+1.16, +2.78], about 52% of the rise.
- **My second-generation prior is not supported:** the second-generation raised-Catholic rate did not move.
  The domestic term is the third-plus generation, and the data alone cannot say whether that is higher Catholic
  fertility among long-settled families, more Hispanic third-plus-generation adults, or an artefact of recall.
  Since the third-plus group in 2021-24 includes Hispanic adults whose grandparents arrived earlier, I
  expect the Hispanic share of that group matters; this is a hypothesis for the next step, not a finding.
- **To 2021-24:** immigrant-family terms are +0.61 [-0.17, +1.38] against the 1990s and -1.37 [-2.38, -0.51]
  from 2010-18, driven by the foreign-born rate (-1.31 [-1.97, -0.69]).
- **Limits.** Generation is coded from `born` and `parborn`; `parborn` codes 1, 2 and 8 (one or both parents
  foreign-born, or unknown) all count as second generation. Raised-Catholic is recalled at age 16. H4 (fertility
  versus immigration) is still not decided: this is an accounting by generation, not a fertility measure.
- **Next.** Split the third-plus term by ethnicity (ethnicity exists from 2000 only, so compare 2000-09,
  2010-18, 2021-24), then NCHS births and ACS immigration series.

## 2026-11-04 · Milestone 5b (GSS-only part): how much of the rise in the raised-Catholic share is immigrants?

Run: `experiments/m5b_nativity/run.py` (output `results.txt`, tables `t13`, `t14`; same PSU bootstrap, 500 draws,
seed 1, as 5a). **Order of events, honestly:** the script ran before this entry was written, so there is no
pre-registered prediction; the prior I held was that immigration would account for most of the 1990s-to-2010s rise
(H4's direction). Identity R = f Rf + (1-f) Ru (f foreign-born share of adults; Rf, Ru the shares raised Catholic
among foreign-born and US-born); the midpoint split gives immigrant composition, the rate among the foreign-born,
and the rate among the US-born, summing exactly to the change (asserted).

- **Levels.** Foreign-born share of adults 12.2% (1990-99), 16.1%, 17.7% (2010-18), 16.3% (2021-24). Raised Catholic:
  foreign-born 51.1%, 56.7%, 53.4%, 45.6%; US-born 27.8%, 29.0%, 30.4%, 31.5%.
- **1990-99 to 2010-18** (R 30.7% to 34.5%, +3.8 points [+2.4, +5.3]): immigrant composition **+1.3 [+1.0, +1.5]**,
  rate among foreign-born +0.3 [-0.2, +0.9], rate among US-born **+2.2 [+1.0, +3.4]**. Immigration (first two terms)
  is +1.6 [+1.0, +2.2], about 42% of the rise; the US-born term is the larger one. **My prior is not supported on
  this split:** the larger part is not first-generation arrivals.
- **To 2021-24:** immigration terms net to 0.0 [-0.6, +0.6] against the 1990s, and between 2010-18 and 2021-24 they
  are -1.6 [-2.3, -0.9] (fewer of the foreign-born raised Catholic, -1.3), the first sign of the inflow term turning.
- **Limit that matters for H4:** "US-born" includes the second generation, whose parents are immigrants, so the +2.2
  is not all fertility of long-settled families; the rising US-born raised-Catholic share is plausibly partly the
  children of the 1980s-90s immigrants. This split therefore gives a lower bound on immigration's role, not a
  fertility share. Raised-Catholic is also self-reported at an age 16 recall. H4 is still not decided.
- **Next.** Split the US-born term by `parborn` (second vs third-plus generation), already coded in `recode.py`; then
  the outside NCHS birth and ACS series for 5b proper.

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
