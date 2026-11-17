---
title: "LA County's Fair Workweek is not the City of LA's: asked cover is exempt and short rests cost less"
seo_title: "LA County Fair Workweek: what a late schedule change costs"
date: 2026-11-17
tags: [scheduling, fair-workweek, shift-roster-builder, labor-law]
description: "Shift Roster Builder now prices LA County's Fair Workweek from the ordinance text. Five late changes at $18 an hour: $99 in the county, $172.50 in the city."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) team hub keeps
a dated log of every change to a posted week. It prices each change under the
fair-workweek rule set the deployer picks. Today it gained
`FAIR_WORKWEEK=los-angeles-county`. That is the Los Angeles County Fair
Workweek Ordinance (County Code Chapter 8.102), which has covered large
retailers in the county's unincorporated areas since 1 July 2025.

Several of the hub's other presets were built from law-firm summaries,
because the cities' own sites refused this session's network. This one was
not. The county's file server answered, so the numbers come from the
ordinance's own text: the version sent to the Board of Supervisors in April
2024, and the amendment to the predictability-pay section adopted on
18 November 2025.

## Two neighbours, two rule sets

The City of Los Angeles has had its own Fair Work Week Ordinance since 2023, and
the hub already had a preset for it. The county's ordinance covers different
ground: East LA, Altadena, Marina del Rey and the county's other
unincorporated areas, not the city and not incorporated cities like Pasadena
or Santa Monica. The two laws look alike at first: 14 days' notice, 1 hour of
pay for an added or moved shift, half pay for hours taken away, and a 10-hour
rest. Read closely, they differ in three places.

- **Cover for an absence.** Section 8.102.080.B.2 says no premium is owed when
  an employee accepts a change "due to an absence of another scheduled Retail
  Employee", provided the employer said taking the hours is voluntary and
  documented the request and the consent. Seattle and Oregon have a similar
  exception, but it needs a written offer to the whole team. The county's
  doesn't. The City of LA's FAQ says volunteers are still owed predictability
  pay.
- **Small cuts.** The 2025 amendment replaced four separate triggers
  (subtracting hours, moving a start or end time, changing the date,
  cancelling) with one. Half pay is owed when the employer "reduces the
  Retail Employee's work time ... by at least 15 minutes". So 15 minutes cut
  owes half pay and 14 minutes owes nothing. The original text had said "more
  than fifteen". The city has no such floor.
- **Short rest.** The county pays time and a half "for each hour of the
  second Shift not separated by at least ten (10) hours". The city pays it on
  the whole following shift.

## What it costs

Here is one week of five late changes at $18 an hour, priced by
`eval/la-county-compare.mjs`:

| Change | LA County | LA city | Seattle | Chicago | Berkeley |
|---|---:|---:|---:|---:|---:|
| Monday's 8 h shift cancelled 10 days ahead | $72.00 | $72.00 | $72.00 | $18.00 | $18.00 |
| 1 h cut off Tuesday's 8 h shift, Monday 23:00 | $9.00 | $9.00 | $9.00 | $9.00 | $18.00 |
| 10 min cut off Wednesday's end, 3 days ahead | $0.00 | $1.50 | $1.50 | $18.00 | $18.00 |
| Ben asked one-to-one to cover Ana's call-out | $0.00 | $18.00 | $18.00 | $18.00 | $18.00 |
| Close Fri 24:00, open Sat 08:00 (8 h rest) | $18.00 | $72.00 | $18.00 | $9.00 | $27.00 |
| **Total** | **$99.00** | **$172.50** | **$118.50** | **$72.00** | **$99.00** |

The same week costs $73.50 more a few miles away inside the city. Most of the
gap is the rest rule. The city pays the extra half on all 8 hours of
Saturday's shift ($72), and the county pays it only on the 2 hours that fall
inside the 10-hour window ($18). The county also has no 24-hour tier.
Cancelling Monday's shift 10 days ahead costs the same half pay as
cancelling it the night before, $72 where Chicago and Berkeley charge one
hour.

## Two new switches

The preset needed two rule fields the pricer did not have, and any rule set
can now use them. `FWW_MIN_CUT_MIN` lets cuts shorter than a set number of
minutes go free. `FWW_COVER_ACCEPT=1` exempts accepted cover for an absence
however it was asked for. The hub cannot see whether a manager actually told
the employee the hours were voluntary and wrote down the consent. So every
exempt line on the changes page says the exemption depends on that record,
and a deployer who doesn't keep one can turn the exception off.

Not modelled: which employers are covered (retail and grocery, 300 or more
employees worldwide, two hours a week in an unincorporated area), hours taken
from the 72-hour offer to current staff before hiring someone new, and hours
already paid at overtime. As with every preset, this is a planning aid to
check against the current text, not legal advice. The tests are in
`notice-la-county.test.mjs`, and the README section "Los Angeles County"
gives the section numbers for each line.
