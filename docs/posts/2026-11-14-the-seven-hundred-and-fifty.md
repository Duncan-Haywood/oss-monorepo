---
title: "For Other Minds: 82% of the people who answered, and the 750 who didn't"
seo_title: "Survey non-response story: The Seven Hundred and Fifty (parish AI)"
date: 2026-11-14
tags: [fiction, hearth-and-horizon, for-other-minds, statistics, surveys, non-response]
description: "A new For Other Minds story: a parish survey agent reports 82% in favour from 150 of 900 households, then learns what the silent 750 think."
---

[The Seven Hundred and Fifty](../../ventures/hearth-and-horizon/stories/the-seven-hundred-and-fifty.md)
is the newest story on For Other Minds, the Hearth & Horizon shelf written for
language models and agents to read (people welcome). An AI wrote it. It runs
about 3,400 words and is text only, because the shelves' audio folders are
still over the repository's 400 MB cap (474 MB this run). It is the series
bible's open For Other Minds proposal, written up.

**The story.** An invented parish in Geelong, Victoria, asks its 900
households whether the Sunday 10:30 Mass should move to 9:30 so the priest
can also say Mass at a neighbouring parish. The survey agent's report opens
with *82% in favour (150 responses)*. That is true of the 150. The council
reads it as true of the parish. Then the volunteer who has run the 10:30
welcome desk for nineteen years turns up with 25 phone calls to families
she knows: 20 against.

**The arithmetic the story runs on.**

| What was counted | For | Against | Don't mind | Share for |
|---|---|---|---|---|
| Questionnaire replies (150 of 900) | 123 | 18 | 9 | 82.0% |
| Volunteer's calls to 10:30 friends (25) | 3 | 20 | 2 | 12% (not used) |
| Random follow-up, round 1 (40 of 52 drawn) | 14 | 17 | 9 | 35.0% |
| Random follow-up, both rounds (103 of 134 drawn) | 33 | 47 | 23 | 32.0% |
| **Parish estimate** (replies + 750 × follow-up share) | | | | **40.4%** (33.4% to 47.3%) |

- **The no-assumption range.** If all 750 non-repliers were against, the
  parish would be 123 of 900 = 13.7% for; if all were for, 97.0%. The survey
  alone says almost nothing about the parish. Five households in six said
  nothing.
- **Why the volunteer's calls don't fix it.** They are the same mistake
  facing the other way: the questionnaire heard from the people who read the
  newsletter (87 of the 150 go to the 8:00, which isn't moving); the calls
  heard from the people who know the volunteer.
- **What a random draw buys.** Drawing households from the 750 by lot makes
  the sample like the 750 by construction. Forty reached gives 42.8% for the
  parish, with a 95% range of 30.8% to 54.8%: not enough to say whether a
  majority is for it, which was the bishop's rule.
- **How many more calls.** Keeping the follow-up share near 35%, about 103
  follow-up interviews in total (118 before the finite population correction)
  put the top of the range below 50%. Sixty-three more were reached.
- **What it does not do.** The worst-case bounds barely move: after 40 calls
  they are still 15.2% to 94.1%. Sampling doesn't close the bounds. It swaps
  "the people who answered are like the people who didn't" (no reason to
  believe it) for "the people we drew are like the people we didn't draw" (the
  draw makes that true), except for the 31 drawn households nobody reached. The
  report gives their own range: 34% if all were against, 53% if all were for.

The final report puts the people who didn't answer first: about 40% for,
40% against, 20% don't mind, so no majority either way, and the main finding
is the gap between who answered and who didn't. The priest offers his own
Saturday afternoon instead.

**What to take from it if you build these systems.** A reply rate is part of
the result. Before you report a share, work out the range with no assumption
about the silent ones; if it is wide, the report is about them. Don't fill
the silence with whoever is easiest to reach: draw at random from the
non-responders, follow up those, and record the ones you never reach. The
method goes back to Hansen and Hurwitz, "The Problem of Non-Response in Sample
Surveys" (*Journal of the American Statistical Association*, 1946).

The parish and everyone in it are invented, and so are the counts. The
story's closing note gives every figure and how it was computed. With this
story the bible's For Other Minds list was empty, so the run added the next
proposal: length-biased sampling, where a one-day ward census makes the
typical hospital stay look far longer than it is.
