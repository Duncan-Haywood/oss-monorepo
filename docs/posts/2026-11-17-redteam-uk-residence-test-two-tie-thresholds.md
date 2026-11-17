---
title: "Two tie thresholds the UK residence checker had wrong"
seo_title: "UK Statutory Residence Test: the 90-day tie is more than 90 days"
date: 2026-11-17
tags: [redteam, uk-tax, statutory-residence-test, testing]
description: "A red-team run checked the UK Statutory Residence Test checker against Finance Act 2013 Schedule 45. Two ties were off by one day, and its own tests had locked both mistakes in."
---

The [UK Statutory Residence Test checker](https://marisstella.app/uk-statutory-residence-test-checker/)
works out whether the UK's day-count rules make someone UK resident for a tax year. It follows the order
HMRC sets out: the automatic overseas tests first, then the automatic UK tests, then the "sufficient
ties" table. Today a red-team run seeded faults into its engine and also checked it line by line against
the statute, [Finance Act 2013 Schedule 45](https://www.legislation.gov.uk/ukpga/2013/29/schedule/45).

## Seeded faults: 5 of 8 caught, now 8 of 8

The run made eight small edits to `calc.mjs` and ran the tests after each one. Five broke a test. One of
the three that got through could not change any answer: it turned `n < 0` into `n <= 0` in a helper where
both branches return 0 when `n` is 0. The other two were in the notice that says "N more days would move
you into the next band". Nothing tested its 10-day window, so changing `<= 10` to `< 10` went through,
and so did an edit that let the notice fire at any distance. New tests at 100, 110, 111 and 115 days now
pin the window, and both edits fail them.

## Two real errors, each checked against the statute

**The 90-day tie.** Paragraph 37 gives a 90-day tie if you "spent more than 90 days in the UK" in either
of the two previous tax years. The checker counted exactly 90 as a tie. One extra tie is enough to change
the answer. Take an arriver with 60 UK days who has a family tie, an accommodation tie and a work tie,
and exactly 90 days in the UK the year before. They need four ties, so they are not resident. The checker
said they were.

**The country tie.** Paragraph 38(2) says that if the UK ties with another country for the most midnights
in the year, you still have a country tie. The checker required strictly more UK days than any other
country, so a leaver whose days were level lost a tie it should have counted.

Neither one was a seeded fault. The tests passed on both because they asserted the wrong rule: one test
treated 90 days as a tie, and another was titled "needs strictly more UK days than any other country".
The [ties table page](https://marisstella.app/uk-statutory-residence-test-checker/uk-statutory-residence-test-ties-table.html)
said the same things in prose. The code, both tests and both pages are now fixed. A new page test fails
if the copy says "90 or more" or "more days than any other" again, or if the engine's comparisons drift
from `> 90` and `>=`.

## Why it slipped through

The engine's header says it was "written from the published test without a live lookup". Both mistakes
are what you get when you write down the rule as you remember it: "90 days" and "more days than anywhere
else". Mutation testing can't catch that kind of error. If the code and its tests share the same wrong
idea, every edit that breaks the code still breaks a test. Only reading the statute itself caught them.
Today that took 11 HTTP fetches from legislation.gov.uk.

The checker is arithmetic on what you type. It is not tax advice and not a statement of anyone's
residency: check HMRC's RDR3 guidance or ask an adviser.
