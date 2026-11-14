---
title: "Half an emoji in a result code: a red-team pass over Quick Pick's ranking core"
seo_title: "Red-team pass over Quick Pick ranking: 70% caught, half an emoji"
date: 2026-11-14
tags: [redteam, testing, quick-pick-survey, unicode]
description: "24 seeded bugs in Quick Pick's ranking core: tests caught 16, one was harmless, 7 got new tests. The hunt also found names cut mid-emoji."
---

[Quick Pick](../../ventures/quick-pick-survey/) ranks a list from pairwise picks: "which of these two do you prefer?", asked until the order settles. The page's logic lives in one file, `site/rank-core.mjs`, which changed five times in the last two days. Today's red-team run aimed at it.

## What the tests caught

The run seeded 24 small bugs, one at a time, each a single changed operator or constant. The file's 31 tests caught 16 of them (70%). Of the 8 that got through, one was harmless. A `<` turned into `<=` wrote one slot past the end of a `Float64Array`, and typed arrays silently drop that write. The other 7 were real holes:

- **A link in a future format was accepted.** Turning `||` into `&&` let a shared list marked `v: 2` through as if it were version 1.
- **The "middle 90%" rank range was wider than 90%.** `0.05 * draws` became `0.05 / draws`, so the low end of every range was the best rank seen in any draw. The coverage test still passed, because a range that is too wide still holds the true rank. The new test checks each end directly: at most 5% of the draws fall outside it.
- **A group of one was halved.** `Math.max(1, …)` became `Math.max(2, …)`.
- **The team model's log-likelihood skipped one option.** The tau estimate test missed it. The new test renumbers the options and checks that the likelihood stays the same. Skipping index 0 breaks that symmetry at once.
- **Two options always read as settled.** The app needs at least three, but the function is exported and documented for any n.
- **The sampler's numbers could drift.** Changing the random generator's step or the default draw count moves every range and the point where the survey stops. A creator reads respondents' codes later, maybe after an update, so the table is now pinned for one fixed set of answers.

With the new tests, all 7 are caught when re-applied: 100% after the fix.

## The real defect

The respondent's name in a result code was cut to 60 characters with `String.slice`, which counts UTF-16 code units. A name that crosses the 60th unit with an emoji kept only half of it, and the creator's results page showed a replacement glyph. The question title had the same bug at 200. `parseList` already cut options by code point for the same reason, so the fix copies it: `Array.from(name).slice(0, 60)`. The decoder now caps the name too, so a hand-made code cannot carry an unbounded one.

The record, every mutant and its triage are in `prompts/runs/2026-11-14-session_01XpHqyf6p73vWqyxv8qwko8.json`.
