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
| GregoBase 3461 (Quemadmodum) | Graduale Romanum, Vatican 1908 | leaf 469, leaf 470, 445, leaf 472 | 1032 | 225 | 0 | 0 | 1 | 100.0% of 225 GABC notes | 200 of 200 |
| GregoBase 3500 (Qui operatus est) | Graduale Romanum, Vatican 1908 | leaf 392, leaf 393, 368, leaf 395 | 985 | 310 | 0 | 2 | 0 | 99.4% of 312 GABC notes | 200 of 200 |
| GregoBase 3506 (Suscepimus Deus) | Graduale Romanum, Vatican 1908 | leaf 402, leaf 403, 378, leaf 405 | 1136 | 238 | 1 | 2 | 0 | 98.8% of 241 GABC notes | 200 of 200 |
| GregoBase 3522 (Gloria et honore) | Graduale Romanum, Vatican 1908 | leaf 589, leaf 590, [6], leaf 592 | 1223 | 200 | 0 | 5 | 1 | 97.6% of 205 GABC notes | 198 of 200 |
| GregoBase 3524 (Gloriosus Deus) | Graduale Romanum, Vatican 1908 | leaf 603, leaf 604, [20], leaf 606 | 1262 | 359 | 0 | 9 | 2 | 97.6% of 368 GABC notes | 199 of 200 |
| GregoBase 3551 (Electi mei) | Graduale Romanum, Vatican 1908 | leaf 408, leaf 409, 384, leaf 411 | 930 | 237 | 0 | 5 | 0 | 97.9% of 242 GABC notes | 200 of 200 |
| GregoBase 3562 (Unam petii... Ut... visitem) | Graduale Romanum, Vatican 1908 | leaf 700, leaf 701, [117], leaf 703 | 593 | 191 | 0 | 0 | 1 | 100.0% of 191 GABC notes | 197 of 200 |
| GregoBase 3566 (Angelus Domini Raphael (Grad.)) | Graduale Romanum, Vatican 1908 | leaf 777, leaf 778, [194], leaf 780 | 1112 | 158 | 0 | 1 | 1 | 99.4% of 159 GABC notes | 199 of 200 |
| GregoBase 3567 (Dabo te) | Graduale Romanum, Vatican 1908 | leaf 722, leaf 723, [139], leaf 725 | 1079 | 246 | 0 | 17 | 2 | 93.5% of 263 GABC notes | 193 of 200 |
| GregoBase 3619 (Benedicta es tu (Grad.)) | Graduale Romanum, Vatican 1908 | leaf 371, leaf 372, 347, leaf 374 | 1262 | 228 | 0 | 8 | 0 | 96.6% of 236 GABC notes | 199 of 200 |
| GregoBase 3679 (Repleta est) | Graduale Romanum, Vatican 1908 | leaf 719, leaf 720, [136], leaf 722 | 1099 | 236 | 1 | 4 | 0 | 97.9% of 241 GABC notes | 200 of 200 |
| GregoBase 3706 (Propter fratres meos) | Graduale Romanum, Vatican 1908 | leaf 761, leaf 762, [178], leaf 764 | 980 | 212 | 0 | 3 | 0 | 98.6% of 215 GABC notes | 197 of 200 |
| GregoBase 3762 (Beatus vir cujus) | Graduale Romanum, Vatican 1908 | leaf 736, leaf 737, [153], leaf 739 | 1171 | 234 | 0 | 5 | 0 | 97.9% of 239 GABC notes | 199 of 200 |
| GregoBase 3775 (Domine spes mea) | Graduale Romanum, Vatican 1908 | leaf 483, leaf 484, 459, leaf 486 | 913 | 232 | 0 | 0 | 0 | 100.0% of 232 GABC notes | 200 of 200 |

## GregoBase 3461 (Quemadmodum)

corpus/gregobase-1908-clef/3461.gabc, 225 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h f/f e/e g/g f/f d/d; GABC notes covered 1-225 of 225.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| vum. |  | - | i | p. leaf 470 (leaf 470), staff 8, x 480 |

