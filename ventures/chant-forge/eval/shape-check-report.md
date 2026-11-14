# Head shapes: the scan reader against the GABC

Written by `node eval/shape-check.mjs` (reader: `scan.mjs`, `headShape`). Notes are paired by
pitch as in `scan-check.mjs`; for each pair that agrees in pitch, the shape the reader saw is set
against the shape the GABC writes. "Tuned on" is the five corpus pieces the thresholds were chosen on:
a rhombus is under 0.42 staff spaces wide with end columns under 0.8 of the middle ones' height; a
quilisma has three or more rows, in its upper half, that cross two or more separate runs of ink
(`notchRows`, `QUILISMA_ROWS`). "Held out" is the seven GregoBase pieces from the 1908 Graduale
that played no part in the rhombus rule; they were looked at while the quilisma measure was being
chosen, so for quilismas they are not a clean test. "Fresh" is the nine pieces in
`shape-fresh-pages.json`, chosen and first scanned after the quilisma rule was fixed.

**Version 2.** One rule was added after the fresh pieces had been looked at: a notched head
whose left neighbour at its height is wider than 0.8 staff spaces and ends within 0.2 spaces of it
continues a porrectus stroke the reader cut in two, and is not a quilisma (`afterStroke`). On the
fresh set the frozen rule without it called 18 of 1,849 other heads quilismas; with it, 12, with no
quilisma lost. So the fresh false-call figure below is no longer a clean held-out number; the
quilisma recall on it is (the added rule can only remove calls). The eye check of the fresh calls
is in `quilisma-eye-check.md`.

**Liquescents (2026-11-14).** The reader now hangs a liquescent's small note off its head
(`liquescentTail`). Its thresholds were set on all 21 pieces above (tuned, held out and fresh),
so on those sets the liquescent figures are not held out. "Liquescent fresh" is the eleven pieces
in `liquescent-fresh-pages.json`, listed and first scanned after those thresholds were frozen.
Liquescent figures in more detail: `liquescent-check-report.md`.

**Quilisma version 3 (2026-11-14).** A notched head is no longer a quilisma when its centre falls
0.06 staff spaces or more left to right (a porrectus stroke piece), when a head is printed straight
under it, or when it carries a liquescent tail (`isQuilisma`). Chosen on all 32 pieces above, so
their quilisma false-call figures are no longer held out. "Quilisma fresh" is the eighteen pieces
in `quilisma-fresh-pages.json`, listed and first scanned after version 3 was frozen. Details:
`quilisma-stroke-check.md`.

