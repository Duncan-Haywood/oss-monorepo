---
title: "Quality fix: irregular-hours holiday is rounded each pay period, not once a year"
seo_title: "12.07% holiday accrual: per pay period, rounded to the nearest hour"
date: 2026-11-27
tags: [quality-audit, uk-holiday-pay-calculator, for-customers, payroll, small-business]
description: "Our UK holiday calculator took 12.07% of a yearly hours total. Reg 15B accrues it every pay period and rounds each to the nearest hour. Fixed."
---

Since 1 April 2024, irregular-hours and part-year workers in Great Britain
build up holiday at 12.07% of the hours they work. The
[UK Holiday Pay Calculator](../../ventures/uk-holiday-pay-calculator/)
took 12.07% of one yearly total. The regulation works differently.

## What the law says

Working Time Regulations 1998, regulation 15B
([legislation.gov.uk](https://www.legislation.gov.uk/uksi/1998/1833/regulation/15B)):

- **15B(3)(b):** leave accrues "on the last day of each pay period at the
  rate of 12.07% of the number of hours that they have worked during that
  pay period".
- **15B(5):** a fraction of an hour under 30 minutes counts as zero, and
  30 minutes or more counts as one hour.

So each pay period is rounded on its own. Thirty hours in a weekly pay
period is 3.62 hours, which rounds to 4. The old calculator showed 3.62.
Over a year of 30-hour weeks that is 52 x 4 = **208 hours**. One total of
1,560 hours x 12.07% gave **188.29 hours**, almost 20 hours short. The
error can go the other way too: 19 hours a week is 2.29 hours, which rounds
to 2. For that worker the yearly figure overstates the holiday.

## What changed

- A **pay period** field (weekly, fortnightly, every four weeks, monthly).
  A yearly total is spread evenly over those periods, and the result says
  this is exact only when every period had the same hours.
- An optional **hours in each pay period** field ("30, 25, 0, 40"). Each
  period is rounded on its own: 4 + 3 + 0 + 5 = 12 hours.
- The result shows the figure before rounding next to the accrued hours.
  You can see how much the rounding moved it.
- A regression test covers the GOV.UK example (30 hours gives 4), a year of
  30-hour weeks (208), both sides of the half-hour line (4 hours gives 0,
  4.15 gives 1) and the uneven list. A seeded mutation that removes the
  rounding fails it.

## What is still not modelled

The 28-day yearly cap on this accrual (reg 15B(4)) is not applied. Holiday
accrued during sick or family leave (reg 15C) is not modelled either. Both
are listed on the page. The audit's other open items, such as the contract
field not saying whether bank holidays are included, are in the tool's
README under "Known gaps". A later audit round will re-check the fix.

Found by quality audit round 114
([audit file](../../portfolio/quality/audits/2026-11-26-uk-holiday-pay-calculator.json),
defect 0). Not tax or legal advice: check your figures against the
regulation and GOV.UK.
