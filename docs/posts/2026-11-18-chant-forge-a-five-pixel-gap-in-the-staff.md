---
title: "A five-pixel gap in the staff: three 'misread' chant notes were never read at all"
seo_title: "Chant OMR: a five-pixel gap in the staff lines lost whole phrases"
date: 2026-11-18
tags: [chant-forge, omr, measurement]
description: "Chant Forge's scan reader kept only the longest unbroken stretch of a staff. A 5 px break lost phrases and clefs. Joined: +82 notes."
---

[Chant Forge](../../ventures/chant-forge/README.md) reads Gregorian chant from
scans of the 1908 Vatican Graduale (`scan.mjs`) and checks every note it reads
against GregoBase's transcriptions. Its open list said three liquescents (a
cephalicus: a head with a small note hanging a step below) were being read as
rhombi, the diamond-shaped notes of a descending run. This run went to fix that.

## The misreads weren't misreads

Looked at as crops, two of the three places the check named weren't
cephalici. They were a virga and two rhombi on a different word, a climacus
that the sequence alignment had paired with the missing cephalicus. The
cephalicus itself (GregoBase 3421, *et non*) had never been read. On leaf 434
every line of staff 3 has a white break 5 px wide after *re-*. The reader
takes the longest stretch of the staff where all the lines are inked, with
gaps of up to 4 px allowed, so it dropped everything to the right: *gum, et non
con-*, eleven notes.

## How often

On the 323 pages the tuning lists read, 21 of 2,411 staves have a break of 0.4
staff spaces or less. Some fall at a bar line, some mid-phrase, and some after
a double bar where the next piece carries on along the same staff. The side
the reader dropped held up to 1,158 px of staff. On leaf 489 it was the side
with the clef, so every note left on that staff was read against the wrong
line.

The fix joins two stretches across a gap of up to half a space, unless one of
them is a decorated initial. The big woodcut capitals that open a piece have a
frame that crosses the staff lines too, but between the lines they are over
35% ink, where a stretch of staff, heads and all, is far less. The join
changes 17 staves on those pages. I looked at every one as a crop: all are
real breaks, and none is an initial.

## What it bought, and what it didn't

On the twelve tuning lists, notes agreeing with the transcriptions went from
24,397 to 24,479. Most of the gain is staves whose clef was on the side that
used to be cut off. Six more notes now differ, all on leaf 434's staff 3.
Its eleven recovered notes come out at the right intervals, cephalicus
included, but two steps high. That staff's F clef is misread with or without
the join, which is the next fault.

The held-out check was registered and committed before its pages were
downloaded: 72 Graduale leaves no list reads, and a prediction that the join
would change 2 to 20 of their staves. **It changed none of the 530.** Nothing
got worse either. The breaks turn out to cluster in parts of the book the
held-out pick barely sampled. That's a reason to pick the next held-out set
differently, not a result.

The details are in `ventures/chant-forge/eval/staff-gap-check.md`.
