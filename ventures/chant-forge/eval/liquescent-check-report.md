# Liquescents: the scan reader against the GABC (2026-11-14)

Figures from `node eval/shape-check.mjs` (full table: `shape-check-report.md`); the detector is
`liquescentTail` in `scan.mjs`.

## What a liquescent looks like in the 1908 Vatican type

A small note joined to the head before it by a short, thick stem at the head's right edge.
The epiphonus (GABC `gh~`) is a head with a concave top and a stem rising to a small head one
or more steps higher; the cephalicus (`fe~`) is a head with a hook hanging below its right
edge, ending one or more steps lower. The small note is under the reader's minimum head
height (0.4 staff spaces), so before this change the reader never found it: 2 of 60 GABC
liquescents on the 21 scanned pieces were paired, both by accident.

## The rule

From the head's centre, follow the ink up and down in its right-hand columns, bridging gaps
of up to 0.2 spaces (breaks in the print, staff lines). A liquescent tail runs 0.6 to 2.4
spaces from the centre, has no other head at its end (that would be a podatus or clivis), is
0.1 spaces or more thick on average past the head's edge (a virga's stem is thinner), and its
last 0.3 spaces are 0.2 to 0.4 spaces wide at the median row (a small head or hook; a full
head is wider). The small note's pitch is the staff position 0.25 spaces in from the tail's
end. The note is read straight after its head.

## How the thresholds were chosen

On the 21 pieces of `scan-pages.json` and `shape-fresh-pages.json` (tuned, held out and fresh
for the earlier rules), measured on every head paired by pitch with the GABC, labelled by
whether the next GABC note in the same neume is a liquescent. Four variants were compared
(gap 0.08 or 0.2 spaces, line pixels kept or dropped, maximum or median end width, wide or
narrow neighbour test); the one kept found 51 of 57 labelled liquescents at the right pitch
and gave a tail to 2 of 4,524 other heads. These pieces are therefore not a held-out test for
liquescents.

## Held-out test

Eleven GregoBase 1908 pieces in `liquescent-fresh-pages.json`, listed (every unused piece in
`corpus/gregobase-1908/` with a liquescent and an arabic page number, and every unused one
with three or more and a bracketed page number) after the rule was frozen and before any of
their pages was downloaded. Nothing was changed after the run.

| set | GABC liquescents in the aligned span | read as liquescent at their pitch | other heads called liquescent | added liquescent notes with no GABC note at their pitch |
|---|---|---|---|---|
| tuned on (5 corpus pieces) | 9 | 8 | 0 of 1,544 | 0 |
| held out for rhombi (7 pieces) | 25 | 23 | 1 of 1,172 | 0 |
| fresh for quilismas (9 pieces) | 26 | 23 | 1 of 1,868 | 0 |
| **liquescent fresh (11 pieces, held out)** | **26** | **20 (77%)** | **1 of 1,622** | **1** |

On the held-out pieces, 5 of the 6 misses are not paired by pitch at all and one is paired
but read as a rhombus. The two false calls on them, looked at on the scan: a rhombus whose
lower point reaches the staff line below it (*Erit quasi signum*, p. [200], staff 5; the
reader added a note there, which pairs with nothing), and a square just right of a clivis's
stem (*Assumpta est*, leaf 544, staff 5; cause not pinned down). The two on the tuning pieces
are a virga with a descending stem (GregoBase 3407) and the head on the stem at the end of a
porrectus (GregoBase 3408).

The same eleven pieces are also a clean held-out test for the earlier shape rules, which were
not touched: rhombi 180 of 182 read as rhombi, 5 of 1,428 squares called rhombi; quilismas 10
of 12 paired read as quilismas, 17 of 1,631 other heads called quilismas, more than the
earlier sets gave (12 of 1,849 at most), not looked at yet.

## Effect on the note check (`scan-check.mjs`)

With the small notes read, more of each piece is checked against the book and no new
disagreement appears: Te Deum 633 of 634 notes agree (was 630 of 631 read), Salve Regina 219
(was 214), the seven off-final GregoBase pieces 1,196 agreeing notes in all (was 1,171); notes
the reader saw that the GABC lacks stay at 0 or 1 per piece, as before. A planted one-step
error is still caught 192-200 times in 200.

## Not done

- A liquescent that the GABC writes and the scan prints is now checked for pitch; its kind
  (epiphonus or cephalicus) is not told apart from the direction, and `<` and `>` (augmentive
  and diminutive) are not distinguished.
- Liquescents not at a head's right edge (a liquescent at the end of a porrectus or a torculus
  whose last head is a porrectus end) are not looked for.
- Only Vatican-edition printing has been tried.
