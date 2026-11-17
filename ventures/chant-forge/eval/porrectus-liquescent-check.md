# Liquescents that end a porrectus: already read (2026-11-14)

The liquescent report (`liquescent-check-report.md`, "Not done") and the flagship's `next:` listed
"liquescents after a porrectus end" as not looked for, on the guess that the 1908 Vatican type prints
them as a porrectus stroke with the small note hung off the stroke's lower end. This session measured
it instead of building for the guess. The guess was wrong, and the gap was mostly not a gap.

## How the 1908 type prints them

On every page looked at, a GABC porrectus liquescent (`hfg~`, `dcd~`, `efef~`: high, low, then a
liquescent above the low note in one neume element) is printed as **two separate heads**: the high
note with a stem down its left side, then the low note carrying the same short rising tail as an
epiphonus, ending in the small note. There is no slanted stroke. So the existing detector
(`liquescentTail` in `scan.mjs`), which looks at every head's right edge, already covers them.

## Pieces

GregoBase ids 3461-3999 were downloaded (495 pieces citing the 1908 Graduale; the other 44 ids cite
other books and were dropped). Every piece with a porrectus liquescent was listed (twelve pieces,
sixteen such notes; `porrectusLiquescents` in `porrectus-liquescent-check.mjs` finds them, and
`porrectus-liquescent.test.mjs` checks it). The six lowest ids became the tuning set
(`porrectus-liquescent-pages.json`) and the six highest the held-out set
(`porrectus-liquescent-fresh-pages.json`). Both lists were committed (commit "list porrectus
liquescent tuning and held-out pieces before scanning") before any of their pages was read. Three
more porrectus liquescents were already in pieces scanned by earlier sessions (GregoBase 3444, 3457,
3458). The twelve GABC files are unmodified GregoBase downloads, added to `corpus/gregobase-1908-checked/`, apart from
`corpus/gregobase-1908/`, so the arrangement figures counted over that folder (split, choir and
section reports) stay as published.

## Results

`node eval/porrectus-liquescent-check.mjs` (tables: `porrectus-liquescent-report.md`):

| set | porrectus liquescents | read as liquescent at their pitch | other liquescents read | other heads called liquescent |
|---|---|---|---|---|
| tuning, 6 new pieces | 6 | 6 | 11 of 11 | 0 of 939 |
| earlier sets (3444, 3457, 3458) | 3 | 2 | (see `liquescent-check-report.md`) | |
| **held out, 6 pieces** | **10** | **8** | 5 of 7 | **1 of 1,060** |

So 16 of 19 porrectus liquescents are read, 8 of 10 on the held-out pieces, about the same rate as
other liquescents (77-92% on the earlier sets).

## The three misses, looked at on the scan

- GregoBase 3458 (*Corona aurea*, leaf 730, staff 4, `dcd~`, tuning): a print fleck sits just above
  the small note. It stretches the tail to 1.00 spaces and widens its last 0.3 spaces to 0.42 spaces
  at the median row, just over the 0.40 cap (`LIQ.maxEnd`).
- GregoBase 3831 (*Mihi autem nimis*, leaf 365, staff 5, `df/gef~` twice, held out): the tail rises
  one step and the small note sits on a staff line. On *con-* nothing is read for it; on *prin-* the
  small note plus the line crossing it pass the full-head height test, so it is read as a square at
  the right pitch (pitch right, shape wrong).

## No rule change

Before the held-out run, the end-width cap was tried looser on the 50 pieces of the earlier shape
sets (`shape-check.mjs`; none of the held-out pieces are among them). At 0.43 no GABC liquescent was
gained and two more heads were called liquescent; at 0.46 none was gained and ten more were. The
rule was left as it was, and the held-out set ran once against it.

## Note check on the twelve new pieces

`node eval/scan-check.mjs --manifest` on both lists: 2,030 notes agree with the book and 5 differ
(3 in GregoBase 3486, 1 in 3912, 1 in 3949). Planted one-step errors are caught 196-200 times in
200 per piece. The 5 differences have not been looked at; they are listed with page, staff and x in
the scan-check report that command writes.

## Not done

- The one-step hook ending on a staff line (both held-out misses) is not handled. A fix needs
  pieces beyond these, so that it can be tested on pages it was not set on.
- A small note that the reader takes for a full head (3831, *prin-*) could be recognised by its
  height next to its neighbour's. Not tried.
- The 5 note differences on the new pieces were looked at on 2026-11-14: one transcription slip in 3912 (corrected) and four porrectus tops the reader read a step low (fixed); `porrectus-top-check.md`.
