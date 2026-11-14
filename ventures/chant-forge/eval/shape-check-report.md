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
| held out | punctum | 1065 | 1051 | 0 of 1051 (0.0%) | 1 of 1051 (0.1%) | 0 of 1051 (0.0%) | 1012 of 1051 (96.3%) |
| held out | virga | 56 | 56 | 0 of 56 (0.0%) | 0 of 56 (0.0%) | 0 of 56 (0.0%) | 56 of 56 (100.0%) |
| held out | rhombus | 148 | 133 | 133 of 133 (100.0%) | 0 of 133 (0.0%) | 0 of 133 (0.0%) | 0 of 133 (0.0%) |
| held out | quilisma | 25 | 19 | 0 of 19 (0.0%) | 19 of 19 (100.0%) | 0 of 19 (0.0%) | 0 of 19 (0.0%) |
| held out | liquescent | 25 | 24 | 0 of 24 (0.0%) | 0 of 24 (0.0%) | 23 of 24 (95.8%) | 1 of 24 (4.2%) |
| fresh | punctum | 1604 | 1583 | 0 of 1583 (0.0%) | 7 of 1583 (0.4%) | 1 of 1583 (0.1%) | 1522 of 1583 (96.1%) |
| fresh | virga | 93 | 92 | 0 of 92 (0.0%) | 0 of 92 (0.0%) | 0 of 92 (0.0%) | 92 of 92 (100.0%) |
| fresh | rhombus | 268 | 251 | 250 of 251 (99.6%) | 0 of 251 (0.0%) | 0 of 251 (0.0%) | 1 of 251 (0.4%) |
| fresh | quilisma | 39 | 18 | 1 of 18 (5.6%) | 17 of 18 (94.4%) | 0 of 18 (0.0%) | 0 of 18 (0.0%) |
| fresh | liquescent | 26 | 24 | 0 of 24 (0.0%) | 0 of 24 (0.0%) | 24 of 24 (100.0%) | 0 of 24 (0.0%) |
| liquescent fresh | punctum | 1485 | 1439 | 2 of 1439 (0.1%) | 5 of 1439 (0.3%) | 1 of 1439 (0.1%) | 1403 of 1439 (97.5%) |
| liquescent fresh | virga | 75 | 75 | 1 of 75 (1.3%) | 0 of 75 (0.0%) | 0 of 75 (0.0%) | 74 of 75 (98.7%) |
| liquescent fresh | rhombus | 211 | 187 | 186 of 187 (99.5%) | 0 of 187 (0.0%) | 0 of 187 (0.0%) | 1 of 187 (0.5%) |
| liquescent fresh | quilisma | 21 | 14 | 0 of 14 (0.0%) | 12 of 14 (85.7%) | 0 of 14 (0.0%) | 2 of 14 (14.3%) |
| liquescent fresh | liquescent | 27 | 23 | 1 of 23 (4.3%) | 0 of 23 (0.0%) | 22 of 23 (95.7%) | 0 of 23 (0.0%) |
| quilisma fresh | punctum | 2773 | 2686 | 1 of 2686 (0.0%) | 5 of 2686 (0.2%) | 1 of 2686 (0.0%) | 2581 of 2686 (96.1%) |
| quilisma fresh | virga | 192 | 187 | 0 of 187 (0.0%) | 0 of 187 (0.0%) | 0 of 187 (0.0%) | 187 of 187 (100.0%) |
| quilisma fresh | rhombus | 512 | 453 | 450 of 453 (99.3%) | 0 of 453 (0.0%) | 0 of 453 (0.0%) | 3 of 453 (0.7%) |
| quilisma fresh | quilisma | 85 | 60 | 3 of 60 (5.0%) | 51 of 60 (85.0%) | 1 of 60 (1.7%) | 5 of 60 (8.3%) |
| quilisma fresh | liquescent | 23 | 22 | 1 of 22 (4.5%) | 0 of 22 (0.0%) | 20 of 22 (90.9%) | 1 of 22 (4.5%) |

## Per piece

