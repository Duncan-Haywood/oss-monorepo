# Staff lines broken by a short white gap (2026-11-18)

## How it was found

The flagship row named three one-step cephalicus misses as "small note read as a rhombus" (GregoBase
3421 *non*, 3741 *COR*, 3524 *vir*; `eval/fleck-check.md`, What is left). Each was looked at with
`node eval/one-step-rhombus-diag.mjs ITEM:LEAF:STAFF:X` (heads near x with their boxes and shape
measurements, and the ink one character a pixel) and as crops of the page.

- **3421 *non* `gihhg~`** (leaf 434, staff 3): the place the check's "still missed" table names (x
  1190) is the climacus on *re-* of *regum*, a virga and two rhombi, which the alignment paired with
  the cephalicus. *non* itself was never read: staff 3 stopped at x 1243. Every line of that staff
  has a white break 5 px wide there, and `staffExtent` kept only the longest unbroken stretch (gaps
  of 4 px or less allowed), so *gum, et non con-* (11 notes) was dropped.
- **3741 *COR* `fe~`** (leaf 627, staff 3, x 562): the same: x 562 is a virga and two rhombi
  (*omni-a*), not the cephalicus. Not traced further this run.
- **3524 *vir* `ghg~`** (leaf 605, staff 9): a real cephalicus, read wrong. The head h and its small
  note are one block 1.10 spaces tall; the small note's columns also come out as a narrow piece of
  their own (0.29 spaces wide, called a rhombus) at g, read before the head, so the scan gives g g h
  for g h g~. It has no hairline stem down its left side, so `oneStepCephalicus` does not try it.
  Not fixed this run.

So the most common of the three is not a cephalicus fault at all but a staff-finding one, and it
loses whole stretches of staff.

## How often (the tuning lists' 323 cached pages, 2,411 staves)

Every stretch over 3 spaces long where all lines are inked, and the white gap to the next one:

| gap (spaces) | staves | what the crops show |
|---|---|---|
| 0.1 | 5 | breaks at a bar line or mid-phrase (355:2, 409:4, 434:3, 527:1, 793:5) |
| 0.2 | 8 | the same, and the break after a double bar where a new piece continues on the staff (581:3) |
| 0.3 | 3 | a decorated initial's box (575:1); a double bar (623:8); 581:2 |
| 0.4 | 5 | a decorated initial (371:1); double bars (622:4, 777:5); 779:5, 793:4 |
| 0.6 | 2 | a decorated initial (586:1); 359:2 |
| 1.4 to 2.9 | 5 | not looked at; not joined |

489:2 (0.2) is the worst kind: the 131 px left of the break hold the staff's clef and a note, and the
clef was lost with them.

## The change (`STAFF_JOIN`, `scan.mjs` staffExtent)

Two stretches, each over `minLen` (3) spaces, are one staff when the gap between them is at most
`gap` (0.5) spaces and neither is a decorated initial's box, told by the ink between the lines: an
initial's box is over `dense` (0.35) inked there; a staff stretch, heads and all, is far under. The
read stretch is then the longest after joining, as before. `findStaves(bin, { staffJoin: false })`
(and `readPage(img, { staffJoin: false })`) reads as before. Tests: `scan.test.mjs`, "a staff whose
lines are broken by a short white gap is read on both sides" and "a decorated initial whose box
crosses the staff lines is not joined to the staff".

On the 323 cached pages it changes 17 staves' stretches (+9,280 px of staff, about 250 spaces); the
three decorated initials are not joined, and no staff is found or lost.

## Registered before the held-out pages were read

`eval/staff-gap-leaves.json`: 72 Graduale leaves (40 to 899) that no `eval/*pages*.json` and no other
`eval/*leaves.json` reads, one in every 6 in leaf order from the 4th, picked by
`node eval/staff-gap-leaves.mjs --pick` and checked absent from the page cache. There is no GABC for
them, so `node eval/staff-gap-leaves.mjs` reads each page with and without the join and lists every
staff whose stretch changes. Predictions, written before any of them was downloaded:

