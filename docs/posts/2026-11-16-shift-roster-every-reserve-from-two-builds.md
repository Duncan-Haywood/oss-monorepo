---
title: "Every time reserve at once, from two builds a week"
seo_title: "Shift scheduling: sizing an LP's time reserve from two builds a week"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, linear-programming, operations-research]
description: "Shift Roster Builder's pay bound now gets 6 s past the budget instead of 1.5 s: it finishes 19 of 19 tries on 48 fresh weeks for 0.25 s more on average."
---

On big weeks (60-70 people, 168-196 shifts) the [Shift Roster Builder](../../ventures/shift-roster-builder/)
works to a 20-second budget. Near the end it solves a linear program, the "pay
floor", that proves how close the roster's wage bill is to the cheapest one
possible. When it finishes, the page can say "within $7 of the best". When it
runs out of time, all it can say is "within $24,000". Since this morning that LP
gets a reserve past the budget, 1.5 s, picked without measuring.

## One measurement instead of a race

Earlier runs sized reserves by racing two values on the same seeds. Here the LP's
outcome depends on a single comparison: it finishes if its solve time T fits
within the time left L plus the reserve R. So each of 48 fresh weeks was built
twice. One build gave the LP all the time it wanted, which recorded T and L. The
other turned it off, which is exactly what a timed-out try leaves behind. From
that pair, every R can be scored without another build. The rule went into
[`eval/pay-floor-reserve-prereg.md`](../../ventures/shift-roster-builder/eval/pay-floor-reserve-prereg.md)
before the run.

| reserve | tries finished (of 19) | mean build | slowest build |
|---|---|---|---|
| 1.5 s (old) | 13 | 21.26 s | 24.1 s |
| 3 s | 15 | 21.42 s | 25.6 s |
| 4 s | 18 | 21.49 s | 26.3 s |
| **6 s (new)** | **19** | **21.51 s** | **27.5 s** |
| 8 s | 19 | 21.51 s | 27.5 s |

At 6 s every try finishes, and the average build takes a quarter of a second
longer. The real cost is the tail: the slowest build went from 24 to 27.5 s.

## Checked with the change itself

The six weeks the new default affects were rebuilt with it. Five finished, as
predicted. On the 70-person weeks the gaps fell from $23,613 to $6.98 and from
$24,278 to $15.52. One week covered an extra hour of shifts, and pay fell by up
to $17.75. On the sixth week the LP never ran: that build's earlier stages had
already used up the budget, and the builder skips the LP then, whatever the
reserve. That case is the next thing to measure.

The default is now 30% of the budget, capped at 6 s. That is 6 s at the 20 s
default, and a caller who sets a 3 s budget waits at most 0.9 s more, not 6.
These are generated weeks on one cloud machine. Every number is in the README,
under "The pay floor's reserve, sized from the full solve".
