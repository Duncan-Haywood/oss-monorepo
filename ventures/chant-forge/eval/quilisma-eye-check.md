# Quilisma calls on the fresh pieces, looked at by eye (2026-11-13)

`node eval/shape-check.mjs` lists every head where the reader and the GABC disagree about a
quilisma. For the nine fresh pieces (`shape-fresh-pages.json`, first scanned after the quilisma
rule was fixed) each call was cropped from the 2000 px archive.org page and looked at.

## Version 1 (the rule fixed on the five tuned pieces): 18 calls on GABC non-quilismas

| what the crop shows | calls |
|---|---|
| a real quilisma: the alignment paired it with a neighbouring note of the same pitch | 6 |
| the lower end of a porrectus stroke, cut off as its own head, with white flecks where the stroke meets the head on its stem | 11 |
| two heads stacked a step apart, with a white seam between them | 1 |

Six of the eleven stroke ends had a left neighbour wider than 0.8 staff spaces ending within
0.2 spaces (the rest of the stroke); every real quilisma in all 21 pieces had a neighbour no wider
than 0.56. That became the `afterStroke` rule (version 2). It was chosen after this look, so the
fresh false-call count after it is not a held-out number.

## Version 2 (with `afterStroke`): 12 calls

| what the crop shows | calls | where (leaf:staff:x) |
|---|---|---|
| a real quilisma, paired with a neighbour by the alignment | 6 | 506:3:1415, 516:9:618, 517:5:762, 428:3:786, 428:6:409, 554:4:840 |
| a porrectus stroke's end the stroke rule does not catch (the stroke piece is narrower, or a gap) | 5 | 517:4:1641, 376:2:273, 364:2:616, 553:1:985, 553:1:1305 |
| two stacked heads | 1 | 554:3:1046 |

So the reader's own false calls on the fresh pieces are 6 of 1,849 heads (0.3%), five of them
porrectus ends.

## Quilismas missed on the fresh pieces

| where | GABC | what the crop shows |
|---|---|---|
| 367:3:791 (3425, *lis*) | `i!jwk` | a quilisma under the note above it (stacked), narrow: read as a rhombus, since the rhombus test runs first |
| 506:6:1532 (3433, *ví*) | `iyh!iwjjk` | no teeth visible at this scan's resolution |

22 of the 39 fresh quilismas were not paired by pitch at all (the reader missed the head, or the
alignment placed it elsewhere), against 6 of 9 tuned and 18 of 24 held out.
