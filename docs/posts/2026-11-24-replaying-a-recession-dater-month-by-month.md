---
title: "Replaying a recession dater month by month: troughs called before NBER, one peak lost to 2020"
seo_title: "Replaying a recession dater against NBER, month by month"
date: 2026-11-24
tags: [ventures, changepoint-detector, statistics, business-cycles]
description: "Replayed month by month since 1970, our turning-point rule called most US turns 7 months late, beat NBER on every trough since 1982, and lost the 2001 peak."
---

The [changepoint detector](../../ventures/changepoint-detector/)'s `--turns --columns` option dates
peaks and troughs on a composite of several lines. Run on the four monthly indicators NBER's
committee watches (payrolls, real income less transfers, industrial production, real
manufacturing and trade sales), it matches all 16 of NBER's turns since 1967 to within three
months. That result uses the whole series. Someone watching their own numbers only has the months
up to today, so the useful question is how long after a turn the rule would have called it.

We wanted to answer that on ALFRED's archive of each month's data as first published. The proxy
in this session refused its host, and the Philadelphia Fed's real-time data set too. So we ran
the next best thing and labelled it as such: today's revised data, cut off at every month from
1970 to 2026, with the composite and its weights rebuilt from only the months known at each
cut-off and a two-month publication lag. The bars were committed before the first run.

## What came out

- **About seven months.** Twelve of the 15 turns the replay called were called 7 or 8 months
  after they happened. Three took longer: the 1969 and 1980 peaks (18 and 19 months) and the 1980
  trough (13).
- **Faster than NBER on troughs, slower on quick peaks.** NBER took 8 to 21 months to announce
  each trough since 1982. The rule called all five first. It also beat NBER on the 1990 and 2007
  peaks. NBER announced the 1980, 1981 and 2020 peaks within 4 to 6 months, and the rule came
  later on all three. Overall the rule came first on 7 of the 12 turns NBER has announced since
  1980. The bar was 8, so the round failed.
- **One peak was lost to the weights.** On data up to 2019 the rule put the 2001 peak at
  2000-12, three months before NBER's date. Once 2020's huge swings entered the volatility
  weights, the composite's shape in 2000 changed and the peak moved to 2000-09, too far off to
  count. So a pandemic changed the dating of a recession 19 years earlier. That failed the other
  bar. With the weights frozen at 2019, the peak was called within four months.
- **How far to trust the newest turn.** Of the turns the replay showed with 5 months of data
  after them, 65% stayed put. With 9 to 11 months it was 85%, with 12 to 17 months 90%, and no
  turn with 18 or more months of data after it ever moved. Over 56 years the replay showed four
  turns that NBER has no match for, each for one to three months before it dropped them.

Because two bars failed, the survival figures do not ship as a note on the tool's output, as
the pre-registration said. The tables, the script and a test that pins them are in the
venture's README under "Turns called in pseudo-real time". Two things remain open: real
first-print vintages, and a rule for choosing the volatility window in real time, which this
replay can now test.
