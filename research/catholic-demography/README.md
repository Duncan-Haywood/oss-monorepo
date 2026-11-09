# How do US Catholic subpopulations differ? Hispanic and white Catholics, immigrants, converts and cohorts compared on fertility, retention, Mass attendance and politics (GSS 1972-2024)

A research programme comparing the demography of Catholic subpopulations, starting with the
United States and the General Social Survey (GSS) 1972-2024, with design-based 95% intervals.

**Live page:** https://marisstella.app/research/catholic-demography/

## Headline results (milestone 1, 2026-11-03)

All weighted (`wtssps`), with 95% design-based intervals from the GSS strata and PSUs.

- **The "Catholic fertility" premium is gone, and reversed in the youngest completed cohort.**
  Among non-Hispanic whites aged 45 and over, Catholics born 1925-44 had 0.21 more children than
  Protestants [0.05, 0.37]; born 1945-64, +0.04 [-0.05, 0.14]; born 1965-80, **-0.28
  [-0.48, -0.09]**. What predicts a large Catholic family is attendance, not the label: weekly
  attenders have about 0.5 to 0.6 more children than other Catholics.
- **Retention is falling for white Catholics, much less for Hispanic Catholics.** Of non-Hispanic
  whites raised Catholic, 66% of those born 1945-64 are still Catholic, 63% of those born 1965-80
  and 55% of those born 1981-96. For Hispanics: 74%, 76%, 71%. Across all respondents raised
  Catholic, retention fell from 84% in the 1970s surveys to 62% in 2021-24.
- **Hispanic Catholics are not more likely to go to Mass weekly** than white Catholics (no
  difference in 2010-18; 6 points *less* in 2021-24), but more often read the Bible literally
  and are about 25-30 points less likely to be Republican.
- **The Church is becoming more Hispanic and more immigrant.** Hispanics were 31% of US Catholics
  in 2000-09 and 37% [33, 40] in 2021-24; one in four Catholics is foreign-born.
- **Benchmark.** The GSS 2024 Catholic share is 21.6% [19.3, 23.9]; Pew's 2023-24 Religious
  Landscape Study says 19%. The gap is logged for milestone 2.

![Share of those raised Catholic who are still Catholic, by birth cohort](experiments/m1_subgroups/retention.svg)

![Catholic minus Protestant children ever born, non-Hispanic whites](experiments/m1_subgroups/fertility_gap.svg)

Full tables: [`experiments/m1_subgroups/`](experiments/m1_subgroups) (`t1` composition, `t2`
fertility, `t3` retention, `t4` practice, belief and politics by subgroup). Plan and hypotheses:
[`PROPOSAL.md`](PROPOSAL.md). Research log: [`LOG.md`](LOG.md).

## Retention models (milestone 4, 2026-11-04)

Among Catholic-raised adults aged 30+ (GSS 2000-2024, n = 7,155), design-based logistic models
find white retention falling by cohort, 66% (born 1945-64), 61% (1965-80), 48% (1981-96), while
Hispanic retention stays at 74%, 76%, 70% (cohort x Hispanic interaction p = 0.015). First-generation
immigrants retain more than third-generation Catholics at equal cohort (odds ratio 1.41 [1.15, 1.72]), which
explains the Hispanic level advantage but not its flatter trend. The youngest cohort is only
observed to age 43. Details: `experiments/m4_retention/results.txt` and `LOG.md`.

## Milestone 3 (2026-11-04): is the post-2020 attendance drop real or the survey mode?

Weekly Mass attendance of Catholics fell 5.5 points [-9.3, -1.6] between 2016-18 and 2021-24, but
non-Catholics fell as much (-5.7), and the 2022 and 2024 web respondents attend 9 points less than
in-person respondents in the same year (-9.1 [-15.9, -2.4]; unchanged after adjusting for age, sex,
ethnicity and degree). Among in-person respondents only, the change from 2016-18 is -2.2 [-8.9, +4.5]:
not distinguishable from zero, but the samples are small enough that a real fall of up to about 9 points
is not ruled out. So hypothesis H3 is refuted as worded, and the honest reading is "mostly mode, residual
unknown". Selection (web respondents are partly in-person nonrespondents) is not separated from mode.
Code `experiments/m3_mode/run.py`, results `results.txt`. The randomised-arm contrast (`modesequence`) is in `experiments/m3b_randomised/`: Catholic weekly attendance 19.4% (face-to-face first) vs 17.1% (web first), +2.2 points [-3.1, 7.5], so the experiment neither shows nor excludes a mode effect.

## Limits

Descriptive, not causal: attendance is measured at the interview, after the births. Ethnicity is
asked only from 2000. The GSS was English-only until 2006, so early Hispanic estimates cover
English speakers. The 2021-2024 waves were mostly self-completed on the web, so changes from
2018 mix real change with mode effects (milestone 3). Children ever born is top-coded at 8 and
pools men and women. Related-work notes are from abstracts, not a full re-read.

## Reproduce

```sh
sh data/download.sh                          # GSS 1972-2024 R3a from NORC, about 600 MB, checksummed
python3 experiments/m1_subgroups/run.py      # needs pandas and numpy; about 60 s
python3 experiments/m1_subgroups/figure.py   # stdlib only
python3 experiments/m3_mode/run.py           # mode effect on 2021-24 attendance; about 30 s
python3 experiments/m3b_randomised/run.py     # randomised mode arms, 2022 and 2024; about 60 s
PY=$(python3 platform/ci/pyenv.py pytest numpy pandas)   # bare python3 lacks all three; scipy is not needed
"$PY" -m pytest -q research/catholic-demography/test_cathdem.py   # from the repo root; no download needed
```

Data: Davern, Bautista, Freese, Herd and Morgan, *General Social Survey 1972-2024*, NORC at the
University of Chicago (https://gss.norc.org); free to use with citation. Only scripts, checksums
and aggregate tables are committed. Written with AI assistance (Claude Code); MIT licence.
Related: [`research/religion-origins`](../religion-origins), [`research/marriage-divorce-evidence`](../marriage-divorce-evidence).
