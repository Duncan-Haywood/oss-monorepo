# Opening /l/ against the vowel it goes to

Written by `node eval/onset-lateral-check.mjs`. A held syllable *l* + vowel, 0.6 s; the /l/ is the RMS of the middle half of
its span (12.5-37.5 ms), the vowel the RMS of 0.30-0.45 s. Tilt: the whole /l/'s energy under 500 Hz against
its energy above 1 kHz (a nasal murmur sits 28 dB or more; `MURMUR_TILT`).

## Predictions (pre-registered in the script header)

| prediction | main (fixed gain) | per-note gain | |
|---|---|---|---|
| (1) one voice: spread 4 dB or less, every cell under its vowel | -7.7 dB to +4.8 dB (spread 12.5 dB), mean -1.4 dB; at or over the vowel: 11 of 30 | -6.4 dB to -5.7 dB (spread 0.7 dB), mean -6.0 dB; at or over the vowel: 0 of 30 | holds |
| (2) five voices, 12 seeds: spread 6 dB or less, every cell under | -7.7 dB to +6.3 dB (spread 13.9 dB), mean -0.9 dB; at or over the vowel: 13 of 30 | -6.6 dB to -4.2 dB (spread 2.4 dB), mean -5.5 dB; at or over the vowel: 0 of 30 | holds |
| (3) tilt within 0.5 dB of main in every cell | | largest change 0.00 dB | holds |

(4) and (5) are read from eval/consonant-check-report.md, eval/coda-check-report.md and eval/vowel-check-report.md (README).

## One voice, no vibrato: per-note gain

| pitch | la level | le level | li level | lo level | lu level | la tilt | le tilt | li tilt | lo tilt | lu tilt |
|---|---|---|---|---|---|---|---|---|---|---|
| E2 | -5.9 dB | -5.9 dB | -5.9 dB | -5.9 dB | -5.9 dB | 18.0 dB | 18.0 dB | 18.0 dB | 18.0 dB | 18.0 dB |
| A2 | -6.2 dB | -6.2 dB | -6.2 dB | -6.2 dB | -6.2 dB | 17.6 dB | 17.6 dB | 17.6 dB | 17.6 dB | 17.6 dB |
| D3 | -5.7 dB | -5.7 dB | -5.7 dB | -5.7 dB | -5.7 dB | 18.4 dB | 18.4 dB | 18.4 dB | 18.4 dB | 18.4 dB |
| G3 | -6.3 dB | -6.3 dB | -6.3 dB | -6.4 dB | -6.3 dB | 20.1 dB | 20.1 dB | 20.1 dB | 20.1 dB | 20.1 dB |
| C4 | -5.9 dB | -5.9 dB | -5.9 dB | -5.9 dB | -5.9 dB | 14.2 dB | 14.2 dB | 14.2 dB | 14.2 dB | 14.2 dB |
| E4 | -5.8 dB | -5.8 dB | -5.8 dB | -5.8 dB | -5.8 dB | 18.1 dB | 18.1 dB | 18.1 dB | 18.1 dB | 18.1 dB |

## One voice, no vibrato: fixed gain (main, `onsetLateral: 'first'`)

| pitch | la level | le level | li level | lo level | lu level | la tilt | le tilt | li tilt | lo tilt | lu tilt |
|---|---|---|---|---|---|---|---|---|---|---|
| E2 | -3.7 dB | +1.0 dB | +1.8 dB | -3.2 dB | +1.4 dB | 18.0 dB | 18.0 dB | 18.0 dB | 18.0 dB | 18.0 dB |
| A2 | -4.3 dB | -0.3 dB | +1.6 dB | -4.2 dB | +0.7 dB | 17.6 dB | 17.6 dB | 17.6 dB | 17.6 dB | 17.6 dB |
| D3 | -5.8 dB | +1.1 dB | +1.7 dB | -4.7 dB | -0.5 dB | 18.4 dB | 18.4 dB | 18.4 dB | 18.4 dB | 18.4 dB |
| G3 | -1.9 dB | +3.4 dB | +4.8 dB | -3.8 dB | +4.8 dB | 20.1 dB | 20.1 dB | 20.1 dB | 20.1 dB | 20.1 dB |
| C4 | -7.7 dB | -5.5 dB | -3.2 dB | -7.2 dB | -3.3 dB | 14.2 dB | 14.2 dB | 14.2 dB | 14.2 dB | 14.2 dB |
| E4 | -3.7 dB | +4.0 dB | -1.2 dB | -2.0 dB | -2.2 dB | 18.1 dB | 18.1 dB | 18.1 dB | 18.1 dB | 18.1 dB |

## Five voices, power over 12 seeds: per-note gain

| pitch | la level | le level | li level | lo level | lu level | la tilt | le tilt | li tilt | lo tilt | lu tilt |
|---|---|---|---|---|---|---|---|---|---|---|
| E2 | -6.5 dB | -6.3 dB | -6.6 dB | -6.2 dB | -6.5 dB | 17.5 dB | 17.5 dB | 17.5 dB | 17.5 dB | 17.5 dB |
| A2 | -6.3 dB | -5.9 dB | -5.9 dB | -6.2 dB | -5.9 dB | 16.2 dB | 16.2 dB | 16.2 dB | 16.2 dB | 16.2 dB |
| D3 | -4.7 dB | -4.9 dB | -4.5 dB | -4.9 dB | -4.2 dB | 21.1 dB | 21.1 dB | 21.1 dB | 21.1 dB | 21.1 dB |
| G3 | -4.7 dB | -5.0 dB | -5.0 dB | -5.4 dB | -4.9 dB | 23.8 dB | 23.8 dB | 23.8 dB | 23.8 dB | 23.8 dB |
| C4 | -5.8 dB | -6.1 dB | -5.6 dB | -6.2 dB | -5.7 dB | 14.2 dB | 14.2 dB | 14.2 dB | 14.2 dB | 14.2 dB |
| E4 | -5.2 dB | -4.8 dB | -4.7 dB | -5.3 dB | -4.7 dB | 15.8 dB | 15.8 dB | 15.8 dB | 15.8 dB | 15.8 dB |

## Five voices, power over 12 seeds: fixed gain

| pitch | la level | le level | li level | lo level | lu level | la tilt | le tilt | li tilt | lo tilt | lu tilt |
|---|---|---|---|---|---|---|---|---|---|---|
| E2 | -4.3 dB | +0.5 dB | +1.1 dB | -3.5 dB | +0.8 dB | 17.5 dB | 17.5 dB | 17.5 dB | 17.5 dB | 17.5 dB |
| A2 | -4.5 dB | -0.0 dB | +1.8 dB | -4.2 dB | +0.9 dB | 16.2 dB | 16.2 dB | 16.2 dB | 16.2 dB | 16.2 dB |
| D3 | -4.8 dB | +1.9 dB | +2.8 dB | -4.0 dB | +1.0 dB | 21.1 dB | 21.1 dB | 21.1 dB | 21.1 dB | 21.1 dB |
| G3 | -0.3 dB | +4.7 dB | +6.1 dB | -2.8 dB | +6.3 dB | 23.8 dB | 23.8 dB | 23.8 dB | 23.8 dB | 23.8 dB |
| C4 | -7.7 dB | -5.6 dB | -2.9 dB | -7.4 dB | -3.0 dB | 14.2 dB | 14.2 dB | 14.2 dB | 14.2 dB | 14.2 dB |
| E4 | -3.1 dB | +5.0 dB | +0.0 dB | -1.4 dB | -1.1 dB | 15.8 dB | 15.8 dB | 15.8 dB | 15.8 dB | 15.8 dB |

