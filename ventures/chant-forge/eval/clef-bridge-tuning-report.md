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
| clef-change-fresh-pages.json | 14 | 3328 / 3328 | 1 / 1 | 57 / 57 | 8 / 8 | 6 / 6 of 6 | 5 / 5 of 6 | 1 / 1 | 4 (4) / 4 (4) of 5 |
| hook-fresh-pages.json | 15 | 2525 / 2525 | 4 / 4 | 50 / 50 | 13 / 13 | 24 / 24 of 25 | 8 / 8 of 8 | 1 / 1 | 9 (9) / 9 (9) of 9 |
| liquescent-fresh-pages.json | 11 | 1752 / 1773 | 21 / 5 | 49 / 44 | 11 / 6 | 15 / 15 of 17 | 9 / 10 of 10 | 2 / 1 | 11 (11) / 12 (12) of 12 |
| offfinal-supplement-pages.json | 5 | 879 / 879 | 0 / 0 | 63 / 63 | 0 / 0 | 2 / 2 of 2 | 4 / 4 of 4 | 1 / 1 | 1 (1) / 1 (1) of 1 |
| porrectus-liquescent-fresh-pages.json | 6 | 1078 / 1078 | 0 / 0 | 15 / 15 | 1 / 1 | 7 / 7 of 11 | 6 / 6 of 6 | 1 / 1 | 0 (0) / 0 (0) of 0 |
| porrectus-liquescent-pages.json | 6 | 1027 / 1065 | 0 / 0 | 22 / 22 | 3 / 3 | 14 / 15 of 15 | 3 / 3 of 3 | 0 / 0 | 3 (3) / 4 (4) of 4 |
| quilisma-fresh-pages.json | 18 | 3457 / 3457 | 37 / 37 | 102 / 102 | 4 / 4 | 11 / 11 of 12 | 11 / 11 of 11 | 2 / 2 | 5 (5) / 5 (5) of 5 |
| rhombus-fresh-pages.json | 6 | 752 / 752 | 1 / 1 | 6 / 6 | 3 / 3 | 5 / 5 of 5 | 4 / 4 of 4 | 2 / 2 | 4 (4) / 4 (4) of 4 |
| scan-pages.json | 13 | 3138 / 3138 | 0 / 0 | 59 / 59 | 2 / 2 | 13 / 13 of 14 | 20 / 20 of 21 | 0 / 0 | 15 (15) / 15 (15) of 16 |
| shape-fresh-pages.json | 9 | 1979 / 1979 | 4 / 4 | 50 / 50 | 5 / 5 | 13 / 13 of 15 | 11 / 11 of 11 | 1 / 1 | 8 (8) / 8 (8) of 9 |
| staff-curl-fresh-pages.json | 10 | 1690 / 1690 | 20 / 20 | 40 / 40 | 34 / 34 | 6 / 6 of 10 | 7 / 7 of 9 | 2 / 2 | 6 (6) / 6 (6) of 8 |
| all | 128 | 24479 / 24538 | 89 / 73 | 569 / 564 | 91 / 86 | 136 / 137 of 154 | 100 / 101 of 105 | 13 / 12 | 78 (78) / 80 (80) of 85 |

## Every scan note the rule moved, added or removed

Scan note → the GABC note the alignment pairs it with (`~` = liquescent).

