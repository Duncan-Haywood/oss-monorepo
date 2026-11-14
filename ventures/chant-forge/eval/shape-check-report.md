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

| set | GABC shape | in the GABC span | paired by pitch | read as rhombus | read as quilisma | read as liquescent | read as square |
|---|---|---|---|---|---|---|---|
| tuned on | punctum | 1439 | 1432 | 0 of 1432 (0.0%) | 3 of 1432 (0.2%) | 0 of 1432 (0.0%) | 1377 of 1432 (96.2%) |
| tuned on | virga | 38 | 38 | 0 of 38 (0.0%) | 0 of 38 (0.0%) | 0 of 38 (0.0%) | 38 of 38 (100.0%) |
| tuned on | rhombus | 79 | 68 | 68 of 68 (100.0%) | 0 of 68 (0.0%) | 0 of 68 (0.0%) | 0 of 68 (0.0%) |
| tuned on | quilisma | 9 | 6 | 0 of 6 (0.0%) | 6 of 6 (100.0%) | 0 of 6 (0.0%) | 0 of 6 (0.0%) |
| tuned on | liquescent | 9 | 8 | 0 of 8 (0.0%) | 0 of 8 (0.0%) | 8 of 8 (100.0%) | 0 of 8 (0.0%) |
| held out | punctum | 1007 | 986 | 1 of 986 (0.1%) | 9 of 986 (0.9%) | 1 of 986 (0.1%) | 943 of 986 (95.6%) |
| held out | virga | 50 | 48 | 0 of 48 (0.0%) | 0 of 48 (0.0%) | 0 of 48 (0.0%) | 48 of 48 (100.0%) |
| held out | rhombus | 136 | 120 | 118 of 120 (98.3%) | 0 of 120 (0.0%) | 0 of 120 (0.0%) | 0 of 120 (0.0%) |
| held out | quilisma | 24 | 18 | 0 of 18 (0.0%) | 18 of 18 (100.0%) | 0 of 18 (0.0%) | 0 of 18 (0.0%) |
| held out | liquescent | 25 | 24 | 0 of 24 (0.0%) | 0 of 24 (0.0%) | 23 of 24 (95.8%) | 1 of 24 (4.2%) |
| fresh | punctum | 1602 | 1518 | 0 of 1518 (0.0%) | 12 of 1518 (0.8%) | 1 of 1518 (0.1%) | 1455 of 1518 (95.8%) |
| fresh | virga | 92 | 88 | 0 of 88 (0.0%) | 0 of 88 (0.0%) | 0 of 88 (0.0%) | 88 of 88 (100.0%) |
| fresh | rhombus | 268 | 245 | 243 of 245 (99.2%) | 0 of 245 (0.0%) | 0 of 245 (0.0%) | 2 of 245 (0.8%) |
| fresh | quilisma | 39 | 17 | 1 of 17 (5.9%) | 15 of 17 (88.2%) | 0 of 17 (0.0%) | 1 of 17 (5.9%) |
| fresh | liquescent | 26 | 23 | 0 of 23 (0.0%) | 0 of 23 (0.0%) | 23 of 23 (100.0%) | 0 of 23 (0.0%) |
| liquescent fresh | punctum | 1427 | 1355 | 3 of 1355 (0.2%) | 17 of 1355 (1.3%) | 1 of 1355 (0.1%) | 1310 of 1355 (96.7%) |
| liquescent fresh | virga | 73 | 73 | 2 of 73 (2.7%) | 0 of 73 (0.0%) | 0 of 73 (0.0%) | 71 of 73 (97.3%) |
| liquescent fresh | rhombus | 206 | 182 | 180 of 182 (98.9%) | 0 of 182 (0.0%) | 0 of 182 (0.0%) | 2 of 182 (1.1%) |
| liquescent fresh | quilisma | 20 | 12 | 1 of 12 (8.3%) | 10 of 12 (83.3%) | 0 of 12 (0.0%) | 1 of 12 (8.3%) |
| liquescent fresh | liquescent | 26 | 21 | 1 of 21 (4.8%) | 0 of 21 (0.0%) | 20 of 21 (95.2%) | 0 of 21 (0.0%) |

## Per piece

