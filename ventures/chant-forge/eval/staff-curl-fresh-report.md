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
| GregoBase 3483 (Anima...sicut passer) | Graduale Romanum, Vatican 1908 | leaf 607, leaf 608, [24], leaf 610 | 1256 | 252 | 0 | 1 | 2 | 99.6% of 253 GABC notes | 196 of 200 |
| GregoBase 3533 (Laudate Dominum) | Graduale Romanum, Vatican 1908 | leaf 791, leaf 792, [208], leaf 794 | 940 | 61 | 7 | 6 | 22 | 82.4% of 74 GABC notes | 128 of 200 |
| GregoBase 3545 (Laudate Dominum) | Graduale Romanum, Vatican 1908 | leaf 652, leaf 653, [69], leaf 655 | 1136 | 251 | 0 | 4 | 0 | 98.4% of 255 GABC notes | 199 of 200 |
| GregoBase 3550 (Rogate quae ad pacem) | Graduale Romanum, Vatican 1908 | leaf 678, leaf 679, [95], leaf 681 | 1115 | 188 | 2 | 4 | 0 | 96.9% of 194 GABC notes | 196 of 200 |
| GregoBase 3652 (Judicant sancti) | Graduale Romanum, Vatican 1908 | leaf 573, leaf 574, 549, leaf 576 | 790 | 129 | 1 | 2 | 0 | 97.7% of 132 GABC notes | 199 of 200 |
| GregoBase 3704 (Benedicte Dominum) | Graduale Romanum, Vatican 1908 | leaf 653, leaf 654, [70], leaf 656 | 1226 | 305 | 0 | 2 | 0 | 99.3% of 307 GABC notes | 199 of 200 |
| GregoBase 3718 (Sapientiam sanctorum) | Graduale Romanum, Vatican 1908 | leaf 606, leaf 607, [23], leaf 609 | 1254 | 98 | 1 | 3 | 1 | 96.1% of 102 GABC notes | 192 of 200 |
| GregoBase 3741 (Recordare Virgo) | Graduale Romanum, Vatican 1908 | leaf 624, leaf 625, 600, leaf 627 | 1054 | 46 | 10 | 12 | 7 | 67.6% of 68 GABC notes | 117 of 200 |
| GregoBase 3791 (Ave Rex noster) | Graduale Romanum, Vatican 1908 | leaf 663, leaf 664, [80], leaf 666 | 1262 | 218 | 0 | 1 | 0 | 99.5% of 219 GABC notes | 200 of 200 |
| GregoBase 3797 (In virtute tua) | Graduale Romanum, Vatican 1908 | leaf 624, leaf 625, [41], leaf 627 | 1054 | 140 | 0 | 6 | 1 | 95.9% of 146 GABC notes | 193 of 200 |

## GregoBase 3483 (Anima...sicut passer)

corpus/gregobase-1908-curl/3483.gabc, 253 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h f/f e/e g/g f/f d/d; GABC notes covered 1-253 of 253.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| um. |  | - | h | p. [24] (leaf 609), staff 5, x 1405 |
| trum | h | h | - | not read; near p. [24] (leaf 609), staff 8, x 1287 |
| nó |  | - | h | p. [24] (leaf 609), staff 8, x 1495 |

## GregoBase 3533 (Laudate Dominum)

