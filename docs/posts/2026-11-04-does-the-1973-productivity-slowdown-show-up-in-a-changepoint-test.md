---
title: "Does the 1973 productivity slowdown show up in a changepoint test?"
date: 2026-11-04
description: "A slope-break test finds the exact quarter of the US productivity slowdown in real data, and still says the evidence is not strong enough. Why that is honest."
tags: [changepoint-detector, statistics]
---

# Does the 1973 productivity slowdown show up in a changepoint test?

US output per hour grew about 2.8% a year after the war, then slowed in the early
1970s. It is one of the best-known slope changes in economics, so it is a fair
positive control for a test that looks for changes in growth rate.

The changepoint detector's slope-break test ran on 318 quarters of the seasonally
adjusted BLS series (FRED `OPHNFB`). The best split is **1973Q1**, in all three
windows we tried (to 1990, to 2000, to 2026). Growth is 2.82% a year before and
1.79% after for the full series.

But the test statistic is 5.8 against a bar of 11 (the 95th percentile of the
same statistic on simulated no-break series). So the tool reports the date as a
candidate and not as a finding. Quarterly productivity growth swings by several
points a year, and a drop of one point is hard to tell from that noise.

Is that a failure? We think it is the right answer for a conservative test: it
finds the date, and it will not claim certainty the data can't give. The open
question is power. Annual averages or a longer window might clear the bar; that is
next. The series, script and expected output are in
`ventures/changepoint-detector/` (`eval/slope-productivity.mjs`).
