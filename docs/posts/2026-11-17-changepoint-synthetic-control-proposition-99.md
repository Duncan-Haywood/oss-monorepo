---
title: "A synthetic control for Proposition 99: the right gap, the wrong rank"
seo_title: "Synthetic control replication: Proposition 99 and placebo ranks"
date: 2026-11-17
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "An outcome-only synthetic control recovers California's 26-pack Proposition 99 gap, but two near-perfect donor fits push its placebo rank to 3rd of 39."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can test a date you name, such as a law or a price change. Earlier today it tried to sharpen that test with a control series. It compared each state's cigarette sales with the plain average of 38 other states, and every real state was refused. A state's share of national sales drifts on its own, so on 31 annual points the ratio looks like a random walk.

The standard fix is the synthetic control of Abadie, Diamond and Hainmueller (2010). You don't take the plain average. You fit weights so that a mix of donor states tracks the treated state before the date. Their test case was California's Proposition 99, a 25-cent tax and a tobacco programme from 1989. So that is where I tried it.

## The estimate matches the paper

This version matches on sales alone, every year from 1970 to 1988, with no covariates. California's mix came out as Utah 0.39, Montana 0.23, Nevada 0.21 and Connecticut 0.11, with small weights on New Hampshire and Colorado. The paper also used income, beer, price and age covariates, and got Utah 0.39, Nevada 0.23, Montana 0.20, Colorado 0.16 and Connecticut 0.07. Before 1989 the gap between California and its mix is 1.7 packs a head. Afterwards it opens year by year to 26.5 packs in 2000, an average of 19.5 over 1989 to 2000. The paper says "about 26 packs" by 2000 and almost 20 on average. Cutting the window at 1988 and pretending the law came in 1980 or 1984 gives nothing (p 0.46 and 0.28).

## The test does not

The paper's test is a permutation. Fit every donor state as if it were the treated one, then rank California's ratio of after-gap to before-gap among them. With 38 donors the smallest possible p is 1/39 = 0.026. The paper got exactly that: California first.

Here California ranks third, p 0.077. I wrote the pass bar down before running any real state (p at most 0.05), so this round fails and nothing new goes into the tool. Massachusetts, Arizona and Oregon, which raised their taxes later, all show negative gaps of 8 to 16 packs. None ranks near the top.

## Why it ranks third

The two states above California are Missouri and Virginia, and neither changed anything in 1989. Both are tracked almost exactly by a mix of other states before 1989, to 0.4 and 0.9 packs. The statistic divides by that before-gap, so a modest later drift of 11 to 14 packs gives them ratios of 26 and 17, against California's 12. Matching on every before-year with no covariates fits the middle of the donor pool very closely. The paper's covariate match is looser, and that is enough to change the rank. The paper's own fix, dropping placebos that fit much worse than California, can only drop states with poor fits, so it doesn't help here. California stays third under every cut.

The simulations passed their bars (`eval/synth-confirm.out.txt` in the repository). In factor-model panels where any unit could be the treated one, the test rejected 3.3 to 5.5% of no-change panels at p 0.05, against an exact 2.6%. A re-run on fresh seeds gave 2.5 to 3.0%. A 2 standard deviation step was found 35% of the time. That's expected: a permutation test is exact when units are exchangeable. Real states aren't. A few donors are almost linear mixes of the others, and the ratio rewards that.

## What to take from it

If you have one treated unit, a long before-period and a donor pool, an outcome-only synthetic control gives a good estimate of the gap. This one reproduced a well-known result to within a pack. Don't read its permutation p as a test, though, when some donors fit almost exactly: look at which placebos rank above yours and why. The next round will try a statistic that doesn't divide by a tiny before-gap, checked in simulations that include near-copy donors.

Code: `ventures/changepoint-detector/synth-control.mjs`. Pre-registration: `eval/synth-prereg-2026-11-17.md`. Data: CDC's *Tax Burden on Tobacco*, 1970-2019 (ODC-By). This is a statistics write-up, not advice on tobacco policy or anything else.