| piece | set | rhombi in GABC | paired | read as rhombus | quilismas in GABC | paired | read as quilisma | squares (punctum, virga) paired | read as rhombus | read as quilisma |
|---|---|---|---|---|---|---|---|---|---|---|
| Dies irae | tuned on | 48 | 42 | 42 | 0 | 0 | 0 | 562 | 0 | 0 |
| Veni Creator (verse 1) | tuned on | 0 | 0 | 0 | 0 | 0 | 0 | 43 | 0 | 0 |
| Pange lingua (verse 1) | tuned on | 2 | 2 | 2 | 0 | 0 | 0 | 51 | 0 | 0 |
| Te Deum (Roman tone, 1908) | tuned on | 16 | 16 | 16 | 7 | 6 | 6 | 608 | 0 | 0 |
| Salve Regina (solemn tone) | tuned on | 13 | 8 | 8 | 2 | 0 | 0 | 206 | 0 | 1 |
| GregoBase 3434 (off-final ending) | held out | 23 | 15 | 15 | 5 | 3 | 3 | 187 | 0 | 0 |
| GregoBase 3407 (off-final ending) | held out | 12 | 11 | 11 | 6 | 4 | 4 | 200 | 0 | 0 |
| GregoBase 3426 (off-final ending) | held out | 23 | 23 | 23 | 3 | 3 | 3 | 132 | 0 | 0 |
| GregoBase 3403 (off-final ending) | held out | 8 | 7 | 7 | 0 | 0 | 0 | 106 | 0 | 0 |
| GregoBase 3453 (off-final ending) | held out | 8 | 5 | 5 | 1 | 0 | 0 | 126 | 0 | 0 |
| GregoBase 3418 (off-final ending) | held out | 6 | 4 | 4 | 3 | 2 | 2 | 145 | 0 | 1 |
| GregoBase 3429 (off-final ending) | held out | 68 | 68 | 68 | 7 | 7 | 7 | 211 | 0 | 0 |
| GregoBase 3425 (Domine quinque talenta) | fresh | 21 | 17 | 17 | 9 | 7 | 6 | 136 | 0 | 0 |
| GregoBase 3433 (Qui gloriatur) | fresh | 47 | 46 | 46 | 7 | 5 | 5 | 341 | 0 | 1 |
| GregoBase 3408 (Quando orabas) | fresh | 20 | 20 | 20 | 6 | 1 | 1 | 177 | 0 | 2 |
| GregoBase 3401 (Florete... et date) | fresh | 6 | 5 | 5 | 4 | 0 | 0 | 101 | 0 | 0 |
| GregoBase 3448 (Diffusa est (All.)) | fresh | 40 | 38 | 38 | 3 | 1 | 1 | 135 | 0 | 0 |
| GregoBase 3444 (Constitues eos principes (Grad.)) | fresh | 33 | 33 | 33 | 3 | 2 | 2 | 191 | 0 | 0 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | 40 | 38 | 37 | 3 | 1 | 1 | 215 | 0 | 2 |
| GregoBase 3445 (Sapientia aedificavit) | fresh | 28 | 26 | 26 | 2 | 1 | 1 | 181 | 0 | 0 |
| GregoBase 3438 (Protege Domine) | fresh | 33 | 28 | 28 | 2 | 0 | 0 | 198 | 0 | 2 |
| GregoBase 3415 (Stabant) | liquescent fresh | 7 | 6 | 6 | 2 | 2 | 2 | 120 | 0 | 0 |
| GregoBase 3421 (Narraverunt) | liquescent fresh | 8 | 5 | 5 | 2 | 1 | 1 | 147 | 1 | 0 |
| GregoBase 3424 (Ambulate) | liquescent fresh | 11 | 10 | 10 | 1 | 1 | 1 | 134 | 0 | 0 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | 26 | 26 | 26 | 1 | 0 | 0 | 137 | 0 | 2 |
| GregoBase 3460 (Frumentum) | liquescent fresh | 2 | 2 | 2 | 0 | 0 | 0 | 40 | 0 | 0 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | 30 | 30 | 30 | 5 | 4 | 3 | 312 | 0 | 1 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | 2 | 1 | 0 | 1 | 1 | 0 | 51 | 2 | 1 |
| GregoBase 3428 (Erit quasi signum) | liquescent fresh | 8 | 5 | 5 | 3 | 2 | 2 | 137 | 0 | 0 |
| GregoBase 3435 (Ave Maria (Alleluia)) | liquescent fresh | 49 | 45 | 45 | 2 | 1 | 1 | 146 | 0 | 0 |
| GregoBase 3443 (Dominus dabit) | liquescent fresh | 12 | 8 | 8 | 0 | 0 | 0 | 98 | 0 | 0 |
| GregoBase 3458 (Corona aurea) | liquescent fresh | 56 | 49 | 49 | 4 | 2 | 2 | 192 | 0 | 1 |
| GregoBase 3400 (Factus est opprobrium) | quilisma fresh | 9 | 6 | 6 | 4 | 1 | 1 | 125 | 0 | 0 |
| GregoBase 3402 (Omnis gloria) | quilisma fresh | 10 | 10 | 10 | 4 | 3 | 3 | 171 | 0 | 1 |
| GregoBase 3404 (Sacerdos sit sanctus) | quilisma fresh | 20 | 15 | 15 | 8 | 4 | 2 | 104 | 0 | 0 |
| GregoBase 3405 (Adjuvabit eam) | quilisma fresh | 54 | 48 | 48 | 5 | 5 | 5 | 323 | 0 | 0 |
| GregoBase 3410 (Magnificat) | quilisma fresh | 40 | 36 | 36 | 8 | 6 | 5 | 257 | 0 | 0 |
| GregoBase 3413 (Haec est Virgo sapiens et una) | quilisma fresh | 56 | 50 | 50 | 8 | 6 | 6 | 135 | 1 | 0 |
| GregoBase 3414 (Vere tu es) | quilisma fresh | 36 | 36 | 36 | 2 | 2 | 2 | 94 | 0 | 0 |
| GregoBase 3416 (Statuit) | quilisma fresh | 6 | 6 | 6 | 1 | 1 | 1 | 122 | 0 | 0 |
| GregoBase 3422 (Confiteantur tibi) | quilisma fresh | 24 | 19 | 19 | 1 | 0 | 0 | 223 | 0 | 0 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | 54 | 45 | 45 | 10 | 7 | 4 | 114 | 0 | 1 |
| GregoBase 3430 (In medio Ecclesiae) | quilisma fresh | 2 | 0 | 0 | 1 | 1 | 1 | 151 | 0 | 1 |
| GregoBase 3436 (Concupivit rex) | quilisma fresh | 48 | 39 | 39 | 8 | 6 | 4 | 116 | 0 | 0 |
| GregoBase 3437 (Adhaesi) | quilisma fresh | 14 | 11 | 8 | 3 | 1 | 1 | 123 | 0 | 0 |
| GregoBase 3450 (Principes) | quilisma fresh | 8 | 8 | 8 | 3 | 3 | 3 | 115 | 0 | 0 |
| GregoBase 3451 (Qui ambulat) | quilisma fresh | 59 | 54 | 54 | 8 | 7 | 6 | 260 | 0 | 0 |
| GregoBase 3452 (Scitote quoniam) | quilisma fresh | 23 | 23 | 23 | 2 | 0 | 0 | 121 | 0 | 1 |
| GregoBase 3455 (Diffusa est (Com.)) | quilisma fresh | 13 | 13 | 13 | 2 | 2 | 2 | 65 | 0 | 1 |
| GregoBase 3459 (Emitte Spiritum) | quilisma fresh | 36 | 34 | 34 | 7 | 5 | 5 | 254 | 0 | 0 |

