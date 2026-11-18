# Staff lines at their own thickness (2026-11-14)

Figures from `node eval/thick-line-check.mjs` (full table: `thick-line-report.md`), and from
`scan-check.mjs`, `shape-check.mjs` and `rhombus-check.mjs --held-out --sweep` run on the reader
before (a clean copy of `main` at the start of the run) and after. The rule is `trimLine` and the
outer-pair test in `findStaves`, `scan.mjs`.

## How it was found

The run set out to look at the four "tall false rhombi" left by the rhombus height floor
(`rhombus-height-check.md`, "What is left": 434:2:1190, 742:5:786, 747:1:1398, 747:1:1483).
Cropped from the 2000 px archive.org page, all four are real diamonds in print, so the reader's
shape was right and the pairing with the GABC was wrong. On leaf 747 the reason was plain: the
upper heads of two stemmed pes next to them were not read at all, so the alignment slid.

Printing the binarised staff showed why. `findStaves` takes as a staff line every run of rows
whose ink covers a fifth of the page width. Qui ambulat recites on one line, and the heads sitting
on it cover 21 to 26% of the width in the rows just above and below the line on their own. So a
6 px line (rows 668 to 673) came out 19 px thick (663 to 681). `readStaff` drops a line's rows
unless ink crosses the whole band, and a 0.58-space head centred on a 19 px band does not cross
it: every head on that line was erased or cut to a sliver.

Across all 185 pages scanned so far, 38 of 5,444 lines measured half a staff space or more thick
(a printed line is 0.1 to 0.2), and 44 more 0.3 to 0.5.

It did more than erase heads. A line's centre moved by up to 6 px, and `findStaves` accepts four
lines as a staff only when they are evenly spaced, with the spacing taken from the first two. So
on 22 pages a whole staff was never found (leaf 792 lost two), and on two (747, 642) three lines
of a staff were matched with a row of text below it: the staff's top was a line too low, its clef
position wrong, and 7 and 18 of its notes unread.

## The change

1. **Trim each line band** (`trimLine`): keep the rows from the first to the last that hold ink
   in horizontal runs of 4% of the page width or longer, at least 2% as much as the band's best
   row, plus one row each side inside the band. Head-only rows have no such runs at all (a head is
   about 1% of the width); a line's faint edge rows have 5% or more of its best row.
2. **Try the outer pair's spacing** as well as the first pair's: with lines i and j as a staff's
   top and bottom, the inner two must sit at a third and two thirds. A centre a few pixels off
   moves this spacing a third as much.
3. **Drop a "staff" far tighter than the page's median** (under 0.7 of it): one page prints one
   staff size, and the outer-pair test let evenly spaced rows of text through once (leaf 424).

Two thresholds were set while looking at these pages, so these figures are not held out. The first
try kept rows with a quarter of the best row's long-run ink; that shaved the faint edge rows off
ordinary lines, which then stopped being masked, and descending rhombi touching a line joined up
(the Te Deum lost two notes, GregoBase 3426 one note of its off-final ending, 3403 two). At 2%
plus one row, none of those is lost. The outer-pair test was added because trimming moved one
line of a tilted staff on leaf 582 by 1.5 px and the first-pair test then dropped it.

## Results

| | before | after |
|---|---|---|
| staves found on the 185 pages | 1,361 | 1,384 (none lost; two moved up a line to the right one) |
| lines 0.5 staff spaces or more thick | 38 | 3 |
| lines 0.3 to 0.5 | 44 | 26 |
| notes read | 46,079 | 47,864 |

Notes checked against the GABC (`scan-check-report.md`); no piece agrees on fewer notes than
before, and Dies irae, Veni Creator, Pange lingua, the Te Deum and the Salve are unchanged:

| piece | agree before | after | GABC notes not read, before | after |
|---|---|---|---|---|
| GregoBase 3407 (off-final ending) | 207 of 219 | 216 of 219 | 12 | 3 |
| GregoBase 3429 (off-final ending) | 208 of 210 | 286 of 287 | 2 | 0 |
| the other five GregoBase pieces | 781 | 781 | 31 | 31 |

3429's last staff on leaf 873 was one of the missing staves; with it found, the alignment covers
the whole piece (GABC notes 1 to 287 instead of 78 to 210).

Shapes (`shape-check-report.md`), every set paired with the GABC by pitch:

| set | rhombi read, before | after | squares called rhombi, before | after | quilismas read, before | after | other heads called quilismas, before | after |
|---|---|---|---|---|---|---|---|---|
| 7 held-out GregoBase | 118 of 120 | 133 of 133 | 0 of 1,034 | 0 of 1,107 | 18 of 18 | 19 of 19 | 1 | 1 |
| 9 fresh | 243 of 245 | 250 of 251 | 0 of 1,606 | 0 of 1,675 | 15 of 17 | 17 of 18 | 7 | 7 |
| 11 liquescent | 179 of 182 | 186 of 187 | 3 of 1,428 | 3 of 1,514 | 10 of 12 | 12 of 14 | 7 | 5 |
| 18 quilisma fresh | 416 of 420 | 450 of 453 | 4 of 2,641 | 1 of 2,873 | 47 of 55 | 51 of 60 | 6 | 5 |

Liquescents read at their pitch went up in every set too (held 23 to 23, fresh 23 to 24,
liquescent set 20 to 22, quilisma set 17 to 20, against more paired).

## What it says about the rhombus height floor

Rhombus rule on the 50 pieces it was chosen on (`rhombus-height-report.md`):

| | rhombi read | squares called rhombi |
|---|---|---|
| width and taper only, before | 1,026 of 1,033 | 18 of 7,501 |
| with the 0.62 floor, before | 1,024 of 1,033 | 6 of 7,501 |
| width and taper only, after | 1,087 of 1,092 | 8 of 7,919 |
| with the 0.62 floor, after | 1,087 of 1,092 | 3 of 7,919 |

The "worn squares" that the floor was built for were partly this fault. The Magnificat staff on
leaf 754 (six of them) had a top line measured 17 px (0.45 spaces) thick; the squares on it lost
their edge columns to the oversized mask as well as to their flecks, and came out narrow and
tapered. With the line at its own 11 px, they read as squares without the floor. The floor still
earns its place (8 to 3, no rhombus lost), and the held-out set is unchanged (103 of 103 rhombi,
1 of 596 squares).

The three still called rhombi (434:3:1190, 742:5:786, 636:3:1083) are real diamonds in print,
paired with a GABC punctum because a neighbour is unread. 434 and 742 are on tilted staves whose
lines run 8 to 12 px thick from slant alone, not from heads. The stacked pes at 635:3:1475 that
read as one tall rhombus now reads as its two squares, and the rhombus after it is found.

## What is left

- **Tilt.** Leaf 424 is printed visibly skewed: the old finder found 1 of its 9 staves, this one
  2. A deskew (per page, from the lines' slope) is the next step for the reader; the 0.2 to 0.3
  band (480 lines) is mostly mild tilt.
- The three lines still 0.5 spaces or more thick, not looked at.
- Not held out: the change was made on pages from every existing set. A fresh set of pages needs
  new GABC files (every unused corpus piece with rhombi is spent, `rhombus-height-check.md`).
