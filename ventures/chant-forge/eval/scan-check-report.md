# Corpus against the printed book, read off the scans

Written by `node eval/scan-check.mjs` (scan reader: `scan.mjs`). "Agree" counts
printed notes whose staff position, relative to the clef, matches the GABC note
the alignment pairs them with. "GABC only" are notes the reader did not find on
the page (mostly shapes it cannot read: porrectus strokes, rhombi joined to a
stem, notes on ledger lines); "scan only" are marks it read as notes that the
GABC lacks (flats, the odd custos, specks). Disagreements are listed so each
can be looked at on the scan; the verdicts from looking are in
`scan-check-verdicts.md`. The last column is a control: one GABC note that
agrees with the scan is moved a step up or down (seeded, one at a time) and
the check is run again; it counts the trials in which the moved note is
reported, so it says how many real one-step transcription slips this
check would catch.

| piece | book | pages | notes read | agree | differ | GABC only | scan only | agreement | one-step errors caught |
|---|---|---|---|---|---|---|---|---|---|
| Dies irae | Graduale Romanum, Vatican 1908 | 83*, 84*, 85*, 86* | 604 | 604 | 0 | 9 | 0 | 98.5% of 613 GABC notes | 198 of 200 |
| Veni Creator (verse 1) | Graduale Romanum, Vatican 1908 | 121* | 43 | 43 | 0 | 0 | 0 | 100.0% of 43 GABC notes | 198 of 200 |
| Pange lingua (verse 1) | Graduale Romanum, Vatican 1908 | 123* | 53 | 53 | 0 | 0 | 0 | 100.0% of 53 GABC notes | 197 of 200 |
| Te Deum (Roman tone, 1908) | Graduale Romanum, Vatican 1908 | 118*, 119*, 120*, 121* | 634 | 633 | 0 | 1 | 1 | 99.8% of 634 GABC notes | 200 of 200 |
| Salve Regina (solemn tone) | Antiphonale Romanum, Vatican 1912 | 56, 57 | 219 | 219 | 0 | 12 | 0 | 94.8% of 231 GABC notes | 195 of 200 |
| GregoBase 3434 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 353, leaf 354, 329, leaf 356 | 1288 | 217 | 0 | 12 | 1 | 94.8% of 229 GABC notes | 192 of 200 |
| GregoBase 3407 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 420, leaf 421, 396, leaf 423 | 1367 | 216 | 0 | 3 | 1 | 98.6% of 219 GABC notes | 199 of 200 |
| GregoBase 3426 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 424, leaf 425, 400, leaf 427 | 1238 | 160 | 0 | 0 | 0 | 100.0% of 160 GABC notes | 199 of 200 |
| GregoBase 3403 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 512, leaf 513, 488, leaf 515 | 824 | 113 | 1 | 1 | 0 | 98.3% of 115 GABC notes | 198 of 200 |
| GregoBase 3453 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 537, leaf 538, 513, leaf 540 | 896 | 137 | 0 | 5 | 0 | 96.5% of 142 GABC notes | 200 of 200 |
| GregoBase 3418 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 579, leaf 580, 555, leaf 582 | 624 | 154 | 0 | 13 | 0 | 92.2% of 167 GABC notes | 196 of 200 |
| GregoBase 3429 (off-final ending) | Graduale Romanum, Vatican 1908 | 82*, leaf 874 | 626 | 286 | 1 | 0 | 2 | 99.7% of 287 GABC notes | 199 of 200 |

## Dies irae

corpus/dies-irae.gabc, 613 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): e/e f/f e/e d/d c/c d/d; GABC notes covered 1-613 of 613.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| Te | a | a | - | not read; near p. 83* (leaf 874), staff 5, x 1493 |
| spar | hvGF | g | - | not read; near p. 83* (leaf 874), staff 8, x 199 |
| num | hd | d | - | not read; near p. 83* (leaf 874), staff 8, x 494 |
| o | hvGF | g | - | not read; near p. 83* (leaf 874), staff 8, x 1379 |
| cán | hvGF | g | - | not read; near p. 84* (leaf 875), staff 1, x 603 |
| Quid | f | f | - | not read; near p. 84* (leaf 875), staff 4, x 684 |
| bor | evDC | c | - | not read; near p. 84* (leaf 875), staff 9, x 1472 |
| in | evDC | c | - | not read; near p. 85* (leaf 876), staff 7, x 1372 |
| ma | hvGF | g | - | not read; near p. 85* (leaf 876), staff 8, x 665 |

