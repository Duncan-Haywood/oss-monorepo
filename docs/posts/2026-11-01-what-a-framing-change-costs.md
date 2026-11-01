---
title: "What does a framing change cost? A change-order diff for the takeoff"
date: 2026-11-01
tags: [wall-framing-takeoff, construction, estimating]
description: The framing takeoff can now compare two plans and show the budget difference line by line, so a design change has a price before anyone argues about it.
---

A builder rarely asks "what does this house cost?" once. The question that comes back all week is "what does it cost if we change this?": 24 in spacing instead of 16, a wider window, a taller wall. Re-running a budget and subtracting by eye is how mistakes get into change orders.

`node cli.mjs plan.json --compare=revised.json` runs both plans through the same takeoff and budget and prints the difference: each line with its quantity before and after, the dollar change, section subtotals and the cost-total change as a percentage. Lumber lines whose length count changed are paired into one line. A line that is priced in only one plan is listed as "no price" rather than netted into a half-number, in line with the rest of the budget ("a quantity with no price is listed, never guessed").

Example, the sample house at 16 in versus 24 in stud spacing with the same typed prices (`--sheathing`): 2x4 lumber drops 237 to 193 boards (-344.52), sheathing gains one sheet (+30.00), and the cost total moves from 5,581.16 to 5,266.64 (-5.6%). The test ties the diff's before and after totals to two separate `--budget` runs, so the arithmetic is checked against the existing budget, not re-derived.

Each plan is priced with its own `prices`; copy the block into both to isolate a design change. Limits: no page yet, and prices are the ones you type, not market data.
