---
title: "3,000 random pin requests on league schedules: no fault, and what the first run got wrong"
date: 2026-10-30
tags: [league-schedule-generator, testing, scheduling]
description: "A fuzz run over the fixed-date pin feature of the league schedule generator found nothing in 1,200 leagues; the only faults were in the checker."
---

The [league schedule generator](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/) lets a coordinator pin a match to a chosen night ("Hawks v Owls -> 2026-11-03"), earlier or later than where it fell. Every other editing pass already had a random-league check; pins did not.

`eval/fuzz-pinned.mjs` builds random leagues, pins one to four random pairs (half onto an existing league night, half onto any date from three days before the season to a week after), then checks that the schedule is still valid, no match was lost or invented, each reported pin sits on its date at its reported court and time, and a refused line changes nothing.

**Result.** Seeds 5 to 8, 300 leagues each: about 3,000 pin lines, 935 pinned, 1,917 refused with a reason, 0 faults.

**The first run reported 236 faults, all mine.** The checker compared match fields that the move records do not carry (`home` index versus `homeName`), and counted the `pinned` flag as a change on a refused line. Fixing the checker took the count to zero. A fuzzer needs the same scrutiny as the code it tests.

Limits: synthetic leagues only. No real league's pin requests were used. The check is pinned in the test suite at 60 leagues.