## Rhombus disagreements to look at

| piece | set | syllable | GABC group | GABC shape | scan shape | where |
|---|---|---|---|---|---|---|
| GregoBase 3412 (Stabat sancta Maria) | fresh | BAT | efEC//efe/fgf//efe/fgf | rhombus | square | p. leaf 428 (leaf 428), staff 1, x 342 |
| GregoBase 3421 (Narraverunt) | liquescent fresh | non | gihhg~ | punctum | rhombus | p. leaf 434 (leaf 434), staff 3, x 1190 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | gau | fg | punctum | rhombus | p. [157] (leaf 742), staff 5, x 786 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | ge | gvFEfwgfg | rhombus | square | p. [157] (leaf 742), staff 5, x 1201 |
| GregoBase 3413 (Haec est Virgo sapiens et una) | quilisma fresh | et | gh!iwji/jvIHG//h!iwjijvIHGge ghGFdeDC | punctum | rhombus | p. [51] (leaf 636), staff 3, x 1083 |
| GregoBase 3437 (Adhaesi) | quilisma fresh | mi | ig/hvFE//f!gwhhi | rhombus | square | p. [125] (leaf 710), staff 3, x 785 |
| GregoBase 3437 (Adhaesi) | quilisma fresh | mi | ig/hvFE//f!gwhhi | rhombus | square | p. [125] (leaf 710), staff 3, x 928 |
| GregoBase 3437 (Adhaesi) | quilisma fresh | o | ijIH | rhombus | square | p. [125] (leaf 710), staff 3, x 1306 |

