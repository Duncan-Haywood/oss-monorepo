---
title: "The coin flips before the run: cutting a bored respondent from where they sped up"
seo_title: "Careless survey respondents: cut from the speed-up, not the slot run"
date: 2026-11-14
description: "A slot-run test missed the random clicks a bored respondent gives first. Cutting from their speed-up instead gained up to +0.0045 Spearman, flagging nobody new."
tags: [quick-pick-survey, surveys, data-quality, response-time, statistics, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking people to pick between two options at a time. The options swap places
on screen at random, so a person who keeps clicking the top one is telling you
nothing about the options. Since this morning the default ranking finds a
person who starts doing that partway through and leaves out what they
answered from that point on (a run a fair coin gives less than 1 time in 100).

## What that test cannot see

Bored people don't always go straight to one position. A common pattern in
the simulations, and a plausible one in life, is: answer properly, get bored
and speed up, click more or less at random for a while, then settle on the
top slot. The slot-run test sees the run. The random clicks before it look
like a fair coin, which is what they are, so they stayed in the ranking.

The answer times *do* see the speed-up. The catch is that the time test is
built to be careful. If a person's pace wanders, quicker for a stretch and
then slower, a split search will find a "speed-up" in an honest person's
times. So the time test has a bar a wandering pace must clear, and on a panel
whose pace wanders, that bar throws out most real speed-ups too.

## Using the times only where the slots already spoke

The change is small. When the slot-run test has flagged someone from answer
40, and their times show a speed-up at answer 25, the cut moves back to 25.
The speed-up is read *without* the wander bar, because this step can't flag
anyone. It only moves the cut for someone the slot test already flagged,
which happens to an honest person about 0.01-0.16% of the time. The worst a
wrongly read speed-up can do is drop a few honest answers from someone who
was clicking carelessly anyway.

## What the simulation says

Panels of 20, a quarter or 40% of them turning careless halfway, at 0.4x or
0.7x their pace, with everyone's pace wandering as a random walk; 110 cells
of 30 surveys each, on two seed sets
([raw rows](../../ventures/quick-pick-survey/docs/slot-turn-back-2026-11-14.jsonl)).
Against the default from earlier today:

- **When the slot run comes after the speed-up**, the case it is for, the
  ranking's Spearman correlation with the truth rose by +0.0008 on average
  over 40 cells, up to +0.0045 (30 options, 40% careless). It rose by more
  than two standard errors in 7 cells and fell by that much in none.
- **When the run starts with or before the speed-up**, there are no
  random clicks to recover. A wrongly read speed-up then costs a few honest
  answers, but the cut moved for at most a quarter of the careless, and the
  cost stayed within 0.0011.
- **With nobody's pace wandering**, the time test already found the
  speed-up, so the change does next to nothing (within ±0.0008).

I also measured the obvious next step: run this morning's
"test the slots from the speed-up" check at the looser turns as well.
It added 0.1-0.4% honest flags (inside its 1% bound) and was as often below
the default as above it on the second seed set, so it didn't ship.

## What it doesn't settle

The speed-up is still found by searching every split of a person's times.
A sharper version would test a single candidate named by the slot run itself,
so the chance a wander step moves a cut has a bound. And all of this is
simulated. Whether real people's paces wander, and whether their times depend
on which slot they click, waits on the first real survey. The full write-up is in
[docs/INFORMATION-GAIN-SELECTOR.md](../../ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md),
"A slot run's cut moved back to an earlier fast turn".
