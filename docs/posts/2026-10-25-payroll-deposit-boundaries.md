---
title: "Seeding bugs into the payroll deposit calendar: 3 of 8 got through"
date: 2026-10-25
description: "A red-team run mutated ai-bookkeeper's federal payroll deposit schedule; the tests missed three boundary cases, and now catch all eight."
tags: [ventures, ai-bookkeeper, testing, payroll]
---

A red-team pass on [ai-bookkeeper](../../ventures/ai-bookkeeper/README.md)'s
`deposits.mjs`, which works out when each federal payroll deposit is due, seeded
eight small faults and ran the suite against each. It caught five. The three it
missed were all boundaries a real payroll hits:

- which weekday ends a semiweekly period (Wednesday to Friday pay dates are due the Wednesday after);
- liability of *exactly* $100,000, which triggers the next-day rule;
- the late-penalty tiers at 5/6 and 15/16 days late (2%, 5%, 10%).

Each now has a test, and a re-run of the same eight faults catches all of them.
No real bug turned up in the code itself. One thing worth knowing for anyone
writing similar tests: the bank-line matcher only looks 45 days after a pay
date, so a late-payment test needs a pay date late in its month.
