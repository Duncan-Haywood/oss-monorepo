---
title: "GBP 2,191.8, and three Self Assessment answers that were wrong"
seo_title: "UK Self Assessment calculator: student loan on unearned income, Plan 5 in 2025/26, property allowance vs mortgage credit"
date: 2026-11-17
tags: [redteam, uk-self-assessment-tax-calculator, greenhouse-bench-planner, testing, uk-tax]
description: "A red-team run seeded 16 faults into two tools. The tests caught 4. It fixed three tax rules, and a pence bug copied into 55 files."
---

[UK Self Assessment Tax Calculator](https://marisstella.app/uk-self-assessment-tax-calculator/) adds up a
year's pay, side-business profit, rent, interest and dividends, and gives the bill due on 31 January 2027.
Today's red-team run aimed at its engine, `calc.mjs`, and at the
[Greenhouse Bench Planner](https://marisstella.app/greenhouse-bench-planner/). The run seeded eight small
faults into each one to see whether the tests would notice.

## How well the tests guard them

The Self Assessment tests caught **0 of 8** seeded faults. Every fault sat in the text a user reads: the
headline, the refund line, the effective rate, the payments-on-account note, the Class 4 note and the
"what if you paid into a pension" lines. The tests checked the numbers underneath and never the sentences
built from them. So "Class 4 National Insurance" could turn into "Class 5", and a GBP 1,000 Gift Aid
what-if could turn into GBP 1,001, and every test still passed.

The greenhouse tests caught 4 of 8. They missed a margin worked out as units ÷ (price − cost) instead of
units × (price − cost). They also missed two edits to the worked example's crop list, and a bench window
that counted the sale week as occupied. The last one only shows with four crops. With two, the planner's
order search works around it. A short fuzz run against a mutated copy found a four-crop case where the
fault sells 120 plants instead of 130, and that case is now a test.

After the new tests, 15 of the 15 faults that could change something a user sees are caught. The 16th turns
`rent > 0` into `rent >= 0` on a line that already needs rent above zero, so it changes nothing.

## Three tax answers that were wrong

A census quality audit this morning listed these as known gaps, citing the GOV.UK pages it fetched. They are
fixed now, each with a test that failed first:

- **Student loan on a little interest.** Self Assessment counts savings, dividends and property profit for
  student loan only when they come to more than £2,000. The tool counted every pound. Someone on £30,000
  with £1,500 of interest on Plan 2 was shown £272.70 due. The answer is £137.70.
- **Plan 5 in 2025/26.** Plan 5 repayments start in April 2026, so nothing is due for 2025/26. The tool
  charged a £40,000 earner £1,350. Now it charges nothing and says why.
- **The property allowance against the mortgage credit.** You can take the £1,000 property allowance or
  deduct real expenses, not both. Only the expenses route gets the 20% credit for mortgage interest. The
  tool took the allowance whenever it beat the expenses alone. With £10,000 rent, £500 of expenses and
  £6,000 of interest, that gave up a £1,200 credit to save £100, and the bill came out at £5,286 instead
  of £4,186. Typing £1,001 of expenses instead of £1,000 dropped the bill by about £1,200. Now the tool works out
  both routes and keeps the lower bill.

## The pence bug, in 55 files

The headline read "Estimated 2025/26 bill: GBP 2,191.8". The money formatter asked for "up to two decimal
places", which drops a trailing zero, so £505.80 printed as 505.8 and 50p as 0.5. The same one-line
formatter had been copied into 55 files across 30 tools, most of them the UK tax calculators. Each copy now
adds the missing zero ("£5,955.30") and still prints whole pounds bare ("£751").

A new check, `platform/ci/check_money_pence.py`, fails any pull request that adds another copy. No workflow
had to change, because `unwired_checks.py` already runs every check that no workflow names. Before the
fix the check flagged the page. After the fix it passes on the whole tree.

These are estimates from the figures you type, not tax advice. The tools name the GOV.UK pages to check
against.
