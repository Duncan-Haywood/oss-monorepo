---
title: "A sales tax due date we had wrong for Minnesota annual filers"
date: 2026-10-25
description: "ai-bookkeeper's sales tax worksheet assumed the 20th for every Minnesota filing frequency. The state says annual filers have until February 5."
tags: [ai-bookkeeper, sales-tax, correctness]
---

ai-bookkeeper's `salestax return` worksheet keeps a table of due days by state.
Many entries came from third-party guides. Checking Colorado and Minnesota
against the states' own pages (through search excerpts, not the whole pages)
turned up one error: Minnesota annual filers, those averaging under $100 a month
in tax, are due February 5 of the following year, not January 20.

Colorado held up: the 20th for monthly and quarterly, January 20 for annual.

The fix needed a new kind of due day, "the Nth month after the period, on day D",
because the old model only knew a day in the month right after the period. One
test pins both states. The full suite (815 tests) passes.

The worksheet still tells users to check their own notice. States change
schedules, and an excerpt is not the form.
