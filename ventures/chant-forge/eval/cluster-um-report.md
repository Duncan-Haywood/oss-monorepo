# Part c: how much darker than its vowel each nasal after /u/ or /o/ gets

Written by `node eval/cluster-um-diag.mjs`. Tilt is dB above 1 kHz against under 500 Hz; "coda - vowel" is the darkest
40 ms of the coda against the median tilt of the vowel (from the reader's reference to 0.15 s before the note's end);
"coda - darkest vowel" is against the darkest 40 ms of that vowel. 10th / 50th / 90th percentiles. The plain level
rule asks for 15 dB darker than the reference.

| group | notes | coda - vowel (dB) | coda - darkest vowel (dB) | 15 dB or more under the vowel |
|---|---|---|---|---|
| cluster onset, read | 39 | -20 / -13 / -9 | -15 / -5 / 0 | 14 |
| cluster onset, missed | 21 | -15 / -10 / -1 | -8 / 0 / 4 | 2 |
| single onset, read | 84 | -33 / -26 / -18 | -26 / -19 / -9 | 77 |
| single onset, missed | 0 | - | - | - |

## Every missed note

| syllable | pitch | note | vowel tilt | vowel 40 ms range | coda darkest | first 60 ms |
|---|---|---|---|---|---|---|
| prun | 48 | quarter | -35 | -41 to -27 | -49 | -37 |
| brum | 58 | quarter | -35 | -44 to -25 | -49 | -43 |
| prun | 58 | quarter | -38 | -43 to -30 | -54 | -41 |
| brum | 62 | quarter | -39 | -47 to -22 | -43 | -46 |
| glum | 62 | quarter | -39 | -44 to -23 | -40 | -41 |
| stum | 62 | quarter | -39 | -45 to -29 | -42 | -36 |
| flum | 62 | quarter | -36 | -47 to -23 | -47 | -26 |
| brum | 63 | quarter | -38 | -47 to -28 | -44 | -33 |
| glum | 63 | quarter | -38 | -45 to -29 | -44 | -38 |
| prun | 63 | quarter | -38 | -44 to -29 | -47 | -41 |
| glum | 64 | quarter | -31 | -43 to -17 | -46 | -33 |
| brum | 58 | eighth | -32 | -38 to -23 | -48 | -34 |
| glum | 58 | eighth | -37 | -42 to -33 | -38 | -40 |
| flum | 58 | eighth | -38 | -44 to -30 | -42 | -37 |
| brum | 62 | eighth | -40 | -45 to -31 | -40 | -38 |
| glum | 62 | eighth | -35 | -47 to -23 | -46 | -33 |
| stum | 62 | eighth | -37 | -42 to -29 | -47 | -39 |
| brum | 63 | eighth | -38 | -45 to -25 | -48 | -37 |
| stum | 63 | eighth | -39 | -46 to -32 | -41 | -36 |
| flum | 63 | eighth | -36 | -43 to -28 | -49 | -43 |
| stum | 64 | eighth | -33 | -38 to -18 | -46 | -25 |
