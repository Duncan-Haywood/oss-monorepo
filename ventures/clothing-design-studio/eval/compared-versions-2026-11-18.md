# A whole earlier version by how it compared (2026-11-18)

`node eval/compared-versions.mjs`. One scripted session of nine versions
(black tee, sunburst halo 12 cm wide, price 45, 260 gsm; halo 20 cm; cream;
"Ave Maria" on the back; halo moved up 4 cm; price 55; halo 9 cm; 180 gsm;
price 39). 20 dev sentences (15 that compare with the present, 5 controls) and
12 held-out sentences written **before** `comparedVersion` existed and not
tuned on. All sentences are ours, not a designer's.

| | dev (20) | held out (12) |
|---|---|---|
| `main` before this change | 9 (5 controls; 4 by accident) | 3 (all by accident) |
| this change, first run | 18 | 11 |
| this change, after two fixes | 20 | 12 |

"By accident": the sentence wanted no change and got none, but for the wrong
reason ("This version already has the sunburst halo" for "the one where the
halo was smaller"). Before this change none of the 21 comparing sentences that
want a version was read right, and several were acted on wrongly: "the one
where the price was higher" moved the print up 2 cm **and set the selling price
to 1** (the "one" read as a number); "I liked it when the halo was bigger" made
the halo 15% bigger; "the version with the lighter fabric" switched fabric.

The two fixes after the first run:

1. "when the halo was larger" (dev) was caught as an information question by
   the "when ..." rule. A clause "when <subject> was/sat/cost ..." in statement
   order and without "?" is now read as pointing at a version; "when was the
   halo bigger?" is still asked.
2. "back to when the shirt cost more" (held out) lost its last word: the
   trailing-filler strip shared with `describedVersion` removes "more". The
   comparison reader uses its own strip without "more". This is the one
   held-out change; the held-out figure on the first run was 11 of 12.

## What it reads

- **Artwork size** (bigger, larger, wider, smaller, narrower; biggest...),
  **position** (higher, lower, further up/down/left/right; y grows downwards),
  of a named piece ("the halo", the "Ave Maria" text, "the image") or of the
  selected artwork ("it", "the print"). The piece is followed by its id, so a
  piece that moved area is not compared on position.
- **Price** (cheaper, more expensive, "cost more", "the price was higher"),
  **fabric weight** (heavier, thicker, lighter, thinner, with "fabric" named),
  **run** ("the run was larger").
- Comparatives return the most recent earlier version that compared that way
  with the present; superlatives return the session's extreme (latest among
  equals). The version is restored whole, one undo away, and the log says what
  the value was and is.
- "The bigger one" and "go with the bigger one" stay edits (they may name a
  variant on the panel); "the cheapest one" and "the heavier version" are read.

## Parser fix found on the way

"raise the price", "the price is higher than I want" and "lower the run" moved
the artwork (the direction words were read as a move). A direction attached to
price, cost, gsm, weight, quantity, run or order is no longer a move; "raise
the print a bit" still is. Not covered: "raise the price" without a number is
now "not understood" rather than a price change.

`eval/whole-versions.mjs` (23/23, 12/12), `eval/history-questions.mjs`
(41/41, 20/20) and `eval/negated-feedback.mjs` (30/30, 12/12) are unchanged.

## Before

```
MISS dev  "the one where the halo was bigger" -> This version already has the sunburst halo; nothing changed (want version 5 (latest with the halo wider than 9 cm))
MISS dev  "the version with the bigger halo" -> This version already has the sunburst halo; nothing changed (want version 5)
MISS dev  "when the halo was larger" -> - (want version 5)
MISS dev  "the one where the halo was biggest" -> This version already has the sunburst halo; nothing changed (want version 5 (20 cm, latest of 1-5))
MISS dev  "the one where the halo was lower" -> This version already has the sunburst halo; nothing changed (want version 3 (before the move up))
MISS dev  "the version where the print was higher" -> Move it up 2 cm (want nothing (it is at its highest))
MISS dev  "when it was more expensive" -> not understood (want version 7 (55))
MISS dev  "the one where the price was higher" -> Move it up 2 cm; Set the selling price to 1 (want version 7)
MISS dev  "the most expensive version" -> not understood (want version 7)
MISS dev  "the one where the fabric was heavier" -> not understood (want version 6 (260 gsm))
MISS dev  "the version with the lighter fabric" -> Use cotton jersey (want nothing (180 is the lightest))
MISS held "I liked it when the halo was bigger" -> Make it 15% bigger (want version 5)
MISS held "go back to the version with the larger halo" -> This version already has the sunburst halo; nothing changed (want version 5)
MISS held "the design where the halo sat lower" -> This version already has the sunburst halo; nothing changed (want version 3)
MISS held "back to when the shirt cost more" -> not understood (want version 7)
MISS held "the one where the fabric was thicker" -> not understood (want version 6)
MISS held "can we go back to the version with the biggest halo" -> This version already has the sunburst halo; nothing changed (want version 5)
MISS held "the version where the halo was further down" -> This version already has the sunburst halo; nothing changed (want version 3)
MISS held "the one with the heavier fabric" -> not understood (want version 6)
MISS held "the one where the price was higher was better" -> Back to one where the price was higher (not seen earlier in this session; applied as asked) (want version 7)
dev set: 9 of 20 read right; held-out set: 3 of 12
```