| piece | set | rhombi in GABC | paired | read as rhombus | quilismas in GABC | paired | read as quilisma | squares (punctum, virga) paired | read as rhombus | read as quilisma |
|---|---|---|---|---|---|---|---|---|---|---|
| Dies irae | tuned on | 48 | 42 | 42 | 0 | 0 | 0 | 562 | 0 | 0 |
| Veni Creator (verse 1) | tuned on | 0 | 0 | 0 | 0 | 0 | 0 | 43 | 0 | 0 |
| Pange lingua (verse 1) | tuned on | 2 | 2 | 2 | 0 | 0 | 0 | 51 | 0 | 0 |
| Te Deum (Roman tone, 1908) | tuned on | 16 | 16 | 16 | 7 | 6 | 6 | 608 | 0 | 1 |
| Salve Regina (solemn tone) | tuned on | 13 | 8 | 8 | 2 | 0 | 0 | 206 | 0 | 2 |
| GregoBase 3434 (off-final ending) | held out | 23 | 15 | 15 | 5 | 3 | 3 | 187 | 1 | 3 |
| GregoBase 3407 (off-final ending) | held out | 12 | 10 | 10 | 6 | 4 | 4 | 192 | 0 | 0 |
| GregoBase 3426 (off-final ending) | held out | 23 | 23 | 23 | 3 | 3 | 3 | 132 | 0 | 0 |
| GregoBase 3403 (off-final ending) | held out | 8 | 7 | 7 | 0 | 0 | 0 | 106 | 0 | 1 |
| GregoBase 3453 (off-final ending) | held out | 8 | 5 | 5 | 1 | 0 | 0 | 126 | 0 | 0 |
| GregoBase 3418 (off-final ending) | held out | 6 | 4 | 4 | 3 | 2 | 2 | 145 | 0 | 5 |
| GregoBase 3429 (off-final ending) | held out | 56 | 56 | 54 | 6 | 6 | 6 | 146 | 0 | 0 |
| GregoBase 3425 (Domine quinque talenta) | fresh | 21 | 17 | 17 | 9 | 7 | 6 | 136 | 0 | 0 |
| GregoBase 3433 (Qui gloriatur) | fresh | 47 | 41 | 40 | 7 | 4 | 3 | 304 | 0 | 1 |
| GregoBase 3408 (Quando orabas) | fresh | 20 | 20 | 20 | 6 | 1 | 1 | 159 | 0 | 3 |
| GregoBase 3401 (Florete... et date) | fresh | 6 | 5 | 5 | 4 | 0 | 0 | 101 | 0 | 0 |
| GregoBase 3448 (Diffusa est (All.)) | fresh | 40 | 38 | 38 | 3 | 1 | 1 | 135 | 0 | 1 |
| GregoBase 3444 (Constitues eos principes (Grad.)) | fresh | 33 | 33 | 33 | 3 | 2 | 2 | 190 | 0 | 1 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | 40 | 38 | 37 | 3 | 1 | 1 | 215 | 0 | 2 |
| GregoBase 3445 (Sapientia aedificavit) | fresh | 28 | 26 | 26 | 2 | 1 | 1 | 181 | 0 | 0 |
| GregoBase 3438 (Protege Domine) | fresh | 33 | 27 | 27 | 2 | 0 | 0 | 185 | 0 | 4 |
| GregoBase 3415 (Stabant) | liquescent fresh | 7 | 6 | 6 | 2 | 2 | 2 | 120 | 0 | 0 |
| GregoBase 3421 (Narraverunt) | liquescent fresh | 6 | 3 | 3 | 1 | 0 | 0 | 115 | 1 | 1 |
| GregoBase 3424 (Ambulate) | liquescent fresh | 8 | 7 | 6 | 1 | 1 | 1 | 101 | 0 | 2 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | 26 | 26 | 26 | 1 | 0 | 0 | 137 | 2 | 3 |
| GregoBase 3460 (Frumentum) | liquescent fresh | 2 | 2 | 2 | 0 | 0 | 0 | 40 | 0 | 0 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | 30 | 30 | 30 | 5 | 3 | 2 | 296 | 0 | 5 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | 2 | 1 | 0 | 1 | 1 | 0 | 51 | 2 | 1 |
| GregoBase 3428 (Erit quasi signum) | liquescent fresh | 8 | 5 | 5 | 3 | 2 | 2 | 137 | 0 | 0 |
| GregoBase 3435 (Ave Maria (Alleluia)) | liquescent fresh | 49 | 45 | 45 | 2 | 1 | 1 | 143 | 0 | 2 |
| GregoBase 3443 (Dominus dabit) | liquescent fresh | 12 | 8 | 8 | 0 | 0 | 0 | 98 | 0 | 0 |
| GregoBase 3458 (Corona aurea) | liquescent fresh | 56 | 49 | 49 | 4 | 2 | 2 | 190 | 0 | 3 |

## Rhombus disagreements to look at

