# Range-test divider against brute force

`node eval/singers-check.mjs` (seed 20261113). Random choirs: each singer's low E2-Eb3, range 8-19
semitones. **Synthetic, not real range tests.** Brute force tries every assignment of singers to k labelled
sections; the divider tries every contiguous cut of the singers sorted by mid-range. Both score the same rule:
widest narrowest section, then widest total.

| sections | singers | choirs | no division fits | narrowest section equal | total also equal | mean total lost (semitones) |
|---|---|---|---|---|---|---|
| 2 | 6 | 40 | 0 | 40 of 40 | 40 of 40 | 0.00 |
| 2 | 8 | 40 | 0 | 40 of 40 | 40 of 40 | 0.00 |
| 2 | 10 | 40 | 0 | 40 of 40 | 40 of 40 | 0.00 |
| 2 | 12 | 40 | 0 | 40 of 40 | 40 of 40 | 0.00 |
| 3 | 6 | 30 | 0 | 30 of 30 | 30 of 30 | 0.00 |
| 3 | 8 | 30 | 0 | 30 of 30 | 30 of 30 | 0.00 |
| 3 | 10 | 30 | 0 | 30 of 30 | 29 of 30 | 0.10 |
| 4 | 6 | 20 | 0 | 20 of 20 | 18 of 20 | 0.30 |
| 4 | 8 | 20 | 0 | 20 of 20 | 18 of 20 | 0.25 |

Time for the divider alone (this machine):

| singers | sections | time |
|---|---|---|
| 40 | 4 | 1 ms |
| 100 | 4 | 7 ms |
| 200 | 3 | 1 ms |
| 200 | 4 | 53 ms |

