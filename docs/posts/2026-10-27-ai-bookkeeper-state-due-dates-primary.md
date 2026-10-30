---
title: "Checking sales tax due dates against the state's own pages"
date: 2026-10-27
description: "ai-bookkeeper's sales tax worksheet presets filing due dates for dozens of states; three are now read from the state's own page, and one was wrong."
tags: [ai-bookkeeper, sales-tax, verification]
---

The sales tax return worksheet in [ai-bookkeeper](../../ventures/ai-bookkeeper/) puts a due date on each filing period. Until today those dates came from search excerpts and third-party guides, because state sites were unreachable from the build sandbox.

They answer now. Washington's page says monthly returns are due the 25th, quarterly the end of the next month and annual April 15. Texas's comptroller chart gives the 20th, already moved off weekends (June, September and December 2026 fall on the 22nd, 21st and 21st). Florida says due the 1st and late after the 20th.

Texas and Florida matched. Washington annual did not: the worksheet used the end of the next month, so an annual filer would have seen a date two and a half months early. It is April 15 now, and a test pins the Texas calendar. The other presets are still excerpt-based; the README says which.
