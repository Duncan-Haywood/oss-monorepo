# The nine differences left on the clef-change list, and a staff that curls (2026-11-14)

`clef-change-check.md` ended with nine differences on its fresh list that nobody had looked at
(3461, 3500, 3506, 3679: one each; 3706: five). Each was cropped from the scan
(archive.org item `gradualesacrosan0000cath`, 2000 px wide) and looked at. They fall into three groups.

| piece | where | GABC | printed | verdict |
|---|---|---|---|---|
| 3461 *Quemadmodum* | leaf 470, staff 4, *aquá-rum:* before the full bar | `rum:(i)` | j | transcription slip: the head sits on the top line, at the height of the `jj` before it |
| 3500 *Qui operatus est* | p. 368 (leaf 393), staff 2, *et mi-hi* | `mi(jhk)` | j i k | transcription slip: the porrectus starts on the top line and its stroke ends in the space below, a space short of the third line; the flat after it stands in that same space |
| 3706 *Propter fratres meos* | p. [178] (leaf 763), staff 6, *me-os* | `gd` | g e | transcription slip: the clivis's lower head sits in the space above the bottom line, where the climacus before it has its second rhombus, not on the line with the third |
| 3706 | leaf 764, staves 1 and 2 (four differences) | `sunt re-lí-qui-ae hó-mi-ni pa-cí-fi-co` | as the GABC | **reader fault**: the staff slopes on a page that does not (below) |
| 3506 *Suscepimus Deus* | leaf 403 (before p. 378), staff 6, *au-* | `fe~` | f, small note e | reader fault: this cephalicus has a stem on its **left** running down to the bottom line; `liquescentTail` takes the longest run and reads the small note three steps low (c). Not fixed |
| 3679 *Repleta est* | p. [136] (leaf 721), staff 6, *ad-ju-tó-* | `jhi` (porrectus) | j h i | reader fault: the porrectus top is read a step low (i), the stroke-top rule does not fire on this stroke. Not fixed |

The three slips are corrected in `corpus/gregobase-1908-clef/` with a `correction:` header each, as
3775 was. They were read by one reader (an agent, from the scan crops); a second human reader is wanted,
as for the Te Deum, 3427, 3912 and 3775 corrections. Whether the slips are still in the live GregoBase
files was not checked.

## A staff that slopes on a flat page (`staffSkew` in `scan.mjs`)

Leaf 764's staff 1 falls 11 px from its left end to its right, staff 2 9 px and staff 3 about as much,
while staves 5 to 9 are level within 2 px: the leaf curls at its head. `estimateSkew` scores the whole
page, so it finds no slope worth taking (it straightens only when a line drifts 10 px across the page),
and the three tilted staves are read square. Their lines are then measured as bands 11-16 px thick
instead of 4, and `readStaff`, which drops line rows unless ink crosses them, erases most of every head
sitting on a line. Staff 1 gave 18 notes of 38, missing *sunt re-* and most of the long recitation on
the c3 line; staff 2 19 of 27.

`staffSkew(bin, staff)` scores one staff's own rows (half a space above its top line to half a space
below its bottom line) with the same sharpest-row-profile search, and returns a slope only when it
moves a line `DESKEW_MIN_DRIFT` (10) px or more across the page, the page threshold unchanged. In
`readPage`, a staff with such a slope is read from the page sheared by the page's slope plus its own,
on the staff found there at the same height and spacing; note y values are still given on the page as
scanned, and the staff's `skew` says what was applied. A level staff is read exactly as before (a test
checks the other staves of a curled drawn page come out identical). `readPage(img, { staffDeskew:
false })` and `scan-check.mjs --no-staff-deskew` read as before.

The rule was written from leaf 764 and frozen (commit with `eval/staff-curl-fresh-pages.json`) before
anything below was read. On leaf 764: staff 1 18 to 38 notes, staff 2 19 to 27, and 3706 now aligns
over all 215 of its notes instead of 1-191; its four leaf-764 differences are gone.

### On the 88 earlier piece checks it was not built on

All nine earlier piece lists (`--trials 0`, both ways; 3706 is in one of them, the leaf it was built
from):

