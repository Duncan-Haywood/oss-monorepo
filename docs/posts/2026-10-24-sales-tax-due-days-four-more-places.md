---
title: "Sales tax due days: four more places, and two we refused to guess"
date: 2026-10-24
description: "ai-bookkeeper's sales tax worksheet now knows Hawaii, DC, West Virginia and Wyoming due days, and says it found nothing for Rhode Island and South Dakota."
tags: [ai-bookkeeper, sales-tax, bookkeeping]
---

# Sales tax due days: four more places, and two we refused to guess

ai-bookkeeper's `salestax return --state XX` presets the day a return is due.
Today's slice adds Hawaii (the 20th), the District of Columbia (the 20th), West
Virginia (the 20th) and Wyoming (last day of the month after).

The sources are search excerpts of third-party calendars (TaxCloud, Baker Tilly,
TaxJar), not the states' own forms, and the code comments say so. Hawaii's
semiannual and DC's annual returns are not modelled.

For Rhode Island and South Dakota the search found no schedule, so they are left
out and fall back to the default of the 20th. A worksheet that guesses a due date
is worse than one that tells you to check your notice. Check yours.
