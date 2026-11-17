---
title: "When nobody can cover, free someone who could"
seo_title: "Building call-out cover into a staff schedule by moving two shifts"
date: 2026-11-13
tags: [shift-roster-builder, product, measurement, scheduling]
description: "On a 20-person week where no single shift move helped, freeing a stand-in cut the measured call-out exposure from 113 to 68 hours for $35 of score."
---

[Shift Roster Builder](https://marisstella.app/shift-roster-builder/) can trade a little pay for cover. Set a price per hour
at risk and it flags every person-day where, if that person called out, nobody else could take their shifts, even after
passing a shift or two down a chain. Then it moves shifts until the cost of a move is more than the risk it clears.
[Earlier today](2026-11-13-shift-roster-charging-for-slack-you-already-had.md) that check got stricter and more accurate. It also
showed a limit: the tool only ever moved the at-risk person's own shift.

## The stand-in is the problem

Look at a day the check still flags and the reason is nearly always the same. Two or three people could do the shift, but
each one is blocked by their own week. One is at their hours cap. One closed the night before and would not get their rest.
One already has a shift that day. Handing the at-risk shift to any of them is against the rules. Swapping it for one of
theirs breaks the rules too.

So the fix is to move one of the *stand-in's* shifts. The pass now tries three things for every person who could stand in:

- **a relief**: one of their shifts goes to a third person, so they have room to cover if needed;
- **a trade**: they swap a shift with a third person, so two shifts change hands at once;
- **a relay**: they take the at-risk shift, and one of theirs goes to the third person.

A move is kept only if it pays for itself at your price *and* cuts the hours at risk. The second rule came from the first
try. On one sample café, a relief saved $5 of pay but left risk where it was, and the measured exposure rose from 54 to 66
hours. A move made to save pay is not what you priced.

## What it bought

On the five sample teams it changed nothing: the moves it found were the ones the single moves already made. The café is
short-staffed, so there is no room to free anyone. On seeded 20- and 40-person weeks it was a different story. On one
20-person week the single moves found nothing at any price. With stand-in moves, four changes (one relief, one trade, and
two plain hand-overs that only paid once the first two had freed people) cut the flagged hours from 189 to 107, for $35.27
of score.

The flagged hours are only an estimate, so we ran the slow check. It plays every possible call-out, one person-day at a
time, through a real rebuild of the rest of the week. Summed over all 56 person-days, the open hours a call-out could leave
fell from **113 to 68**, 40% fewer. No shift was left open that had been covered before.

## The cost

The extra search adds a fraction of a second on 20-person weeks and one to two seconds on 40-person weeks. On the one
60-person week we tried, it added ten seconds and found nothing, so it switches off above 200 shift copies. It never
touches a schedule you have already posted, and `--no-cover-pairs` turns it off. The details and every number are in the
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder#moving-two-shifts-together-2026-11-13-later).

These are invented teams and seeded weeks, not a real shop. The exposure check is a model too: call-outs at 5pm the
evening before, with the rest of the week rebuilt to keep posted shifts where it can. If you run a team and would try
this on your own week, the tool is free and runs in your browser.
