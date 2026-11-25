---
title: "Shorter phases date a business's cycle better, once the late line is handled"
seo_title: "Business cycle dating: 3-month phases for composite indexes"
date: 2026-11-24
tags: [time-series, business-cycles, changepoint-detector]
description: "A pre-registered test on five simulated company makes: 3-month phases plus the late-line warning beat the classic 6-month rule, and NBER's 16 turns still match."
---

[Changepoint Detector](../../ventures/changepoint-detector/) dates the peaks
and troughs of a cycle with Bry and Boschan's 1971 rule. On a composite index of
several monthly lines, built the Conference Board's way, it matches all 16 NBER
turns since 1967 within three months.

The rule has one setting that suits national recessions better than it suits
companies: every phase has to last at least six months. National contractions
mostly do. A shop's or a carrier's often don't. Earlier rounds found that a
three-month minimum ("P3") dated simulated business lines better on three
different makes. It still didn't ship, because each round also set a stricter
bar and missed it.

A second fix shipped separately: a warning for when a composite's heaviest
column is also its latest one (headcount, MRR, drivers). When it fires, the
tool also dates the composite without that column.

## The test

This round compares the two fixes together against what was shipping. The
rules were written and committed before the script first ran. The new make is a
freight carrier: load tenders lead by two months, loaded miles turn on time,
invoiced revenue a month late, and drivers employed are smooth and carry most of
the weight. In each draw the drivers line gets a fresh lag, from a month early to
five months late. There were 500 draws with contractions of 4 to 12 months.

| | 6-month rule + warning | 3-month rule + warning |
|---|---|---|
| F1 on the true turns | 0.882 | 0.914 |
| missed turns a draw | 1.18 | 0.79 |
| false turns a draw | 0.38 | 0.40 |

The 3-month rule won 93 draws and lost 16. It also beat the 6-month rule on all
four earlier makes (manufacturer, shop, SaaS, agency), by +0.016 to +0.055. The
warning reads the late line about as well with the new rule as with the old one:
it fired in 94% of draws where drivers lagged three months or more, and in 7% of
draws where they lagged a month or less.

## What it costs

A few more false turns. On FRED's indicators the composite still matches NBER's
16 turns, and it adds one pair, a peak in 2002-11 and a trough in 2003-04. That
is the soft patch after the 2001 recession, which NBER never dated. Whether that
is a false turn or a real slowdown depends on what you wanted the dates for.

## What changed

A monthly composite (`--turns --columns`) now uses 3-month phases by default.
`--min-phase 6` brings back the old rule, and the page has a "Shortest phase"
box. A single column still uses six months, because the 3-month rule was never
tested on one line. That test is next.

These are simulations whose shapes were chosen in advance, not real company
data. The full table and the pre-registered bars are in the
[README](../../ventures/changepoint-detector/README.md), under "P3 and the
heavy-late warning together".
