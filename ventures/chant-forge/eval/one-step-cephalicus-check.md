# A one-step cephalicus read as one head (2026-11-16)

`hook-on-line-check.md` ended on two held-out misses, GregoBase 3490 *con-* `gf~` (leaf 773, staff 1)
and 3508 *et* `gf~` (leaf 382, staff 9), and named them the next item: "tell a one-space-tall head with
a notch on its lower right from two touching heads".

## The fault, as main reads it today

Both are a one-step cephalicus: the head in a space, a hairline stem down its left side, and the small
note on the line just below, joined under the head's right half (crops looked at at 4x). Main has moved
since that note was written, and the two now fail in different ways (ink read row by row):

- **382, staff 9, x 1414.** The head is rows 2613-2640, the small note rows 2643-2657, 10 px wide under
  the head's right half. Where the small note touches the head, the column's run is 41 px, over the
  two-head split length, so it is split in two; the lower halves are only 5 columns wide, under the
  0.25-space minimum, and are dropped. Where it does not touch, the small note's own run (12-14 px) is
  under the 0.4-space minimum head height. The head is read at its pitch (g); the small note is lost.
- **773, staff 1, x 1544.** Head and small note are one block 44 px tall. Every column is split in two,
  so the reader returns two plain heads, g and f, and reads them bottom-up as it does a podatus: f
  (called a rhombus, being narrow) then g. The GABC is g then f~.

`liquescentTail` sees neither: the small note hangs 0.5-0.8 spaces below the head's centre, under the
0.6-space minimum tail.

## The rule (`oneStepCephalicus`, `ONE_STEP` in `scan.mjs`)

Tried only on a head `liquescentTail` gave no tail, and not on a porrectus stroke's top piece. In a
window 0.55 to 0.85 spaces below the head's centre (where a small note one step down sits and the head's
own ink has ended):

- the head's right part (from 45% of its width) has rows inked across at least half its columns, in a
  run 0.18 spaces or wider, for 0.15 spaces or more;
- its left part (past the stem) is at most 30% ink, so it is not a second full head;
- the right part's ink has stopped by 0.95 spaces below the centre (not a longer tail or a stem);
- the head is level (its centre falls at most 0.12 spaces across it);
- a stem at the head's left edge runs down 0.95 spaces or more and is a hairline, 0.2 spaces or less
  across, beside the small note.

The small note is then read one step under the head, after it, as a liquescent, and a piece read as a
head of its own there (the small note, or the lower half of a split run) is removed.
`readPage(img, { oneStep: false })` reads as before. Test: `scan.test.mjs`, "a one-step cephalicus".

## Set on the twelve earlier lists

`node eval/one-step-check.mjs <the twelve eval/*pages*.json>` (128 pieces; the check counts, beside
`hook-on-line-check.mjs`'s columns, the GABC liquescents whose note before, in the same group, is a
plain punctum one step higher). Four tries:

| try | one-step cephalici read (of 84) | notes agreeing | differing | false liquescents | changed scan notes |
|---|---|---|---|---|---|
| main | 69 | 24,359 | 82 | 13 | |
| 1. first version, tried before `liquescentTail` | 78 | 24,356 | 94 | 25 | 636 |
| 2. after `liquescentTail`, not on stroke tops | 78 | 24,368 | 82 | 13 | 60 |
| 3. (frozen) and a hairline stem, a small note wider than a stem, a level head | 74 | 24,364 | 82 | 13 | 37 |

Try 2 looked clean in the counts, but its changed notes outside the aligned pieces were looked at
(crops of 12 places): six were true cephalici, and the rest were the upper head of a quilisma podatus
(the quilisma passed for the stem and the podatus's right stem for the small note: leaves 394, 445,
486), a porrectus stroke's top piece too level to be marked as one (leaf 517), and two places on a
blurred page (leaf 356). Try 3 removes all of them. Its 37 changed notes are 14 places (lists that
share a leaf report it twice, in their own clef letters); all 14 were looked at (crops of twelve, the
ink row by row for 382 and 773), and every one is a one-step cephalicus, either newly found or a split
lower half relabelled as the small note (`one-step-tuning-report.md`). Three true gains of try 2
(`kj~`, `ih~`, `ed~`) are not reached, the price of dropping the false ones.

## Registered before the held-out pages were read

`one-step-fresh-pages.json` (12 pieces, 17 one-step cephalici in their GABC) was written by
`eval/one-step-fresh.mjs` with this section, before any of its pages was downloaded. A first draw,
made the same way but without the leaf test, shared leaves with 14 of its 15 pieces: those pages had
been read by the rule while it was set, and some of their crops looked at, so it was thrown away
unrun and the builder now also skips any piece whose four leaves an earlier list reads. GregoBase ids
to 3999 gave 12 pieces, not 15. Predictions, rule as frozen above:

1. At least one more one-step cephalicus is read at its pitch than on main (the tuning set gained 5
   of the 15 main missed, so a gain, not most of the misses).
2. No scan note that agrees with its GABC note on main disagrees with the rule on (notes agreeing do
   not fall, notes differing do not rise).
3. False liquescents and other liquescents read are unchanged.
4. Every place the rule changes, inside or outside the aligned pieces, is a one-step cephalicus when
   looked at.

## Held-out result

`node eval/one-step-check.mjs --out eval/one-step-report.md eval/one-step-fresh-pages.json`, run once
after the section above was committed (e944acb55):

| | main | rule on |
|---|---|---|
| one-step cephalici read at their pitch (head too) | 16 (16) of 17 | 17 (17) of 17 |
| on-line liquescents read | 10 of 11 | 10 of 11 |
| other liquescents read | 19 of 22 | 20 of 22 |
| false liquescents | 1 | 1 |
| aligned notes agreeing / differing | 2,062 / 0 | 2,063 / 0 |
| places the rule changed | | 3 |

1. **Held.** One more one-step cephalicus read: GregoBase 3642 *in* `hg~` (leaf 441, staff 4), the one
   main missed. Main split the block in two and read the small note as a plain head.
2. **Held.** Agreeing 2,062 to 2,063, differing 0 either way.
3. **Failed as worded.** False liquescents are unchanged, but "other liquescents read" rose 19 to 20:
   the gained `hg~` has its small note in a space, so it counts in that column too. That was my wording
   (the columns overlap), not a new behaviour; no other liquescent changed.
4. **Held.** The three places changed (441:4:1684, and outside the aligned pieces 467:6:1742 and
   500:9:207, both split lower halves relabelled at the same pitch) are each a one-step cephalicus
   (crops looked at).

So, as with the hook-on-line rule, the fault is rarer than the misses that pointed to it: main already
reads 16 of the 17 held-out one-step cephalici, and 69 of 84 on the tuning lists. The rule stays on.
Across the 140 pieces it reads 5 + 1 more cephalici at their pitch and their head in the right order,
loses none and adds no false liquescent.

## What is left

- On the tuning lists, 10 of 84 one-step cephalici are still missed; three (`kj~`, `ih~`, `ed~`) were
  reached by try 2 and lost when the stem had to be a hairline. Not looked at one by one.
- The held-out miss on the on-line list (10 of 11) and the 2 other liquescents (20 of 22) were not
  looked at.
