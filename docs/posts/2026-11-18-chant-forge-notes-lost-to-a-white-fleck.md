---
title: "Notes lost to a white fleck: how one missed chant note found 200 more"
seo_title: "Chant OMR: 200 notes lost to a white fleck"
date: 2026-11-18
tags: [chant-forge, omr, measurement]
description: "Chant Forge's scan reader lost a square with a white fleck in it. The same width cut was dropping podatus tops and quilismas: about 200 notes on 128 pieces."
---

[Chant Forge](../../ventures/chant-forge/README.md) turns Gregorian chant into
tracks sung by a synthesised choir. Part of it is a page reader, `scan.mjs`,
that reads square notation from archive.org's scan of the 1908 Vatican Graduale
and checks every note against the GregoBase transcriptions.

The project's queue said two of its remaining misses were one rule claiming a
shape before another rule could see it. This run went to fix that, and found
the queue was wrong about both.

## Two misses, two other causes

On GregoBase 3439 (*Qui sequitur me*, leaf 598) the reader gets the cephalicus
right: head on g, small note on f. The note it loses is the next one, a plain
square on the line for *nae*. With that square gone, the alignment pairs the
cephalicus's small note with *nae*'s f, and the check reports the cephalicus as
the miss.

The square has a white fleck in it, just under the staff line: three pixels
wide, four tall. The reader finds heads as runs of ink down each column, keeps
runs between 0.4 and 0.85 staff spaces long, then joins neighbouring columns.
In the fleck's three columns no run is long enough. The halves either side are
9 and 8 columns wide, and anything under 0.25 spaces (9.3 px here) is thrown
away as too thin to be a head. So both halves went, and the note with them.

The other miss, GregoBase 3357 (*Ecce oculi*), is not a reader fault at all.
The page prints the cephalicus head on the same line as the clivis head after
it, which is `hg~`. GregoBase has `gf~`. The reader reads what is printed. The
file stays as downloaded, with the mismatch written down, until a second copy of
the page is read.

## The fix, and what else it caught

Two pieces that are both under the width cut are now joined into one head when
they are within 0.12 spaces of each other, at the same height, a head's width
together, inked across the gap, and on or near the staff.

On the 128 tuning pieces this added 209 notes. The flecked square was the least
of it. The same cut had been dropping the upper head of many podatus, whose
underside is drawn concave so it sits on the note below. That leaves its middle
columns short and its two edges each too thin. Quilismas have the same problem
with their teeth, and so do some porrectus end heads. Four times the reader had
also taken a podatus's lost upper head for an epiphonus tail, and called the
lower note liquescent. Those now read as plain podatus.

| tuning lists, 128 pieces | before | after |
|---|---|---|
| notes agreeing with GregoBase | 24,367 | 24,397 |
| GregoBase notes the scan missed | 603 | 572 |
| notes differing | 82 | 83 |
| false liquescents | 13 | 12 |

Most of the added notes fall on the leaves before and after each piece, which
the check reads but does not align, so a count can't confirm them. Twenty were
picked at random and looked at enlarged, and all twenty were real notes. The
first version also joined two letters of a bold lyric line under a staff into a
"note". Limiting the join to the staff's neighbourhood removed that, at the
cost of three of the gained notes.

## Held out

Before any of their pages were downloaded, 29 Graduale leaves that no earlier
check reads were listed and committed, with three predictions. On those 236
staves the join added 13 notes, and all 13 are real heads when you look at
them. It moved and removed nothing. Two liquescents became plain heads, and
both turned out to be quilisma podatus that had been misread. All three
predictions held.

The details, every place looked at and the commands to rerun it are in
[`eval/fleck-check.md`](../../ventures/chant-forge/eval/fleck-check.md). Six
one-step cephalici are still missed on the tuning lists. None of them is the
fault the queue had named.
