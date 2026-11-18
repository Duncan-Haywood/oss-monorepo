# A one-step cephalicus with a hollow small note (2026-11-17)

`one-step-cephalicus-check.md` left 10 of the 84 one-step cephalici on the twelve tuning lists unread
and said they had not been looked at one by one. `eval/one-step-check.mjs` now lists every miss with
its page, staff and x (the "still missed" table at the end of its report), and this run looked at all
ten, as 4x crops and, where the rule was tried, its window ink row by row.

## The ten misses

| piece | syllable (want) | leaf, staff | what the reader does | why |
|---|---|---|---|---|
| 3478 *Benedicite Dominum* | e `kj~` | 560, 1 | k, small note lost | hollow small note: 4 solid rows, 5.6 needed |
| 3481 *Juravit Dominus* | cér `ed~` | 618, 10 | e, small note lost | hollow small note: 5 solid rows, 5.7 needed |
| 3448 *Diffusa est* | in `gf~` | 376, 1 | g, small note lost | hollow small note: 3 solid rows, 5.7 needed; then a broken stem |
| 3405 *Adjuvabit eam* | vul `ih~` | 635, 2 | i, small note lost | hollow small note (gained by the bridge below) |
| Salve Regina (solemn) | con `gf~` | 84, 4 | g, small note lost | head falls 0.124 spaces across, over the 0.12 `maxFall` |
| 3439 *Qui sequitur me* | tér `gf~` | 598, 2 | g then e~ | `liquescentTail` took it first and read the small note a step too low |
| 3524 *Gloriosus Deus* | vir `hg~` | 605, 9 | head lost, small note a rhombus | the cephalicus touches the head before it |
| 3421 *Narraverunt* | non `hg~` | 434, 3 | h as a rhombus | not traced |
| 3550 *Rogate quae ad pacem* | dán `ih~` | 681, 3 | i, i | curled staff (staff-curl list); not traced |
| 3741 *Recordare Virgo* | COR `fe~` | 627, 3 | f, e as a rhombus | not traced |

