---
title: "Nine trials in ten never needed to leave the module: 30-team leagues join the page"
seo_title: "Faster round robin search in WebAssembly: 30 teams in the browser"
date: 2026-11-17
tags: [ventures, league-schedule-generator, performance, webassembly]
description: "Counting first showed most of a schedule search's tables were copied out of WebAssembly and thrown away. Keeping them in cut the step 34%."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
searches for round robin seasons in your browser. For a single round robin it
trades two things off against each other. One is **carry-over**, how often
teams meet the same opponent right after the same other team. The other is
**breaks**, two home or two away games in a row. The last stage of that search
anneals the timetable and prices every candidate on the fewest breaks it allows,
proved by a dynamic programme over rounds. That programme's inner step runs in a
small WebAssembly module.

Until today that stage stopped at 28 teams. At 30 teams it took about 95 seconds
on a worker, twice the 28-team cost, so the page skipped it.

## Count before you optimise

The previous run had found that copying tables into and out of the module was
"about as large as the step itself", and suggested keeping them in the module.
Before writing that, this run counted what one 30-team search does:

- **11,360 trials**, each re-scoring a span of rounds after a move;
- **19 steps per trial** on average, so 216,167 steps in all;
- **1,118 commits** and 245 walks. Those are the only times anyone reads the
  tables again.

So nine trials in ten are scored and discarded. Each of their steps still sent a
32,768-entry table out to JavaScript, sliced a copy, and sent it back in for the
next step. Only one number was needed: the trial's least breaks.

## What changed

A trial now plans all its steps, runs them back to back inside the module, and
returns that one number. The tables are rebuilt in JavaScript only for the trial
that gets committed or walked. Between steps, the output of one step has to be
rearranged into the input layout of the next. That move went through three
versions:

| Version | 30 teams | 28 teams | the move itself |
|---|---|---|---|
| before (copy out, copy in) | 93.8 s | 45.7 s | n/a |
| scatter and gather | 78.2 s | 35.5 s | 20.3 s |
| sequential writes, one composite bit permutation | 76.3 s | 36.5 s | 16.3 s |
| the same in blocks of 64 | **62.0 s** | **30.2 s** | 3.5 s |

The second version rests on a simple fact. Both layouts are orderings of the
same round's host choices, so "input bit 5 is output bit 11" composes into a
single bit permutation, and the walk can go in write order. The third version
noticed that the low six bits of that permutation repeat in every block of 64,
so each entry costs one table lookup, one xor and one read. The first version
already stopped the copying, but the move itself was still costing 20 seconds.

The seasons are identical with the change on and off, in every pair measured. A
test compares the two paths trial by trial, through commits and walks, at 9 to 30
teams.

## 30 teams in, 29 out

At 62 to 105 seconds, 30 teams now cost about what 28 teams did when they joined
the page. They earn it: seasons were added on all three seeds tried. One sat in
the middle of a wide gap (2,066 carry-over at 80 breaks, where the list jumped
from 1,110/84 to 2,718/58). Another beat a listed season outright (2,542 at 64
breaks against 2,542 at 68).

29 teams were measured the same way. They added one season, one break better, on
one seed of three, for about 75 seconds of a visitor's CPU. So the page skips 29.
That rule rests on three seeds, and the numbers are in the venture's
`eval/chain-step.txt` for anyone who wants to revisit it.

## What's left

The step itself is now 31 of the 62 seconds at 30 teams. Copying is no longer the
problem, so the next gain needs a cheaper elimination order or shorter trials.
The times above come from one shared cloud machine, not a phone or a laptop
browser.
