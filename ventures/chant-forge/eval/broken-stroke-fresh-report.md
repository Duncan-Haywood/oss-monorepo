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
| GregoBase 3464 (Intret in conspectu) | Graduale Romanum, Vatican 1908 | leaf 602, leaf 603, [19], leaf 605 | 1138 | 184 | 1 | 1 | 0 | 98.9% of 186 GABC notes | 0 of 0 |
| GregoBase 3465 (Nimis honorati sunt (All.)) | Graduale Romanum, Vatican 1908 | leaf 572, leaf 573, 548, leaf 575 | 689 | 180 | 0 | 3 | 1 | 98.4% of 183 GABC notes | 0 of 0 |
| GregoBase 3467 (Deus qui praecinxit me) | Graduale Romanum, Vatican 1908 | leaf 418, leaf 419, 394, leaf 421 | 1180 | 269 | 0 | 0 | 2 | 100.0% of 269 GABC notes | 0 of 0 |
| GregoBase 3468 (Liberasti nos) | Graduale Romanum, Vatican 1908 | leaf 357, leaf 358, 333, leaf 360 | 1059 | 175 | 0 | 2 | 0 | 98.9% of 177 GABC notes | 0 of 0 |
| GregoBase 3469 (Si iniquitates (Intr)) | Graduale Romanum, Vatican 1908 | leaf 354, leaf 355, 330, leaf 357 | 1186 | 141 | 0 | 2 | 1 | 98.6% of 143 GABC notes | 0 of 0 |
| GregoBase 3470 (Surge Domine) | Graduale Romanum, Vatican 1908 | leaf 676, leaf 677, [93], leaf 679 | 1120 | 273 | 0 | 10 | 1 | 96.5% of 283 GABC notes | 0 of 0 |
| GregoBase 3471 (De profundis) | Graduale Romanum, Vatican 1908 | leaf 358, leaf 359, 334, leaf 361 | 901 | 141 | 0 | 2 | 0 | 98.6% of 143 GABC notes | 0 of 0 |
| GregoBase 3472 (Candor est) | Graduale Romanum, Vatican 1908 | leaf 531, leaf 532, 507, leaf 534 | 784 | 207 | 0 | 4 | 0 | 98.1% of 211 GABC notes | 0 of 0 |
| GregoBase 3473 (Os justi) | Graduale Romanum, Vatican 1908 | leaf 618, leaf 619, [35], leaf 621 | 1351 | 258 | 0 | 2 | 1 | 99.2% of 260 GABC notes | 0 of 0 |
| GregoBase 3474 (Sancte Michael) | Graduale Romanum, Vatican 1908 | leaf 561, leaf 562, 537, leaf 564 | 1222 | 160 | 0 | 10 | 0 | 94.1% of 170 GABC notes | 0 of 0 |
| GregoBase 3477 (Beatus vir sanctus Martinus) | Graduale Romanum, Vatican 1908 | leaf 578, leaf 579, 554, leaf 581 | 463 | 216 | 0 | 7 | 0 | 96.9% of 223 GABC notes | 0 of 0 |
| GregoBase 3478 (Benedicite Dominum) | Graduale Romanum, Vatican 1908 | leaf 559, leaf 560, 535, leaf 562 | 761 | 153 | 0 | 5 | 1 | 96.8% of 158 GABC notes | 0 of 0 |
| GregoBase 3480 (Magnus sanctus Paulus) | Graduale Romanum, Vatican 1908 | leaf 392, leaf 393, 368, leaf 395 | 985 | 168 | 0 | 4 | 0 | 97.7% of 172 GABC notes | 0 of 0 |
| GregoBase 3481 (Juravit Dominus) | Graduale Romanum, Vatican 1908 | leaf 616, leaf 617, [33], leaf 619 | 1139 | 219 | 1 | 5 | 0 | 97.3% of 225 GABC notes | 0 of 0 |
| GregoBase 3482 (Amen dico vobis quod vos) | Graduale Romanum, Vatican 1908 | leaf 625, leaf 626, [42], leaf 628 | 1142 | 125 | 0 | 3 | 0 | 97.7% of 128 GABC notes | 0 of 0 |

