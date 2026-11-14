---
title: "A quilisma never falls"
seo_title: "Cutting false quilisma calls in a Gregorian chant scan reader"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge]
description: "Three facts about how the 1908 Graduale prints a quilisma cut a chant scan reader's false quilisma calls on 18 unseen pieces from 29 to 6."
---

Chant Forge checks its Gregorian chant transcriptions (GABC files) against scans of the 1908 Vatican Graduale on archive.org. Its reader, `scan.mjs`, finds each note head on the page, gives it a pitch, and since yesterday [names its shape](2026-11-13-teaching-a-scan-reader-to-see-a-quilisma.md): square, rhombus, liquescent, or **quilisma**, the small saw-toothed note that marks a light, ornamented rise. It spots a quilisma by counting rows in the head's upper half that cross white notches between teeth.

That test also fires on things that aren't quilismas. On the eleven pieces scanned this morning for [liquescents](2026-11-14-the-chant-notes-a-scanner-could-not-see.md), it called 17 of 1,631 other heads quilismas, more than on any earlier set. So this run looked at every one of them.

## What the 17 were

Each was cropped from the page and set beside the reader's measurements of the heads around it:

- **Five were pieces of a porrectus stroke.** A porrectus is a thick slanted stroke falling from one note to the next. When the reader doesn't take it as one piece, part of it comes out as a "head", and the white flecks in the print look like teeth.
- **Seven were stacked heads**: two squares printed one on top of the other, with a white seam between them.
- **One was an epiphonus head.** A liquescent's main note has a concave top, and that dip looks like notches.
- **Four were plain squares with mottled print.**

## Three things a quilisma never does

Then the same measurements were taken for every real quilisma on the 32 pieces scanned so far (53 with measurements) and for all 41 false calls. Three things separated them.

**It never falls.** Take the centre of the piece's left end and the centre of its right end. A stroke piece falls from left to right, because the stroke does. A quilisma is level, or rises when it merges with the note printed above it. Every one of the 53 quilismas falls 0.01 staff spaces or less. Every stroke piece looked at falls 0.13 or more, narrow ones included. A cut at 0.06 sits in the empty gap between them.

**Nothing is printed under it.** A quilisma is the lowest note of its neume, so no head sits straight beneath it. Six false calls had one; none of the quilismas did. The reverse test is useless: 20 of the 53 quilismas carry the next note directly above them, because that is how the book prints a pes quilismaticus.

**It never carries a liquescent tail.** None of the 53 did; two false calls did.

The first idea was simpler: drop anything wider than a normal head. That caught 14 false calls but missed the narrow stroke pieces, and it would have dropped a real quilisma that had merged with its upper note into one wide piece. That piece rises, so the fall test keeps it.

## Frozen, then tested

These three tests were chosen by looking at the 32 pieces, so the 32 can't test them. The test is eighteen more pieces: every unused piece in the corpus with a quilisma, minus four whose page had already been scanned. They were written into `eval/quilisma-fresh-pages.json` and the rule was committed before any of their pages was downloaded.

| 18 held-out pieces | before | after |
|---|---|---|
| quilismas read as quilismas (of 55 paired) | 47 | 47 |
| other heads called quilismas (of 3,080) | 29 (0.94%) | 6 (0.19%) |

So 23 of the 29 wrong calls went, and no quilisma was lost. The six that are left, looked at on the page: one is a real quilisma that the pitch alignment paired with the note next to it, one is a stroke end that falls 0.05 (just under the cut), one is the lower head of a stacked pair (the "under" test only covers the upper one) and three are mottled squares. Those last two kinds are squares with three notched rows, and nothing tried so far separates them from a quilisma.

The same unseen pieces also tested the rhombus rule, which this run didn't touch. It read 417 of 420 rhombi but called 14 of 2,641 squares rhombi. That's 0.53%, higher than on any earlier set, and it's the next thing to look at.

## Why it matters

Chant Forge plays every note it is given, so a transcription that drops a quilisma's `w`, or adds one, changes what the choir sings. The scan check catches a shape error only where the reader names shapes reliably. A reader that cries "quilisma" at one head in a hundred makes every flag suspect; one in five hundred is a list a person can actually read through.

Everything is MIT licensed: the rule is `isQuilisma` in [`scan.mjs`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/chant-forge/scan.mjs), and the measurements, crops' verdicts and held-out list are in [`eval/quilisma-stroke-check.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/chant-forge/eval/quilisma-stroke-check.md). Only the 1908 Vatican edition's printing has been tried.
