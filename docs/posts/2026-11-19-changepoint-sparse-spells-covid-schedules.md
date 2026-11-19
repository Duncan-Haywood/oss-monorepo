---
title: "When a feed publishes less often for six weeks: a check that dates the spell, pre-registered"
seo_title: "Detecting short spells of less frequent data updates"
date: 2026-11-19
tags: [changepoint-detection, data-quality, monitoring, statistics]
description: "A pre-registered check for one- to two-month spells of fewer publishing days passed four simulation bars and dated two states' spells in JHU's data."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has an update-rate check: it reads the
exact repeats in a series (a figure carried forward, a feed that did not publish) and says when their share
changed. On Johns Hopkins CSSE's daily US COVID-19 case series it dated 20 of 27 documented state switches to
weekly reporting. It dated none of the eight documented moves *back* to more frequent reporting, and five earlier
rounds tried to fix that and failed.

Yesterday's round found why for four of them. Alaska's record says it went from Monday/Wednesday/Friday to
Monday-Friday on 2021-08-02, but in the data Monday-Friday is what came before *and* after. The
Monday/Wednesday/Friday schedule lasted about two months, June to July. South Dakota had the same shape with
Wednesdays only, for about six weeks. So the data hold a short spell of *fewer* publishing days. A check that
cuts a series into stretches has to pay for two cuts to catch a spell like that, and it rarely gets them.

## The test

We wrote the rules [before running anything](../../ventures/changepoint-detector/eval/update-rate-sparse-spells.mjs).
Inside each stretch, the check looks for the single interval with more repeats than the parts around it. The parts
before and after share one model, because the old schedule came back. That costs one penalty instead of two
cuts. Each interval is scored by a weekday model when the stretch follows a weekly schedule, and by a two-state
chain when it does not. We had two candidate rules for what counts as "more repeats": twice the share, or a
significant rise by a one-sided z test. One of them was picked on a calibration seed, then tested on a fresh one:

| fresh seed, found of 200 | with the spell check | the old check alone |
|---|---|---|
| 60 days of Wednesdays only inside Monday-Friday | 200 | 17 |
| 60 days of Mon/Wed/Fri inside Monday-Friday | 195 | 162 |
| 60 days of Monday-Friday inside daily | 157 | 10 |
| false spells a series, worst of 23 cells with none | 0.015 (bar 0.020) | |

The 23 cells with no spell include the traps earlier rounds fell into: the same number of publishing days moved
to other weekdays, and short returns to *more* frequent publication. All four bars passed.

## On the real series

Alaska: a spell from 2021-06-08 to 2021-07-29 (58% of days repeat inside, 32% around), four days before the
documented return. South Dakota: 2021-07-03 to 2021-08-10 (85% against 32%), six days before. We had read both
states' monthly shares before writing the rules and said so in the header, so this confirms the check and did
not choose it.

One find we did not ask for: Arkansas has a 30-day spell of weekends off that ends four days before its documented
move back to daily reporting on 2021-07-24. The check also reported long spells next to returns that the other
pass finds (Idaho, Washington), which are the same two-schedule split seen from the other side, and two 2022
spells that match no documented event.

## What ships

`shortSpells(values, { days })` is now exported from `update-rate.mjs` for anyone with a date per value. As the
rules said, it is opt-in for now: nothing the command line or the page prints has changed. The next step is a
`--spells` line on both, and then a test on another provider's documented schedule changes, data nobody here has
looked at yet. Every number above is in
[the run's output](../../ventures/changepoint-detector/eval/update-rate-sparse-spells.out.txt) and the
[README section](../../ventures/changepoint-detector/README.md).
