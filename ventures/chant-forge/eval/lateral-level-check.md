# The sung final /l/ against its vowel

Written by `node eval/lateral-level-check.mjs`. A held syllable (vowel + l, 0.6 s) per vowel and pitch, sung by
`sing.mjs` `singNote`. Level: power of the middle half of the /l/ (codaPlan's span) against power of the vowel at
0.15-0.30 s. Tilt: the /l/'s band under 500 Hz over its energy above 1 kHz (readCoda reads a coda murmur as a
nasal only at 28 dB or more). "Fixed gain" is `lateralLevel: false`, PHONES.l.av = 1.4, as on main before this round.

## As registered: one seed (3)

### Fixed gain (before)

| pitch | al level | el level | il level | ol level | ul level | al tilt | el tilt | il tilt | ol tilt | ul tilt |
|---|---|---|---|---|---|---|---|---|---|---|
| E2 | +0.2 dB | +4.8 dB | +6.4 dB | +0.8 dB | +6.5 dB | 21.6 dB | 21.6 dB | 21.6 dB | 21.6 dB | 21.6 dB |
| A2 | +1.7 dB | +4.3 dB | +6.0 dB | +1.8 dB | +5.3 dB | 26.7 dB | 26.7 dB | 26.7 dB | 26.7 dB | 26.7 dB |
| D3 | -1.3 dB | +5.1 dB | +6.0 dB | +1.1 dB | +4.3 dB | 19.0 dB | 19.0 dB | 19.0 dB | 19.0 dB | 19.0 dB |
| G3 | -2.8 dB | +3.6 dB | +6.4 dB | -2.7 dB | +5.6 dB | 20.3 dB | 20.3 dB | 20.3 dB | 20.3 dB | 20.3 dB |
| C4 | -1.3 dB | -1.1 dB | -1.9 dB | -1.8 dB | -1.9 dB | 19.9 dB | 19.9 dB | 19.9 dB | 19.9 dB | 19.9 dB |
| E4 | -2.3 dB | +8.1 dB | +5.8 dB | +0.3 dB | +5.5 dB | 19.2 dB | 19.2 dB | 19.2 dB | 19.2 dB | 19.2 dB |

Level range -2.8 dB to +8.1 dB, mean +2.4 dB; within 1 to 7 dB under the vowel: 9 of 30.

### Per-note gain, LATERAL_DB = 4 (after)

| pitch | al level | el level | il level | ol level | ul level | al tilt | el tilt | il tilt | ol tilt | ul tilt |
|---|---|---|---|---|---|---|---|---|---|---|
| E2 | -2.1 dB | -2.0 dB | -1.3 dB | -2.0 dB | -0.8 dB | 21.6 dB | 21.6 dB | 21.6 dB | 21.6 dB | 21.6 dB |
| A2 | -0.1 dB | -1.6 dB | -1.7 dB | -0.2 dB | -1.5 dB | 26.7 dB | 26.7 dB | 26.7 dB | 26.7 dB | 26.7 dB |
| D3 | -1.2 dB | -1.7 dB | -1.3 dB | +0.2 dB | -0.9 dB | 19.0 dB | 19.0 dB | 19.0 dB | 19.0 dB | 19.0 dB |
| G3 | -7.2 dB | -6.1 dB | -4.6 dB | -5.2 dB | -5.5 dB | 20.3 dB | 20.3 dB | 20.3 dB | 20.3 dB | 20.3 dB |
| C4 | +0.6 dB | -1.5 dB | -4.7 dB | -0.5 dB | -4.6 dB | 19.9 dB | 19.9 dB | 19.9 dB | 19.9 dB | 19.9 dB |
| E4 | -4.4 dB | -1.7 dB | +1.2 dB | -3.6 dB | +1.9 dB | 19.2 dB | 19.2 dB | 19.2 dB | 19.2 dB | 19.2 dB |

Level range -7.2 dB to +1.9 dB, mean -2.1 dB; within 1 to 7 dB under the vowel: 20 of 30.

Prediction (1), every /l/ 1 to 7 dB under its vowel: 20 of 30: fails.
Prediction (2), tilt unchanged to 0.5 dB: 30 of 30: holds.

## Not registered: twelve seeds (1-12), power summed

The /l/'s middle half is 25 ms; over it the five detuned voices beat, so one seed's level moves by about 5 dB
either way from note to note. Summed over twelve seeds that variation averages out and the gain's own error shows.

### Fixed gain (before)

| pitch | al level | el level | il level | ol level | ul level |
|---|---|---|---|---|---|
| E2 | -1.3 dB | +3.1 dB | +4.7 dB | -1.1 dB | +4.3 dB |
| A2 | -1.8 dB | +2.1 dB | +3.8 dB | -1.6 dB | +2.8 dB |
| D3 | -3.1 dB | +3.7 dB | +3.5 dB | -1.7 dB | +1.7 dB |
| G3 | +0.8 dB | +6.2 dB | +8.6 dB | -1.2 dB | +8.4 dB |
| C4 | -5.4 dB | -2.2 dB | -2.3 dB | -4.0 dB | -2.3 dB |
| E4 | -2.2 dB | +5.3 dB | +0.1 dB | -0.8 dB | -1.0 dB |

Level range -5.4 dB to +8.6 dB, mean +0.9 dB; within 1 to 7 dB under the vowel: 14 of 30.

### Per-note gain (after)

| pitch | al level | el level | il level | ol level | ul level |
|---|---|---|---|---|---|
| E2 | -3.5 dB | -3.7 dB | -3.0 dB | -3.8 dB | -3.1 dB |
| A2 | -3.6 dB | -3.8 dB | -3.9 dB | -3.6 dB | -4.0 dB |
| D3 | -3.0 dB | -3.1 dB | -3.8 dB | -2.7 dB | -3.5 dB |
| G3 | -3.6 dB | -3.4 dB | -2.4 dB | -3.7 dB | -2.6 dB |
| C4 | -3.6 dB | -2.6 dB | -5.0 dB | -2.7 dB | -5.0 dB |
| E4 | -4.3 dB | -4.5 dB | -4.6 dB | -4.6 dB | -4.6 dB |

Level range -5.0 dB to -2.4 dB, mean -3.7 dB; within 1 to 7 dB under the vowel: 30 of 30.