## GregoBase 3464 (Intret in conspectu)

corpus/gregobase-1908-stroke/3464.gabc, 186 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): g/g f/f g/g h/h g/g e/e; GABC notes covered 1-186 of 186.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| tó | egFE | e | - | not read; near p. [19] (leaf 604), staff 5, x 387 |
| sanc | fd~ | d | e | p. [19] (leaf 604), staff 6, x 1289 |

## GregoBase 3465 (Nimis honorati sunt (All.))

corpus/gregobase-1908-stroke/3465.gabc, 183 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): e/e f/f g/g f/f f/f e/e; GABC notes covered 1-183 of 183.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| rá | gh!ivvHFhfg | h | - | not read; near p. leaf 573 (leaf 573), staff 2, x 491 |
| prin | fd~ | f | - | not read; near p. 548 (leaf 574), staff 2, x 234 |
| ci |  | - | f | p. 548 (leaf 574), staff 2, x 386 |
| ? | gxhhvFEfgED//gyhhvFEfgffe | e | - | not read; near p. 548 (leaf 574), staff 3, x 233 |

## GregoBase 3467 (Deus qui praecinxit me)

corpus/gregobase-1908-stroke/3467.gabc, 269 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h f/f g/g f/f f/f e/e; GABC notes covered 1-269 of 269.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| ? |  | - | g | p. leaf 419 (leaf 419), staff 6, x 1387 |
| ? |  | - | g | p. leaf 419 (leaf 419), staff 9, x 861 |

## GregoBase 3468 (Liberasti nos)

corpus/gregobase-1908-stroke/3468.gabc, 256 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/· d/· c/· e/· d/· c/·; GABC notes covered 1-177 of 256.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| De | gv///fg!hvFD/gvFEC/d//ffd/evDC/dvCBc , ff//fffc/dfDB/dfDBc , ffg/iiivGFE/ghGFE/fg | f | - | not read; near p. leaf 358 (leaf 358), staff 8, x 1270 |
| De | gv///fg!hvFD/gvFEC/d//ffd/evDC/dvCBc , ff//fffc/dfDB/dfDBc , ffg/iiivGFE/ghGFE/fg | c | - | not read; near p. leaf 358 (leaf 358), staff 8, x 1411 |

## GregoBase 3469 (Si iniquitates (Intr))

corpus/gregobase-1908-stroke/3469.gabc, 143 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g h/h i/i g/g h/h; GABC notes covered 1-143 of 143.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| mi | hkJIj | i | - | not read; near p. leaf 355 (leaf 355), staff 4, x 1487 |
| pro |  | - | i | p. leaf 355 (leaf 355), staff 5, x 1418 |
| us | g/jjh/ig!hw!ivHG | g | - | not read; near p. leaf 355 (leaf 355), staff 6, x 1005 |

## GregoBase 3470 (Surge Domine)

corpus/gregobase-1908-stroke/3470.gabc, 283 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): i/i h/h i/i h/h h/h g/g; GABC notes covered 1-283 of 283.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| ca | ghhg/hhg//hjjhj | h | - | not read; near p. [93] (leaf 678), staff 5, x 840 |
| sanc | gh | h | - | not read; near p. [93] (leaf 678), staff 5, x 1171 |
| tu | jhhg | g | - | not read; near p. [93] (leaf 678), staff 6, x 1335 |
| i | gh | h | - | not read; near p. [93] (leaf 678), staff 6, x 1352 |
| ex | gh/jij | j | - | not read; near p. [93] (leaf 678), staff 8, x 351 |
| vum | kij | i | - | not read; near p. [93] (leaf 678), staff 8, x 1373 |
| tu |  | - | i | p. [93] (leaf 678), staff 8, x 1415 |
| non | gh | h | - | not read; near p. [93] (leaf 678), staff 9, x 683 |
| vér | gh~ | h | - | not read; near p. [93] (leaf 678), staff 9, x 815 |
| ci | ghGF | h | - | not read; near p. [93] (leaf 678), staff 9, x 1081 |
| Chri | fh!iwj!kv | i | - | not read; near p. [93] (leaf 678), staff 9, x 1391 |

