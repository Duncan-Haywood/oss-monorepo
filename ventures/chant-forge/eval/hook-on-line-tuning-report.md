# The hook-on-line rule, read both ways: the earlier piece lists (tuning)

Written by `node eval/hook-on-line-check.mjs` (scan reader: `scan.mjs`; the rule is `LIQ.onLine` in
`liquescentTail`, off with `readPage(img, { hookOnLine: false })`). "On-line liquescents" are GABC liquescents
whose small note is d, f, h or j (a staff line); one is "read" when the alignment pairs it with a scan
liquescent at its pitch. "False liquescents" are scan liquescents paired with a GABC note of another shape.

| list | pieces | agree (before / after) | differ | GABC only | scan only | on-line liquescents read | other liquescents read | false liquescents |
|---|---|---|---|---|---|---|---|---|
| broken-stroke-fresh-pages.json | 15 | 2869 / 2870 | 2 / 1 | 60 / 60 | 7 / 7 | 17 / 18 of 22 | 12 / 12 of 12 | 0 / 0 |
| clef-change-fresh-pages.json | 14 | 3308 / 3308 | 0 / 0 | 61 / 61 | 8 / 8 | 6 / 6 of 6 | 5 / 5 of 6 | 1 / 1 |
| liquescent-fresh-pages.json | 11 | 1748 / 1748 | 15 / 15 | 59 / 59 | 10 / 10 | 15 / 15 of 17 | 8 / 8 of 10 | 1 / 1 |
| offfinal-supplement-pages.json | 5 | 878 / 878 | 0 / 0 | 64 / 64 | 0 / 0 | 2 / 2 of 2 | 4 / 4 of 4 | 1 / 1 |
| porrectus-liquescent-fresh-pages.json | 6 | 1076 / 1076 | 0 / 0 | 17 / 17 | 1 / 1 | 7 / 7 of 11 | 6 / 6 of 6 | 1 / 1 |
| porrectus-liquescent-pages.json | 6 | 959 / 959 | 0 / 0 | 22 / 22 | 3 / 3 | 14 / 14 of 14 | 3 / 3 of 3 | 0 / 0 |
| quilisma-fresh-pages.json | 18 | 3449 / 3449 | 37 / 37 | 110 / 110 | 5 / 5 | 10 / 10 of 12 | 10 / 10 of 11 | 2 / 2 |
| rhombus-fresh-pages.json | 6 | 751 / 751 | 1 / 1 | 7 / 7 | 3 / 3 | 4 / 4 of 5 | 4 / 4 of 4 | 3 / 3 |
| scan-pages.json | 13 | 3133 / 3133 | 0 / 0 | 64 / 64 | 3 / 3 | 13 / 13 of 14 | 19 / 19 of 21 | 0 / 0 |
| shape-fresh-pages.json | 9 | 1976 / 1976 | 4 / 4 | 53 / 53 | 5 / 5 | 13 / 13 of 15 | 11 / 11 of 11 | 1 / 1 |
| staff-curl-fresh-pages.json | 10 | 1688 / 1689 | 21 / 20 | 41 / 41 | 33 / 33 | 5 / 6 of 10 | 7 / 7 of 9 | 2 / 2 |
| all | 113 | 21835 / 21837 | 80 / 78 | 558 / 558 | 78 / 78 | 106 / 108 of 128 | 89 / 89 of 97 | 12 / 12 |

## Every scan note the rule moved, added or removed

Scan note → the GABC note the alignment pairs it with (`~` = liquescent).

| list | piece | where | before | after |
|---|---|---|---|---|
| broken-stroke-fresh-pages.json | GregoBase 3464 (Intret in conspectu) | leaf 604, staff 6, x 1289 | e~ → d~ (sanc `fd~`) | d~ → d~ (sanc `fd~`) |
| clef-change-fresh-pages.json | GregoBase 3524 (Gloriosus Deus) | leaf 604, staff 6, x 1289 | c~ → no GABC note | b~ → no GABC note |
| porrectus-liquescent-pages.json | GregoBase 3523 (Qui posuit fines) | leaf 681, staff 3, x 468 | i~ → no GABC note | j~ → no GABC note |
| staff-curl-fresh-pages.json | GregoBase 3550 (Rogate quae ad pacem) | leaf 681, staff 3, x 468 | e~ → f~ (bun `df~`) | f~ → f~ (bun `df~`) |