| list | piece | where | before | after |
|---|---|---|---|---|
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 191 | 5 → no GABC note | m → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 223 | 4 → no GABC note | l → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 241 | m → no GABC note | k → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 260 | l → no GABC note | j → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 279 | k → no GABC note | i → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 297 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 326 | k → no GABC note | i → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 344 | l → no GABC note | j → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 365 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 421 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 508 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 525 | i → no GABC note | g → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 581 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 601 | k → no GABC note | i → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 619 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 648 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 704 | i → no GABC note | g → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 819 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 836 | i → no GABC note | g → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 893 | l → no GABC note | j → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 912 | m → no GABC note | k → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 985 | 5 → no GABC note | m → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1015 | 4 → no GABC note | l → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1034 | m → no GABC note | k → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1053 | l → no GABC note | j → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1082 | m → no GABC note | k → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1099 | l → no GABC note | j → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1156 | m → no GABC note | k → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1176 | 5 → no GABC note | m → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1195 | m → no GABC note | k → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1250 | 4 → no GABC note | l → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1286 | 5 → no GABC note | m → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1316 | 4 → no GABC note | l → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1335 | m → no GABC note | k → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1354 | l → no GABC note | j → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1372 | k → no GABC note | i → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1392 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1505 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1524 | k → no GABC note | i → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1542 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3415 (Stabant) | leaf 428, staff 9, x 1571 | j → no GABC note | h → no GABC note |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 194 | j → i (mó `i`) | h → h (te `h`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 251 | j → h (ni `h`) | h → h (sti `h`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 317 | k → f (is `f!gwh`) | i → i (mó `i`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 373 | j → g (is `f!gwh`) | h → h (ni `h`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 430 | h → h (is `f!gwh`) | f → f (is `f!gwh`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 451 | j → h (tu `g!hi!jvIGh`) | h → h (is `f!gwh`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 524 | i → i (tu `g!hi!jvIGh`) | g → g (tu `g!hi!jvIGh`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 542 | j → j (tu `g!hi!jvIGh`) | h → h (tu `g!hi!jvIGh`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 543 | k → no GABC note | i → i (tu `g!hi!jvIGh`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 560 | l → no GABC note | j → j (tu `g!hi!jvIGh`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 590 | k → no GABC note | i → i (tu `g!hi!jvIGh`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 618 | i → i (tu `g!hi!jvIGh`) | g → g (tu `g!hi!jvIGh`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 646 | j → g (tu `g!hi!jvIGh`) | h → h (tu `g!hi!jvIGh`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 703 | j → h (tu `g!hi!jvIGh`) | h → h (is `h`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 796 | h → h (is `h`) | f → f (in `fg`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 797 | i → f (spé `fhg`) | g → g (in `fg`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 891 | h → h (spé `fhg`) | f → f (con `fe`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 909 | g → g (spé `fhg`) | e → e (con `fe`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 992 | h → h (ctu `hi`) | f → f (spé `fhg`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1030 | i → i (ctu `hi`) | g → g (spé `fhg`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1087 | j → f (re `fgFE`) | h → h (ctu `hi`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1088 | k → e (re `fgFE`) | i → i (ctu `hi`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1162 | h → e (gum, `e`) | f → f (re `fgFE`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1190 | h → h (et `h`) | f → f (re `fgFE`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1210 | g → no GABC note | e → e (re `fgFE`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1266 | g → g (non `gihhg~`) | e → e (gum, `e`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1378 | j → no GABC note | h → h (et `h`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1471 | i → i (non `gihhg~`) | g → g (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1491 | k → h (non `gihhg~`) | i → i (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1510 | j → h (non `gihhg~`) | h → h (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1540 | j → g~ (non `gihhg~`) | h → h (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1544 | i~ → e (con `ef`) | g~ → g~ (non `gihhg~`) |
| liquescent-fresh-pages.json | GregoBase 3421 (Narraverunt) | leaf 434, staff 3, x 1604 | g → f (con `ef`) | e → e (con `ef`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 373 | g → no GABC note | e → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 374 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 411 | g → no GABC note | e → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 425 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 452 | g → no GABC note | e → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 467 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 495 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 524 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 543 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 571 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 600 | g → no GABC note | e → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 605 | h~ → no GABC note | f~ → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 657 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 750 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 770 | k → no GABC note | i → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 790 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 817 | k → no GABC note | i → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 845 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 864 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 883 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 911 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 931 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 960 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 978 | g → no GABC note | e → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1054 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1073 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1099 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1100 | k → no GABC note | i → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1129 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1148 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1167 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1196 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1215 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1244 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1262 | g → no GABC note | e → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1338 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1366 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1394 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1423 | k → no GABC note | i → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1424 | l → no GABC note | j → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1451 | k → no GABC note | i → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1480 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1510 | j → no GABC note | h → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1527 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1556 | i → no GABC note | g → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 8, x 1575 | h → no GABC note | f → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 488 | h → no GABC note | f → f (E `fv//egf`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 528 | g → no GABC note | e → e (E `fv//egf`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 547 | i → no GABC note | g → g (E `fv//egf`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 566 | h → no GABC note | f → f (E `fv//egf`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 622 | h → no GABC note | f → f (GO `f`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 697 | g → no GABC note | e → e (au `ef!hhh/ih~`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 698 | h → no GABC note | f → f (au `ef!hhh/ih~`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 715 | j → no GABC note | h → h (au `ef!hhh/ih~`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 744 | j → no GABC note | h → h (au `ef!hhh/ih~`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 772 | j → no GABC note | h → h (au `ef!hhh/ih~`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 801 | k → no GABC note | i → i (au `ef!hhh/ih~`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 806 | j~ → no GABC note | h~ → h~ (au `ef!hhh/ih~`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 857 | j → no GABC note | h → h (tem, `h`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1028 | j → no GABC note | h → h (cum `hg`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1046 | i → no GABC note | g → g (cum `hg`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1158 | j → no GABC note | h → h (mi `hhhf/ghg`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1187 | j → no GABC note | h → h (mi `hhhf/ghg`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1216 | j → no GABC note | h → h (mi `hhhf/ghg`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1235 | h → no GABC note | f → f (mi `hhhf/ghg`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1263 | i → no GABC note | g → g (mi `hhhf/ghg`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1282 | j → no GABC note | h → h (mi `hhhf/ghg`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1301 | i → no GABC note | g → g (mi `hhhf/ghg`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1358 | h → no GABC note | f → f (hi `fe`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1376 | g → no GABC note | e → e (hi `fe`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1451 | g → no GABC note | e → e (mo `e`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1499 | g → no GABC note | e → e (lé `ef/gfge`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1500 | h → no GABC note | f → f (lé `ef/gfge`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1528 | i → no GABC note | g → g (lé `ef/gfge`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1565 | h → no GABC note | f → f (lé `ef/gfge`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1584 | i → no GABC note | g → g (lé `ef/gfge`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1604 | g → no GABC note | e → e (lé `ef/gfge`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1650 | e → no GABC note | c → c (sti `ce`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1651 | g → no GABC note | e → e (sti `ce`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1716 | e → no GABC note | c → c (es `ce/fef`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1717 | g → no GABC note | e → e (es `ce/fef`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1749 | h → no GABC note | f → f (es `ce/fef`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1784 | g → no GABC note | e → e (es `ce/fef`) |
| porrectus-liquescent-pages.json | GregoBase 3606 (Ego autem) | leaf 557, staff 9, x 1785 | h → no GABC note | f → f (es `ce/fef`) |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 191 | m → no GABC note | k → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 223 | l → no GABC note | j → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 241 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 260 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 279 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 297 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 326 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 344 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 365 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 421 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 508 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 525 | g → no GABC note | e → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 581 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 601 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 619 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 648 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 704 | g → no GABC note | e → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 819 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 836 | g → no GABC note | e → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 893 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 912 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 985 | m → no GABC note | k → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1015 | l → no GABC note | j → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1034 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1053 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1082 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1099 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1156 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1176 | m → no GABC note | k → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1195 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1250 | l → no GABC note | j → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1286 | m → no GABC note | k → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1316 | l → no GABC note | j → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1335 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1354 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1372 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1392 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1505 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1524 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1542 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 428, staff 9, x 1571 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 169 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 225 | l → no GABC note | j → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 301 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 359 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 377 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 461 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 555 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 640 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 706 | g → no GABC note | e → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 800 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 894 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 950 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 1007 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 1101 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 1176 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 1232 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 1364 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 1420 | g → no GABC note | e → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 1505 | e → no GABC note | c → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 1563 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 8, x 1580 | g → no GABC note | e → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 169 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 226 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 348 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 405 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 537 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 592 | l → no GABC note | j → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 649 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 726 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 743 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 818 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 874 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 936 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 987 | g → no GABC note | e → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 1137 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 1231 | k → no GABC note | i → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 1297 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 1353 | j → no GABC note | h → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 1447 | i → no GABC note | g → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 1494 | h → no GABC note | f → no GABC note |
| shape-fresh-pages.json | GregoBase 3412 (Stabat sancta Maria) | leaf 430, staff 9, x 1541 | h → no GABC note | f → no GABC note |

## One-step cephalici still missed (rule on)

Where: the scan note paired with the head or the nearest paired neighbour. Head: the scan note paired with the GABC head. Read: the scan note paired with the small note.

| list | piece | syllable `group` (want) | where | head read as | small note read as |
|---|---|---|---|---|---|
| clef-change-fresh-pages.json | GregoBase 3524 (Gloriosus Deus) | vir `ghg~` (hg~) | leaf 605, staff 9, x 1762 | nothing | e (rhombus) |
| scan-pages.json | Salve Regina (solemn tone) | con `gf~` (gf~) | leaf 84, staff 4, x 1621 | g (square) | nothing |
| shape-fresh-pages.json | GregoBase 3448 (Diffusa est (All.)) | in `gf~` (gf~) | leaf 376, staff 1, x 726 | g (square) | nothing |
| staff-curl-fresh-pages.json | GregoBase 3550 (Rogate quae ad pacem) | dán `fv//dgfgjv//iiih~` (ih~) | leaf 681, staff 3, x 784 | i (square) | i (square) |
| staff-curl-fresh-pages.json | GregoBase 3741 (Recordare Virgo) | COR `fe~` (fe~) | leaf 627, staff 3, x 562 | f (square) | e (rhombus) |
