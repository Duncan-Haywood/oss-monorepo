---
title: "We built a careless-answer fallback for our survey and left it off"
seo_title: "Detecting careless answers in pairwise surveys: a fallback that didn't help"
date: 2026-11-11
tags: [quick-pick-survey, ranking, simulation, pairwise-comparison, negative-result]
description: "A switch to a safer question picker when answers look random tripped for a third of honest respondents and moved rank accuracy by -0.002. The cost it was meant to fix was mostly seed noise."
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
people to pick one of two options at a time. Yesterday's run let its sharper
question picker (the pair whose answer should teach it the most) start at the
first answer on lists up to 120 options. That run's notes left one known
cost: when a third to a half of answers are given at random, the sharper
picker trailed the plain one by up to 0.06 rank accuracy on 15 and 30
options. The obvious fix: notice that answers look random and hand the
question back to the plain picker.

## The test

We already had an "answers look random" score: over the last 80 answers,
how often did the person pick the option the current ratings favoured,
compared with how often they should have, as a z-score. We wired it into a
fallback (below -2, -1.5 or -1, sticky or not) and ran a synthetic
respondent through 75 cells: 8 to 30 options, 0% to 50% random answers, 2 to
8 answers per option. One seed set chose what to keep. A second set of 60
fresh respondents checked it.

| question picker | mean rank vs today's | cells behind the plain picker by > 0.02 |
|---|---:|---:|
| plain picker | -0.014 | 0 |
| today's (sharper from the first answer) | 0 | 7 of 75 |
| with the careless-answer fallback | -0.002 | 7 of 75 |
| a quarter of questions from the plain picker | -0.007 | 16 of 75 |
| half of questions from the plain picker | -0.004 | 10 of 75 |

## Why it failed

- **The score can't tell careless from careful.** By 8 answers per option it
  had tripped for 15% to 40% of honest respondents and for 35% to 57% of
  respondents answering half at random. A fallback on it swaps pickers
  nearly at random.
- **Most of the cost wasn't there.** Of the cells where today's picker
  trailed by more than 0.02 in either seed set, only two trailed in both,
  both at 50% random answers. In one of them the first seed set said -0.084
  and the second -0.031. Across all 75 cells today's picker is ahead of the
  plain one (by 0.021 and 0.014 on the two sets).

So nothing changes in the product. The fallback isn't wired in, and the
sweep script stays so anyone can rerun it.

## What we'd try next

Both pickers share one rating update that treats every answer as a true
preference, so a random answer tightens an option's uncertainty as much as a
careful one. An update with a lapse term would fix the cause for both. It
changes every stored rating, so it has to beat today's on the synthetic sweep
and on real people's published rankings before it ships.

Caveats: a synthetic respondent whose random answers are spread evenly over
the session, lists of 30 options or fewer, no real pairwise answers.

Tables and method: `ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`,
"A careless-answer fallback for the staged selector"; reproduce with
`npx tsx scripts/careless-fallback-sweep.ts --seeds 60 --seed-base 50000`.
