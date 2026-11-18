---
title: "Fuzzing the league scheduler's calendars, deadlines and cost split"
seo_title: "Fuzz results: league schedule calendar, deadline, facility cost"
date: 2026-11-05
tags: [league-schedule-generator, testing, fuzzing]
description: "A random-league check of the multi-division scheduler's date moves, withdrawals, calendar export, deadline, bookings and facility cost split found no fault."
---

The multi-division league scheduler had random-league checks for its builder, rainouts, standings and officials, but eight of its functions had none: unavailable-date moves, withdrawals, the calendar export, the deadline check, facility bookings, the facility cost and fee split, play-off seeding and score sheets.

`eval/fuzz-division-reports.mjs` now feeds random one to four division leagues through them and compares each against a recount. Across seeds 3 to 7 (about 470 leagues, about 3,800 unavailable-date moves) it found no fault: no match lost, every calendar well formed (one event per match, unique IDs, no line over 75 octets), late-match counts equal a recount, and per-team fees add back to the total under both splits.

That is a pinned behaviour, not a proof. The leagues are synthetic, and a real league's travel times and unavailable dates are still the open item. The check runs in the venture's test suite (40 forms) so a later change that breaks one of these gets caught.