| set | GABC shape | in the GABC span | paired by pitch | read as rhombus | read as quilisma | read as liquescent | read as square |
|---|---|---|---|---|---|---|---|
| tuned on | punctum | 1439 | 1432 | 0 of 1432 (0.0%) | 1 of 1432 (0.1%) | 0 of 1432 (0.0%) | 1379 of 1432 (96.3%) |
| tuned on | virga | 38 | 38 | 0 of 38 (0.0%) | 0 of 38 (0.0%) | 0 of 38 (0.0%) | 38 of 38 (100.0%) |
| tuned on | rhombus | 79 | 68 | 68 of 68 (100.0%) | 0 of 68 (0.0%) | 0 of 68 (0.0%) | 0 of 68 (0.0%) |
| tuned on | quilisma | 9 | 6 | 0 of 6 (0.0%) | 6 of 6 (100.0%) | 0 of 6 (0.0%) | 0 of 6 (0.0%) |
| tuned on | liquescent | 9 | 8 | 0 of 8 (0.0%) | 0 of 8 (0.0%) | 8 of 8 (100.0%) | 0 of 8 (0.0%) |
| held out | punctum | 1007 | 986 | 0 of 986 (0.0%) | 1 of 986 (0.1%) | 1 of 986 (0.1%) | 952 of 986 (96.6%) |
| held out | virga | 50 | 48 | 0 of 48 (0.0%) | 0 of 48 (0.0%) | 0 of 48 (0.0%) | 48 of 48 (100.0%) |
| held out | rhombus | 136 | 120 | 118 of 120 (98.3%) | 0 of 120 (0.0%) | 0 of 120 (0.0%) | 0 of 120 (0.0%) |
| held out | quilisma | 24 | 18 | 0 of 18 (0.0%) | 18 of 18 (100.0%) | 0 of 18 (0.0%) | 0 of 18 (0.0%) |
| held out | liquescent | 25 | 24 | 0 of 24 (0.0%) | 0 of 24 (0.0%) | 23 of 24 (95.8%) | 1 of 24 (4.2%) |
| fresh | punctum | 1602 | 1518 | 0 of 1518 (0.0%) | 7 of 1518 (0.5%) | 1 of 1518 (0.1%) | 1460 of 1518 (96.2%) |
| fresh | virga | 92 | 88 | 0 of 88 (0.0%) | 0 of 88 (0.0%) | 0 of 88 (0.0%) | 88 of 88 (100.0%) |
| fresh | rhombus | 268 | 245 | 243 of 245 (99.2%) | 0 of 245 (0.0%) | 0 of 245 (0.0%) | 2 of 245 (0.8%) |
| fresh | quilisma | 39 | 17 | 1 of 17 (5.9%) | 15 of 17 (88.2%) | 0 of 17 (0.0%) | 1 of 17 (5.9%) |
| fresh | liquescent | 26 | 23 | 0 of 23 (0.0%) | 0 of 23 (0.0%) | 23 of 23 (100.0%) | 0 of 23 (0.0%) |
| liquescent fresh | punctum | 1427 | 1355 | 2 of 1355 (0.1%) | 7 of 1355 (0.5%) | 1 of 1355 (0.1%) | 1321 of 1355 (97.5%) |
| liquescent fresh | virga | 73 | 73 | 1 of 73 (1.4%) | 0 of 73 (0.0%) | 0 of 73 (0.0%) | 72 of 73 (98.6%) |
| liquescent fresh | rhombus | 206 | 182 | 179 of 182 (98.4%) | 0 of 182 (0.0%) | 0 of 182 (0.0%) | 3 of 182 (1.6%) |
| liquescent fresh | quilisma | 20 | 12 | 0 of 12 (0.0%) | 10 of 12 (83.3%) | 0 of 12 (0.0%) | 2 of 12 (16.7%) |
| liquescent fresh | liquescent | 26 | 21 | 1 of 21 (4.8%) | 0 of 21 (0.0%) | 20 of 21 (95.2%) | 0 of 21 (0.0%) |
| quilisma fresh | punctum | 2614 | 2467 | 4 of 2467 (0.2%) | 6 of 2467 (0.2%) | 1 of 2467 (0.0%) | 2361 of 2467 (95.7%) |
| quilisma fresh | virga | 181 | 174 | 0 of 174 (0.0%) | 0 of 174 (0.0%) | 0 of 174 (0.0%) | 174 of 174 (100.0%) |
| quilisma fresh | rhombus | 474 | 420 | 416 of 420 (99.0%) | 0 of 420 (0.0%) | 0 of 420 (0.0%) | 4 of 420 (1.0%) |
| quilisma fresh | quilisma | 79 | 55 | 3 of 55 (5.5%) | 47 of 55 (85.5%) | 1 of 55 (1.8%) | 4 of 55 (7.3%) |
| quilisma fresh | liquescent | 20 | 19 | 1 of 19 (5.3%) | 0 of 19 (0.0%) | 17 of 19 (89.5%) | 1 of 19 (5.3%) |

## Per piece

