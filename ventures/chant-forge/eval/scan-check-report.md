# Corpus against the printed book, read off the scans

Written by `node eval/scan-check.mjs` (scan reader: `scan.mjs`). "Agree" counts
printed notes whose staff position, relative to the clef, matches the GABC note
the alignment pairs them with. "GABC only" are notes the reader did not find on
the page (mostly shapes it cannot read: porrectus strokes, rhombi joined to a
stem, notes on ledger lines); "scan only" are marks it read as notes that the
GABC lacks (flats, the odd custos, specks). Disagreements are listed so each
can be looked at on the scan; the verdicts from looking are in
`scan-check-verdicts.md`.

| piece | book | pages | notes read | agree | differ | GABC only | scan only | agreement |
|---|---|---|---|---|---|---|---|---|
| Dies irae | Graduale Romanum, Vatican 1908 | 83*, 84*, 85*, 86* | 523 | 485 | 23 | 57 | 15 | 85.8% of 565 GABC notes |
| Veni Creator (verse 1) | Graduale Romanum, Vatican 1908 | 121* | 43 | 43 | 0 | 0 | 0 | 100.0% of 43 GABC notes |
| Pange lingua (verse 1) | Graduale Romanum, Vatican 1908 | 123* | 49 | 49 | 0 | 4 | 0 | 92.5% of 53 GABC notes |

## Dies irae

corpus/dies-irae.gabc, 613 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

| syllable | GABC | scan | where |
|---|---|---|---|
| spar | f | h | p. 83* (leaf 874), staff 8, x 199 |
| bit | i | h | p. 83* (leaf 874), staff 9, x 789 |
| tur, | e | d | p. 84* (leaf 875), staff 2, x 921 |
| tur. | e | d | p. 84* (leaf 875), staff 2, x 1592 |
| tet | a | e | p. 84* (leaf 875), staff 3, x 1288 |
| ap | c | f | p. 84* (leaf 875), staff 3, x 1363 |
| pa | d | h | p. 84* (leaf 875), staff 3, x 1421 |
| bit: | c | f | p. 84* (leaf 875), staff 3, x 1525 |
| bit: | d | j | p. 84* (leaf 875), staff 3, x 1619 |
| bit. | e | d | p. 84* (leaf 875), staff 4, x 639 |
| re | i | h | p. 84* (leaf 875), staff 7, x 765 |
| se | i | h | p. 84* (leaf 875), staff 8, x 1493 |
| nis, | e | d | p. 85* (leaf 876), staff 1, x 1543 |
| nis. | e | d | p. 85* (leaf 876), staff 2, x 685 |
| us: | e | d | p. 85* (leaf 876), staff 3, x 657 |
| us. | e | d | p. 85* (leaf 876), staff 3, x 1328 |
| ves | i | h | p. 85* (leaf 876), staff 6, x 1386 |
| tis | i | h | p. 85* (leaf 876), staff 8, x 547 |
| nis: | e | d | p. 86* (leaf 877), staff 1, x 733 |
| nis. | e | d | p. 86* (leaf 877), staff 1, x 1404 |
| cri | - | h | p. 86* (leaf 877), staff 1, x 1655 |
| cri | - | h | p. 86* (leaf 877), staff 3, x 245 |
| cri | - | g | p. 86* (leaf 877), staff 3, x 350 |
| cri | - | h | p. 86* (leaf 877), staff 3, x 425 |
| mó | - | d | p. 86* (leaf 877), staff 3, x 502 |
| mó | - | f | p. 86* (leaf 877), staff 3, x 596 |
| mó | - | e | p. 86* (leaf 877), staff 3, x 653 |
| mó | - | g | p. 86* (leaf 877), staff 3, x 728 |
| mó | - | d | p. 86* (leaf 877), staff 3, x 878 |
| mó | - | f | p. 86* (leaf 877), staff 3, x 881 |
| mó | - | f | p. 86* (leaf 877), staff 3, x 1002 |
| mó | - | e | p. 86* (leaf 877), staff 3, x 1097 |
| mó | i | d | p. 86* (leaf 877), staff 3, x 1153 |
| il | - | g | p. 86* (leaf 877), staff 3, x 1541 |
| get | h | e | p. 86* (leaf 877), staff 4, x 442 |
| ex | - | e | p. 86* (leaf 877), staff 4, x 475 |
| fa | - | e | p. 86* (leaf 877), staff 4, x 833 |
| víl | e | c | p. 86* (leaf 877), staff 4, x 956 |

## Veni Creator (verse 1)

corpus/veni-creator.gabc, 43 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

No disagreement among the notes the reader found.

## Pange lingua (verse 1)

corpus/pange-lingua.gabc, 53 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

No disagreement among the notes the reader found.