corpus/gregobase-1908-curl/3533.gabc, 97 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): g/· f/· d/· e/· d/· d/·; GABC notes covered 8-81 of 97.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| o | ef~ | e | - | not read; near p. leaf 792 (leaf 792), staff 4, x 1521 |
| mnes |  | - | g | p. leaf 792 (leaf 792), staff 4, x 1541 |
| tes, | de | d | - | not read; near p. leaf 792 (leaf 792), staff 5, x 221 |
| lau |  | - | f | p. leaf 792 (leaf 792), staff 5, x 448 |
| dá |  | - | e | p. leaf 792 (leaf 792), staff 5, x 510 |
| dá |  | - | e | p. leaf 792 (leaf 792), staff 5, x 563 |
| dá |  | - | e | p. leaf 792 (leaf 792), staff 5, x 658 |
| dá |  | - | g | p. leaf 792 (leaf 792), staff 5, x 676 |
| dá | f!gwh | h | f | p. leaf 792 (leaf 792), staff 5, x 724 |
| e |  | - | h | p. leaf 792 (leaf 792), staff 5, x 799 |
| e |  | - | e | p. leaf 792 (leaf 792), staff 5, x 876 |
| e |  | - | e | p. leaf 792 (leaf 792), staff 5, x 952 |
| e |  | - | e | p. leaf 792 (leaf 792), staff 5, x 980 |
| e |  | - | e | p. leaf 792 (leaf 792), staff 5, x 1132 |
| e |  | - | f | p. leaf 792 (leaf 792), staff 5, x 1133 |
| o | df!gwh | d | e | p. leaf 792 (leaf 792), staff 5, x 1360 |
| o | df!gwh | g | - | not read; near p. leaf 792 (leaf 792), staff 5, x 1454 |
| mnes |  | - | i | p. leaf 792 (leaf 792), staff 6, x 151 |
| mnes | ihhvGE | e | h | p. leaf 792 (leaf 792), staff 6, x 198 |
| pó |  | - | h | p. leaf 792 (leaf 792), staff 6, x 284 |
| pó | fe/fg | f | i | p. leaf 792 (leaf 792), staff 6, x 303 |
| pu |  | - | h | p. leaf 792 (leaf 792), staff 6, x 350 |
| li: |  | - | e | p. leaf 792 (leaf 792), staff 6, x 399 |
| li: |  | - | e | p. leaf 792 (leaf 792), staff 6, x 427 |
| li: |  | - | d | p. leaf 792 (leaf 792), staff 6, x 446 |
| quó |  | - | h | p. leaf 792 (leaf 792), staff 6, x 522 |
| quó |  | - | i | p. leaf 792 (leaf 792), staff 6, x 608 |
| ta | i | i | - | not read; near p. leaf 792 (leaf 792), staff 6, x 892 |
| nos |  | - | g | p. leaf 792 (leaf 792), staff 6, x 1017 |
| nos | fge | e | g | p. leaf 792 (leaf 792), staff 6, x 1122 |
| di | h | h | - | not read; near p. leaf 792 (leaf 792), staff 6, x 1351 |
| a | h | h | i | p. leaf 792 (leaf 792), staff 6, x 1464 |
| e | hjIH | j | - | not read; near p. leaf 792 (leaf 792), staff 6, x 1503 |
| et |  | - | e | p. leaf 792 (leaf 792), staff 6, x 1580 |
| vé | hi | i | g | p. leaf 792 (leaf 792), staff 7, x 171 |

## GregoBase 3545 (Laudate Dominum)

corpus/gregobase-1908-curl/3545.gabc, 255 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): e/e d/d e/e d/d d/d c/c; GABC notes covered 1-255 of 255.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| e | hffef | f | - | not read; near p. [69] (leaf 654), staff 6, x 306 |
| e | hffef | f | - | not read; near p. [69] (leaf 654), staff 6, x 369 |
| tes | gi!jvIH//f!hhvFEfe | e | - | not read; near p. leaf 655 (leaf 655), staff 1, x 1653 |
| e | d!ew!fvEDCd | c | - | not read; near p. leaf 655 (leaf 655), staff 2, x 435 |

## GregoBase 3550 (Rogate quae ad pacem)

corpus/gregobase-1908-curl/3550.gabc, 194 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): c/c d/d e/e d/d d/d c/c; GABC notes covered 1-194 of 194.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| TE | fgFD/gfg//hiHG/gf/ghg | f | - | not read; near p. [95] (leaf 680), staff 7, x 355 |
| pax | jkJG//ihi/ji//hjii/ghg | g | - | not read; near p. leaf 681 (leaf 681), staff 2, x 564 |
| bun | df~ | f | e | p. leaf 681 (leaf 681), staff 3, x 468 |
| dán | fv//dgfgjv//iiih~ | h | i | p. leaf 681 (leaf 681), staff 3, x 784 |
| ri | dgf/gh | h | - | not read; near p. leaf 681 (leaf 681), staff 3, x 1551 |
| bus | gh | h | - | not read; near p. leaf 681 (leaf 681), staff 3, x 1608 |

## GregoBase 3652 (Judicant sancti)

corpus/gregobase-1908-curl/3652.gabc, 132 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f f/f f/f f/f d/d c/c; GABC notes covered 1-132 of 132.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| ctos | fg | f | - | not read; near p. leaf 574 (leaf 574), staff 6, x 1516 |
| lau | h | h | g | p. leaf 574 (leaf 574), staff 7, x 377 |
| u | g!hwi | h | - | not read; near p. leaf 574 (leaf 574), staff 7, x 1248 |

## GregoBase 3704 (Benedicte Dominum)

corpus/gregobase-1908-curl/3704.gabc, 307 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g f/f g/g g/g f/f; GABC notes covered 1-307 of 307.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| e | fe/f!gwh!iv | g | - | not read; near p. leaf 656 (leaf 656), staff 2, x 1384 |
| e | fe/f!gwh!iv | g | - | not read; near p. leaf 656 (leaf 656), staff 5, x 966 |

## GregoBase 3718 (Sapientiam sanctorum)

