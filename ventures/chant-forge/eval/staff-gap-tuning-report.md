# The one-step cephalicus rule, read both ways

Written by `node eval/one-step-check.mjs` (scan reader: `scan.mjs`; the rule is `oneStepCephalicus`,
`ONE_STEP`, off with `readPage(img, { oneStep: false })`). "On-line liquescents" are GABC liquescents
whose small note is d, f, h or j (a staff line); one is "read" when the alignment pairs it with a scan
liquescent at its pitch. "False liquescents" are scan liquescents paired with a GABC note of another shape.
"One-step cephalici" are GABC liquescents whose note before, in the same group, is a punctum one step higher
(gf~, fe~ ...); "head too" counts those read whose head is also paired at its pitch.

| list | pieces | agree (before / after) | differ | GABC only | scan only | on-line liquescents read | other liquescents read | false liquescents | one-step cephalici read (head too) |
|---|---|---|---|---|---|---|---|---|---|
| broken-stroke-fresh-pages.json | 15 | 2874 / 2874 | 1 / 1 | 56 / 56 | 7 / 7 | 20 / 20 of 22 | 12 / 12 of 12 | 0 / 0 | 12 (12) / 12 (12) of 12 |
| clef-change-fresh-pages.json | 14 | 3313 / 3328 | 1 / 1 | 55 / 57 | 8 / 8 | 6 / 6 of 6 | 5 / 5 of 6 | 1 / 1 | 4 (4) / 4 (4) of 5 |
| hook-fresh-pages.json | 15 | 2525 / 2525 | 4 / 4 | 50 / 50 | 13 / 13 | 24 / 24 of 25 | 8 / 8 of 8 | 1 / 1 | 9 (9) / 9 (9) of 9 |
| liquescent-fresh-pages.json | 11 | 1751 / 1752 | 15 / 21 | 56 / 49 | 9 / 11 | 15 / 15 of 17 | 9 / 9 of 10 | 1 / 2 | 11 (11) / 11 (11) of 12 |
| offfinal-supplement-pages.json | 5 | 879 / 879 | 0 / 0 | 63 / 63 | 0 / 0 | 2 / 2 of 2 | 4 / 4 of 4 | 1 / 1 | 1 (1) / 1 (1) of 1 |
| porrectus-liquescent-fresh-pages.json | 6 | 1078 / 1078 | 0 / 0 | 15 / 15 | 1 / 1 | 7 / 7 of 11 | 6 / 6 of 6 | 1 / 1 | 0 (0) / 0 (0) of 0 |
| porrectus-liquescent-pages.json | 6 | 961 / 1027 | 0 / 0 | 20 / 22 | 3 / 3 | 14 / 14 of 14 | 3 / 3 of 3 | 0 / 0 | 3 (3) / 3 (3) of 3 |
| quilisma-fresh-pages.json | 18 | 3457 / 3457 | 37 / 37 | 102 / 102 | 4 / 4 | 11 / 11 of 12 | 11 / 11 of 11 | 2 / 2 | 5 (5) / 5 (5) of 5 |
| rhombus-fresh-pages.json | 6 | 752 / 752 | 1 / 1 | 6 / 6 | 3 / 3 | 5 / 5 of 5 | 4 / 4 of 4 | 2 / 2 | 4 (4) / 4 (4) of 4 |
| scan-pages.json | 13 | 3138 / 3138 | 0 / 0 | 59 / 59 | 2 / 2 | 13 / 13 of 14 | 20 / 20 of 21 | 0 / 0 | 15 (15) / 15 (15) of 16 |
| shape-fresh-pages.json | 9 | 1979 / 1979 | 4 / 4 | 50 / 50 | 5 / 5 | 13 / 13 of 15 | 11 / 11 of 11 | 1 / 1 | 8 (8) / 8 (8) of 9 |
| staff-curl-fresh-pages.json | 10 | 1690 / 1690 | 20 / 20 | 40 / 40 | 34 / 34 | 6 / 6 of 10 | 7 / 7 of 9 | 2 / 2 | 6 (6) / 6 (6) of 8 |
| all | 128 | 24397 / 24479 | 83 / 89 | 572 / 569 | 89 / 91 | 136 / 136 of 153 | 100 / 100 of 105 | 12 / 13 | 78 (78) / 78 (78) of 84 |

## Every scan note the rule moved, added or removed

Scan note → the GABC note the alignment pairs it with (`~` = liquescent).

