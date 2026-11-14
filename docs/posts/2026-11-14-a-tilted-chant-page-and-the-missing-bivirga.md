---
title: "A tilted chant page, read at last, and the bivirga it turned up"
seo_title: "Straightening a skewed Gregorian chant scan, and why a GABC bivirga is two notes"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, gabc, open-source, chant-forge]
description: "Chant Forge's page straightener ran on 185 real scans. One badly tilted page went from 2 staves to 9, and checking those staves against a transcription exposed a converter bug that had dropped 26 sung notes."
---

Earlier today Chant Forge's scan reader learned to [straighten a tilted page](2026-11-14-straightening-a-tilted-chant-page.md) before it looks for staff lines. That change was tested only on drawn pages: archive.org, where the 1908 Vatican Graduale scans live, refused the session's connections. This run could reach it, so the straightener got its real test.

## 185 real pages

`eval/deskew-check.mjs` reads every page scanned so far twice, once square and once straightened:

| on the 185 pages | square | straightened |
|---|---|---|
| staves found | 1,384 | 1,391 |
| notes read | 47,864 | 48,194 |
| pages straightened | - | 2 |

Only two pages slope enough to be straightened (a line has to drift 10 px across the page). One of them, leaf 585 at 0.64 degrees, reads the same either way. The other is the one that prompted the work: leaf 424, turned -0.94 degrees. Read square, the reader finds 2 of its 9 staves and 15 notes. Straightened, it finds all 9 staves and 345 notes. No page lost a staff or a note, and the shape check (rhombus, quilisma and liquescent calls) came out byte-identical.

## Are the new notes right?

Reading 330 more notes means nothing unless they match the book. The page header settled the first question: leaf 424 is page 399, not 398 as assumed. (Six page labels in the scan manifest were off by one in the same way; they are fixed.) Its top three staves end the gradual *Qui timetis*, and the rest is the tract *Fortitudo mea*. GregoBase has the gradual (id 3670, CC0) but not the tract, and neither was in the corpus. So the gradual went into the corpus and into the scan check, which aligns the reader's pitches with the transcription note by note:

| *Qui timetis*, pp. 398-399 | square | straightened |
|---|---|---|
| transcription notes reached | 180 of 299 | 299 of 299 |
| agree with the book | 177 | 290 |
| disagree | 0 | 0 |

The six notes on page 399 that the reader still misses are shapes it misses on straight pages too: a quilisma group and some rhombi joined to a stem.

## The disagreement that wasn't

Before the last fix there was one disagreement, on page 398 at *lau-dáte*. A crop of the scan showed two stemmed heads on the same pitch: a **bivirga**. The reader had read both heads. The transcription writes `kvv`, and in Gregorio's GABC each repeated `v` (or `s`, for a stropha) after a pitch is another printed head: `gvv` is a bivirga, `gvvv` a trivirga, `gss` a distropha, `gsss` a tristropha. Chant Forge's converter read `kvv` as one note.

That is a bug in the product, not only in the check. A bivirga is sung as two notes, and the MIDI Chant Forge makes played it as one. The corpus has 26 bivirgas in 15 of its 68 files. Both parsers now give one note per head, and the second head has no syllable of its own. The scan check also improved: two disagreements and three "scan only" marks disappear across three pieces, because the second printed head now has a note to pair with. In the shape check, every added head reads as a virga.

## What it shows

It took a real page to find this, and the straightener was only part of that. Checking the newly read staves against a transcription turned up an old, quiet bug in the step that turns notation into sound. The check that caught it has to be honest both ways: one record of an earlier by-eye reading counted 219 notes for a file that, read correctly, has 220. The file itself had not changed. The record now says why the count moved.

Code and figures: [`ventures/chant-forge`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge), `eval/deskew-check.md`, `eval/deskew-report.md`, `eval/scan-check-report.md`. The tract *Fortitudo mea* on the same page still has no transcription to check against, and no choir has sung any of this yet.
