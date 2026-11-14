# Staff lines at their own thickness: before and after

Written by `node eval/thick-line-check.mjs` (reader: `scan.mjs`, `findStaves` and `trimLine`). "Before" is the
finder up to 2026-11-14 (`staffV1`); "after" trims each line band to the rows that hold long runs of ink, also
tries the spacing of a staff's outer two lines, and drops a "staff" far tighter than the page's median.
Every page scanned so far: 185 pages from the five `eval/*pages.json` sets. Why: `thick-line-check.md`.

| | before | after |
|---|---|---|
| staves found | 1361 | 1384 |
| staff lines | 5444 | 5536 |
| lines under 0.2 staff spaces thick | 4936 | 5027 |
| lines 0.2 to 0.3 staff spaces thick | 426 | 480 |
| lines 0.3 to 0.5 staff spaces thick | 44 | 26 |
| lines 0.5 or more staff spaces thick | 38 | 3 |
| notes read (every staff, clef-relative or not) | 46079 | 47864 |

## Pages where the staves found differ

Tops in pixels on the 2000 px archive.org page image.

| item | leaf | staves before | after | added (top) | lost (top) |
|---|---|---|---|---|---|
| gradualesacrosan0000cath | 426 | 6 | 7 | 526 | - |
| gradualesacrosan0000cath | 434 | 2 | 3 | 2092 | - |
| gradualesacrosan0000cath | 444 | 8 | 9 | 1755 | - |
| gradualesacrosan0000cath | 641 | 8 | 9 | 1784 | - |
| gradualesacrosan0000cath | 743 | 8 | 9 | 413 | - |
| gradualesacrosan0000cath | 670 | 8 | 9 | 416 | - |
| gradualesacrosan0000cath | 757 | 7 | 8 | 2272 | - |
| gradualesacrosan0000cath | 747 | 8 | 9 | 390, 2361 | 2395 |
| gradualesacrosan0000cath | 642 | 8 | 8 | 2657 | 2695 |
| gradualesacrosan0000cath | 710 | 8 | 9 | 899 | - |
| gradualesacrosan0000cath | 646 | 8 | 9 | 2619 | - |
| gradualesacrosan0000cath | 792 | 7 | 9 | 1235, 1785 | - |
| gradualesacrosan0000cath | 595 | 8 | 9 | 898 | - |
| gradualesacrosan0000cath | 774 | 8 | 9 | 625 | - |
| gradualesacrosan0000cath | 776 | 7 | 8 | 2569 | - |
| gradualesacrosan0000cath | 420 | 8 | 9 | 653 | - |
| gradualesacrosan0000cath | 424 | 1 | 2 | 2308 | - |
| gradualesacrosan0000cath | 537 | 5 | 6 | 699 | - |
| gradualesacrosan0000cath | 539 | 8 | 9 | 657 | - |
| gradualesacrosan0000cath | 873 | 8 | 9 | 689 | - |
| gradualesacrosan0000cath | 366 | 5 | 6 | 1259 | - |
| gradualesacrosan0000cath | 506 | 8 | 9 | 2039 | - |
| gradualesacrosan0000cath | 555 | 4 | 5 | 1969 | - |
