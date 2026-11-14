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

**Not checked on a real page.** archive.org refused this session (proxy CONNECT 403 on
archive.org, iiif.archive.org and the ia8* hosts), so neither leaf 424 nor the 185 pages already
scanned were read. `eval/deskew-check.mjs` is written to do that: it reads every page in the five
`*pages.json` sets with and without straightening and lists each slope found and each page whose
staves or notes change. Run it, then `scan-check.mjs` and `shape-check.mjs`, from a session that
reaches archive.org; until then this is a change proven on drawn pages only.

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