| piece | set | rhombi in GABC | paired | read as rhombus | quilismas in GABC | paired | read as quilisma | squares (punctum, virga) paired | read as rhombus | read as quilisma |
|---|---|---|---|---|---|---|---|---|---|---|
| Dies irae | tuned on | 48 | 42 | 42 | 0 | 0 | 0 | 562 | 0 | 0 |
| Veni Creator (verse 1) | tuned on | 0 | 0 | 0 | 0 | 0 | 0 | 43 | 0 | 0 |
| Pange lingua (verse 1) | tuned on | 2 | 2 | 2 | 0 | 0 | 0 | 51 | 0 | 0 |
| Te Deum (Roman tone, 1908) | tuned on | 16 | 16 | 16 | 7 | 6 | 6 | 608 | 0 | 0 |
| Salve Regina (solemn tone) | tuned on | 13 | 8 | 8 | 2 | 0 | 0 | 206 | 0 | 1 |
| GregoBase 3434 (off-final ending) | held out | 23 | 15 | 15 | 5 | 3 | 3 | 187 | 0 | 0 |
| GregoBase 3407 (off-final ending) | held out | 12 | 10 | 10 | 6 | 4 | 4 | 192 | 0 | 0 |
| GregoBase 3426 (off-final ending) | held out | 23 | 23 | 23 | 3 | 3 | 3 | 132 | 0 | 0 |
| GregoBase 3403 (off-final ending) | held out | 8 | 7 | 7 | 0 | 0 | 0 | 106 | 0 | 0 |
| GregoBase 3453 (off-final ending) | held out | 8 | 5 | 5 | 1 | 0 | 0 | 126 | 0 | 0 |
| GregoBase 3418 (off-final ending) | held out | 6 | 4 | 4 | 3 | 2 | 2 | 145 | 0 | 1 |
| GregoBase 3429 (off-final ending) | held out | 56 | 56 | 54 | 6 | 6 | 6 | 146 | 0 | 0 |
| GregoBase 3425 (Domine quinque talenta) | fresh | 21 | 17 | 17 | 9 | 7 | 6 | 136 | 0 | 0 |
| GregoBase 3433 (Qui gloriatur) | fresh | 47 | 41 | 40 | 7 | 4 | 3 | 304 | 0 | 1 |
| GregoBase 3408 (Quando orabas) | fresh | 20 | 20 | 20 | 6 | 1 | 1 | 159 | 0 | 2 |
| GregoBase 3401 (Florete... et date) | fresh | 6 | 5 | 5 | 4 | 0 | 0 | 101 | 0 | 0 |
| GregoBase 3448 (Diffusa est (All.)) | fresh | 40 | 38 | 38 | 3 | 1 | 1 | 135 | 0 | 0 |
| GregoBase 3444 (Constitues eos principes (Grad.)) | fresh | 33 | 33 | 33 | 3 | 2 | 2 | 190 | 0 | 0 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | 40 | 38 | 37 | 3 | 1 | 1 | 215 | 0 | 2 |
| GregoBase 3445 (Sapientia aedificavit) | fresh | 28 | 26 | 26 | 2 | 1 | 1 | 181 | 0 | 0 |
| GregoBase 3438 (Protege Domine) | fresh | 33 | 27 | 27 | 2 | 0 | 0 | 185 | 0 | 2 |
| GregoBase 3415 (Stabant) | liquescent fresh | 7 | 6 | 6 | 2 | 2 | 2 | 120 | 0 | 0 |
| GregoBase 3421 (Narraverunt) | liquescent fresh | 6 | 3 | 3 | 1 | 0 | 0 | 115 | 1 | 0 |
| GregoBase 3424 (Ambulate) | liquescent fresh | 8 | 7 | 6 | 1 | 1 | 1 | 101 | 0 | 0 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | 26 | 26 | 26 | 1 | 0 | 0 | 137 | 0 | 2 |
| GregoBase 3460 (Frumentum) | liquescent fresh | 2 | 2 | 2 | 0 | 0 | 0 | 40 | 0 | 0 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | 30 | 30 | 30 | 5 | 3 | 2 | 296 | 0 | 3 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | 2 | 1 | 0 | 1 | 1 | 0 | 51 | 2 | 1 |
| GregoBase 3428 (Erit quasi signum) | liquescent fresh | 8 | 5 | 5 | 3 | 2 | 2 | 137 | 0 | 0 |
| GregoBase 3435 (Ave Maria (Alleluia)) | liquescent fresh | 49 | 45 | 45 | 2 | 1 | 1 | 143 | 0 | 0 |
| GregoBase 3443 (Dominus dabit) | liquescent fresh | 12 | 8 | 8 | 0 | 0 | 0 | 98 | 0 | 0 |
| GregoBase 3458 (Corona aurea) | liquescent fresh | 56 | 49 | 48 | 4 | 2 | 2 | 190 | 0 | 1 |
| GregoBase 3400 (Factus est opprobrium) | quilisma fresh | 9 | 6 | 6 | 4 | 1 | 1 | 125 | 0 | 0 |
| GregoBase 3402 (Omnis gloria) | quilisma fresh | 10 | 10 | 10 | 4 | 3 | 3 | 171 | 0 | 1 |
| GregoBase 3404 (Sacerdos sit sanctus) | quilisma fresh | 20 | 15 | 15 | 8 | 4 | 2 | 104 | 0 | 0 |
| GregoBase 3405 (Adjuvabit eam) | quilisma fresh | 54 | 47 | 47 | 5 | 5 | 5 | 300 | 1 | 1 |
| GregoBase 3410 (Magnificat) | quilisma fresh | 40 | 36 | 35 | 8 | 6 | 5 | 249 | 0 | 0 |
| GregoBase 3413 (Haec est Virgo sapiens et una) | quilisma fresh | 56 | 50 | 50 | 8 | 6 | 6 | 135 | 1 | 0 |
| GregoBase 3414 (Vere tu es) | quilisma fresh | 36 | 36 | 36 | 2 | 2 | 2 | 94 | 0 | 0 |
| GregoBase 3416 (Statuit) | quilisma fresh | 6 | 6 | 6 | 1 | 1 | 1 | 122 | 0 | 0 |
| GregoBase 3422 (Confiteantur tibi) | quilisma fresh | 24 | 20 | 19 | 1 | 0 | 0 | 199 | 0 | 0 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | 54 | 45 | 45 | 10 | 7 | 4 | 114 | 0 | 1 |
| GregoBase 3430 (In medio Ecclesiae) | quilisma fresh | 2 | 0 | 0 | 1 | 1 | 1 | 107 | 0 | 1 |
| GregoBase 3436 (Concupivit rex) | quilisma fresh | 30 | 28 | 28 | 4 | 4 | 3 | 86 | 0 | 0 |
| GregoBase 3437 (Adhaesi) | quilisma fresh | 14 | 7 | 5 | 3 | 0 | 0 | 105 | 0 | 0 |
| GregoBase 3450 (Principes) | quilisma fresh | 8 | 8 | 8 | 3 | 3 | 3 | 115 | 0 | 0 |
| GregoBase 3451 (Qui ambulat) | quilisma fresh | 39 | 36 | 36 | 6 | 5 | 4 | 175 | 2 | 0 |
| GregoBase 3452 (Scitote quoniam) | quilisma fresh | 23 | 23 | 23 | 2 | 0 | 0 | 121 | 0 | 1 |
| GregoBase 3455 (Diffusa est (Com.)) | quilisma fresh | 13 | 13 | 13 | 2 | 2 | 2 | 65 | 0 | 1 |
| GregoBase 3459 (Emitte Spiritum) | quilisma fresh | 36 | 34 | 34 | 7 | 5 | 5 | 254 | 0 | 0 |

