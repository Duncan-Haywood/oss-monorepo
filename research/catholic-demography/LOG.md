# Research log: catholic-demography

Newest first. Hypotheses and planned analyses are written before the numbers are run.

## 2026-11-19 · Milestone 5b, fifteenth GSS-only step: within cohorts, the raised-Catholic share drifts down about as fast as the same people's own reports do, and m5o's 2.4-point gap does not survive cohort standardisation

Run: `experiments/m5p_recall_drift/run.py` (output `results.txt`, tables `t45`, `t46`; cross-sections: 500-draw stratified
PSU bootstrap, seed 1; panels: design-based intervals as m5i). Data from `data/download_gssr.sh` (checksums passed).
**Order of events:** the script with P1-P4 was committed (2600a9b00) and pushed before any run. Two 2-draw smoke runs,
stdout discarded and outputs deleted unread, failed on loading (one panel file has no design codes; panel `age` is a
labelled factor); both fixed (commit after 2600a9b00) without changing any estimand. Then the full run. After it one
output-only fix: the four-line accounting block used `-slope x age difference`, but the age difference is defined
25-44 minus 45+ (negative), so the predicted band differences had the wrong sign. Fixed and rerun with the same seed;
only those 8 lines changed (each by sign). The P4 verdict below uses the corrected lines.

Question. m5o found the same mothers' cohorts report a Catholic upbringing (`relig16`) 2.4 points [0.7, 4.2] more often at
25-44 than at 45+. Upbringing is fixed by 16, so the within-cohort fall is reporting drift, composition (who is left to
interview), or the 2021-24 web waves. Cross-sections give the within-cohort slope (age and year move together, plus
composition); the 2006-10 panels give the same people's change per year (no composition). Equal slopes mean drift.

- **P1 supported.** US-born adults 25-64, 1977-2018 (in-person era), single-year cohort fixed effects: the raised-Catholic
  share falls **-0.072 points per year [-0.124, -0.018]**, about 1.3 points over 18 years. Women -0.065 [-0.133, +0.007].
  With 2021-24 added, all adults -0.033 [-0.086, +0.014] (the web waves push the other way for all adults; women -0.070).
- **P2 supported (point).** Panels, US-born, 25-64 at wave 1, wave 1 to 3: **-0.084 points per year [-0.250, +0.082]**
  (n 2,571); women -0.189 [-0.405, +0.026]. Wave 1 to 2 (2 years) is noisier: +0.069 [-0.276, +0.415], women -0.209.
- **P3 supported, with little power.** Cross-section minus panel slope, all adults: **+0.012 [-0.163, +0.188]** points per
  year; women +0.124 [-0.102, +0.350]. The within-cohort fall is the size the same people's own re-reports predict, so
  composition (mortality, emigration, response) is not needed to explain it. But the interval allows a composition part
  of up to about 0.16 points per year either way, i.e. about +/-3 points over the 18-year age gap: the test cannot
  exclude a composition effect as large as m5o's whole difference.
