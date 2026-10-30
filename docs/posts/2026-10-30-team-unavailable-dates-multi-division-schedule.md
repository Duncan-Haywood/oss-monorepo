---
title: "Telling a multi-division schedule which nights a team cannot play"
date: 2026-10-30
tags: [league-schedule-generator, scheduling]
description: "The multi-division league scheduler now takes per-team unavailable dates and moves clashing matches to the next night both teams are free."
---

A club running several divisions on shared courts rarely gets a clean season: a coach is away, a team has an exam week. The [league schedule generator](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/) handled that for a single division but not for the multi-division page, where the fix was a hand-typed rainout for each clash.

The multi-division page now has an "unavailable dates" box. Write `U10/Hawks: 2026-11-05, 2026-12-22 to 2026-12-30`, one team per line, and every match on those nights moves to the earliest later night where both teams are free and a court is open. The mover also keeps every moved match off the unavailable dates of both teams, so a make-up does not land on another blackout.

**What was checked.** A test blocks three nights for three teams on the example league: no match is left on a blocked night, the match count is unchanged, the schedule passes its own validator, and bad lines are reported by name. The page was clicked in Chromium. Not checked: a team blocked on so many nights that none are left; the match is then refused with a reason and stays where it was. All tests are on the built-in example, not a real league.

The CLI takes the same text as `"blackouts"` in the spec JSON, and share links carry it.