## Rhombus disagreements to look at

| piece | set | syllable | GABC group | GABC shape | scan shape | where |
|---|---|---|---|---|---|---|
| GregoBase 3433 (Qui gloriatur) | fresh | do. | jjjvIHivHGhg | rhombus | square | p. 480 (leaf 506), staff 6, x 1466 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | BAT | efEC//efe/fgf//efe/fgf | rhombus | square | p. leaf 428 (leaf 428), staff 1, x 342 |
| GregoBase 3421 (Narraverunt) | liquescent fresh | non | gihhg~ | punctum | rhombus | p. leaf 434 (leaf 434), staff 2, x 1190 |
| GregoBase 3424 (Ambulate) | liquescent fresh | tá | hf/gh!jjh//giHGF , fff//fgf/ghg/hf/gf | rhombus | square | p. leaf 445 (leaf 445), staff 4, x 904 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | gau | fg | punctum | rhombus | p. [157] (leaf 742), staff 5, x 786 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | ge | gvFEfwgfg | rhombus | square | p. [157] (leaf 742), staff 5, x 1201 |
| GregoBase 3458 (Corona aurea) | liquescent fresh | ij. | dhhvGE/fvED//ce!fgEDffd | rhombus | square | p. [145] (leaf 730), staff 4, x 988 |
| GregoBase 3405 (Adjuvabit eam) | quilisma fresh | us | hg/ijIH//ghGF | punctum | rhombus | p. [50] (leaf 635), staff 3, x 1475 |
| GregoBase 3410 (Magnificat) | quilisma fresh | me | hjIGh | rhombus | square | p. [169] (leaf 754), staff 7, x 1533 |
| GregoBase 3413 (Haec est Virgo sapiens et una) | quilisma fresh | et | gh!iwji/jvIHG//h!iwjijvIHGge ghGFdeDC | punctum | rhombus | p. [51] (leaf 636), staff 3, x 1083 |
| GregoBase 3422 (Confiteantur tibi) | quilisma fresh | no | ihhfhv//df/hfhv//ihhfhv//ih/ihhghvGF | rhombus | square | p. leaf 790 (leaf 790), staff 3, x 883 |
| GregoBase 3437 (Adhaesi) | quilisma fresh | a. | f!gwhgh/jvvHF/gwhg/hjhh/fgf | rhombus | square | p. [125] (leaf 710), staff 2, x 1332 |
| GregoBase 3437 (Adhaesi) | quilisma fresh | mi | ig/hvFE//f!gwhhi | rhombus | square | p. [125] (leaf 710), staff 2, x 1514 |
| GregoBase 3451 (Qui ambulat) | quilisma fresh | scet | ihhf | punctum | rhombus | p. leaf 747 (leaf 747), staff 1, x 1398 |
| GregoBase 3451 (Qui ambulat) | quilisma fresh | mon | f | punctum | rhombus | p. leaf 747 (leaf 747), staff 1, x 1483 |

