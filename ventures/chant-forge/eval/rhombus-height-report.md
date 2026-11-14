# Rhombus height floor: before and after

Written by `node eval/rhombus-check.mjs` (reader: `scan.mjs`, `headShape`). Pairs whose GABC note is
a punctum (square) or a rhombus and whose scan head agrees in pitch. "Before" is the rule up to
2026-11-14 (w < 0.42 and taper < 0.8); "after" adds h >= 0.62 staff spaces (RHOMBUS_MIN_H). The sweep also tried a ceiling and dropped it.
"Chosen on" is every piece scanned before the floor was picked (50 pieces); "held out" is the six
pieces in `rhombus-fresh-pages.json`, listed and committed before any of their pages was downloaded.
Why and what the heads look like: `rhombus-height-check.md`.

| set | rhombi paired | read as rhombus, before | after | squares paired | called rhombus, before | after |
|---|---|---|---|---|---|---|
| chosen on | 1033 | 1026 | 1024 | 7501 | 18 | 6 |
| held out | 103 | 103 | 103 | 596 | 1 | 1 |

## Every head the two rules disagree on, and every head still wrong after

| set | piece | syllable | GABC | w | h | fill | taper | before | after | leaf:staff:x |
|---|---|---|---|---|---|---|---|---|---|---|
| chosen on | GregoBase 3434 (off-final ending) | et | punctum | 0.32 | 0.56 | 0.86 | 0.72 | rhombus | square | 354:5:817 |
| chosen on | GregoBase 3433 (Qui gloriatur) | do. | rhombus | 0.53 | 0.56 | 0.95 | 0.90 | square | square | 506:6:1466 |
| chosen on | GregoBase 3412 (Stabat sancta Maria) | BAT | rhombus | 0.53 | 1.19 | 0.56 | 1.49 | square | square | 428:1:342 |
| chosen on | GregoBase 3421 (Narraverunt) | non | punctum | 0.35 | 0.72 | 0.75 | 0.55 | rhombus | rhombus | 434:2:1190 |
| chosen on | GregoBase 3424 (Ambulate) | tá | rhombus | 0.53 | 0.98 | 0.52 | 1.15 | square | square | 445:4:904 |
| chosen on | GregoBase 3447 (Assumpta est) | le | punctum | 0.40 | 0.57 | 0.87 | 0.71 | rhombus | square | 544:6:722 |
| chosen on | GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | gau | punctum | 0.36 | 0.72 | 0.72 | 0.50 | rhombus | rhombus | 742:5:786 |
| chosen on | GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | ge | rhombus | 0.47 | 1.51 | 0.47 | 1.42 | square | square | 742:5:1201 |
| chosen on | GregoBase 3458 (Corona aurea) | ij. | rhombus | 0.35 | 0.60 | 0.84 | 0.73 | rhombus | square | 730:4:988 |
| chosen on | GregoBase 3405 (Adjuvabit eam) | us | punctum | 0.35 | 1.04 | 0.56 | 0.50 | rhombus | rhombus | 635:3:1475 |
| chosen on | GregoBase 3410 (Magnificat) | sul | punctum | 0.37 | 0.61 | 0.85 | 0.74 | rhombus | square | 754:7:282 |
| chosen on | GregoBase 3410 (Magnificat) | tá | punctum | 0.35 | 0.58 | 0.88 | 0.73 | rhombus | square | 754:7:338 |
| chosen on | GregoBase 3410 (Magnificat) | tá | punctum | 0.37 | 0.58 | 0.87 | 0.76 | rhombus | square | 754:7:367 |
| chosen on | GregoBase 3410 (Magnificat) | tá | punctum | 0.40 | 0.61 | 0.85 | 0.73 | rhombus | square | 754:7:643 |
| chosen on | GregoBase 3410 (Magnificat) | tá | punctum | 0.37 | 0.58 | 0.84 | 0.73 | rhombus | square | 754:7:672 |
| chosen on | GregoBase 3410 (Magnificat) | tá | punctum | 0.35 | 0.56 | 0.87 | 0.71 | rhombus | square | 754:7:766 |
| chosen on | GregoBase 3410 (Magnificat) | me | rhombus | 0.32 | 0.56 | 0.84 | 0.76 | rhombus | square | 754:7:1533 |
| chosen on | GregoBase 3413 (Haec est Virgo sapiens et una) | et | punctum | 0.35 | 0.67 | 0.78 | 0.63 | rhombus | rhombus | 636:3:1083 |
| chosen on | GregoBase 3422 (Confiteantur tibi) | no | rhombus | 0.53 | 0.56 | 0.88 | 0.84 | square | square | 790:3:883 |
| chosen on | GregoBase 3430 (In medio Ecclesiae) | e | punctum | 0.37 | 0.61 | 0.84 | 0.71 | rhombus | square | 619:3:1590 |
| chosen on | GregoBase 3430 (In medio Ecclesiae) | ia, | punctum | 0.40 | 0.61 | 0.86 | 0.74 | rhombus | square | 619:6:672 |
| chosen on | GregoBase 3437 (Adhaesi) | a. | rhombus | 0.53 | 0.58 | 0.90 | 0.91 | square | square | 710:2:1332 |
| chosen on | GregoBase 3437 (Adhaesi) | mi | rhombus | 0.42 | 1.24 | 0.59 | 1.64 | square | square | 710:2:1514 |
| chosen on | GregoBase 3451 (Qui ambulat) | qui | punctum | 0.37 | 0.56 | 0.87 | 0.70 | rhombus | square | 747:1:716 |
| chosen on | GregoBase 3451 (Qui ambulat) | é | punctum | 0.34 | 0.58 | 0.83 | 0.69 | rhombus | square | 747:1:791 |
| chosen on | GregoBase 3451 (Qui ambulat) | scet | punctum | 0.34 | 0.71 | 0.79 | 0.65 | rhombus | rhombus | 747:1:1398 |
| chosen on | GregoBase 3451 (Qui ambulat) | mon | punctum | 0.37 | 0.74 | 0.77 | 0.65 | rhombus | rhombus | 747:1:1483 |
| held out | GregoBase 3449 (Quod dico vobis) | mi | punctum | 0.38 | 0.62 | 0.85 | 0.73 | rhombus | rhombus | 613:8:1631 |

