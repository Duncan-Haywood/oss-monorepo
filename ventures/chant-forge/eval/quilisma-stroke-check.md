# Quilisma version 3: stroke pieces, stacked tops and liquescent heads (2026-11-14)

Figures from `node eval/shape-check.mjs` (full table: `shape-check-report.md`). The rule is
`isQuilisma` in `scan.mjs`.

## Where it started

The liquescent run (`liquescent-check-report.md`) scanned eleven new pieces, and on them the
quilisma rule (version 2: three or more notched rows, `notchRows`, and not `afterStroke`) called
17 of 1,631 other heads quilismas. That was more than any earlier set (12 of 1,849 at most), and
nobody had looked at them yet.

## The look

Each of the 17 was cropped from the 2000 px archive.org page and looked at, with the reader's
heads around it listed (width, centre, notched rows):

| what the crop shows | calls |
|---|---|
| a piece of a porrectus stroke read as one head, 0.84 to 1.16 staff spaces wide: the stroke's notches are white flecks in the print | 5 |
| a head with another head printed straight on top of it or straight under it (a stacked pes), with a white seam between | 7 |
| an epiphonus head (GABC `gh~`): its concave top looks like teeth | 1 |
| a square whose mottled print shows white flecks in its upper half | 4 |

## What separates them from real quilismas

Measured on every head the reader called a quilisma and every GABC quilisma paired by pitch, on
all 32 pieces scanned so far (`scan-pages.json`, `shape-fresh-pages.json`,
`liquescent-fresh-pages.json`): 53 paired quilismas with measurements and 41 false calls.

- **Fall.** How far the piece's centre drops from its left end to its right, in staff spaces
  (`feat.fall`; the mean centre of the first and last 0.15 spaces of columns). A porrectus stroke
  falls; a quilisma is level or, when it merges with the note above it, rises. Every one of the 53
  quilismas falls 0.01 or less (one merged with the note above it is 0.93 spaces wide and rises
  0.56); every stroke piece among the 17 looked at falls 0.13 or more, narrow ones (0.66 wide)
  included, and 17 of the 41 false calls fall 0.08 or more. A cut at 0.06 sits in the gap; 0.04
  to 0.08 give the same counts.
- **A head straight under it** (centres less than 0.3 spaces apart across, 0.3 to 0.8 spaces
  apart down; `feat.under`). A quilisma is the lowest note of its neume, so none of the 53 has one;
  6 false calls do. A head straight *above* is no use: 20 of the 53 quilismas carry the next note
  that way (the pes quilismaticus).
- **A liquescent tail** (`feat.liq`, from `liquescentTail`). None of the 53; 2 false calls.

Width alone was the first candidate (14 false calls over 0.75 spaces), but it loses the merged
quilisma above and misses the narrow stroke pieces, so the fall replaced it.

Version 3: a notched head is not a quilisma when it falls 0.06 spaces or more, has a head straight
under it, or carries a liquescent tail. On the 32 pieces it was chosen on, false calls go from 41
to 16 with no quilisma lost. Those figures are not held out.

## Held-out test

Eighteen GregoBase 1908 pieces in `quilisma-fresh-pages.json`: every unused piece in
`corpus/gregobase-1908/` with at least one quilisma, leaving out four whose printed page had
already been scanned. They were listed, and the rule committed, before any of their pages was
downloaded. Nothing was changed after the run.

| set | quilismas in the GABC span | paired by pitch | read as quilisma, version 2 | version 3 | other heads called quilisma, version 2 | version 3 |
|---|---|---|---|---|---|---|
| tuned on (5 pieces) | 9 | 6 | 6 | 6 | 3 of 1,546 | 1 |
| held out for rhombi (7) | 24 | 18 | 18 | 18 | 9 of 1,178 | 1 |
| fresh for quilismas (9) | 39 | 17 | 15 | 15 | 12 of 1,874 | 7 |
| liquescent fresh (11) | 20 | 12 | 10 | 10 | 17 of 1,631 | 7 |
| **quilisma fresh (18, held out)** | **79** | **55** | **47** | **47** | **29 of 3,080 (0.94%)** | **6 (0.19%)** |

On the held-out pieces version 3 removed 23 of the 29 false calls (10 falling stroke pieces, 10
tops of a stack, 3 liquescent heads) and lost no quilisma: the held-out quilismas fall 0.03 at
most, and none has a head under it or a tail.
The six it left, looked at on the scan:

| what the crop shows | where (leaf:staff:x) |
|---|---|
| a real quilisma that the alignment paired with a neighbouring note | 619:4:470 |
| a porrectus end that falls 0.05, just under the cut | 635:3:694 |
| the lower head of a stacked pes (seam), which the "under" test does not cover | 746:3:710 |
| a square with mottled print, next to or near a real quilisma | 752:2:1393, 791:9:598, 520:6:969 |

The eight paired quilismas read as something else: two narrow ones stacked under the next note
read as rhombi (the rhombus test runs first), and six with two or fewer notched rows (teeth not
visible at this scan's resolution).

The same eighteen pieces are a clean held-out test for the other shape rules, which were not
touched: rhombi 417 of 420, but 14 of 2,641 squares called rhombi (0.53%, against 0 to 0.35% on
the earlier sets, not looked at yet); liquescents 17 of 20 at their pitch, 2 of 3,116 other heads
given a tail, 1 added note with no GABC note at its pitch.

## Not done

- The stacked-pes seam on the lower head and the mottled squares are left. Both are squares with
  three notched rows; a quilisma's teeth are on its upper edge and a seam or fleck is not, but no
  measure tried here separates them.
- A head straight under a quilisma is assumed never to happen; it has not happened in 107 paired
  quilismas with measurements, but a book that prints a quilisma above a note would break it.
- Only the 1908 Vatican Graduale's scan on archive.org has been tried.