## After

```
ok   dev  "the one where the halo was bigger" -> Back to the version where the sunburst halo's size was bigger (20 cm wide; now 9 cm wide), from 3 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the version with the bigger halo" -> Back to the version where the sunburst halo's size was bigger (20 cm wide; now 9 cm wide), from 3 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "when the halo was larger" -> Back to the version where the sunburst halo's size was larger (20 cm wide; now 9 cm wide), from 3 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one where the halo was biggest" -> Back to the version with the biggest sunburst halo's size (20 cm wide; now 9 cm wide), from 3 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one where the halo was smaller" -> No earlier version had the sunburst halo's size smaller than now (9 cm wide); nothing changed
ok   dev  "the one where the halo was lower" -> Back to the version where the sunburst halo's position was lower (0 cm from the area's middle (up); now 4 cm from the area's middle (up)), from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the version where the print was higher" -> No earlier version had the sunburst halo's position higher than now (4 cm from the area's middle (up)); nothing changed
ok   dev  "when it was more expensive" -> Back to the version where the price was more expensive (55; now 39), from 1 change ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the one where the price was higher" -> Back to the version where the price was higher (55; now 39), from 1 change ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the most expensive version" -> Back to the version with the most expensive price (55; now 39), from 1 change ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the cheaper one" -> No earlier version had the price cheaper than now (39); nothing changed
ok   dev  "the one where the fabric was heavier" -> Back to the version where the fabric was heavier (260 gsm; now 180 gsm), from 2 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   dev  "the version with the lighter fabric" -> No earlier version had the fabric lighter than now (180 gsm); nothing changed
ok   dev  "the one where the text was smaller" -> No earlier version had the "Ave Maria"'s size smaller than now (21 cm wide); nothing changed
ok   dev  "the one where the wings were bigger" -> No version in this session had the angel wings; nothing changed
ok   dev  "make the halo bigger" -> Make it 15% bigger
ok   dev  "make it cheaper" -> not understood
ok   dev  "the one with the text" -> This version already has the text; nothing changed
ok   dev  "the previous size" -> Back to the previous print size: 20 cm wide (from 3 changes ago; the rest of the design is kept)
ok   dev  "the one without the text" -> Back to the version with no text, from 6 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print) (one undo brings this one back)
ok   held "I liked it when the halo was bigger" -> Back to the version where the sunburst halo's size was bigger (20 cm wide; now 9 cm wide), from 3 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "go back to the version with the larger halo" -> Back to the version where the sunburst halo's size was larger (20 cm wide; now 9 cm wide), from 3 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "the design where the halo sat lower" -> Back to the version where the sunburst halo's position was lower (0 cm from the area's middle (up); now 4 cm from the area's middle (up)), from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "back to when the shirt cost more" -> Back to the version where the price was more (55; now 39), from 1 change ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "the one where the fabric was thicker" -> Back to the version where the fabric was thicker (260 gsm; now 180 gsm), from 2 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "can we go back to the version with the biggest halo" -> Back to the version with the biggest sunburst halo's size (20 cm wide; now 9 cm wide), from 3 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "the one where the halo was a bit smaller" -> No earlier version had the sunburst halo's size smaller than now (9 cm wide); nothing changed
ok   held "the version where the halo was further down" -> Back to the version where the sunburst halo's position was further down (0 cm from the area's middle (up); now 4 cm from the area's middle (up)), from 5 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "the cheapest one" -> This version is already the cheapest in this session (price: 39); nothing changed
ok   held "the one with the heavier fabric" -> Back to the version where the fabric was heavier (260 gsm; now 180 gsm), from 2 changes ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)
ok   held "when the text was bigger" -> No earlier version had the "Ave Maria"'s size bigger than now (21 cm wide); nothing changed
ok   held "the one where the price was higher was better" -> Back to the version where the price was higher (55; now 39), from 1 change ago: cream t-shirt; sunburst halo (front, high-density (raised) screen print), "Ave Maria" (back, direct to garment (dtg)) (one undo brings this one back)

dev set: 20 of 20 read right; held-out set: 12 of 12
```
