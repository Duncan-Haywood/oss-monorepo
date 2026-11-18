---
title: "A clean count hid false fires: teaching a chant scan reader the one-step cephalicus"
seo_title: "Looking at every change caught what the counts missed"
date: 2026-11-16
tags: [chant-forge, optical-music-recognition, gregorian-chant, reproducibility]
description: "A scan-reader rule for a small chant neume looked clean on 128 pieces until each changed note was looked at. Then a held-out test on unread pages."
---

Chant Forge reads Gregorian chant off scans of the 1908 Vatican Graduale, a
public-domain book on archive.org, and checks what it reads against GregoBase's
transcriptions. An earlier run left two notes it could not read. Both were
the same small neume: a **one-step cephalicus**. That is a square head with a
hairline stem down its left side and a small note one step lower, joined under
the head's right half.

Head and small note together are about one staff space tall. That is the
height the reader expects from two heads stacked a step apart. On one page it
split the block into two plain heads and read them bottom to top, as it reads
a podatus, so the order came out backwards. On the other page the small note
was too short to count as a head where it stood alone. Where it touched the
head, the split-off strip was too narrow to keep, so the note was lost.

## The rule, and the count that lied

The new rule (`oneStepCephalicus` in `scan.mjs`) looks under the head. It
asks for ink under the right half, a little below where the head's own ink
ends, and none under the left half. It also asks for a stem down the left
side. When it fires, the small note is read one step lower, after the head.

On the twelve earlier piece lists (128 pieces, about 24,000 aligned notes),
the second version of the rule looked perfect in the counts. It read nine
more cephalici and nine more notes agreeing with the transcription. Notes
disagreeing stayed at 82 and false liquescents at 13.

The counts only cover notes the alignment places inside a piece. Each list
also reads the pages either side of its piece, so the rule had changed notes
there too, where no transcription checks them. I cropped twelve of those
places and looked at them. Six were real cephalici. The rest were not:

- the upper head of a **quilisma podatus**, three times. The quilisma's body
  passed for the stem, and the podatus's right-hand stem passed for the small
  note;
- the top piece of a **porrectus** stroke that sloped too gently to be marked
  as one;
- two places on a blurred page.

Two more tests removed all six false fires. The stem has to be a hairline:
0.2 staff spaces across or less beside the small note, which a quilisma is
not. The head has to be level, which a stroke is not. The frozen version
reads five more cephalici on the tuning lists (69 to 74 of 84). It changes
14 places in all, and I looked at every one: each is a one-step cephalicus.
The price was three true finds of the looser version.

## A held-out test on pages nobody had read

The first held-out draw went wrong. Fourteen of its fifteen pieces sat on
pages that the tuning lists already read as neighbouring pages, and I had
looked at crops from some of them. I threw that draw away without running it.
The builder now skips any piece on a page an earlier list reads. GregoBase
ids up to 3999 gave twelve such pieces with 17 one-step cephalici. The list
and four predictions were committed before any of their pages was downloaded.

| | before | rule on |
|---|---|---|
| one-step cephalici read | 16 of 17 | 17 of 17 |
| notes agreeing / differing | 2,062 / 0 | 2,063 / 0 |
| false liquescents | 1 | 1 |

Three predictions held: at least one gain, nothing worse, and every changed
place a real cephalicus when looked at. One failed as worded. I predicted
"other liquescents read" would not change, but the gained note counts in that
column too, so it went from 19 to 20. My columns overlapped; the reader did
nothing new.

The honest headline is small. The reader already got most one-step cephalici
right, and the rule adds six across 140 pieces and loses none. The more useful
lesson is about method. A table of totals can stay clean while a rule fires
wrongly in places the totals never see. Here, looking at every change was what
caught it.

Details, crops and the tries that failed: `ventures/chant-forge/eval/one-step-cephalicus-check.md`.
