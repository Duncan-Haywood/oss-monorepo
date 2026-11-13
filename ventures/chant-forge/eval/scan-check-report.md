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
| Te Deum (Roman tone, 1908) | Graduale Romanum, Vatican 1908 | 118*, 119*, 120*, 121* | 631 | 630 | 0 | 4 | 1 | 99.4% of 634 GABC notes | 200 of 200 |
| Salve Regina (solemn tone) | Antiphonale Romanum, Vatican 1912 | 56, 57 | 214 | 214 | 0 | 17 | 0 | 92.6% of 231 GABC notes | 196 of 200 |
| GregoBase 3434 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 353, leaf 354, 329, leaf 356 | 1241 | 206 | 0 | 23 | 1 | 90.0% of 229 GABC notes | 189 of 200 |
| GregoBase 3407 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 420, leaf 421, 396, leaf 423 | 1278 | 205 | 0 | 14 | 0 | 93.6% of 219 GABC notes | 198 of 200 |
| GregoBase 3426 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 424, leaf 425, 400, leaf 427 | 864 | 158 | 0 | 2 | 0 | 98.8% of 160 GABC notes | 199 of 200 |
| GregoBase 3403 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 512, leaf 513, 488, leaf 515 | 814 | 113 | 1 | 1 | 0 | 98.3% of 115 GABC notes | 198 of 200 |
| GregoBase 3453 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 537, leaf 538, 513, leaf 540 | 789 | 130 | 0 | 10 | 0 | 92.9% of 140 GABC notes | 197 of 200 |
| GregoBase 3418 (off-final ending) | Graduale Romanum, Vatican 1908 | leaf 579, leaf 580, 555, leaf 582 | 606 | 151 | 0 | 16 | 0 | 90.4% of 167 GABC notes | 192 of 200 |
| GregoBase 3429 (off-final ending) | Graduale Romanum, Vatican 1908 | 82*, leaf 874 | 573 | 208 | 0 | 2 | 1 | 99.0% of 210 GABC notes | 196 of 200 |

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
| er | gh~ | h | - | not read; near p. 119* (leaf 910), staff 9, x 1229 |
| di | h!iwj | i | - | not read; near p. 120* (leaf 911), staff 5, x 932 |
| lau | gh~ | h | - | not read; near p. 120* (leaf 911), staff 5, x 1702 |
| mád | gh~ | h | - | not read; near p. 120* (leaf 911), staff 9, x 1207 |
| ? |  | - | e | p. 121* (leaf 912), staff 2, x 292 |

## Salve Regina (solemn tone)

corpus/salve-regina.gabc, 231 GABC notes; scan of Antiphonale Romanum, Vatican 1912 (archive.org item `antiphonale00anonuoft`).

Ending, GABC/scan (· = not read or not on these pages): d/d g/g f/f f/f e/e d/d; GABC notes covered 1-231 of 231.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| mus, | h. | h | - | not read; near p. 57 (leaf 84), staff 2, x 1235 |
| mén | fg~ | g | - | not read; near p. 57 (leaf 84), staff 2, x 1469 |
| flen | fvED | e | - | not read; near p. 57 (leaf 84), staff 3, x 207 |
| flen | fvED | d | - | not read; near p. 57 (leaf 84), staff 3, x 312 |
| in | d | d | - | not read; near p. 57 (leaf 84), staff 3, x 312 |
| hac | dcf | c | - | not read; near p. 57 (leaf 84), staff 3, x 406 |
| má | fe | e | - | not read; near p. 57 (leaf 84), staff 3, x 737 |
| val | fe~ | e | - | not read; near p. 57 (leaf 84), staff 3, x 925 |
| er | gh~ | h | - | not read; near p. 57 (leaf 84), staff 3, x 1291 |
| cá | hvGF | g | - | not read; near p. 57 (leaf 84), staff 3, x 1590 |
| cá | hvGF | f | - | not read; near p. 57 (leaf 84), staff 4, x 210 |
| los | evDC. | c | - | not read; near p. 57 (leaf 84), staff 4, x 1301 |
| con | gf~ | f | - | not read; near p. 57 (leaf 84), staff 4, x 1621 |
| ven | e[ll:1]d~ | d | - | not read; near p. 57 (leaf 84), staff 5, x 1268 |
| O | hhg/h!iwj | i | - | not read; near p. 57 (leaf 84), staff 6, x 1256 |
| O | g.h!iwjji | i | - | not read; near p. 57 (leaf 84), staff 6, x 1566 |
| dul | gf~ | f | - | not read; near p. 57 (leaf 84), staff 7, x 771 |