| piece | set | syllable | GABC group | GABC shape | scan shape | where |
|---|---|---|---|---|---|---|
| GregoBase 3434 (off-final ending) | held out | et | f | punctum | rhombus | p. leaf 354 (leaf 354), staff 5, x 817 |
| GregoBase 3433 (Qui gloriatur) | fresh | do. | jjjvIHivHGhg | rhombus | square | p. 480 (leaf 506), staff 6, x 1466 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | BAT | efEC//efe/fgf//efe/fgf | rhombus | square | p. leaf 428 (leaf 428), staff 1, x 342 |
| GregoBase 3421 (Narraverunt) | liquescent fresh | non | gihhg~ | punctum | rhombus | p. leaf 434 (leaf 434), staff 2, x 1190 |
| GregoBase 3424 (Ambulate) | liquescent fresh | tá | hf/gh!jjh//giHGF , fff//fgf/ghg/hf/gf | rhombus | square | p. leaf 445 (leaf 445), staff 4, x 904 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | le | jkJH//gi hjIH//g!jj//hig | punctum | rhombus | p. leaf 544 (leaf 544), staff 6, x 722 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | gau | fg | punctum | rhombus | p. [157] (leaf 742), staff 5, x 786 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | ge | gvFEfwgfg | rhombus | square | p. [157] (leaf 742), staff 5, x 1201 |

## Quilisma disagreements to look at

