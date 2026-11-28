---
title: "Re-audit: the grant tracker stopped drifting, but federal reports still read Overdue weeks early"
seo_title: "When is a federal grant report due? 30, 90 and 120 days under 2 CFR 200"
date: 2026-11-28
tags: [quality-audit, evaluation, nonprofits, grant-reporting-tracker]
description: "A re-check of the free grant reporting tracker. The high defect is fixed, the federal due-date gap was only written down, and this round fixes it."
---

The [grant reporting tracker](https://marisstella.app/grant-reporting-tracker/) keeps a small
nonprofit's grant reporting dates in one queue, sorted by days left. The
[2026-11-13 audit](../../portfolio/quality/audits/2026-11-13-grant-reporting-tracker.json) found
six defects. The worst was that one late report moved every later deadline. Its fix PR (#15312) marked all six as
fixed. This re-check tested each of them against the code on `main` today.

## What the fix closed

| earlier defect | on arrival |
|---|---|
| a late filing moved every later due date (high) | **closed**: semiannual award from 15 Jan 2026, first report filed late on 1 Aug, checked on 20 Jan 2027 → due 15 Jan 2027, 5 days overdue |
| no reporting lag, no award end, no final report (medium) | **open**: listed in the README as a known gap, not fixed |
| the explainer taught "award date plus interval" and had a false sentence (medium) | **partial**: the sentence was fixed, the rule was not |
| status boundaries untested (medium) | **partial**: both boundaries now pinned, but an overspend clamp still passed |
| impossible dates, unflagged overspend, minified page script (low) | **partial**: impossible dates refused; the rest remained |
| README missing a usage event (low) | **closed** |

Two of the six were closed and three were partly fixed. One had only been written down as a known
gap. The score stays below the bar: correctness, claims and verification are 2 each. Three of six
seeded bugs got past the tests.

## The gap that mattered: when a federal report is actually due

Under the Uniform Guidance, a federal report is due a set number of days *after* its reporting
period ends: 30 days for quarterly or semiannual reports and 90 for annual ones
([2 CFR 200.329](https://www.ecfr.gov/current/title-2/section-200.329)). Every report is due no
later than 120 days after the period of performance ends
([2 CFR 200.344](https://www.ecfr.gov/current/title-2/section-200.344)). On arrival the tracker
put the due date on the period end. A quarterly award that started on 1 January read *Overdue* on
15 April, though its report is not due until 30 April. An award that ended on 30 June showed a
next "periodic" report a year away. The real deadline was a final report due 28 October, which
had already passed.

This round adds three optional fields to each award:

- **Report due, days after each period**: 30 or 90 for federal awards. Blank keeps the old
  meaning, which many foundation agreements use ("a report every six months from the award").
- **Award period ends**: the last period's report becomes the final report.
- **Final report due, days after end**: 120 by default, or the foundation's own number.

All three cases above now give the dates the rule gives. Each one is a test pinned to the eCFR
date. Spending above the award now shows *overspent* and no longer appears as a bare minus sign.
The explainer page now answers "when is my grant report due" with the federal rule and the
foundation pattern, and drops the one-line rule it taught before.

## Still open

- The page's script is minified one-liners that are hard to review.
- Each award has one report stream. When financial and performance reports run on different
  schedules, the award needs two rows.

The audit record is
[`2026-11-28-grant-reporting-tracker.json`](../../portfolio/quality/audits/2026-11-28-grant-reporting-tracker.json).
It holds every probe and mutation. A later round re-scores the fixed code; this round's scores are
for the code as it was found.
