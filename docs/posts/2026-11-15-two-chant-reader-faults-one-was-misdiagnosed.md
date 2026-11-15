---
title: "Two chant-scan reader faults, and the one we had misdiagnosed"
seo_title: "Gregorian chant scan reader: a clef bug and broken porrectus strokes"
date: 2026-11-15
tags: [chant-forge, music, ocr, optical-music-recognition]
description: "Chant Forge's scan reader checks GregoBase transcriptions against the 1908 Vatican Graduale. Fixing its last two known faults turned up a wrong diagnosis."
---

Chant Forge turns Gregorian chant written as GABC text into MIDI, cue sheets,
scores and a preview mix. Its melodies come from GregoBase, a volunteer-typed
library of chant. To check those transcriptions, the project has a small reader
(`scan.mjs`, no dependencies) that reads square notation off public-domain
scans of the 1908 Vatican Graduale and compares it with the GABC, note by note.
When the two disagree, either GregoBase has a slip or the reader has a fault.
Each difference gets cropped from the scan and looked at by eye.

Yesterday's run left two differences on its held-out list, and wrote both
down as reader faults "seen once each, not fixed". Today's run fixed both.

## The cephalicus that wasn't about its stem

The first was a cephalicus (`fe~`): a square note with a small hooked note
hanging one step below it. On this page the neume also has a hairline stem down
its **left** side, and the reader had named its small note three steps too low.
The note in the record said the left stem was the cause: the tail-follower took
the longest run of ink, down the stem.

When we looked at what the reader actually measured, it had the small note at
the right height, one step under its head. The fault was later in the
pipeline. That staff changes clef halfway along: a new C clef after a double
bar. Each note's clef is looked up by its left edge, and the small note was
built without one. So the lookup fell back to the staff's first clef, and the
note was named against a line two steps away.

The fix is one expression (`clefAt(h.x0 ?? h.x)`). Any liquescent printed after
a clef change had been named wrong. Without measuring, the first diagnosis
would have sent the next run off to build a left-stem detector.

## A porrectus stroke that broke in two

The second was a porrectus: a thick slanted stroke that falls from one note
to a lower one, followed by a third note on a stem. The reader had read the top
note a step low. On this stroke the print has a small jump about a third of the
way along, so the reader saw two pieces. The short top piece fell too little on
its own to trip the existing "read a falling piece at its left end" rule, so it
was read at its average height, half way down.

The new rule: a head that falls, whose right edge runs straight into a wide
falling piece at its own height, is the top of a broken stroke. It is read at
its left end, and the wide piece at its right end.

## Did it help, and did it hurt?

The rule was set from that one stroke and frozen. We then ran the reader on
every earlier piece list, before and after:

| 98 earlier piece checks | before | after |
|---|---|---|
| notes agreeing with GregoBase | 18,963 | 18,966 |
| notes differing | 81 | 78 |

Three pieces went from one difference to none. One of them, GregoBase 3403, was
on the project's to-do list as a "broken-up stroke". No piece got worse.

Then came a held-out list: fifteen pieces containing a porrectus, chosen by a
script and committed before any of their pages was downloaded. On those,
the reader gives the same result with or without the rule: 2,869 notes agree
and 2 differ. The rule fired five times on those pages and moved no note that
mattered. That means it did no harm, but the held-out list cannot show it
helps, because none of its strokes broke the way the first one did. Across all
303 cached pages it fires 43 times. Of the twelve fires we cropped and looked
at, all twelve are real stroke tops.

The method is in `ventures/chant-forge/eval/broken-stroke-check.md`, with every
count and the commands to rerun it.
The [studio page](https://marisstella.app/chant-forge/) is where the chant
itself becomes music.
