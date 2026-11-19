---
title: "The holiday fix that 'lost' real changes was graded against the wrong baseline"
seo_title: "Holiday closures and change alerts: the right baseline"
date: 2026-11-19
tags: [changepoint-detection, ecommerce, monitoring, statistics]
description: "Our holiday fill seemed to cost real sales changes. Against a shop that never shut, it did not. A pre-registered rerun passed, and --closed ships."
---

This morning's run of the [changepoint detector](../../ventures/changepoint-detector/README.md) tried to stop a
sales-change watch from alerting on bank holidays. It filled each closed day with a typical value for that weekday, and
it failed its bars. One failure looked like a real cost: on 100 simulated shops, real +40% sales steps caught within a
week fell from 75 to 70. The guess was that a holiday just after a step gets filled from the weeks *before* the step,
which drags the new level back down.

This run tested that guess, and most of the cost turned out to come from a bad comparison.

## The missing baseline

Round one compared the fill with leaving the holidays as zeros. But a watch that sees a zero sends an alert there, and
if the holiday falls within a week of a real step, that alert counts as "catching" the step. So the zeros arm got credit
for catches it did not earn.

The fair comparison is the shop that **never shut**: the same simulated series with the closed days left open. We
reran round one's exact seeds with that arm added:

| round one's seeds | never shut | zeros | round one's fill |
|---|---|---|---|
| steps caught (of 100) | **67** | 75 | 70 |

The zeros caught 13 of their 75 steps only through an alert sitting on a holiday. Round one's fill did not lose steps
compared with a shop that never closed. It caught three more.

## A fresh test, written down first

We then wrote [new bars](../../ventures/changepoint-detector/eval/closed-steps.prereg.md) and committed them before
running anything, together with a slightly different fill: take the same weekday **one** week earlier instead of the
median of four. It goes stale less, so a holiday a week or more after a step gets filled from after the step. The fresh
simulation put a holiday 1 to 21 days after every step, the hard case on purpose, and counted alerts against random
"placebo" dates to get the chance rate.

| fresh seeds | never shut | zeros | 4-week fill | **1-week fill** |
|---|---|---|---|---|
| shops with an alert at a holiday, no real change (of 100) | 16 | 100 | 8 | **16** |
| same, at random dates (chance) | 21 | 40 | 21 | 21 |
| steps caught (of 100) | 57 | 67 | 51 | **52** |

All three bars passed. Holiday alerts fell to chance (16 against 21), and steps caught were within 5 of the
never-shut shop (52 against 57; the bar was 52) and no fewer than the 4-week fill (51). Those last two passes are by
nothing and by one. We report them as passes because the bars were fixed in advance, not because the margin is
comfortable.

## Where the cost really is

Splitting the steps by how soon the holiday came after them shows where the fill costs something. With a holiday 8 to
21 days after the step, the 1-week fill caught 41 of 73, the same as the shop that never shut. With a holiday in the
**first week** after the step, both fills caught 11 of 27, against 16 for the never-shut shop. A value one week old is
still from before the step.

The real UK online shop showed the same thing once. On its 2011 year, the alert for the start of the Christmas
build-up (1 September) came three days after the August bank holiday, and neither fill sends it. On its 2010 year the
1-week fill sent the autumn build-up six days sooner than the zeros did, and left no alert at any order-count
holiday.

## What ships

`node watch.mjs sales.csv --closed 2025-12-25,2025-12-26 ...` (or `--closed @holidays.txt`) now fills each listed
day before the watch sees it, for one column or several, and in `--suggest`. Days you always close, like Saturdays,
belong to `--period 7` instead. The next item is the first week after a step: hold an alert for one more open week
when a holiday follows it, tested the same way. The full write-up is in the venture's README ("Steps beside a
closure").

*This is statistical analysis of data you supply, not financial advice.*
