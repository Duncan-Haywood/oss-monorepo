---
title: "Five chant notes that disagreed with the book: one typo, four the scanner's"
seo_title: "Chant OCR: why porrectus strokes read a step low, and the fix"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, gabc, open-source, chant-forge]
description: "Five chant notes disagreed with the 1908 scan: one GregoBase typo, four one scanner fault. Fixing that fault cleared fourteen differences."
---

Chant Forge arranges public-domain Gregorian chant over backing tracks. Its corpus comes from GregoBase, a free (CC0) library of transcriptions of the 1908 Vatican Graduale. To catch typos, a small reader with no dependencies reads the notes off the archive.org scan of the book and lines them up with each file. Where the two disagree, someone has to look at the page.

The last session left five such places in twelve newly scanned pieces, marked "not looked at". This session looked at them.

## One typo

GregoBase 3912, *Hic est qui venit*, page 472, staff 4. On "et hi tres" the transcription has two falling pairs, f-e then e-d. On the page the second pair falls twice as far as the first: its lower note hangs under the bottom staff line, a c, not on it. The same piece sings that figure earlier on "aqua", written there as `feec`. So the book's e-c is both what is printed and what the melody expects, and the file is corrected with a header saying where on the page to look. The live GregoBase file still had the old note today.

## Four times the same reader fault

The other four places were the reader, all reading the first note of a porrectus a step too low. A porrectus is the neume drawn as one thick slanted stroke from a high note down to a lower one, followed by a third note on a stem. The cause turned up in the pixel columns of one stroke. The 1908 typeface makes the stroke thinner as it falls: about 0.7 staff spaces tall at the top and 0.3 near the bottom. The reader only keeps ink runs at least 0.4 spaces tall, so the stroke's piece ended about two thirds of the way down, 0.9 spaces wide. Anything narrower than 1.2 spaces counts as a note head and is read at its average height. For a falling stroke, that is half way down: one step below where it starts.

The fix uses a measurement the reader already took, how far a head's centre falls from its left edge to its right. A square note falls about 0, a quilisma at most 0.06 of a space. Across all 56,646 heads on the 212 scanned pages, falls between 0.35 and 0.45 are rare, and almost every head above that has a lower note straight after it, as a cut-off stroke does. So a head that falls 0.4 spaces or more is now read at its left end.

## What it changed

Across the 74 piece checks in the repository's eight scan lists:

| | before | after |
|---|---|---|
| notes that differ from the transcription | 88 | 73 |
| notes that agree | 13,917 | 13,932 |
| notes the reader missed or invented | 448 | 448 |

All fifteen differences that went away were porrectus first notes, at fourteen distinct places (one piece is in two lists). No piece gained a difference. Ten of the fourteen are in pieces the rule wasn't built on. But one condition, that nothing touches the head on its left, was added after the first full run gave two broken-up strokes an extra note. So this is not a clean held-out result. The next fresh batch of pages is the real test.

These checks matter for the arrangements because the arrangements are built from the transcriptions. A note a step off moves a harmony, and an ending a step off changes the mode the bass line is built on. A reader that stops crying wolf on porrectus strokes leaves the remaining 73 differences worth a person's time.

Files: `ventures/chant-forge/eval/porrectus-top-check.md`, `scan.mjs` (`STROKE_TOP_FALL`), `corpus/gregobase-1908-checked/3912.gabc`. `node eval/scan-check.mjs --no-stroke-top` reproduces the old reading.
