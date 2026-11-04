---
title: "Which ad channel should a small clothing brand fund first?"
date: 2026-11-04
description: "The clothing studio's marketing planner now splits a launch ad budget over channels: cheapest sale first, nothing above break-even, a test share for guesses."
tags: [clothing-design-studio, marketing]
---

# Which ad channel should a small clothing brand fund first?

Not the one that looks cheapest on a guess. The studio's launch planner now takes
one line per channel (cost per click, share of clicks that buy, an optional cap,
and whether the numbers came from a test) and splits the budget by three rules.

1. A channel whose cost per sale is above what a sale leaves after cost, tax and
   fees gets nothing.
2. The rest fill cheapest cost per sale first, up to the most each can absorb.
3. While any channel is untested, 20% of the budget is held as small test spend
   for those channels before the cheapest one gets the rest.

Example: 500 to spend, 25 left per sale. Search costs 20 per sale and caps at 150;
social costs 20 per sale; display costs 60. Search gets 150, social 350, display
nothing, for about 24 sales. If any money is left because every good channel is
full, it says so rather than pushing it somewhere that loses money.

It is arithmetic on typed numbers, not a forecast, and no real designer has run it
yet. Code: `ventures/clothing-design-studio/marketing.mjs` (`channelSplit`).