## Quilisma disagreements to look at

| piece | set | syllable | GABC group | GABC shape | scan shape | where |
|---|---|---|---|---|---|---|
| Salve Regina (solemn tone) | tuned on | et | c | punctum | quilisma | p. 57 (leaf 84), staff 1, x 556 |
| GregoBase 3418 (off-final ending) | held out | ctos | gh | punctum | quilisma | p. leaf 580 (leaf 580), staff 5, x 231 |
| GregoBase 3425 (Domine quinque talenta) | fresh | lis, | i!jwk | quilisma | rhombus | p. leaf 367 (leaf 367), staff 3, x 791 |
| GregoBase 3433 (Qui gloriatur) | fresh | á | jkJGhg/h!iw!jvIHijh | punctum | quilisma | p. 480 (leaf 506), staff 3, x 1415 |
| GregoBase 3408 (Quando orabas) | fresh | bas | f!gwhhvGFgeec | punctum | quilisma | p. leaf 516 (leaf 516), staff 9, x 618 |
| GregoBase 3408 (Quando orabas) | fresh | no. | f!gwhhvGFggf | punctum | quilisma | p. 491 (leaf 517), staff 5, x 762 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | Chri | fe/f!gwh!iv | punctum | quilisma | p. leaf 428 (leaf 428), staff 3, x 786 |
| GregoBase 3412 (Stabat sancta Maria) | fresh | do | fe/f!gwh!iv | punctum | quilisma | p. leaf 428 (leaf 428), staff 6, x 409 |
| GregoBase 3438 (Protege Domine) | fresh | tá | fhGE//g!hi | punctum | quilisma | p. 528 (leaf 554), staff 3, x 1046 |
| GregoBase 3438 (Protege Domine) | fresh | no | fe!fwg!hv | punctum | quilisma | p. 528 (leaf 554), staff 4, x 840 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | gau | gh!jji/jg//hjijk[oll:1]ljj | punctum | quilisma | p. leaf 544 (leaf 544), staff 4, x 635 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | dí | hvGFgvFEf//ghffdg | punctum | quilisma | p. leaf 544 (leaf 544), staff 5, x 946 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | e | fe/f!gwh!iv | quilisma | square | p. leaf 641 (leaf 641), staff 1, x 328 |
| GregoBase 3417 (Audi filia et vide (Tract.)) | liquescent fresh | gis. | fe/f!hh/ijIGh | punctum | quilisma | p. leaf 641 (leaf 641), staff 3, x 1461 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | tá | g/hjh | punctum | quilisma | p. [157] (leaf 742), staff 5, x 629 |
| GregoBase 3419 (Gaudeamus... Mariae... Boni Consilii) | liquescent fresh | ge | gvFEfwgfg | quilisma | square | p. [157] (leaf 742), staff 5, x 1248 |
| GregoBase 3458 (Corona aurea) | liquescent fresh | tá | gh!iwj/kjjvIH | punctum | quilisma | p. [145] (leaf 730), staff 7, x 1048 |
| GregoBase 3402 (Omnis gloria) | quilisma fresh | in | h!iwj/kjj | punctum | quilisma | p. [167] (leaf 752), staff 2, x 1393 |
| GregoBase 3404 (Sacerdos sit sanctus) | quilisma fresh | LÚ | fg!hiivHGhwi | quilisma | rhombus | p. [93] (leaf 678), staff 1, x 489 |
| GregoBase 3404 (Sacerdos sit sanctus) | quilisma fresh | co | fg!hiivHGhwi | quilisma | rhombus | p. [93] (leaf 678), staff 3, x 717 |
| GregoBase 3410 (Magnificat) | quilisma fresh | o | hg/h!iwj | quilisma | square | p. leaf 755 (leaf 755), staff 2, x 964 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | ? | hi/jijIH/iwj!kvJIGgf/hiivHFE | quilisma | rhombus | p. [161] (leaf 746), staff 1, x 1285 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | au | hiivHFE//gf/hiivHFEfg | punctum | quilisma | p. [161] (leaf 746), staff 3, x 710 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | én | i!jw!kvJI | quilisma | liquescent | p. [161] (leaf 746), staff 3, x 1363 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | sá | hi/jijIHiwj!kvJI,hi/jijIHiwj!kvJIGgf/hiivHFE,gf/hiivHFEfg | quilisma | square | p. [161] (leaf 746), staff 4, x 425 |
| GregoBase 3430 (In medio Ecclesiae) | quilisma fresh | plé | ixf!gwh!iv | punctum | quilisma | p. [34] (leaf 619), staff 4, x 470 |
| GregoBase 3436 (Concupivit rex) | quilisma fresh | PÍ | ixhih/ghGF//hiHGhw!ivHGhi | quilisma | square | p. [58] (leaf 643), staff 4, x 789 |
| GregoBase 3436 (Concupivit rex) | quilisma fresh | ? | d!ewf!gv//fh/GFEDewfd | quilisma | square | p. [58] (leaf 643), staff 8, x 975 |
| GregoBase 3451 (Qui ambulat) | quilisma fresh | ná | ki!jw!kvJI | quilisma | square | p. [161] (leaf 746), staff 9, x 319 |
| GregoBase 3452 (Scitote quoniam) | quilisma fresh | LE | gg/hih//fg | punctum | quilisma | p. [206] (leaf 791), staff 9, x 598 |
| GregoBase 3455 (Diffusa est (Com.)) | quilisma fresh | De | d!ew!fvEDCd | punctum | quilisma | p. leaf 520 (leaf 520), staff 6, x 969 |

