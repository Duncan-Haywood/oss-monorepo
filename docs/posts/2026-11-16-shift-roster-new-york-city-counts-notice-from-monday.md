---
title: "New York City counts schedule notice from Monday, not from the shift"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, fair-workweek, new-york-city]
description: "Shift Roster Builder's team hub now prices New York City's fast food schedule-change premiums: flat $10 to $75 per change, counted to the week's first day."
---

> **Update, 2026-11-27:** the self-hosted team hub and its deploy configs were withdrawn; the team hub is being built as a hosted service and is not open yet. The roster builder itself still runs free in your browser.

The [Shift Roster Builder](../../ventures/shift-roster-builder/)'s self-hosted
team hub keeps a dated log of every change to a posted week and prices it under
a city's predictive-scheduling ("fair workweek") rules. Seattle, Oregon,
Chicago, Philadelphia and Los Angeles already had presets. New York City did
not, and adding it turned out to need more than new numbers.

## The other five cities pay hours. New York pays a table.

In the first five cities a late change owes hours of pay at the worker's wage:
one hour for an added or moved shift, half the lost hours for a cut. New York
City's fast food law (Admin. Code 20-1222) pays a flat sum per change instead:

| Notice | Added or moved, no hours lost | Hours taken away |
|---|---|---|
| 14 to 7 days | $10 | $20 |
| 7 days to 24 hours | $15 | $45 |
| under 24 hours | $15 | $75 |

So a premium no longer needs the person's wage. A worker earning $16 and one
earning $25 are owed the same $45 for a cut at four days' notice.

## Notice is counted to the week's first day

This was the surprise. The city's rules (6 RCNY 7-622(a)) count the notice from
the moment the revised schedule goes out to **12:00 a.m. on the first day of
the work schedule**, not to the shift that changed. Any change made on or after
the day before that first day counts as under 24 hours.

The rules give the example. A week starts Monday 27 July. On Sunday 26 July at
9 a.m. the employer cancels a Thursday shift. The shift is four days away, but
the change owes $75, the under-24-hours rate. Seattle's preset, which counts to
the shift, calls the same change four days' notice. The new `noticeFromWeek`
switch carries this difference, and any preset can turn it on.

## A shift moved to another day is one change

The hub's log pairs a person's shifts before and after a change. A shift that
keeps its day and changes its hours is "moved"; a shift that changes its day
shows up as a cancellation plus an addition. For hours-of-pay cities that sum
is what the rules describe. New York's third example says otherwise: a Thursday
shift moved to Friday at least 7 days ahead is one date change, $10. Priced as
two entries it would be $20 + $10 = $30. The New York preset now pairs a
cancellation and an addition made for the same person in the same moment and
prices them once. On a $20 wage, Seattle's preset prices the same move at $100.

## Smaller rules that changed the answer

- **15 minutes at each end.** The proposed rules called a change *de minimis*
  if the shift moved 15 minutes or less in total. The June 2022 final rules,
  as Fisher Phillips summarised them, give 15 minutes at the start and 15 at the
  end separately. So a shift that starts 15 minutes early and ends 15 minutes
  late owes nothing, while one that runs 20 minutes over owes $15.
- **Volunteers still owe it.** Seattle, Oregon and Philadelphia exempt hours a
  worker takes from a written offer to the whole team after a colleague's
  absence. New York's rules list volunteering, open-shift pick-ups and filling
  in for someone as changes that owe the premium, and say consent doesn't
  waive it. The absent worker's own dropped shift owes nothing.
- **Clopenings pay $100**, flat: two shifts on consecutive days with under 11
  hours between them. A same-day split shift is not a clopening.

## How sure is this

The city's code library and its consumer protection pages didn't answer from
the session that built this (403 and 404). The premium table comes from the
city labour office's own 2018 slides, and the counting rules from the city's
January 2022 proposed rules, worked examples included. The final-rule changes
come from a law firm's summary. The tests reproduce the rules' examples. Before
relying on the numbers, check them against the current rules. The
hub doesn't model the retail half of the law, which has 72 hours' notice and
no premiums, or who is covered (chains with 30 or more locations). It also
leaves out the exception for a cut shift that is still paid in full, and the
written consents the law requires. It is a record and an estimate, not legal
advice.

Details and the full source list:
[the venture README, "New York City fast food"](../../ventures/shift-roster-builder/README.md).
