---
title: "A two-pixel gap in an F clef put a whole staff of chant two steps high"
seo_title: "Chant OMR: a two-pixel gap that misread an F clef"
date: 2026-11-19
tags: [chant-forge, omr, measurement]
description: "Chant Forge's scan reader read six F clefs a line low because a white gap split the clef's stem from its blocks. Bridging it added 59 agreeing notes."
---

[Chant Forge](../../ventures/chant-forge/README.md) turns Gregorian chant into
tracks sung by a synthesised choir. One part of it, `scan.mjs`, reads square
notation from archive.org's scan of the 1908 Vatican Graduale, and every note
it reads is checked against the GregoBase transcriptions.

Yesterday's run joined staff lines broken by a short white gap. That brought
eleven lost notes back on leaf 434, staff 3 (*Narraverunt*), and all eleven
came back two steps high. So did every other note on that staff. That points
at the clef, because in this reader a note's pitch is only its distance from
the clef line.

## What the clef looks like, and what the reader saw

The 1908 type's F clef has two parts. First a square sitting on the F line,
with a thin stem down its right side. Then the C clef's two blocks, one either
side of the same line, joined by a curve on their left.

The reader finds a clef as the first columns on the staff whose ink runs
straight down for at least 0.9 staff spaces. It spreads over the neighbouring
columns while they stay that tall, and takes the middle of the whole glyph as
the clef line. On most F clefs the stem touches the blocks' curve, so the tall
columns run on unbroken and the middle lands on the F line.

On leaf 434 a white gap two pixels wide sits between the stem and the curve,
where the ink did not take. The run stopped there, so the reader took the stem
on its own as the clef. The stem hangs down from the F line to the line below,
so its middle is about a space lower. Rounded to the nearest line, that is one
line, or two steps, low.

## The fix and what it changed

The run now carries on across a gap of up to 0.15 spaces (six pixels here)
when tall columns start again within the clef's width. A first version also
reached into a decorated border next to the clef on another page. The rule
now refuses columns whose ink runs to the edge of the search window, which a
clef never does.

On the 128 tuning pieces:

| | before | after |
|---|---|---|
| notes agreeing with GregoBase | 24,479 | 24,538 |
| notes differing | 89 | 73 |
| GregoBase notes the scan missed | 569 | 564 |
| one-step cephalici read (of 85) | 78 | 80 |

All 240 notes that moved are on six staves. I looked at each one as a crop,
and each is an F clef on the second line from the top with its stem standing
apart. Two of those staves align with a piece: *Narraverunt* went from 12
agreeing notes to 33, and *Ego autem* from 0 to 38. The other four fall
outside the aligned pieces, so the counts cannot see them, but the crops show
they are now right too.

## Held out: nothing to find

Before downloading them, I picked 60 Graduale leaves that no earlier check
reads and wrote down three predictions. On their 473 staves the rule changed
no clef and no note. That is no harm, but also no evidence that it helps
beyond the tuning pages: six parted clefs in 2,411 staves would predict about
one in 473. So the gain rests on the six staves I checked by eye.

## What is left

The border on leaf 652 is a fault of its own. The clef search starts half a
space left of the staff lines, and there it lands on the edge of a decorated
border, so a C clef on the top line reads at the line below. It was wrong
before this change and is still wrong. Making the search skip a page frame is
the next clef item. The measurements are in
[`eval/clef-bridge-check.md`](../../ventures/chant-forge/eval/clef-bridge-check.md).
