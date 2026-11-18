# The one-step cephalicus rule, read both ways

Written by `node eval/one-step-check.mjs --out eval/one-step-tuning-report.md eval/*pages*.json` (the twelve lists before the held-out one) (scan reader: `scan.mjs`; the rule is `oneStepCephalicus`,
`ONE_STEP`, off with `readPage(img, { oneStep: false })`). "On-line liquescents" are GABC liquescents
whose small note is d, f, h or j (a staff line); one is "read" when the alignment pairs it with a scan
liquescent at its pitch. "False liquescents" are scan liquescents paired with a GABC note of another shape.
"One-step cephalici" are GABC liquescents whose note before, in the same group, is a punctum one step higher
(gf~, fe~ ...); "head too" counts those read whose head is also paired at its pitch.

| list | pieces | agree (before / after) | differ | GABC only | scan only | on-line liquescents read | other liquescents read | false liquescents | one-step cephalici read (head too) |
|---|---|---|---|---|---|---|---|---|---|
| broken-stroke-fresh-pages.json | 15 | 2870 / 2870 | 1 / 1 | 60 / 60 | 7 / 7 | 18 / 18 of 22 | 12 / 12 of 12 | 0 / 0 | 10 (10) / 10 (10) of 12 |
| clef-change-fresh-pages.json | 14 | 3308 / 3308 | 0 / 0 | 61 / 61 | 8 / 8 | 6 / 6 of 6 | 5 / 5 of 6 | 1 / 1 | 4 (4) / 4 (4) of 5 |
| hook-fresh-pages.json | 15 | 2522 / 2524 | 4 / 4 | 53 / 51 | 14 / 13 | 22 / 24 of 25 | 8 / 8 of 8 | 1 / 1 | 7 (7) / 9 (9) of 9 |
| liquescent-fresh-pages.json | 11 | 1748 / 1749 | 15 / 15 | 59 / 58 | 10 / 9 | 15 / 15 of 17 | 8 / 9 of 10 | 1 / 1 | 10 (10) / 11 (11) of 12 |
| offfinal-supplement-pages.json | 5 | 878 / 878 | 0 / 0 | 64 / 64 | 0 / 0 | 2 / 2 of 2 | 4 / 4 of 4 | 1 / 1 | 1 (1) / 1 (1) of 1 |
| porrectus-liquescent-fresh-pages.json | 6 | 1076 / 1076 | 0 / 0 | 17 / 17 | 1 / 1 | 7 / 7 of 11 | 6 / 6 of 6 | 1 / 1 | 0 (0) / 0 (0) of 0 |
| porrectus-liquescent-pages.json | 6 | 959 / 959 | 0 / 0 | 22 / 22 | 3 / 3 | 14 / 14 of 14 | 3 / 3 of 3 | 0 / 0 | 3 (3) / 3 (3) of 3 |
| quilisma-fresh-pages.json | 18 | 3449 / 3450 | 37 / 37 | 110 / 109 | 5 / 4 | 10 / 10 of 12 | 10 / 11 of 11 | 2 / 2 | 3 (3) / 4 (4) of 5 |
| rhombus-fresh-pages.json | 6 | 751 / 751 | 1 / 1 | 7 / 7 | 3 / 3 | 4 / 4 of 5 | 4 / 4 of 4 | 3 / 3 | 3 (3) / 3 (3) of 4 |
| scan-pages.json | 13 | 3133 / 3134 | 0 / 0 | 64 / 63 | 3 / 2 | 13 / 13 of 14 | 19 / 20 of 21 | 0 / 0 | 14 (14) / 15 (15) of 16 |
| shape-fresh-pages.json | 9 | 1976 / 1976 | 4 / 4 | 53 / 53 | 5 / 5 | 13 / 13 of 15 | 11 / 11 of 11 | 1 / 1 | 8 (8) / 8 (8) of 9 |
| staff-curl-fresh-pages.json | 10 | 1689 / 1689 | 20 / 20 | 41 / 41 | 33 / 33 | 6 / 6 of 10 | 7 / 7 of 9 | 2 / 2 | 6 (6) / 6 (6) of 8 |
| all | 128 | 24359 / 24364 | 82 / 82 | 611 / 606 | 92 / 88 | 130 / 132 of 153 | 97 / 100 of 105 | 13 / 13 | 69 (69) / 74 (74) of 84 |

## Every scan note the rule moved, added or removed

Scan note → the GABC note the alignment pairs it with (`~` = liquescent).

