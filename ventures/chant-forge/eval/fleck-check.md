# A head split by a white fleck (2026-11-18)

The flagship row named two one-step cephalicus misses as `liquescentTail` claiming the cephalicus
first and reading its small note a step too low: GregoBase 3439 *tér* `gf~` (leaf 598, staff 2) and
3357 *e* `gf~` (leaf 455, staff 2). Both were looked at again, alignment pair by pair and as 4x crops.
Neither is that fault.

- **3439:** the reader reads the cephalicus right, head g at x 1163 and small note f at x 1167. The
  note after it, *nae* `f` (x 1246, a square on the line), is not read at all, so the alignment pairs
  the scan's small note with *nae*'s f and leaves the GABC small note unpaired. The square has a white
  fleck in the print just under the line, three columns wide and four rows tall; every run in those
  columns is under the head-height cut (`minH`, 0.4 spaces), and the two halves either side are 9 and
  8 columns, each under the 0.25-space width cut, so both were dropped.
- **3357:** the print and the GABC disagree. On leaf 455 the cephalicus head sits on the same line as
  the head of the clivis after it (*jus* `hg`): the page prints `hg~`, GregoBase has `gf~`. The reader
  reads what is printed. Not a reader fault; listed in the "Not checked yet" transcription slips.

## The change (`FLECK`, `scan.mjs` readStaff)

Two pieces that are both under the width cut are joined into one head when they are at most
`FLECK.gap` (0.12) spaces apart, at the same height (centres within `FLECK.dc`, 0.15 spaces), together
0.4 to 0.8 spaces wide (`minW`, `maxW`), every column between them is inked over `FLECK.fill` (0.4) of
the head's height (the fleck is inside the head), and the head lies within `FLECK.reach` (1.0) spaces
of the staff. `readPage(img, { fleck: false })` reads without the join. Test: `scan.test.mjs`, "a head
split by a white fleck is read".

The first version had no `fill` or `reach` test. Its changes on the tuning lists, sampled as crops (16
at random), included one false note: the bold lyric under staff 8 of leaf 356, whose letters *s* and
*p* come apart into two pieces of a head's height. The `reach` test removed it (the `fill` test alone
did not: the letters touch). That cost three agreeing notes on the tuning lists (+33 to +30).

## On the twelve tuning lists

`node eval/one-step-check.mjs --before fleck --out eval/fleck-tuning-report.md <the twelve lists>`
(`--before fleck` is new: it compares against `fleck: false`):

| | without the join | with it |
|---|---|---|
| notes agreeing with the GABC | 24,367 | 24,397 |
| differing | 82 | 83 |
| GABC only | 603 | 572 |
| scan only | 88 | 89 |
| one-step cephalici read (head too) | 77 (77) of 84 | 78 (78) of 84 |
| false liquescents | 13 | 12 |

The fault is far commoner than the one place that found it. The join adds 209 notes on the 128
pieces' pages (some leaves are read by more than one list), moves none to another pitch, and turns four
liquescents into plain heads at the same pitch (373:4:1426, 726:7:466, 424:7:1264, 364:7:1475, all
outside the aligned pieces). All four, looked at, are podatus whose upper head the reader had taken for
an epiphonus tail rising from the lower one: the upper head's concave underside had cut it into two
narrow pieces, and with no head at the tail's end `liquescentTail` claimed it. Joined, the upper head
is a head again and the false liquescent goes (false liquescents 13 to 12 inside the pieces too). The
rows of the report whose x appears twice are a podatus's upper head added above a lower head read
before. 29 of the 209 pair
with a GABC note: 28 at its pitch, one a step off (3619, leaf 372, staff 7, x 212, `l` read for a
`j` in *tí* `hi!jwk`). The other 180 fall outside the aligned pieces (the lists read the leaves before
and after a piece, and local alignment uses only the piece), so they have nothing to pair with; 20 of
them, picked at random (seed 7), were looked at as crops, and all 20 are notes the reader had lost:
the upper head of a podatus whose concave underside leaves its middle columns short, quilismas whose
teeth do the same, the lower head of a clivis and a porrectus's last head with a fleck. 3439's
cephalicus is now read (77 to 78 of 84).

## Registered before the held-out pages were read

`eval/fleck-leaves.json` (`node eval/fleck-leaves.mjs --pick`): 29 Graduale leaves, 40 to 899, that no
piece list and not `one-step-hollow-leaves.json` reads, one in every 16 in leaf order from the 9th.
None was downloaded before this section was committed. Each is read with and without the join, and
every note that changes is listed (`node eval/fleck-leaves.mjs`). There is no GABC, so this measures
precision, not recall. Predictions, rule frozen as above:

1. The join moves no note to another pitch and removes none, except a liquescent that becomes a plain
   head at its pitch (as the four podatus above).
2. It adds at least one note per 30 staves (the tuning pages gave 209 on about 330 leaves of roughly
   9 staves, about one per 14 staves).
3. Of the added notes, a random 20 (or all, if fewer), looked at as 4x crops, at least 18 are real
   heads the reader had lost, at the pitch read. Every liquescent that becomes a plain head is looked
   at, and at least all but one are podatus or other plain heads, not real liquescents.
