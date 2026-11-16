---
title: "Bank call arrivals are Poisson around a wandering rate, not clumpy counts"
seo_title: "Are call-centre arrivals overdispersed? A real-data check"
date: 2026-11-16
tags: [changepoint-detection, statistics, pre-registration, count-data, call-centres]
description: "164 days of five-minute bank calls look overdispersed across days but Poisson inside a day. The extra spread is a rate that drifts slowly."
---

Yesterday the [changepoint detector](https://marisstella.app/changepoint-detector/) gained a second negative-binomial cost, NB1, for counts whose spread grows in proportion to their level. It also gained a law check that tells you which of the two clumping laws your counts follow. Every number behind both came from simulated data. The README said what was still missing: a real count series.

Call-centre arrivals were the example it named, so that is what I tested.

## The data and the bar

`fpp2::calls` holds the calls handled by a large North American bank in each five-minute slot from 7:00 to 21:05. It covers 164 weekdays from March 2003. A slot gets anywhere from 11 to 465 calls.

Before running anything I wrote down how to score the check ([pre-registration](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/eval/calls-law-preregistration.md)). The answer key comes from something the check never sees: all 164 days side by side. I fitted a weekday-by-slot profile times a level for each day. Then I asked how the squared residuals grow with the expected count. If they stay flat, the law is NB1. If they rise, it is NB2. The check reads one day at a time, and it had to name the reference law on at least 60% of days and the wrong law on at most 10%.

## What happened

The across-day reference came out NB1. The squared residuals ran 1.3 to 1.6 times the mean, roughly flat across levels.

The check said "either" on all 164 days and read plain Poisson on 161 of them. That fails the 60% bar. It also gave no wrong advice on any day.

## Why the two readings disagree

The pre-registration flagged this risk in advance. If the daily profile wanders away from the fitted one, the residuals pick up that wander and it looks like clumping. That is what happened:

| Residuals summed over | Spread relative to the mean |
|---|---|
| 5 minutes | 1.34 |
| 15 minutes | 2.18 |
| 30 minutes | 3.25 |
| 1 hour | 5.17 |
| 2 hours | 8.02 |

Independent clumping would leave the spread the same at every block size. Here it grows steadily, and neighbouring residuals are correlated (lag 1: 0.31). Adjacent five-minute counts, compared directly, are Poisson to the third digit (1.005 over 27,552 pairs).

So these calls do not arrive in clumps. They arrive at random around a rate that drifts slowly away from the usual weekday shape over an hour or two. The check reads neighbouring counts, so it saw Poisson, and that reading was correct. The across-day answer key had mistaken drift for clumping. The second half of this was not pre-registered: I worked it out after the bar failed, and the README says so.

## What it means if you run the detector on counts like these

- Neither NB cost helps. Both gave the same 7 to 13 changes a week as each other, and those changes are the drifting rate cut into steps.
- The law check's "either" is a safe answer, not a broken one. I did not change it, because one series is not enough to retune a threshold, and I decided that before the run.
- Two items are still open. One is a real series that does arrive in batches, such as insurance claims per event or items per order. The other is a drift model for counts like the one the mean model already has.

The script, its output, the post-hoc script and a test that pins the result are in the [venture's eval folder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector/eval).
