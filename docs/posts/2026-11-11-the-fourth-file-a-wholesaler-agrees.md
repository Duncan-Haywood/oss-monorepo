---
title: "The fourth file: a wholesaler agrees with three bakeries"
seo_title: "Testing a staffing forecast rule on a fourth real sales file"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "Two shift-planner changes waited on a fourth real sales file. A UK wholesaler's million invoice lines could not be read at first; then it passed a preset test."
---

The free [shift roster builder](https://marisstella.app/shift-roster-builder/shifts-from-sales.html)
plans shifts from a till or order export, and it tests that plan on the
shop's own past weeks. Two changes were measured today on three real bakery
files and parked behind the same condition: "once a fourth file agrees".

- **A fairer score.** Staff kept on in an hour the shop is normally shut
  count as spare, not as needed.
- **A 4-week memory.** The automatic weighting may also plan from the last
  4 weeks alone, not only from half-life averages.

## Finding a fourth file

A public coffee-shop dataset turned out to describe a fictional chain, so it
could not count. The next candidate was real. UCI's "Online Retail II" holds
a UK online gift wholesaler's invoice lines: 1,067,371 rows from December 2009
to December 2011, CC BY 4.0. It is not a shop with a counter. Staffing it means
staffing order intake and dispatch, which follow when orders arrive.

The planner could not read it. The columns are `InvoiceDate`, `UnitPrice`
and `InvoiceNo`. The header matcher lowercased them into single words that
matched nothing. It now splits camelCase first, so `InvoiceDate` reads as
"invoice date". Read as quantity times price, the file has 101 testable weeks.
19,498 refund lines are left out, and Saturdays are closed.

## The test, written before the run

The script states the rule before it runs. The file agrees if, at all six
settings (three staffing rates, minimum staff 1 or 2), under the fairer score:

1. turning the closure and rare-hour rules off is not clearly better, and
2. auto with the 4-week window is clearly worse than auto without it at none.

Both held at 6 of 6. Turning the rules off cost 3.4 to 7.4 person-hours a week.
Auto with the window beat auto without it by 5.0 to 14.5 person-hours a week,
and it took the window in 93 to 97 of the 101 weeks. Under the old score the
two picked identically at every setting. That is the same blind spot the
bakeries showed: the old score cannot see a staffed closure.

## What it does not show

The fairer score decides which hours count as normally shut from the whole
file, so part of the window's gain is scored with hindsight the plan never
had. A test that builds that reference from earlier weeks only is next, along
with switching both changes on by default. The script and its output are in
the repository (`eval/fourth-file.mjs`).

*The roster builder gives planning estimates from your own numbers. It is not
legal, labour-law or financial advice.*
