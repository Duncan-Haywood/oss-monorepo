# The one-step cephalicus rule, read both ways

Written by `node eval/one-step-check.mjs --before fleck --out eval/fleck-tuning-report.md <the twelve tuning lists>` (before = the reader without the split-head join, `fleck: false`) (scan reader: `scan.mjs`; the rule is `oneStepCephalicus`,
`ONE_STEP`, off with `readPage(img, { oneStep: false })`). "On-line liquescents" are GABC liquescents
whose small note is d, f, h or j (a staff line); one is "read" when the alignment pairs it with a scan
liquescent at its pitch. "False liquescents" are scan liquescents paired with a GABC note of another shape.
"One-step cephalici" are GABC liquescents whose note before, in the same group, is a punctum one step higher
(gf~, fe~ ...); "head too" counts those read whose head is also paired at its pitch.

| list | pieces | agree (before / after) | differ | GABC only | scan only | on-line liquescents read | other liquescents read | false liquescents | one-step cephalici read (head too) |
|---|---|---|---|---|---|---|---|---|---|
| broken-stroke-fresh-pages.json | 15 | 2872 / 2874 | 1 / 1 | 58 / 56 | 7 / 7 | 20 / 20 of 22 | 12 / 12 of 12 | 0 / 0 | 12 (12) / 12 (12) of 12 |
| clef-change-fresh-pages.json | 14 | 3308 / 3313 | 0 / 1 | 61 / 55 | 8 / 8 | 6 / 6 of 6 | 5 / 5 of 6 | 1 / 1 | 4 (4) / 4 (4) of 5 |
| hook-fresh-pages.json | 15 | 2524 / 2525 | 4 / 4 | 51 / 50 | 13 / 13 | 24 / 24 of 25 | 8 / 8 of 8 | 1 / 1 | 9 (9) / 9 (9) of 9 |
| liquescent-fresh-pages.json | 11 | 1749 / 1751 | 15 / 15 | 58 / 56 | 9 / 9 | 15 / 15 of 17 | 9 / 9 of 10 | 1 / 1 | 11 (11) / 11 (11) of 12 |
| offfinal-supplement-pages.json | 5 | 878 / 879 | 0 / 0 | 64 / 63 | 0 / 0 | 2 / 2 of 2 | 4 / 4 of 4 | 1 / 1 | 1 (1) / 1 (1) of 1 |
| porrectus-liquescent-fresh-pages.json | 6 | 1076 / 1078 | 0 / 0 | 17 / 15 | 1 / 1 | 7 / 7 of 11 | 6 / 6 of 6 | 1 / 1 | 0 (0) / 0 (0) of 0 |
| porrectus-liquescent-pages.json | 6 | 959 / 961 | 0 / 0 | 22 / 20 | 3 / 3 | 14 / 14 of 14 | 3 / 3 of 3 | 0 / 0 | 3 (3) / 3 (3) of 3 |
| quilisma-fresh-pages.json | 18 | 3451 / 3457 | 37 / 37 | 108 / 102 | 4 / 4 | 11 / 11 of 12 | 11 / 11 of 11 | 2 / 2 | 5 (5) / 5 (5) of 5 |
| rhombus-fresh-pages.json | 6 | 751 / 752 | 1 / 1 | 7 / 6 | 3 / 3 | 4 / 5 of 5 | 4 / 4 of 4 | 3 / 2 | 3 (3) / 4 (4) of 4 |
| scan-pages.json | 13 | 3134 / 3138 | 0 / 0 | 63 / 59 | 2 / 2 | 13 / 13 of 14 | 20 / 20 of 21 | 0 / 0 | 15 (15) / 15 (15) of 16 |
| shape-fresh-pages.json | 9 | 1976 / 1979 | 4 / 4 | 53 / 50 | 5 / 5 | 13 / 13 of 15 | 11 / 11 of 11 | 1 / 1 | 8 (8) / 8 (8) of 9 |
| staff-curl-fresh-pages.json | 10 | 1689 / 1690 | 20 / 20 | 41 / 40 | 33 / 34 | 6 / 6 of 10 | 7 / 7 of 9 | 2 / 2 | 6 (6) / 6 (6) of 8 |
| all | 128 | 24367 / 24397 | 82 / 83 | 603 / 572 | 88 / 89 | 135 / 136 of 153 | 100 / 100 of 105 | 13 / 12 | 77 (77) / 78 (78) of 84 |

