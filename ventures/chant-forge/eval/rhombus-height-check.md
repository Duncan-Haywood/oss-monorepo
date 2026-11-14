# Rhombus height floor: worn squares read as rhombi (2026-11-14)

**Later the same day:** part of the cause below was the reader, not the print. Lines crowded with
heads were measured several times their thickness and the oversized line mask cut the edge columns
of squares on them (the Magnificat staff's top line: 17 px). With lines at their own thickness the
width-and-taper rule calls 8 squares rhombi instead of 18, and the floor 3 instead of 6:
`thick-line-check.md`.

Figures from `node eval/rhombus-check.mjs --held-out --sweep` (full table:
`rhombus-height-report.md`). The rule is `headShape` in `scan.mjs`, constant `RHOMBUS_MIN_H`.

## Where it started

On the eighteen pieces held out for quilisma version 3 (`quilisma-stroke-check.md`), the rhombus
rule (width under 0.42 staff spaces, end columns under 0.8 of the middle ones' height) called 14
of 2,641 squares rhombi, against 0 to 0.35% on the earlier sets. Nobody had looked at them.

## The look

Ten of the fourteen were on two staves: leaf 754 staff 7 (Magnificat, six) and leaf 747 staff 1
(Qui ambulat, four). Both staves were cropped from the 2000 px archive.org page and looked at.
The staff spacing there is normal (37.7 and 37.8 px, like every other staff on the page), so it
is not a scale error. The heads are ordinary squares whose worn type shows white flecks inside.
They mostly sit on a staff line. The flecks cut the columns at the head's edges below the
reader's minimum run, so the head measures 11 to 13 px wide (0.35 to 0.40 spaces) instead of
18 to 20 (0.50 to 0.56), and its short edge columns give a taper under 0.8. That is exactly a
rhombus's width and taper.

What the flecks do not change is the height. On leaf 754 staff 7:

| heads | width | height | fill | taper |
|---|---|---|---|---|
| real rhombi (x 880, 899, 918) | 0.32-0.35 | 0.69-0.74 | 0.76-0.79 | 0.65-0.69 |
| worn squares called rhombi (six) | 0.35-0.40 | 0.56-0.61 | 0.84-0.88 | 0.71-0.76 |
| ordinary squares | about 0.50 | about 0.58 | 0.90+ | 0.82-1.00 |

A rhombus is a square turned on its corner, so it stands taller than a square.

The other four of the fourteen:

| leaf:staff:x | what the crop shows | height |
|---|---|---|
| 619:3:1590, 619:6:672 | worn squares, as above | 0.61 |
| 636:3:1083 | a real rhombus (the third in a falling run); the alignment paired it with a neighbouring punctum | 0.67 |
| 635:3:1475 | the two heads of a stacked pes with a white seam between, read as one tall piece | 1.04 |

## Choosing the floor

Measured on every head paired by pitch with a GABC punctum or rhombus on all 50 pieces scanned
before this (`scan-pages.json` and the three fresh sets): 1,033 rhombi (1,026 read as rhombi)
and 7,501 squares (18 called rhombi). The heights of the 18 false calls: twelve at 0.56 to 0.61,
then 0.67, 0.71, 0.72, 0.72, 0.74 and 1.04. Of the 1,026 rhombi read, two are under 0.63 (0.56
and 0.60, both real rhombi that measure short); the rest are 0.63 or taller.

| floor | rhombi read | squares called rhombi |
|---|---|---|
| none | 1,026 of 1,033 | 18 of 7,501 |
| 0.58 | 1,025 | 14 |
| 0.60 | 1,024 | 10 |
| **0.62** | **1,024** | **6** |
| 0.64 | 1,014 | 6 |
| 0.66 | 993 | 6 |

0.62 sits in the gap between the worn squares (0.61 at most) and the rhombi (0.63 at least,
bar two). A ceiling was tried too, to catch the stacked pes at 1.04, and dropped: real rhombi
read up to 1.09 when a neighbour touches them, so a ceiling of 1.0 loses 15 rhombi to save one
square. These figures are not held out.

## Held-out test

Six GregoBase 1908 pieces in `rhombus-fresh-pages.json`: every piece in `corpus/gregobase-1908/`
not used by an earlier set, with at least one rhombus, whose four leaves had never been read. They
were listed and committed before the floor was chosen (commit "list the held-out pieces for the
rhombus rule before any is scanned"). The floor was frozen and committed before any of their
pages was downloaded. Nothing was changed after the run.

| set | rhombi paired | read as rhombi, before | after | squares paired | called rhombi, before | after |
|---|---|---|---|---|---|---|
| chosen on (50 pieces) | 1,033 | 1,026 | 1,024 | 7,501 | 18 | 6 |
| **held out (6 pieces)** | **103** | **103** | **103** | **596** | **1** | **1** |

The held-out set shows the floor costs no rhombus (103 of 103 kept). It cannot show the gain:
these six pieces had only one false call to begin with. That one (613:8:1631, Quod dico vobis)
was looked at: it is the same fault, a worn square on a line, measuring 0.62, right at the
floor. So the cut from 18 to 6 is measured on pieces the floor was chosen on; on fresh pages the
evidence is that it does no harm, not yet that it helps.

## What is left

- The six still called rhombi on the chosen-on set: four heads at 0.71 to 0.74 not yet looked at
  (434:2:1190, 742:5:786, 747:1:1398, 747:1:1483; the last two on the worn staff, so likely worn
  squares that kept their height), the stacked pes at 1.04 and the real rhombus the alignment
  mis-paired (not a reader fault). The 1908 off-final *et* print flaw (354:5:817), the one false
  call since the rule was first written, now reads as a square.
- Rhombi read as squares: seven on the chosen-on set before the floor and after it, four merged
  with a neighbour (heights 0.98 to 1.51) and three as wide as a square (0.53) and short; plus
  the two short rhombi the floor now loses (730:4:988 and 754:7:1533, both real diamonds on the
  crop).
- The held-out set is small (six pieces, 596 squares). A larger fresh set with worn pages would
  test the gain; every unused corpus piece with rhombi is now spent, so it needs new GABC files.
- Only the 1908 Vatican Graduale's scan on archive.org has been tried.