## Veni Creator (verse 1)

corpus/veni-creator.gabc, 43 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f g/g f/f e/e d/d e/e; GABC notes covered 1-43 of 43.

No disagreement among the notes the reader found.

## Pange lingua (verse 1)

corpus/pange-lingua.gabc, 53 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g f/f e/e d/d e/e; GABC notes covered 1-53 of 53.

No disagreement among the notes the reader found.

## Te Deum (Roman tone, 1908)

corpus/te-deum.gabc, 637 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): g/g f/f g/g f/· e/· e/·; GABC notes covered 1-634 of 637.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| di | h!iwj | i | - | not read; near p. 120* (leaf 911), staff 5, x 932 |
| ? |  | - | e | p. 121* (leaf 912), staff 2, x 292 |

## Salve Regina (solemn tone)

corpus/salve-regina.gabc, 231 GABC notes; scan of Antiphonale Romanum, Vatican 1912 (archive.org item `antiphonale00anonuoft`).

Ending, GABC/scan (· = not read or not on these pages): d/d g/g f/f f/f e/e d/d; GABC notes covered 1-231 of 231.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| mus, | h. | h | - | not read; near p. 57 (leaf 84), staff 2, x 1235 |
| flen | fvED | e | - | not read; near p. 57 (leaf 84), staff 3, x 207 |
| flen | fvED | d | - | not read; near p. 57 (leaf 84), staff 3, x 312 |
| in | d | d | - | not read; near p. 57 (leaf 84), staff 3, x 312 |
| hac | dcf | c | - | not read; near p. 57 (leaf 84), staff 3, x 406 |
| má | fe | e | - | not read; near p. 57 (leaf 84), staff 3, x 737 |
| cá | hvGF | g | - | not read; near p. 57 (leaf 84), staff 3, x 1590 |
| cá | hvGF | f | - | not read; near p. 57 (leaf 84), staff 4, x 210 |
| los | evDC. | c | - | not read; near p. 57 (leaf 84), staff 4, x 1301 |
| con | gf~ | f | - | not read; near p. 57 (leaf 84), staff 4, x 1621 |
| O | hhg/h!iwj | i | - | not read; near p. 57 (leaf 84), staff 6, x 1256 |
| O | g.h!iwjji | i | - | not read; near p. 57 (leaf 84), staff 6, x 1566 |

## GregoBase 3434 (off-final ending)

corpus/gregobase-1908/3434.gabc, 229 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g f/f g/g g/g f/f; GABC notes covered 1-229 of 229.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| ter | f/hvhf/gvFE | f | - | not read; near p. leaf 354 (leaf 354), staff 3, x 699 |
| ter | f/hvhf/gvFE | e | - | not read; near p. leaf 354 (leaf 354), staff 3, x 804 |
| ne | fe!fw!gvFEf | f | - | not read; near p. leaf 354 (leaf 354), staff 3, x 1113 |
| quem | fc~ | c | - | not read; near p. leaf 354 (leaf 354), staff 4, x 1235 |
| e | fgFE | f | - | not read; near p. leaf 354 (leaf 354), staff 6, x 1131 |
| e | fgFE | e | - | not read; near p. leaf 354 (leaf 354), staff 6, x 1235 |
| om | fgFE | f | - | not read; near p. leaf 354 (leaf 354), staff 7, x 201 |
| om | fgFE | e | - | not read; near p. leaf 354 (leaf 354), staff 7, x 305 |
| car | hhg~ | h | - | not read; near p. leaf 354 (leaf 354), staff 7, x 1495 |
| nem |  | - | h | p. leaf 354 (leaf 354), staff 8, x 154 |
| e | fgFE | f | - | not read; near p. leaf 354 (leaf 354), staff 8, x 557 |
| e | fgFE | e | - | not read; near p. leaf 354 (leaf 354), staff 8, x 661 |
| ne | hf!gwhg | g | - | not read; near p. leaf 354 (leaf 354), staff 8, x 1251 |

