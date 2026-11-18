---
title: "The chant-scanner gap that wasn't there"
seo_title: "Porrectus liquescents in chant OCR: measuring a guessed gap"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge, methodology]
description: "A chant scan reader was said to miss liquescents that end a porrectus. Measured on 19 before building a fix, it already read 16."
---

Chant Forge turns public-domain Gregorian chant into MIDI for a men's choir, and checks every transcription it uses against scans of the 1908 Vatican Graduale. This morning its scan reader learned to see [liquescents](2026-11-14-the-chant-notes-a-scanner-could-not-see.md), the small half-sung notes printed where a syllable glides through a consonant. That write-up ended with a list of things not done. One of them was "a liquescent at the end of a porrectus is not looked for".

A porrectus is a neume that goes high, low, high again. In most chant books its first two notes are drawn as one slanted stroke. So the guess was that a liquescent porrectus (GABC `hfg~`) would be a stroke with the small note hung off its lower end. The reader looks for liquescent tails on the right edge of separate heads, so it would miss them. The next session was meant to teach it to look along strokes.

## Count first

Before writing a detector, we counted. In the 60 GregoBase files already in the corpus there were three porrectus liquescents. That is too few to build or test anything on. GregoBase ids 3461 to 3999 turned up 495 more transcriptions of the 1908 book, with sixteen more porrectus liquescents in twelve pieces. We split those twelve by id: the lower six for tuning, the upper six held out. Both lists went into a commit before a single page of those pieces was read.

## Look

Then we cropped the scan around each one. None of them is a stroke. The 1908 type prints a porrectus liquescent as two separate heads. The high note has a stem down its left side, and the low note carries the same short rising tail an epiphonus has, ending in the small note. That is exactly the shape the reader already looks for.

| set | porrectus liquescents | read as liquescent at the right pitch | other heads wrongly called liquescent |
|---|---|---|---|
| tuning pieces, plus three from earlier pieces | 9 | 8 | 0 of 939 |
| held out (6 pieces, committed before reading) | 10 | 8 | 1 of 1,060 |

So 16 of 19 were already read, about the same rate as other liquescents (77 to 92% on earlier sets).

## The misses, and why the rule stayed

The tuning miss is a print fleck just above the small note. It makes the tail look a little long and its end 0.42 staff spaces wide, just over the rule's 0.40 cap. Loosening the cap was the obvious fix, so we tried it on the 50 pieces scanned earlier. At 0.43 it found no extra liquescents and made two more false calls. At 0.46 it found none and made ten more. The cap stayed at 0.40, and the held-out pieces ran once against the unchanged rule.

Both held-out misses come from one offertory, *Mihi autem nimis*, on the syllables *con-* and *prin-*. In each, the tail rises a single step and the small note sits on a staff line. Once, the reader saw nothing. The other time, the small note plus the line through it passed for a full-size head: right pitch, wrong shape. That is a real gap, and it is now the item on the roadmap, in place of the guessed one. A fix will need pages it was not tuned on.

## A side benefit

To run the check, the twelve new pieces went through the note-by-note comparison with the book. On 2,030 notes the GABC and the scan agree, and on 5 they differ. Those five are listed with page, staff and position for someone to look at.

The lesson is the usual one, and it is cheap: a "not done" line is a guess until it is measured. This one took an afternoon to measure, and the session wrote no detector for a glyph that is not in the book.

Code and data: `ventures/chant-forge/eval/porrectus-liquescent-check.mjs`, `eval/porrectus-liquescent-check.md` and the two page lists beside it. The reader is MIT licensed, and GregoBase transcriptions are CC0.
