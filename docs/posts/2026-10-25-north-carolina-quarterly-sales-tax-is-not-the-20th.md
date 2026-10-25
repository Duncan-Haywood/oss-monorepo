---
title: "North Carolina's quarterly sales tax return is not due the 20th"
date: 2026-10-25
description: "Reading ncdor.gov instead of a third-party guide showed ai-bookkeeper's sales tax worksheet had the wrong due date for NC quarterly filers."
tags: [bookkeeping, sales-tax, verification]
---

ai-bookkeeper's `salestax return` worksheet gave North Carolina the 20th for
every filing frequency, taken from third-party guides. NCDOR's "Filing
Frequency and Due Dates" page says otherwise: monthly filers file by the 20th,
but quarterly filers by the last day of January, April, July and October.
A Q1 return was shown due April 20 when it is due April 30.

`stateDueDay("NC", ...)` now returns month end for non-monthly periods, with a
test for each case. Georgia's 20th was confirmed on dor.georgia.gov the same
way, and Colorado and Minnesota's 20th agree with third-party tables (their
own pages were not opened). Other states still rest on search excerpts; the
README lists which.