| list | pieces | agree | differ | GABC only | scan only |
|---|---|---|---|---|---|
| scan-pages | 13 | 3,129 to 3,132 | 1 to 1 | 66 to 64 | 3 to 3 |
| quilisma-fresh | 18 | 3,438 to 3,449 | 37 to 37 | 121 to 110 | 5 to 5 |
| liquescent-fresh | 11 | 1,742 to 1,748 | 14 to 15 | 65 to 59 | 9 to 10 |
| clef-change-fresh (uncorrected files) | 14 | 3,256 to 3,303 | 9 to 5 | 80 to 61 | 10 to 8 |
| shape-fresh | 9 | 1,976 to 1,976 | 4 to 4 | 53 to 53 | 5 to 5 |
| rhombus-fresh | 6 | 751 to 751 | 1 to 1 | 7 to 7 | 3 to 3 |
| porrectus-liquescent, -fresh | 12 | 2,035 to 2,035 | 0 to 0 | 39 to 39 | 4 to 4 |
| offfinal-supplement | 5 | 878 to 878 | 0 to 0 | 64 to 64 | 0 to 0 |
| **all** | **88** | **17,205 to 17,272** | **66 to 63** | **495 to 457** | **39 to 38** |

Eight pieces changed, every one by reading more notes. One added a difference: 3419 (*Gaudeamus...
Boni Consilii*), whose alignment runs on into leaf 742 staff 5, which prints another piece (*Ego
sapientia*, under "Post Tempus Paschale dicitur"). That staff slopes 0.35 degrees; straightened, the
reader finds five more heads on it (two on the f line at x 296 and 382 were checked on the crop), and
3419's alignment against notes that are not its own shifts by one. Not a misreading.

### Held out: ten pieces on pages with a curled staff, chosen by geometry before reading

`staff-curl-fresh-pages.json`: of the 318 GregoBase ids 3463-3800 in no earlier list (all from the 1908
Graduale), the 136 whose printed leaf no earlier list reads. Their printed leaf and the leaf after (173
leaves) were downloaded and only `staffSkew` was run on each staff, with no heads read. 7 of the 173
leaves (4%) have a staff that slopes 10 px or more on its own; the 10 pieces whose printed leaf or the
leaf after is one of them were listed and committed, then read both ways. The GABC files are unmodified
GregoBase downloads in `corpus/gregobase-1908-curl/`. Report after: `staff-curl-fresh-report.md`.

| piece | curled staves (px over the page) | agree | differ | GABC only | scan only |
|---|---|---|---|---|---|
| 3483 (Anima... sicut passer) | leaf 609: staff 6 14.3, staff 9 20.3 | 203 to 252 | 6 to 0 | 11 to 1 | 5 to 2 |
| 3545 (Laudate Dominum) | leaf 655: staves 1-3, 10.6-13.3 | 232 to 251 | 0 to 0 | 23 to 4 | 1 to 0 |
| 3550 (Rogate quae ad pacem) | leaf 681: staves 1-2 | 183 to 188 | 3 to 2 | 8 to 4 | 1 to 0 |
| 3791 (Ave Rex noster) | leaf 665: staff 8 -10.6 | 214 to 218 | 0 to 0 | 5 to 1 | 0 to 0 |
| 3533, 3652, 3704, 3718, 3741, 3797 | | unchanged | | | |
| **all ten** | | **1,611 to 1,688** | **28 to 21** | **78 to 41** | **38 to 33** |

No piece got worse. Of the six unchanged, the curled staff is on a leaf the piece does not reach (the
leaf after, holding the next piece) or, for 3741 (*Recordare Virgo*, p. 600) and 3533 (*Laudate
Dominum*, p. [208]), the piece is not on the four leaves read at all: the alignment covers 1-68 of
3741's 120 notes and 8-81 of 3533's 97, on other pieces' staves, and their 10 and 7 differences are that
mismatch, the same both ways. The page-to-leaf rule (p+26, [p]+585) does not hold for p. 600; not
looked into.

## The clef-change list after both

`clef-change-fresh-report.md`, rewritten with the corrected files and the straightened staves: 3,306
notes agree and 2 differ (3506's left-stemmed cephalicus and 3679's porrectus top, above), from 3,256
and 9. Planted one-step errors caught: 193-200 of 200 per piece.

## Not done

- 3506's cephalicus with a left stem and 3679's porrectus top: reader faults seen once each, not fixed.
- The other piece lists' reports (`scan-check-report.md`, `quilisma-*`, `liquescent-*` ...) were not
  rewritten; the before/after numbers above are from fresh runs of `scan-check.mjs` on each list.
- A staff that bends (curls along its length rather than tilting) is straightened by its mean slope
  only. Of the curled staves seen, leaf 609's staff 9 (20 px) is the largest; how well a bend that
  strong reads was not measured separately from 3483's result.
- 3741 and 3533's page-to-leaf mapping.
