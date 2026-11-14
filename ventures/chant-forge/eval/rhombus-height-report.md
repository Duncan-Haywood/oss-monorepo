# Rhombus height floor: before and after

Written by `node eval/rhombus-check.mjs` (reader: `scan.mjs`, `headShape`). Pairs whose GABC note is
a punctum (square) or a rhombus and whose scan head agrees in pitch. "Before" is the rule up to
2026-11-14 (w < 0.42 and taper < 0.8); "after" adds h >= 0.62 staff spaces (RHOMBUS_MIN_H). The sweep also tried a ceiling and dropped it.
"Chosen on" is every piece scanned before the floor was picked (50 pieces); "held out" is the six
pieces in `rhombus-fresh-pages.json`, listed and committed before any of their pages was downloaded.
Why and what the heads look like: `rhombus-height-check.md`.

| set | rhombi paired | read as rhombus, before | after | squares paired | called rhombus, before | after |
|---|---|---|---|---|---|---|
| chosen on | 1092 | 1087 | 1087 | 7919 | 8 | 3 |
| held out | 103 | 103 | 103 | 596 | 1 | 1 |

## Every head the two rules disagree on, and every head still wrong after

| set | piece | syllable | GABC | w | h | fill | taper | before | after | leaf:staff:x |
|---|---|---|---|---|---|---|---|---|---|---|
| chosen on | GregoBase 3434 (off-final ending) | et | punctum | 0.32 | 0.56 | 0.86 | 0.72 | rhombus | square | 354:5:817 |
| chosen on | GregoBase 3429 (off-final ending) | ne: | punctum | 0.32 | 0.56 | 0.85 | 0.74 | rhombus | square | 873:2:679 |
| chosen on | GregoBase 3412 (Stabat sancta Maria) | BAT | rhombus | 0.53 | 1.19 | 0.56 | 1.49 | square | square | 428:1:342 |
| chosen on | GregoBase 3421 (Narraverunt) | non | punctum | 0.35 | 0.72 | 0.75 | 0.55 | rhombus | rhombus | 434:3:1190 |
| chosen on | GregoBase 3447 (Assumpta est) | le | punctum | 0.40 | 0.57 | 0.87 | 0.71 | rhombus | square | 544:6:722 |
| chosen on | GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | gau | punctum | 0.36 | 0.72 | 0.72 | 0.50 | rhombus | rhombus | 742:5:786 |
| chosen on | GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | ge | rhombus | 0.47 | 1.51 | 0.47 | 1.42 | square | square | 742:5:1201 |
| chosen on | GregoBase 3413 (Haec est Virgo sapiens et una) | et | punctum | 0.35 | 0.67 | 0.78 | 0.63 | rhombus | rhombus | 636:3:1083 |
| chosen on | GregoBase 3430 (In medio Ecclesiae) | ia, | punctum | 0.40 | 0.61 | 0.86 | 0.74 | rhombus | square | 619:6:672 |
| chosen on | GregoBase 3437 (Adhaesi) | a. | punctum | 0.39 | 0.61 | 0.91 | 0.79 | rhombus | square | 710:3:157 |
| chosen on | GregoBase 3437 (Adhaesi) | mi | rhombus | 0.50 | 0.55 | 0.97 | 0.94 | square | square | 710:3:785 |
| chosen on | GregoBase 3437 (Adhaesi) | mi | rhombus | 0.47 | 1.53 | 0.39 | 1.23 | square | square | 710:3:928 |
| chosen on | GregoBase 3437 (Adhaesi) | o | rhombus | 0.47 | 1.16 | 0.50 | 1.38 | square | square | 710:3:1306 |
| held out | GregoBase 3449 (Quod dico vobis) | mi | punctum | 0.38 | 0.62 | 0.85 | 0.73 | rhombus | rhombus | 613:8:1631 |

## Floor and ceiling sweep on the pieces they were chosen on