## Liquescent disagreements to look at

A GABC liquescent the reader saw as another shape, a head read as a liquescent, or a liquescent note the reader added that pairs with no GABC note of its pitch.

| piece | set | syllable | GABC group | GABC shape | scan shape | where |
|---|---|---|---|---|---|---|
| GregoBase 3434 (off-final ending) | held out | car | hhg~ | liquescent | square | p. leaf 354 (leaf 354), staff 8, x 157 |
| GregoBase 3408 (Quando orabas) | fresh | ó | iv//giHGEf , c!ef!hhf/gvEC//efef | punctum | liquescent | p. 491 (leaf 517), staff 4, x 1620 |
| GregoBase 3447 (Assumpta est) | liquescent fresh | Dó | hv//gjIGhh//fh!jvGFfd/ef!ghg | punctum | liquescent | p. leaf 544 (leaf 544), staff 5, x 1532 |
| GregoBase 3428 (Erit quasi signum) | liquescent fresh | (none) |  | no note | liquescent | p. [200] (leaf 785), staff 5, x 1182 |
| GregoBase 3428 (Erit quasi signum) | liquescent fresh | e | ji~ | liquescent | rhombus | p. [200] (leaf 785), staff 7, x 1045 |
| GregoBase 3400 (Factus est opprobrium) | quilisma fresh | in | hg~ | liquescent | rhombus | p. [142] (leaf 727), staff 6, x 1687 |
| GregoBase 3405 (Adjuvabit eam) | quilisma fresh | (none) |  | no note | liquescent | p. [50] (leaf 635), staff 8, x 1109 |
| GregoBase 3410 (Magnificat) | quilisma fresh | ma | hg/hf//hjhj | punctum | liquescent | p. [169] (leaf 754), staff 5, x 1566 |
| GregoBase 3427 (Lingua pravorum) | quilisma fresh | én | i!jw!kvJI | quilisma | liquescent | p. [161] (leaf 746), staff 3, x 1363 |
| GregoBase 3436 (Concupivit rex) | quilisma fresh | rem | gh~ | liquescent | square | p. [58] (leaf 643), staff 7, x 1698 |
