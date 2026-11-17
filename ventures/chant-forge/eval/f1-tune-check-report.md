# Formant tuning on high notes

Written by `node eval/f1-tune-check.mjs`. Held 2 s notes from `singNote` (one choir voice-group,
five detuned voices), seeds 11, 23, 37, 41, 59; level is the RMS from 0.4 to 1.95 s, F1 the LPC estimate
(`formants.mjs`) over the same span, the vowel the nearest of the five targets. Tuning on: F1 raised to at
least 1.1 x f0 (`f1Tune: 1.1`); off: the Peterson and Barney targets at every pitch.

Pre-registered before the first run (the header of `eval/f1-tune-check.mjs`): line 1, at G4 and A4 the
level of /i/ and /u/ against /a/ rises by 2 dB or more on average; line 2, vowels read right E2 to A4 no
fewer than with tuning off. Line 3 (corpus vowels and codas at final D3) is in the vowel and coda reports.

## Level against /a/ at the same pitch (dB), off -> on

| pitch | f0 (Hz) | /e/ | /i/ | /o/ | /u/ |
|---|---|---|---|---|---|
| E2 | 82 | -4.6 -> -4.6 | -5.5 -> -5.5 | -0.5 -> -0.5 | -5.1 -> -5.1 |
| A2 | 110 | -4.0 -> -4.0 | -5.8 -> -5.8 | -0.1 -> -0.1 | -5.0 -> -5.0 |
| D3 | 147 | -6.3 -> -6.3 | -6.9 -> -6.9 | -0.6 -> -0.6 | -4.6 -> -4.6 |
| G3 | 196 | -4.9 -> -4.9 | -6.3 -> -6.3 | 2.1 -> 2.1 | -6.3 -> -6.3 |
| C4 | 262 | -2.5 -> -2.5 | -4.0 -> -4.5 | -0.7 -> -0.7 | -4.5 -> -4.5 |
| E4 | 330 | -7.7 -> -7.7 | -9.1 -> -2.5 | -1.8 -> -1.8 | -3.6 -> -1.5 |
| G4 | 392 | -8.6 -> -8.6 | -16.5 -> -3.7 | -3.5 -> -3.5 | -11.6 -> -1.9 |
| A4 | 440 | -2.0 -> -2.0 | -14.8 -> 0.9 | 0.4 -> 0.4 | -9.8 -> 3.5 |

Line 1: /i/ and /u/ at G4 and A4 against /a/ change by 12.8, 9.7, 15.7, 13.3 dB, mean 12.87 dB (bar: 2 dB or more): **holds**.

## Vowel read right (of 5 seeds) and measured F1 (Hz), off -> on

| pitch | /a/ | /e/ | /i/ | /o/ | /u/ |
|---|---|---|---|---|---|
| E2 | 5 -> 5 (F1 737 -> 737) | 5 -> 5 (F1 543 -> 543) | 5 -> 5 (F1 268 -> 268) | 5 -> 5 (F1 576 -> 576) | 5 -> 5 (F1 304 -> 304) |
| A2 | 5 -> 5 (F1 739 -> 739) | 5 -> 5 (F1 552 -> 552) | 5 -> 5 (F1 288 -> 288) | 5 -> 5 (F1 578 -> 578) | 5 -> 5 (F1 316 -> 316) |
| D3 | 5 -> 5 (F1 729 -> 729) | 5 -> 5 (F1 539 -> 539) | 5 -> 5 (F1 287 -> 287) | 5 -> 5 (F1 582 -> 582) | 5 -> 5 (F1 297 -> 297) |
| G3 | 5 -> 5 (F1 767 -> 767) | 5 -> 5 (F1 551 -> 551) | 5 -> 5 (F1 267 -> 267) | 5 -> 5 (F1 580 -> 580) | 5 -> 5 (F1 335 -> 335) |
| C4 | 5 -> 5 (F1 767 -> 767) | 5 -> 5 (F1 526 -> 526) | 5 -> 5 (F1 278 -> 286) | 5 -> 5 (F1 529 -> 529) | 5 -> 5 (F1 288 -> 288) |
| E4 | 5 -> 5 (F1 656 -> 656) | 5 -> 5 (F1 576 -> 576) | 5 -> 5 (F1 338 -> 338) | 0 -> 0 (F1 650 -> 650) | 5 -> 5 (F1 338 -> 343) |
| G4 | 5 -> 5 (F1 776 -> 776) | 5 -> 5 (F1 462 -> 462) | 1 -> 1 (F1 410 -> 402) | 4 -> 4 (F1 527 -> 527) | 4 -> 5 (F1 405 -> 400) |
| A4 | 5 -> 5 (F1 858 -> 858) | 5 -> 5 (F1 463 -> 463) | 0 -> 0 (F1 462 -> 448) | 5 -> 5 (F1 448 -> 448) | 0 -> 0 (F1 446 -> 442) |

Line 2: read right E2 to A4, off 179 of 200 (89.5%), on 180 of 200 (90.0%): **holds**.