corpus/gregobase-1908-curl/3718.gabc, 133 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/· g/· f/· f/· g/· h/·; GABC notes covered 1-102 of 133.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| si | hjIH | i | - | not read; near p. [23] (leaf 608), staff 8, x 1000 |
| lum | gvFEf | e | - | not read; near p. leaf 609 (leaf 609), staff 1, x 1291 |
| Ex |  | - | f | p. leaf 609 (leaf 609), staff 1, x 1750 |
| ju | hj | j | - | not read; near p. leaf 609 (leaf 609), staff 3, x 605 |
| Dó | h | h | j | p. leaf 609 (leaf 609), staff 3, x 832 |

## GregoBase 3741 (Recordare Virgo)

corpus/gregobase-1908-curl/3741.gabc, 120 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): e/· f/· e/· f/· e/· d/·; GABC notes covered 1-68 of 120.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| RE | d!ff/ggf/gh | g | e | p. leaf 627 (leaf 627), staff 3, x 309 |
| RE | d!ff/ggf/gh | h | - | not read; near p. leaf 627 (leaf 627), staff 3, x 449 |
| DÁ | gvFECd | g | d | p. leaf 627 (leaf 627), staff 3, x 582 |
| DÁ | gvFECd | f | d | p. leaf 627 (leaf 627), staff 3, x 638 |
| DÁ |  | - | f | p. leaf 627 (leaf 627), staff 3, x 658 |
| DÁ | gvFECd | d | - | not read; near p. leaf 627 (leaf 627), staff 3, x 751 |
| RE, | d | d | - | not read; near p. leaf 627 (leaf 627), staff 3, x 836 |
| Vir | d/ff/ggf/gh | g | e | p. leaf 627 (leaf 627), staff 3, x 968 |
| Vir | d/ff/ggf/gh | f | h | p. leaf 627 (leaf 627), staff 3, x 1062 |
| go | fe | e | - | not read; near p. leaf 627 (leaf 627), staff 3, x 1155 |
| Ma | cd | c | - | not read; near p. leaf 627 (leaf 627), staff 3, x 1155 |
| Ma | cd | d | - | not read; near p. leaf 627 (leaf 627), staff 3, x 1156 |
| ter, | d | d | g | p. leaf 627 (leaf 627), staff 3, x 1156 |
| con |  | - | g | p. leaf 627 (leaf 627), staff 3, x 1250 |
| con |  | - | f | p. leaf 627 (leaf 627), staff 3, x 1297 |
| ctu |  | - | h | p. leaf 627 (leaf 627), staff 3, x 1513 |
| ctu | ge | g | f | p. leaf 627 (leaf 627), staff 3, x 1607 |
| ctu | ge | e | f | p. leaf 627 (leaf 627), staff 3, x 1663 |
| i, |  | - | e | p. leaf 627 (leaf 627), staff 4, x 320 |
| i, | dffff | f | - | not read; near p. leaf 627 (leaf 627), staff 4, x 339 |
| i, | dffff | f | - | not read; near p. leaf 627 (leaf 627), staff 4, x 395 |
| ut | f!hj | j | - | not read; near p. leaf 627 (leaf 627), staff 4, x 523 |
| lo | ji | j | - | not read; near p. leaf 627 (leaf 627), staff 4, x 602 |
| lo | ji | i | h | p. leaf 627 (leaf 627), staff 4, x 602 |
| ris | f!gh | f | e | p. leaf 627 (leaf 627), staff 4, x 781 |
| pro | f | f | - | not read; near p. leaf 627 (leaf 627), staff 4, x 856 |
| bo |  | - | g | p. leaf 627 (leaf 627), staff 4, x 1006 |
| bo | fvECd | c | - | not read; near p. leaf 627 (leaf 627), staff 4, x 1053 |
| ut |  | - | e | p. leaf 627 (leaf 627), staff 4, x 1231 |

## GregoBase 3791 (Ave Rex noster)

corpus/gregobase-1908-curl/3791.gabc, 219 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): c/c e/e d/d e/e f/f d/d; GABC notes covered 1-219 of 219.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| é | fvED | e | - | not read; near p. [80] (leaf 665), staff 7, x 1572 |

## GregoBase 3797 (In virtute tua)

corpus/gregobase-1908-curl/3797.gabc, 149 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/· g/g f/f g/· g/· f/·; GABC notes covered 1-146 of 149.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| mén | deDC | d | - | not read; near p. [41] (leaf 626), staff 7, x 400 |
| mén | deDC | c | - | not read; near p. [41] (leaf 626), staff 7, x 503 |
| e | d!fffvEDevDC | d | - | not read; near p. [41] (leaf 626), staff 7, x 1388 |
| e | d!fffvEDevDC | c | - | not read; near p. [41] (leaf 626), staff 7, x 1492 |
| e | f!gwhgh/jjh//giHGF , fff//fgf/ghg/hf/gf | g | - | not read; near p. [41] (leaf 626), staff 8, x 437 |
| le |  | - | g | p. [41] (leaf 626), staff 8, x 1614 |
| lú | fg!hvGFg | h | - | not read; near p. leaf 627 (leaf 627), staff 1, x 382 |
