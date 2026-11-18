# The one-step cephalicus rule, read both ways

Written by `node eval/one-step-check.mjs --before gap --out eval/one-step-hollow-tuning-report.md <the twelve tuning lists>` (before = the rule without the hollow-note bridge, `oneStepGap: false`) (scan reader: `scan.mjs`; the rule is `oneStepCephalicus`,
`ONE_STEP`, off with `readPage(img, { oneStep: false })`). "On-line liquescents" are GABC liquescents
whose small note is d, f, h or j (a staff line); one is "read" when the alignment pairs it with a scan
liquescent at its pitch. "False liquescents" are scan liquescents paired with a GABC note of another shape.
"One-step cephalici" are GABC liquescents whose note before, in the same group, is a punctum one step higher
(gf~, fe~ ...); "head too" counts those read whose head is also paired at its pitch.

| list | pieces | agree (before / after) | differ | GABC only | scan only | on-line liquescents read | other liquescents read | false liquescents | one-step cephalici read (head too) |
|---|---|---|---|---|---|---|---|---|---|
| broken-stroke-fresh-pages.json | 15 | 2870 / 2872 | 1 / 1 | 60 / 58 | 7 / 7 | 18 / 20 of 22 | 12 / 12 of 12 | 0 / 0 | 10 (10) / 12 (12) of 12 |
| clef-change-fresh-pages.json | 14 | 3308 / 3308 | 0 / 0 | 61 / 61 | 8 / 8 | 6 / 6 of 6 | 5 / 5 of 6 | 1 / 1 | 4 (4) / 4 (4) of 5 |
| hook-fresh-pages.json | 15 | 2524 / 2524 | 4 / 4 | 51 / 51 | 13 / 13 | 24 / 24 of 25 | 8 / 8 of 8 | 1 / 1 | 9 (9) / 9 (9) of 9 |
| liquescent-fresh-pages.json | 11 | 1749 / 1749 | 15 / 15 | 58 / 58 | 9 / 9 | 15 / 15 of 17 | 9 / 9 of 10 | 1 / 1 | 11 (11) / 11 (11) of 12 |
| offfinal-supplement-pages.json | 5 | 878 / 878 | 0 / 0 | 64 / 64 | 0 / 0 | 2 / 2 of 2 | 4 / 4 of 4 | 1 / 1 | 1 (1) / 1 (1) of 1 |
| porrectus-liquescent-fresh-pages.json | 6 | 1076 / 1076 | 0 / 0 | 17 / 17 | 1 / 1 | 7 / 7 of 11 | 6 / 6 of 6 | 1 / 1 | 0 (0) / 0 (0) of 0 |
| porrectus-liquescent-pages.json | 6 | 959 / 959 | 0 / 0 | 22 / 22 | 3 / 3 | 14 / 14 of 14 | 3 / 3 of 3 | 0 / 0 | 3 (3) / 3 (3) of 3 |
| quilisma-fresh-pages.json | 18 | 3450 / 3451 | 37 / 37 | 109 / 108 | 4 / 4 | 10 / 11 of 12 | 11 / 11 of 11 | 2 / 2 | 4 (4) / 5 (5) of 5 |
| rhombus-fresh-pages.json | 6 | 751 / 751 | 1 / 1 | 7 / 7 | 3 / 3 | 4 / 4 of 5 | 4 / 4 of 4 | 3 / 3 | 3 (3) / 3 (3) of 4 |
| scan-pages.json | 13 | 3134 / 3134 | 0 / 0 | 63 / 63 | 2 / 2 | 13 / 13 of 14 | 20 / 20 of 21 | 0 / 0 | 15 (15) / 15 (15) of 16 |
| shape-fresh-pages.json | 9 | 1976 / 1976 | 4 / 4 | 53 / 53 | 5 / 5 | 13 / 13 of 15 | 11 / 11 of 11 | 1 / 1 | 8 (8) / 8 (8) of 9 |
| staff-curl-fresh-pages.json | 10 | 1689 / 1689 | 20 / 20 | 41 / 41 | 33 / 33 | 6 / 6 of 10 | 7 / 7 of 9 | 2 / 2 | 6 (6) / 6 (6) of 8 |
| all | 128 | 24364 / 24367 | 82 / 82 | 606 / 603 | 88 / 88 | 132 / 135 of 153 | 100 / 100 of 105 | 13 / 13 | 74 (74) / 77 (77) of 84 |

## Every scan note the rule moved, added or removed

Scan note → the GABC note the alignment pairs it with (`~` = liquescent).

| list | piece | where | before | after |
|---|---|---|---|---|
| broken-stroke-fresh-pages.json | GregoBase 3473 (Os justi) | leaf 618, staff 10, x 908 | not read | d~ → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3478 (Benedicite Dominum) | leaf 560, staff 1, x 1320 | not read | j~ → j~ (e `kj~`) |
| broken-stroke-fresh-pages.json | GregoBase 3481 (Juravit Dominus) | leaf 618, staff 10, x 908 | not read | d~ → d~ (cér `egFEed~`) |
| hook-fresh-pages.json | GregoBase 3484 (Quia fecisti) | leaf 757, staff 4, x 1043 | not read | j~ → no GABC note |
| hook-fresh-pages.json | GregoBase 3505 (Tota formosa) | leaf 757, staff 4, x 1043 | not read | j~ → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3443 (Dominus dabit) | leaf 757, staff 4, x 1043 | not read | j~ → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3405 (Adjuvabit eam) | leaf 635, staff 2, x 1745 | not read | h~ → h~ (vul `fd/ef!gwh/ih~`) |
| quilisma-fresh-pages.json | GregoBase 3413 (Haec est Virgo sapiens et una) | leaf 635, staff 2, x 1745 | not read | j~ → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3430 (In medio Ecclesiae) | leaf 618, staff 10, x 908 | not read | d~ → no GABC note |

## One-step cephalici still missed (rule on)

Where: the scan note paired with the head or the nearest paired neighbour. Head: the scan note paired with the GABC head. Read: the scan note paired with the small note.

| list | piece | syllable `group` (want) | where | head read as | small note read as |
|---|---|---|---|---|---|
| clef-change-fresh-pages.json | GregoBase 3524 (Gloriosus Deus) | vir `ghg~` (hg~) | leaf 605, staff 9, x 1762 | nothing | e (rhombus) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | non `gihhg~` (hg~) | leaf 434, staff 3, x 1190 | h (rhombus) | nothing |
| rhombus-fresh-pages.json | GregoBase 3439 (Qui sequitur me) | tér `gf~` (gf~) | leaf 598, staff 2, x 1163 | g (square) | nothing |
| scan-pages.json | Salve Regina (solemn tone) | con `gf~` (gf~) | leaf 84, staff 4, x 1621 | g (square) | nothing |
| shape-fresh-pages.json | GregoBase 3448 (Diffusa est (All.)) | in `gf~` (gf~) | leaf 376, staff 1, x 726 | g (square) | nothing |
| staff-curl-fresh-pages.json | GregoBase 3550 (Rogate quae ad pacem) | dán `fv//dgfgjv//iiih~` (ih~) | leaf 681, staff 3, x 784 | i (square) | i (square) |
| staff-curl-fresh-pages.json | GregoBase 3741 (Recordare Virgo) | COR `fe~` (fe~) | leaf 627, staff 3, x 562 | f (square) | e (rhombus) |