## GregoBase 3500 (Qui operatus est)

corpus/gregobase-1908-clef/3500.gabc, 312 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f e/e f/f e/e e/e d/d; GABC notes covered 1-312 of 312.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| De | jj/kj//lvKJ/jvIH | i | - | not read; near p. leaf 393 (leaf 393), staff 4, x 531 |
| De | ih/ghf//hiHG//hiFD , f!hh/ih/ghf//hiHG//hiFD , gxfge!fwg/hf//hg/hvFD , fdfED//fd/ef!hhhf//hi!kkkJIHi | d | - | not read; near p. leaf 393 (leaf 393), staff 5, x 1775 |

## GregoBase 3506 (Suscepimus Deus)

corpus/gregobase-1908-clef/3506.gabc, 241 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f e/e f/f e/e e/e d/d; GABC notes covered 1-241 of 241.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| tu | fffvDC/dff/hghf | f | - | not read; near p. leaf 403 (leaf 403), staff 3, x 1741 |
| au | fe~ | e | c | p. leaf 403 (leaf 403), staff 6, x 1297 |
| mus | hf!gwh!iv//hi/jhh/iih | g | - | not read; near p. leaf 403 (leaf 403), staff 7, x 1425 |

## GregoBase 3522 (Gloria et honore)

corpus/gregobase-1908-clef/3522.gabc, 205 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h f/f e/e g/g f/f d/d; GABC notes covered 1-205 of 205.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| A |  | - | a | p. [6] (leaf 591), staff 6, x 766 |
| A | fv//eg!hv//fg!hvFEDef!gvgf | e | - | not read; near p. [6] (leaf 591), staff 6, x 900 |
| nó | ii//iiivGFgi!jvIHi | i | - | not read; near p. [6] (leaf 591), staff 6, x 1641 |
| um. | g/hiGF/iyhgh/fh/ji/jh,ixiv//hig//ih/ivGFg | h | - | not read; near p. [6] (leaf 591), staff 7, x 1473 |
| um. | g/hiGF/iyhgh/fh/ji/jh,ixiv//hig//ih/ivGFg | g | - | not read; near p. [6] (leaf 591), staff 7, x 1747 |
| e | h/ih/i!jwkk | j | - | not read; near p. [6] (leaf 591), staff 9, x 406 |

## GregoBase 3524 (Gloriosus Deus)

corpus/gregobase-1908-clef/3524.gabc, 368 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f e/e d/d e/e f/f d/d; GABC notes covered 1-368 of 368.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| sanc | hv//g!ijHGFg | g | - | not read; near p. [20] (leaf 605), staff 5, x 1595 |
| ? | ef!hhhvGFgf!gwhhvGFhf/gffe | f | - | not read; near p. [20] (leaf 605), staff 6, x 376 |
| mi | f!gw!hi | h | - | not read; near p. [20] (leaf 605), staff 6, x 919 |
| ? |  | - | k | p. [20] (leaf 605), staff 8, x 803 |
| vir | ghg~ | h | - | not read; near p. [20] (leaf 605), staff 9, x 1738 |
| tú |  | - | h | p. [20] (leaf 605), staff 9, x 1757 |
| tú | hf/gh!jv//ijh,ixjjvHG/hiGF//ghFD/fv//e!gwhgh | g | - | not read; near p. leaf 606 (leaf 606), staff 1, x 477 |
| tú | hf/gh!jv//ijh,ixjjvHG/hiGF//ghFD/fv//e!gwhgh | g | - | not read; near p. leaf 606 (leaf 606), staff 1, x 731 |
| tú | hf/gh!jv//ijh,ixjjvHGhiGF,hf/gh!jjvHGh | h | - | not read; near p. leaf 606 (leaf 606), staff 1, x 1562 |
| tú | hf/gh!jv//ijh,ixjjvHGhiGF,hf/gh!jjvHGh | h | - | not read; near p. leaf 606 (leaf 606), staff 2, x 196 |
| tú | hf/gh!jv//ijh,ixjjvHGhiGF,hf/gh!jjvHGh | g | - | not read; near p. leaf 606 (leaf 606), staff 2, x 544 |