## GregoBase 3434 (off-final ending)

corpus/gregobase-1908/3434.gabc, 229 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g f/f g/g g/g f/f; GABC notes covered 1-229 of 229.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| in | fe~ | e | - | not read; near p. leaf 354 (leaf 354), staff 3, x 522 |
| ter | f/hvhf/gvFE | f | - | not read; near p. leaf 354 (leaf 354), staff 3, x 699 |
| ter | f/hvhf/gvFE | e | - | not read; near p. leaf 354 (leaf 354), staff 3, x 804 |
| ne | fe!fw!gvFEf | f | - | not read; near p. leaf 354 (leaf 354), staff 3, x 1113 |
| et | g!hi~ | i | - | not read; near p. leaf 354 (leaf 354), staff 4, x 228 |
| quem | fc~ | c | - | not read; near p. leaf 354 (leaf 354), staff 4, x 1235 |
| tan | fe~ | e | - | not read; near p. leaf 354 (leaf 354), staff 4, x 1424 |
| ten | fe~ | e | - | not read; near p. leaf 354 (leaf 354), staff 5, x 503 |
| in | fe~ | e | - | not read; near p. leaf 354 (leaf 354), staff 6, x 492 |
| cul | hg~ | g | - | not read; near p. leaf 354 (leaf 354), staff 6, x 624 |
| in | hg~ | g | - | not read; near p. leaf 354 (leaf 354), staff 6, x 906 |
| e | fgFE | f | - | not read; near p. leaf 354 (leaf 354), staff 6, x 1131 |
| e | fgFE | e | - | not read; near p. leaf 354 (leaf 354), staff 6, x 1235 |
| per | fc~ | c | - | not read; near p. leaf 354 (leaf 354), staff 6, x 1431 |
| dít | fg~ | g | - | not read; near p. leaf 354 (leaf 354), staff 6, x 1544 |
| om | fgFE | f | - | not read; near p. leaf 354 (leaf 354), staff 7, x 201 |
| om | fgFE | e | - | not read; near p. leaf 354 (leaf 354), staff 7, x 305 |
| et | fhf!gw!h!gh~ | h | - | not read; near p. leaf 354 (leaf 354), staff 7, x 1195 |
| car | hhg~ | h | - | not read; near p. leaf 354 (leaf 354), staff 7, x 1495 |
| nem | ih~ | i | - | not read; near p. leaf 354 (leaf 354), staff 8, x 157 |
| quo |  | - | i | p. leaf 354 (leaf 354), staff 8, x 210 |
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
| et | fc~ | c | - | not read; near p. leaf 421 (leaf 421), staff 6, x 1416 |
| me | gf | f | - | not read; near p. leaf 421 (leaf 421), staff 6, x 1746 |
| os | f | f | - | not read; near p. leaf 421 (leaf 421), staff 6, x 1746 |
| ad | f | f | - | not read; near p. leaf 421 (leaf 421), staff 6, x 1765 |
| bel | ff/gf/hgh | f | - | not read; near p. leaf 421 (leaf 421), staff 7, x 595 |
| ? | hg/hvFD/gfffvEC//ggf/ghddc/da | f | - | not read; near p. leaf 421 (leaf 421), staff 7, x 905 |
| ? | hg/hvFD/gfffvEC//ggf/ghddc/da | f | - | not read; near p. leaf 421 (leaf 421), staff 7, x 992 |
| ? | hg/hvFD/gfffvEC//ggf/ghddc/da | f | - | not read; near p. leaf 421 (leaf 421), staff 7, x 992 |
| ? | hg/hvFD/gfffvEC//ggf/ghddc/da | f | - | not read; near p. leaf 421 (leaf 421), staff 7, x 1095 |
| ? | hg/hvFD/gfffvEC//ggf/ghddc/da | c | - | not read; near p. leaf 421 (leaf 421), staff 7, x 1095 |
| ? | hg/hvFD/gfffvEC//ggf/ghddc/da | f | - | not read; near p. leaf 421 (leaf 421), staff 7, x 1190 |
| ? | cd!fvvDCd!ff/gff/ded | f | - | not read; near p. leaf 421 (leaf 421), staff 7, x 1445 |

## GregoBase 3426 (off-final ending)

