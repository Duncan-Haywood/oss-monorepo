---
title: "'Back on the 31st', said in November: the dates our reply sorter invented"
seo_title: "Parsing dates in email replies: February 30 and Date.UTC rollover"
date: 2026-11-11
tags: [sales-agent, dates, javascript, mutation-testing]
description: "JavaScript's Date.UTC turns February 30 into March 2. Our reply sorter booked follow-ups on days nobody named, and one huge number could crash an inbox run."
---

Today's red-team run seeded ten faults into `engine.mjs` of the
[sales agent](../../ventures/sales-agent/), the file that sorts replies to cold outreach
(away notice, "not now", opt-out, interested) and picks the day to follow up. The tests caught
two of the ten. Two of the eight that got through could not change anything a user sees. The
other six were real holes: "25/3" read with the day and month swapped, "end of the quarter" a
quarter off, a "paused" count on the summary that could read 0, and two hand-tuned windows in
the opt-out rules that could drift wider without any test noticing. Each now has a test that
fails with the fault in place (catch rate 2 of 8 that count before, 8 of 8 after).

Reading the date code for real bugs turned up two more.

## February 30 is March 2

`Date.UTC(2026, 1, 30)` does not fail. It returns March 2, because JavaScript rolls a day the
month doesn't have into the next month. The parser built dates that way for `2026/02/31`,
`31.02.2026`, `2/30/2026` and "the 31st", and it returned an ISO date like `2026-02-30` exactly
as typed. So:

| The reply said | Today | Follow-up booked (before) | Now |
|---|---|---|---|
| "call me on the 31st" | 10 Nov | 1 Dec | 31 Dec |
| "back 2026/02/31" | any | 3 Mar | no date |
| "returning 2026-13-45" | any | `2026-13-45` | no date |
| "the 0th" (a typo) | 10 Nov | 30 Nov | no date |
| "in 1 month" | 31 Jan | 3 Mar | 28 Feb |

A follow-up on a day the person never named is a small thing until it's your prospect who said
"the 31st" and got your email on the 1st. The code already knew the rule: its helper for "March 3"
had a comment saying a day the month lacks "is not a date". The other paths just didn't use it.
Now each of them builds the date and checks it reads back as the same year, month and day.
If it doesn't, the reply counts as giving no date, and the usual default applies.

## One reply could stop the whole inbox

"Back in 99999999 days" goes past the largest date JavaScript can hold, and `toISOString()`
throws a `RangeError`. That happened inside the sorter, so one stranger's reply stopped the run
for every other reply in the batch. Now a date past year 9999 counts as no date.

## The guard that stays

Next to the one-off tests, the suite now runs a property check. It feeds `findDate` 13 date
shapes, crossed with 12 numbers for each of two slots, from five awkward "today" dates (31 January,
29 February in a leap year, New Year's Eve). That's 9,360 inputs, and every answer has to be either
nothing or a real calendar day. On the old code it fails at once with "Invalid time value". The next
change to the date code has to pass it too, and no red-team run is needed for that.

Sorting replies is a judgment the sales agent helps with, not a decision it makes: every draft
waits for a person to approve it.
