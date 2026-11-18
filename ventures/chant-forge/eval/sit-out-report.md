# --sit-out on the corpus

`node eval/sit-out.mjs`. **The two range tests are made up** (`examples/`, placeholder names), not a real
choir, so this shows what the option trades, not what any real choir can sing. For each N: whether the
chant fits in unison (on the band all but N singers reach) or else how many notes the whole choir sings
in a tenor/bass split (sections from the file, or divided by range for the unsectioned file), then how
many singers sit at least one note out and the most notes one singer sits out.

| range test | chant | N = 0 | N = 1 | N = 2 |
|---|---|---|---|---|
| range-test.csv | dies-irae.gabc | full choir 16/613; 0 sit out, most 0 | full choir 347/613; 2 sit out, most 38/438 | full choir 512/613; 5 sit out, most 31/512 |
| range-test.csv | pange-lingua-full.gabc | full choir 108/318; 0 sit out, most 0 | full choir 258/318; 2 sit out, most 36/258 | unison; 3 sit out, most 66/318 |
| range-test.csv | pange-lingua.gabc | full choir 18/53; 0 sit out, most 0 | full choir 43/53; 2 sit out, most 6/43 | unison; 3 sit out, most 11/53 |
| range-test.csv | salve-regina.gabc | full choir 53/231; 0 sit out, most 0 | full choir 170/231; 2 sit out, most 19/174 | full choir 207/231; 4 sit out, most 69/227 |
| range-test.csv | te-deum-simple.gabc | full choir 324/552; 0 sit out, most 0 | full choir 452/552; 1 sit out, most 152/552 | unison; 3 sit out, most 152/552 |
| range-test.csv | te-deum.gabc | full choir 246/637; 0 sit out, most 0 | full choir 537/637; 1 sit out, most 194/637 | unison; 3 sit out, most 194/637 |
| range-test.csv | veni-creator-full.gabc | full choir 84/301; 0 sit out, most 0 | full choir 154/301; 2 sit out, most 21/301 | unison; 3 sit out, most 21/301 |
| range-test.csv | veni-creator.gabc | full choir 12/43; 0 sit out, most 0 | full choir 22/43; 2 sit out, most 3/43 | unison; 3 sit out, most 3/43 |
| range-test-sections.csv | dies-irae.gabc | full choir 337/613; 0 sit out, most 0 | full choir 512/613; 3 sit out, most 31/512 | full choir 600/613; 5 sit out, most 19/600 |
| range-test-sections.csv | pange-lingua-full.gabc | full choir 150/318; 0 sit out, most 0 | unison; 2 sit out, most 18/318 | unison; 2 sit out, most 18/318 |
| range-test-sections.csv | pange-lingua.gabc | full choir 25/53; 0 sit out, most 0 | unison; 2 sit out, most 3/53 | unison; 2 sit out, most 3/53 |
| range-test-sections.csv | salve-regina.gabc | full choir 166/231; 0 sit out, most 0 | full choir 207/231; 3 sit out, most 17/227 | full choir 227/231; 4 sit out, most 17/227 |
| range-test-sections.csv | te-deum-simple.gabc | full choir 452/552; 0 sit out, most 0 | unison; 2 sit out, most 152/552 | unison; 2 sit out, most 152/552 |
| range-test-sections.csv | te-deum.gabc | full choir 537/637; 0 sit out, most 0 | unison; 2 sit out, most 194/637 | unison; 2 sit out, most 194/637 |
| range-test-sections.csv | veni-creator-full.gabc | full choir 154/301; 0 sit out, most 0 | unison; 1 sit out, most 14/301 | unison; 1 sit out, most 14/301 |
| range-test-sections.csv | veni-creator.gabc | full choir 22/43; 0 sit out, most 0 | unison; 1 sit out, most 2/43 | unison; 1 sit out, most 2/43 |

