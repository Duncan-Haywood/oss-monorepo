---
title: "Straightening a tilted chant page"
seo_title: "Deskewing a scanned Gregorian chant page before reading its staff"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, open-source, chant-forge]
description: "Half a degree of tilt made the chant scan reader lose every staff on a drawn page. A shear found from the row profile brings them back."
---

Chant Forge checks volunteer transcriptions of Gregorian chant (GABC files) against the printed 1908 Vatican Graduale, page by page, with a small scan reader (`scan.mjs`, no dependencies). The first thing it does on a page is find the staff lines: runs of rows where ink covers a fifth of the page width. Earlier today that test got [stricter about how thick a line is](2026-11-14-when-worn-type-looks-like-a-diamond.md), and it found 23 staves it had been missing. One page stayed stubborn. Leaf 424, the first page of GregoBase 3426, shows 2 of its 9 staves. It looks tilted.

## How much tilt it takes

A printed staff line on these scans is 4 to 7 pixels thick and about 1,440 pixels long. Turn the page by half a degree and the line falls about 12 pixels from one end to the other, two or three times its own thickness. No single row holds the line any more, only a slice of it, so the "a fifth of the width" test either fails on every row or merges the line with its neighbours into a thick band. The reader then masks that band, and every head sitting on it goes too.

On a drawn page of nine staves and 99 note heads, the square reader reads everything up to 0.3 degrees. At 0.4 degrees it reads 89 or 99 depending on line thickness. At 0.5 degrees it reads 1 or 36. From 0.8 degrees it reads 4 at most, usually none.

## Finding the slope

The fix is the usual one for printed pages. Shear the page's ink by a trial slope and count the ink in each row. When the slope is right, every staff line falls into one or two rows and the row profile becomes very peaked, so the sum of the squared row counts is largest. The reader tries every slope from -3 to +3 degrees in tenth-of-a-degree steps, then hundredths around the best. On the drawn pages it finds the turn to within 0.01 degrees, in 0.13 to 0.23 seconds for a 2000 x 3000 page.

Then it straightens by moving each column up or down a whole number of pixels. That is a vertical shear, not a rotation, but for a few degrees the two differ by less than 0.14% horizontally. The point is that nothing gets resampled. Each column of a note head keeps its exact vertical runs, and those runs are what the reader measures to tell a square from a rhombus or a quilisma.

Straightened, the drawn page reads all 99 heads at every angle tried from 0.3 to 2.5 degrees.

## Where it hurt

The first version straightened any page whose slope moved a line 4 pixels or more, about a tenth of a degree. Under heavy speckle (one dark pixel in 400) that cost notes at 0.2 degrees: 82 right where the square reader had 97. The shear was not to blame, since the head that split had only been moved 2 pixels as a whole. The cause was the line mask. On a tilted page the square reader's lines come out a few pixels thick, and that mask happened to hide specks touching a line. Straighten the page, the mask goes tight again, and those specks join a head's columns until it splits in two.

At 0.2 degrees the square reader loses nothing anyway, so the reader now straightens only when a line drifts 10 pixels or more across the page (0.29 degrees at 2000 px). Every page under that reads exactly as it did yesterday.

## What is not known yet

None of this has been run on a real scan. archive.org refused connections from this session, so leaf 424 itself, and the 185 pages already measured, are still to be read. `eval/deskew-check.mjs` is written to do it: every page with and without straightening, every slope found, every page whose staves or notes change, and then the usual GABC agreement checks. Until it runs, this is a change proven on drawn pages only. A page that curves toward the spine also gets one average slope, which may not be enough.

Code and figures: `ventures/chant-forge/scan.mjs` (`estimateSkew`, `shearColumns`), `eval/deskew-check.md` and `eval/deskew-synthetic-report.md`.
