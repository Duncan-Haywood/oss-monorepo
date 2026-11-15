---
title: "Best and worst of four: a free MaxDiff mode, and why we didn't split it into pairs"
seo_title: "Free MaxDiff (best-worst scaling) in the browser, measured vs pairs"
date: 2026-11-15
description: "A free MaxDiff mode for Quick Pick: best and worst of four, scored exactly. Fewer taps than pairs in 11 of 12 simulated cases; the exception says more."
tags: [quick-pick-survey, maxdiff, best-worst-scaling, pairwise-comparison, simulation, product]
---

[Quick Pick's list ranker](https://marisstella.app/quick-pick-survey/rank.html)
has always asked one kind of question: which of these two? Since today it
can also ask the one market researchers use,
[best and worst of four](https://marisstella.app/quick-pick-survey/maxdiff-best-worst.html).
Each screen shows four options. You tap the one you like most, then the one
you like least. That is MaxDiff, or best-worst scaling, and survey platforms
usually sell it as a paid module. Here it is free and runs in your browser,
and nothing you type is uploaded.

## The shortcut we didn't take

The easy way to add MaxDiff to a pairwise engine is to turn each screen into
the pairs it implies. If A is best and D is worst among A, B, C and D, then A
beat B, C and D, and B and C both beat D. That is five wins from two taps,
and the existing refit can read them as five answers.

They are not five answers, though. All five come from the same two taps, so
counting them separately overstates what the person told you. The ranges come
out too narrow, and a stop rule that waits for 90% certainty fires early.

So each screen is scored with the sequential best-worst model instead. The
best is a choice among the four, with the chance of each option rising with
its score (a softmax). The worst is a choice of the lowest among the three
left. On a screen of two this reduces to exactly one Bradley-Terry pick, so
pairs and screens use one likelihood, one refit, one stop rule and one result
code. A test checks the point above directly: one screen moves the order
less, and leaves a wider range, than its five implied pairs would.

## Which four to show next

The pair ranker asks the pair whose answer is expected to tell it the most.
For screens, that becomes the expected information gain of the whole screen,
(1/2) log det(I + I_S Σ_S): the screen's expected Fisher information against
the current uncertainty about those four options. On a pair this is exactly
the old score with a log taken. It also gives less credit to a screen full of
options the model already ties together. The page builds the screen
greedily: it starts from the best pair and adds the option that raises the
gain most, until there are four.

## What it measured

We ran simulated people with known preferences through the page's own loop
twice, once with pairs and once with screens. A screen counts as two taps and
a pair as one.

| Options | Person | Pair picks | True order | Screens (taps) | True order |
|---|---|---:|---:|---:|---:|
| 8 | ordinary | 38 | 0.96 | 13 (26) | 0.96 |
| 15 | ordinary | 70 | 0.93 | 27 (54) | 0.94 |
| 30 | ordinary | 150 | 0.93 | 65 (130) | 0.95 |
| 15 | close calls | 109 | 0.86 | 47 (94) | 0.90 |
| 30 | close calls | 228 | 0.84 | 102 (204) | 0.87 |

"True order" is the Spearman correlation between the order shown at the stop
and the person's real order, averaged over 48 simulated people per row (12
at 30 options). These people answer the way the model assumes.

Across 12 cases (8, 15 and 30 options; ordinary and close-call people; one
set answering as the model assumes and one that doesn't), screens took fewer
taps than pairs in 11. The exception is worth showing. People with close
calls at 30 options, answering off-model, took 250 taps on screens against
202 on pairs. The pairs were not really winning, though. When they stopped on
their own they claimed 90% but the true order matched at only 0.68, while the
screens that stopped matched at 0.81. Pairs stopped sooner by claiming more
than they had. Screens overclaimed too, but by less (0.81 against the same
90% claim). Long lists of close calls are still the ranker's weak spot.

## What we don't know

A screen of four takes longer to read than a pair of two. Taps are a stand-in
for effort, not a measurement of it, and only real people can say how much
longer a screen takes. The page counts screens locally (`screen` events), and
a result code now records which kind of answer a person gave, so the first
real team codes will show it.

Method, every table and the raw rows:
[RANK-PAGE.md, "Best and worst of four"](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/RANK-PAGE.md).
