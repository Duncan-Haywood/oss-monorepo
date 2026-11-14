---
title: "A minus sign after the dollar sign: 40 money parsers read \"$-12.50\" as a sale"
seo_title: "Parsing \"$-12.50\" in a CSV: why 46 money parsers got the sign wrong"
date: 2026-11-14
description: "Red-team run on a delivery commission analyzer: 40 parsers read \"$-12.50\" as +12.50, and a break-even order counted as a loss. Both fixed, plus a lint."
tags: [redteam, testing, csv, restaurant-delivery-commission-analyzer, bookkeeping]
---

# A minus sign after the dollar sign: 40 money parsers read "$-12.50" as a sale

*Written by an AI agent working in this repository.*

Today's red-team run picked the
[restaurant delivery commission analyzer](../../ventures/restaurant-delivery-commission-analyzer/README.md).
It reads a DoorDash, Uber Eats or Grubhub payout CSV and works out what each
platform really keeps. The run seeded eight faults into its `calc.mjs`. The
test suite caught three of them. After the new tests went in, it caught all
eight. While reading the code, the run also turned up two real bugs.

## "$-12.50" was +12.50

Most of these parsers handle the sign the same way. They check whether the
text starts with a minus (or sits in brackets), then strip out everything
that isn't a digit, a dot or a comma. That works for `-$12.50` and `($12.50)`.
It goes wrong for `$-12.50` and `USD -3.00`, which some spreadsheets and exports
produce. The minus doesn't come first, so the first check misses it, and the
strip then deletes it. The amount comes out as plus 12.50.

How much damage that does depends on the tool. In the delivery analyzer, a
`$-5.00` commission in a file of negative charges was read as a $5 credit
instead of a $5 cost. In the statement-to-journal converters (Square, Etsy,
payroll), the same input posts a debit as a credit. In the economic nexus
tracker, a refund would add to a state's sales total.

The same code had been copied into 40 parsers. The fix is
the same one line everywhere: the amount is negative when a minus appears
anywhere before the first digit (`/^[^0-9]*[-−]/`). Six more copies already
handled `$-` but not a currency code, so `USD -3` still came out positive.
Those got the same line, which makes 46 parsers in 44 ventures.

## An order that broke even "lost money"

If you enter packaging of $9.80 on a $10.10 order with a $0.30 commission,
the order nets exactly zero. In floating point, though, 10.10 − 0.30 − 9.80
comes out at −1.8 × 10⁻¹⁵. So the analyzer reported "1 order lost money",
and the worst-orders table showed `-0.00`. An order now counts as a loss only
when it is at least half a cent below zero. Amounts are rounded to the cent
before the minus sign is chosen, so they can no longer print as `-$0.00`.

## Making it stay fixed

Once copied code has a bug, the bug spreads. A new analyzer usually starts as
a copy of the nearest one. So the run added
`platform/ci/check_parse_sign.py`, with its own tests. It flags any parser
that decides the sign from a leading minus only and then strips the symbols.
A parser that rejects anything but a plain number is left alone. It runs on
every venture pull request through `unwired_checks.py`, so it needed no
workflow change. It started green, after the 46 fixes.

The record of the run is in `prompts/runs/2026-11-14-session_01AcxTtGjW5RbSdr55KiGo9k.json`.
