---
title: "Two artists cannot share one bride: a scheduling bug in pooled minutes"
seo_title: "Bridal hair and makeup scheduling: why pooled artist minutes overstate capacity"
date: 2026-11-11
tags: [bridal-hair-makeup-pricing-calculator, scheduling, mutation-testing]
description: "Our bridal pricing calculator added up every artist's minutes and called a booking on time, even when the bride's own look took longer than the whole window."
---

The [bridal hair and makeup pricing calculator](../../ventures/bridal-hair-makeup-pricing-calculator/)
answers two questions for a mobile artist: what one wedding-day booking totals, and whether
the artists booked can get everyone finished before the bride has to be dressed. Today's
red-team run went at the second question and found that it could say yes when the answer
was no.

## The bug: minutes are not interchangeable

The capacity check worked like this. Add up every person's service minutes plus a
between-people buffer. Multiply the prep window by the number of artists. If the total
fits, nobody else is needed; if it doesn't, divide the shortfall by the window and round up.

That is fine for a bridal party of eight. It fails when one person's look is long. Take a
bride whose hair and makeup take 60 minutes plus 30 extra for the bride's own detail, so
90 minutes, an 85-minute window from arrival to dressing, and two artists booked. The pooled
arithmetic says 100 minutes of work against 170 minutes of capacity, plenty of room, and the
page printed its green "the artists booked can finish this group on time" line.

They can't. One artist does the bride's look, and that look takes longer than the window. A
second artist helps with the bridesmaids, not with the bride's eyeliner. No number of extra
artists fixes it: the fix is an earlier start or a shorter service, and an artist should hear
that before quoting the morning, not on it.

The calculator now reports `longestLookMinutes`, the longest single service someone in this
booking is actually down for (a long hair-only time doesn't count if nobody takes hair only),
and `lookLongerThanWindow`. When it is true, the page shows its own warning and the
"on time" verdict stays hidden. The buffer is left out of the look: it is setup and
transition, not work on that person.

## The smaller one: half a bridesmaid

Every count field took fractions. 2.5 bridesmaids priced as 2.5 people; 1.5 artists added
half a window of capacity; and a trial flag of 0.5 charged the full trial fee, because the
code tested `> 0`. The form's `step="1"` stops the spinner from producing these, but not a
typed value or a shared link. Headcounts, artists booked and the two yes/no fields now have
to be whole numbers. Prices, miles and clock times (6.5 for 6:30am) stay fractional.

## What the seeded faults said

The run seeded 8 faults into `calc.mjs` with `prompts/redteam.py`. The tests caught 6. The
two that got through were both about kids: flipping `+ kidsCount` to `- kidsCount` in the
headcount, and the kids' buffer from plus to minus. The default booking has no flower girls,
so no test ever looked. One new test with two kids catches both; the catch rate went from
6 of 8 to 8 of 8.

The pattern is one this portfolio keeps meeting: a test suite built on the worked example
covers what the worked example exercises, and a field the example leaves at zero is a field
nobody checked. That is also why the scheduling bug survived. The default booking has five
people, so the pooled total always ran out before any single look could.

*This calculator does arithmetic on numbers you type. It is not business or tax advice, and
it doesn't replace your own contract or accountant.*
