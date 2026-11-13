# Rhombus or square: the scan reader against the GABC

Written by `node eval/shape-check.mjs` (reader: `scan.mjs`, `headShape`). Notes are paired by
pitch as in `scan-check.mjs`; for each pair that agrees in pitch, the shape the reader saw is set
against the shape the GABC writes. "Tuned on" is the five corpus pieces the two thresholds (width under
0.42 staff spaces, end columns under 0.8 of the middle ones' height) were chosen on; "held out" is the
seven GregoBase pieces from the 1908 Graduale that played no part in choosing them.

| set | GABC shape | in the GABC span | paired by pitch | read as rhombus | read as square |
|---|---|---|---|---|---|
| tuned on | punctum | 1439 | 1432 | 0 of 1432 (0.0%) | 1380 of 1432 (96.4%) |
| tuned on | virga | 38 | 38 | 0 of 38 (0.0%) | 38 of 38 (100.0%) |
| tuned on | rhombus | 79 | 68 | 68 of 68 (100.0%) | 0 of 68 (0.0%) |
| tuned on | quilisma | 9 | 6 | 0 of 6 (0.0%) | 6 of 6 (100.0%) |
| tuned on | liquescent | 9 | 0 | - | - |
| held out | punctum | 1006 | 983 | 1 of 983 (0.1%) | 950 of 983 (96.6%) |
| held out | virga | 50 | 48 | 0 of 48 (0.0%) | 48 of 48 (100.0%) |
| held out | rhombus | 136 | 120 | 118 of 120 (98.3%) | 0 of 120 (0.0%) |
| held out | quilisma | 24 | 18 | 0 of 18 (0.0%) | 18 of 18 (100.0%) |
| held out | liquescent | 24 | 2 | 0 of 2 (0.0%) | 2 of 2 (100.0%) |

## Per piece

| piece | set | rhombi in GABC | paired | read as rhombus | squares (punctum, virga) paired | read as rhombus |
|---|---|---|---|---|---|---|
| Dies irae | tuned on | 48 | 42 | 42 | 562 | 0 |
| Veni Creator (verse 1) | tuned on | 0 | 0 | 0 | 43 | 0 |
| Pange lingua (verse 1) | tuned on | 2 | 2 | 2 | 51 | 0 |
| Te Deum (Roman tone, 1908) | tuned on | 16 | 16 | 16 | 608 | 0 |
| Salve Regina (solemn tone) | tuned on | 13 | 8 | 8 | 206 | 0 |
| GregoBase 3434 (off-final ending) | held out | 23 | 15 | 15 | 186 | 1 |
| GregoBase 3407 (off-final ending) | held out | 12 | 10 | 10 | 191 | 0 |
| GregoBase 3426 (off-final ending) | held out | 23 | 23 | 23 | 132 | 0 |
| GregoBase 3403 (off-final ending) | held out | 8 | 7 | 7 | 106 | 0 |
| GregoBase 3453 (off-final ending) | held out | 8 | 5 | 5 | 125 | 0 |
| GregoBase 3418 (off-final ending) | held out | 6 | 4 | 4 | 145 | 0 |
| GregoBase 3429 (off-final ending) | held out | 56 | 56 | 54 | 146 | 0 |

## Disagreements to look at

| piece | set | syllable | GABC group | GABC shape | scan shape | where |
|---|---|---|---|---|---|---|
| GregoBase 3434 (off-final ending) | held out | et | f | punctum | rhombus | p. leaf 354 (leaf 354), staff 5, x 817 |
