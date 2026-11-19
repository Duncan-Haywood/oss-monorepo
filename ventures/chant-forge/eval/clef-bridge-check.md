# An F clef whose stem stands apart from its blocks (2026-11-19)

The staff-gap check (`eval/staff-gap-check.md`, What is left) ended on leaf 434 staff 3 (GregoBase
3421, *Narraverunt*): its F clef, on the second line from the top as GABC's `f3` says, was read at
position 2, so every note on the staff came out two steps high, the eleven notes the staff-gap join
brought back included.

## What the reader saw

`node eval/clef-diag.mjs gradualesacrosan0000cath:434:3` (new: the staff's start one character a
pixel, with `findClef`'s answer). The 1908 type's F clef is a square on the F line with a stem down
its right side, then the C clef's two blocks either side of the same line, joined by a curve on
their left. `findClef` takes the first columns whose longest vertical ink run is at least 0.9
spaces and spreads over the columns next to it while they stay that tall; the glyph's middle is the
clef line. Longest run per column on that staff:

| x | 109-123 | 124-127 | 128-129 | 130-133 | 134-147 |
|---|---|---|---|---|---|
| what | the square | its stem | white between stem and curve | the blocks' curve | the blocks |
| run (px; a space is 37.7) | 22-27 | 41-52 | 25-27 | 48-58 | 23-32 |

So the run stopped at x 128: the stem alone (y 2641-2692) was the clef, its middle 1.5 spaces
above the bottom line, rounded to position 2. Where the stem and the curve touch, as on most
printed F clefs, the run carries through both and the middle (stem foot to the upper block's top)
is the F line.

## The change (`CLEF_BRIDGE`, `scan.mjs` findClef)

The run now carries on over a white gap of up to `CLEF_BRIDGE` (0.15) spaces, 6 px here, when the
columns after it are tall again inside the same 1.4-space window. `readPage(img, { clefBridge: false })`
reads as before; `node eval/one-step-check.mjs --before bridge` compares the two. On leaf 434 staff 3
the clef is now position 4. A C clef is one tall curve with short blocks to its right, so there is
nothing within 0.15 spaces for the run to reach; a virga's stem straight after a C clef would have to
start within 6 px of the curve, inside the clef's own blocks.

## Registered before the held-out pages were read

`eval/clef-bridge-leaves.json`: 60 Graduale leaves (41 to 892) that no `eval/*pages*.json` and no
`eval/*leaves.json` reads (the staff-gap leaves included), one in every 6 in leaf order from the 1st,
picked by `node eval/clef-bridge-leaves.mjs --pick` before any was downloaded. There is no GABC for
them, so `node eval/clef-bridge-leaves.mjs` reads each page with and without the bridge and lists
every staff whose clef position changes. Predictions, written before any of them was downloaded:

1. The bridge changes the clef on between 0 and 10 staves of about 450 (the parted F clef is a print
   fault, not the rule).
2. Every changed staff, looked at as a crop, is an F clef whose stem stands apart from its blocks,
   and the new position is the printed F line; none is a C clef.
3. No staff whose clef does not change reads different notes.

## On the twelve tuning lists

`node eval/one-step-check.mjs --before bridge --out eval/clef-bridge-tuning-report.md <the twelve
lists>` (the same twelve as `eval/staff-gap-check.md`):

| | without the bridge | with it |
|---|---|---|
| notes agreeing with the GABC | 24,479 | 24,538 (+59) |
| differing | 89 | 73 |
| GABC only | 569 | 564 |
| scan only | 91 | 86 |
| false liquescents | 13 | 12 |
| one-step cephalici read (of 85) | 78 | 80 |

240 scan notes moved, all on six staves whose clef went from position 2 to 4. Each was looked at as
a crop: every one is an F clef on the second line from the top, stem standing apart from its blocks.

| leaf, staff | piece | notes agreeing before / after |
|---|---|---|
| 434, 3 | GregoBase 3421 *Narraverunt* | 12 / 33 (*non*'s cephalicus now read) |
| 557, 9 | GregoBase 3606 *Ego autem* | 0 / 38 |
| 557, 8 | (outside the aligned piece) | no GABC note either way |
| 428, 9 | (outside 3415 and 3412) | no GABC note either way |
| 430, 8 and 430, 9 | (outside 3412) | no GABC note either way |

On those four the notes pair with no GABC note both ways, so the counts do not see them, but the
crops show the clef plainly on position 4, so they too are now read right.

The first version of the rule moved a seventh staff, leaf 652 staff 2, from position 4 to 2. Its clef
is a C clef on the top line (position 6): the search, which starts half a space left of the lines,
lands on the edge of a decorated border there, so it was wrong before and wrong after. The bridge had
reached further into the border, whose ink runs to the bottom of the search window. The rule now
crosses a gap only to columns whose ink stays inside the window (a clef never reaches it), and 652:2
reads as before. That guard was added after the tuning lists had been read; both checks were run
again with it, with the totals above unchanged.

## The held-out leaves

`node eval/clef-bridge-leaves.mjs` (`eval/clef-bridge-leaves-report.md`): 60 leaves, 473 staves.
**The bridge changes no clef there.** Run both before and after the border guard; the same both times.

| prediction | held? |
|---|---|
| 1. the bridge changes 0 to 10 staves | held: 0 |
| 2. every changed staff is a parted F clef, now on its printed line | nothing to look at |
| 3. no staff whose clef does not change reads different notes | held (all 473) |

So, held out, the rule did no harm and found nothing to fix. Six parted F clefs in 2,411 tuning
staves against none in 473 is not surprising (about 1.2 expected if they were spread evenly). The gain
rests on the tuning lists, where every changed staff is a parted F clef looked at as a crop.

## What is left

- Leaf 652 staff 2: a decorated border inside `findClef`'s search window, so its top-line C clef is
  read at position 4. A start rule that skips a frame (ink running past the staff) is the next step.
- 3524 *vir* `ghg~` (leaf 605, staff 9): a cephalicus with no hairline stem whose small note's columns
  come out as a narrow piece of their own, read before the head.
- 3741 *COR* `fe~`: the place the report names is a climacus on *omni-a*; the real place is not found
  yet.
