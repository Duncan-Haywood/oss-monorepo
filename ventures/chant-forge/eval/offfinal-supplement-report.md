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
| GregoBase 3402 (off-final ending, p. [167]) | Graduale Romanum, Vatican 1908 | leaf 750, leaf 751, [167], leaf 753 | 1173 | 185 | 0 | 2 | 0 | 98.9% of 187 GABC notes | 197 of 200 |
| GregoBase 3419 (middle, p. [157]) | Graduale Romanum, Vatican 1908 | [157] | 33 | 33 | 0 | 0 | 0 | 100.0% of 33 GABC notes | 197 of 200 |
| GregoBase 3419 (off-final ending, Gaudeamus pp. 486-487) | Graduale Romanum, Vatican 1908 | 486, 487 | 360 | 165 | 0 | 43 | 0 | 79.3% of 208 GABC notes | 197 of 200 |
| GregoBase 3427 (off-final ending, p. [161]) | Graduale Romanum, Vatican 1908 | leaf 744, leaf 745, [161], leaf 747 | 1291 | 169 | 0 | 13 | 0 | 92.9% of 182 GABC notes | 193 of 200 |
| GregoBase 3451 (off-final ending, p. [161]) | Graduale Romanum, Vatican 1908 | leaf 744, leaf 745, [161], leaf 747 | 1291 | 325 | 1 | 6 | 0 | 97.9% of 332 GABC notes | 199 of 200 |

## GregoBase 3402 (off-final ending, p. [167])

corpus/gregobase-1908/3402.gabc, 187 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g h/h i/i g/g h/h; GABC notes covered 1-187 of 187.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| in | h!iwj/kjj | i | - | not read; near p. [167] (leaf 752), staff 2, x 1393 |
| in | h!iwj/kjj | j | - | not read; near p. [167] (leaf 752), staff 2, x 1441 |

## GregoBase 3419 (middle, p. [157])

corpus/gregobase-1908/3419.gabc, 208 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/· f/· d/· c/· d/· f/·; GABC notes covered 41-73 of 208.

No disagreement among the notes the reader found.

## GregoBase 3419 (off-final ending, Gaudeamus pp. 486-487)

corpus/gregobase-1908/3419.gabc, 208 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): f/f f/f d/d c/c d/d f/f; GABC notes covered 1-208 of 208.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| re | ghg | g | - | not read; near p. 486 (leaf 511), staff 2, x 999 |
| be | f | f | - | not read; near p. 486 (leaf 511), staff 2, x 1019 |
| tae | f | f | - | not read; near p. 486 (leaf 511), staff 2, x 1019 |
| gi | hih | h | - | not read; near p. 486 (leaf 511), staff 2, x 1387 |
| Bo | fg | f | - | not read; near p. 486 (leaf 511), staff 2, x 1406 |
| Bo | fg | g | - | not read; near p. 486 (leaf 511), staff 2, x 1406 |
| ni | g | g | - | not read; near p. 486 (leaf 511), staff 2, x 1462 |
| Con | g | g | - | not read; near p. 486 (leaf 511), staff 2, x 1462 |
| li | g | g | - | not read; near p. 486 (leaf 511), staff 2, x 1462 |
| i | f | f | - | not read; near p. 486 (leaf 511), staff 2, x 1462 |
| Ma | fgf | f | - | not read; near p. 486 (leaf 511), staff 2, x 1462 |
| Ma | fgf | g | - | not read; near p. 486 (leaf 511), staff 2, x 1613 |
| Ma | fgf | f | - | not read; near p. 486 (leaf 511), staff 2, x 1613 |
| tris: | f | f | - | not read; near p. 486 (leaf 511), staff 2, x 1613 |
| láu | g/hjHG | h | - | not read; near p. 486 (leaf 511), staff 3, x 1573 |
| láu | g/hjHG | g | - | not read; near p. 486 (leaf 511), staff 3, x 1680 |
| dant | hg | g | - | not read; near p. 486 (leaf 511), staff 3, x 1680 |
| Fí | fge | f | - | not read; near p. 486 (leaf 511), staff 3, x 1680 |
| Fí | fge | g | - | not read; near p. 486 (leaf 511), staff 3, x 1680 |
| Fí | fge | e | - | not read; near p. 486 (leaf 511), staff 3, x 1698 |
| li | f | f | - | not read; near p. 486 (leaf 511), staff 3, x 1698 |
| um | fg/hfgvFE | f | - | not read; near p. 486 (leaf 511), staff 3, x 1698 |
| um | fg/hfgvFE | h | - | not read; near p. 486 (leaf 511), staff 3, x 1698 |
| um | fg/hfgvFE | f | - | not read; near p. 487 (leaf 512), staff 1, x 200 |
| um | fg/hfgvFE | e | - | not read; near p. 487 (leaf 512), staff 1, x 200 |
| De | d!ewfef | d | - | not read; near p. 487 (leaf 512), staff 1, x 200 |
| De | d!ewfef | e | - | not read; near p. 487 (leaf 512), staff 1, x 200 |
| De | d!ewfef | f | - | not read; near p. 487 (leaf 512), staff 1, x 221 |
| De | d!ewfef | e | - | not read; near p. 487 (leaf 512), staff 1, x 221 |
| De | d!ewfef | f | - | not read; near p. 487 (leaf 512), staff 1, x 221 |
| i. | ed | d | - | not read; near p. 487 (leaf 512), staff 1, x 221 |
| Al | ixhi | h | - | not read; near p. 487 (leaf 512), staff 1, x 221 |
| Al | ixhi | i | - | not read; near p. 487 (leaf 512), staff 1, x 221 |
| le | h | h | - | not read; near p. 487 (leaf 512), staff 1, x 221 |
| lú | hgh | h | - | not read; near p. 487 (leaf 512), staff 1, x 221 |
| lú | hgh | g | - | not read; near p. 487 (leaf 512), staff 1, x 277 |
| lú | hgh | h | - | not read; near p. 487 (leaf 512), staff 1, x 277 |
| ia, | fd | f | - | not read; near p. 487 (leaf 512), staff 1, x 277 |
| ia, | fd | d | - | not read; near p. 487 (leaf 512), staff 1, x 277 |
| al | fg | g | - | not read; near p. 487 (leaf 512), staff 1, x 277 |
| le | e!fg/hfgvFE | e | - | not read; near p. 487 (leaf 512), staff 1, x 333 |
| bum | h | h | - | not read; near p. 487 (leaf 512), staff 1, x 1403 |
| ra | hjh | h | - | not read; near p. 487 (leaf 512), staff 2, x 770 |

