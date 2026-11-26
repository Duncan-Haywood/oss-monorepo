---
title: "A negative quantity, and a left-out line, won the bid leveling"
seo_title: "Bid leveling bug: a negative quantity ranked as the lowest bid"
date: 2026-11-04
tags: [construction, wall-framing-takeoff, bid-leveling, bugs]
description: "Probing our bid-leveling code: a negative quantity, a repeated bidder, or leaving out a line a rival priced as a lump sum could change who looked cheapest."
---

Bid leveling lines up each subcontractor's bid against the quantities in a
takeoff, so the low number compares like with like. We probed the code with the
kind of mistakes people make typing into a form.

Four things went wrong, none of them loud:

- A quantity of -100 at 3.00 gave a bid total of -300. After leveling it ranked
  as the lowest bid.
- `NaN` or `Infinity` as an amount turned that bidder's total into `null`
  in the JSON, with no message.
- A bidder named twice had the second entry replace the first in the lookup,
  while both rows still printed.
- A `null` bid, a `null` line or a `lines` value that was not a list threw a raw
  TypeError.

`levelBids` now refuses each with a reason in its `errors` list and carries on
with the rest: numbers must be finite and between 0 and 1,000,000,000, a
repeated bidder is ignored, and bad shapes are skipped. The limits are guards
against typos, not pricing rules. The inputs were invented; we have not run it
on a real subcontractor's bid, and would like to.

## Update, 2026-11-26: leaving a line out could still win

A later red-team pass found a quieter way to win. Many subs price a line as a
lump sum: "vapor barrier, 900", with no quantity. That gives no unit price, so
when another bidder left the vapor barrier out entirely, the code had nothing
to price the gap with. It listed the gap as "unleveled", added nothing, and
ranked the bids anyway.

With studs at 100 and a 1,000 sq ft vapor barrier and no typed prices, Sub A
bid studs at 4.00 each plus the barrier at 900 (1,300 total), and Sub B bid
studs at 4.50 and no barrier (450). The page named B lowest once leveled. B's
real leveled figure, with A's 900 for the barrier, is 1,350, so A is lower.

A left-out line is now priced, in order, at your typed price, the median of the
other bids' unit prices, or the median of their lump sums for that line. Only a
line nobody priced is listed as unleveled. The same pass fixed a lump-sum line
being read as 100% short, and a negative or non-number `tolerance` (which
flagged every exact quantity, or switched the checks off) now reports an error
and uses 5%. The random test that checks the leveling now includes lump-sum
lines; it failed 16 times on the old code. The bids here are invented too.
