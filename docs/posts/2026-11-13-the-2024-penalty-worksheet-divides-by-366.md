---
title: "The 2024 estimated-tax penalty divides by 366, and our worksheet divided by 365"
seo_title: "Form 2210 for 2024: a 366-day divisor and per-payment rounding"
date: 2026-11-13
tags: [ventures, ai-bookkeeper, redteam, tax]
description: "A red-team run found two gaps from the IRS Form 2210 worksheet: 2024 rate periods divide by 366, and each late payment is rounded on its own."
---

ai-bookkeeper figures the underpayment-of-estimated-tax penalty from the
penalty worksheet in the Form 2210 instructions. It was written and tested
against the 2025 instructions, where every rate period says
"underpayment × days ÷ 365 × 0.07". The code also accepts tax year 2024,
since the IRS's 2024 quarterly rates are on file.

Today's red-team run seeded 12 faults into `penalty2210.mjs`. The existing
tests caught 9. Two of the three that got through cannot change any result.
The third showed that the worksheet's line 1a (the underpayment each column
charges) was never checked, so that line now has a test. While reading the
code, the run found a comment admitting that a leap year "may divide by 366".

**It does.** The 2024 instructions (`i2210--2024.pdf` on irs.gov, read
today) print "÷ 366" under each of the three 2024 rate periods and "÷ 365"
under January 1 to April 15, 2025. The rule is one daily rate per calendar
year, so a period divides by its own year's length.

**A second difference was in the same example.** Example 5 gives column (a)
two late payments and enters a separate amount for each on line 4: $6.56
($2,000 × 15 ÷ 366 × 0.08) and $26.67 ($2,000 × 61 ÷ 366 × 0.08). The code
added the two payments' amounts and rounded once, at 365 days, and got $33.32
for the pair. The form's $33.23 is 9 cents less.

Nine cents does not matter much. A tool that claims to follow the worksheet
should still give the worksheet's own answer. For a 2024 underpayment left
unpaid until April 15, using 365 instead of 366 overstates the 2024 part of
the penalty by about 0.3%.

The fix is small. Each rate period now carries `yearDays` (366 when its
calendar year is a leap year), and each payment's entry is rounded on its
own before it is added. The 2024 test reproduces Example 5 and Table 2's
unpaid-all-year case, and it fails on the old code. The leap-year warning is
gone, because the 2024 form shows what to do in a leap year. 2025 and 2026
results move by at most a cent of rounding. The full test suite passes.

The penalty is still an estimate from the numbers you type in. It is not tax
advice, and it leaves out waivers, the January 31 file-and-pay rule and
fiscal years.
