---
title: "A $0 crew cannot lose money by the hour: red-teaming the moving bid calculator"
seo_title: "Moving company hourly rate and minimum hours: edge cases we tested"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, movers, pricing]
description: "20 faults seeded into the moving bid calculator, 16 caught. Four gaps closed, one wrong sentence on a blank form fixed, and a new check over 47 copies of the same save code."
---

Today's red-team run aimed at the
[moving bid calculator](https://marisstella.app/moving-bid-calculator/), which
prices a local move from the inventory, stairs, carry distance and the crew's
real costs, then turns the price into an hourly rate with a break-even
minimum. Its pricing code changed yesterday, so this was a good moment to test
how well its tests protect it.

## Seeded faults

We planted 20 small faults, one at a time: a `+` turned into a `-`, a `0`
into a `1`, an `||` into an `&&`. Then we ran the calculator's own tests on
each one. 16 of the 20 made a test fail. These four did not:

| Fault | What a mover would have seen |
|---|---|
| Garage preset 400 cu ft became 401 | A slightly different starting volume on every garage line, with nothing to say it had changed |
| Margin hours computed only when the rate beats costs by more than $1/h | A rate 50 cents an hour over costs showed "never" instead of how many hours it takes to earn the margin |
| Saving a bid without a storage key went ahead anyway | The bid was saved under the name `undefined`, which any other page on the site using the same code would share and overwrite |
| Clearing a saved bid said it had failed | The page told the visitor the clear did not work when it had |

Each one now has a test that fails when the fault is put back. All 20 are
caught after the fix.

## The real bug

Reading the code as an attacker turned up one wrong sentence. Leave every
cost at zero, as on a form someone has not filled in yet, and the job prices
at $0. The hourly section then said:

> At $0.00/h the rate does not cover the crew's loaded labor of $0.00/h, so
> every extra hour loses more and no minimum fixes it.

No hour loses anything when the crew costs nothing. The code's own comment
said this warning is never shown for the suggested rate. The rounding helper
also turned zero into negative zero (`-0`), so the warning saw a rate that
was not above $0 labor. The warning now needs a crew that costs something per
hour, and the rounding gives back a plain zero. It is a small bug, but a
first-time visitor's first screen should not contradict itself.

## One check for 47 copies

The save and clear code is not unique to this calculator: 47 tools in the
portfolio carry a copy of the same `share.mjs`. A fix in one copy leaves the
other 46 as they were. So the guard is a new check,
`platform/ci/check_share_storage_contract.py`. It loads every copy and runs
it against a fake browser storage. Saving has to report success and read
back. A spec with no key must write nothing. Clearing has to say it worked.
Blocked storage must never throw. All 47 copies pass today, the check takes
under a second, and it runs on every pull request that touches a venture.

Results are estimates from the numbers you type, not financial advice.
