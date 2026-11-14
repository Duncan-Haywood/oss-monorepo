# Tilted pages straightened: before and after

Written by `node eval/deskew-check.mjs` (reader: `scan.mjs`, `estimateSkew` and `shearColumns`). "Before" reads
every page square (`{ deskew: false }`); "after" straightens a page whose slope moves a line `DESKEW_MIN_DRIFT`
pixels or more across it. Every page scanned so far: 185 pages from the five `eval/*pages.json` sets.

| | before | after |
|---|---|---|
| staves found | 1384 | 1391 |
| notes read (every staff) | 47864 | 48194 |
| pages straightened | - | 2 |

Slopes found, degrees (leaf: slope): 585: 0.64; 424: -0.94

## Pages where the reading differs

| item | leaf | slope (deg) | staves before | after | notes before | after |
|---|---|---|---|---|---|---|
| gradualesacrosan0000cath | 424 | -0.94 | 2 | 9 | 15 | 345 |
