# lipShut's upper-band hold on the development parts (2026-11-21)

`node eval/coda-check.mjs` (the default, byte-identical to `eval/coda-check-report.md` before part g was added),
`--shut hiHold=8` and `--shut hiHold=10`, every part A-f, run side by side. Each line is a report row that changed:
the part, the row, and its columns (the part's own modes; the first column is the reader that part calls default).
No other row of any part moved, so every vowel-only control and every "read as a nasal" count is identical.

## hiHold 8 (registered on part g, thirty-first round; failed)

```
before J. | cluster syllables read exactly (on their nasal) | 128 of 132 | 113 of 132 |
after  J. | cluster syllables read exactly (on their nasal) | 128 of 132 | 114 of 132 |
before O. | cluster syllables read exactly (on their nasal) | 116 of 120 | 115 of 120 |
after  O. | cluster syllables read exactly (on their nasal) | 117 of 120 | 116 of 120 |
before Y. | nasal codas read exactly | 46 of 48 | 46 of 48 |
after  Y. | nasal codas read exactly | 47 of 48 | 47 of 48 |
before b. | nasals after /u/ or /o/ read exactly | 133 of 144 | 135 of 144 |
before b. | of them, on D4-E4 | 64 of 72 | 65 of 72 |
after  b. | nasals after /u/ or /o/ read exactly | 135 of 144 | 135 of 144 |
after  b. | of them, on D4-E4 | 65 of 72 | 65 of 72 |
before d. | nasals after /u/ or /o/ read exactly | 136 of 144 | 136 of 144 |
after  d. | nasals after /u/ or /o/ read exactly | 137 of 144 | 137 of 144 |
before f. | nasals after /u/ or /o/ read exactly | 300 of 312 | 298 of 312 |
after  f. | nasals after /u/ or /o/ read exactly | 302 of 312 | 302 of 312 |
```

## hiHold 10 (run beside it, not registered)

```
before J. | cluster syllables read exactly (on their nasal) | 128 of 132 | 113 of 132 |
after  J. | cluster syllables read exactly (on their nasal) | 128 of 132 | 115 of 132 |
before O. | cluster syllables read exactly (on their nasal) | 116 of 120 | 115 of 120 |
after  O. | cluster syllables read exactly (on their nasal) | 117 of 120 | 116 of 120 |
before U. | n-cluster codas read as a nasal | 46 of 48 | 46 of 48 |
after  U. | n-cluster codas read as a nasal | 47 of 48 | 47 of 48 |
before X. | n-clusters read as their nasal | 54 of 60 | 54 of 60 |
before X. | n-clusters read as a stop | 6 | 6 |
after  X. | n-clusters read as their nasal | 55 of 60 | 55 of 60 |
after  X. | n-clusters read as a stop | 5 | 5 |
before Y. | nasal codas read exactly | 46 of 48 | 46 of 48 |
after  Y. | nasal codas read exactly | 47 of 48 | 47 of 48 |
before a. | n-clusters read as their nasal | 42 of 48 | 43 of 48 |
after  a. | n-clusters read as their nasal | 42 of 48 | 44 of 48 |
before b. | nasals after /u/ or /o/ read exactly | 133 of 144 | 135 of 144 |
before b. | of them, on D4-E4 | 64 of 72 | 65 of 72 |
after  b. | nasals after /u/ or /o/ read exactly | 135 of 144 | 135 of 144 |
after  b. | of them, on D4-E4 | 65 of 72 | 65 of 72 |
before d. | nasals after /u/ or /o/ read exactly | 136 of 144 | 136 of 144 |
after  d. | nasals after /u/ or /o/ read exactly | 137 of 144 | 137 of 144 |
before f. | nasals after /u/ or /o/ read exactly | 300 of 312 | 298 of 312 |
after  f. | nasals after /u/ or /o/ read exactly | 302 of 312 | 302 of 312 |
```
