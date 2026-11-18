---
title: "When every answer is \"much better\": reading the picks without the grades"
seo_title: "Graded pairwise comparisons: when a stopping rule should ignore grades"
date: 2026-11-15
description: "People who answer \"much better\" to most questions made our decision page overconfident. A better threshold estimate did not fix it; ignoring their grades did."
tags: [quick-pick-survey, decision-matrix, pairwise-comparison, stopping-rules, simulation, product]
---

[Weigh criteria by picking pairs](https://marisstella.app/quick-pick-survey/decide.html)
is a free decision matrix where you type no numbers. It asks "which matters
more?" and "on rent alone, which flat is better?", and each answer can be
"a bit better" or "much better". It stops once there is under a 10% chance
that any option beats the current leader by more than a practical tie.

That 10% is a promise, and we check it on simulated people whose true
preferences we know. The promise held for people who use "much" sparingly or
inconsistently. It did not hold for someone who says "much" to 80% of
questions: of the runs that stopped on their own, only 86% were really within
a practical tie of the true best.

## Why the guard missed

The page already had a second check. Before it stops, it refits the answers
at a cautious reading in which "much" counts for little, at the lower of 1 and
the person's own estimated threshold. The trouble was the estimate. On
simulated people it read everyone about a quarter too high: a threshold of
0.5 came out at 0.7 to 0.8, a threshold of 1 at 1.2 to 1.3. So the cautious
reading was not cautious enough for exactly the people it was meant for.

## A better threshold did not help

The obvious fix was to correct the estimate. We scaled it down by 0.75 and by
0.6, which put the second check close to the person's true threshold. On 300
simulated people per row, over the long "keep going until it is settled" run,
the promise moved from 0.858 to 0.872 and 0.878. Close, but not 0.9.

For someone who says "much" almost every time, the grade carries very little
information. A model that reads the grades still leans on them, and that is
enough to tip some lucky streaks into a confident "settled".

## Ignoring the grades did

Read without grades, the second check is the plain pick model, which kept its
own promise (0.90) before grades existed. Doing that for everyone would cost
everyone extra questions. So the page now does it only when the person's
estimated threshold is below 1.25:

| person ("much" share) | before | now | picks over a long run |
|---|---|---|---|
| 80% "much" | 193/225 (0.858) | 138/152 (0.908) | +47% |
| 63% "much" | 214/235 (0.911) | 176/188 (0.936) | +32% |
| 36%, 19%, or inconsistent | 0.959 to 0.965 | identical, run for run | 0 |

Wrongly "settled" results for the 80% person fell from 32 to 14 in 300.
The true best was named about as often (221 against 215). The change is in
how a miss is reported: as "it is still close at the top" rather than
"settled".

The cost is real. People who say "much" freely answer more questions before
the page calls it, but only on the opt-in long run, and the page's 10% promise
is the thing worth keeping. A switch at 1 instead of 1.25 costs the 63%
person only 6% more questions but leaves the 80% person at 0.887, so we took
the honest one.

## What we still do not know

All of this is simulated. Whether real people say "much" for most picks, and
whether they keep going past the checkpoint, is something only real use will
tell. The page counts the "keep going" button locally and anonymously, and the
full tables are in the project's
[DECIDE-PAGE.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/DECIDE-PAGE.md).

*A free tool, not professional advice: the page helps you see your own
trade-offs and is not a basis on its own for a hiring, financial, medical or
relationship decision.*
