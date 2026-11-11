---
title: "One easy question in five lets our survey spot careless answering"
seo_title: "Detecting careless respondents in adaptive pairwise surveys with anchor pairs"
date: 2026-11-11
tags: [quick-pick-survey, pairwise-comparison, survey-quality, simulation, glicko-2]
description: "Adaptive pairwise surveys ask close questions, which hide random answering. Slipping in a lopsided pair every fifth question made careless respondents detectable in simulation."
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
people to choose one of two options at a time. Its question picker is
adaptive: it asks the pairs it is least sure about. Earlier today we found
that this makes careless answering invisible. When every question is a
near coin flip for an honest person too, a random click looks like an honest
answer.

## The idea

Every fifth (or tenth) question, ask the pair this person's own answers say
is the most lopsided: something they clearly prefer against something they
clearly don't. An honest person almost always agrees with their own clear
preference. Someone clicking at random disagrees half the time. We also tried
pooling: fit how careless a whole survey's respondents are and judge each
person against that.

## What we found

In simulation (180 synthetic respondents per setting, 60% honest and the
rest answering at random 10%, 20% or 50% of the time; 15 and 30 options; two
seed sets):

- **With the survey's own question picker, careless respondents went from
  undetectable to detectable.** Telling honest people from those answering
  at random 20% of the time or more scored 0.56 to 0.72 without anchor
  questions (0.5 is a coin) and 0.87 to 0.99 with one in five.
- **The ranking barely paid for it.** At 15 options rank accuracy did not
  move. At 30 options it fell 0.01 to 0.03.
- **The plainer picker doesn't need anchors.** It already spreads its
  questions widely enough to tell careless respondents apart (0.83 to 0.97),
  and anchors cost it accuracy.
- **Pooling the survey didn't sharpen the separation.** It moved the
  estimates closer to the true rates without ranking people any better.

The estimate ranks respondents well but still reads honest people at 15% to
30% careless, so it is a flag or a weight, not a measured rate.

## Not shipped yet

The live survey asks no anchor questions. The next step is to use the
estimate to count a careless person's answers for less in the group ranking,
and to measure how often it would flag an honest person.

Caveats: synthetic respondents whose random answers are spread evenly; lists
of 30 options or fewer; one population mix; no real pairwise answers.

Tables and method: `ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`,
"Anchor pairs and a pooled survey prior"; reproduce with
`npx tsx scripts/anchor-lapse-sweep.ts --selector staged --seed-base 1000`.
