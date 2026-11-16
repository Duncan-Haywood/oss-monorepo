# A liquescent whose small note sits on a staff line (2026-11-16)

The flagship's `next:` listed "a liquescent hook ending on a line (held-out misses)", and
`broken-stroke-check.md` left GregoBase 3464 *sanc-* `fd~` read e for d. They are the same fault.

## The fault

Leaf 604, staff 6, x 1289: a cephalicus whose head is on the third line and whose hook comes down
to the second line and straddles it (crop looked at). `readStaff` reads a staff line's rows as ink
only where ink runs out past both edges of the line, so a line does not glue heads together. That
line is crowded with heads, so `findStaves` measured it 8 px thick (2730-2737) where its own ink is
3 px (2730-2732). The hook's ink stops at 2736, inside the measured line, so no ink "runs out the far
side", the line's rows did not count, and `liquescentTail` traced the hook only to the line's near
edge (2729). The small note's pitch is read 0.25 spaces in from the tail's end: a step too close to
the head, e for d.

## The rule (`LIQ.onLine`, `LIQ.straddle` in `liquescentTail`, `scan.mjs`)

When a tail has been accepted as it stands, and its traced end is within 0.06 spaces of a staff
line's near edge, its end is moved to the line's far edge, but only if the small note straddles the
line: in the tail's column the ink that crosses the line runs on at least 0.08 spaces (3 px at these
scans) further than the median of the same measurement taken 0.5 to 1 space either side of the
tail. The rule never decides whether there is a tail, only where it ends.
`readPage(img, { hookOnLine: false })` reads as before.

Set on the 113 pieces of the eleven earlier piece lists (`eval/*pages*.json`), in three tries,
each run with `node eval/hook-on-line-check.mjs <lists>`:

| try | on-line liquescents read (of 128) | other liquescents read (of 97) | false liquescents | aligned notes agreeing |
|---|---|---|---|---|
| before (main) | 106 | 89 | 12 | 21,835 |
| 1. extend any trace that stops at a line, before the tail tests | 108 | 81 | 15 | 21,829 |
| 2. only move an accepted tail's end | 108 | 81 | 12 | 21,829 |
| 3. and only if the tail's ink runs unbroken into the line | 108 | 88 | 12 | 21,836 |
| 4. (frozen) and only if the small note straddles the line | 108 | 89 | 12 | 21,837 |

Try 1 let 130 marks become new tails. Tries 2 and 3 moved small notes printed in the space beside a
line (GABC g and e) whose edge touches the line: one had a white gap the trace bridged to the line's
fringe, and one (3704 *e* `fe~`, leaf 656, staff 4, x 1175) touched the line without crossing it.
Measured on the six notes looked at row by row, the straddle test gives +4 px on both true cases
(3464, and 3550 *bun* `df~`, an epiphonus, leaf 681) and -1 to +1 px on the four that touch.
The frozen rule moves two notes on the 113 pieces, both from wrong to right, and nothing else
(`hook-on-line-tuning-report.md`; each appears twice there because two lists share its leaf).
The two on-line liquescents it did not reach were not looked at.

## Registered before the held-out pages were read

`hook-fresh-pages.json` (15 pieces, 25 GABC liquescents with the small note on a line) was
written by `eval/hook-fresh.mjs` and committed (e034bc785) before any of its pages was downloaded;
this section was committed before the held-out run. Predictions, rule as frozen above:

1. At least one more on-line liquescent is read at its pitch than on main (the tuning set gained 2
   of 22 missed, so a small gain, not most of the misses).
2. No scan note that agrees with its GABC note on main disagrees with the rule on.
3. Other liquescents read and false liquescents are unchanged.
