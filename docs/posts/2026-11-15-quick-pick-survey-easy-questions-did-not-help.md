---
title: "Easy questions did not catch careless answers. Weighting the easy ones we already ask did."
seo_title: "Careless survey respondents: check questions vs weighted pairs"
date: 2026-11-15
description: "Obvious check questions cost ranking accuracy and caught fewer careless respondents. Weighting existing answers by pair clarity caught more."
tags: [quick-pick-survey, survey-quality, careless-responding, pairwise-comparison, simulation, product]
---

[Quick Pick Survey](https://marisstella.app/quick-pick-survey/) ranks a list by
asking people "which of these two?" again and again. Some people stop paying
attention partway through and click quickly and at random. When the group's
ranking is pooled, those answers should be left out.

The ranking looks for two signs: answers that suddenly get faster, and picks
that stop agreeing with everyone else. Timing works well when people keep a
steady pace. In our simulations, when each person's pace drifts around on its
own, timing alone recovers only about a fifth of the harm careless answers do.
The pick check was added yesterday to cover that gap, and it is weak. The
survey deliberately asks close pairs late in a session, since those are the
pairs that teach the ranking something. On a close pair an attentive person
agrees with the group not much more often than a coin does.

## Two ideas

**Ask obvious questions.** Survey designers use "attention check" items, and
the pairwise version is easy to build. Every fifth or tenth question, show the
pair that person's own answers say is most lopsided. An attentive person
almost always picks the same side again. A random clicker gets it right half
the time.

**Weight what is already asked.** Not every adaptive pair is close. If a
careless click moves the chance of agreeing from p to p − e(p − ½), then a
clear pair (p near 1) says more about e than a close one (p near ½). So each
answer is weighted by 2p − 1, and the before and after sides are compared as
two estimates of e instead of two averages. When every pair has the same gap,
the score is the old one exactly.

## What 300 simulated grid cells said

Panels of 20 people ranked 15 or 30 options with 4 answers per option. A
quarter to two fifths of them went careless at a quarter, half or three
quarters of the way through. Each grid cell ran 40 surveys, at three levels of
pace wander, with and without check questions. Then we ran the main cells
again on a second set of random seeds.

- **Check questions cost more than they caught.** Each one replaces an adaptive
  question, so the ranking got worse for everyone: 0.004 Spearman at one in 10
  and 0.009 at one in 5, whether anyone was careless or not. Under pace wander,
  the whole careless filter only gains about 0.006. The block check did not get
  better either. It found 0.23 of the careless with check questions against
  0.24 without. After a split there are only 3 or 4 check answers, and that is
  not enough to matter.
- **Weighting found more at the same false-flag rate.** With the bar raised
  from 2.5 to 3 standard errors, the weighted check found 27% of the careless
  people under strong wander, against 24% before (26% against 23% on the
  second seed set). It flagged 3.8% of honest people against 3.9% (3.4%
  against 3.4%). Where nobody's pace wanders, nothing changed, because the
  check does not run there.

So the weighting is now the default. The check questions are not added to
surveys, but the sweep can still turn them on (`--anchors`) for a later
retest.

## The honest caveat

All of this is simulated people with a timing model we chose. The open
question is still whether real people's pace wanders like this at all, and
only a real survey's answer times can tell us. The full tables, raw rows and
the command that reproduces each one are in the
[selector notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md)
("Check pairs for the pick test").