## GregoBase 3551 (Electi mei)

corpus/gregobase-1908-clef/3551.gabc, 242 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f e/e f/f e/e e/e d/d; GABC notes covered 1-242 of 242.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| cum | ixhjHG/hw!ivHG | h | - | not read; near p. leaf 409 (leaf 409), staff 9, x 406 |
| ? | fg!hvGFe!gh//fhg/hggf | h | - | not read; near p. leaf 409 (leaf 409), staff 9, x 925 |
| só | ig/hvFE//f!gwhhi | e | - | not read; near p. leaf 409 (leaf 409), staff 9, x 1661 |
| rum | gxdf//ef!hvFE/fw!gvFE | f | - | not read; near p. 384 (leaf 410), staff 2, x 201 |
| ra | ehgh | h | - | not read; near p. 384 (leaf 410), staff 2, x 1470 |

## GregoBase 3562 (Unam petii... Ut... visitem)

corpus/gregobase-1908-clef/3562.gabc, 225 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f e/e f/f e/e e/e d/d; GABC notes covered 35-225 of 225.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| am |  | - | g | p. [117] (leaf 702), staff 5, x 547 |

## GregoBase 3566 (Angelus Domini Raphael (Grad.))

corpus/gregobase-1908-clef/3566.gabc, 176 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/· f/· e/· g/· f/· d/·; GABC notes covered 1-159 of 176.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| nem. |  | - | j | p. [194] (leaf 779), staff 2, x 1679 |
| ster, | hf!gwh!iv//hi/jhh/iih | g | - | not read; near p. [194] (leaf 779), staff 4, x 748 |

## GregoBase 3567 (Dabo te)

corpus/gregobase-1908-clef/3567.gabc, 263 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h f/f e/e g/g f/f d/d; GABC notes covered 1-263 of 263.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| li, | fv//ff/gvDC//fg/hg/hvGFgf | c | - | not read; near p. [139] (leaf 724), staff 5, x 328 |
| li, | fv//ff/gvDC//fg/hg/hvGFgf | g | - | not read; near p. [139] (leaf 724), staff 5, x 460 |
| bunt | kjjvIH | i | - | not read; near p. [139] (leaf 724), staff 5, x 1017 |
| bunt | kjjvIH | h | - | not read; near p. [139] (leaf 724), staff 5, x 1140 |
| tu |  | - | i | p. [139] (leaf 724), staff 5, x 1598 |
| de | hg/h!iwj/kj | i | - | not read; near p. [139] (leaf 724), staff 6, x 1029 |
| de | hg/h!iwj/kj | j | - | not read; near p. [139] (leaf 724), staff 6, x 1076 |
| có | ji/k!lwmk | l | - | not read; near p. [139] (leaf 724), staff 6, x 1198 |
| gre | h!iwj | i | - | not read; near p. [139] (leaf 724), staff 7, x 518 |
| gre | h!iwj | j | - | not read; near p. [139] (leaf 724), staff 7, x 540 |
| que. | ixf/hiGF/gwhg/hjhh/fgf | h | - | not read; near p. [139] (leaf 724), staff 8, x 210 |
| que. | ixf/hiGF/gwhg/hjhh/fgf | g | - | not read; near p. [139] (leaf 724), staff 8, x 295 |
| o | hg/i!jwk | j | - | not read; near p. [139] (leaf 724), staff 8, x 1522 |
| me | ih | i | - | not read; near p. [139] (leaf 724), staff 8, x 1543 |
| me | ih | h | - | not read; near p. [139] (leaf 724), staff 8, x 1549 |
| a |  | - | i | p. [139] (leaf 724), staff 9, x 211 |
| te, | hf!gwh!iv//hi/jhh/iih | g | - | not read; near p. [139] (leaf 724), staff 9, x 543 |
| te, | hf!gwh!iv//hi/jhh/iih | h | - | not read; near p. [139] (leaf 724), staff 9, x 580 |
| é | hh//hh/jvIG/hvFE/f!hh/ivHG | h | - | not read; near p. [139] (leaf 724), staff 9, x 1383 |

