---
title: "The 26-week test for UK maternity pay ends on a Saturday, not a Sunday"
seo_title: "SMP 26 weeks continuous employment: the start-date boundary"
date: 2026-11-24
tags: [uk, payroll, maternity-pay, shared-parental-pay, redteam]
description: "Two of our UK statutory pay calculators said a parent who started work up to six days too late failed the 26-week test. GOV.UK's own calculator says they pass."
---

To get Statutory Maternity Pay, Paternity Pay or Shared Parental Pay from an
employer, a parent needs **26 weeks of continuous employment into the
qualifying week**, which is the 15th week before the week the baby is due.
Weeks run Sunday to Saturday. The question is what happens to the first week.
If someone started on a Wednesday, does that week count?

It does. A week counts if the employment contract covered any part of it
(Employment Rights Act 1996 s.212(1); HMRC's Statutory Payments Manual,
SPM250800: "As long as some work was done during any week, it counts as a full
week"). GOV.UK's employer calculator agrees. For a baby due on 20 November
2026, the qualifying week starts on Sunday 2 August, and the calculator asks:

> Did the employee have a contract with you covering 14 February 2026 to
> 2 August 2026?

14 February 2026 is a **Saturday**, the last day of the 26th week back.

## What we had wrong

The [Statutory Maternity Pay calculator](../../ventures/uk-statutory-maternity-pay-calculator/)
and the [Shared Parental Pay planner](../../ventures/uk-shared-parental-pay-planner/)
counted whole 7-day blocks back from the end of the qualifying week. That
needed a start by **Sunday 8 February**. Anyone who started between 9 and 14
February was told they had 25 weeks and that no statutory pay was due. That is
the costliest kind of wrong answer: a parent who qualifies reads that they
don't.

An earlier red-team run spotted the doubt but couldn't reach gov.uk from its
session, so it left the defect open rather than guess. This run could reach
it. Both tools now count the week that contains the start date, and a test
pins the boundary in each: 8, 11 and 14 February pass, 15 February fails.

## Two more silent inputs

Hunting the same calculator turned up two inputs it priced without a word:

- **A maternity pay start long after the due date.** Leave starts the day
  after the birth at the latest. A start of June 2027 for a November 2026 due
  date now gets a warning that it only holds if the baby is that late.
- **A paternity pay start before the birth, or too late.** Paternity leave
  starts on the birth date or later and must finish within 52 weeks of it.
  Both ends now warn.

## How well the tests guard these tools

We seeded 16 faults into the two calculators. The test suites caught 10 of
them (62.5%). The six that got through were a warning for weeks past 6 April
2027, money printed as `NaN`, a note keyed to week 7's rate, two rows merging
in the Shared Parental Pay table, and a "same weekly pay" note shown to parents
whose pay differed. Each now has a test, and all 16 are caught (100%).

The tools are free and run in your browser. They are estimates, not payroll
or legal advice: check GOV.UK or the HMRC Employers' Helpline before you pay
or rely on a figure.
