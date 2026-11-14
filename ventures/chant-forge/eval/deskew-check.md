# Tilted pages straightened (2026-11-14)

The reader (`scan.mjs`) now finds a page's slope and straightens the ink before it looks for
staves: `estimateSkew` shears the ink by trial slopes from -3 to +3 degrees (0.1 degree steps,
then 0.01 around the best) and keeps the one whose row profile is sharpest (sum of squared row
counts, the usual projection-profile test for printed pages); `shearColumns` then moves each
column up or down a whole number of pixels. Nothing is resampled, so every column, and every
head's vertical runs, stay as printed; for a few degrees a vertical shear is a rotation to within
cos(3 deg) = 0.9986 across the page. Note `y` values in `readPage`'s output are mapped back to
the page as scanned, and each staff carries the `skew` (degrees) it was read at. `{ deskew: false }`
reads square, as before.

## Why

`findStaves` takes a staff line as rows that each hold a fifth of the page width in ink. A line
that drifts more than its own thickness across a 1,440 px staff spreads over more rows than it
fills, so the band breaks up or comes out too thick and `readStaff` erases the heads on it. Leaf
424 of the 1908 Graduale (GregoBase 3426's first page) shows 2 of its 9 staves
(`thick-line-check.md`).

## What was checked, and what was not

**Real pages (2026-11-14, a later session that reached archive.org).** `node eval/deskew-check.mjs`
read all 185 pages scanned so far with and without straightening (`deskew-report.md`):

| on the 185 pages | square | straightened |
|---|---|---|
| staves found | 1,384 | 1,391 |
| notes read | 47,864 | 48,194 |
| pages straightened | - | 2 |

Two pages slope 10 px or more across: leaf 424 (-0.94 degrees) and leaf 585 (0.64 degrees). Leaf
424 goes from 2 of its 9 staves to all 9, and from 15 notes to 345. Leaf 585 reads the same either
way. No other page changes, because none is straightened, and no page loses a staff or a note.
`shape-check.mjs` gave a byte-identical report with straightening on.

Leaf 424 is p. 399, not p. 398 as `thick-line-check.md` assumed (leaf = page + 25 here). Its top
three staves end the gradual *Qui timetis* (GregoBase 3670, which starts on p. 398), and the rest is
the tract *Fortitudo mea*, which is not on GregoBase. So no piece already in `scan-pages.json`
had notes there (3426 is on p. 400). To test the newly read staves against a transcription, 3670
was added to the corpus and to `scan-pages.json` (pp. 398-399, leaves 423-424) and checked both ways
(`node eval/scan-check.mjs --only "GregoBase 3670 (Qui timetis, tilted page)" [--no-deskew]`):

| GregoBase 3670 | square | straightened |
|---|---|---|
| GABC notes covered | 1-180 of 299 | 1-299 of 299 |
| agree | 177 | 290 |
| differ | 0 | 0 |
| GABC only (not read) | 3 | 9 |
| ending (last six notes) | not read | g f f d e d, all agree |

The 119 GABC notes on leaf 424 were simply off the page for the square reader. Straightened, 113
of them agree with the book and none disagrees. The six not read are shapes the reader misses on
square pages too: a quilisma group at *Is-ra-el* and *quó-niam*, and stem-joined rhombi at
*de-spé-xit* and *páu-peris*. (Figures after the bivirga fix, below; before it, straightened
was 289 agree and 1 differ, and the one disagreement was a bivirga on leaf 423.)

**Bivirga.** That one disagreement, at *lau-dáte* on leaf 423 (`kvvJH`), was looked at on the scan:
the book prints two stemmed heads on k, a bivirga, and the reader read both. `gabcSteps` (and
the converter, `parseGabc` in `gabc.mjs`) took `kvv` as one note. In Gregorio, each repeated `v`
or `s` after a pitch is another head: `gvv` bivirga, `gvvv` trivirga, `gss` distropha, `gsss`
tristropha. Both parsers now give one note per head. The corpus writes 26 bivirgas in 15 of its
68 files, so the MIDI had dropped 26 sung notes. Two disagreements in `scan-check-report.md` go
(3429 and 3670), and so do the "scan only" extras on 3407 and 3429: 3407 is 217 of 220 (was 216 of
219), 3429 289 of 290 (was 286 of 287, 1 differ). In `shape-check-report.md` every added head reads
as a virga (for example 195 of 195 virgas on the quilisma-fresh set). The by-eye record for 3407
(`corpus/scan-read-by-eye.json`) now counts 220 notes. The file is unchanged; only the count is.

**Drawn pages** (`node eval/deskew-synthetic.mjs`, table in `deskew-synthetic-report.md`): nine
staves, 99 heads, on a 2000 x 3000 page, turned with bilinear resampling and lightly speckled
(one dark pixel in 2,000), lines 3 px and 6 px.

| turned | square reader, 3 px lines | straightened | square reader, 6 px lines | straightened |
|---|---|---|---|---|
| 0 to 0.2 deg | 99 of 99 | not straightened (same) | 99 | same |
| 0.3 deg | 99 | 99 | 99 | 99 |
| 0.4 deg | 89 | 99 | 99 | 99 |
| 0.5 deg | 1 (4 of 9 staves) | 99 | 36 | 99 |
| 0.8 to 2.5 deg | 0 (no staves) | 99 | 0 to 4 | 99 |

The slope found matches the turn to 0.01 degrees at every angle tried; the estimate takes 0.13 to
0.23 s on a 2000 x 3000 page.

## The threshold, and the one cost found

A page is straightened only when its slope moves a line `DESKEW_MIN_DRIFT` = 10 px or more
across the page (0.29 degrees at 2000 px). The first try straightened from 4 px (0.11 degrees).
With a heavier speckle (one in 400) that cost notes at 0.2 degrees: 82 of 99 straightened against
97 square. The cause is not the shear itself (at that slope the head in question was moved 2 px
whole); straightening makes the staff-line mask tight again, and specks touching a line, which
the square reader's wider, drifting mask had hidden, then lengthened a head's column runs until
it split in two. At 0.2 degrees the square reader loses nothing, so there is nothing to gain,
and 10 px leaves every page under 0.29 degrees reading exactly as before: of the 185 pages
already measured, only the tilted ones can change. Whether real worn print behaves like the
heavy speckle is a question for the real-page run.

## Not handled

A page that curves toward the spine (a slope that changes along the line) is straightened by one
average slope; a staff's own slope (`estimateSkew` on its band alone) would be the next step if
the real-page run shows staves still missing on straightened pages.
