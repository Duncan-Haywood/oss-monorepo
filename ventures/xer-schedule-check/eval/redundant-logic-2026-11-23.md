# Redundant logic on the public P6 files (2026-11-23)

`redundant.mjs` names relationships that another chain of links already
implies for any durations, so deleting them can change no date. This note
checks that claim on the six public XERs by deleting what it names and
rescheduling, and checks it finds links planted to be redundant.

Run: `bash eval/corpus-fetch.sh DIR && node eval/redundant-check.mjs DIR/xer --draws 5 --plants 20`
(about 4 minutes, nearly all of it the CCA file's 72 reschedules).

## What it found

| File | Open links checked | Redundant | of them sure | Duplicates | Lag-carrying | Time |
|---|---|---|---|---|---|---|
| CCA_R03_dt_24Oct11SC | 35,272 | 12,285 (34.8%) | 12,283 | 13 | 254 | 389 ms |
| hotel-project | 7,586 | 587 (7.7%) | 585 | 0 | 66 | 61 ms |
| Expressway_Project | 1,094 | 52 (4.8%) | 51 | 0 | 3 | 8 ms |
| terminal-building-airport | 84 | 4 (4.8%) | 4 | 0 | 1 | 1 ms |
| example_xer_file | 518 | 11 (2.1%) | 11 | 0 | 2 | 2 ms |
| sample | 41 | 0 | 0 | 0 | 0 | 0 ms |

"Open links checked" leaves out links into completed (CCA 2,412) or started
(CCA 5,522; example_xer_file 21) activities and links out of completed work
or an in-progress activity's start (CCA 2,290): their dates are actuals the
logic no longer moves. "Sure" means the lags compare exactly (see the module
header); the other 3 have lags on different calendars and are marked
"check".

The CCA figure is high, and spread out: the 12,285 leave 5,658 different
predecessors; 5,779 are implied by a chain of two links (A -> B -> C over
A -> C), 3,313 by three, the rest by longer chains; 146 by one link on the
same pair (an FS that already implies an SS or FF beside it, or a
duplicate). By type: 11,321 FS, 496 FF, 468 SS. A few activities carry many:
PGLS103331C340, C350, C370 and PGLS103391C220 have 181 redundant successor
links each.

## Deleting them changes nothing

Every redundant link in a set is deleted from a copy of the file at once, and
both copies are scheduled by `cpm.mjs`. Compared: every activity's early start
and finish, late start and finish, total float, free float, and every
project's finish. Then the same with every unstarted task's remaining
duration redrawn (0 to 3 times the file's, one in five set to zero), five
draws, the same durations in both copies.

| File | Deleted (sure) | Activities changed: file durations, draws 1-5 |
|---|---|---|
| CCA | 12,283 | 0, 0, 0, 0, 0, 0 of 15,849 |
| hotel-project | 585 | 0 of 4,236 in all six |
| Expressway | 51 | 0 of 823 in all six |
| terminal-building-airport | 4 | 0 of 66 in all six |
| example_xer_file | 11 | 0 of 425 in all six |

The "check" links (CCA 2, hotel 2, Expressway 1) deleted the same way: 0
changes in all six runs each.

Control: deleting the lag-carrying links instead (another path exists but
with less lag) does move dates, so the comparison can see a change: CCA
6,217 / 178 / 3,856 / 4,528 / 269 / 6,476 activities changed (and the
finish in one draw); hotel 6 / 177 / 18 / 153 / 0 / 1,068; example_xer_file
62 (finish moved) / 0 / 0 / 5 / 5 / 0; terminal 0 in five runs, 32 and the
finish in the sixth; Expressway 0 in all six (its 3 never drive under these
draws).

Free float is unchanged too, not only total float: the other path's first
link leaves the predecessor no later than the redundant link does, so the
smallest gap to a successor stays where it was (the argument is in the test
`deleting every named link at once keeps every date`).

## Plants

In a copy of each file, 20 times each: a duplicate of a random open link
(exactly one of the two copies must be named, so deleting every named link
never deletes both), and an FS link A -> C added over an existing FS chain
A -> B -> C.

| File | Duplicates named | A -> C named |
|---|---|---|
| all six | 20 / 20 each | 20 / 20 each |

## Limits

- Redundant for any durations is a stronger test than "not driving now"
  (free float above zero). A link with more lag than its other path is
  never called redundant, even if it does not drive today.
- Paths through started work are not used, and links touching it are not
  candidates, so a file late in its life has fewer candidates.
- Not yet checked against a commercial tool's redundant-logic count (Acumen
  Fuse) on the same file, nor imported into P6 after deletion: the cleaned
  XER is the original file less the TASKPRED rows, every other line as
  exported, but a P6 import of it is still to be done.
