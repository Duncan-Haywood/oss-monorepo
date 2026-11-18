---
title: "A small note with a hole in it: three chant liquescents the scanner lost to the print"
seo_title: "Chant OMR: liquescents lost to a hollow small note"
date: 2026-11-18
tags: [chant-forge, omr, measurement]
description: "Chant Forge's score reader missed ten one-step cephalici. Four had the same cause: the 1908 Graduale prints their small note with a white counter."
---

[Chant Forge](../../ventures/chant-forge/README.md) turns Gregorian chant into
tracks with a synthesised choir. Part of it is a page reader (`scan.mjs`) that
reads square notation from scans of the 1908 Vatican Graduale on archive.org
and checks it against the GregoBase transcriptions, note by note.

One shape it finds hard is the one-step cephalicus: a note with a hairline
stem down its left side and a small note one step lower, tucked under its
right half. Head and small note together are about one staff space tall, so
they look like one note, or like two touching notes. A rule for that shape
landed two days ago. It reads 74 of the 84 in the tuning pieces. Nobody had
looked at the other ten one at a time.

## Looking at the ten

The check script now lists every miss with its page, staff and position. All
ten were cropped at four times the size, and where the rule had tried the
note, its window was printed out pixel by pixel. Four of the ten had the same
cause, and it was in the print, not the layout. This edition draws many small
notes with a white counter, a hole in the middle:

```
  46 ·············██········#███··███·····
  57 ·············██········#███··███·····
  70 ············████······█#████████·····
  79 ············████·······|███████······
```

The rule counted a row of the small note only when it had a solid run of ink
wider than a stem. The rows with the hole are two thin bars, so they didn't
count. The three to five solid rows at the bottom weren't enough on their own.

## The fix, and where it was allowed to act

Now the run-width test bridges a gap of up to a tenth of a staff space. Every
other test still has to pass: the hairline stem, the level head and the ink
ending where a small note ends. On the tuning pieces, cephalici read went from
74 to 77 of 84. Agreeing notes went up by three, and nothing got worse. All
four places the change touched were checked by eye, and all four are real.

The held-out test was the awkward part. Earlier rounds checked each rule on
pieces never used in tuning. This time the GregoBase transcriptions of the
1908 Graduale had run out: one unused piece was left. So the check, written
down and committed before any page was downloaded, used that piece plus 31
Graduale pages that no list had ever read. Each page was read with the bridge
and without it. With no transcription to align against, that measures only
precision: does the change ever add something that is not a cephalicus? It
changed two places on the 31 pages. Both are one-step cephalici with a hollow
small note, read at the right pitch. All four predictions held.

## What is left

Seven misses remain. One has a stem with a break in the print. One is a head
that slopes just past the level-head limit. Two (one tuning, one held out) are
taken first by a different rule, the liquescent-tail reader, which reads the
small note a step too low. That is the next item. Three haven't been traced.
Details and every number: [`eval/one-step-hollow-check.md`](../../ventures/chant-forge/eval/one-step-hollow-check.md).