| list | piece | where | before | after |
|---|---|---|---|---|
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 354, staff 8, x 157 | i → no GABC note | not read |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 354, staff 8, x 158 | not read | i~ → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3461 (Quemadmodum) | leaf 471, staff 7, x 1524 | g → no GABC note | not read |
| clef-change-fresh-pages.json | GregoBase 3461 (Quemadmodum) | leaf 471, staff 7, x 1524 | not read | g~ → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 777, staff 6, x 1768 | f → no GABC note | not read |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 778, staff 5, x 264 | g → no GABC note | not read |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 777, staff 6, x 1768 | not read | f~ → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 778, staff 5, x 263 | not read | g~ → no GABC note |
| hook-fresh-pages.json | GregoBase 3463 (Cibavit sine Alleluia) | leaf 659, staff 8, x 1582 | i → no GABC note | not read |
| hook-fresh-pages.json | GregoBase 3463 (Cibavit sine Alleluia) | leaf 659, staff 8, x 1582 | not read | i~ → no GABC note |
| hook-fresh-pages.json | GregoBase 3490 (Ecce Virgo) | leaf 773, staff 1, x 1544 | f → f~ (con `gf~`) | not read |
| hook-fresh-pages.json | GregoBase 3490 (Ecce Virgo) | leaf 773, staff 1, x 1545 | not read | f~ → f~ (con `gf~`) |
| hook-fresh-pages.json | GregoBase 3499 (Egredimini et videte filiae Sion (Intr.)) | leaf 727, staff 6, x 1687 | g → no GABC note | not read |
| hook-fresh-pages.json | GregoBase 3499 (Egredimini et videte filiae Sion (Intr.)) | leaf 727, staff 6, x 1686 | not read | g~ → no GABC note |
| hook-fresh-pages.json | GregoBase 3508 (Omnes gentes (Comm.)) | leaf 382, staff 9, x 1418 | not read | f~ → f~ (et `gf~`) |
| hook-fresh-pages.json | GregoBase 3512 (Salus autem) | leaf 612, staff 9, x 307 | not read | e~ → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3428 (Erit quasi signum) | leaf 785, staff 7, x 1045 | i → i~ (e `ji~`) | not read |
| liquescent-fresh-pages.json | GregoBase 3428 (Erit quasi signum) | leaf 785, staff 7, x 1045 | not read | i~ → i~ (e `ji~`) |
| quilisma-fresh-pages.json | GregoBase 3400 (Factus est opprobrium) | leaf 727, staff 6, x 1687 | g → g~ (in `hg~`) | not read |
| quilisma-fresh-pages.json | GregoBase 3400 (Factus est opprobrium) | leaf 727, staff 6, x 1686 | not read | g~ → g~ (in `hg~`) |
| quilisma-fresh-pages.json | GregoBase 3405 (Adjuvabit eam) | leaf 633, staff 9, x 419 | c → no GABC note | not read |
| quilisma-fresh-pages.json | GregoBase 3405 (Adjuvabit eam) | leaf 633, staff 9, x 419 | not read | c~ → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3416 (Statuit) | leaf 588, staff 10, x 709 | g → no GABC note | not read |
| quilisma-fresh-pages.json | GregoBase 3416 (Statuit) | leaf 588, staff 10, x 709 | not read | g~ → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3459 (Emitte Spiritum) | leaf 659, staff 8, x 1582 | i → no GABC note | not read |
| quilisma-fresh-pages.json | GregoBase 3459 (Emitte Spiritum) | leaf 659, staff 8, x 1582 | not read | i~ → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3446 (Benedicta) | leaf 773, staff 1, x 1544 | d → no GABC note | not read |
| rhombus-fresh-pages.json | GregoBase 3446 (Benedicta) | leaf 773, staff 1, x 1545 | not read | d~ → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3449 (Quod dico vobis) | leaf 612, staff 9, x 307 | not read | e~ → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 354, staff 8, x 157 | g → g~ (car `hhg~`) | not read |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 354, staff 8, x 158 | not read | g~ → g~ (car `hhg~`) |
| scan-pages.json | GregoBase 3403 (off-final ending) | leaf 513, staff 2, x 1455 | c → no GABC note | not read |
| scan-pages.json | GregoBase 3403 (off-final ending) | leaf 513, staff 2, x 1456 | not read | c~ → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3483 (Anima...sicut passer) | leaf 607, staff 3, x 1670 | e → no GABC note | not read |
| staff-curl-fresh-pages.json | GregoBase 3483 (Anima...sicut passer) | leaf 607, staff 3, x 1671 | not read | e~ → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3718 (Sapientiam sanctorum) | leaf 607, staff 3, x 1670 | g → no GABC note | not read |
| staff-curl-fresh-pages.json | GregoBase 3718 (Sapientiam sanctorum) | leaf 607, staff 3, x 1671 | not read | g~ → no GABC note |
