---
title: "South Carolina sales tax due dates, checked against the state's own table"
date: 2026-10-28
description: "ai-bookkeeper's sales tax return worksheet now pins South Carolina's due dates to the Department of Revenue's published schedule instead of third-party guides."
tags: [ai-bookkeeper, sales-tax, verification]
---

The sales tax return worksheet in ai-bookkeeper computes a due date for each
period. For South Carolina that date came from third-party guides. Today it was
checked against the Department of Revenue's own Due Dates table.

The table says monthly returns are due the 20th of the following month,
quarterly returns on April 20, July 20, October 20 and January 20, and annual
returns (period ending December 31) on January 20. The worksheet's default
already produced exactly those dates, so no behaviour changed. What changed is
that four assertions now pin them in the test suite, and the source comment
says the state's page was read rather than a guide. A weekend or holiday moves
a due date to the next business day, which the worksheet already handles.

Limits: SC filers need state approval to file quarterly or annually, and the
worksheet does not check that. It is a worksheet, not a filing; check your own
notice from the state.
