---
title: "Your team, or people like your team? Two rank ranges for one combined ranking"
seo_title: "Combining pairwise rankings from a team: group vs population rank ranges"
date: 2026-11-14
description: "A combined team ranking needs two uncertainty ranges: one for these people, one for the group they stand for. Read the first as the second and 90% ranges hold 74%."
tags: [quick-pick-survey, pairwise-comparison, bradley-terry, random-effects, statistics, product]
---

The free [list ranker](https://marisstella.app/quick-pick-survey/rank.html)
lets a team rank a list by each answering "this or that?" and pasting each
other's result codes. Until today the combined table gave an order, who put
each option first, and each option's best and worst place across people. It
said nothing about how sure the order was.

Adding a range sounds simple. It isn't, because "how sure" depends on the
question you are asking.

## Two questions, two answers

**"Where does this option sit for us?"** Four people choosing a team offsite
want the order of *their own* average likes. If one of them hates the
mountains, that is part of the answer, not noise. The only uncertainty is that
each person answered a limited number of pairs. Averaging the four people's
fitted scores gives that directly: the mean of their estimates, with their
uncertainties summed and divided by sixteen.

**"Where would it sit for people like us?"** Five customer interviews stand
for every customer. Now disagreement *is* noise: a sixth customer could tip
the order. The range has to widen when people disagree. That is a
random-effects model: each person's scores are the wider group's plus their
own deviation, with a spread (tau) fitted to the codes.

The table now shows both, as "Group" and "Wider".

## Why both, measured

We simulated teams of 3, 5 and 10 people drawn from a wider group, with
personal deviations from none (tau 0) to strong (tau 2 logits). Each person
answered the page's own adaptive questions. Then we checked how often each
option's true rank fell inside its 90% range (40 teams per cell; every cell
is in `docs/team-ranges-2026-11-14.jsonl`):

- The Group range, checked against the members' own average: 95-100% in
  every cell.
- The *same* range read as if it described the wider group: 74-89% when
  people differ strongly. At worst, a 90% claim that holds three times in four.
- The Wider range, checked against the wider group: 90-100% in every cell.
  At 15 options and 3 strongly different people it is 9 places wide, against
  6.3 for the Group range. That width is the honest answer: three people who
  disagree tell you little about a fourth.

## A bug worth describing

The first version fitted tau by marginal likelihood, approximating each
person's answers as a Gaussian around their own fitted scores. With 10
simulated people who truly differed by 2 logits it estimated 0.03, and the
estimate got *smaller* as people were added.

The same formula on Gaussian pseudo-data recovered tau, so the algebra was
fine; the expansion point was wrong. A person's own fit pulls every score
toward zero, which makes every close pair look closer to 50/50 and so each
person look more certain than they are. Re-expanding each person's answers
around their scores given the current group estimate (an iterated Laplace
fit) fixed the direction. Tau is still read low (a true 2 reads 0.6 to 0.9,
the textbook bias of Laplace for variance components on yes/no data), so the
page describes it in words rather than as a number. The coverage numbers
above are with the fix.

## Try it

Paste a list into the
[ranker](https://marisstella.app/quick-pick-survey/rank.html), send the link
to two or three people, paste their codes back, and read the Group column if
the decision is yours to make together, the Wider one if they stand for
someone else. Everything runs in your browser; nothing is uploaded. The
method and every number are in the venture's
[docs/RANK-PAGE.md](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/quick-pick-survey/docs/RANK-PAGE.md),
"Team ranges".

A ranking from a few dozen picks is a statistical estimate, not advice.
