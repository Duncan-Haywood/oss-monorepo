---
title: "A stale-price test that works on Apple and backfires on Microsoft"
date: 2026-11-19
tags: [changepoint-detection, data-quality, statistics, market-data]
description: "Pre-registered on five fresh stocks: the catch-up test caught 28 of 33 carried stretches on high-priced stocks but read penny-spread prints as stale."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a test for a *stale* feed: a price
that someone carried forward instead of reading again. The idea is simple. When a figure is carried, the move that
finally ends a run of repeats has to catch up on everything it missed, so it grows with the length of the run. When
a price merely sits at a quote, the next move does not care how long it sat. The test is a rank correlation between
run length and the size of the move that ends it, with no model fitted.

[This morning's round](2026-11-19-changepoint-catch-up-growth-test.md) found it left real trade prints alone but
missed most short stretches of a real carried feed. Read afterwards, it caught stretches holding about a thousand
moves. That was one stock, and the number was chosen by looking at it, so it needed fresh data.

## Five stocks it had never seen

LOBSTER publishes free sample files of a full Nasdaq trading day (21 June 2012) for Apple, Amazon, Google, Intel
and Microsoft. From the executions we built the print series (nothing carried: the control) and the last-trade
price every 0.5, 1, 2 and 5 seconds (where the print times say exactly which samples were carried). We wrote the
bars and the code down and committed them before the first run, then cut every series into stretches holding
exactly 1,000 moves.

The power bar asked for 80% of carried stretches caught. It got **29 of 38 (76%)**: a fail, so nothing ships. The
size bars passed: 2 of 25 print stretches were wrongly called stale at 1,000 moves, and under 10% at every length.

## Where it missed

| stock | price | median move | carried caught (1,000 moves) | prints called stale | whole day's prints |
|---|---|---|---|---|---|
| Apple | $583 | 2 cents | 16 of 19 | 0 of 15 | z = -5.1 |
| Amazon | $222 | 2 cents | 7 of 7 | 0 of 4 | z = -1.6 |
| Google | $568 | 4 cents | 5 of 7 | 0 of 4 | z = -2.0 |
| Microsoft | $30 | 1 cent | 1 of 5 | 2 of 2 | z = +6.7 |
| Intel | $27 | half a cent | 0 of 4 | 2 of 2 | z = +8.9 |

On the three high-priced stocks the length rule held: 28 of 33 carried stretches caught at 1,000 moves, every one
of 14 at 2,000, and no print stretch called stale. On the two cheap stocks it ran backwards.

The reason is the spread. A $30 stock trades in a one-cent spread, and hidden orders fill at the midpoint, so prints
hop between bid, ask and half-cent midpoints. A run of prints at one price is a queue being worked at one side, and
the move that ends it is often the jump across the spread: bigger than the half-cent hops in between. So the prints
"grow after runs" with nothing carried. And a carried run hides almost nothing, because however long the price was
carried, it cannot have wandered far outside a one-cent spread.

The detector's gate was supposed to keep such stocks out: it only runs this test when moves are more than 1.5 ticks.
But it infers the tick from the smallest step in the data, and the midpoint fills make that half a cent, so a
one-cent stock looks like a two-tick one. Microsoft walked through the gate.

## What changes

Nothing in the product: the test stays an exported function with no sentence in the report. The next round, on
fresh data again, gates on the quoted tick (or on the share of odd half-tick moves) rather than the smallest step,
and is judged at 2,000 moves. The full tables are in the README section "The catch-up test by stretch length, on
five fresh stocks" and `eval/stale-growth-lobster.out.txt`.