| floor | ceiling | rhombi read | squares called rhombus |
|---|---|---|---|
| 0.50 | 0.85 | 1050 of 1092 | 8 of 7919 |
| 0.52 | 0.85 | 1050 of 1092 | 8 of 7919 |
| 0.54 | 0.85 | 1050 of 1092 | 8 of 7919 |
| 0.56 | 0.85 | 1050 of 1092 | 8 of 7919 |
| 0.58 | 0.85 | 1050 of 1092 | 5 of 7919 |
| 0.60 | 0.85 | 1050 of 1092 | 5 of 7919 |
| 0.62 | 0.85 | 1050 of 1092 | 3 of 7919 |
| 0.64 | 0.85 | 1038 of 1092 | 3 of 7919 |
| 0.66 | 0.85 | 1020 of 1092 | 3 of 7919 |
| 0.68 | 0.85 | 921 of 1092 | 2 of 7919 |
| 0.70 | 0.85 | 670 of 1092 | 2 of 7919 |
| 0.72 | 0.85 | 406 of 1092 | 0 of 7919 |
| 0.50 | 0.9 | 1059 of 1092 | 8 of 7919 |
| 0.52 | 0.9 | 1059 of 1092 | 8 of 7919 |
| 0.54 | 0.9 | 1059 of 1092 | 8 of 7919 |
| 0.56 | 0.9 | 1059 of 1092 | 8 of 7919 |
| 0.58 | 0.9 | 1059 of 1092 | 5 of 7919 |
| 0.60 | 0.9 | 1059 of 1092 | 5 of 7919 |
| 0.62 | 0.9 | 1059 of 1092 | 3 of 7919 |
| 0.64 | 0.9 | 1047 of 1092 | 3 of 7919 |
| 0.66 | 0.9 | 1029 of 1092 | 3 of 7919 |
| 0.68 | 0.9 | 930 of 1092 | 2 of 7919 |
| 0.70 | 0.9 | 679 of 1092 | 2 of 7919 |
| 0.72 | 0.9 | 415 of 1092 | 0 of 7919 |
| 0.50 | 0.95 | 1069 of 1092 | 8 of 7919 |
| 0.52 | 0.95 | 1069 of 1092 | 8 of 7919 |
| 0.54 | 0.95 | 1069 of 1092 | 8 of 7919 |
| 0.56 | 0.95 | 1069 of 1092 | 8 of 7919 |
| 0.58 | 0.95 | 1069 of 1092 | 5 of 7919 |
| 0.60 | 0.95 | 1069 of 1092 | 5 of 7919 |
| 0.62 | 0.95 | 1069 of 1092 | 3 of 7919 |
| 0.64 | 0.95 | 1057 of 1092 | 3 of 7919 |
| 0.66 | 0.95 | 1039 of 1092 | 3 of 7919 |
| 0.68 | 0.95 | 940 of 1092 | 2 of 7919 |
| 0.70 | 0.95 | 689 of 1092 | 2 of 7919 |
| 0.72 | 0.95 | 425 of 1092 | 0 of 7919 |
| 0.50 | 1 | 1071 of 1092 | 8 of 7919 |
| 0.52 | 1 | 1071 of 1092 | 8 of 7919 |
| 0.54 | 1 | 1071 of 1092 | 8 of 7919 |
| 0.56 | 1 | 1071 of 1092 | 8 of 7919 |
| 0.58 | 1 | 1071 of 1092 | 5 of 7919 |
| 0.60 | 1 | 1071 of 1092 | 5 of 7919 |
| 0.62 | 1 | 1071 of 1092 | 3 of 7919 |
| 0.64 | 1 | 1059 of 1092 | 3 of 7919 |
| 0.66 | 1 | 1041 of 1092 | 3 of 7919 |
| 0.68 | 1 | 942 of 1092 | 2 of 7919 |
| 0.70 | 1 | 691 of 1092 | 2 of 7919 |
| 0.72 | 1 | 427 of 1092 | 0 of 7919 |
| 0.50 | Infinity | 1087 of 1092 | 8 of 7919 |
| 0.52 | Infinity | 1087 of 1092 | 8 of 7919 |
| 0.54 | Infinity | 1087 of 1092 | 8 of 7919 |
| 0.56 | Infinity | 1087 of 1092 | 8 of 7919 |
| 0.58 | Infinity | 1087 of 1092 | 5 of 7919 |
| 0.60 | Infinity | 1087 of 1092 | 5 of 7919 |
| 0.62 | Infinity | 1087 of 1092 | 3 of 7919 |
| 0.64 | Infinity | 1075 of 1092 | 3 of 7919 |
| 0.66 | Infinity | 1057 of 1092 | 3 of 7919 |
| 0.68 | Infinity | 958 of 1092 | 2 of 7919 |
| 0.70 | Infinity | 707 of 1092 | 2 of 7919 |
| 0.72 | Infinity | 443 of 1092 | 0 of 7919 |

Heights of rhombi the old rule reads (chosen-on set): lowest ten 0.62, 0.63, 0.64, 0.64, 0.64, 0.64, 0.64, 0.64, 0.64, 0.64; highest ten 1.02, 1.03, 1.03, 1.03, 1.04, 1.04, 1.04, 1.04, 1.04, 1.09
Heights of squares the old rule calls rhombi (chosen-on set, all): 0.56, 0.56, 0.57, 0.61, 0.61, 0.67, 0.72, 0.72
