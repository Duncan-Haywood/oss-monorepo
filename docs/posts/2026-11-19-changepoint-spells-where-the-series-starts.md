---
title: "Does it matter where a series starts? Short reporting spells under six openings, pre-registered"
seo_title: "Short reporting spells under different series openings"
date: 2026-11-19
tags: [changepoint-detection, data-quality, monitoring, statistics]
description: "Planting the same short reporting spell after six series openings: the opening decides which line dates it, the spell's weekdays decide whether it is found."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has an opt-in check, `--spells`, for
a feed that publishes on fewer days for a month or two and then goes back to its old schedule. Earlier today it
failed a check on The New York Times' state COVID-19 series. One reason was strange: NYT's Alaska series matches
Johns Hopkins' month by month, but it starts 50 days later. With the shorter opening, the tool's default
update-rate line cut both edges of the spell itself, which left the spell search, which looks *between* those
cuts, nothing to find. The line said "none found". It now restates such a pair of cuts as a spell.

That raised two questions nobody had measured. Does the line a user reads date a spell equally well wherever the
series starts? And does the restated pair of cuts print false spells on series that have none?

## The test

We wrote the rules [before running anything](../../ventures/changepoint-detector/eval/update-rate-spells-openings.mjs).
We planted five spell shapes (Wednesdays only, or Monday/Wednesday/Friday, inside a Monday-Friday schedule for 30
or 60 days; Monday-Friday inside daily for 60) after six openings: 120, 250, 500 or 800 days of the normal
schedule, or a 50-day quiet start (a series that begins with its zeros) and then 250 or 500. We ran 200
simulated series per cell, plus four schedules with no spell at all under the same openings. Four bars were set
in advance.

## What happened

**The restated cuts never raised a false alarm.** None of the 4,800 no-spell series printed a spell, at any
opening. They are also doing real work. On Alaska's shape, the default line's two cuts are what date the spell
in 149 to 186 of 200 series at every opening; the search finds it in 10 to 43. On South Dakota's shape the Alaska
prediction holds exactly: the shorter the opening, the more spells move from the search to the cuts (98 of 200 at
120 days, 3 at 800). Either way the line a user reads dates all 200.

**Two bars failed.** One-month Monday/Wednesday/Friday spells were found in 135 to 181 of 200 depending on the
opening, past the 30-series tolerance. Two-month weekday spells inside a daily feed were missed by both lines in
22 to 59 series at every opening. That second bar was simply set too high: the earlier round had already measured
this cell at 157 of 200.

## Why, read afterwards

The first failure turned out not to be about the opening. Changing the opening's length also changed the weekday
the spell started on. A Monday/Wednesday/Friday spell differs from Monday-Friday only on Tuesdays and Thursdays,
and 30 days hold 9 of those if the spell starts Monday to Thursday, 8 if it starts Friday to Sunday. The three
failing cells were exactly the three Friday-to-Sunday starts. A [separate run](../../ventures/changepoint-detector/eval/update-rate-spells-openings-why.mjs)
that held the opening fixed and moved only the first day confirmed it: 163-174 of 200 found with 9 informative
days, 120-146 with 8. The weekday spell inside daily behaves the same way (170-177 with 18 weekend days inside,
134-144 with 16 or 17).

So where a series starts decides *which* line dates a spell, not *whether* the user sees it. What limits the
line is how many days inside the spell the two schedules actually differ on. Nothing in the tool changes, and the
README now carries that caveat with the numbers. The next round will try a search that scores only the
differing weekdays.

*This is a statistical screen on simulated and public data, not advice; the detector is MIT licensed and runs
locally.*