corpus/gregobase-1908/3426.gabc, 160 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g f/f g/g h/h f/f; GABC notes covered 1-160 of 160.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| can | fi~ | i | - | not read; near p. leaf 425 (leaf 425), staff 3, x 326 |
| cór | fih/ihhe~ | e | - | not read; near p. leaf 425 (leaf 425), staff 4, x 1734 |

## GregoBase 3403 (off-final ending)

corpus/gregobase-1908/3403.gabc, 115 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f e/e f/f e/e d/d e/e; GABC notes covered 1-115 of 115.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| ha | hi!jvIHi | i | - | not read; near p. leaf 513 (leaf 513), staff 4, x 1555 |
| su | ef/hfh | h | g | p. leaf 513 (leaf 513), staff 5, x 1693 |

## GregoBase 3453 (off-final ending)

corpus/gregobase-1908/3453.gabc, 142 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g h/h i/i g/g h/h; GABC notes covered 3-142 of 142.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| sánc | gj~ | j | - | not read; near p. leaf 538 (leaf 538), staff 2, x 563 |
| ma | gf~ | f | - | not read; near p. leaf 538 (leaf 538), staff 2, x 943 |
| a | gh!iw!jvIHijgg/efe | h | - | not read; near p. leaf 538 (leaf 538), staff 2, x 1348 |
| a | gh!iw!jvIHijgg/efe | i | - | not read; near p. leaf 538 (leaf 538), staff 2, x 1385 |
| a | gh!iw!jvIHijgg/efe | i | - | not read; near p. leaf 538 (leaf 538), staff 2, x 1385 |
| in | ef~ | f | - | not read; near p. leaf 538 (leaf 538), staff 3, x 185 |
| sanc | ef~ | f | - | not read; near p. leaf 538 (leaf 538), staff 3, x 280 |
| e | fgFE | f | - | not read; near p. leaf 538 (leaf 538), staff 3, x 868 |
| e | fgFE | e | - | not read; near p. leaf 538 (leaf 538), staff 3, x 972 |
| can | ig~ | g | - | not read; near p. leaf 538 (leaf 538), staff 4, x 641 |

## GregoBase 3418 (off-final ending)

corpus/gregobase-1908/3418.gabc, 168 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f f/f d/d c/c d/d f/·; GABC notes covered 1-167 of 168.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| o | hg~ | g | - | not read; near p. leaf 580 (leaf 580), staff 1, x 626 |
| mi | ixhg!hwihi | h | - | not read; near p. leaf 580 (leaf 580), staff 1, x 1031 |
| em | fg~ | g | - | not read; near p. leaf 580 (leaf 580), staff 1, x 1352 |
| brán | dg~ | g | - | not read; near p. leaf 580 (leaf 580), staff 2, x 311 |
| de | fg | f | - | not read; near p. leaf 580 (leaf 580), staff 2, x 1495 |
| cu | fg | f | - | not read; near p. leaf 580 (leaf 580), staff 3, x 153 |
| láu | g/hjHG | h | - | not read; near p. leaf 580 (leaf 580), staff 3, x 1513 |
| láu | g/hjHG | g | - | not read; near p. leaf 580 (leaf 580), staff 4, x 154 |
| De | d!ewfef | f | - | not read; near p. leaf 580 (leaf 580), staff 4, x 703 |
| sul | gh | h | - | not read; near p. leaf 580 (leaf 580), staff 4, x 996 |
| no: | gh | h | - | not read; near p. leaf 580 (leaf 580), staff 4, x 1562 |
| re | gf | f | - | not read; near p. leaf 580 (leaf 580), staff 5, x 155 |
| ri | gh | h | - | not read; near p. leaf 580 (leaf 580), staff 5, x 988 |
| a | h | h | - | not read; near p. leaf 580 (leaf 580), staff 5, x 988 |
| Pa | h | h | - | not read; near p. leaf 580 (leaf 580), staff 5, x 1049 |
| u | f | f | - | not read; near p. leaf 580 (leaf 580), staff 5, x 1309 |

## GregoBase 3429 (off-final ending)

corpus/gregobase-1908/3429.gabc, 287 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g f/f g/g h/h f/f; GABC notes covered 78-287 of 287.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| a | fhFEfhhf//hvvGFheed | h | - | not read; near p. 82* (leaf 873), staff 1, x 1716 |
| a | fhFEfhhf//hvvGFheed | f | - | not read; near p. 82* (leaf 873), staff 2, x 275 |
| la |  | - | h | p. 82* (leaf 873), staff 5, x 1050 |
