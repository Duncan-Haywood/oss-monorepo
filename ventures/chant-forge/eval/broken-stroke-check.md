# The last two reader faults on the clef-change list (2026-11-15)

`staff-curl-check.md` left two differences on the clef-change fresh list, both put down to the scan
reader and "seen once each, not fixed": GregoBase 3506's cephalicus on leaf 403 and 3679's porrectus
top on leaf 721. Both are fixed here. The first was not what it looked like.

## 3506: not the left stem, the clef in force

The note was read as "a cephalicus with its stem on the **left** running down to the bottom line;
`liquescentTail` takes the longest run and reads the small note three steps low". Looked at again
(leaf 403, staff 6, x 1297), the printed neume is `fe~` with a hairline stem down the left and the
hook on the right, as the earlier note says. But `readStaff` reads it right: the head at position 2
and the small note at position 1, one step down.

The fault is in `readPage`. Staff 6 has a C clef printed inside it (c4 to c3), and each note's
clef is looked up by its left edge, `x0`. The liquescent's small note was built from the tail
(`{ x, y, pos }`) with no `x0`, so `clefAt(undefined)` returned the staff's first clef: the note was
read against c4, two steps lower than the head beside it. So every liquescent after a clef change was
misnamed. The fix reads the clef at `x0 ?? x`. One drawn-page test in `clef-change.test.mjs`.

## 3679: a stroke broken near its top (`BROKEN_STROKE` in `scan.mjs`)

Leaf 721, staff 6, x 709, *ad-ju-tó-*: `jhi`, a porrectus from the top line down to the line below,
with its third note on a stem. The reader gave i h i. The stroke came out as two pieces: a short top
(0.56 spaces wide, centre falling 0.12 to 0.38 spaces below the top line) and the rest starting at its
right edge (1.15 spaces wide, falling 0.63 to 1.02). The break between them is a 9 px jump in the
stroke's centre, past the 0.2-space limit `readStaff` uses to join columns. The short top falls 0.26
spaces on its own, under `STROKE_TOP_FALL` (0.4), so it was read at its mean height, a step low.

The rule: a head that falls at least 0.15 spaces but under 0.4, does not continue a stroke on its
left, and whose right edge runs (within 0.1 spaces) into a piece wider than 0.8 spaces that starts
within 0.35 spaces of its right end's height and falls at least 0.15 spaces further, is read at its
left end, and that wide piece at its right end. Set from this one stroke and frozen before the checks
below. `readStaff(bin, staff, { brokenStroke: false })` and `scan-check.mjs --no-broken-stroke` read
as before. One drawn-page test in `scan.test.mjs`, with the leaf 721 geometry (the top piece drawn
0.04 spaces lower so its mean rounds a step low, as the real one did).

## On the 98 earlier piece checks

All ten earlier piece lists (`eval/*pages*.json`), `--trials 0`, the reader as on `main` against both
fixes:

| | before | clef fix only | both |
|---|---|---|---|
| notes agreeing with the GABC | 18,963 | 18,964 | 18,966 |
| notes differing | 81 | 80 | 78 |
| GABC only (not read) | 498 | 498 | 498 |
| scan only | 71 | 71 | 71 |

Three pieces changed, each from one difference to none: 3506 (the clef fix), 3679 and 3403 (the
broken stroke). 3403's was leaf 513, staff 5, x 1693, *su* `ef/hfh`: the porrectus top read g, printed
h. That is one of the "broken-up strokes (3403, 3408)" the flagship listed; 3408's are not this
fault (unchanged). No piece got worse; no note was lost or added.

## Held out: fifteen pieces with a porrectus, listed before their pages were read

`broken-stroke-fresh-pages.json`, written by `eval/broken-stroke-fresh.mjs` after the rule was frozen
and before any of its pages was downloaded: in id order from 3463, the first 15 GregoBase ids in no
earlier list whose `book:` header names only the 1908 Graduale and whose GABC has a porrectus. GABC
files are unmodified GregoBase downloads in `corpus/gregobase-1908-stroke/`.

Both ways, identical: 2,869 notes agree, 2 differ, 60 not read, 7 scan only
(`broken-stroke-fresh-report.md`). The rule fired 5 times on those 52 leaves and changed no
aligned note. So the held-out list shows the rule does no harm; it does not show it helps, since none
of its strokes broke in the way leaf 721's did.

## How often it fires

On all 303 cached leaves, the rule fires 43 times. Twelve were cropped and looked at (leaves 376, 405,
420, 426, 444, 445, 489, 505, 558, 613, 664, 787): every one is the left end of a real porrectus
stroke. In most of them the short top piece's mean already rounds to the top note, so reading it at
its left end changes nothing; it matters only when the mean falls past half a step, as on leaves 721
and 513.

## Not done

- The two held-out differences: 3464 *sanc-* `fd~` read e (a cephalicus whose small note is read a
  step high) and 3481, leaf 618, staff 9, x 200 (a mark at the staff's start paired with a g and read as
  m). Not looked at on the scan.
- 3408's strokes; the left-stem cephalicus as a shape (the stem did not cause 3506's difference, but
  whether `liquescentTail` handles a left stem in general was not measured).
- A second reader for the twelve crops.
