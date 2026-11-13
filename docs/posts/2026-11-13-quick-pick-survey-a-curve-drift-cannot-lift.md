---
title: "When honest survey takers speed up on their own: a curve that does not drift with them"
seo_title: "Careless-respondent checks: fewer false flags when pace drifts"
date: 2026-11-13
description: "Reading later passes against the median of the people not yet flagged cut false flags on honest respondents by about a third when each person's pace drifts."
tags: [quick-pick-survey, surveys, data-quality, response-time, changepoint, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking people to pick between two options at a time. It records how long each
pick took. One of its time checks, "rank without answers after someone sped
up", looks for respondents who answer carefully at first and then click
through the rest. It compares each person's answer times with the rest of the
panel's times at the same point in the survey. When someone's times fall to
well below the panel's and stay there, that looks like a block of careless
answers, and the check leaves those answers out.

## The curve and its trade-off

"The panel's time at that point" used to mean the median. That fails when a
large share of the panel gets bored at about the same moment. They pull the
median down with them, so their own drop looks small. Earlier today the
check switched to the upper quarter of the panel's times (the 0.75
quantile), which a 40% group of quick clickers cannot drag down.

A later simulation found the cost of that. Real people also speed up or slow
down on their own over a session. When they do, the panel's spread grows from
the first answer to the last, and an upper quantile rises with the spread.
Against a curve that drifts upwards, everyone's times look as if they are
falling. With each person's own pace drifting by about 45% over the session
(0.6 on the log scale), the check flagged up to 9.4% of entirely honest
respondents, even with a test that a block has to look like a step, not a
steady slope.

## Use each curve where it is safe

The check already runs in up to three passes. Each pass rebuilds the panel
curve without the blocks that the pass before found. The upper quantile only
matters in the first pass, while the quick clickers are still in the curve.
Once they are out, the median is safe again. The median is also the one
point of the distribution that spread growing evenly in both directions does
not move.

So the first pass now reads the 0.75 quantile, and the second and third read
the median of the people still in.

## What the simulation says

The simulation used 168 cells: two careless patterns, 25% and 40% careless,
quick at 0.4x or 0.6x the honest pace, onsets from a quarter to three
quarters of the way through, warm-ups, shared learning curves, a 60-person
stress panel, and panels with nobody careless or with a camp of honest people
who disagree. It ran each cell at three levels of personal drift, with 40
simulated surveys per cell.

| personal drift | honest respondents flagged, before | after |
|---|---|---|
| none | 0.0-0.1% | 0.0% |
| 0.3 log | 3.6-3.8% | 2.7-3.3% |
| 0.6 log | 7.5-8.3% | 4.8-5.2% |

The share of the damage that leaving out exactly the careless answers would
undo stayed level in every drift group (98%, 86% and 64% against 98%, 85% and
66%). The ranking's cost when nobody was careless did not move.

## What it does not fix

At the heaviest drift, about one honest person in twenty is still flagged.
That part comes from a single person's own noisy drift: over 40 answers, a
random walk sometimes looks like a step. No panel curve can fix it. A
per-person test might, and that is the next item. Whether real people drift
this much at all is a question for the first real survey's answer times.
Until those are in, the check stays a comparison view, not the default.

Method, tables and raw rows: `docs/INFORMATION-GAIN-SELECTOR.md`, "A
later-pass curve that drift cannot lift", and
`docs/fast-blocks-later-q-2026-11-13.jsonl` in the venture.
