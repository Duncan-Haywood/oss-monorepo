---
title: "The chant clef in the middle of the line"
seo_title: "Reading mid-staff clef changes off Gregorian chant scans by machine"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge]
description: "A clef printed mid-line made Chant Forge misread whole chant verses. A rule tested on 14 unseen pieces cut differences from 129 to 13 and found a slip."
---

Chant Forge turns public-domain Gregorian chant (GABC files from GregoBase) into MIDI for a men's choir. Every note it plays comes from a volunteer's transcription, so the project checks those files against scans of the books they came from, mostly the 1908 Vatican Graduale on archive.org. A small reader with no dependencies (`scan.mjs`) finds the staves, picks out the note heads and gives each one a pitch relative to the clef. An alignment then lines those notes up against the GABC and lists every place where the two disagree.

After a day of fixing the reader (rhombi, quilismas, liquescents, porrectus strokes), 73 differences were left across 74 piece checks. Sixteen of them were in a single gradual, GregoBase 3437, *Adhaesi*.

## One fault, sixteen differences

All sixteen were on one staff of one page (p. [125], leaf 710 of the scan), and all came after the same point. The page showed why. The gradual's verse, *Bonum mihi*, starts in the middle of the staff after a double bar, and the book prints a new C clef there, a line lower than before. In GABC that is `(z0::c3)`.

The reader only looked for a clef at the start of each staff. It read the new clef's two blocks as a podatus, a two-note neume, and read every note after it against the old clef line, two steps too low.

The music itself was never wrong. The converter that writes the MIDI (`parseGabc`) does follow the clef change: *Bo-* is the note on the c3 line, MIDI 60, as printed. The fault was in the check that is supposed to show the MIDI is right.

## Telling a clef from a podatus

In the 1908 type a C clef is two square blocks, one in each space on either side of its line, joined by a curve on their **left**. A podatus whose notes are a third apart also looks like two blocks stacked in the spaces around a line. The difference is the join: its two heads are connected by a stem on their **right**.

So the rule (`findClefChanges`) takes two heads the reader has already found, one above the other and two steps apart in the spaces, and checks two columns. If ink runs unbroken across the gap between them at their left edge and not at their right, they are a clef on the line between them. The blocks are dropped from the notes, and everything to the right is read against the new line.

The obvious test, a tall solid stroke like the one the start-of-staff clef finder uses, does not work here. The clef's curve is thin in the middle, and on leaf 710 only one column of it reaches 1.26 staff spaces. Testing for a join across the gap does work.

## Written from one page, tested on fourteen

The rule was written from that one clef and then left alone. On the 74 earlier piece checks (212 pages), differences fell from 73 to 57 and no piece got worse. The reader found 11 clefs inside staves on those pages. Each was cropped and looked at, and all 11 are real C clefs.

That is not a held-out test, though, since those pages were already in hand. So before downloading anything new, the run listed every GregoBase piece in ids 3461-3800 that cites only the 1908 Graduale, changes clef, and is not in an earlier list. Five whose pages had already been scanned were left out, leaving fourteen. The list was committed first, then the pages were read:

| | before | after |
|---|---|---|
| notes agreeing with the GABC | 3,125 | 3,252 |
| notes differing | 129 | 13 |
| marks the GABC lacks | 46 | 10 |

The reader found 12 clefs inside staves on those 55 pages, and all 12 are real. Two of them were changes back from c3 to c4, which the rule had never seen, and both were read on the right line.

## And a slip in the transcription

Four of the thirteen remaining differences were next to each other, in GregoBase 3775, *Domine spes mea*. In its verse the four notes of *et confirmásti* (p. 458) sit on the clef line of the verse's c3 clef, h h h h. The file has f f f f, a third lower. On the page the same staff's *sce-* sits on that same line, and the next neume starts a step above them. The corpus copy is corrected, with a header saying where to look. It is the fourth transcription slip the scan check has found (after the Te Deum, 3427 and 3912). A second human reader should still confirm each one.

## What it does not do

It reads C clefs inside a staff, not F clefs. A clef change with no double bar in front of it would still be missed if the reader also misses the clef's blocks, though none like that turned up. Nine differences on the new list have not been looked at yet. The full numbers are in `ventures/chant-forge/eval/clef-change-check.md`.

None of this has been heard by a person. Chant Forge is a prototype, and nothing has been sung or released. What this run adds is a better check that the notes it would sing are the ones the book prints.
