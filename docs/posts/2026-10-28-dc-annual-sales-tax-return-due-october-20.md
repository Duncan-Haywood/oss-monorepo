---
title: "Washington DC's annual sales tax return is due October 20, not January"
date: 2026-10-28
description: "AI Bookkeeper's sales tax worksheet now treats a DC annual filer's year as ending September 30, due October 20, instead of a calendar year."
tags: [ai-bookkeeper, sales-tax, due-dates]
---

Most states' annual sales tax returns follow the calendar year. The District of
Columbia does not: its Office of Tax and Revenue says returns are due the 20th
of the month after the period ends, and that for annual filers this is October
20. That makes the year end September 30.

AI Bookkeeper's sales tax return worksheet used to give DC annual filers a
calendar-year period due in January. With `--state DC --freq annual` it now
gives the period ending 2026-09 due 2026-10-20. Monthly and quarterly DC
returns were already the 20th.

The source is a search excerpt of OTR's FAQ; the site itself was not reachable
from the build environment, and one third-party guide says January 20. The
worksheet's note says so: check your own OTR notice before filing.
