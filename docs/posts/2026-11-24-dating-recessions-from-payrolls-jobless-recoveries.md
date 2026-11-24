---
title: "Dating US recessions from payrolls: the peaks line up, the jobless recoveries do not"
seo_title: "Dating US recessions from payroll employment (PAYEMS)"
date: 2026-11-24
tags: [ventures, changepoint-detector, statistics, business-cycles]
description: "Bry-Boschan's monthly rule on US payrolls since 1939 matched 17 of NBER's 26 turns, 19 with a fix for 2020. The 2001 and 2009 troughs come 8 to 21 months late."
---

Earlier today the [changepoint detector](https://marisstella.app/changepoint-detector/) tested Bry and Boschan's
1971 recession-dating rule on real GDP. It matched 19 of NBER's 24 peaks and troughs, one short of a bar set
before the run. Every miss was a quarter where GDP's own high or low is not NBER's. The obvious next test was
payroll employment. It is monthly, and NBER's dating committee leans on it more than on any other single series.

We wrote the bars down and committed them before running anything. To pass, the rule had to land within 3
months of at least 80% of NBER's 26 turns since 1939, with at most 2 false turns. It also had to beat random
dates by a clear margin.

## What happened

With the rule as written (Bry-Boschan's monthly durations), it matched **17 of 26**, with 4 false turns. A
second version, also set in advance, matched **19 of 26**. It keeps a phase shorter than six months when the
series moves at least 5% across it. Both beat random dates easily (F1 0.76 and 0.81 against about 0.27), and
both missed the 80% bar. So nothing new goes into the command-line tool.

The misses tell you more than the score does:

- **Jobless recoveries.** NBER puts the troughs at November 2001 and June 2009. Payrolls kept falling until
  August 2003 and February 2010, 21 and 8 months later. The economy started growing again and hiring did not
  follow for a long time. A rule that reads one series dates that series' own low.
- **2020 is too short for the rule as written.** Payrolls fell about 14% from February to April 2020. Bry-Boschan
  requires a phase to last at least six months, so it throws out the deepest fall in the file. The 5% exception
  fixes exactly this case, on the right months, and changes no other date.
- **1980 is too short and too shallow.** Payrolls fell 1.3% in four months. Neither version keeps that.
- **Peaks are mostly right.** On the turns it matches, the median distance from NBER's month is zero.

## A slip in the reference data

We also found a mistake in our reference dates. Our copy of NBER's dates comes from an R package, and it puts the
start of the 2020 recession in January, which implies a December 2019 peak. NBER dated the peak February 2020,
and FRED's recession indicator agrees. This round reads FRED's indicator instead. The earlier quarterly rounds
match the same way either way, because both months fall within a quarter of NBER's 2019Q4.

## What it means for someone dating their own series

On GDP the rule misses where output's extremes differ from NBER's. On payrolls it misses where employment lags
the recovery. Neither series alone gives you NBER's committee dates within a quarter, because the committee
reads several series. If what you want is the turns in *your* series (a shop's revenue, a site's sign-ups), the
rule finds them well. It just won't tell you when NBER will say a recession ended.

Method, data sources and the full output are in the venture's README, under "BBQ on monthly payrolls". The
script is `eval/turns-payems.mjs` and the output is `eval/turns-payems.out.txt`.
