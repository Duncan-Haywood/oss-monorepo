---
title: "Reading chant transcriptions against the 1908 book by machine: one wrong note in 1,500"
seo_title: "Check a GABC chant transcription against a page scan automatically"
date: 2026-11-13
tags: [music, gregorian-chant, gabc, open-source, omr]
description: "Chant Forge now reads square notation off public-domain scans and lines it up with GABC files. Its five corpus pieces agree with the 1908 and 1912 Vatican books; one Te Deum note was wrong."
---

Chant Forge turns public-domain Gregorian chant into MIDI for men's-choir tracks. Its
five corpus pieces came from GregoBase, a volunteer database of chant transcriptions.
Until today nobody here had checked a single note of them against the printed page.
Two of them (the Te Deum and the Salve Regina) also came from books printed after
1929, which is a problem for a project that only uses public-domain sources.

## What was built

`scan.mjs` is a small square-notation reader with no dependencies. It finds the
four-line staves on a page scan, removes the lines, and finds the note heads by
their size: squares, the diamond-shaped rhombi, and the two ends of the slanted
porrectus stroke. Stacked notes are read bottom-up. It gives each note a position
relative to the clef line and lines the sequence up with the GABC file by edit
distance. Every disagreement comes out with a page, staff and x position, so a
person can go straight to that spot.

The scans are on archive.org: the Vatican Graduale of 1908 and the Vatican
Antiphonale of 1912, both public domain.

## What it found

| piece | notes read | agree |
|---|---|---|
| Dies irae (1908, pp. 83*-86*) | 604 | 604 |
| Veni Creator, verse 1 (1908) | 43 | 43 |
| Pange lingua, verse 1 (1908) | 53 | 53 |
| Te Deum, Roman tone (1908, pp. 118*-121*) | 631 | 630 after one fix |
| Salve Regina (1961 file vs the 1912 book) | 214 | 214 |
| 7 Graduale pieces that end off their final | 972 | 971 |

- **One real error.** GregoBase's transcription of the 1908 Te Deum has "si-ne"
  starting on f. The page prints e, in the space below the f line. The other
  half-verses of that tone also open on e. The corpus file is corrected and
  says so in its header.
- **The old Te Deum was another tune.** The corpus had a 1974 Solesmes Te Deum.
  Read against the 1908 book's Te Deum it differs in 75 places and has 85 notes
  the book lacks, so it is a different tone, not a different typing of the same
  one. The corpus now carries the 1908 tone.
- **The Salve Regina is the 1912 melody.** The 1961 file matches the 1912
  Antiphonale on every note the reader found. Nine more notes that the reader
  missed on two staves were checked by eye and match too. All five pieces now
  have a pre-1929 source.
- **The odd endings are in the book.** Eleven files end off their mode's final.
  Seven of them were found in the scan, and the book ends exactly where the files
  do. Introits end on the psalm-tone differentia and graduals end on their verse.

## How much to trust it

As a control, one note that agrees with the scan is moved a step up or down and
the check is run again, 200 times per piece. The moved note is flagged 189 to 200
times out of 200. A slip on a note the reader cannot see, such as a quilisma, a
liquescent or a note on a ledger line, is not caught. That is 4 to 17 notes per
piece. The thresholds were tuned on the Dies irae and Te Deum pages. The Salve
Regina and the seven off-final pieces were run afterwards with nothing changed.
So far it has only seen Vatican-edition printing.

Run it with `node ventures/chant-forge/eval/scan-check.mjs`. It needs curl and
ffmpeg and takes about a minute. The verdicts on each flagged spot are in
`eval/scan-check-verdicts.md`.
