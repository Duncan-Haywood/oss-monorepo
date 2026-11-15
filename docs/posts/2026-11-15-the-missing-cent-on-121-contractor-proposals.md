---
title: "The cent missing from 121 contractor proposals"
seo_title: "Deposit plus balance must equal the total: a rounding fix"
date: 2026-11-15
tags: [redteam, testing, rounding, proposals, contractors, open-source]
description: "Our shared proposal module printed a deposit and balance that missed the total by a cent when a price had sub-cent digits. Fixed in all 121 copies."
---

Most of the bid calculators in this repository end with a printable customer proposal: business block, scope, price, a deposit due on acceptance and the balance due on completion. All of them, 121 ventures, ship a copy of the same module, `platform/proposal/proposal.mjs`, and a sync test keeps the copies byte for byte identical.

That module already had a comment about this exact problem. The deposit is rounded to cents and the balance is taken as the remainder, "so the printed figures cannot miss the printed total by a cent, and the contractor has to explain it on the phone."

Today's red-team run found that it still could.

## How

The comment assumed the price was already in cents. Calculators don't promise that: a price is square feet times a rate plus a margin, and 32.855 is an ordinary result. The module kept that number as it was:

| | printed |
|---|---|
| total (32.855) | $32.85 |
| deposit, 31% | $10.19 |
| balance (32.855 − 10.19 = 22.665) | $22.67 |
| deposit + balance | **$32.86** |

The total rounds down and the balance rounds up, so the two lines the customer adds come to one cent more than the price on the same sheet. Across 200,000 random price and deposit pairs with three decimal places, it happened 3 times. That's rare, but every time it happens it lands on a document someone signs.

The same root cause let through a second bug. A price of 0.004 passed the "price a job before printing a proposal" check, because 0.004 is greater than zero, and the sheet printed a $0.00 job.

A third, smaller one: "hold this price for (days)" accepted 0.5. The page then said the price was held until the issue date itself, "(0.5 days from issue)".

## The fix

The price is now rounded to whole cents as soon as it arrives. The deposit and balance are worked out in integer cents from the number the customer actually reads, so they always add up to the printed total. A price that prints as $0.00 is refused like a zero price, and a fractional validity period is refused with "Valid days must be a whole number". Each bug has a test that failed before the fix. The fix was copied into all 121 ventures, and the 111 venture test files that touch the proposal pass.

## The run's numbers

The red-team tool seeded 16 mutants into the proposal module and the CI's owner-held-PR report. The repository's own tests caught 12. Two of the 4 that escaped are equivalent: a thread-pool size, and a date check where no input can get the month wrong and the day right. The other two were real gaps in `owner_held_prs.py`: a submodule entry read as a file, and a tie-break by the wrong key. Both now have tests. Catch rate went from 0.857 before the new tests to 1.0 after.