The commonest fault is in the print, not the layout. In this Graduale (1908, archive.org
`gradualesacrosan0000cath`) many small notes are drawn with a white counter: in the rule's window
(0.55 to 0.85 spaces below the head's centre) their upper rows are two bars either side of a 2-3 px
gap, the stem side 3-4 px wide and the far side 3 px, and only their last 3-5 rows are solid. 3478,
ink row by row from the head's centre, `|` at the right part's start (`#` where inked), one character a
pixel:

```
  46 ·············██········#███··███·····
  57 ·············██········#███··███·····
  68 ·············██········#███··███·····
  70 ············████······█#████████·····
  79 ············████·······|███████······
```

The rule counted a row only when its longest run of ink was 0.18 spaces (6-7 px) or wider, so the
counter's rows did not count, and the solid rows alone fell short of `minRows` (0.15 spaces).

## The change (`ONE_STEP.gap`, `scan.mjs`)

The run-width test bridges a gap of up to 0.1 spaces (4 px at 37 px a space) inside the run. Nothing
else in the rule changes: the half-the-columns test, the hairline stem, the level head and the ink
ending by 0.95 spaces still have to hold. A podatus's stem is still one narrow run with nothing within
a counter's width beside it. `readPage(img, { oneStepGap: false })` reads without the bridge.
Test: `scan.test.mjs`, "a one-step cephalicus whose small note has a white counter is read".

## On the twelve tuning lists

`node eval/one-step-check.mjs --before gap <the twelve lists>` (the new `--before gap` compares
against the rule without the bridge instead of with the rule off):

| | rule without bridge | with bridge |
|---|---|---|
| one-step cephalici read at their pitch (head too) | 74 (74) of 84 | 77 (77) of 84 |
| on-line liquescents read | 132 of 153 | 135 of 153 |
| other liquescents read | 100 of 105 | 100 of 105 |
| false liquescents | 13 | 13 |
| notes agreeing / differing | 24,364 / 82 | 24,367 / 82 |
| GABC only / scan only | 606 / 88 | 603 / 88 |

The report's nine changed scan notes are four places (lists sharing a leaf report it more than once).
All four were looked at as crops, and every one is a one-step cephalicus with a hollow small note:
560:1:1320 (3478 e `kj~`), 618:10:908 (3481 cér `ed~`), 635:2:1745 (3405 vul `ih~`), and 757:4:1043, a
place outside the aligned pieces (a `ih`-shaped cephalicus before *paupé-*). Nothing was removed or
moved. 3448 *in* is not reached: with the bridge its window holds 8 counted rows (5.7 needed), but its
hairline stem has a break in the print just under the head (the stem test follows ink down from the
head's centre and stops 0.22-0.24 spaces down at every candidate column), so the stem test fails. The
stem test was not loosened for one place.

## Registered before the held-out pages were read

The plan was a held-out piece list like `one-step-fresh-pages.json`. `eval/one-step-hollow-fresh.mjs`
(made from `one-step-fresh.mjs`, GregoBase ids 3000 to 6999 in no earlier list, the thirteen lists
included, none of whose four leaves an earlier list reads, Graduale Romanum 1908 only, with a one-step
cephalicus in the GABC) found one piece: GregoBase 3357 *Ecce oculi* (leaf 456, one cephalicus). The
earlier lists have used up GregoBase's 1908 Graduale transcriptions, so a list with GABC to align
against is too small to say anything. Two held-out checks instead, both written down here and
committed before any of their pages was downloaded:

- **Aligned:** `one-step-hollow-fresh-pages.json` (the one piece), through `one-step-check.mjs
  --before gap`.
- **Unaligned:** `one-step-hollow-leaves.json`, 31 Graduale leaves no list reads (leaves 40 to 899,
  one in every 16 of the unread ones, `eval/one-step-hollow-leaves.mjs --pick`), each read with and
  without the bridge. There is no GABC, so this measures precision only: every note that changes is
  listed and looked at as a crop.

Predictions, bridge as frozen above:

1. On the one aligned piece, agreeing notes do not fall and differing notes do not rise.
2. On the 31 leaves, the bridge changes at least one place (the tuning lists' 128 pieces, about 330
   leaves, gave four places, so about one place in 80 leaves; 31 leaves may well give none, and a
   zero would not count against the bridge, only leave it untested here).
3. Every place the bridge changes, on either check, is a one-step cephalicus when looked at: the
   head, a hairline stem down its left side and the small note one step below under its right half.
4. The bridge only adds liquescents where it changes anything: no note is moved to another pitch
   except the small note being read and the split piece it replaces.

## Held-out result

Run once each after the section above was committed (3a4ea7c21).

**Aligned** (`node eval/one-step-check.mjs --before gap --out eval/one-step-hollow-fresh-report.md
eval/one-step-hollow-fresh-pages.json`): GregoBase 3357, 219 notes agreeing and 0 differing either way,
no note changed. Its one cephalicus (*e-* `gf~`, leaf 455, staff 2) is missed both ways, and not by
this rule: `liquescentTail` claims the head first, as on 3439 in the table above.

**Unaligned** (`node eval/one-step-hollow-leaves.mjs`, `one-step-hollow-leaves-report.md`): 31 leaves,
258 staves, 8,356 notes. The bridge changes two places and only adds a liquescent at each, 101 to 103
liquescents in all:

| leaf, staff, x | added | looked at (4x crop) |
|---|---|---|
| 184, 7, 1571 | small note one step under the head | one-step cephalicus, head in a space, hollow small note on the line below, hairline stem (*impu-*) |
| 348, 9, 1520 | small note one step under the head | one-step cephalicus, the same shape, above the top line but one (*bis*) |

1. **Held.** Agreeing 219 to 219, differing 0 to 0.
2. **Held.** Two places on 31 leaves, more than the one in 80 leaves the tuning lists suggested.
3. **Held.** Both are one-step cephalici with a hollow small note, read at the right pitch.
4. **Held.** Nothing moved or removed; each change is one added liquescent.

The bridge stays on. With it the reader gets 77 of the 84 tuning-list one-step cephalici, up from 74,
and no check, tuning or held-out, found a place where it reads something that is not one.

## What is left

Seven tuning misses: 3448 (broken stem), the Salve Regina (head falls 0.124 spaces, just over
`maxFall`), 3439 and the held-out 3357 (`liquescentTail` reads the cephalicus first, the small note a
step low or the head itself as the liquescent: two places with the same fault, the next item), 3524
(cephalicus touching the head before it), and 3421, 3550 and 3741, not traced.
