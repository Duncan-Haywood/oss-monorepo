---
title: "No formula sizes the warm solve: a time gate replaced by a reserve"
seo_title: "Warm-started LP timing: why a size-based time gate failed"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, linear-programming, operations-research]
description: "A warm-started LP in Shift Roster Builder took 29 ms to 14.5 s on similar weeks, so its size-based time gate went; a fixed reserve proves two more weeks."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) proves how
close a big week's roster is to the best possible with a "pay floor": a linear
program that bounds what any roster must cost. Since 14 November that LP starts
from the solution of a smaller one (the open-hours LP) solved just before it,
a warm start, and on some weeks that cut the work from 1,860 simplex pivots to
107.

The time gate that decides whether the pay floor runs inside the 20-second
budget was still sized for the old cold solve: about 4 s x (copies / 245)^4.5.
The open item said "a gate sized for the warm solve". So the first step was
to measure what a warm-sized gate would have to predict.

## What the warm solve's time looks like

On 78 generated weeks of 148 to 326 shift copies
([`eval/warm-gate.out.jsonl`](../../ventures/shift-roster-builder/eval/warm-gate.out.jsonl)),
the warm solve took anywhere from 29 ms to 14.5 s. Size barely tells you which:
weeks of 215 to 255 copies had a median of 2.8 s but ran from 0.1 to 5.6 s.
The open-hours LP's own time, measured on the same machine just before, did no
better: the ratio of the two ran from 0.04 to 6. What decides the time is how
far the priced optimum sits from the open-hours one, and nothing cheap measures
that before solving.

The old formula got it wrong both ways. On 25 of the 78 weeks the warm solve
took longer than the formula expected, and there the old gate let it run with
no deadline at all, past the budget. On most of the rest it was far quicker,
and there the gate skipped it or cut it off at the budget's end.

## What replaced it

No formula, then. With the warm start available, the pay floor now always runs
warm and is stopped at the time left plus a fixed reserve of its own (1.5 s by
default), the same way the day-by-day search after it already gets 2 s of its
own. Built at the default budget on 14 big weeks, the old engine against the new
([`eval/warm-gate-e2e.out.jsonl`](../../ventures/shift-roster-builder/eval/warm-gate-e2e.out.jsonl)):

- on a 70-person week, the pay floor used to run out of time after 6.9 s; now it
  finishes in 7.7 s, and the proven gap falls from $23,272 to **$16.90** (the
  roster also got $3 cheaper, because the LP's solution guides the search after it);
- on a 60-person week, it now finishes in 3.0 s, so the pay is bounded to within
  $10 and the gap left is one open hour;
- on two weeks it tried, ran out of time anyway and added 1.6 to 1.8 s with the
  same roster;
- on the other ten, the same roster and gap.

These are single runs on one cloud machine and generated weeks, and 1.5 s was not tuned.
That is the next question: whether a longer reserve finishes more weeks than it costs.
