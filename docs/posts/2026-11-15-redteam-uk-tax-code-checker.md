---
title: "A K code that took 77% of pay. Red-teaming the UK tax code checker"
seo_title: "UK tax code checker: K-code 50% limit and Marriage Allowance fixes"
date: 2026-11-15
tags: [testing, mutation-testing, tax, uk, javascript, redteam]
description: "3 of 10 seeded faults caught. Two real errors fixed: K codes ignored the 50% overriding limit, and higher-rate taxpayers got Marriage Allowance codes."
---

Today's red-team run aimed at
[the UK tax code checker](https://marisstella.app/uk-tax-code-checker/), which
decodes a PAYE tax code, works out the tax that code should have taken so far
this year, and compares that with the payslip. A second section works out what
your code should be from your income, benefits and Marriage Allowance.

## Seeded faults: 3 of 10 caught

`redteam.py campaign` seeded 10 faults into `calc.mjs`, one at a time, and ran
the suite after each. The suite caught only 3. The seven it missed:

- rejecting £0 of tax paid so far, which is a normal payslip on a new job;
- costing the lost allowance at 20% and *divided by* 0.4, instead of 20% and 40%;
- moving the "your payslip differs" threshold from £10 to £11;
- swapping a `max` for a `min`, so a £20 underpayment on £1,742 of tax read as
  "you are building a bill" instead of "close";
- giving Marriage Allowance to someone with no Personal Allowance left;
- turning the breakdown row's label into `NaN`;
- showing money to three decimal places. Every amount is rounded to pennies
  first, so this one can never change what a user sees. It is triaged as
  equivalent rather than given a test.

Each of the other six now has a test that fails with the fault and passes
without it. `redteam.py rerun` re-applied all six and the suite caught every
one. The tests now catch 17 of the 18 faults seeded this run. The other 8 were
in a random draw, a usage counter, and all 8 were caught; the one survivor is
the equivalent fault.

## Two real errors

Reading the code as a stranger would use it turned up two wrong answers.

**K codes ignored the 50% limit.** A K code adds income to your pay before tax,
but the law caps the tax taken under a K code at half the pay in the period
(the "overriding limit"). The checker didn't apply the cap. For a K3000 code on
£1,000 of pay in month 1, it expected £771.60 of tax, which is 77% of the pay.
A payslip that correctly took £500 was flagged at high severity: "differs from
what code K3000 should give ... ask payroll to explain". Now the tax under a K
code is capped at 50% of the pay to date. That figure is exact when pay is the
same each period. A new finding shows the uncapped figure and says the rest is
still owed.

**The code builder gave Marriage Allowance to higher-rate taxpayers.** Neither
partner may pay tax above the basic rate (in Scotland, above the intermediate
rate), but on £60,000 of income the builder produced `1383M` for "I receive it"
and `1131N` for "I gave it". Both codes are wrong, and HMRC wouldn't issue them.
The builder now stops at £50,270 (£43,662 in Scotland), works out the code
without Marriage Allowance and says why. The site's own
[Marriage Allowance calculator](https://marisstella.app/uk-marriage-allowance-calculator/)
already had this rule. This checker didn't.

Both fixes started as failing tests. The page's FAQ, its "Covers" list and its
`llms.txt` now describe the cap and the eligibility rule.

## What it says about the suite

Most of what the tests missed sat at a threshold: the £10 mismatch line, the
2% band, £0 of tax, the point where the allowance runs out. The suite checked
a typical case for each rule. It didn't check the edges, where a mistake turns
"close" into "ask payroll". Both real errors were also edge cases. They were
rules the code never applied, not rules it got wrong.

The checker gives estimates, not tax advice. Check your code in your HMRC
online account.
