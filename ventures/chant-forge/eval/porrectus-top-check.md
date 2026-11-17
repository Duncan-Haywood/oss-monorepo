# The five open note differences, and porrectus tops read a step low (2026-11-14)

The porrectus-liquescent check (`porrectus-liquescent-check.md`) left five places where the scan
reader and the GregoBase transcription disagreed on twelve newly scanned 1908 Graduale pieces, "not
looked at". This session looked at each one on the scan, cropped at full resolution with the
reader's notes listed beside it. One was a real slip in the transcription, now corrected. Four were
the reader, all with the same fault, and fixing that fault cleared fourteen differences in all
across the 74 piece checks the repository has.

## The five, looked at

`node eval/scan-check.mjs --manifest eval/porrectus-liquescent-pages.json` and
`--manifest eval/porrectus-liquescent-fresh-pages.json`. Scan: archive.org item
`gradualesacrosan0000cath` (Graduale Romanum, Vatican edition, 1908).

| piece | where | flagged | on the page | verdict |
|---|---|---|---|---|
| 3486 *Adducentur* | p. [46] (leaf 631), staff 4, "cén" | GABC i, scan h | podatus f-g, then a porrectus whose stroke starts in the space just under the top line (i), falls to g and rises to h: `fg/igh` as written | reader |
| 3486 | p. [46], staff 4, "post" | GABC h, scan g | f-g-h, clivis j-h, then a porrectus starting on the h line: `hfg` | reader |
| 3486 | p. [46], staff 6, "rén" (first notes of the line) | GABC h, scan g | g g, then a porrectus starting on the h line: `gg/hfg` | reader |
| 3949 *Stetit Angelus* | leaf 563, staff 5, "ta" | GABC f, scan e | the stroke starts on the f line, falls to d and rises to e: `fde` | reader |
| **3912 *Hic est qui venit*** | p. 472 (leaf 498), staff 4, "tres" (verse, "et hi tres") | GABC d, scan c | clivis f-e, then a second clivis that falls a third: its lower head hangs below the bottom line, in the space under it (c), twice as far below the e as the first clivis's e is below its f | **transcription; corrected** |

The 3912 correction, `tres(feed//efe/f!hh)` to `tres(feec//efe/f!hh)`, is in
`corpus/gregobase-1908-checked/3912.gabc` with a `correction:` header saying where to look. The
respond sings the same figure, `a(hf/gh!ivFE)qua(feec)`, and the verse repeats that cadence on "hi
tres", so the book's e-c is the expected reading as well as the printed one. The live GregoBase file
was byte-identical to the corpus copy on 2026-11-14, so the slip is still there. With the fix the
piece agrees with the book on all 406 notes the reader finds (it was 405 agreeing and 1
differing). As with the Te Deum and GregoBase 3427 corrections, a second human reader is wanted.

## Why the reader read the porrectus tops low

`readStaff` gathers vertical ink runs between 0.4 and 0.85 staff spaces tall and joins neighbouring
columns into pieces. A piece wider than 1.2 spaces whose ends are far enough apart is a porrectus
stroke, read as its two ends. A narrower piece is a head, read at the mean height of its columns.

The 1908 type's stroke thins as it falls. Measured on the 3949 stroke (`ta`, leaf 563, x 1201-1246),
its runs are 0.64-0.77 spaces tall at the top and 0.29-0.40 near the foot. At about two thirds of the
way down they drop under the 0.4-space floor, so the piece ends there, 0.9 spaces wide. The foot, where
the stroke meets the head on its stem, is tall enough again to be read as a separate piece. The cut-off
top is under 1.2 spaces wide, so it is read as a head at its mean height: half way down the fall,
about one step below where the stroke starts. All four reader cases measured the same: a first piece
0.9-1.0 spaces wide whose centre falls 0.52-0.60 spaces from its left end to its right, then the foot
one step lower, then the head on the stem.

## The rule

