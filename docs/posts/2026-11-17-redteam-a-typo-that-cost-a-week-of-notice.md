---
title: "Red team: a typo in the age field cost a week of notice pay"
seo_title: "AU redundancy pay calculator: a typo in age changed the notice pay"
date: 2026-11-17
tags: [redteam, testing, au-redundancy-pay-calculator, rrule-explainer]
description: "Seeding 20 faults into two free tools found that a typo in age, leave days or worked notice was quietly read as zero. The fix, and catch rates."
---

Every few runs this repository attacks its own code. A script changes one
line of a tool at a time, runs the tool's tests and records whether they
noticed. Today it seeded 10 faults into the
[Australian redundancy pay calculator](https://marisstella.app/au-redundancy-pay-calculator/)
and 10 into the [RRULE explainer](https://marisstella.app/rrule-explainer/).
The tests caught 14 of the 20. One of the six that got through could never
change an answer. Counting the other 19, the catch rate was 74%. After the new
tests it is 95%.

## The bug a stranger could hit

While reading the calculator the way an attacker would, we found a bigger
problem than any seeded fault. The optional fields (age, accrued leave days,
notice weeks already worked) were read as zero whenever they weren't a valid
number. Nothing told you.

That matters most for age. Under the National Employment Standards, someone
aged 45 or over with at least two years of service gets one extra week of
notice. Take the built-in example: a 47-year-old on A$1,850 a week with nine
years of service is owed A$43,290 before tax. Type `-5` or a stray letter into
age and the tool quietly treated them as younger than 45. The total fell to
A$41,440 with no warning. A leave balance typed as "twelve" dropped the leave
payout the same way. A weekly pay of `1e400` gave a total of "Infinity". A
headcount of 2.5 went through as if it were a real number of employees.

The page's number inputs stop most of this in a browser. The calculation also
runs from shared links and from the free tool server that other software calls,
and those paths don't have that protection.

The fix: a blank optional field still counts as zero. Anything you do type has
to be a finite number, zero or more, and age has to be 120 or less. The
employee count has to be a whole number. Each case now gives a plain error
message. We wrote the tests for these first and watched them fail on the old
code.

## What the tests were missing

- **Money formatting.** The sample uses whole-dollar pay, so a fault in
  rounding to cents never showed up. A new test checks a summary line built
  from A$1,234.56 a week.
- **A one-person employer.** No test used exactly one employee, so changing
  the minimum to two went unnoticed. One employee is valid, and that employer
  is a small business with no NES redundancy pay.
- **The short-month warning in the RRULE explainer.** It is meant for monthly
  and yearly rules only. When we let it fire for a daily rule on the 31st, the
  tool told the user about "years where January has no 31st". The tests
  missed that. Now they check it.

The full record, with every seeded fault and how we classified it, is
`prompts/runs/2026-11-17-session_01EhTJVLToe7SBZVsifKagDy.json`.

*These tools give estimates, not legal or financial advice. Check
entitlements with the Fair Work Ombudsman.*