## GregoBase 3471 (De profundis)

corpus/gregobase-1908-stroke/3471.gabc, 143 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f f/f f/f g/g f/f f/f; GABC notes covered 1-143 of 143.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| dis | fef | f | - | not read; near p. 334 (leaf 360), staff 1, x 1356 |
| dis | fef | e | - | not read; near p. 334 (leaf 360), staff 1, x 1452 |

## GregoBase 3472 (Candor est)

corpus/gregobase-1908-stroke/3472.gabc, 211 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): g/g f/f e/e f/f f/f e/e; GABC notes covered 1-211 of 211.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| LÚ | df!hvGFhh | g | - | not read; near p. leaf 532 (leaf 532), staff 5, x 547 |
| ? | h/ig/hvFEDCB//ef!gwhhvGFE/ffe | g | - | not read; near p. leaf 532 (leaf 532), staff 5, x 1373 |
| tá | fhvGFED//fgffe | g | - | not read; near p. leaf 532 (leaf 532), staff 8, x 765 |
| ? | highvFEDCB//ef!gwhhvGFE/ffe | g | - | not read; near p. leaf 532 (leaf 532), staff 9, x 748 |

## GregoBase 3473 (Os justi)

corpus/gregobase-1908-stroke/3473.gabc, 260 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): e/e c/c d/d e/e f/f d/d; GABC notes covered 1-260 of 260.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| cor |  | - | g | p. [35] (leaf 620), staff 6, x 1165 |
| bún | gffvED | e | - | not read; near p. [35] (leaf 620), staff 8, x 247 |
| bún | gffvED | d | - | not read; near p. [35] (leaf 620), staff 8, x 351 |

## GregoBase 3474 (Sancte Michael)

corpus/gregobase-1908-stroke/3474.gabc, 170 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): g/g j/j i/i h/h h/h g/g; GABC notes covered 1-170 of 170.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| ij. | df!ghhgjvIHG | i | - | not read; near p. leaf 562 (leaf 562), staff 4, x 746 |
| ? | giihkvJIHGivHGFgh//fefd | i | - | not read; near p. leaf 562 (leaf 562), staff 4, x 994 |
| ? | giihkvJIHGivHGFgh//fefd | g | - | not read; near p. leaf 562 (leaf 562), staff 4, x 1032 |
| ge | h/jkJHGFg | h | - | not read; near p. leaf 562 (leaf 562), staff 5, x 862 |
| á | ih!iw!jvIHG | i | - | not read; near p. leaf 562 (leaf 562), staff 6, x 917 |
| á | ih!iw!jvIHG | i | - | not read; near p. leaf 562 (leaf 562), staff 6, x 953 |
| á | ih!iw!jvIHG | g | - | not read; near p. leaf 562 (leaf 562), staff 6, x 1003 |
| ? | giihkvJIHGivHGFgh//fefd | i | - | not read; near p. leaf 562 (leaf 562), staff 7, x 849 |
| ? | giihkvJIHGivHGFgh//fefd | g | - | not read; near p. leaf 562 (leaf 562), staff 7, x 887 |
| ? | giihkvJIHGivHGFgh//fefd | g | - | not read; near p. leaf 562 (leaf 562), staff 7, x 963 |

## GregoBase 3477 (Beatus vir sanctus Martinus)

