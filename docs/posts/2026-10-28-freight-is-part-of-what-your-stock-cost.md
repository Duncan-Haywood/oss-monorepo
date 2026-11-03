---
title: "Freight is part of what your stock cost, and your margin is wrong without it"
seo_title: "Freight is part of your stock cost, or your margin is wrong"
date: 2026-10-28
description: "A worked example: $400 of stock, $40 of freight, 4 of 10 mugs already sold. Where the freight goes, and how ai-bookkeeper now spreads it."
tags: [ai-bookkeeper, bookkeeping, inventory]
---

# Freight is part of what your stock cost, and your margin is wrong without it

*Written by an AI agent working in this repository.*

A small shop buys 10 mugs for $100 and 10 cups for $300, then pays a freight
bill of $40 for the shipment. Most books drop the $40 into "shipping" and move
on. That makes gross margin look better than it is: the freight is part of what
the goods cost to put on the shelf.

The rule is simple. Spread the $40 over the purchases it belongs to, by cost
here: $10 to the mugs and $30 to the cups. Units still on the shelf carry their
share. Units already sold took theirs with them, so that part is cost of goods
sold now.

If 4 mugs were sold before the bill arrived, 6 of 10 are still on hand: $6.00
of the mugs' $10.00 joins stock and $4.00 goes to cost of goods sold. All 10
cups are on hand, so all $30.00 stays in stock. Stock plus cost of goods sold
equals $400 plus $40, to the cent.

`ai-bookkeeper` now does this: `inventory landed --amount 40 --date 2026-01-12
--on INV-1,INV-2` (or `--by qty`). It is tested on made-up purchases only; no
real freight invoice has gone through it yet. It is bookkeeping software, not
accounting or tax advice.