| list | piece | where | before | after |
|---|---|---|---|---|
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 373 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 449 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 450 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 478 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 496 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 525 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 543 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 571 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 619 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 648 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 665 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 695 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 714 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 742 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 818 | not read | c → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 875 | not read | c → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 894 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 950 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 359, staff 5, x 969 | not read | c → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 740 | j → no GABC note | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 799 | l → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 862 | l → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 938 | l → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 995 | l → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1050 | l → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1051 | 4 → no GABC note | j → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1108 | l → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1185 | k → no GABC note | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1188 | j~ → no GABC note | f~ → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1316 | j → no GABC note | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1411 | l → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1467 | l → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1523 | k → no GABC note | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1618 | k → no GABC note | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1712 | l → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1769 | k → no GABC note | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 1787 | j → no GABC note | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 372 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 428 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 449 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 464 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 494 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 513 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 541 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 598 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 2, x 617 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 372 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 391 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 411 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 438 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 457 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 553 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 572 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 589 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 590 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 646 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 664 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 758 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 759 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 776 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 806 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 825 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 853 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 910 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 355, staff 3, x 929 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 373 | not read | i → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 449 | not read | i → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 450 | not read | j → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 478 | not read | i → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 496 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 525 | not read | i → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 543 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 571 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 619 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 648 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 665 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 695 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 714 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 742 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 818 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 875 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 894 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 950 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3471 (De profundis) | leaf 359, staff 5, x 969 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 385 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 406 | not read | j → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 449 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 451 | not read | j → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 564 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 565 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 639 | not read | j → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 641 | not read | k → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 696 | not read | k → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 763 | not read | l → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 876 | not read | j → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 932 | not read | l → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 962 | not read | m → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 980 | not read | l → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 1009 | not read | l → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3477 (Beatus vir sanctus Martinus) | leaf 581, staff 2, x 1027 | not read | k → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3551 (Electi mei) | leaf 409, staff 4, x 349 | not read | j → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3551 (Electi mei) | leaf 409, staff 4, x 406 | not read | k → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3551 (Electi mei) | leaf 409, staff 4, x 500 | not read | k → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3551 (Electi mei) | leaf 409, staff 4, x 566 | not read | j → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 331 | not read | h → f (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 392 | not read | f → d (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 389 | not read | g → e (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 416 | not read | h → f (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 435 | not read | j → h (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 463 | not read | j → h (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 492 | not read | k → i (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 512 | not read | l → j (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 567 | not read | i → g (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 586 | not read | j → h (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 607 | not read | h → f (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 672 | not read | g → e (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 673 | not read | i → g (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 701 | not read | h → f (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 779, staff 5, x 729 | not read | f → d (jus. `f de/f!hh/ijghf/gxegFD`) |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 392 | not read | f → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 410 | not read | e → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 438 | not read | f → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 456 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 485 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 513 | not read | i → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 514 | not read | j → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 542 | not read | i → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 570 | not read | g → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 598 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 674 | not read | g → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 675 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 692 | not read | j → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 741 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 768 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 817 | not read | f → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 845 | not read | g → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 874 | not read | g → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 719, staff 3, x 893 | not read | f → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 392 | not read | f → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 410 | not read | e → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 438 | not read | f → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 456 | not read | h → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 485 | not read | h → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 513 | not read | i → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 514 | not read | j → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 542 | not read | i → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 570 | not read | g → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 598 | not read | h → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 674 | not read | g → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 675 | not read | h → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 692 | not read | j → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 741 | not read | h → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 768 | not read | h → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 817 | not read | f → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 845 | not read | g → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 874 | not read | g → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 719, staff 3, x 893 | not read | f → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1210 | not read | g → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1266 | not read | g → g (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1378 | not read | j → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1471 | not read | i → i (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1491 | not read | k → h (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1510 | not read | j → h (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1540 | not read | j → g~ (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1544 | not read | i~ → e (con `ef`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1604 | not read | g → f (con `ef`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 984 | i → no GABC note | c → c (tá `dcd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 985 | j → no GABC note | d → d (tá `dcd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1041 | j → no GABC note | d → d (tem. `d`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1156 | 4 → no GABC note | h → h (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1174 | l → no GABC note | f → f (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1200 | 4 → no GABC note | h → h (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1231 | m → no GABC note | g → g (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1259 | k → no GABC note | e → e (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1278 | j → no GABC note | d → d (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1306 | k → no GABC note | e → e (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1335 | k → no GABC note | e → e (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1364 | k → no GABC note | e → e (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1383 | i → no GABC note | c → c (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1411 | j → no GABC note | d → d (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1439 | j → no GABC note | d → d (? `hf/hvGEDeeec/dd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1533 | l → no GABC note | f → f (? `ffdevDCd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1563 | l → no GABC note | f → f (? `ffdevDCd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1582 | j → no GABC note | d → d (? `ffdevDCd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1609 | k → no GABC note | e → e (? `ffdevDCd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1637 | j → no GABC note | d → d (? `ffdevDCd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1656 | i → no GABC note | c → c (? `ffdevDCd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 1685 | j → no GABC note | d → d (? `ffdevDCd`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 304 | not read | h → h (rá `ghGEf`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 332 | not read | g → g (rá `ghGEf`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 360 | not read | e → e (rá `ghGEf`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 388 | not read | f → f (rá `ghGEf`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 445 | not read | e → e (vit `ed`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 463 | not read | d → d (vit `ed`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 615 | not read | d → d (pi `dc`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 634 | not read | c → c (pi `dc`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 690 | not read | e → e (e `ed//egEDew!fvED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 709 | not read | d → d (e `ed//egEDew!fvED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 746 | not read | e → e (e `ed//egEDew!fvED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 747 | not read | g → g (e `ed//egEDew!fvED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 776 | not read | e → e (e `ed//egEDew!fvED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 795 | not read | d → d (e `ed//egEDew!fvED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 826 | not read | e → e (e `ed//egEDew!fvED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 841 | not read | f → f (e `ed//egEDew!fvED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 871 | not read | e → e (e `ed//egEDew!fvED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 1, x 948 | not read | d → d (tá `dcd`) |
| porrectus-liquescent-pages.json | GregoBase 3497 (Afferentur... post eam) | leaf 409, staff 4, x 349 | not read | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3497 (Afferentur... post eam) | leaf 409, staff 4, x 406 | not read | k → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3497 (Afferentur... post eam) | leaf 409, staff 4, x 500 | not read | k → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3497 (Afferentur... post eam) | leaf 409, staff 4, x 566 | not read | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 506 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 582 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 610 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 614 | m~ → no GABC note | k~ → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 667 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 742 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 836 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 894 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 913 | m → no GABC note | k → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 932 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 991 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1026 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1028 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1102 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1178 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1216 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1235 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1238 | k~ → no GABC note | i~ → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1295 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1330 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1331 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1424 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1452 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1459 | j~ → no GABC note | h~ → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1509 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1537 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1594 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1651 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1709 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1726 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1757 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1793 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 1794 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 374 | not read | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3650 (De ventre matris) | leaf 489, staff 2, x 393 | not read | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 740 | h → no GABC note | d → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 799 | j → no GABC note | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 862 | j → no GABC note | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 938 | j → no GABC note | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 995 | j → no GABC note | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1050 | j → no GABC note | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1051 | l → no GABC note | h → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1108 | j → no GABC note | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1185 | i → no GABC note | e → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1188 | h~ → no GABC note | d~ → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1316 | h → no GABC note | d → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1411 | j → no GABC note | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1467 | j → no GABC note | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1523 | i → no GABC note | e → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1618 | i → no GABC note | e → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1712 | j → no GABC note | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1769 | i → no GABC note | e → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 1787 | h → no GABC note | d → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 372 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 428 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 449 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 464 | not read | d → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 494 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 513 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 541 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 598 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 2, x 617 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 372 | not read | d → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 391 | not read | e → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 411 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 438 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 457 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 553 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 572 | not read | d → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 589 | not read | e → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 590 | not read | f → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 646 | not read | d → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 664 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 758 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 759 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 776 | not read | d → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 806 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 825 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 853 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 910 | not read | c → no GABC note |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 355, staff 3, x 929 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 385 | not read | h → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 406 | not read | j → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 449 | not read | h → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 451 | not read | j → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 564 | not read | g → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 565 | not read | h → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 639 | not read | j → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 641 | not read | k → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 696 | not read | k → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 763 | not read | l → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 876 | not read | j → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 932 | not read | l → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 962 | not read | m → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 980 | not read | l → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 1009 | not read | l → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 581, staff 2, x 1027 | not read | k → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1070 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1089 | h → no GABC note | f → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1143 | h → no GABC note | f → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1144 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1202 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1287 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1391 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1457 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1513 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1636 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1693 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 1750 | j → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 344 | not read | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 409 | not read | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 466 | not read | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 561 | not read | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 578 | not read | g → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 635 | not read | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 636 | not read | i → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 692 | not read | i → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 804 | not read | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 805 | not read | i → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 5, x 862 | not read | h → no GABC note |

## One-step cephalici still missed (rule on)

Where: the scan note paired with the head or the nearest paired neighbour. Head: the scan note paired with the GABC head. Read: the scan note paired with the small note.

| list | piece | syllable `group` (want) | where | head read as | small note read as |
|---|---|---|---|---|---|
| clef-change-fresh-pages.json | GregoBase 3524 (Gloriosus Deus) | vir `ghg~` (hg~) | leaf 605, staff 9, x 1762 | nothing | e (rhombus) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | non `gihhg~` (hg~) | leaf 434, staff 3, x 1540 | j (square) | j (square) |
| scan-pages.json | Salve Regina (solemn tone) | con `gf~` (gf~) | leaf 84, staff 4, x 1621 | g (square) | nothing |
| shape-fresh-pages.json | GregoBase 3448 (Diffusa est (All.)) | in `gf~` (gf~) | leaf 376, staff 1, x 726 | g (square) | nothing |
| staff-curl-fresh-pages.json | GregoBase 3550 (Rogate quae ad pacem) | dán `fv//dgfgjv//iiih~` (ih~) | leaf 681, staff 3, x 784 | i (square) | i (square) |
| staff-curl-fresh-pages.json | GregoBase 3741 (Recordare Virgo) | COR `fe~` (fe~) | leaf 627, staff 3, x 562 | f (square) | e (rhombus) |