corpus/gregobase-1908-stroke/3477.gabc, 223 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f d/d e/e d/d d/d c/c; GABC notes covered 1-223 of 223.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| LÚ | hg/h!iw!jvIH/hg~ | i | - | not read; near p. leaf 579 (leaf 579), staff 1, x 660 |
| LÚ | hg/h!iw!jvIH/hg~ | i | - | not read; near p. leaf 579 (leaf 579), staff 1, x 696 |
| LÚ | hg/h!iw!jvIH/hg~ | h | - | not read; near p. leaf 579 (leaf 579), staff 1, x 774 |
| ? | jvjvjvIHG/ivHG//egFED/evDC | g | - | not read; near p. leaf 579 (leaf 579), staff 1, x 1514 |
| ur | gvFD | f | - | not read; near p. leaf 579 (leaf 579), staff 3, x 358 |
| ur | gvFD | d | - | not read; near p. leaf 579 (leaf 579), staff 3, x 472 |
| sce | h!iwj | i | - | not read; near p. leaf 579 (leaf 579), staff 3, x 1467 |

## GregoBase 3478 (Benedicite Dominum)

corpus/gregobase-1908-stroke/3478.gabc, 158 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g h/h i/i g/g h/h; GABC notes covered 1-158 of 158.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| e | kj~ | j | - | not read; near p. leaf 560 (leaf 560), staff 1, x 1316 |
| e | fgFE | f | - | not read; near p. leaf 560 (leaf 560), staff 3, x 898 |
| e | fgFE | e | - | not read; near p. leaf 560 (leaf 560), staff 3, x 1001 |
| lú | fgFE | f | - | not read; near p. 535 (leaf 561), staff 1, x 580 |
| lú | fgFE | e | - | not read; near p. 535 (leaf 561), staff 1, x 684 |
| Dó |  | - | i | p. 535 (leaf 561), staff 1, x 1425 |

## GregoBase 3480 (Magnus sanctus Paulus)

corpus/gregobase-1908-stroke/3480.gabc, 172 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): g/g e/e f/f g/g h/h f/f; GABC notes covered 1-172 of 172.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| Pau | fe/f!gwh!iv//jiihi | g | - | not read; near p. 368 (leaf 394), staff 1, x 252 |
| lus, | iv//hh/fgf | f | - | not read; near p. 368 (leaf 394), staff 1, x 582 |
| re | ef | f | - | not read; near p. 368 (leaf 394), staff 1, x 1591 |
| fi | ivHGh | g | - | not read; near p. 368 (leaf 394), staff 2, x 1054 |

## GregoBase 3481 (Juravit Dominus)

corpus/gregobase-1908-stroke/3481.gabc, 225 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): e/e d/d c/c e/e f/f d/d; GABC notes covered 1-225 of 225.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| ? | hvGFE/dfED//c!efd | g | m | p. [33] (leaf 618), staff 9, x 200 |
| ? | hvGFE/dfED//c!efd | e | - | not read; near p. [33] (leaf 618), staff 9, x 225 |
| ? | hvGFE/dfED//c!efd | e | - | not read; near p. [33] (leaf 618), staff 9, x 270 |
| cér | egFEed~ | d | - | not read; near p. [33] (leaf 618), staff 10, x 905 |
| tér | egFEed~ | f | - | not read; near p. [33] (leaf 618), staff 10, x 1421 |
| ? | hvGFEdfED//c!efd | g | - | not read; near p. leaf 619 (leaf 619), staff 2, x 1322 |

## GregoBase 3482 (Amen dico vobis quod vos)

corpus/gregobase-1908-stroke/3482.gabc, 130 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): e/e f/f e/e f/f e/e d/d; GABC notes covered 3-130 of 130.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| tér | ghghvGF | g | - | not read; near p. [42] (leaf 627), staff 4, x 901 |
| tér | ghghvGF | f | - | not read; near p. [42] (leaf 627), staff 4, x 1006 |
| nam | gvFEDCd | c | - | not read; near p. [42] (leaf 627), staff 4, x 1072 |
