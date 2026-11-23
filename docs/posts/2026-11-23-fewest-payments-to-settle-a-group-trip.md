---
title: "The fewest payments to settle a group trip, and how rarely it beats the shortcut"
seo_title: "Split group expenses: fewest payments to settle up, solved exactly"
date: 2026-11-23
tags: [group-expense-settle-up, ventures, algorithms, household]
description: "A free no-account expense splitter finds the true fewest payments by searching every subset. On simulated trips it beat the usual shortcut at most 3.6%."
---

After a group trip someone holds the receipts and the group chat wants one
short answer: who pays whom. The new
[Group Expense Settle Up](https://marisstella.app/group-expense-settle-up/)
page does that in the browser, with no app and no accounts. One line per cost
(`Dev 210 dinner / Ana:2, Ben:1, Cara:1, Dev:1, Eli:1`), any currency, shares,
exact amounts, percents, several payers and payments already made. One share
link carries the whole list.

## Cents that add up

Each foreign cost is converted once, into the group's main currency, and then
split in whole cents by largest remainder. When 42.48 is split five ways, it
comes to 8.496 each, which nobody can pay. Three people pay 8.50 and two pay
8.49, so the parts add back to the bill. Balances then sum to exactly zero,
which the tests check on random trips in all three settlement modes.

## The fewest payments is a subset problem

The usual shortcut is that the biggest debtor pays the biggest creditor, and
you repeat until everyone is square. It never needs more than one payment fewer
than the number of people. It can still miss a shorter answer. With balances
+3, +5, +4, +6, −6 and −12, the shortcut pays the 6 from the 12 first and needs
5 payments. But the +6 and −6 cancel on their own, so 4 is enough.

The general rule (Verhoeff, 2004): a set of people whose balances add to zero
can settle among themselves in one payment fewer than there are people in it.
So the fewest payments is the number of people with a balance minus the most
zero-sum groups the balances can be cut into. That is NP-hard in general.
For a trip it is small: the page runs a dynamic program over all 2^k subsets.
The best value for a set is the best over its one-smaller subsets, plus one if
the set itself sums to zero. This is exact for up to 20 people with a balance
and takes well under a second. A brute force over every set partition agrees
with it on 300 random groups in the tests.

## How often it matters: rarely

Before claiming the exact search is a selling point, we measured it on
simulated trips: 2,000 per row, 3 to 12 expenses each, 60% shared by everyone
and the rest by a random subset.

| Amounts | 4 people | 6 | 8 | 10 |
|---|---|---|---|---|
| Multiples of 5 | 0.0% | 0.0% | 1.3% | 3.6% |
| Random cents | 0.0% | 0.0% | 0.0% | 0.0% |

In these runs the exact answer was never more than one payment shorter. A
shortcut needs balances that cancel exactly. Round amounts and bigger groups
make that likelier. Amounts to the cent almost never do. So the honest pitch
is not "far fewer payments". It is "provably the fewest, it costs nothing, and
the page tells you when the shortcut would have taken more". These trips are
simulated, not real ones. The page keeps a local count of how often the exact
answer beat the shortcut, so a real reading is possible later.

The page has a third mode for groups who would rather not send money to a
friend they never shared a cost with: everyone pays back only the people who
covered them, netted per pair. For the example trip that is 10 payments
instead of 4.

Source, tests and the simulation: `ventures/group-expense-settle-up/`
(`eval/greedy-gap.mjs`). MIT licensed.
