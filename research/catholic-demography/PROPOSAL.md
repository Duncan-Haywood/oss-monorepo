# Proposal: comparative demography of Catholic subpopulations

Programme `catholic-demography`, opened 2026-11-03 at the owner's request ("demographic
comparative analysis on catholic sub populations as an ongoing research path"). Written with AI
assistance (Claude Code); no affiliation with any university, diocese or survey organisation is
implied. **Citation status:** every DOI below resolved on Crossref on 2026-11-03 and its title,
year and journal matched; the one-line notes on what each work settles are from the abstracts
and the standard reading of these papers, not a full re-read this session (milestone 2 re-reads
them).

## Question

How do the main US Catholic subpopulations (Hispanic and non-Hispanic white, immigrant
generations, birth cohorts, converts and cradle Catholics, weekly and occasional attenders)
differ in fertility, retention, practice, belief and politics, and how much of the change in the
size and make-up of American Catholicism since 1972 does each demographic channel (retention,
switching in, fertility, immigration, ageing) account for?

It is open because the standard results are either old (the "end of Catholic fertility" was
argued from 1970s data), pooled over subgroups that now move in opposite directions (Hispanic and
non-Hispanic white Catholics), stop before the 2021-2024 survey waves, or are reported as
toplines without design-based intervals. Published projections of the Catholic share (for
example Skirbekk, Kaufmann and Goujon 2010) have never been scored against what happened.

## Why it matters

