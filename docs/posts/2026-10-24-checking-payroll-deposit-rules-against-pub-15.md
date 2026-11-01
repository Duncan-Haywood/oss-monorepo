---
title: "Checking a payroll deposit scheduler against the IRS's own worked examples"
seo_title: "Checking a payroll deposit scheduler against IRS Pub 15"
date: 2026-10-24
description: "The $100,000 next-day deposit rule in an open-source bookkeeper, tested against the two examples printed in IRS Publication 15 (2026)."
tags: [payroll, testing, accounting, open-source]
---

# Checking a payroll deposit scheduler against the IRS's own worked examples

The ai-bookkeeper project works out when federal payroll tax deposits are due.
Its tests had been written from our own reading of the rules, which proves only
that the code agrees with us. Publication 15 (2026) prints worked examples, so
we turned two of them into tests.

- **Fir Co.** A semiweekly depositor owes $110,000 on Monday and must deposit
  it Tuesday. Tuesday's extra $30,000 is not added to it and is due Friday.
- **$95,000 then $10,000.** $95,000 on a Tuesday and $10,000 on the Wednesday
  are in different deposit periods, so the next-day rule never fires: Friday
  and the following Wednesday.

Both passed without a code change. That is a small result, but it is a check
against the source, not against our own assumptions. These are still hand-made
registers, not a real payroll provider's report, and this is not tax advice.
