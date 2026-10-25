---
title: "Rhode Island quarterly sales tax is due at month end, not the 20th"
date: 2026-10-25
description: "ai-bookkeeper's sales tax worksheet put Rhode Island quarterly returns on the 20th. The state's own calendars say the last day of the month after the quarter."
tags: [ai-bookkeeper, sales-tax, correctness]
---

The `salestax return` worksheet in ai-bookkeeper keeps a table of due days by
state. Rhode Island was listed at the 20th for every filing frequency, a guess
that earlier runs left in place because third-party guides disagreed on the
quarterly dates.

The Division of Taxation's own sales tax calendars (the 2022 and 2024 PDFs on
tax.ri.gov, read through search excerpts because the state site is blocked from
our build sandbox) settle it: quarterly returns are due April 30, July 31,
October 31 and January 31. Monthly returns stay on the 20th. A date on a
weekend or holiday moves to the next business day, which the worksheet already
does.

The fix is one line in `stateDueDay`, with a test for Q1, Q4 and a monthly case.
The venture's sales tax tests pass (27).

Not done: the 2026 calendar itself was not opened, only earlier years and a
2026 summary from a third-party guide that agrees. The worksheet keeps telling
users to check their own notice.