| piece | set | syllable | GABC group | GABC shape | scan shape | where |
|---|---|---|---|---|---|---|
| Te Deum (Roman tone, 1908) | tuned on | Pa | gh!iwj | punctum | quilisma | p. 119* (leaf 910), staff 2, x 1223 |
| Salve Regina (solemn tone) | tuned on | et | c | punctum | quilisma | p. 57 (leaf 84), staff 1, x 556 |
| Salve Regina (solemn tone) | tuned on | ? | de!fg | punctum | quilisma | p. 57 (leaf 84), staff 7, x 676 |
| GregoBase 3434 (off-final ending) | held out | et | fhf!gw!h!gh~ | punctum | quilisma | p. leaf 354 (leaf 354), staff 7, x 1195 |
| GregoBase 3434 (off-final ending) | held out | li | fg!hvGFg | punctum | quilisma | p. leaf 354 (leaf 354), staff 7, x 1328 |
| GregoBase 3434 (off-final ending) | held out | rá | fg!hvGFg | punctum | quilisma | p. leaf 354 (leaf 354), staff 8, x 1364 |
| GregoBase 3403 (off-final ending) | held out | su | ef/hfh | punctum | quilisma | p. leaf 513 (leaf 513), staff 5, x 1722 |
| GregoBase 3418 (off-final ending) | held out | mi | ixhg!hwihi | punctum | quilisma | p. leaf 580 (leaf 580), staff 1, x 1103 |
| GregoBase 3418 (off-final ending) | held out | An | fg/hgh | punctum | quilisma | p. leaf 580 (leaf 580), staff 3, x 956 |
| GregoBase 3418 (off-final ending) | held out | ge | gvFEfwgfg | punctum | quilisma | p. leaf 580 (leaf 580), staff 3, x 1155 |
| GregoBase 3418 (off-final ending) | held out | De | d!ewfef | punctum | quilisma | p. leaf 580 (leaf 580), staff 4, x 703 |
| GregoBase 3418 (off-final ending) | held out | ctos | gh | punctum | quilisma | p. leaf 580 (leaf 580), staff 5, x 231 |
| GregoBase 3425 (Domine quinque talenta) | fresh | lis, | i!jwk | quilisma | rhombus | p. leaf 367 (leaf 367), staff 3, x 791 |
| GregoBase 3433 (Qui gloriatur) | fresh | á | jkJGhg/h!iw!jvIHijh | punctum | quilisma | p. 480 (leaf 506), staff 3, x 1415 |
| GregoBase 3433 (Qui gloriatur) | fresh | ví | kjjg,jv//kli/jki/jhhg/ixhiGF/iyh!iwjjk | quilisma | square | p. 480 (leaf 506), staff 6, x 1532 |
| GregoBase 3408 (Quando orabas) | fresh | bas | f!gwhhvGFgeec | punctum | quilisma | p. leaf 516 (leaf 516), staff 9, x 618 |
| GregoBase 3408 (Quando orabas) | fresh | ó | iv//giHGEf , c!ef!hhf/gvEC//efef | punctum | quilisma | p. 491 (leaf 517), staff 4, x 1641 |
| GregoBase 3408 (Quando orabas) | fresh | no. | f!gwhhvGFggf | punctum | quilisma | p. 491 (leaf 517), staff 5, x 762 |
| GregoBase 3448 (Diffusa est (All.)) | fresh | té | feh | punctum | quilisma | p. 350 (leaf 376), staff 2, x 273 |
| GregoBase 3444 (Constitues eos principes (Grad.)) | fresh | ram: | hgiHG/kv//jkJF//gh/jiih | punctum | quilisma | p. leaf 364 (leaf 364), staff 2, x 616 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | Chri | fe/f!gwh!iv | punctum | quilisma | p. leaf 428 (leaf 428), staff 3, x 786 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | do | fe/f!gwh!iv | punctum | quilisma | p. leaf 428 (leaf 428), staff 6, x 409 |
| GregoBase 3438 (Protege Domine) | fresh | Dó | ef/hgh | punctum | quilisma | p. leaf 553 (leaf 553), staff 1, x 985 |
| GregoBase 3438 (Protege Domine) | fresh | ne, | g/hvGE//gef/ghf | punctum | quilisma | p. leaf 553 (leaf 553), staff 1, x 1305 |
| GregoBase 3438 (Protege Domine) | fresh | tá | fhGE//g!hi | punctum | quilisma | p. 528 (leaf 554), staff 3, x 1046 |
| GregoBase 3438 (Protege Domine) | fresh | no | fe!fwg!hv | punctum | quilisma | p. 528 (leaf 554), staff 4, x 840 |
| GregoBase 3421 (Narraverunt) | liquescent fresh | le | hghf | punctum | quilisma | p. 409 (leaf 435), staff 1, x 1224 |
| GregoBase 3424 (Ambulate) | liquescent fresh | xit | gfg | punctum | quilisma | p. leaf 445 (leaf 445), staff 2, x 528 |
| GregoBase 3424 (Ambulate) | liquescent fresh | no | fg!hvGFg | punctum | quilisma | p. leaf 445 (leaf 445), staff 2, x 1645 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | rí | gfh | punctum | quilisma | p. leaf 544 (leaf 544), staff 3, x 1097 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | gau | gh!jji/jg//hjijk[oll:1]ljj | punctum | quilisma | p. leaf 544 (leaf 544), staff 4, x 635 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | dí | hvGFgvFEf//ghffdg | punctum | quilisma | p. leaf 544 (leaf 544), staff 5, x 946 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | mnes | fe/ggf/gh/iffe | punctum | quilisma | p. [55] (leaf 640), staff 7, x 569 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | bis: | fe/ggf/gh/iffe | punctum | quilisma | p. [55] (leaf 640), staff 7, x 1189 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | e | fe/f!gwh!iv | quilisma | square | p. leaf 641 (leaf 641), staff 1, x 328 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | ad | gh~ | punctum | quilisma | p. leaf 641 (leaf 641), staff 2, x 1452 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | tur | kxhgi//jkiih | punctum | quilisma | p. leaf 641 (leaf 641), staff 3, x 328 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | gis. | fe/f!hh/ijIGh | punctum | quilisma | p. leaf 641 (leaf 641), staff 3, x 1461 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | tá | g/hjh | punctum | quilisma | p. [157] (leaf 742), staff 5, x 629 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | ge | gvFEfwgfg | quilisma | rhombus | p. [157] (leaf 742), staff 5, x 1248 |
| GregoBase 3435 (Ave Maria (Alleluia)) | liquescent fresh | ne | g!hi//hih/f!gwhgh/fgffe//fg!hvGFEf ; fg!hi//hih/f!gwhgh/fgffe//fg!hvGFEf , fg!hi | punctum | quilisma | p. [84] (leaf 669), staff 3, x 1082 |
| GregoBase 3435 (Ave Maria (Alleluia)) | liquescent fresh | é | f/hfghvGEf//hf/gf | punctum | quilisma | p. [84] (leaf 669), staff 4, x 1335 |
| GregoBase 3458 (Corona aurea) | liquescent fresh | ró | dfddce//fgEDffd | punctum | quilisma | p. [145] (leaf 730), staff 5, x 678 |
| GregoBase 3458 (Corona aurea) | liquescent fresh | e | dfe/fg!hvFED//ef!gvEDffd | punctum | quilisma | p. [145] (leaf 730), staff 6, x 414 |
| GregoBase 3458 (Corona aurea) | liquescent fresh | tá | gh!iwj/kjjvIH | punctum | quilisma | p. [145] (leaf 730), staff 7, x 1048 |

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