1. The join changes the stretch of between 2 and 20 staves (the tuning pages: 17 in 2,411, about one
   staff in 140; 72 leaves hold about 600).
2. Every changed staff, looked at as a crop, is a break in that staff's own lines (at a bar line,
   mid-phrase, or after a double bar with the staff continuing); none joins a decorated initial, a
   page frame or other ink that is not staff.
3. The same number of staves is found with and without the join.
4. Every staff whose stretch does not change reads exactly the same notes both ways.

## On the twelve tuning lists

`node eval/one-step-check.mjs --before join --out eval/staff-gap-tuning-report.md <the twelve lists>`
(the new `--before join` compares against `staffJoin: false`):

| | without the join | with it |
|---|---|---|
| notes agreeing with the GABC | 24,397 | 24,479 (+82) |
| differing | 83 | 89 (+6) |
| GABC only | 572 | 569 |
| scan only | 89 | 91 |

By list: porrectus-liquescent +66 agreeing (staves whose clef was on the side cut off before: every
note on them was read against the wrong clef and is now right), clef-change +15, liquescent-fresh +1;
the other nine lists unchanged in every count.

The six new differing notes are all on leaf 434 staff 3 (3421 *Narraverunt*), the staff this began
with: the eleven notes the join brings back (*gum, et non con-*) are read at the right intervals, and
*non* `gihhg~` comes out g i h h g~ in shape, cephalicus and all, but two steps high. That staff's F
clef, on the second line from the top as GABC's `f3` says, is read at position 2 with or without the
join (a crop at 3x shows the clef plainly), so the whole staff was already two steps high, and the
notes the join adds are too. It is a clef-reading fault of its own (next). The added notes on the
other lists that pair with nothing are outside the aligned pieces (the end of the piece before, or
the start of the next, on a staff a double bar splits); on leaf 779 staff 5 the c3 clef the join now
finds is the print's (the GABC piece on the right of the double bar is in c4).

## The held-out leaves

`node eval/staff-gap-leaves.mjs` (`eval/staff-gap-leaves-report.md`): 72 leaves, 530 staves, 17,374
notes, **the same both ways: the join changes no staff.**

| prediction | held? |
|---|---|
| 1. the join changes 2 to 20 staves | **failed**: 0 |
| 2. every changed staff is a break in its own lines | nothing to look at |
| 3. the same number of staves found both ways | held (530 and 530) |
| 4. unchanged staves read the same notes | held (all 530) |

So, held out, the join did no harm and no good. The breaks are not spread evenly: on the tuning pages
the 17 fall on leaves 355-359, 409, 434, 489, 527, 581-589, 622-623, 719 and 777-794, while the held-
out pick (one free leaf in six) is mostly leaves 44-350 and 796-897, where the earlier lists left the
most free leaves. Zero in 530 against 17 in 2,411 would happen about 2% of the time if breaks were
spread evenly, so they probably are not; the pick did not test where they are common. The gain rests
on the tuning lists, where every changed staff (17, all looked at as crops) is a real break in the
staff's own lines and the counts above move one way.

## What is left

- Leaf 434 staff 3's F clef read at position 2 for 4 (`findClef` takes the clef from its first tall
  columns; an F clef's front block and stem come first). With it fixed, 3421 *non*'s cephalicus would
  count as read.
- 3524 *vir* `ghg~` (leaf 605, staff 9): a cephalicus with no hairline stem whose small note's columns
  come out as a narrow piece of their own, read before the head.
- 3741 *COR* `fe~`: the place the report names is a climacus on *omni-a*; the real place is not found
  yet.
- The "still missed" table names the nearest paired neighbour, which on 3421 and 3741 was another
  neume entirely: worth naming the staff stretch read, so a lost stretch shows up as one.
