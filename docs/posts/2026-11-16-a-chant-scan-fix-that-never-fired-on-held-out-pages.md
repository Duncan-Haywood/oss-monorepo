---
title: "A chant-scan fix that was right, safe, and never fired on the held-out pages"
seo_title: "A sheet-music reader fix that never fired on held-out pages"
date: 2026-11-16
tags: [chant-forge, optical-music-recognition, reproducibility]
description: "Chant Forge's scan reader misread a liquescent sitting on a staff line. The fix held on 113 pieces, then did nothing at all on 15 pre-registered new ones."
---

Chant Forge reads Gregorian chant off scans of the 1908 Vatican Graduale, the
public-domain book on archive.org, and checks its own transcriptions against
them note by note. One known miss on the list was a *liquescent*: a small note
hung off the note before it on a short hook. In GregoBase 3464, on the syllable
*sanc-*, the book prints f with a hook coming down to d. The reader said e.

## Why the reader was a step off

To read the notes it first has to remove the staff lines without cutting notes
in half. So a line's pixels count as ink only where something runs out past
both edges of the line. That staff line had a lot of notes on it, which made
the line-finder measure it as 8 pixels thick when its own ink is 3. The hook
crossed the real line and stopped inside the "thick" one. Nothing ran out past
the measured edge, so the line's rows didn't count, the hook was traced only to
the line's top edge, and the small note came out half a line high: e, not d.

## Four tries on 113 pieces

The rule: when a hook stops at a staff line, carry its end through to the far
side of the line. Every try was measured on the 113 pieces from the eleven
earlier test lists, reading every page with the rule on and again with it off.

1. Extend any trace that stops at a line. That turned 130 stray marks into new
   liquescents. No good.
2. Only move the end of a hook the reader had already accepted. It fixed the two
   real cases, and also moved seven correct small notes. Those were notes
   printed in the *space* next to a line, and their edge touched it.
3. Only when the hook's ink runs unbroken into the line. That fixed six of the
   seven. The seventh touched the line without crossing it.
4. Only when the small note *straddles* the line: in the hook's column, the
   ink crossing the line has to go at least 0.08 staff spaces further than the
   line's own ink a little to either side. On the six cases looked at pixel by
   pixel, the two real ones measured +4 pixels and the four that only touch
   measured −1 to +1.

Frozen at try 4, the rule moves exactly two notes across all 113 pieces. Both go
from wrong to right.

## Then the held-out pages

Before downloading a single new page, a script picked the first fifteen
GregoBase pieces not used in any earlier list that cite the 1908 book and
have a liquescent whose small note sits on a line: 25 of those notes in all.
The list was committed, then the predictions were written down and committed:
at least one more of those 25 read right, nothing that was right going wrong,
and no change to other liquescents.

The rule moved nothing. Not one note on 60 pages. On those pages the reader
already gets 22 of the 25 right without it. The first prediction failed, and
the other two held, though only because nothing changed.

So the fix is real but rare. It needs a line measured thicker than its ink,
and that only happens on a crowded line. Earlier reports had filed the misses
under "a hook ending on a line", and that was mostly this rare case plus a
shape nobody had looked at. Two of the three held-out misses are that shape: a
*one-step* cephalicus, where the head and its small note sit so close that
together they're about one staff space tall. The reader takes the pair for a
single note at the lower pitch and drops the small one. That's next.

The rule stays on, since it fixed two notes and broke none on 173 pieces in
all. The failed prediction stays in the record: `eval/hook-on-line-check.md`
in [ventures/chant-forge](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge),
next to the script that reruns it.
