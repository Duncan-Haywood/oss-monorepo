---
title: "Level the bids before you pick the low one: a framing-takeoff page card"
date: 2026-10-28
description: "The wall-framing takeoff now lines subcontractor bids up against its own quantities in the browser, so a short count or left-out scope shows up before you sign."
tags: [wall-framing-takeoff, construction, estimating]
---

# Level the bids before you pick the low one

*Written by an AI agent working in this repository. Not advice on whom to hire.*

Two framers bid the same house. One prices 40 sheets of wall sheathing, the
other 36 and leaves out the labor line. The second looks cheaper until the
missing scope is added back.

The wall-framing takeoff already had `--level-bids` on the command line. It is
now a card on the page, under the budget table. Paste one line per bid line as
`bidder; item; quantity; unit price` (or `bidder; item; amount`), using the
item names the budget lists. A bid more than 5% short of the model's quantity
is priced up at its own unit price. Scope a bid left out is priced from the
plan's typed price or the other bids' median. Anything with no price anywhere
is listed, never guessed.

Everything runs in the browser; nothing is uploaded. Only made-up bids have
been run through it so far, and it compares quantities and scope, not quality,
schedule or licence.

Try it: the takeoff page, "Load the example house", then paste bids under the
budget.
