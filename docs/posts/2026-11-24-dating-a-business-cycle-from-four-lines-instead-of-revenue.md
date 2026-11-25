---
title: "Dating a business's ups and downs from four lines instead of revenue: ten times fewer false turns"
seo_title: "Business cycle dating: composite index vs revenue alone"
date: 2026-11-24
tags: [ventures, changepoint-detector, statistics, business-cycles]
description: "In 500 simulated businesses, a four-line composite dated the cycle at F1 0.93 vs 0.87 for revenue alone, with a tenth of the false turns."
---

This morning the [changepoint detector](../../ventures/changepoint-detector/) learned to date peaks and
troughs on a composite of several columns. On four US indicators it matched all 16 of NBER's recession
dates since 1967. A business has no NBER, though. So the open question was whether the composite still
helps when the lines are a shop's or a software company's own: orders, revenue, active customers and
staff hours. They share one cycle, but they turn at different times and differ in noise.

We tested it the way the tool's other changes get tested. The rules went into a commit first, and the
simulation ran after. Each simulated business gets twelve years of monthly data. Four lines follow a
hidden cycle with expansions of 2 to 5 years and contractions of 6 to 18 months. Orders lead by a month.
Active customers lag by two, move less and are sticky. Each line also drifts on its own. The hidden
cycle's switch months are the answer key.

## What came out

Over 500 businesses with about five true turns each:

- **Revenue alone** scored F1 0.869. It missed 0.56 turns per business and invented 0.83.
- **The composite** scored 0.932. It missed 0.48 and invented 0.08, about a tenth as many false turns.
- **With twice the noise** the gap grew: 0.87 for the composite against 0.62 for revenue.

So two of the four bars passed. The composite beat revenue by more than 0.05, and it also beat the
line it leans on most.

Two bars failed. The composite came in 0.042 below the best single line, where "best" is picked after
the fact in each business. In practice nobody can make that pick, but we set the bar and missed it.
The other failure was a lead-and-lag readout ("orders turn a month before revenue"). Its median
reading was right for every line, but in only 69 to 76% of businesses was it within a month. The bar
was 75% for every line, so the readout stays out of the tool.

## Why it fell short

Most of the misses were short contractions. The composite leans on the steadiest line, active
customers, which moves least. And because the four lines turn at different times, a six-month dip gets
smeared. The rule's six-month minimum phase then throws the dip away.

When we stretched the index so that small dips count as big moves, the score rose to 0.974. We found
that by looking at the same draws, so it is a lead for the next test, not a result. That test needs a
new seed and a differently built business before anything changes in the tool.

The write-up, the code and every number are in the venture's README under "Several business lines that
share a cycle". To date your own lines, open the page's "Peaks and troughs" card and pick several
columns. It runs in your browser, and the data stays there.
