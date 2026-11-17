---
title: "The chant notes a scanner could not see"
seo_title: "Reading liquescent neumes off Gregorian chant scans by machine"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge]
description: "Liquescents, the small half-sung notes of Gregorian chant, were invisible to Chant Forge's scan reader. A new rule reads 20 of 26 on pieces it had never seen."
---

Chant Forge turns public-domain Gregorian chant (GABC files) into MIDI for a men's choir. Because every note it plays comes from a volunteer's transcription, it checks those files against scans of the books they came from: the 1908 Vatican Graduale and the 1912 Antiphonale on archive.org. The reader (`scan.mjs`, no dependencies) finds the staff, picks out the note heads and gives each a pitch. Over the last two days it learned to tell a [rhombus from a square](2026-11-13-teaching-a-chant-scanner-to-see-a-diamond.md) and to spot a quilisma's saw-tooth.

One kind of note it could not see at all: the **liquescent**. Where a syllable ends on a consonant that can be sung (the *n* of *in*, the *l* of *alleluia*), the book prints the last note small, as the voice glides through the consonant. In the 1908 type it is a small note on a short stem at the right edge of the note before it: a little head above for a rising pair (the epiphonus, GABC `gh~`) or a hook below for a falling one (the cephalicus, `fe~`). That small note is shorter than the reader's minimum head height, so it simply did not exist for the reader. On the 21 pieces scanned so far, 2 of 60 GABC liquescents were paired with anything on the page, both by accident.

## The rule

From each head's centre, follow the ink up and down in its right-hand columns. A liquescent tail:

- runs 0.6 to 2.4 staff spaces from the head's centre (the head itself reaches about 0.3);
- ends on no other head (otherwise it is the stem of a podatus or clivis);
- is at least 0.1 spaces thick (a virga's stem is thinner);
- ends 0.2 to 0.4 spaces wide (a small head or a hook; a full head is wider).

The small note's pitch is read 0.25 spaces in from the tail's end. On every liquescent looked at while building it, that landed on the GABC's pitch.

## Tuned, frozen, then tested

The thresholds were chosen on the 21 pieces already scanned, comparing four variants: how big a gap in the ink to bridge (breaks in the print and staff lines cut many tails), whether to measure the end width at its widest row or its median one, and how near another head has to be to count as "ends on a head". The kept version found 51 of 57 liquescents at the right pitch there and gave a tail to 2 of 4,524 other heads. Those pieces shaped the rule, so they are not a test of it.

The test is eleven more pieces from the same book, picked by a fixed criterion (every unused piece in the corpus with a liquescent and an arabic page number, and every one with three or more and a bracketed page number) and written into `eval/liquescent-fresh-pages.json` before any of their pages was downloaded:

| | liquescents in the GABC | read at their pitch | other heads called liquescent |
|---|---|---|---|
| set on (21 pieces) | 60 | 54 | 2 of 4,584 |
| held out (11 pieces) | 26 | 20 (77%) | 1 of 1,622 |

The two false calls on the held-out pages were looked at on the scan: a rhombus whose lower point touches the staff line beneath it, and a square just right of a clivis stem. Five of the six misses are notes the pitch alignment never paired at all.

## What it buys

The note-by-note check now covers 33 more notes of the corpus against the printed book, with no new disagreement: the 1908 Te Deum agrees on 633 of 634 notes, the Salve Regina on 219. A transcription that drops a liquescent's `~`, or puts the small note a step off, can now be caught by machine instead of by someone reading every page.

The same eleven pieces gave a clean second test of the older rules too, and not all of it is flattering: rhombi held (180 of 182), but 17 of 1,631 other heads were called quilismas, more than on any earlier set. That is the next thing to look at, along with liquescents that follow a porrectus, which the rule does not look for yet.

Code and every figure: [`ventures/chant-forge`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge), `eval/liquescent-check-report.md`. Nothing here has been sung by a choir yet.