## Quilisma disagreements to look at

| piece | set | syllable | GABC group | GABC shape | scan shape | where |
|---|---|---|---|---|---|---|
| Salve Regina (solemn tone) | tuned on | et | c | punctum | quilisma | p. 57 (leaf 84), staff 1, x 556 |
| GregoBase 3418 (off-final ending) | held out | ctos | gh | punctum | quilisma | p. leaf 580 (leaf 580), staff 5, x 231 |
| GregoBase 3425 (Domine quinque talenta) | fresh | lis, | i!jwk | quilisma | rhombus | p. leaf 367 (leaf 367), staff 3, x 791 |
| GregoBase 3433 (Qui gloriatur) | fresh | á | jkJGhg/h!iw!jvIHijh | punctum | quilisma | p. 480 (leaf 506), staff 3, x 1415 |
| GregoBase 3433 (Qui gloriatur) | fresh | ví | kjjg,jv//kli/jki/jhhg/ixhiGF/iyh!iwjjk | quilisma | square | p. 480 (leaf 506), staff 6, x 1532 |
| GregoBase 3408 (Quando orabas) | fresh | bas | f!gwhhvGFgeec | punctum | quilisma | p. leaf 516 (leaf 516), staff 9, x 618 |
| GregoBase 3408 (Quando orabas) | fresh | no. | f!gwhhvGFggf | punctum | quilisma | p. 491 (leaf 517), staff 5, x 762 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | Chri | fe/f!gwh!iv | punctum | quilisma | p. leaf 428 (leaf 428), staff 3, x 786 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | do | fe/f!gwh!iv | punctum | quilisma | p. leaf 428 (leaf 428), staff 6, x 409 |
| GregoBase 3438 (Protege Domine) | fresh | tá | fhGE//g!hi | punctum | quilisma | p. 528 (leaf 554), staff 3, x 1046 |
| GregoBase 3438 (Protege Domine) | fresh | no | fe!fwg!hv | punctum | quilisma | p. 528 (leaf 554), staff 4, x 840 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | gau | gh!jji/jg//hjijk[oll:1]ljj | punctum | quilisma | p. leaf 544 (leaf 544), staff 4, x 635 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | dí | hvGFgvFEf//ghffdg | punctum | quilisma | p. leaf 544 (leaf 544), staff 5, x 946 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | mnes | fe/ggf/gh/iffe | punctum | quilisma | p. [55] (leaf 640), staff 7, x 569 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | bis: | fe/ggf/gh/iffe | punctum | quilisma | p. [55] (leaf 640), staff 7, x 1189 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | e | fe/f!gwh!iv | quilisma | square | p. leaf 641 (leaf 641), staff 1, x 328 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | gis. | fe/f!hh/ijIGh | punctum | quilisma | p. leaf 641 (leaf 641), staff 3, x 1461 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | tá | g/hjh | punctum | quilisma | p. [157] (leaf 742), staff 5, x 629 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | ge | gvFEfwgfg | quilisma | square | p. [157] (leaf 742), staff 5, x 1248 |
| GregoBase 3458 (Corona aurea) | liquescent fresh | tá | gh!iwj/kjjvIH | punctum | quilisma | p. [145] (leaf 730), staff 7, x 1048 |
| GregoBase 3402 (Omnis gloria) | quilisma fresh | in | h!iwj/kjj | punctum | quilisma | p. [167] (leaf 752), staff 2, x 1393 |
| GregoBase 3404 (Sacerdos sit sanctus) | quilisma fresh | LÚ | fg!hiivHGhwi | quilisma | rhombus | p. [93] (leaf 678), staff 1, x 489 |
| GregoBase 3404 (Sacerdos sit sanctus) | quilisma fresh | co | fg!hiivHGhwi | quilisma | rhombus | p. [93] (leaf 678), staff 3, x 717 |
| GregoBase 3405 (Adjuvabit eam) | quilisma fresh | su | hhgh/ihhg/h/ihhg/h/ihhg/gfg | punctum | quilisma | p. [50] (leaf 635), staff 3, x 694 |
| GregoBase 3410 (Magnificat) | quilisma fresh | o | hg/h!iwj | quilisma | square | p. leaf 755 (leaf 755), staff 2, x 964 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | ? | hi/jijIH/iwj!kvJIGgf/hiivHFE | quilisma | rhombus | p. [161] (leaf 746), staff 1, x 1285 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | au | hiivHFE//gf/hiivHFEfg | punctum | quilisma | p. [161] (leaf 746), staff 3, x 710 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | én | i!jw!kvJI | quilisma | liquescent | p. [161] (leaf 746), staff 3, x 1363 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | sá | hi/jijIHiwj!kvJI,hi/jijIHiwj!kvJIGgf/hiivHFE,gf/hiivHFEfg | quilisma | square | p. [161] (leaf 746), staff 4, x 425 |
| GregoBase 3430 (In medio Ecclesiae) | quilisma fresh | plé | ixf!gwh!iv | punctum | quilisma | p. [34] (leaf 619), staff 4, x 470 |
| GregoBase 3436 (Concupivit rex) | quilisma fresh | ? | d!ewf!gv//fh/GFEDewfd | quilisma | square | p. [58] (leaf 643), staff 8, x 975 |
| GregoBase 3451 (Qui ambulat) | quilisma fresh | ná | ki!jw!kvJI | quilisma | square | p. [161] (leaf 746), staff 9, x 319 |
| GregoBase 3452 (Scitote quoniam) | quilisma fresh | LE | gg/hih//fg | punctum | quilisma | p. [206] (leaf 791), staff 9, x 598 |
| GregoBase 3455 (Diffusa est (Com.)) | quilisma fresh | De | d!ew!fvEDCd | punctum | quilisma | p. leaf 520 (leaf 520), staff 6, x 969 |

