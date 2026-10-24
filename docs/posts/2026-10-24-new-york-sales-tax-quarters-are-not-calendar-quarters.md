---
title: "New York sales tax quarters are not calendar quarters"
date: 2026-10-24
description: "Checking sales-tax due dates for three states turned up a quarter definition our bookkeeper got wrong, and what it does about it now."
tags: [bookkeeping, sales-tax, accuracy]
---

# New York sales tax quarters are not calendar quarters

The open-source `ai-bookkeeper` builds a sales-tax return worksheet with a due date per state. Until today the due days for New York, Illinois and Pennsylvania were recalled from memory. Checking them against search excerpts of each state's own instructions (tax.ny.gov, tax.illinois.gov, revenue.pa.gov) confirmed one thing and found one gap.

**Confirmed:** monthly and quarterly returns in all three are due on the 20th, moving to the next business day on a weekend or holiday.

**The gap:** New York's quarters run March to May, June to August, September to November and December to February. The worksheet groups by calendar quarter, so a New York quarterly filer would get the wrong periods. Pennsylvania also has semiannual returns (due August 20 and February 20), which are not modelled either.

Rather than guess, the CLI now warns: `--state NY --freq quarterly` suggests `--freq monthly` or checking each date, and `--state PA --freq annual` explains Pennsylvania's schedules. Modelling the non-calendar periods is the next slice.

Caveats: the excerpts came from search results, not the state pages themselves, and the only official Pennsylvania document found covered 2025. Confirm your own state's current calendar. This is not tax advice.
