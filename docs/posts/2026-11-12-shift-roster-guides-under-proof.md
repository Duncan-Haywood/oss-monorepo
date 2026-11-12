---
title: "We re-ran our scheduling guides with a proof, and some of their lessons changed"
seo_title: "Rest gaps, time off and shift limits: scheduling guide figures re-derived with an exact solver"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement]
description: "Fourteen guide pages quoted a quick heuristic. Re-derived with proven-best rosters, a 10-hour rest gap costs a café nothing, two weekend requests are free, and a rotation setting evens tough shifts out exactly."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/) has fourteen guide pages. Each one runs the builder on an invented week, changes one thing and reports what happened: a rest gap between shifts, a cap on days in a row, weekend time-off requests, teenage workers' hour limits. Tests check every figure against the engine, so the pages can't drift away from it without a test failing.

They had drifted anyway, by design. Earlier today the builder started running its exact check by default. That's a column-generation and branch-and-price search that proves when no roster under the same rules does better. The guides still quoted the quick search, with a note saying so. On the sample café the quick search leaves 19 hours open. The builder now shows 15 and says it's the best possible. Anyone who copied a guide's week into the builder got numbers that didn't match the page.

So we re-derived all fourteen with the default build. Where the page's table comes straight from single builds, the tests now also check that each roster is proven.

## What changed besides the digits

Some lessons were artefacts of the heuristic missing rosters:

- **Clopening.** The page said a rest gap of 8 to 12 hours leaves one more shift open than no rule. It also showed a 14-hour gap covering *more* hours than a 12-hour one, which can't be right. With proof: a rest gap of up to 10 hours costs this café nothing (220 hours covered, $3,690, with or without it). 12 and 14 hours each cost two hours.
- **Days in a row.** The old table had five days in a row costing a shift, and four days covering more than six. Proven: six, five and four all cost nothing. Three costs 16 hours.
- **Time off.** The second weekend request used to cost a shift. Proven: the first two are free and the third costs 8 hours.
- **Rotating tough shifts.** Six identical staff over eight weeks. The spread setting used to narrow the gap in closes and weekends from 3 to 2. With proof, a setting of 10 gives all six people exactly 36 tough shifts each, at the same $28,200 payroll.
- **Covering a call-out.** A full rebuild used to find cover for 24 of 29 possible call-outs. Now it's 15 of 27. The proven week already covers every hour it can, so there's less slack left for a rebuild to find. The patch-first advice gets stronger.
- **Changing a posted schedule.** Rebuilds now find cover every time, but they move 3 to 15 other people's shifts to do it, against 4 to 10 before.

Some things didn't change. Restaurant, retail, salon, daycare and the hiring example came out the same under both searches.

The café's five open shifts also have a plain explanation now: they're the weekday 11am to 2pm lunches, and everyone free then is already at their weekly limit. The [widening page](https://marisstella.app/shift-roster-builder/whose-availability-is-worth-widening.html) now points at the same three people as before. Freeing Cleo closes four of the five.

## Why it matters

A guide that measures what a rule costs is only as good as the search behind it. A heuristic that misses rosters makes rules look more expensive than they are, and its misses aren't even consistent from row to row. Rows that are each proven can be compared honestly. "This limit costs nothing here" then means no roster could do better, not that our search didn't find one.

## What we don't claim

These are invented weeks, not benchmarks, and your availability decides your numbers. The call-out and posted-schedule studies make about 60 builds each, and those aren't individually checked as proven yet. The exact check has a time limit on big weeks. Every week here is small (16 to 32 shifts) and proves in under three seconds, but a much slower machine could stop early. The full table of before and after is in the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder#the-guide-pages-re-derived-with-the-exact-check-on-2026-11-12).
