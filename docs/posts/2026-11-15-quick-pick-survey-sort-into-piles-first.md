---
title: "Sort first, then compare: when a rough three-pile sort saves pairwise questions"
seo_title: "Does a rough sort before pairwise comparison save questions?"
date: 2026-11-15
description: "A one-tap-per-option sort before pairwise picks cut 20 options from 93 actions to 64 for careful sorters; careless ones paid 120. Two bugs fixed on the way."
tags: [quick-pick-survey, pairwise-comparison, ranking, prioritisation, simulation, product]
---

[Quick Pick's list ranker](https://marisstella.app/quick-pick-survey/rank.html)
orders a list by asking "which of these two?" until the order is settled. It
works, but long lists take many questions: by our own measurement an
ordinary answerer needs about 93 picks for 20 options and over 200 for 40.

People who prioritise by hand rarely start with pairs. They do a rough pass
first: must / should / could, high / medium / low. So the ranker now offers
that pass. Before the pairs, each option shows on its own and you tap "near
the top", "in the middle" or "near the bottom". It is optional, on lists of 8
or more.

## How a pile enters the model

A pile is weaker evidence than a pick, and you can put an option in the wrong
one. So the piles do not become answers. They become each option's starting
estimate. The model is the one the ranker already uses (each option has a
hidden score; picks are noisy comparisons of scores), plus one assumption: you
sort by your own slightly noisy view of each option, cut into piles the sizes
you made them. That gives each pile a mean and a spread for the options in it,
and the picks take it from there. Team codes now carry the piles, and the team
combine reads them the same way.

## Two things went wrong first

**The stop rule fought the piles.** Since last week the ranker double-checks
before it stops: it re-reads your answers at a prior fitted to how strongly
you seem to feel, so a run of coin-flip answers is not called settled. After
a sort, though, most picks are between options in the same pile, and those
*are* close calls. Read on their own they said "this person barely cares",
and the check never let go: in a first test, half the runs with perfect piles
hit the question cap. The check now reads the piles and the picks together,
and also estimates how carefully you sorted, so a careless sort counts for
less.

**The piles confirmed themselves.** If the model believes an option is
near the top, it sees no point comparing it with the middle pile, so a
misplaced option never gets tested. On simulated people with close-call
preferences, the ranker claimed a 0.90-settled order that was really 0.79
(Spearman correlation with their true order). The fix is one line of
behaviour: every fourth pair is chosen as if there were no piles. The same
people's orders came out at 0.86, as honest as with no sort at all, for 122
picks instead of 99.

## What it saves

We ran the page's own code on simulated people: the same true preferences and
the same coin flips for every pick, with and without a sort first. "Actions"
counts a tap like a pick, which is generous to the no-sort side, since a tap
reads one option and a pick two.

| 20 options, ordinary answerer | actions | order (Spearman) |
|---|---|---|
| no sort | 93 | 0.933 |
| careful sort (never misplaces) | 64 | 0.929 |
| ordinary sort | 87 | 0.937 |
| careless sort (3x the misplacement) | 120 | 0.933 |

At 12 options an ordinary sort took 40 actions against 59. At 30 options it
took 112 against 123, and a careful one 99. People whose options are close
calls gain the most from a careful sort (86 actions against 135, a better
order, almost no runs stuck at the cap). A careless sort costs them 168.

So the sort is worth it when you can roughly tell top from bottom, and the
page says so: if you can't, skip it. The ranker cannot tell which kind of
sorter you are in advance. It does notice when your picks keep contradicting
your piles, and leans on the picks.

## What we don't know

These are simulated people with evenly spread preferences. Whether real
people sort carefully, ordinarily or carelessly is the whole question, and
nobody has used the step yet. The page counts sorts started, finished and
skipped (locally, nothing about what you ranked), and since result codes now
carry the piles, the first real team codes will show how often picks
disagree with them. Lists of 40 and 60 options were not measured.

Method, tables and the rows behind them:
[docs/RANK-PAGE.md, "Sort into piles first"](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/RANK-PAGE.md).
Everything runs in your browser; nothing is uploaded. A ranking from a
limited number of picks is an estimate, not a fact.