## GregoBase 3619 (Benedicta es tu (Grad.))

corpus/gregobase-1908-clef/3619.gabc, 236 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h f/f f/f d/d e/e d/d; GABC notes covered 1-236 of 236.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| óm | ixi!jwk | j | - | not read; near p. leaf 372 (leaf 372), staff 4, x 1381 |
| ri | ih | i | - | not read; near p. leaf 372 (leaf 372), staff 5, x 334 |
| gló | hvvGFhvGEffgxde!fgFEfvEDe,fh/ih/ih/ijh | f | - | not read; near p. leaf 372 (leaf 372), staff 5, x 1579 |
| tí | hi!jwk | j | - | not read; near p. leaf 372 (leaf 372), staff 7, x 191 |
| Is | gxfgFE//fgFD//fvEDed | f | - | not read; near p. leaf 372 (leaf 372), staff 7, x 456 |
| pu | ef | e | - | not read; near p. leaf 372 (leaf 372), staff 8, x 190 |
| pu | ef | f | - | not read; near p. leaf 372 (leaf 372), staff 8, x 305 |
| * nos | ef!gwh | g | - | not read; near p. leaf 372 (leaf 372), staff 8, x 476 |

## GregoBase 3679 (Repleta est)

corpus/gregobase-1908-clef/3679.gabc, 241 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): g/g f/f f/f d/d e/e d/d; GABC notes covered 1-241 of 241.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| má | fg!hvGFgvFEfgfg | g | - | not read; near p. [136] (leaf 721), staff 3, x 1572 |
| sum | ixgig!hwiivHGhg | h | - | not read; near p. [136] (leaf 721), staff 4, x 496 |
| sum | ixgig!hwiivHGhg | g | - | not read; near p. [136] (leaf 721), staff 4, x 571 |
| la | hvGF//ef/ge/gffffvDCecd | g | - | not read; near p. [136] (leaf 721), staff 4, x 1288 |
| tó | ixgh/jhiGFh!jjvHGh | j | i | p. [136] (leaf 721), staff 6, x 709 |

## GregoBase 3706 (Propter fratres meos)

corpus/gregobase-1908-clef/3706.gabc, 215 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h f/f e/e g/g f/f d/d; GABC notes covered 1-215 of 215.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| me | h!iwj | i | - | not read; near p. [178] (leaf 763), staff 6, x 1664 |
| ? | hg/ijh jvIHjvIH//hvGF | g | - | not read; near p. [178] (leaf 763), staff 8, x 1501 |
| lí | ih//ghGF//ih//hhhvFE/fe/f!hh/ivHGh | g | - | not read; near p. leaf 764 (leaf 764), staff 1, x 377 |

## GregoBase 3762 (Beatus vir cujus)

corpus/gregobase-1908-clef/3762.gabc, 239 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h f/f e/e g/g f/f d/d; GABC notes covered 1-239 of 239.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| e | hg/jh!iwj | i | - | not read; near p. leaf 739 (leaf 739), staff 1, x 439 |
| sas. | fffvDC | c | - | not read; near p. leaf 739 (leaf 739), staff 2, x 977 |
| cus | fef | f | - | not read; near p. leaf 739 (leaf 739), staff 3, x 786 |
| pau | hvGF | g | - | not read; near p. leaf 739 (leaf 739), staff 3, x 1145 |
| pau | hvGF | f | - | not read; near p. leaf 739 (leaf 739), staff 3, x 1251 |

## GregoBase 3775 (Domine spes mea)

corpus/gregobase-1908-clef/3775.gabc, 232 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h f/f e/e g/g f/f d/d; GABC notes covered 1-232 of 232.

No disagreement among the notes the reader found.
