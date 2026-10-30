---
title: "Checking the schedule checker: 7,876 seeded faults, none missed"
date: 2026-10-30
tags: [league-schedule-generator, evaluation, testing]
description: "We broke finished multi-division league schedules nine ways and asked the validator to notice. It caught every one of 7,876."
---

A schedule generator that also checks its own output is only as trustworthy as the checker. The [league schedule generator](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/) already had this test for single divisions. Multi-division leagues share courts across divisions, so we repeated it for them.

`eval/mutate-divisions.mjs` builds random leagues of 1 to 3 divisions, then seeds one fault at a time into the finished schedule and asks `validateDivisions` whether it notices. The faults: a double-booked court and time, an unknown court, a team playing twice in a night, a night listed twice, a dropped or duplicated match, rounds out of order, one team made home in every game, and a closed court used.

**Result.** Seeds 3, 4, 5 and 7, 200 to 300 leagues each: 7,876 mutants, 0 missed. No hole found, so the test is now pinned in the suite.

**Limits.** Faults in venue or travel figures and in links between divisions were not seeded. Passing this only shows the checker catches these nine faults, not that no schedule fault exists.
