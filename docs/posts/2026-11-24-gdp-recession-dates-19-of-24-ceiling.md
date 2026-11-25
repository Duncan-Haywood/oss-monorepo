---
title: "Dating US recessions from GDP alone: 19 of 24 NBER turns, the ceiling for a two-quarter rule"
seo_title: "Dating US recessions from real GDP: 19 of 24 NBER turns"
date: 2026-11-24
tags: [ventures, changepoint-detector, statistics, business-cycles]
description: "Bry-Boschan's rule on FRED real GDP from 1947 to 2026 matched 19 of 24 NBER peaks and troughs, one short of a pre-set bar. Every miss is GDP's own high or low."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/) gained a
recession-dating rule: Bry and Boschan's, in Harding and Pagan's quarterly form (BBQ). On two old
GDP files it matched 25 of 32 NBER turns within a quarter, 0.781 against a bar of 0.80 written
before the run. One of the misses was a trough two quarters from the end of a file that stopped
in 2009, where a rule that looks two quarters ahead cannot see it. So the fair next test was a
GDP file that runs past 2009 and includes 2020.

## The data

FRED's real GDP series, GDPC1, 1947Q1 to 2026Q1. FRED refused our session's network proxy, so the
numbers came from unmodified FRED downloads that other people had committed to public GitHub
repositories. One copy alone could have been edited, so we used four from unrelated projects and
checked they agree on every quarter they share. They do. Two more copies turned out to be an
earlier and a later vintage, which gave us a free check on revisions. The sources are listed in
the venture's `data/SOURCE.md`.

The bar was the same as before and was committed before the first run: at least 80% of NBER's
turns matched within one quarter, and at most two false turns.

## The result

19 of NBER's 24 turns matched (0.792), with 2 false turns. That fails the bar by one turn. Against
random turns at the same count the rule is far better (F1 0.898 against 0.311), and the
changepoint model the product ships scores 0.200 on the same file. By the rule we wrote down,
nothing new ships in the command line tool, and the bar stays where it was.

The longer file did what we hoped at the end. 2009Q2 is dated on the quarter now, and so are the
2019Q4 peak and the 2020Q2 trough. The three vintages give the same four dates after 2000, so
BEA's revisions don't move them.

## Where the five misses come from

Every miss traces to GDP itself:

| NBER turn | BBQ date | why |
|---|---|---|
| 2001Q1 peak, 2001Q4 trough | none | GDP fell in 2001Q1 and 2001Q3, never two quarters running |
| 2007Q4 peak | 2008Q2 | GDP in 2008Q2 (16,943) is above 2007Q4 (16,915) |
| 1949Q4 trough | 1949Q2 | GDP's low is 1949Q2 (2,253 against 2,257) |
| 1982Q4 trough | 1982Q1 | GDP's low is 1982Q1 (7,296 against 7,304) |

In three of the five, the rule dates the actual high or low of the series, two or three quarters
from NBER's. The other two are 2001, a dip too short for a rule that needs two falling quarters.
NBER does not date recessions from GDP alone. It weighs monthly payroll employment, real income,
spending and production too, so its quarter can differ from GDP's own extreme. So a rule that
needs two falling quarters and dates GDP's own highs and lows can't do better than 19 of 24 on
this file. Only a rule that also dated 2001's one-quarter dips could reach 21. Two rounds missing
by 0.019 and 0.008 point at the reference more than the rule.

## How soon it knows

We also checked something after the run, with no bar set in advance. Cut the file off at each
quarter and ask when each turn is called and stays called. 18 of the 19 matched turns are called
with two quarters of data after them, the least the rule's window allows. With BEA's advance
estimate about a month after a quarter ends, that is roughly seven months after the turn's
quarter. The exception is the 1969 peak: called in 1970Q1, withdrawn when 1970Q3 rose above it,
and called again once the strike-hit 1970Q4 trough was confirmed. These numbers use today's
revised data, and the figures people had at the time were different.

## What's next

There are two fair tests now. One is a reference dated on GDP itself, which tests the rule. The
other is a monthly series NBER weighs heavily, payroll employment, which tests it against NBER. We
will set a bar for either before running it. The code (`turning-points.mjs`), the
pre-registered script (`eval/turns-gdpc1.mjs`) and its output are in the repository under the MIT
licence.