- **P4 supported formally, but it is not informative.** Among m5o's population (US-born women with children, cohorts
  1937-71), the cohort-standardised raised-Catholic difference, 25-44 minus 45+, is **+0.29 [-1.21, +1.60]** in 1977-2018
  and **+0.74 [-0.68, +2.00]** in 1977-2024 (m5o's years), at mean age gaps of 17.7 and 20.7 years. The panel drift
  predicts +1.49 (all adults) and +3.35 (women), so the ratio is above 0.5 as P4 required. But the difference P4 meant to
  explain largely is not there in this standardisation, and this population's own within-cohort slope is +0.030
  [-0.043, +0.113] per year (by segment: 25-44 +0.171 [-0.019, +0.350], 45-64 +0.214 [+0.018, +0.390]).
- **Reconciling with m5o (post hoc).** m5o's +2.4 weights mothers' cohorts by their children (respondents born 1965-99,
  10-year windows): computed post hoc, 59% of that mother weight is on cohorts 1935-47, where t44 shows +3.0 to +4.5,
  and 8% on 1963-71, where it is -2.6 to -4.1. Each single-year cohort weighted by its own size, the difference is +0.7. So m5o's raised-Catholic gap is
  a property of the cohort mix, heterogeneous across cohorts, not a general fall with age. Dropping 2021-24 lowers it by
  about 0.4 points, so the web waves are a small part of it.
- **Implication.** Two things change in m5o's reading. (1) The general age drift of reports of a Catholic upbringing is
  small (about -0.07 to -0.08 points a year in both sources, 1.3 to 1.5 points over 18 years) and matches within-person
  re-reporting; the "same women before they left" check m5o refuted is closer to holding once cohorts are standardised.
  (2) m5o's post hoc split (1.5 retention, 2.2 raised share) leaned on a raised-share gap that is mostly cohort mix; the
  P_m(25-44) - P_m(45+) difference of +3.7 itself is not retested here and stands as m5o reported it.
- **Limits.** Neither source separates age from survey year (both measure their sum per year). The panel spans 2006-14
  and is small, so the comparison has low power. Linear age within cohort is an approximation; the segment slopes for
  the mothers have opposite sign to all adults'. The panels' first waves are also in the cross-section file, treated as
  independent. The reconciliation with m5o is post hoc.
- **Next.** Rerun m5o's P_m comparison with single-year cohort standardisation (the same weighting as here) to see how
  much of its +3.7 switching difference is cohort mix as well; then H5, or milestone 2.

## 2026-11-17 · Milestone 5b, fourteenth GSS-only step: seen at 25-44, the mothers' cohorts close most of the share gap, but less than half of that is switching

Run: `experiments/m5o_lifecourse/run.py` (output `results.txt`, tables `t43`, `t44`; 500-draw stratified PSU bootstrap over the
whole file, seed 1; women's tables re-estimated in every draw; 86 s). Data from `data/download_gssr.sh` (checksums passed).
**Order of events:** the script with P1-P4 was committed (2607c7445) and pushed before any run; one 1-draw smoke run with
stdout discarded and its CSVs deleted unread (exit code only); then the full run, once, unchanged. The switching /
composition split below was done by hand from the printed point estimates after reading the results and tests no
prediction.

Question. m5n left the mothers of US-born respondents about 3.5 to 5 points more Catholic than US-born GSS mothers 45+
of their cohorts. Children report the mother's religion while they grew up (mother about 25-44); the women's table uses
current religion at 45+. Women's tables are rebuilt for mothers interviewed at 25-44 (main) and 35-49, with the share
raised Catholic (`relig16`) of the same women as a check that a fall with age is switching and not a different population.

- **Coverage.** For respondents born 1965-99 (mothers born about 1937-71) every matched window is covered at all three
  ages. For respondents born 1925-64, 96% of mother weight falls on windows the 25-44 band does not cover (82% for
  35-49), so that group is reported, not tested, as written.
- **P1 supported.** Both parents US-born, respondents 1965-99 (n 1,440): P_m(25-44) 26.7% against P_m(45+) 22.9%:
  **+3.7 [+2.1, +5.4]**. The same cohorts are more Catholic at child-rearing ages than at 45+.
- **P2 supported.** M_mothers 27.7%. The gap M_mothers - P_m falls from **+4.8 [+2.3, +7.1]** (45+) to **+1.1 [-1.7,
  +4.0]** (25-44); 22% of it is left (point; interval of the fraction -0.71 to 0.62). The reduction is P1's +3.7 [+2.1, +5.4].
- **P3 refuted.** The same mothers' raised-Catholic share is also higher at 25-44: R16 29.4% against 26.9%, **+2.4
  [+0.7, +4.2]**, above the 1-point bound. So the younger-age table is not only the same women before they left. Post hoc
  (point estimates): the Catholic share among those raised Catholic is 0.907 at 25-44 and 0.852 at 45+. Split (Shapley,
  two orders), the +3.7 is **+1.5 retention** (switching out after child-rearing at a fixed raised share) and **+2.2
  raised share** (the same cohorts report a Catholic upbringing more often when interviewed young). Switching alone
  would leave a gap of about 3.2 points of the 4.8.
- **P4 supported.** At 35-49: P_m - P_m(45+) +2.8 [+1.5, +4.2]; gap left 41% (point). R16 +1.5 [+0.2, +2.9]; the
  post-hoc retention part is again +1.5.
- **Within cohorts (t44).** Window centres 1940-1960: P_m(25-44) - P_m(45+) is +1.3 to +5.3, with R16 differences of
  -0.4 to +4.5. In 1965-70 the R16 difference turns negative (-2.6, -4.1) and so does P_m's in 1970 (-1.9): these
  cohorts are seen at 45+ only from 2010 on, much of it in the 2021-24 waves (m5f: web respondents there report a
  raised-Catholic share 5.3 points above in-person ones), so survey year and mode, not age, can drive both columns.
- **Implication.** Reading (b) holds in a weaker form. Measured at the ages they were raising children, the mothers'
  cohorts were about as Catholic as their children say (gap 1.1, interval includes zero). But only about 1.5 of the
  3.7 points is women leaving the Church after child-rearing; the larger part is that the same cohorts, interviewed
  younger (earlier survey years), more often say they were raised Catholic. That is a cohort-by-survey-year
  inconsistency in `relig16` (recall drift with age, differential mortality or attrition of Catholic-raised women,
  or year and mode effects), which the m5i panel (95% test-retest over 2-4 years) cannot see at this time scale.
  m5n's other candidate, children projecting their own upbringing onto their mother, is not needed to close the gap
  for the 1965-99 group, but is not excluded either.
- **For the model.** m5h's p (current religion, any age) and the 45+ women's tables understate the mothers' Catholic
  share at child-rearing time by 3 to 4 points for mothers born 1937-71. H4 is not affected: m5n showed the fertility
  channel rests on rho, and p enters the change only through cohort composition.
- **Limits.** Repeated cross-sections, not people followed over time: age at interview and survey year are confounded
  within a cohort. The 25-44 table includes women who will have more children later. Mothers' religion is recall.
  The switching / composition split is post hoc.
- **Next.** Separate age from survey year in R16: within the 2006-20 panels (same women, 2-4 years apart) and across
  cross-sections with year and mode fixed effects (in-person only), test whether a cohort's raised-Catholic share drifts
  with age. Then H5, or milestone 2.

## 2026-11-17 · Milestone 5b, thirteenth GSS-only step: children's sibling counts say the missing Catholics are mothers, not extra children

Run: `experiments/m5n_siblings/run.py` (output `results.txt`, tables `t39` to `t42`; 500-draw stratified PSU bootstrap over the
whole file, seed 1; women's tables re-estimated in every draw). Data from `data/download_gssr.sh` (checksums passed; outside
hosts for NSFG/Census refused here, so the outside check of m5m's "Next" was not possible and this step uses an inside one).
**Order of events:** one 1-draw smoke run with stdout discarded (only the exit code seen); the script with P1-P5 was then
committed (870c61069) and pushed before the full run. After the full run one output-only fix: rows whose names contain
"rho" (the module gap and the channel's sibling-rho rows) had been printed as fractions, not points. The unit rule was
fixed and the run repeated with the same seed. The 84 changed rows differ by exactly x100 and no other number moved.

Question. m5m left children of two US-born parents (cohorts 1925-64) with mothers 3.4 points more Catholic than the model
says, and two readings: (a) Catholic mothers had more children than GSS women report, or (b) the mothers were more
Catholic than GSS women of their cohort. Each respondent reports `sibs`, so k = sibs + 1 is their family's size seen from
the child's side, independent of whether the mother survived to be interviewed. Weighting children by 1/k recovers mothers
(Preston 1976). `sibs` is top-coded at 6+ in this release (22.5% of these respondents), `childs` at 8+, so (1) family sizes
are compared size-biased and capped at 7 on both sides (no tail assumption), and (2) the 1/k inversion puts the 7+ class
at t = 8 (swept 7, 10, 12).

- **P1 refuted: children do not see bigger Catholic families than Catholic women report.** Both-parents-US-born, 1925-64
  (n 3,188): children of Catholic mothers come from families of 4.53 (capped, size-biased), against 4.42 implied by GSS
  Catholic women of the mothers' cohorts (+0.12 [-0.01, +0.26]). Children of other mothers: +0.18 [+0.10, +0.27]. The
  diff-in-diff is **-0.06 [-0.22, +0.09]**. Children see slightly bigger families than women report on both sides
  (step-siblings are counted in `sibs`, and mothers who died early are missing from the women's side), but not more so for
  Catholics. Cohorts 1965-99: DD -0.06 [-0.24, +0.13].
- **P2 refuted: the gap is the mothers' Catholic share.** Among mothers (1/k-weighted), 24.4% were Catholic against
  20.8% of GSS mothers 45+ of the same cohorts: **+3.5 [+2.1, +5.3]**. The fertility ratio among mothers is 1.10 [1.06,
  1.14] from children's reports and 1.09 [1.06, 1.13] from women's (+0.01 [-0.05, +0.07]). Of the gap M - f(P_m, rho_m) =
  3.84 [2.26, 5.45] points, the share part is 3.71 [2.19, 5.54] and the ratio part 0.13 [-0.83, +1.07] (**3% [-25, +28]**).
  Cohorts 1965-99: gap 5.37, share part 4.96, ratio part 8%.
- **P3 refuted.** Full file (US-born adults surveyed 1977-2024, cohorts 1925-64, n 34,697), raised Catholic in place of
  mother Catholic: rho_sib_raised **1.070 [1.055, 1.083]**, below the 1.15 predicted, and -0.025 [-0.059, +0.011] from the
  women's ratio among mothers. For cohorts 1965-99 it is 1.004 [0.989, 1.020]. Children raised Catholic had at most 7%
  more siblings' worth of family than others, by the size-bias inversion; nowhere near m5m's needed 1.27.
- **P4 supported, and the fertility channel shrinks.** With rho = rho_sib_raised x the GSS motherhood ratio (Catholic women
  45+ are slightly less often mothers: 0.92-0.97 for mothers born 1910-30), fertility's contribution to the level is 0.13
  [-0.22, +0.42] points in 1990-99 (m5h main 1.17) and its contribution to the 1990-99 -> 2010-18 change -0.05 [-0.29,
  +0.20] (m5h -0.37). Immigration minus |fertility| +1.02 [+0.35, +1.56]. H4 stands.
- **P5 supported.** At t = 7 and 12, the ratio part is 2% and 6% of the gap and rho_sib (mothers) 1.10-1.11; P3's full-file
  rho is 1.069 and 1.073.
- **Implication.** Reading (a) is out: the 1.27 fertility ratio that would close m5m's gap is not in the children's own
  family sizes, which agree with what GSS women report. What is left is (b): the women who raised these respondents were
  about 3.5 points more Catholic (when the child was young) than GSS mothers of their cohort are when interviewed at 45+.
  Two candidates remain, and they are different claims: religious change of mothers between child-rearing and interview
  (P_m uses current religion; m5m's raised-Catholic p also left a gap, so converts at marriage who later left would fit
  both), and children's recall attributing their own upbringing to their mother.
- **Side result.** m5h's fertility channel (level 1.2 points in 1990-99) rests on the women's rho including childless
  women; the sibling-based version puts it near zero. H4 is stronger for it, and m5h's level figure should be read as an
  upper end.
- **Limits.** `sibs` counts step and adopted siblings and the father's other children; the cap at 7 discards the tail of
  large families on both sides. The motherhood ratio in the channel is from GSS women. Mothers' religion is recall.
- **Next.** Test the switching reading from GSS women's own life course: women 45+ of the mothers' cohorts with religion at
  16 and now (and, where asked, religion at marriage or of spouse) to bound their Catholic share during child-rearing.

## 2026-11-14 · Milestone 5b, twelfth GSS-only step: giving immigrant mothers their own Catholic share fits them but opens a gap for US-born mothers

Run: `experiments/m5m_mothers_nativity/run.py` (output `results.txt`, tables `t35` to `t38`; 500-draw stratified PSU bootstrap
over the whole file, seed 1; p and rho re-estimated by nativity in every draw, m5h's channels on the same draws). Data from
`data/download_gssr.sh` (checksums passed). Mother's nativity is read from `parborn` with the gssrdoc codebook (2, 4, 8 =
mother foreign-born; 0, 1, 3 = mother US-born). **Order of events:** the script with P1-P5 was committed (f912ce1f0) and
pushed before its first run; it ran once without changes. `posthoc.py` (`posthoc.txt`, point estimates) was written after
reading the results and tests no prediction.

Question. m5l found that the m5h model check residual is mainly in mothers who were more Catholic than the model's p, and
(post hoc) that this sits in the second generation. Here the model gets separate p and rho for foreign-born and US-born
GSS women, and each respondent uses those of their mother's nativity. Does the model check then pass?

- **P2 supported: immigrant mothers fit once they get their own p.** Children of foreign-born mothers, cohorts 1925-64
  (n 160): mothers 52.7% Catholic, model 49.9%, gap **+2.7 [-6.4, +12.0]** (pooled model: 24.6%, gap +28.1). For cohorts
  1965-99 (n 152) it does not fit: mothers 70.0%, model 47.6%, gap +22.4 [+15.3, +29.6]. Foreign-born GSS women of those
  mothers' cohorts are 41-45% Catholic, so the recent immigrants who raised US-born children were more Catholic than all
  foreign-born women of their age.
- **P1 refuted: the overall gap gets larger.** Cohorts 1925-64, M - M_gen is **+4.07 [+2.50, +5.63]**, against +2.64 with
  the pooled p. With US-born women's own p (21.9% for these mothers' cohorts; the pooled model gave this group 25.6%), children of US-born
  mothers (n 3,318) report mothers 26.9% Catholic against a model of 22.8%: **+4.14 [+2.53, +5.70]**. The pooled model fit
  this group only because its p included foreign-born women. So m5l's reading (the residual is immigrant mothers) is half
  right.
- **P3 refuted.** Full-file model check (all US-born adults surveyed 1977-2024, cohorts 1925-64): R - R_gen **+4.63
  [+3.62, +5.66]**, against R - R_model +3.34 [+2.34, +4.42] with pooled p. The gap is positive in every 5-year cohort from
  1930 to 1984.
- **P4 supported as written, but it mostly tests the fill.** The mean rho_FB - rho_US over mothers' cohorts 1900-39 is
  +0.16 [-0.01, +0.37]. But GSS foreign-born women reach the coverage rule (80 Catholic mothers, 300 women per 10-year
  window) only at window centres 1940-60, where rho_FB is 1.27, 1.16, 1.35 against rho_US 1.08, 1.09, 1.00. Earlier windows take
  the nearest covered value. So "immigrant Catholic women had larger families" holds where it is measured, for mothers
  born about 1935-65.
- **P5 supported; H4 stands.** With generation-specific rho, fertility's contribution to the 1990-99 -> 2010-18 change
  is -0.32 [-0.60, +0.04] (m5h main -0.37; difference +0.05 [-0.28, +0.43]). Immigration minus |fertility| is +0.75
  [+0.11, +1.38]. Fertility's contribution to the level is lower: 0.90 points in 1990-99 against 1.17.
- **Where the new gap is (post hoc, point estimates, `posthoc.txt`).** Of the 3,318 children of US-born mothers (1925-64),
  122 have a foreign-born father. Their mothers were 45.7% Catholic against p_US 21.5%: US-born women who married
  immigrants were twice as Catholic. In the 3,196 families where both parents were US-born the gap is still **+3.4 points**
  (M 26.2% against model 22.8%). To match it with p_US the model would need a Catholic / other fertility ratio of **1.27**,
  against the 1.05 measured among GSS women aged 45+. The same holds for cohorts 1965-99 (+3.7, needed 1.28 against 1.06).
- **Implication.** The m5h residual is not one thing. For immigrant mothers of the older cohorts it was the wrong p, and
  that part is now fixed. For US-born families the mothers were more Catholic than GSS women of their cohort, by 3 to 4
  points. Either Catholic mothers had more surviving, reporting children than GSS women's completed fertility shows (the
  mothers' cohorts born 1897-1936 are seen only at ages 41-80+ from 1977 on, so differential survival and the `childs`
  measure are both candidates), or the GSS undercounts Catholics among the oldest women. This step cannot tell which. The
  m5h fertility channel uses only rho, and its change estimate barely moves, so H4 is not affected. The m5h model check,
  though, cannot be made to pass this way.
- **Sensitivities.** g 24 or 32: M - M_gen 1925-64 +3.7 to +4.5. p from women raised Catholic instead of Catholic now:
  +3.85. The US-mother gap appears in all of them.
- **Limits.** Mothers' religion is recall. Foreign-born p and rho for mothers born before about 1935 are filled from the
  1940 window, because `born` is asked only from 1977. The foreign-born-mother cells have 150-160 respondents. `parborn` 4
  and 6 (one parent foreign-born, the other unknown) count as foreign-born mother and unknown here, while `gen` in
  `recode.py` leaves them out of the second generation; they are 52 US-born respondents in all years.
- **Next.** Check rho against an outside source on completed fertility by religion and nativity for women born 1900-40
  (the Growth of American Families and National Fertility Studies series behind Westoff & Jones 1979, or NSFG for later
  cohorts), to decide between "fertility understated" and "p understated". Then H5, or milestone 2.


## 2026-11-13 · Milestone 5b, eleventh GSS-only step: m5h's model-check residual is immigrant mothers, not mixed marriages or missed fertility

Run: `experiments/m5l_parents/run.py` (output `results.txt`, tables `t32` to `t34`; 500-draw stratified PSU bootstrap over the
whole file, seed 1; rho, p and the m5h channels re-estimated in every draw). Data from `data/download_gssr.sh` (checksums
passed); item codes read from the gssrdoc codebook. **Order of events:** a 2-draw smoke run happened before the commit; only its
last three printed lines were seen (the m5h replication rows for 2010-18 -> 2021-24: fertility -0.146, immigration -1.380, no
prediction depends on them) and the output was deleted unread. The script with P1-P5 was then committed (c24fd0ccd) and pushed
unchanged, and the full run followed. One column was added after it (second generation only), labelled post hoc; it reuses
the same seed and leaves every other number unchanged.

Question. m5h's fertility channel assumes children take their mother's religion, R = p rho / (p rho + 1 - p), with p the
Catholic share of US women in the mothers' cohort. Its model check failed: for US-born adults born 1925-69, R is 2.4 to 4.2
points above what p and rho imply, and m5h bounded the fertility channel by crediting the whole gap to fertility. The GSS
asked mother's and father's religion when the respondent was a child in 1988, 2008, 2012 and the ISSP modules of 1991, 1998,
2008 and 2018 (`marelig`/`parelig`, `marelkid`/`parelkid`): n 5,714 US-born adults, 5,236 with both parents. Because each
respondent is one child, M (share whose mother was Catholic) already carries fertility and survival, so the residual splits
as R - M_model = (R - M) [net transmission] + (M - M_model) [what the p, rho model misses about the mothers].

- **P1 refuted (narrowly).** Net transmission for cohorts 1925-64 is **+0.56 points [-0.01, +1.01]**, below the predicted +1
  and its interval touches zero. Born 1945-64 alone: +0.92 [+0.27, +1.48]. Gains (raised Catholic, mother not) 2.45 points
  against losses (mother Catholic, not raised Catholic) 1.89. Born 1900-24 it is negative, -1.98 [-3.33, -0.48].
- **P2 supported.** In mixed couples (1925-64), 72.1% [66.9, 76.6] of children with only a Catholic mother were raised
  Catholic, 41.8% [35.6, 48.0] with only a Catholic father; difference **+30.3 [+22.4, +38.2]**. The same in every cohort
  group (+30.1, +25.9, +28.6). Two Catholic parents: 97-99%; neither: 0.6-1.7%.
- **P3 refuted.** Net transmission is not smaller after the 1970 rule change: +0.80 [-0.35, +1.90] for cohorts 1965-99 against
  +0.56 for 1925-64, and the father-only rate stays at 42% (44.8% for 1945-64). Respondents' reports show no trace of the
  pre-1970 canonical promise that all children of mixed marriages be raised Catholic: even then only 42% of children with a
  Catholic father and a non-Catholic mother were.
- **P4 refuted.** Transmission is **18% [-1, 38]** of the residual (1925-64: residual +3.20 [+1.57, +4.84], of which R - M
  +0.56 and M - M_model **+2.64 [+1.03, +4.20]**). Most of the residual is that the mothers were more Catholic than the model's p.
- **Where M - M_model sits (post hoc, point estimates).** Third-plus generation, 1925-64: M - M_model +0.62 and the residual
  +1.26, half of it transmission. Second generation (n 282): mothers 49.8% Catholic against the model's 24.7%. The model
  assigns the children of immigrant mothers the Catholic share of US women of that cohort, and those mothers were twice as
  Catholic. So the m5h residual is mainly a composition effect of immigration, the second-generation part of it.
- **P5 supported.** The transmission channel (children re-raised in their mother's religion) adds 0.2 to 0.3 points to the
  level in each period, and its contribution to the 1990-99 -> 2010-18 change is **-0.07 [-0.44, +0.28]**, against
  immigration +1.07 and fertility -0.37 on the same draws; immigration minus |transmission| +1.00 [+0.26, +1.54]. H4 stands.
- **Implication for m5h.** Its upper bound (whole residual credited to fertility) is not supported: about a fifth of the
  residual is transmission and most of the rest is immigrant mothers, which belongs to the immigration channel. The m5h main
  fertility estimate stays the primary one; the upper bound should be read as a loose one.
- **Sensitivities.** R from `religkid` (same ISSP instrument as `marelkid`): 1925-64 transmission +0.53, share 14%. Mean age
  at birth g 24 or 32: residual 2.6 to 3.7, share 15-22%. The mixed-couple gap holds in all.
- **Limits.** Parents' religion is the child's recall of it, years later; recall that aligns the parent with one's own
  upbringing would inflate the "both Catholic" and "neither" cells and shrink R - M. About 10% of children have exactly one
  Catholic parent, so the mixed-couple rates rest on 150-175 respondents per cell. Mothers of the 1900-24 cohort are mostly before the
  GSS's coverage of mothers' cohorts (m5h fills them from the nearest window). The second-generation split is post hoc.
- **Next.** Rebuild the fertility channel's p by generation (immigrant mothers' p from foreign-born GSS women), so the
  model check can pass; then the outside ACS check of m5k when census.gov is reachable, H5, or milestone 2.

## 2026-11-13 · Milestone 5b, tenth GSS-only step: the post-2018 fall in the immigrant contribution is mostly the web slice

Run: `experiments/m5k_inperson/run.py` (output `results.txt`, table `t31`; 500-draw stratified PSU bootstrap over the whole
file, seed 1, every variant on the same draw so contrasts are paired). Data from `data/download_gssr.sh` (gss.norc.org
returned 403 through the proxy; the gssr copy passed its checksums). **Order of events:** the script, with predictions P1-P4
in its docstring, was committed (bbf16fc78) and pushed before its first run. It ran once, without changes.

Question. m5h's last period said immigrants' contribution to the adult Catholic share fell from 3.37 points (2010-18) to 1.98
(2021-24), change -1.38 [-2.05, -0.72], the largest part of the recent drop. 2021 was all web and 2022-24 mostly web, and
m5f-m5j showed web respondents are a different slice. The m5h main specification was rerun with the 2021-24 slot replaced by
V1 2022+24 all modes (n 6,274), V2 in person (2,482), V3 face-to-face-first arm (2,772), V4 web-first arm (3,502), V5 web
(3,137); V0 is m5h as published (9,843). Earlier periods and rho are unchanged.

- **P1 (in person gives a larger immigrant contribution) not refuted, weak.** Level, first generation: V1 2.50, V2 **2.92
  [2.04, 3.76]**, V2 - V1 +0.42 [-0.17, +1.02]. The underlying composition difference is clear: foreign-born share of
  Catholics 28.9% in person vs 20.9% web (+8.0 [+3.6, +12.5]); of all adults 18.5% vs 15.2% (+3.3 [+0.6, +5.8]).
- **P2 supported.** The randomised arm contrast for the immigrant contribution is +0.32 [-0.62, +1.32], against +1.49 [+0.41,
  +2.60] by completed mode. The arms are balanced on nativity (foreign-born share of Catholics -0.2 [-4.0, +3.6]). So the gap
  is who completes by web, as for attendance (m3b, m5i) and upbringing (m5g).
- **P3 supported.** The fertility contribution moves by at most 0.10 points across V1-V5 (level 0.61-0.72; change from 2010-18
  -0.09 to -0.19).
- **P4 refuted.** In person, the 2010-18 -> 2021-24 change in the immigrant contribution is **-0.44 [-1.38, +0.49]** (F2F-first
  arm -0.63 [-1.46, +0.21]); both intervals include zero, and immigration minus fertility is -0.25 [-1.16, +0.72]. So m5h's
  "immigration fell by 1.38, the larger channel in the recent drop" does not survive. About a third of the -1.38 is the 2021
  wave alone (V1 - V0 +0.51 [+0.14, +0.85]) and the rest of the gap to in person is the 2022-24 web completers (V5: -1.93).
- **Side result, borderline.** The adult Catholic share itself is 23.7% in the F2F-first arm and 21.8% in the web-first arm,
  +1.98 [-0.13, +4.09]; m3b's design-based check on a slightly different sample gave +1.0 [-1.9, +3.9]. Not established.
- **What stands.** H4 is decided on 1990-99 -> 2010-18, which has no web interviews, and is unaffected. Over 1990-99 ->
  2022-24 in person, immigration contributes +0.63 [-0.39, +1.52] and fertility -0.56 [-0.90, -0.20].
- **Corrections made.** README (m5h section) and the 2026-11-11 post now say the -1.38 is an all-mode figure and give the
  in-person one.
- **Limits.** In-person 2022-24 respondents are themselves selected (they answered the face-to-face attempt), and the in-person
  sample is a quarter of V0, so the intervals are about 40% wider. The arms are intention-to-treat. The 2021-24 slot here is
  2022+2024 only.
- **Next.** An outside nativity check: the ACS foreign-born share of adults against V1-V5,
  when census.gov is reachable; then H5 or milestone 2.

## 2026-11-11 · Milestone 5b, ninth GSS-only step: reweighting on demographics removes about 40% of the web selection, and none of it among Catholics

Run: `experiments/m5j_reweight/run.py` (output `results.txt`, tables `t29`, `t30`; 300-draw stratified PSU bootstrap, seed 1,
raking redone in every draw). New module `cathdem/rake.py` (raking by iterative proportional fitting, unit-tested against
post-stratification). **Order of events:** the script, with predictions P1-P3 in its docstring, was committed (7dae199b)
before its first run. The first run crashed before printing any result: one respondent missing on both age and number of
children made the S2 margins infeasible. A missing code under 2% of the rows is now folded into the modal code. The second
run crashed inside the bootstrap of the last table (Catholics only), on one infeasible draw. Point estimates must still rake
exactly; bootstrap draws now keep the closest raking and report the leftover margin gap. No estimate was seen before either fix.

Question. m5f, m5g and m5i found that 2021-24 web respondents are a different slice of people. The textbook fix is to
reweight that slice on observed covariates. Does it work? The 2016-20 panel answers this where the truth is known. Everyone's
first interview was in person, so the first-wave attendance gap between people who later chose web and those who later
chose phone is pure selection. Web completers were raked to the phone completers' first-wave margins on three nested sets:
S1 age, sex, ethnicity, degree; S2 S1 plus region, marital status, children, nativity, size of place, household size, work
status; S3 S2 plus political views and party.

- **P1 partly refuted.** The first-wave selection gap is -11.08 points [-15.82, -6.29]. S1 removes **42.6% [22.9, 86.9]**,
  more than the third predicted. S2 removes 40.6% [15.5, 86.4] and S3 37.1% [12.9, 70.3]: the extra covariates add nothing.
  The refutation line (S2 removing 75% or more) is not reached. After S2, **-6.58 points [-11.89, -1.05]** of selection
  remains in people with the same age, sex, ethnicity, education, region, family, nativity, place and work.
- **Applied to the 2020 wave, reweighting overstates the mode effect.** The cross-sectional 2020 web-minus-phone gap is -12.64,
  and -8.27 [-12.73, -3.51] after S2 raking. The within-person estimate from m5i is -1.56 [-6.58, +2.38]. So an analyst who
  reweighted the 2020 cross-section on demographics would still attribute about 7 points of selection to the web.
- **P2 supported.** In 2022 and 2024 (web vs in person, within year), Catholics' weekly attendance gap is -10.05
  [-15.51, -5.13] raw and **-9.55 [-15.27, -4.11]** after S2. Among Catholics, demographic reweighting removes nothing
  (-4% to +5%). For all adults it removes 14-17% (S1, S2) and 36% with political attitudes (S3: -5.11 [-7.34, -2.75]).
- **No-religion gap.** Web respondents are **+10.3 points** more often "no religion" [8.1, 12.8]. Demographics remove 3% of
  this gap; S3 removes 18%. The Catholic-now gap is -1.0 [-3.5, +1.3], small and inside its interval at every set.
- **P3 not refuted, weak.** The raised-Catholic gap stays positive (+2.11 raw, +1.43 [-0.64, +3.72] after S2), but here
  (all adults) its interval includes zero at every set. The clear version is m5f's third-plus NH white population.
- **Cost.** Raking raises the Kish design effect by a factor of 1.2-1.9. For S3 among Catholics, 105 of 300 bootstrap draws
  could not be raked exactly (a draw was off by up to 14 points on some margin), so that one interval is not reliable.
- **Implication (fixed in advance).** Demographic reweighting cannot correct the 2021-24 web respondents. It removes at
  most about 40% of the selection where the selection is known, and essentially none of it for Catholic attendance. The
  paper will use in-person 2022-24 estimates (m3: Catholic weekly attendance 2022-24 in person minus 2016-18, -2.2 points
  [-8.9, +4.5]) as the primary post-2020 series and will show the all-mode series as an upper bound on the fall.
- **Limits.** The panel test is web vs phone, not web vs in person. Its covariates are first-wave values, and two to four
  years pass before mode is chosen. Attrition weights (`wtssnr_2`) are taken as given. A covariate set that included a
  religiosity proxy measured before the mode choice would do better, but no 2021-24 cross-section has one.
- **Next.** H5 (score Skirbekk et al. 2010) or milestone 2, when those hosts are reachable. A 2022-24 in-person-only rerun of
  the m5h accounting, so H4's last period does not rest on the web slice.

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