## Liquescent disagreements to look at

A GABC liquescent the reader saw as another shape, a head read as a liquescent, or a liquescent note the reader added that pairs with no GABC note of its pitch.

| piece | set | syllable | GABC group | GABC shape | scan shape | where |
|---|---|---|---|---|---|---|
| GregoBase 3434 (off-final ending) | held out | car | hhg~ | liquescent | square | p. leaf 354 (leaf 354), staff 8, x 157 |
| GregoBase 3407 (off-final ending) | held out | ? | hg/hvFD/gfffvEC//ggf/ghddc/da | punctum | liquescent | p. leaf 421 (leaf 421), staff 7, x 1199 |
| GregoBase 3408 (Quando orabas) | fresh | ó | iv//giHGEf , c!ef!hhf/gvEC//efef | punctum | liquescent | p. 491 (leaf 517), staff 4, x 1620 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | Dó | hv//gjIGhh//fh!jvGFfd/ef!ghg | punctum | liquescent | p. leaf 544 (leaf 544), staff 5, x 1532 |
| GregoBase 3428 (Erit quasi signum) | liquescent fresh | (none) |  | no note | liquescent | p. [200] (leaf 785), staff 5, x 1182 |
| GregoBase 3428 (Erit quasi signum) | liquescent fresh | e | ji~ | liquescent | rhombus | p. [200] (leaf 785), staff 7, x 1045 |
| GregoBase 3400 (Factus est opprobrium) | quilisma fresh | in | hg~ | liquescent | rhombus | p. [142] (leaf 727), staff 6, x 1687 |
| GregoBase 3405 (Adjuvabit eam) | quilisma fresh | (none) |  | no note | liquescent | p. [50] (leaf 635), staff 8, x 1109 |
| GregoBase 3410 (Magnificat) | quilisma fresh | ma | hg/hf//hjhj | punctum | liquescent | p. [169] (leaf 754), staff 5, x 1566 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | én | i!jw!kvJI | quilisma | liquescent | p. [161] (leaf 746), staff 3, x 1363 |
| GregoBase 3436 (Concupivit rex) | quilisma fresh | rem | gh~ | liquescent | square | p. [58] (leaf 643), staff 7, x 1698 |
