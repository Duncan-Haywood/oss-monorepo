---
title: "Teaching a scan reader to see a quilisma, and testing it on pages it had never seen"
seo_title: "Detecting the quilisma in scanned Gregorian chant (1908 Graduale)"
date: 2026-11-13
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge]
description: "Finding the saw-tooth quilisma in scans of the 1908 Graduale by counting notched rows: set on five chants, then 15 of 17 found on nine never-seen chants."
---

Chant Forge checks its GABC transcriptions of Gregorian chant against scans of the 1908 Vatican Graduale on archive.org. A small reader in `scan.mjs` finds the staves, the note heads and their pitches, lines the scan up with the GABC, and lists where they disagree. Earlier today it learned to tell a rhombus (punctum inclinatum) from a square. The quilisma was still read as a square.

The quilisma is the jagged note: in the 1908 type a small saw-tooth with two or three teeth on top and a solid base. An earlier try measured how much the head's outline zigzagged. It failed because stems and neighbouring heads zigzag the outline too: it kept 5 of 18 held-out quilismas and flagged about 60 ordinary squares.

## What worked

Looking at crops of every quilisma made the difference plain. The teeth are inside the head's own upper half, and between them are white notches. So the new measure, `notchRows`, looks only at the rows from a quarter of a staff space above the head's centre down to the centre. It counts the rows that cross two or more separate runs of ink. Three such rows make a quilisma. The rows above that band are left out on purpose. That is where a liquescent's small head or the note stacked above sits, and both had made squares look notched.

The threshold was chosen on the five tuning pieces alone: 6 of 6 quilismas, 3 of 1,538 other heads. Because the seven usual held-out pieces had been looked at while choosing the measure, they were not a clean test. So nine more chants from the same book were picked: every GregoBase 1908 piece with an arabic page number and three or more quilismas or liquescents. They were scanned for the first time after the rule was fixed.

| set | quilismas paired by pitch, found | other heads called quilismas |
|---|---|---|
| tuned on | 6 of 6 | 3 of 1,538 |
| held out (seen while choosing) | 18 of 18 | 9 of 1,153 |
| fresh (nine new chants) | 15 of 17 | 18 of 1,849 |

## Looking at the mistakes

Each of the 18 fresh false calls was cropped and checked:

- **6 were real quilismas.** The reader was right. The pitch alignment had paired them with a neighbouring note of the same pitch.
- **11 were the end of a porrectus stroke.** The reader had cut the stroke off and treated its end as a head, and the white flecks where the stroke meets the next head looked like notches.
- **1 was two heads stacked a step apart**, with a white seam between them.

A quilisma never continues a stroke. So a second rule was added: a notched head whose left neighbour is wider than 0.8 staff spaces and ends right next to it is not a quilisma. That brought the fresh false calls from 18 to 12 with no quilisma lost. Six of those 12 are the real quilismas above, so the reader's own false calls come to 6 in 1,849 heads. The second rule was chosen after seeing the fresh pages, so that last figure is not a held-out number, and the report says so.

The fresh pages also re-tested the rhombus rule, which nobody touched: 243 of 245 rhombi read correctly, and no square in 1,604 called a rhombus.

## What it is still bad at

Pairing is the limit. Only 17 of the 39 quilismas in the fresh chants were paired by pitch at all. Some heads the reader misses, and some the alignment puts elsewhere. Liquescents are still not read: their small heads fall under the reader's minimum height. That is the next detector.

Everything is in the repository: the rule in `ventures/chant-forge/scan.mjs`, the check in `eval/shape-check.mjs` (`node eval/shape-check.mjs` downloads the pages and rebuilds the report), and the eye check in `eval/quilisma-eye-check.md`.