## Floor and ceiling sweep on the pieces they were chosen on

| floor | ceiling | rhombi read | squares called rhombus |
|---|---|---|---|
| 0.50 | 0.85 | 992 of 1033 | 17 of 7501 |
| 0.52 | 0.85 | 992 of 1033 | 17 of 7501 |
| 0.54 | 0.85 | 992 of 1033 | 17 of 7501 |
| 0.56 | 0.85 | 991 of 1033 | 15 of 7501 |
| 0.58 | 0.85 | 991 of 1033 | 13 of 7501 |
| 0.60 | 0.85 | 990 of 1033 | 9 of 7501 |
| 0.62 | 0.85 | 990 of 1033 | 5 of 7501 |
| 0.64 | 0.85 | 980 of 1033 | 5 of 7501 |
| 0.66 | 0.85 | 959 of 1033 | 5 of 7501 |
| 0.68 | 0.85 | 863 of 1033 | 4 of 7501 |
| 0.70 | 0.85 | 623 of 1033 | 4 of 7501 |
| 0.72 | 0.85 | 376 of 1033 | 1 of 7501 |
| 0.50 | 0.9 | 1001 of 1033 | 17 of 7501 |
| 0.52 | 0.9 | 1001 of 1033 | 17 of 7501 |
| 0.54 | 0.9 | 1001 of 1033 | 17 of 7501 |
| 0.56 | 0.9 | 1000 of 1033 | 15 of 7501 |
| 0.58 | 0.9 | 1000 of 1033 | 13 of 7501 |
| 0.60 | 0.9 | 999 of 1033 | 9 of 7501 |
| 0.62 | 0.9 | 999 of 1033 | 5 of 7501 |
| 0.64 | 0.9 | 989 of 1033 | 5 of 7501 |
| 0.66 | 0.9 | 968 of 1033 | 5 of 7501 |
| 0.68 | 0.9 | 872 of 1033 | 4 of 7501 |
| 0.70 | 0.9 | 632 of 1033 | 4 of 7501 |
| 0.72 | 0.9 | 385 of 1033 | 1 of 7501 |
| 0.50 | 0.95 | 1010 of 1033 | 17 of 7501 |
| 0.52 | 0.95 | 1010 of 1033 | 17 of 7501 |
| 0.54 | 0.95 | 1010 of 1033 | 17 of 7501 |
| 0.56 | 0.95 | 1009 of 1033 | 15 of 7501 |
| 0.58 | 0.95 | 1009 of 1033 | 13 of 7501 |
| 0.60 | 0.95 | 1008 of 1033 | 9 of 7501 |
| 0.62 | 0.95 | 1008 of 1033 | 5 of 7501 |
| 0.64 | 0.95 | 998 of 1033 | 5 of 7501 |
| 0.66 | 0.95 | 977 of 1033 | 5 of 7501 |
| 0.68 | 0.95 | 881 of 1033 | 4 of 7501 |
| 0.70 | 0.95 | 641 of 1033 | 4 of 7501 |
| 0.72 | 0.95 | 394 of 1033 | 1 of 7501 |
| 0.50 | 1 | 1011 of 1033 | 17 of 7501 |
| 0.52 | 1 | 1011 of 1033 | 17 of 7501 |
| 0.54 | 1 | 1011 of 1033 | 17 of 7501 |
| 0.56 | 1 | 1010 of 1033 | 15 of 7501 |
| 0.58 | 1 | 1010 of 1033 | 13 of 7501 |
| 0.60 | 1 | 1009 of 1033 | 9 of 7501 |
| 0.62 | 1 | 1009 of 1033 | 5 of 7501 |
| 0.64 | 1 | 999 of 1033 | 5 of 7501 |
| 0.66 | 1 | 978 of 1033 | 5 of 7501 |
| 0.68 | 1 | 882 of 1033 | 4 of 7501 |
| 0.70 | 1 | 642 of 1033 | 4 of 7501 |
| 0.72 | 1 | 395 of 1033 | 1 of 7501 |
| 0.50 | Infinity | 1026 of 1033 | 18 of 7501 |
| 0.52 | Infinity | 1026 of 1033 | 18 of 7501 |
| 0.54 | Infinity | 1026 of 1033 | 18 of 7501 |
| 0.56 | Infinity | 1025 of 1033 | 16 of 7501 |
| 0.58 | Infinity | 1025 of 1033 | 14 of 7501 |
| 0.60 | Infinity | 1024 of 1033 | 10 of 7501 |
| 0.62 | Infinity | 1024 of 1033 | 6 of 7501 |
| 0.64 | Infinity | 1014 of 1033 | 6 of 7501 |
| 0.66 | Infinity | 993 of 1033 | 6 of 7501 |
| 0.68 | Infinity | 897 of 1033 | 5 of 7501 |
| 0.70 | Infinity | 657 of 1033 | 5 of 7501 |
| 0.72 | Infinity | 410 of 1033 | 2 of 7501 |

Heights of rhombi the old rule reads (chosen-on set): lowest ten 0.56, 0.60, 0.63, 0.64, 0.64, 0.64, 0.64, 0.64, 0.64, 0.64; highest ten 1.02, 1.03, 1.03, 1.03, 1.04, 1.04, 1.04, 1.04, 1.04, 1.09
Heights of squares the old rule calls rhombi (chosen-on set, all): 0.56, 0.56, 0.56, 0.57, 0.58, 0.58, 0.58, 0.58, 0.61, 0.61, 0.61, 0.61, 0.67, 0.71, 0.72, 0.72, 0.74, 1.04