## GregoBase 3427 (off-final ending, p. [161])

corpus/gregobase-1908/3427.gabc, 188 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): e/e f/f g/g f/f e/e e/e; GABC notes covered 7-188 of 188.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| LÚ | hi!jw!kvJIH | j | - | not read; near p. [161] (leaf 746), staff 1, x 533 |
| LÚ | hi!jw!kvJIH | i | - | not read; near p. [161] (leaf 746), staff 1, x 598 |
| ? | hi/jijIHiwj!kvJI | j | - | not read; near p. [161] (leaf 746), staff 1, x 825 |
| ? | hi/jijIH/iwj!kvJIGgf/hiivHFE | i | - | not read; near p. [161] (leaf 746), staff 1, x 1335 |
| ? | hi/jijIH/iwj!kvJIGgf/hiivHFE | g | - | not read; near p. [161] (leaf 746), staff 1, x 1411 |
| Lin | ef!gw!hvGE | g | - | not read; near p. [161] (leaf 746), staff 2, x 617 |
| Lin | ef!gw!hvGE | g | - | not read; near p. [161] (leaf 746), staff 2, x 653 |
| Lin | ef!gw!hvGE | e | - | not read; near p. [161] (leaf 746), staff 2, x 769 |
| rí | hi/jijIHiwj!kvJI , hi/jijIHiwj!kv | i | - | not read; near p. [161] (leaf 746), staff 2, x 1446 |
| lin | jvIG | i | - | not read; near p. [161] (leaf 746), staff 3, x 501 |
| lin | jvIG | g | - | not read; near p. [161] (leaf 746), staff 3, x 616 |
| au | hiivHFE//gf/hiivHFEfg | e | - | not read; near p. [161] (leaf 746), staff 3, x 796 |
| én | i!jw!kvJI | i | - | not read; near p. [161] (leaf 746), staff 3, x 1419 |

## GregoBase 3451 (off-final ending, p. [161])

corpus/gregobase-1908/3451.gabc, 332 GABC notes; scan of Graduale Romanum, Vatican 1908 (archive.org item `gradualesacrosan0000cath`).

Ending, GABC/scan (· = not read or not on these pages): h/h g/g f/f g/g h/h f/f; GABC notes covered 1-332 of 332.

| syllable | GABC group | GABC note | scan | where |
|---|---|---|---|---|
| lén | hfg/hvFEge/fg | h | g | p. [161] (leaf 746), staff 5, x 815 |
| lén | hfg/hvFEge/fg | e | - | not read; near p. [161] (leaf 746), staff 5, x 908 |
| au | hiHF | h | - | not read; near p. [161] (leaf 746), staff 6, x 843 |
| au | hiHF | f | - | not read; near p. [161] (leaf 746), staff 6, x 957 |
| á | hf!gwh/if/ij | g | - | not read; near p. [161] (leaf 746), staff 6, x 1505 |
| su | hg/hi!jvHGhhg,ihivHF | g | - | not read; near p. leaf 747 (leaf 747), staff 2, x 1143 |
| mo | fhvGFg | g | - | not read; near p. leaf 747 (leaf 747), staff 3, x 761 |