Dioceses, Catholic schools and universities, and Catholic charities plan parishes, schools and
staff on assumptions about who the next generation of Catholics will be: how many children
families have, who stays, and how much immigration carries the numbers. Demographers and
sociologists of religion use the Catholic case as the test of secularisation and of
"demographic" accounts of religious change. A reproducible, subgroup-by-subgroup accounting with
honest intervals replaces anecdote ("Hispanic Catholics will fill the pews", "Catholics have big
families") with measured quantities, and scores which channels actually moved the totals.

## Related work

**Catholic fertility.**
- Westoff & Jones (1979), *The end of "Catholic" fertility*, *Demography*; doi:10.2307/2061139.
  Catholic and non-Catholic fertility converging in 1970s US data; before the Hispanic share rose.
- Mosher, Williams & Johnson (1992), *Religion and fertility in the United States: new patterns*,
  *Demography*; doi:10.2307/2061727. NSFG evidence that the Catholic excess had gone among
  non-Hispanic whites; does not cover post-1990 cohorts.
- Lehrer (1996), *Religion as a determinant of marital fertility*, *J. Population Economics*;
  doi:10.1007/s001480050013. Economic model and estimates of religion's effect on fertility; one
  data cross-section.
- Zimmer & Goldscheider (1966), *A further look at Catholic fertility*, *Demography*;
  doi:10.2307/2060171. The pre-convergence baseline.

**Retention, switching and the demographic account of religious change.**
- Hout, Greeley & Wilde (2001), *The demographic imperative in religious change in the United
  States*, *AJS*; doi:10.1086/324189. Fertility differences explain most of mainline Protestant
  decline; Catholics are not the focus.
- Hout (2016), *Saint Peter's leaky boat: falling intergenerational persistence among U.S.-born
  Catholics since 1974*, *Sociology of Religion*; doi:10.1093/socrel/srv057. The closest prior
  work: GSS retention of US-born Catholics; excludes the foreign-born and the 2021-2024 waves.
- Sherkat (2001), *Tracking the restructuring of American religion: religious affiliation and
  patterns of religious mobility, 1973-1998*, *Social Forces*; doi:10.1353/sof.2001.0052.
  Switching tables by cohort; ends in 1998.
- Hout & Fischer (2002), *Why more Americans have no religious preference: politics and
  generations*, *ASR*; doi:10.2307/3088891. The rise of the nones; religion-wide.
- Voas & Chaves (2016), *Is the United States a counterexample to the secularization thesis?*,
  *AJS*; doi:10.1086/684202. Cohort replacement drives US decline; Catholics pooled with others.
- Perl & Gray (2007), *Catholic schooling and disaffiliation from Catholicism*, *JSSR*;
  doi:10.1111/j.1468-5906.2007.00356.x. One mechanism of retention; not subgroup demography.

**Attendance.**
- Hout & Greeley (1987), *The center doesn't hold: church attendance in the United States,
  1940-1984*, *ASR*; doi:10.2307/2095353. The post-Humanae Vitae Catholic attendance drop.
- Schwadel (2010), *Age, period, and cohort effects on U.S. religious service attendance: the
  declining impact of sex, southern residence, and Catholic affiliation*, *Sociology of
  Religion*; doi:10.1093/socrel/srq005. APC model on GSS; ends before the web-mode waves.
- Ruiter & van Tubergen (2009), *Religious attendance in cross-national perspective: a
  multilevel analysis of 60 countries*, *AJS*; doi:10.1086/603536. The cross-national frame for
  milestone 6.

**Projections and composition.**
- Skirbekk, Kaufmann & Goujon (2010), *Secularism, fundamentalism, or Catholicism? The religious
  composition of the United States to 2043*, *JSSR*; doi:10.1111/j.1468-5906.2010.01510.x.
  A cohort-component projection with Hispanic Catholic growth; testable against 2024 data.
- Kaufmann, Goujon & Skirbekk (2011), *The end of secularization in Europe? A socio-demographic
  perspective*, *Sociology of Religion*; doi:10.1093/socrel/srr033. The European counterpart.
- Hackett, Stonawski, Potančoková, Grim & Skirbekk (2015), *The future size of religiously
  affiliated and unaffiliated populations*, *Demographic Research*; doi:10.4054/demres.2015.32.27.
  Global projections; method template.
- Bullivant (2019), *Mass Exodus: Catholic disaffiliation in Britain and America since Vatican
  II*, Oxford UP; doi:10.1093/oso/9780198837947.001.0001. Book-length disaffiliation account.

**Data and outside benchmarks.**
- Davern, Bautista, Freese, Herd & Morgan, General Social Survey 1972-2024, NORC at the University
  of Chicago, https://gss.norc.org (release 3a cumulative file).
- Pew Research Center (2025), *Religious identity in the United States* (2023-24 Religious
  Landscape Study), https://www.pewresearch.org/religion/2025/02/26/religious-landscape-study-religious-identity/
  (Catholic share 19% in 2023-24; 18-21% in Center surveys since 2014).

## Gap

1. A single design-based (strata and PSU) comparison of US Catholic subpopulations, with
   intervals, that runs through the 2021, 2022 and 2024 GSS waves.
2. Retention split by ethnicity and immigrant generation together. Hout (2016) is US-born only,
   and pooled retention mixes a falling non-Hispanic white series with a flatter Hispanic one.
3. A cohort-component accounting of the Catholic share, 1990-2024, by channel and subgroup, and
   an out-of-sample score of the Skirbekk et al. (2010) projection against realised 2020s data.
4. Later: the same comparisons for European and Latin American Catholics (ESS, WVS/EVS).

## Hypotheses

- **H1a.** The Catholic minus Protestant fertility gap (ages 45-89, surveys 2000-2024) is smaller
  among non-Hispanic whites than overall. *Refuted* if the non-Hispanic white gap is at least as
  large.
- **H1b.** Among non-Hispanic whites born 1945-64 and 1965-80 the gap is within ±0.2 children.
  *Refuted* if a 95% interval lies wholly outside ±0.2.
- **H1c.** Within Catholics, weekly attenders have more children than the rest, in both ethnic
  groups. *Refuted* if either interval includes zero. (Descriptive, not causal.)
- **H2.** Retention of those raised Catholic falls across the 1945-64, 1965-80 and 1981-96 cohorts
  in both non-Hispanic whites and Hispanics. *Refuted* if either sequence is not decreasing.
- **H3.** The fall in Catholic weekly attendance between 2010-18 and 2021-24 survives adjustment
  for survey mode (2021+ waves are mainly web). *Refuted* if Catholics interviewed face to face in
  2022-2024 (the GSS records interview mode in `mode` and `modesequence`; which codes mark web interviews is checked in milestone 3) show no lower weekly attendance than in 2018.
- **H4.** Immigration (first-generation Catholics) accounts for more of the stability of the
  Catholic share between 1990 and 2018 than fertility does. *Refuted* if the cohort-component
  accounting gives fertility the larger share.
- **H5.** Skirbekk et al. (2010) overstate the 2020s Catholic share. *Refuted* if their projected
  value for 2020-2024 lies inside the GSS and Pew 95% ranges.

## Method

**Data.** GSS cumulative file 1972-2024 (release 3a), checksummed (`data/SHA256SUMS`); later the
GSS 2016-2020 panel for transitions, Pew RLS published tables as an outside benchmark, the
European Social Survey rounds 1-11 and the World Values Survey for milestone 6.
**Estimation.** Weighted domain means and contrasts with Taylor-linearised design-based standard
errors (strata `vstrat`, PSU `vpsu`, weight `wtssps`), implemented in `cathdem/survey.py` and
tested against analytic cases. Regression models (logistic for retention; Poisson for children
ever born) with the same design. Ethnicity is only measured from 2000, so ethnic contrasts start
there. **Accounting.** A cohort-component model by age, sex, ethnicity and generation, with
transition rates estimated from the GSS (switching), NCHS/ACS (fertility, mortality) and
Census/ACS (immigration), reconciled to the observed share.

## Evaluation

Every estimate is reported with its 95% design-based interval and unweighted n; contrasts keep
the covariance between domains. Benchmarks: the Pew 2023-24 Catholic share and subgroup tables,
and published figures from Hout (2016) and Skirbekk et al. (2010), reproduced before being
extended. Robustness: the alternative weight (`wtssall` before 2021), excluding the 2006 split
sample, restricting retention to ages 30+ so cohorts are compared after the main switching ages,
and the mode checks for 2021-2024. Ablations: each channel switched off in the accounting.

## Milestones

1. **Data, estimator, descriptive comparison and first tests of H1-H2** (2026-11-03, done:
   `experiments/m1_subgroups/`).
2. Re-read the related work in full; reproduce one Hout (2016) table; benchmark against Pew RLS
   subgroup tables.
3. Mode-effect analysis for 2021-2024 attendance (H3) (2026-11-04, done: `experiments/m3_mode/`; refuted as worded but underpowered).
4. Retention models by cohort, ethnicity and generation, ages 30+, with design-based inference (2026-11-04, done: `experiments/m4_retention/`).
5. Cohort-component accounting 1990-2024 (H4) and the projection score (H5). 5a (2026-11-04, done: `experiments/m5a_decomp/`): GSS-only decomposition into raised-Catholic inflow, retention and conversion; 5b (GSS-only nativity split done 2026-11-04, `experiments/m5b_nativity/`; second-generation split done 2026-11-05, `experiments/m5c_generation/`; third-plus split by ethnicity done 2026-11-08, `experiments/m5d_ethnicity/`; cohort split of the NH white third-plus rise done 2026-11-09, `experiments/m5e_cohort/`; mode split of the within-cohort rise done 2026-11-09, `experiments/m5f_mode/`; outside NCHS/ACS series open): split inflow with fertility and immigration.
6. Cross-national comparison: European and Latin American Catholics (ESS, WVS/EVS).
7. Paper draft in `paper/`.

## Target venue

*Journal for the Scientific Study of Religion* (research article, about 8,000-10,000 words), or
*Sociology of Religion*; the accounting and projection score (milestones 5) could go to
*Demographic Research*. This is an aim, not a claim of acceptance; submitting is an owner step.

## Deep-tech application

None. This is a social science programme opened at the owner's direct request, outside the
2026-11-01 deep-tech direction (noted in the run record's deviations). Its practical users are
diocesan planners, Catholic school and university enrolment offices, and researchers.
