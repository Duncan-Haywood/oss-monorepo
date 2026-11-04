---
title: "The roster CLI now prices split shifts, weekend pay and payroll burden"
date: 2026-11-04
description: "shift-roster-builder's command line gains the pay flags the web page already had, so a scripted weekly build costs a roster the same way."
tags: [shift-roster-builder, scheduling, cli]
---

# The roster CLI now prices split shifts, weekend pay and payroll burden

The shift-roster-builder page has long let a manager enter a split-shift
premium, a weekend or night pay differential, payroll burden and daily
overtime. The command line ignored all of them, so a scripted weekly build
priced a roster differently from the page.

These flags now reach the same solver as the page: `--burden`,
`--split-premium` with `--split-gap`, `--diff-when "Sat-Sun; 10pm-6am"` with
`--diff-per-hour` or `--diff-pct`, `--daily-ot-after`, `--daily-dt-after`,
`--dt-mult`, `--meal-after` and `--meal-min`. Because the search prices them,
a premium changes who is put on a split, not only the final bill.

On the built-in invented week, 12% burden plus $1.50 an hour on weekends moves
the payroll line from the plain build to $4,144. That week is made up, so the
number shows the flags work, not what your payroll will be. These are planning
numbers, not a statement of any pay law.
