---
title: "Sales tax return due dates for Colorado, Michigan, Minnesota and Wisconsin"
date: 2026-10-24
description: "ai-bookkeeper's salestax return now knows Colorado, Michigan and Minnesota file by the 20th and Wisconsin by month end, with the sources and what is not modelled."
tags: [bookkeeping, sales-tax, ai-bookkeeper]
---

# Sales tax return due dates for Colorado, Michigan, Minnesota and Wisconsin

`ai-bookkeeper salestax return --state XX` now covers four more states.

- **Colorado, Michigan, Minnesota:** the 20th of the month after the period.
- **Wisconsin:** the last day of the month after the period. Early monthly
  filers file by the 20th; that case is not modelled.

The state sites were unreachable from the build environment, so these come
from search excerpts: third-party due-date tables (TaxCloud, TaxJar) for
CO, MI and MN, and the Wisconsin Department of Revenue FAQ for WI. Check your
own notice before relying on a date. Each rule has a test.
