---
title: "Every extra question is another look: raising the bar on long decision runs"
seo_title: "Optional stopping in a pairwise decision matrix"
date: 2026-11-15
description: "Checking a stop after every answer lets lucky streaks end long runs as settled. A rising level cut those false results from 30 to 21 in 300."
tags: [quick-pick-survey, decision-matrix, pairwise-comparison, stopping-rules, optional-stopping, simulation, product]
---

[Weigh criteria by picking pairs](https://marisstella.app/quick-pick-survey/decide.html)
is a free decision matrix where you type no numbers. You answer "which matters
more?" and "on rent alone, which is better?", and the page stops once there is
under a 10% chance that any option beats the leader by more than a practical
tie. Earlier today the question cap became
[a checkpoint](2026-11-15-quick-pick-survey-the-cap-was-deciding.md): if it is
still close at the top, you can keep going to three times the cap.

## The catch with keeping going

The stop is checked after every answer. Each check is another look at the
results, and with enough looks a run of lucky picks will push the leader over
the line at some point, whether or not it is really ahead. This is the old
optional-stopping problem, the same one that catches an A/B test someone
watches every hour and stops the moment it looks significant.

In the simulation it showed up for people who say "much better" freely. For a
person who says "much" on about 63% of picks, 263 of 300 runs stopped on their
own before three times the cap. In 30 of those the true best was more than a
practical tie ahead of the option named, so the promise held 88.6% of the time
instead of 90%.

## The fix: ask for more the longer it runs

Up to the checkpoint nothing changes. After it, the level rises with the number
of answers t:

level = 1 − 0.1 × (checkpoint / t)^0.5

That is 90% at the checkpoint, about 93% at twice it and 94% at three times.
On the same 300 simulated people per row:

| person | stop | questions | stopped on their own | promise held | false "settled" |
|---|---|---|---|---|---|
| says "much" on 63% of picks | before | 39,768 | 263 | 0.886 | 30 |
| same | **rising level** | 43,791 | 235 | **0.911** | **21** |
| says "much" on 36% of picks | before | 55,013 | 218 | 0.977 | 5 |
| same | **rising level** | 58,987 | 173 | 0.965 | 6 |

The true best was named about as often either way (212 against 209, 250
against 254: noise at 300 runs). What the rule changes is how a miss is
reported. A run that would have ended "settled" on a lucky streak now runs on
and ends with "It is still close at the top", which is the truth. It costs 7%
to 10% more questions for people who choose to keep going.

We also tried a steeper rise (power 1: 0.915, for 16% more questions) and a
guard that discounts "much" answers more as the run goes on (0.894, for 14%
more). The gentler rise was the cheapest one measured that keeps the 90%
promise for every kind of person except one.

## Still open

A person who says "much" on 80% of picks is at 0.86 already at the checkpoint,
so the problem there is not long runs. The page's estimate of how freely
someone says "much" starts from a prior centred on a moderate person and reads
these people as more careful than they are. That is the next item. Every
number, the 3,000 simulated runs and the scripts that produce them are in
[the page's notes](../../ventures/quick-pick-survey/docs/DECIDE-PAGE.md) ("The
guard over long runs"). None of these people are real.

The page is for weighing your own choices. It is not the only basis for a
hiring, financial, medical or relationship decision.
