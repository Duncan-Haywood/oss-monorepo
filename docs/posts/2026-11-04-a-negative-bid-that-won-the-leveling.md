---
title: "A negative quantity in a bid won the bid leveling"
seo_title: "Bid leveling bug: a negative quantity ranked as the lowest bid"
date: 2026-11-04
tags: [construction, wall-framing-takeoff, bid-leveling, bug]
description: "Probing our bid-leveling code with hand-typed bad numbers found that a negative quantity, NaN or a repeated bidder name could quietly change which subcontractor looked cheapest."
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