## GregoBase 3407 (off-final ending)

corpus/gregobase-1908/3407.gabc, 219 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): g/g f/f f/f d/d e/e d/d; GABC notes covered 1-219 of 219.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| Be | cd!ewff | e | - | not read; near p. leaf 421 (leaf 421), staff 4, x 367 |
| De | ixf!gwh!iv | g | - | not read; near p. leaf 421 (leaf 421), staff 4, x 961 |
| ? | hg/hvFD/gfffvEC//ggf/ghddc/da | c | - | not read; near p. leaf 421 (leaf 421), staff 7, x 1095 |
| ? |  | - | f | p. leaf 421 (leaf 421), staff 7, x 1461 |

## GregoBase 3426 (off-final ending)

corpus/gregobase-1908/3426.gabc, 160 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g f/f g/g h/h f/f; GABC notes covered 1-160 of 160.

No disagreement among the notes the reader found.

## GregoBase 3403 (off-final ending)

corpus/gregobase-1908/3403.gabc, 115 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f e/e f/f e/e d/d e/e; GABC notes covered 1-115 of 115.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| ha | hi!jvIHi | i | - | not read; near p. leaf 513 (leaf 513), staff 4, x 1555 |
| su | ef/hfh | h | g | p. leaf 513 (leaf 513), staff 5, x 1693 |

## GregoBase 3453 (off-final ending)

corpus/gregobase-1908/3453.gabc, 142 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g h/h i/i g/g h/h; GABC notes covered 1-142 of 142.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| a | gh!iw!jvIHijgg/efe | h | - | not read; near p. leaf 538 (leaf 538), staff 2, x 1348 |
| a | gh!iw!jvIHijgg/efe | i | - | not read; near p. leaf 538 (leaf 538), staff 2, x 1385 |
| a | gh!iw!jvIHijgg/efe | i | - | not read; near p. leaf 538 (leaf 538), staff 2, x 1385 |
| e | fgFE | f | - | not read; near p. leaf 538 (leaf 538), staff 3, x 868 |
| e | fgFE | e | - | not read; near p. leaf 538 (leaf 538), staff 3, x 972 |

## GregoBase 3418 (off-final ending)

corpus/gregobase-1908/3418.gabc, 168 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f f/f d/d c/c d/d f/·; GABC notes covered 1-167 of 168.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| mi | ixhg!hwihi | h | - | not read; near p. leaf 580 (leaf 580), staff 1, x 1031 |
| de | fg | f | - | not read; near p. leaf 580 (leaf 580), staff 2, x 1495 |
| cu | fg | f | - | not read; near p. leaf 580 (leaf 580), staff 3, x 153 |
| láu | g/hjHG | h | - | not read; near p. leaf 580 (leaf 580), staff 3, x 1513 |
| láu | g/hjHG | g | - | not read; near p. leaf 580 (leaf 580), staff 4, x 154 |
| De | d!ewfef | f | - | not read; near p. leaf 580 (leaf 580), staff 4, x 704 |
| sul | gh | h | - | not read; near p. leaf 580 (leaf 580), staff 4, x 996 |
| no: | gh | h | - | not read; near p. leaf 580 (leaf 580), staff 4, x 1562 |
| re | gf | f | - | not read; near p. leaf 580 (leaf 580), staff 5, x 155 |
| ri | gh | h | - | not read; near p. leaf 580 (leaf 580), staff 5, x 988 |
| a | h | h | - | not read; near p. leaf 580 (leaf 580), staff 5, x 988 |
| Pa | h | h | - | not read; near p. leaf 580 (leaf 580), staff 5, x 1049 |
| u | f | f | - | not read; near p. leaf 580 (leaf 580), staff 5, x 1309 |

## GregoBase 3429 (off-final ending)

corpus/gregobase-1908/3429.gabc, 287 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g f/f g/g h/h f/f; GABC notes covered 1-287 of 287.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| ne: |  | - | h | p. 82* (leaf 873), staff 2, x 437 |
| a | fhFEfhhf//hvvGFheed | f | h | p. 82* (leaf 873), staff 3, x 275 |
| la |  | - | h | p. 82* (leaf 873), staff 6, x 1050 |