A head whose centre falls `STROKE_TOP_FALL` = 0.4 staff spaces or more from its left end to its right
(its existing `fall` feature), which does not continue a wide stroke on its left (`afterStroke`) and
touches no other piece on its left, is read at the height of its left end, the first 0.15 spaces of
columns. If no head starts within 0.3 spaces after it and below its right end, the piece holds the
whole stroke, and its right end is read as the stroke's second note, as a wide stroke's is.

The threshold was picked from the distribution of `fall` over every head on all 212 pages in the
eight piece lists, which needs no transcription to compute:

| fall (staff spaces) | heads | with a lower head starting just after |
|---|---|---|
| below 0.05 | 54,334 | 12,134 |
| 0.05-0.20 | 1,971 | 511 |
| 0.20-0.30 | 229 | 116 |
| 0.30-0.35 | 17 | 13 |
| 0.35-0.40 | 5 | 2 |
| 0.40-0.45 | 9 | 2 |
| 0.45-0.50 | 8 | 5 |
| 0.50 and over | 73 | 67 |

Square heads fall about 0, and quilismas 0.06 or less. The count is lowest between 0.35 and 0.45,
and nearly every head above it has a lower head straight after it, as a cut-off stroke top does. The
cut was set at 0.4 before any check against a transcription was run.

## Results

`node eval/scan-check.mjs --manifest FILE` on all eight lists, with and without the rule
(`--no-stroke-top` reads as before). Some pieces are in two lists, so these are piece checks, not
pieces. The 3912 correction is applied in both columns.

| list | piece checks | differ, before | differ, after | agree, before | agree, after |
|---|---|---|---|---|---|
| scan-pages.json | 13 | 1 | 1 | 3,129 | 3,129 |
| shape-fresh-pages.json | 9 | 9 | 4 | 1,971 | 1,976 |
| liquescent-fresh-pages.json | 11 | 16 | 14 | 1,740 | 1,742 |
| quilisma-fresh-pages.json | 18 | 55 | 53 | 3,419 | 3,421 |
| rhombus-fresh-pages.json | 6 | 2 | 1 | 750 | 751 |
| offfinal-supplement-pages.json | 5 | 1 | 0 | 877 | 878 |
| porrectus-liquescent-pages.json | 6 | 3 | 0 | 956 | 959 |
| porrectus-liquescent-fresh-pages.json | 6 | 1 | 0 | 1,075 | 1,076 |
| **all** | **74** | **88** | **73** | **13,917** | **13,932** |

Fifteen differences went away: fourteen distinct places, since GregoBase 3451 is in two lists. Every
one had the GABC note one step above the scan's, on the first note of a porrectus (`hfg`, `ifg`,
`jhi`, `fde`, `gxhfge` and so on). No piece gained a difference, no new mark the GABC lacks appeared,
and no note the reader found before was lost: "GABC only" stays 416 and "scan only" 32. The planted
one-step control got worse on no piece and better on eight. The shape check (`shape-check.mjs`) lost no rhombus,
quilisma or liquescent, and paired a few more puncta. The porrectus-liquescent check is unchanged:
16 of 19 read.

## What is and is not held out

The rule was built from the four reader cases above (two pieces). The 0.4 threshold came from an
unlabelled histogram. The fourteen fixes therefore include ten in pieces the rule was not built
on. But the "touches no other piece on its left" condition was added after the first full run.
That run showed two strokes the reader breaks into several pieces (GregoBase 3403 `hfh`, leaf 513,
and 3408 `ifg`, leaf 517), where the falling middle piece was taken for a top and given an extra
note. That condition was tuned on all 74 checks, so the zero-regression result is not a held-out
figure. The next fresh piece list is the honest test.

## Not done

- The broken-up strokes in 3403 and 3408 are still read wrongly, as before: 3403's `su` porrectus
  start is one step low. A reader that follows a stroke across its breaks would fix them.
- 73 differences remain across the lists. Most are in GregoBase 3437 (16) and other pieces with
  many quilismas, and have not been looked at.
- The one-step liquescent hook ending on a staff line is still not handled
  (`porrectus-liquescent-check.md`).
