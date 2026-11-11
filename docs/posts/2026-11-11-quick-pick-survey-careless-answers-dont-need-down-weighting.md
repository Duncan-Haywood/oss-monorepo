---
title: "We caught the careless respondents, then found the ranking didn't need us to"
seo_title: "Down-weighting careless respondents in a pairwise survey ranking"
date: 2026-11-11
tags: [quick-pick-survey, pairwise-comparison, survey-quality, simulation, meta-analysis]
description: "Down-weighting or dropping respondents who answer at random did not improve a pooled pairwise ranking in 40 simulated settings. Dropping them made it worse."
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
people to choose one of two options at a time, then pools everyone's answers
into one ranking with honest error bars. Earlier today we found a way to spot
people who click at random: every fifth question, ask a pair their own answers
say is easy. Honest people agree with their own clear preferences. Random
clickers get it wrong about half the time.

The obvious next step was to make careless people's answers count less in the
pooled ranking. We measured that before building it.

## The test

We simulated surveys where everyone shares one underlying ranking, with a
small personal twist each. Between 40% and 60% of respondents were honest; the
rest answered at random 10%, 20% or 50% of the time. Lists had 15 or 30
options, panels had 20 or 60 people, and each setting ran 30 surveys on two
seed sets. We then pooled each survey's answers several ways:

- everyone counted equally (what ships today);
- each person weighted by their estimated carefulness;
- people flagged as careless left out;
- the same two schemes using each person's *true* carelessness, the best any
  detector could do.

## What happened

**Nothing helped, including the perfect detector.** Across 32 settings, every
weighting scheme moved the ranking's accuracy by less than its own noise
(between -0.014 and +0.004 in rank correlation, against 0.95 to 0.99 for
equal weights). Weights from the true answer did no better.

**Leaving people out made it worse.** Dropping flagged respondents cost up to
0.019 on 20-person panels. In a stress test built to favour dropping (everyone
agreeing exactly, 60% careless, 8-person panels), dropping cost 0.010 to 0.055
in every setting, even when the right people were dropped.

**Why.** Random answers don't reorder a person's ratings. They pull every
option toward the middle and add noise. The answers that remain honest still
point the right way, so a careless person's ratings are a blurred copy of the
truth, not a wrong one. Averaged with everyone else's, that copy is still
worth more than nothing. The pooling method also widens its error bars when
people disagree, and it never became overconfident: under 0.4% of the pairs it
called clear were the wrong way round, under every scheme.

## What we are doing with it

We didn't ship it. The ranking keeps equal weights and asks no extra easy
questions. The detector could still back a quality notice for the survey
owner. With 20 or more easy questions per person, it flagged 2% of honest
people or fewer and caught 55-60% of the random clickers. We will build that
only if someone asks for it.

The case this doesn't cover is carelessness that isn't random: always picking
the left option, or always the same item. That kind pushes the ranking in one
direction instead of blurring it, so it's the next thing we'll test.

All numbers come from synthetic respondents, not real people. The script,
raw rows and full tables are in the venture's
[selector notes](../../ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md)
under "Anchor weights in the pooled ranking".