## Every scan note the rule moved, added or removed

Scan note → the GABC note the alignment pairs it with (`~` = liquescent).

| list | piece | where | before | after |
|---|---|---|---|---|
| broken-stroke-fresh-pages.json | GregoBase 3464 (Intret in conspectu) | leaf 602, staff 8, x 1410 | not read | g → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3464 (Intret in conspectu) | leaf 603, staff 9, x 814 | not read | f → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3464 (Intret in conspectu) | leaf 604, staff 2, x 1272 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3465 (Nimis honorati sunt (All.)) | leaf 572, staff 1, x 385 | not read | d → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3468 (Liberasti nos) | leaf 357, staff 3, x 1161 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3469 (Si iniquitates (Intr)) | leaf 357, staff 3, x 1161 | not read | i → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3470 (Surge Domine) | leaf 676, staff 7, x 1131 | g → no GABC note | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3470 (Surge Domine) | leaf 676, staff 4, x 945 | not read | j → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3470 (Surge Domine) | leaf 678, staff 5, x 1172 | not read | h → h (sanc `gh`) |
| broken-stroke-fresh-pages.json | GregoBase 3470 (Surge Domine) | leaf 678, staff 9, x 1411 | not read | i → i (Chri `fh!iwj!kv`) |
| broken-stroke-fresh-pages.json | GregoBase 3472 (Candor est) | leaf 534, staff 2, x 1378 | not read | e → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3473 (Os justi) | leaf 620, staff 10, x 202 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3473 (Os justi) | leaf 620, staff 10, x 713 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3474 (Sancte Michael) | leaf 563, staff 2, x 1184 | not read | h → no GABC note |
| broken-stroke-fresh-pages.json | GregoBase 3474 (Sancte Michael) | leaf 563, staff 4, x 1566 | not read | f → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3461 (Quemadmodum) | leaf 472, staff 5, x 1490 | not read | i → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3506 (Suscepimus Deus) | leaf 402, staff 7, x 884 | not read | i → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3506 (Suscepimus Deus) | leaf 404, staff 8, x 595 | not read | j → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3506 (Suscepimus Deus) | leaf 405, staff 4, x 1397 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3522 (Gloria et honore) | leaf 590, staff 4, x 308 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3522 (Gloria et honore) | leaf 590, staff 6, x 815 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3522 (Gloria et honore) | leaf 591, staff 7, x 1485 | not read | h → h (um. `g/hiGF/iyhgh/fh/ji/jh,ixiv//hig//ih/ivGFg`) |
| clef-change-fresh-pages.json | GregoBase 3522 (Gloria et honore) | leaf 592, staff 3, x 1582 | not read | l → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3524 (Gloriosus Deus) | leaf 603, staff 9, x 814 | not read | d → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3524 (Gloriosus Deus) | leaf 604, staff 2, x 1272 | not read | c → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3566 (Angelus Domini Raphael (Grad.)) | leaf 780, staff 5, x 756 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3567 (Dabo te) | leaf 722, staff 4, x 989 | not read | j → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3567 (Dabo te) | leaf 722, staff 4, x 1008 | not read | l → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3567 (Dabo te) | leaf 722, staff 6, x 990 | not read | f → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3567 (Dabo te) | leaf 723, staff 6, x 1473 | not read | g → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3567 (Dabo te) | leaf 724, staff 6, x 1152 | not read | j → j (có `ji/k!lwmk`) |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 373, staff 4, x 1429 | k~ → no GABC note | not read |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 374, staff 9, x 1183 | g → no GABC note | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 372, staff 4, x 1403 | not read | j → j (óm `ixi!jwk`) |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 372, staff 5, x 389 | not read | i → i (ri `ih`) |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 372, staff 7, x 212 | not read | l → j (tí `hi!jwk`) |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 372, staff 8, x 245 | not read | f → f (pu `ef`) |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 372, staff 9, x 1436 | not read | f → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 373, staff 4, x 1426 | not read | k → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 374, staff 1, x 1106 | not read | i → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 374, staff 2, x 1388 | not read | m → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3619 (Benedicta es tu (Grad.)) | leaf 374, staff 4, x 1521 | not read | g → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 721, staff 9, x 779 | not read | g → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 722, staff 4, x 989 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 722, staff 4, x 1008 | not read | j → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3679 (Repleta est) | leaf 722, staff 6, x 990 | not read | d → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3706 (Propter fratres meos) | leaf 763, staff 1, x 794 | not read | h → no GABC note |
| clef-change-fresh-pages.json | GregoBase 3775 (Domine spes mea) | leaf 485, staff 8, x 1196 | not read | g → no GABC note |
| hook-fresh-pages.json | GregoBase 3484 (Quia fecisti) | leaf 755, staff 8, x 664 | not read | i → no GABC note |
| hook-fresh-pages.json | GregoBase 3490 (Ecce Virgo) | leaf 772, staff 2, x 420 | not read | e → no GABC note |
| hook-fresh-pages.json | GregoBase 3490 (Ecce Virgo) | leaf 773, staff 5, x 634 | not read | i → no GABC note |
| hook-fresh-pages.json | GregoBase 3492 (Vidi civitatem) | leaf 714, staff 1, x 1232 | not read | f → no GABC note |
| hook-fresh-pages.json | GregoBase 3498 (Vultum tuum) | leaf 642, staff 3, x 1610 | not read | j → no GABC note |
| hook-fresh-pages.json | GregoBase 3498 (Vultum tuum) | leaf 642, staff 8, x 347 | not read | f → f (mae `egef`) |
| hook-fresh-pages.json | GregoBase 3499 (Egredimini et videte filiae Sion (Intr.)) | leaf 726, staff 7, x 470 | a~ → no GABC note | not read |
| hook-fresh-pages.json | GregoBase 3499 (Egredimini et videte filiae Sion (Intr.)) | leaf 726, staff 7, x 466 | not read | a → no GABC note |
| hook-fresh-pages.json | GregoBase 3499 (Egredimini et videte filiae Sion (Intr.)) | leaf 726, staff 7, x 1598 | not read | b → no GABC note |
| hook-fresh-pages.json | GregoBase 3502 (Miseratio) | leaf 570, staff 8, x 252 | i → no GABC note | j → no GABC note |
| hook-fresh-pages.json | GregoBase 3502 (Miseratio) | leaf 570, staff 7, x 338 | not read | j → no GABC note |
| hook-fresh-pages.json | GregoBase 3502 (Miseratio) | leaf 571, staff 3, x 372 | not read | i → no GABC note |
| hook-fresh-pages.json | GregoBase 3502 (Miseratio) | leaf 571, staff 4, x 1092 | not read | e → no GABC note |
| hook-fresh-pages.json | GregoBase 3505 (Tota formosa) | leaf 759, staff 1, x 636 | not read | e → no GABC note |
| hook-fresh-pages.json | GregoBase 3505 (Tota formosa) | leaf 760, staff 4, x 659 | not read | f → no GABC note |
| hook-fresh-pages.json | GregoBase 3508 (Omnes gentes (Comm.)) | leaf 384, staff 6, x 604 | not read | j → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 718, staff 2, x 412 | a → no GABC note | b → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 718, staff 3, x 126 | not read | b → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 718, staff 3, x 134 | not read | f~ → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 718, staff 3, x 745 | not read | f → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 718, staff 6, x 570 | not read | e → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 718, staff 8, x 511 | not read | e → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 718, staff 9, x 918 | not read | i → no GABC note |
| hook-fresh-pages.json | GregoBase 3509 (Cor meum) | leaf 721, staff 9, x 779 | not read | g → no GABC note |
| hook-fresh-pages.json | GregoBase 3510 (Venite audite) | leaf 367, staff 4, x 1229 | not read | l → no GABC note |
| hook-fresh-pages.json | GregoBase 3510 (Venite audite) | leaf 369, staff 4, x 804 | not read | h → no GABC note |
| hook-fresh-pages.json | GregoBase 3512 (Salus autem) | leaf 610, staff 9, x 1385 | not read | h → no GABC note |
| hook-fresh-pages.json | GregoBase 3512 (Salus autem) | leaf 612, staff 5, x 1139 | not read | i → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 427, staff 7, x 1124 | not read | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 436, staff 8, x 851 | not read | f → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 436, staff 9, x 1000 | not read | a → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3447 (Assumpta est) | leaf 544, staff 2, x 420 | not read | i → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3447 (Assumpta est) | leaf 544, staff 4, x 1607 | not read | j → j (lau `hj`) |
| liquescent-fresh-pages.json | GregoBase 3447 (Assumpta est) | leaf 544, staff 7, x 597 | not read | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3447 (Assumpta est) | leaf 544, staff 7, x 1003 | not read | j → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3460 (Frumentum) | leaf 398, staff 7, x 268 | not read | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3460 (Frumentum) | leaf 400, staff 9, x 765 | not read | f → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3417 (Audi filia et vide (Tract.)) | leaf 639, staff 4, x 1486 | not read | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | leaf 743, staff 4, x 1419 | not read | f → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3428 (Erit quasi signum) | leaf 784, staff 8, x 1552 | e → no GABC note | f → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3428 (Erit quasi signum) | leaf 783, staff 7, x 548 | not read | f → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3428 (Erit quasi signum) | leaf 783, staff 9, x 357 | not read | f → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3428 (Erit quasi signum) | leaf 784, staff 1, x 864 | not read | a → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3428 (Erit quasi signum) | leaf 786, staff 2, x 1160 | not read | e → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3428 (Erit quasi signum) | leaf 786, staff 9, x 504 | not read | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3435 (Ave Maria (Alleluia)) | leaf 670, staff 3, x 387 | j → no GABC note | k → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3435 (Ave Maria (Alleluia)) | leaf 670, staff 4, x 880 | not read | g → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3435 (Ave Maria (Alleluia)) | leaf 670, staff 7, x 376 | not read | g → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3443 (Dominus dabit) | leaf 759, staff 1, x 636 | not read | e → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3458 (Corona aurea) | leaf 730, staff 8, x 1001 | not read | e → e (tú `egECd//egEDew!fvEDd`) |
| offfinal-supplement-pages.json | GregoBase 3402 (off-final ending, p. [167]) | leaf 752, staff 2, x 1459 | not read | j → j (in `h!iwj/kjj`) |
| offfinal-supplement-pages.json | GregoBase 3419 (off-final ending, Gaudeamus pp. 486-487) | leaf 512, staff 7, x 1111 | not read | d → no GABC note |
| offfinal-supplement-pages.json | GregoBase 3427 (off-final ending, p. [161]) | leaf 744, staff 2, x 485 | not read | f → no GABC note |
| offfinal-supplement-pages.json | GregoBase 3427 (off-final ending, p. [161]) | leaf 746, staff 1, x 307 | not read | f → no GABC note |
| offfinal-supplement-pages.json | GregoBase 3451 (off-final ending, p. [161]) | leaf 744, staff 2, x 485 | not read | f → no GABC note |
| offfinal-supplement-pages.json | GregoBase 3451 (off-final ending, p. [161]) | leaf 746, staff 1, x 307 | not read | f → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3727 (Venite post me) | leaf 365, staff 1, x 348 | e → no GABC note | f → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3727 (Venite post me) | leaf 365, staff 2, x 714 | not read | f → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3727 (Venite post me) | leaf 367, staff 4, x 1229 | not read | l → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3831 (Mihi autem nimis (Off.)) | leaf 365, staff 1, x 348 | e → no GABC note | f → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3831 (Mihi autem nimis (Off.)) | leaf 365, staff 2, x 714 | not read | f → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3831 (Mihi autem nimis (Off.)) | leaf 367, staff 4, x 1229 | not read | l → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3905 (Amen dico vobis quidquid) | leaf 362, staff 9, x 678 | not read | 6 → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3912 (Hic est qui venit) | leaf 499, staff 7, x 1267 | not read | h → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3912 (Hic est qui venit) | leaf 499, staff 9, x 1425 | not read | h → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3948 (Beata es Virgo) | leaf 672, staff 5, x 1288 | not read | g → g (lú `ghg`) |
| porrectus-liquescent-fresh-pages.json | GregoBase 3948 (Beata es Virgo) | leaf 673, staff 8, x 1290 | not read | h → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3949 (Stetit Angelus (Off)) | leaf 563, staff 2, x 1184 | not read | h → no GABC note |
| porrectus-liquescent-fresh-pages.json | GregoBase 3949 (Stetit Angelus (Off)) | leaf 563, staff 4, x 1566 | not read | f → f (áu `c!df/ef!gvEDfv//efd/ed`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 5, x 301 | g → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 526, staff 9, x 1186 | not read | f → f (tó `efED`) |
| porrectus-liquescent-pages.json | GregoBase 3462 (Ipse est directus) | leaf 527, staff 6, x 301 | not read | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3486 (Adducentur) | leaf 632, staff 8, x 514 | not read | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3486 (Adducentur) | leaf 632, staff 8, x 737 | not read | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3486 (Adducentur) | leaf 632, staff 8, x 1040 | not read | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3523 (Qui posuit fines) | leaf 682, staff 8, x 803 | e → e (at `fd/ef!gh`) | f → f (at `fd/ef!gh`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 2, x 1711 | not read | f → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3400 (Factus est opprobrium) | leaf 726, staff 7, x 470 | a~ → no GABC note | not read |
| quilisma-fresh-pages.json | GregoBase 3400 (Factus est opprobrium) | leaf 726, staff 7, x 466 | not read | a → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3400 (Factus est opprobrium) | leaf 726, staff 7, x 1598 | not read | b → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3402 (Omnis gloria) | leaf 752, staff 2, x 1459 | not read | j → j (in `h!iwj/kjj`) |
| quilisma-fresh-pages.json | GregoBase 3404 (Sacerdos sit sanctus) | leaf 676, staff 7, x 1131 | e → no GABC note | f → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3404 (Sacerdos sit sanctus) | leaf 676, staff 4, x 945 | not read | h → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3404 (Sacerdos sit sanctus) | leaf 678, staff 5, x 1172 | not read | f → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3404 (Sacerdos sit sanctus) | leaf 678, staff 9, x 1411 | not read | g → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3405 (Adjuvabit eam) | leaf 634, staff 3, x 1256 | d → no GABC note | e → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3405 (Adjuvabit eam) | leaf 633, staff 2, x 461 | not read | h → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3405 (Adjuvabit eam) | leaf 635, staff 4, x 747 | not read | f → f (e `gxfv//ef!hvFE/fhFED/ewf!gvFE`) |
| quilisma-fresh-pages.json | GregoBase 3405 (Adjuvabit eam) | leaf 636, staff 3, x 1113 | not read | e → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3410 (Magnificat) | leaf 752, staff 2, x 1459 | not read | j → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3410 (Magnificat) | leaf 755, staff 8, x 664 | not read | i → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3413 (Haec est Virgo sapiens et una) | leaf 634, staff 3, x 1256 | f → no GABC note | g → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3413 (Haec est Virgo sapiens et una) | leaf 635, staff 4, x 747 | not read | h → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3413 (Haec est Virgo sapiens et una) | leaf 636, staff 3, x 1113 | not read | g → g (et `gh!iwji/jvIHG//h!iwjijvIHGge ghGFdeDC`) |
| quilisma-fresh-pages.json | GregoBase 3414 (Vere tu es) | leaf 705, staff 1, x 1798 | not read | l → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3414 (Vere tu es) | leaf 706, staff 9, x 1161 | not read | j → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3416 (Statuit) | leaf 586, staff 1, x 618 | not read | j → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3416 (Statuit) | leaf 586, staff 2, x 1434 | not read | j → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3416 (Statuit) | leaf 587, staff 7, x 1444 | not read | h → h (ri `gh`) |
| quilisma-fresh-pages.json | GregoBase 3422 (Confiteantur tibi) | leaf 788, staff 1, x 1229 | not read | f → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3422 (Confiteantur tibi) | leaf 788, staff 1, x 1335 | not read | f → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3422 (Confiteantur tibi) | leaf 789, staff 8, x 666 | not read | i → i (ti `gh!iwji/jkj`) |
| quilisma-fresh-pages.json | GregoBase 3427 (Lingua pravorum) | leaf 744, staff 2, x 485 | not read | f → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3427 (Lingua pravorum) | leaf 746, staff 1, x 307 | not read | f → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3430 (In medio Ecclesiae) | leaf 620, staff 10, x 202 | not read | h → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3430 (In medio Ecclesiae) | leaf 620, staff 10, x 713 | not read | h → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3436 (Concupivit rex) | leaf 642, staff 3, x 1610 | not read | l → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3436 (Concupivit rex) | leaf 642, staff 8, x 347 | not read | h → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3437 (Adhaesi) | leaf 710, staff 5, x 1380 | not read | j → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3437 (Adhaesi) | leaf 710, staff 9, x 798 | not read | g → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3450 (Principes) | leaf 645, staff 5, x 1009 | not read | h → h (si `gh`) |
| quilisma-fresh-pages.json | GregoBase 3450 (Principes) | leaf 646, staff 1, x 1115 | not read | i → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3451 (Qui ambulat) | leaf 744, staff 2, x 485 | not read | f → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3451 (Qui ambulat) | leaf 746, staff 1, x 307 | not read | f → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3452 (Scitote quoniam) | leaf 789, staff 8, x 666 | not read | i → no GABC note |
| quilisma-fresh-pages.json | GregoBase 3452 (Scitote quoniam) | leaf 792, staff 4, x 1133 | not read | f → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3406 (Laetabitur justus) | leaf 595, staff 8, x 394 | not read | e → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3439 (Qui sequitur me) | leaf 595, staff 8, x 394 | not read | e → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3439 (Qui sequitur me) | leaf 598, staff 2, x 1246 | not read | f → f (nae. `f`) |
| rhombus-fresh-pages.json | GregoBase 3439 (Qui sequitur me) | leaf 598, staff 7, x 1102 | not read | g → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3439 (Qui sequitur me) | leaf 598, staff 9, x 359 | not read | g → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3439 (Qui sequitur me) | leaf 598, staff 9, x 1087 | not read | f → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3442 (Deus virtutum) | leaf 686, staff 7, x 1203 | g → no GABC note | h → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3442 (Deus virtutum) | leaf 686, staff 8, x 815 | not read | h → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3446 (Benedicta) | leaf 773, staff 5, x 634 | not read | g → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3446 (Benedicta) | leaf 775, staff 4, x 1744 | not read | a → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3449 (Quod dico vobis) | leaf 612, staff 5, x 1139 | not read | i → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3449 (Quod dico vobis) | leaf 613, staff 1, x 359 | not read | d → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3457 (Post partum (All)) | leaf 672, staff 5, x 1288 | not read | g → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3457 (Post partum (All)) | leaf 673, staff 8, x 1290 | not read | h → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3457 (Post partum (All)) | leaf 674, staff 8, x 1173 | not read | j → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3457 (Post partum (All)) | leaf 674, staff 9, x 844 | not read | i → no GABC note |
| rhombus-fresh-pages.json | GregoBase 3457 (Post partum (All)) | leaf 674, staff 9, x 1164 | not read | k → no GABC note |
| scan-pages.json | Dies irae | leaf 874, staff 8, x 513 | not read | d → d (num `hd`) |
| scan-pages.json | Dies irae | leaf 875, staff 4, x 853 | not read | f → f (Quid `f`) |
| scan-pages.json | Salve Regina (solemn tone) | leaf 84, staff 2, x 1290 | not read | h → h (mus, `h.`) |
| scan-pages.json | Salve Regina (solemn tone) | leaf 84, staff 3, x 754 | not read | e → e (má `fe`) |
| scan-pages.json | GregoBase 3434 (off-final ending) | leaf 353, staff 6, x 380 | not read | f → no GABC note |
| scan-pages.json | GregoBase 3407 (off-final ending) | leaf 422, staff 6, x 488 | g → no GABC note | h → no GABC note |
| scan-pages.json | GregoBase 3426 (off-final ending) | leaf 424, staff 7, x 1273 | f~ → no GABC note | not read |
| scan-pages.json | GregoBase 3426 (off-final ending) | leaf 424, staff 7, x 1264 | not read | f → no GABC note |
| scan-pages.json | GregoBase 3426 (off-final ending) | leaf 427, staff 7, x 1124 | not read | f → no GABC note |
| scan-pages.json | GregoBase 3403 (off-final ending) | leaf 512, staff 7, x 1111 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3403 (off-final ending) | leaf 515, staff 2, x 1538 | not read | g → no GABC note |
| scan-pages.json | GregoBase 3453 (off-final ending) | leaf 540, staff 2, x 237 | not read | f → no GABC note |
| scan-pages.json | GregoBase 3418 (off-final ending) | leaf 582, staff 4, x 1507 | not read | i → no GABC note |
| scan-pages.json | GregoBase 3429 (off-final ending) | leaf 874, staff 1, x 1596 | not read | h → no GABC note |
| scan-pages.json | GregoBase 3429 (off-final ending) | leaf 874, staff 8, x 513 | not read | b → no GABC note |
| scan-pages.json | GregoBase 3670 (Qui timetis, tilted page) | leaf 424, staff 7, x 1273 | h~ → no GABC note | not read |
| scan-pages.json | GregoBase 3670 (Qui timetis, tilted page) | leaf 424, staff 7, x 1264 | not read | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3425 (Domine quinque talenta) | leaf 367, staff 4, x 1229 | not read | j → j (in `ij`) |
| shape-fresh-pages.json | GregoBase 3425 (Domine quinque talenta) | leaf 369, staff 4, x 804 | not read | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3433 (Qui gloriatur) | leaf 505, staff 1, x 514 | not read | k → no GABC note |
| shape-fresh-pages.json | GregoBase 3433 (Qui gloriatur) | leaf 505, staff 1, x 1586 | not read | j → no GABC note |
| shape-fresh-pages.json | GregoBase 3433 (Qui gloriatur) | leaf 505, staff 9, x 1350 | not read | h → h (no `gf/ghhg`) |
| shape-fresh-pages.json | GregoBase 3433 (Qui gloriatur) | leaf 507, staff 7, x 989 | not read | j → no GABC note |
| shape-fresh-pages.json | GregoBase 3408 (Quando orabas) | leaf 515, staff 2, x 1538 | not read | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3448 (Diffusa est (All.)) | leaf 374, staff 9, x 1183 | e → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3448 (Diffusa est (All.)) | leaf 377, staff 5, x 1081 | b → no GABC note | c → no GABC note |
| shape-fresh-pages.json | GregoBase 3448 (Diffusa est (All.)) | leaf 374, staff 1, x 1106 | not read | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3448 (Diffusa est (All.)) | leaf 374, staff 2, x 1388 | not read | k → no GABC note |
| shape-fresh-pages.json | GregoBase 3448 (Diffusa est (All.)) | leaf 374, staff 4, x 1521 | not read | e → no GABC note |
| shape-fresh-pages.json | GregoBase 3444 (Constitues eos principes (Grad.)) | leaf 364, staff 7, x 1466 | f~ → no GABC note | not read |
| shape-fresh-pages.json | GregoBase 3444 (Constitues eos principes (Grad.)) | leaf 365, staff 1, x 348 | e → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3444 (Constitues eos principes (Grad.)) | leaf 363, staff 1, x 1507 | not read | l → no GABC note |
| shape-fresh-pages.json | GregoBase 3444 (Constitues eos principes (Grad.)) | leaf 364, staff 7, x 1475 | not read | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3444 (Constitues eos principes (Grad.)) | leaf 365, staff 2, x 714 | not read | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 427, staff 7, x 1124 | not read | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 7, x 301 | not read | d → no GABC note |
| shape-fresh-pages.json | GregoBase 3445 (Sapientia aedificavit) | leaf 369, staff 4, x 804 | not read | h → h (lú `g!hwi!jv`) |
| staff-curl-fresh-pages.json | GregoBase 3483 (Anima...sicut passer) | leaf 610, staff 9, x 1385 | not read | f → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 794, staff 2, x 652 | g → no GABC note | h → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 794, staff 3, x 795 | e → no GABC note | f → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 792, staff 4, x 1133 | not read | d → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3533 (Laudate Dominum) | leaf 793, staff 2, x 1581 | not read | i → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3545 (Laudate Dominum) | leaf 655, staff 5, x 698 | not read | b → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3550 (Rogate quae ad pacem) | leaf 678, staff 5, x 1172 | not read | d → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3550 (Rogate quae ad pacem) | leaf 678, staff 9, x 1411 | not read | e → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3652 (Judicant sancti) | leaf 576, staff 9, x 219 | not read | f → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3704 (Benedicte Dominum) | leaf 655, staff 5, x 698 | not read | b → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3791 (Ave Rex noster) | leaf 666, staff 6, x 955 | not read | e → no GABC note |

## One-step cephalici still missed (rule on)

Where: the scan note paired with the head or the nearest paired neighbour. Head: the scan note paired with the GABC head. Read: the scan note paired with the small note.

| list | piece | syllable `group` (want) | where | head read as | small note read as |
|---|---|---|---|---|---|
| clef-change-fresh-pages.json | GregoBase 3524 (Gloriosus Deus) | vir `ghg~` (hg~) | leaf 605, staff 9, x 1762 | nothing | e (rhombus) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | non `gihhg~` (hg~) | leaf 434, staff 3, x 1190 | h (rhombus) | nothing |
| scan-pages.json | Salve Regina (solemn tone) | con `gf~` (gf~) | leaf 84, staff 4, x 1621 | g (square) | nothing |
| shape-fresh-pages.json | GregoBase 3448 (Diffusa est (All.)) | in `gf~` (gf~) | leaf 376, staff 1, x 726 | g (square) | nothing |
| staff-curl-fresh-pages.json | GregoBase 3550 (Rogate quae ad pacem) | dán `fv//dgfgjv//iiih~` (ih~) | leaf 681, staff 3, x 784 | i (square) | i (square) |
| staff-curl-fresh-pages.json | GregoBase 3741 (Recordare Virgo) | COR `fe~` (fe~) | leaf 627, staff 3, x 562 | f (square) | e (rhombus) |
