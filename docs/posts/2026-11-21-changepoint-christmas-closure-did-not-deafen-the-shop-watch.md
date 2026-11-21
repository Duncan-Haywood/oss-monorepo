---
title: "The Christmas closure did not deafen our shop watch, and calm noise is the hardest case"
seo_title: "Does a holiday closure break a revenue change alert?"
date: 2026-11-21
tags: [changepoint-detection, statistics, ecommerce, negative-result]
description: "Two pre-registered simulation rounds: an 11-day zero closure changed nothing, and calmer revenue noise made the default watch hear fewer slow climbs."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a watch that reads a shop's daily
revenue and alerts when the level moves. On one real shop, a UK gift wholesaler whose orders are public (UCI Online
Retail), the quietest setting never heard the autumn build-up, when revenue went from about £26,000 to £50,000 a day.
[Yesterday's round](2026-11-20-changepoint-slow-climb-is-not-why-the-shop-watch-went-deaf.md) ruled out the slow
shape of the climb. Two candidates were left: the real shop's noisier days, and the 11 days it was shut over
Christmas.

## The tails were the wrong suspect from the start

The earlier figure said the real shop's daily noise had an sd of 0.50 on a log scale. That reading still had the
weekday pattern in it. With each weekday's typical level removed, the real noise is **sd 0.356**, and the simulated
shops' noise, read the same way, is **0.41 to 0.50**. So the simulated shops were noisier than the real one, not
calmer. We wrote that down before setting the bars, and kept the tails in the test anyway. The real noise is lopsided,
with bad days worse than good days are good, and the simulation's noise is not.

## Round 4: the closure does nothing

The bars were committed before any shop ran (`eval/shop-tails-closure.prereg.md`). On 100 simulated shops whose revenue
climbs to x1.9 over four to eight weeks, Quiet heard 72. With the same shops shut for 11 days early in the year, it
heard 71. False alerts on 100 unchanged shops were 1.93 per 100 daily checks both ways. Listing the closed days with
`--closed` gave 74 and was harmless. So a shop that closes for Christmas does not need to do anything special.

Swapping in the real shop's own noise, resampled from its daily residuals, cut catches from 72 to 52. It also cut false
alerts from 1.93 to 0.70 per 100 checks. That passed its bar.

## Round 5: the noise effect shrinks, and a pattern shows up

A second pre-registered round, on fresh shops, asked which part of the real noise was responsible. It removed the
short-run correlation, flipped the lopsided tail, or replaced the noise with plain bell-curve noise of the same spread.

| noise | false alerts per 100 checks | x1.9 climbs heard (of 100) |
|---|---|---|
| simulated (round 3's) | 2.02 | 75 |
| real, resampled | 0.87 | 68 |
| real, one day at a time | 0.84 | 62 |
| real, flipped | 0.54 | 47 |
| bell curve, real spread | 0.36 | 44 |

On fresh shops the real noise cost only 7 catches, so round 4's 20 did not replicate at that size, and every bar in
round 5 failed. The table does show a pattern no bar asked about: **the calmer the noise, the fewer climbs the watch
hears.** A doubling over five weeks is large next to noise of sd 0.36, yet the watch heard it 44 times in 100. It seems
to catch slow climbs mostly when a single big day on the new, higher level sets it off. Noise with fewer big days sets
it off less often.

## What changes

Nothing ships. The closure is ruled out, and so is "heavy tails" in the sense first meant. What is left is the default
level model's own weakness on slow, smooth climbs. The next round, already in the README, compares it with the drift
model and the slope detector on calm simulated climbs, to see whether a slow-climb check should run beside the level
watch on daily revenue.

Everything is in the README section "A shop shut one weekday, rounds 4 and 5", with both pre-registrations and every
shop's line in `eval/`.
