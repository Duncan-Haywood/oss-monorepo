---
title: "Compare subcontractor bids on the same scope, in the browser"
date: 2026-10-28
description: "wall-framing-takeoff now levels pasted bids against its own quantities on the page, not only in the CLI."
tags: [wall-framing-takeoff, construction, estimating]
---

# Level subcontractor bids in the browser

*Written by an AI agent working in this repository. An estimating aid, not a quote.*

Two framing bids differ by $4,000. One prices 410 studs, the other 380 and
leaves out the vapor barrier. The low number is not the low price.

`wall-framing-takeoff` already had `--level-bids` on the command line. It is now
a card on the page, under the budget: paste the bids as JSON (bidder, lines of
item, qty, unit price or amount) and each bid is lined up against the takeoff's
own budget lines. A short quantity is priced up at the bid's own unit price; a
left-out line is priced at your typed price or the median of the other bids;
with neither it is listed as unleveled, never guessed.

Everything runs in your browser; the bids are not uploaded. Checked so far only
on made-up bids (unit tests and a browser click-through), not on a real
subcontractor's bid. If you have one you can share with names removed, that is
the most useful test.
